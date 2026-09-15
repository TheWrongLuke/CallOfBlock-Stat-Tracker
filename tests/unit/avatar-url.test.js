import { describe, expect, it } from "vitest";
import {
    discordAvatarCandidates,
    discordDefaultAvatarUrl,
    normalizeDiscordAvatarUrl,
    uniqueImageUrls
} from "../../src/utils/avatar-url.js";

describe("Discord avatar URLs", () => {
    it("preserves animated avatars and upgrades animated hashes to GIF", () => {
        const gif = "https://cdn.discordapp.com/avatars/123456789012345678/a_deadbeef.gif?size=128";
        const incorrectlyStatic = "https://cdn.discordapp.com/avatars/123456789012345678/a_deadbeef.png";

        expect(normalizeDiscordAvatarUrl(gif)).toBe(gif);
        expect(normalizeDiscordAvatarUrl(incorrectlyStatic)).toBe(
            "https://cdn.discordapp.com/avatars/123456789012345678/a_deadbeef.gif"
        );
    });

    it("rejects non-Discord image hosts", () => {
        expect(normalizeDiscordAvatarUrl("https://example.com/avatars/123/a_deadbeef.gif")).toBe("");
    });

    it("provides a valid deterministic Discord fallback", () => {
        const fallback = discordDefaultAvatarUrl("486587580612345868");
        expect(fallback).toMatch(/^https:\/\/cdn\.discordapp\.com\/embed\/avatars\/[0-5]\.png$/);
        expect(
            discordAvatarCandidates(
                "https://cdn.discordapp.com/avatars/486587580612345868/old.png",
                "486587580612345868"
            )
        ).toEqual(["https://cdn.discordapp.com/avatars/486587580612345868/old.png", fallback]);
    });

    it("deduplicates fallback candidates without changing their order", () => {
        expect(uniqueImageUrls(["/one.png", "/one.png", "", "/two.gif"])).toEqual(["/one.png", "/two.gif"]);
    });
});
