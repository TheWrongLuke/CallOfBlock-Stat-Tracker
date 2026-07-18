import { describe, expect, it } from "vitest";
import { renderPlayerManagerContent } from "../../src/views/player-manager.js";

const players = [
    {
        id: "player-1",
        username: "alpha_user",
        display_name: "Alpha <Admin>",
        avatar_url: "https://example.com/alpha.png",
        minecraft_player_name: "AlphaMC",
        is_admin: false,
        is_owner: false,
        banned_from_voting: false,
        ban_reason: "",
        banned_at: "",
        created_at: "2026-07-01T12:00:00Z"
    },
    {
        id: "player-2",
        username: "blocked_user",
        display_name: "Blocked Player",
        avatar_url: "",
        minecraft_player_name: "BlockedMC",
        is_admin: false,
        is_owner: false,
        banned_from_voting: true,
        ban_reason: "Repeated disruption <script>",
        banned_at: "2026-07-17T12:00:00Z",
        banned_by_username: "owner",
        created_at: "2026-07-02T12:00:00Z"
    }
];

const catalog = [
    {
        type: "background",
        id: "founder",
        name: "Founder Night",
        image: "https://example.com/founder.webp",
        rarity: "epic",
        active: true,
        acquisitionType: "exclusive"
    },
    {
        type: "title",
        id: "earned",
        name: "Earned Title",
        text: "Earned",
        rarity: "rare",
        active: true,
        acquisitionType: "progression"
    }
];

const grants = [
    {
        profile_id: "player-1",
        cosmetic_type: "title",
        cosmetic_id: "earned",
        source: "progression",
        grant_note: null,
        acquired_at: "2026-07-10T12:00:00Z"
    },
    {
        profile_id: "player-2",
        cosmetic_type: "background",
        cosmetic_id: "founder",
        source: "friend",
        grant_note: "A gift from the owner",
        acquired_at: "2026-07-11T12:00:00Z"
    }
];

const baseProps = {
    ready: true,
    players,
    catalog,
    grants,
    revocations: [],
    selectedId: "player-1",
    currentUserId: "owner-id",
    filters: { search: "", collection: "all", sort: "ownership" },
    grantKey: "",
    revokeKey: "",
    banOpen: false,
    message: "",
    error: "",
    saving: false
};

describe("Player Manager view", () => {
    it("renders searchable players without exposing Discord IDs", () => {
        const html = renderPlayerManagerContent(baseProps);

        expect(html).toContain('data-player-manager-select="player-1"');
        expect(html).toContain('data-player-manager-select="player-2"');
        expect(html).toContain("@alpha_user");
        expect(html).toContain("AlphaMC");
        expect(html).not.toContain("discord_id");
        expect(html).not.toContain("<script>");
    });

    it("shows the complete collection and allows automatic ownership to be revoked", () => {
        const html = renderPlayerManagerContent(baseProps);

        expect(html).toContain("1 owned / 2 catalog items");
        expect(html).toContain("Backgrounds");
        expect(html).toContain("Profile icons");
        expect(html).toContain("Icon borders");
        expect(html).toContain("Titles");
        expect(html).toContain("Founder Night");
        expect(html).toContain("Earned Title");
        expect(html).toContain("Progression reward");
        expect(html).toContain('data-cosmetic-id="earned"');
        expect(html).toContain('data-player-grant-open="background:founder"');
        expect(html).toContain("data-player-collection-sort");
    });

    it("applies one ownership or alphabetical sort to every collection section", () => {
        const sortingCatalog = [
            ...catalog,
            {
                type: "title",
                id: "alpha",
                name: "Alpha Title",
                text: "Alpha",
                rarity: "common",
                active: true,
                acquisitionType: "exclusive"
            }
        ];
        const ownedFirst = renderPlayerManagerContent({ ...baseProps, catalog: sortingCatalog });
        const alphabetical = renderPlayerManagerContent({
            ...baseProps,
            catalog: sortingCatalog,
            filters: { ...baseProps.filters, sort: "alphabetical" }
        });

        expect(ownedFirst.indexOf("Earned Title")).toBeLessThan(ownedFirst.indexOf("Alpha Title"));
        expect(alphabetical.indexOf("Alpha Title")).toBeLessThan(alphabetical.indexOf("Earned Title"));
        expect(alphabetical).toContain('<option value="alphabetical" selected>');
    });

    it("shows revoked cosmetics as restorable", () => {
        const html = renderPlayerManagerContent({
            ...baseProps,
            revocations: [
                {
                    profile_id: "player-1",
                    cosmetic_type: "background",
                    cosmetic_id: "founder",
                    reason: "Revoked by administrator"
                }
            ],
            grantKey: "background:founder"
        });

        expect(html).toContain("Revoked by admin");
        expect(html).toContain("Revoked by administrator");
        expect(html).toContain(">Restore<");
        expect(html).toContain("Restore Cosmetic");
        expect(html).toContain("Restore cosmetic");
    });

    it("renders a gift dialog with a note and only one X close control", () => {
        const html = renderPlayerManagerContent({
            ...baseProps,
            grantKey: "background:founder"
        });

        expect(html).toContain("data-progression-grant-form");
        expect(html).toContain('name="note"');
        expect(html).toContain("Send gift");
        expect(html.match(/data-player-grant-close/g)).toHaveLength(1);
        expect(html).not.toMatch(/data-player-grant-backdrop[^>]*data-player-grant-close/);
    });

    it("requires a stored note before an owned cosmetic can be revoked", () => {
        const html = renderPlayerManagerContent({
            ...baseProps,
            revokeKey: "title:earned"
        });

        expect(html).toContain("data-player-revoke-form");
        expect(html).toContain('name="note"');
        expect(html).toContain('minlength="3"');
        expect(html).toContain('maxlength="300"');
        expect(html).toContain("Confirm revocation");
        expect(html.match(/data-player-revoke-close/g)).toHaveLength(1);
        expect(html).not.toMatch(/data-player-revoke-backdrop[^>]*data-player-revoke-close/);
    });

    it("shows ban history and renders a protected unban confirmation", () => {
        const html = renderPlayerManagerContent({
            ...baseProps,
            selectedId: "player-2",
            banOpen: true
        });

        expect(html).toContain("Community actions blocked");
        expect(html).toContain("Repeated disruption &lt;script&gt;");
        expect(html).toContain("Unban player");
        expect(html.match(/data-player-ban-close/g)).toHaveLength(1);
    });

    it("filters the directory and has an independent setup state", () => {
        const filtered = renderPlayerManagerContent({
            ...baseProps,
            filters: { search: "BlockedMC", collection: "all", sort: "ownership" }
        });
        const unavailable = renderPlayerManagerContent({ ...baseProps, ready: false, error: "Install schema" });

        expect(filtered).not.toContain('data-player-manager-select="player-1"');
        expect(filtered).toContain('data-player-manager-select="player-2"');
        expect(unavailable).toContain("Player Manager setup is required");
        expect(unavailable).toContain("data-player-manager-retry");
    });
});
