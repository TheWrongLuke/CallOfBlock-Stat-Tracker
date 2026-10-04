import { describe, it, expect } from "vitest";
import { cosmeticArtworkUrl } from "../../src/core/cosmetic-artwork.js";

describe("approved bundled cosmetic artwork", () => {
    it("versions local and same-origin catalog paths without losing parameters", () => {
        expect(cosmeticArtworkUrl("./assets/pfp-borders/green.png")).toBe("/assets/pfp-borders/green.png?v=20261004");
        expect(cosmeticArtworkUrl("https://callofblock.com/assets/profile-backgrounds/deathmatch.png?x=1#preview"))
            .toBe("/assets/profile-backgrounds/deathmatch.png?x=1&v=20261004#preview");
        expect(cosmeticArtworkUrl("/assets/pfp-borders/private-playtester.png?v=old"))
            .toBe("/assets/pfp-borders/private-playtester.png?v=20261004");
    });
    it("does not rewrite independent, custom, badge or third-party artwork", () => {
        for (const path of ["https://other.example/assets/pfp-borders/green.png", "/assets/badges/owner.png", "data:image/png;base64,AAAA", "", "/custom.png"]) {
            expect(cosmeticArtworkUrl(path)).toBe(path);
        }
    });
});
