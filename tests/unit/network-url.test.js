import { describe, it, expect } from "vitest";
import { networkApiUrl } from "../../src/api/network-url.js";
describe("network API endpoint", () => {
    it("preserves Supabase function prefixes and query strings", () => {
        for (const base of [
            "https://project.supabase.co/functions/v1/network-stats",
            "https://project.supabase.co/functions/v1/network-stats/"
        ])
            expect(networkApiUrl("/admin/matches?limit=100", base).href).toBe(
                "https://project.supabase.co/functions/v1/network-stats/admin/matches?limit=100"
            );
        expect(networkApiUrl("/network/stats", "http://127.0.0.1:8787").href).toBe(
            "http://127.0.0.1:8787/network/stats"
        );
    });
    it("rejects credentials, insecure hosts and path escapes", () => {
        for (const base of [
            "https://user:secret@example.com",
            "http://example.com",
            "https://example.com?secret=x",
            "https://example.com#key"
        ])
            expect(() => networkApiUrl("/network/stats", base)).toThrow();
        for (const path of [
            "//evil.example/network/stats",
            "/internal/stats/ingest",
            "/network/../secret",
            "/network/\\evil"
        ])
            expect(() => networkApiUrl(path, "https://example.com")).toThrow();
    });
});
