import { describe, expect, it } from "vitest";
import { cosmeticCanAppearInShop } from "../../src/config/progression.js";

describe("cosmetic shop eligibility", () => {
    const storeItem = {
        type: "background",
        id: "founder_night",
        active: true,
        acquisitionType: "store",
        shopEnabled: true,
        unitAmount: 499
    };

    it("allows configured store-only cosmetics", () => {
        expect(cosmeticCanAppearInShop(storeItem)).toBe(true);
    });

    it("never exposes the Owner title", () => {
        expect(cosmeticCanAppearInShop({ ...storeItem, type: "title", id: "owner" })).toBe(false);
    });

    it("keeps non-store cosmetics outside the shop", () => {
        expect(cosmeticCanAppearInShop({ ...storeItem, acquisitionType: "progression" })).toBe(false);
        expect(cosmeticCanAppearInShop({ ...storeItem, acquisitionType: "owner" })).toBe(false);
        expect(cosmeticCanAppearInShop({ ...storeItem, shopEnabled: false })).toBe(false);
    });
});
