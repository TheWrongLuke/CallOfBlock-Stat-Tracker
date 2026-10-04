import { expect, it } from "vitest";
import { cosmeticBorderUrl } from "../../src/core/cosmetic-artwork.js";
it("no-border catalog preview art is never painted over an account or champion avatar", () => {
    expect(cosmeticBorderUrl("none", { image_url: "./assets/pfp-borders/none.png" })).toBe("");
    expect(cosmeticBorderUrl("red", null)).toBe("");
});
it("border CSS URLs are absolute and bundled artwork has the shared revision across pages", () => {
    expect(cosmeticBorderUrl("red", { image_url: "./assets/pfp-borders/red.png" }, "https://callofblock.com/")).toBe(
        "https://callofblock.com/assets/pfp-borders/red.png?v=20261004"
    );
    expect(
        cosmeticBorderUrl(
            "custom-frame",
            { image_url: "/assets/custom-frame.png" },
            "https://callofblock.com/playtests/"
        )
    ).toBe("https://callofblock.com/assets/custom-frame.png");
});
it("invalid or script border URLs are not used in inline CSS", () => {
    expect(cosmeticBorderUrl("unsafe", { image_url: "javascript:alert(1)" })).toBe("");
    expect(cosmeticBorderUrl("unsafe", { image_url: "https://[" })).toBe("");
});
