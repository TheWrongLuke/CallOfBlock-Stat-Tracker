import { describe, expect, it, vi } from "vitest";
import { claimCanonicalProgressionCosmetics } from "../../src/services/progression-claims.js";

describe("canonical progression claims", () => {
    it("uses the canonical inventory claim function", async () => {
        const rpc = vi.fn().mockResolvedValue({ data: [{ cosmetic_id: "veteran" }], error: null });

        const result = await claimCanonicalProgressionCosmetics({ rpc });

        expect(rpc).toHaveBeenCalledTimes(1);
        expect(rpc).toHaveBeenCalledWith("claim_progression_cosmetics_v2");
        expect(result.data).toHaveLength(1);
    });

    it("falls back while the canonical migration has not been installed", async () => {
        const rpc = vi
            .fn()
            .mockResolvedValueOnce({
                data: null,
                error: { code: "PGRST202", message: "Could not find claim_progression_cosmetics_v2" }
            })
            .mockResolvedValueOnce({ data: [], error: null });

        await claimCanonicalProgressionCosmetics({ rpc });

        expect(rpc).toHaveBeenNthCalledWith(1, "claim_progression_cosmetics_v2");
        expect(rpc).toHaveBeenNthCalledWith(2, "claim_progression_cosmetics");
    });

    it("does not hide canonical claim failures", async () => {
        const failure = { code: "42501", message: "Permission denied" };
        const rpc = vi.fn().mockResolvedValue({ data: null, error: failure });

        const result = await claimCanonicalProgressionCosmetics({ rpc });

        expect(rpc).toHaveBeenCalledTimes(1);
        expect(result.error).toBe(failure);
    });
});
