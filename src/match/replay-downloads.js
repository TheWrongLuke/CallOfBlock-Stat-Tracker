const DEFAULT_MAX_REPLAY_BYTES = 512 * 1024 * 1024;

export function createReplayApi({
    supabaseClient = null,
    supabaseUrl = "",
    supabaseKey = "",
    maxReplayBytes = DEFAULT_MAX_REPLAY_BYTES
} = {}) {
    return {
        async list(matchId) {
            if (!supabaseClient?.rpc) return { available: false, replays: [] };
            const { data, error } = await supabaseClient.rpc("cob_list_match_replays", {
                p_match_id: matchId
            });
            if (error) {
                if (isMissingReplayInfrastructure(error)) return { available: false, replays: [] };
                throw new Error(cleanError(error));
            }
            return { available: true, replays: Array.isArray(data) ? data : [] };
        },

        async requestDownload(replayId) {
            return invokeReplayFunction({
                supabaseClient,
                supabaseUrl,
                supabaseKey,
                body: { action: "download", replayId }
            });
        },

        async upload(matchId, file, metadata) {
            await validateReplayFile(file, maxReplayBytes);
            const pending = await invokeReplayFunction({
                supabaseClient,
                supabaseUrl,
                supabaseKey,
                body: {
                    action: "begin_upload",
                    matchId,
                    fileName: file.name,
                    fileSize: file.size,
                    metadata
                }
            });
            try {
                await uploadToSignedPath(supabaseClient, pending, file);
                return await invokeReplayFunction({
                    supabaseClient,
                    supabaseUrl,
                    supabaseKey,
                    body: { action: "finalize_upload", replayId: pending.replayId }
                });
            } catch (error) {
                await abortPendingUpload(supabaseClient, supabaseUrl, supabaseKey, pending.replayId);
                throw error;
            }
        },

        async replace(replayId, file) {
            await validateReplayFile(file, maxReplayBytes);
            const pending = await invokeReplayFunction({
                supabaseClient,
                supabaseUrl,
                supabaseKey,
                body: {
                    action: "begin_replace",
                    replayId,
                    fileName: file.name,
                    fileSize: file.size
                }
            });
            try {
                await uploadToSignedPath(supabaseClient, pending, file);
                return await invokeReplayFunction({
                    supabaseClient,
                    supabaseUrl,
                    supabaseKey,
                    body: { action: "finalize_replace", replayId }
                });
            } catch (error) {
                await abortPendingUpload(supabaseClient, supabaseUrl, supabaseKey, replayId);
                throw error;
            }
        },

        async update(replayId, metadata) {
            return invokeReplayFunction({
                supabaseClient,
                supabaseUrl,
                supabaseKey,
                body: { action: "update", replayId, metadata }
            });
        },

        async remove(replayId) {
            return invokeReplayFunction({
                supabaseClient,
                supabaseUrl,
                supabaseKey,
                body: { action: "delete", replayId }
            });
        }
    };
}

async function uploadToSignedPath(supabaseClient, pending, file) {
    const path = String(pending?.path || "");
    const token = String(pending?.token || "");
    const bucket = String(pending?.bucket || "match-replays");
    if (!path || !token || !supabaseClient?.storage?.from) {
        throw new Error("The replay service did not return a valid private upload target.");
    }
    const { error } = await supabaseClient.storage.from(bucket).uploadToSignedUrl(path, token, file, {
        contentType: "application/octet-stream"
    });
    if (error) throw new Error(cleanError(error));
}

async function abortPendingUpload(supabaseClient, supabaseUrl, supabaseKey, replayId) {
    if (!replayId) return;
    try {
        await invokeReplayFunction({
            supabaseClient,
            supabaseUrl,
            supabaseKey,
            body: { action: "abort_upload", replayId }
        });
    } catch {
        // Finalization performs stale-upload cleanup server-side as well.
    }
}

export async function validateReplayFile(file, maximumBytes = DEFAULT_MAX_REPLAY_BYTES) {
    if (!(file instanceof Blob)) throw new Error("Choose a Replay Mod file first.");
    const name = String(file.name || "");
    if (!name.toLowerCase().endsWith(".mcpr")) throw new Error("Replay files must use the .mcpr extension.");
    if (file.size <= 0) throw new Error("The replay file is empty.");
    if (file.size > maximumBytes) throw new Error(`The replay exceeds the ${formatBytes(maximumBytes)} upload limit.`);
    const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    const zipSignature =
        signature.length === 4 &&
        signature[0] === 0x50 &&
        signature[1] === 0x4b &&
        ((signature[2] === 0x03 && signature[3] === 0x04) ||
            (signature[2] === 0x05 && signature[3] === 0x06) ||
            (signature[2] === 0x07 && signature[3] === 0x08));
    if (!zipSignature) throw new Error("The selected .mcpr file is not a valid ZIP container.");
    return true;
}

async function invokeReplayFunction({ supabaseClient, supabaseUrl, supabaseKey, body }) {
    if (!supabaseClient || !supabaseUrl || !supabaseKey) {
        throw new Error("Replay downloads are not configured.");
    }
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const token = sessionData?.session?.access_token || "";
    const response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/functions/v1/match-replays`, {
        method: "POST",
        headers: {
            apikey: supabaseKey,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(body instanceof FormData ? {} : { "Content-Type": "application/json" })
        },
        body: body instanceof FormData ? body : JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        if (response.status === 404) throw new Error("Replay infrastructure has not been deployed yet.");
        if (response.status === 401 || response.status === 403) {
            throw new Error(
                payload.error ||
                    "Log in with Discord and link the Minecraft account used in this match to access this replay."
            );
        }
        throw new Error(payload.error || `Replay service returned HTTP ${response.status}.`);
    }
    return payload;
}

function isMissingReplayInfrastructure(error) {
    return /cob_list_match_replays|function .* does not exist|schema cache|404/i.test(String(error?.message || error));
}

function cleanError(error) {
    const message = String(error?.message || error || "");
    return message.length <= 200 ? message : "Replay metadata could not be loaded.";
}

function formatBytes(bytes) {
    if (!(bytes > 0)) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return `${Math.round((bytes / 1024 ** index) * 10) / 10} ${units[index]}`;
}
