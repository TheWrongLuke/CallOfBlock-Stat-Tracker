import { networkApiUrl } from "./network-url.js";
import { networkTrackerUrl } from "./network-tracker.js";
import { createRequestSignal } from "../utils/request-timeout.js";

// Same saved presentation for owners, other players and guests; no authenticated writes.
export async function fetchNetworkProfiles(
    { userIds = [], playerIds = [], includeOwner = false, limit = 200 } = {},
    { fetchImpl = globalThis.fetch } = {}
) {
    const request = createRequestSignal(null, 10_000);
    try {
        const base = networkTrackerUrl();
        const profiles = new Map();
        const users = [...new Set(userIds || [])],
            players = [...new Set(playerIds || [])];
        // Both filter sets plus an optional owner must fit in the server's 200-row cap.
        const count = Math.max(1, Math.ceil(users.length / 99), Math.ceil(players.length / 99));
        for (let batch = 0; batch < count; batch++) {
            const url = networkApiUrl("/network/accounts", globalThis.window.COB_NETWORK_STATS_API_URL);
            if (!base) throw new Error("Network profiles are not configured.");
            const ids = users.slice(batch * 99, (batch + 1) * 99),
                playerBatch = players.slice(batch * 99, (batch + 1) * 99);
            if (ids.length) url.searchParams.set("userIds", ids.join(","));
            if (playerBatch.length) url.searchParams.set("playerIds", playerBatch.join(","));
            url.searchParams.set("includeOwner", String(includeOwner));
            url.searchParams.set(
                "limit",
                String(
                    Math.max(
                        1,
                        Math.min(200, Math.max(limit || 200, ids.length + playerBatch.length + Number(includeOwner)))
                    )
                )
            );
            const response = await fetchImpl(url, {
                cache: "no-store",
                signal: request.signal,
                headers: { Accept: "application/json" }
            });
            const body = await response.json();
            if (!response.ok || body?.environment !== "TEST" || !Array.isArray(body.profiles))
                throw new Error("Public network profiles are unavailable.");
            for (const row of body.profiles) {
                if (!row?.id) throw new Error("Invalid public network profile.");
                profiles.set(row.id, row);
            }
        }
        return { data: [...profiles.values()], error: null, cosmeticsExtended: true };
    } catch (error) {
        return { data: [], error };
    } finally {
        request.cleanup();
    }
}
