import { describe, it, expect } from "vitest";
import { publicNetworkRuntime } from "../../scripts/network-runtime-config.mjs";
describe("public TEST build configuration", () => {
    it("keeps existing builds unchanged until deliberately selected and exposes only public TEST URL", () => {
        expect(publicNetworkRuntime({})).toBe("");
        const result = publicNetworkRuntime({
            COB_STATS_ENVIRONMENT: "TEST",
            COB_NETWORK_STATS_API_URL: "https://tracker.example.com/",
            COB_STATS_STORAGE_SERVICE_KEY: "never-bundle-me"
        });
        expect(result).toContain('COB_STATS_ENVIRONMENT = "TEST"');
        expect(result).toContain('"https://tracker.example.com"');
        expect(result).not.toContain("never-bundle-me");
        expect(
            publicNetworkRuntime({
                COB_STATS_ENVIRONMENT: "TEST",
                COB_NETWORK_STATS_API_URL: "https://project.supabase.co/functions/v1/network-stats/"
            })
        ).toContain('"https://project.supabase.co/functions/v1/network-stats"');
        expect(
            publicNetworkRuntime({ COB_STATS_ENVIRONMENT: "TEST", COB_NETWORK_STATS_API_URL: "http://127.0.0.1:8787" })
        ).toContain("8787");
    });
    it("rejects production, partial config, insecure remote addresses and URL credentials", () => {
        for (const env of [
            { COB_STATS_ENVIRONMENT: "TEST" },
            { COB_NETWORK_STATS_API_URL: "https://test.example.com" },
            { COB_STATS_ENVIRONMENT: "PRODUCTION", COB_NETWORK_STATS_API_URL: "https://test.example.com" },
            ...[
                "http://remote.example.com",
                "https://user:secret@test.example.com",
                "https://test.example.com/?key=secret"
            ].map((url) => ({ COB_STATS_ENVIRONMENT: "TEST", COB_NETWORK_STATS_API_URL: url }))
        ]) {
            expect(() => publicNetworkRuntime(env)).toThrow();
        }
    });
});
