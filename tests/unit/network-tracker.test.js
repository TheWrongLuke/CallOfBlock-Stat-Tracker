import { afterEach, describe, expect, it, vi } from "vitest";
import { networkTrackerConfigured, networkTrackerUrl, fetchNetworkTracker } from "../../src/api/network-tracker.js";
import { createMatchDetailApi } from "../../src/match/match-detail-api.js";
afterEach(() => vi.unstubAllGlobals());
describe("isolated TEST tracker", () => {
    function configure() {
        vi.stubGlobal("window", {
            COB_STATS_ENVIRONMENT: "TEST",
            COB_NETWORK_STATS_API_URL: "https://tracker.callofblock.com"
        });
    }
    it("TEST without a configured API fails closed rather than selecting production", async () => {
        vi.stubGlobal("window", { COB_STATS_ENVIRONMENT: "TEST" });
        expect(networkTrackerConfigured()).toBe(true);
        const fetchImpl = vi.fn();
        await expect(fetchNetworkTracker("home", { fetchImpl })).rejects.toThrow("not configured");
        expect(fetchImpl).not.toHaveBeenCalled();
    });
    it("uses environment-scoped URLs including history profile suffix", () => {
        configure();
        expect(networkTrackerUrl("profile:p_123456789abc:history")).toBe(
            "https://tracker.callofblock.com/network/profiles/p_123456789abc%3Ahistory"
        );
        globalThis.window.COB_STATS_ENVIRONMENT = "PRODUCTION";
        expect(() => networkTrackerUrl()).toThrow("TEST");
    });
    it("reads lightweight network presence without accepting production status", async () => {
        configure();
        expect(networkTrackerUrl("status")).toBe("https://tracker.callofblock.com/network/status");
        const payload = {
            environment: "TEST",
            liveStatus: { state: "online", onlinePlayers: 0 }
        };
        const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
        expect(await fetchNetworkTracker("status", { fetchImpl })).toEqual(payload);
        await expect(fetchNetworkTracker("home", { fetchImpl })).rejects.toThrow("Invalid TEST");
    });
    it("does not accept production data or silently fallback after failed network reads", async () => {
        configure();
        const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 });
        await expect(fetchNetworkTracker("home", { fetchImpl })).rejects.toThrow("503");
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        fetchImpl.mockResolvedValue({
            ok: true,
            json: async () => ({
                environment: "PRODUCTION",
                modes: {},
                profiles: []
            })
        });
        await expect(fetchNetworkTracker("home", { fetchImpl })).rejects.toThrow("Invalid TEST");
    });
    it("TEST replay failure never reads legacy Supabase, cached data or fixtures", async () => {
        configure();
        const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 });
        const supabaseClient = { from: vi.fn() };
        const api = createMatchDetailApi({
            fetchImpl,
            supabaseClient,
            apiUrl: "https://legacy.invalid/stats"
        });
        await expect(api.load("50000000-0000-4000-8000-000000000002")).rejects.toThrow("not available");
        expect(supabaseClient.from).not.toHaveBeenCalled();
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(fetchImpl.mock.calls[0][0]).toContain("tracker.callofblock.com/network/matches/");
    });
});
