import { normalizeMatchTelemetry } from "./match-telemetry-normalizer.js";

export function createMatchDetailApi({ supabaseClient = null, apiUrl = "", fetchImpl = globalThis.fetch } = {}) {
    const cache = new Map();

    return {
        async load(matchId, { force = false } = {}) {
            const id = cleanMatchId(matchId);
            if (!id) throw new Error("A valid match ID is required.");
            if (!force && cache.has(id)) return cache.get(id);

            const attempts = [];
            const supabaseResult = await loadFromSupabase(supabaseClient, id, attempts);
            const apiResult = supabaseResult || (await loadFromApi(fetchImpl, apiUrl, id, attempts));
            const fixtureResult = apiResult || (await loadFixture(fetchImpl, id, attempts));
            if (!fixtureResult) {
                const reason = attempts.find((attempt) => attempt.error)?.error;
                throw new Error(reason || "Detailed telemetry is not available for this match.");
            }
            const normalized = normalizeMatchTelemetry(fixtureResult, id);
            cache.set(id, normalized);
            return normalized;
        },

        clear(matchId = "") {
            if (matchId) cache.delete(matchId);
            else cache.clear();
        }
    };
}

async function loadFromSupabase(client, matchId, attempts) {
    if (!client?.from) return null;
    try {
        const { data, error } = await client
            .from("cob_public_match_telemetry")
            .select("payload")
            .eq("match_id", matchId)
            .maybeSingle();
        if (error) {
            attempts.push({ source: "supabase", error: friendlyRemoteError(error) });
            return null;
        }
        return data?.payload || null;
    } catch (error) {
        attempts.push({ source: "supabase", error: friendlyRemoteError(error) });
        return null;
    }
}

async function loadFromApi(fetchImpl, apiUrl, matchId, attempts) {
    if (!apiUrl || typeof fetchImpl !== "function") return null;
    try {
        const url = matchApiUrl(apiUrl, matchId);
        const response = await fetchImpl(url, { cache: "no-store" });
        if (response.status === 404) return null;
        if (!response.ok) {
            attempts.push({ source: "api", error: `Telemetry API returned HTTP ${response.status}.` });
            return null;
        }
        return await response.json();
    } catch (error) {
        attempts.push({ source: "api", error: friendlyRemoteError(error) });
        return null;
    }
}

async function loadFixture(fetchImpl, matchId, attempts) {
    if (typeof fetchImpl !== "function" || !/^[A-Za-z0-9._-]{1,160}$/.test(matchId)) return null;
    try {
        const response = await fetchImpl(`./data/match-telemetry/${encodeURIComponent(matchId)}.json`, {
            cache: "no-store"
        });
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        attempts.push({ source: "fixture", error: friendlyRemoteError(error) });
        return null;
    }
}

function matchApiUrl(apiUrl, matchId) {
    const url = new URL(apiUrl, globalThis.location?.href || "http://localhost/");
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/\/(?:stats(?:\.json)?)\/?$/i, "").replace(/\/+$/, "");
    url.pathname += `/matches/${encodeURIComponent(matchId)}`;
    return url.toString();
}

function cleanMatchId(value) {
    const id = String(value || "").trim();
    return /^[A-Za-z0-9._-]{1,160}$/.test(id) ? id : "";
}

function friendlyRemoteError(error) {
    const message = String(error?.message || error || "");
    if (/cob_public_match_telemetry|relation .* does not exist|schema cache/i.test(message)) {
        return "The private match-telemetry database view has not been deployed yet.";
    }
    return message && message.length <= 180 ? message : "The telemetry source could not be reached.";
}
