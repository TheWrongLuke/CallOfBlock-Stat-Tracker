import { afterEach, expect, it, vi } from "vitest";
import { fetchNetworkProfiles } from "../../src/api/network-profiles.js";
afterEach(() => vi.unstubAllGlobals());
const configure = () =>
    vi.stubGlobal("window", {
        COB_STATS_ENVIRONMENT: "TEST",
        COB_NETWORK_STATS_API_URL: "https://api.example/functions/v1/network-stats"
    });
it("guest profiles use UUID-derived tracker IDs and the shared cloud URL without requiring login", async () => {
    configure();
    const row = {
        id: "account",
        minecraft_player_id: "p_123456abcdef",
        pfp_border: "green",
        selected_badges: ["owner"]
    };
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ environment: "TEST", profiles: [row] }) }));
    const result = await fetchNetworkProfiles(
        { playerIds: [row.minecraft_player_id], includeOwner: true },
        { fetchImpl }
    );
    expect(result.data).toEqual([row]);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url.pathname).toBe("/functions/v1/network-stats/network/accounts");
    expect(url.searchParams.get("playerIds")).toBe(row.minecraft_player_id);
    expect(options.cache).toBe("no-store");
    expect(options.headers.Authorization).toBeUndefined();
});
it("large profile sets are bounded, merged and deduplicated without truncating requested accounts", async () => {
    configure();
    const ids = Array.from({ length: 205 }, (_, n) => `p_${n.toString(16).padStart(12, "0")}`);
    const fetchImpl = vi.fn(async (url) => ({
        ok: true,
        json: async () => ({
            environment: "TEST",
            profiles: [
                ...url.searchParams
                    .get("playerIds")
                    .split(",")
                    .map((id) => ({ id, minecraft_player_id: id })),
                { id: "owner" }
            ]
        })
    }));
    const result = await fetchNetworkProfiles({ playerIds: ids, includeOwner: true, limit: 50 }, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(result.data).toHaveLength(206);
    for (const [url] of fetchImpl.mock.calls)
        expect(Number(url.searchParams.get("limit"))).toBeGreaterThanOrEqual(
            url.searchParams.get("playerIds").split(",").length + 1
        );
});
it("wrong environments and failed reads never fall back to stale production customization", async () => {
    configure();
    for (const body of [
        { environment: "PRODUCTION", profiles: [] },
        { environment: "TEST", profiles: [{}] },
        { environment: "TEST", profiles: null }
    ]) {
        const result = await fetchNetworkProfiles(
            {},
            { fetchImpl: async () => ({ ok: true, json: async () => body }) }
        );
        expect(result.error).toBeTruthy();
        expect(result.data).toEqual([]);
    }
    vi.stubGlobal("window", { COB_STATS_ENVIRONMENT: "TEST" });
    const fetchImpl = vi.fn();
    expect((await fetchNetworkProfiles({}, { fetchImpl })).error).toBeTruthy();
    expect(fetchImpl).not.toHaveBeenCalled();
});
