import { networkApiUrl } from "./network-url.js";
const MAX_BYTES = 64 * 1024 * 1024;
export async function replayFileIdentity(matchId, recorder, sha) {
    if (
        !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(matchId) ||
        (recorder && !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(recorder)) ||
        !/^[a-f0-9]{64}$/.test(sha)
    )
        throw new Error("Replay UUID/checksum required.");
    const bytes = new Uint8Array(
        await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(`cob:replay-file:${matchId}:${recorder || "admin"}:${sha}`)
        )
    ).slice(0, 16);
    bytes[6] = (bytes[6] & 15) | 80;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function createNetworkReplayApi({
    client,
    validateFile,
    uploadToSignedPath,
    adminMatchId = null,
    baseUrl = globalThis.window?.COB_NETWORK_STATS_API_URL,
    fetcher = fetch
} = {}) {
    const id = (value) => {
        if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value))
            throw new Error("Full replay/match UUID required.");
        return value;
    };
    async function request(path, body = null, required = false) {
        if (globalThis.window?.COB_STATS_ENVIRONMENT !== "TEST" || !baseUrl)
            throw new Error("TEST replay storage is not configured.");
        const base = new URL(baseUrl);
        if (
            base.protocol !== "https:" &&
            !(base.protocol === "http:" && ["127.0.0.1", "localhost"].includes(base.hostname))
        )
            throw new Error("Secure replay API URL required.");
        const { data, error } = client?.auth ? await client.auth.getSession() : { data: null };
        const token = data?.session?.access_token;
        if (error || (required && !token)) throw new Error("Sign in to your administrator account.");
        const response = await fetcher(networkApiUrl(path, base.href), {
            method: body ? "POST" : "GET",
            cache: "no-store",
            signal: AbortSignal.timeout(90000),
            headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            ...(body ? { body: JSON.stringify(body) } : {})
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "TEST replay storage unavailable.");
        return result;
    }
    const adminPath = (match) => `/admin/matches/${id(match)}/recordings`;
    return {
        list: (match) =>
            request(adminMatchId ? adminPath(match) : `/network/replays/${id(match)}`, null, !!adminMatchId),
        requestDownload: (artifact) =>
            adminMatchId
                ? request(adminPath(adminMatchId), { action: "download", artifactId: id(artifact) }, true)
                : request(`/network/recordings/${id(artifact)}/download`, {}),
        async upload(match, file, metadata = {}) {
            await validateFile(file, MAX_BYTES);
            const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
            const sha = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
            const prepared = {
                ...metadata,
                recorderPlayerUuid: metadata.recorderPlayerUuid || null,
                fileName: file.name.replace(/\.mcpr$/i, ".mcpr"),
                fileSize: file.size,
                expectedSha256: sha
            };
            const artifactId = await replayFileIdentity(id(match), prepared.recorderPlayerUuid, sha);
            const pending = await request(adminPath(match), { action: "begin", artifactId, metadata: prepared }, true);
            if (pending.alreadyCompleted) return { artifactId, result: "ALREADY_COMMITTED" };
            try {
                await uploadToSignedPath(client, pending, file);
            } catch (error) {
                // The upload may have committed while its response was lost. Immutable path +
                // content hash allow safe validation of those bytes, without another recording.
                try {
                    return await request(adminPath(match), { action: "finalize", artifactId }, true);
                } catch {
                    throw error;
                }
            }
            return request(adminPath(match), { action: "finalize", artifactId }, true);
        },
        update: async () => {
            throw new Error("TEST recordings are immutable. Upload a new recording instead.");
        },
        replace: async () => {
            throw new Error("TEST recordings are immutable. Upload a new recording instead.");
        },
        remove: async () => {
            throw new Error("VOID the match to hide its recordings without deleting the audit.");
        }
    };
}
