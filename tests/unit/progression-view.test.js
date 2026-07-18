import { describe, expect, it } from "vitest";
import { renderProgressionAdminContent } from "../../src/views/progression.js";

const catalog = [
    {
        type: "title",
        id: "owner",
        name: "Owner",
        text: "Owner",
        category: "Exclusive",
        rarity: "mythic",
        active: true,
        acquisitionType: "owner",
        sortOrder: 0,
        builtIn: true,
        remoteCatalog: true
    },
    {
        type: "background",
        id: "founder_night",
        name: "Founder Night",
        description: "Win-based reward",
        image: "https://example.com/founder.webp",
        category: "Milestones",
        rarity: "epic",
        active: true,
        acquisitionType: "progression",
        sortOrder: 1,
        builtIn: false,
        remoteCatalog: true
    }
];

const baseProps = {
    loading: false,
    ready: true,
    catalog,
    rules: [],
    grants: [],
    profiles: [],
    editorKey: "",
    creating: false,
    filters: { search: "", type: "all", showArchived: true },
    message: "",
    error: "",
    saving: false
};

describe("progression admin view", () => {
    it("renders protected setup state when the schema is unavailable", () => {
        const html = renderProgressionAdminContent({
            ...baseProps,
            ready: false,
            catalog: [],
            error: "Run the setup script."
        });

        expect(html).toContain("Progression database setup is required");
        expect(html).toContain("data-progression-retry");
    });

    it("renders every cosmetic as an editable catalog card", () => {
        const html = renderProgressionAdminContent(baseProps);

        expect(html).toContain('data-progression-cosmetic-open="title:owner"');
        expect(html).toContain('data-progression-cosmetic-open="background:founder_night"');
        expect(html).toContain("New cosmetic");
        expect(html).toContain("All cosmetics");
    });

    it("opens the full editor and only marks the X button as a close control", () => {
        const html = renderProgressionAdminContent({
            ...baseProps,
            editorKey: "background:founder_night",
            rules: [
                {
                    id: "rule-1",
                    cosmetic_type: "background",
                    cosmetic_id: "founder_night",
                    mode: "battle_royale",
                    metric: "wins",
                    target: 5,
                    active: true,
                    sort_order: 1
                }
            ]
        });

        expect(html).toContain("data-progression-editor-backdrop");
        expect(html).toContain("data-progression-cosmetic-form");
        expect(html).toContain("Save and reconcile ownership");
        expect(html).toContain('name="metric"');
        expect(html).toContain('value="wins" selected');
        expect(html.match(/data-progression-cosmetic-close/g)).toHaveLength(1);
        expect(html).not.toMatch(/data-progression-editor-backdrop[^>]*data-progression-cosmetic-close/);
    });

    it("escapes player labels and only allows direct grants to be revoked", () => {
        const html = renderProgressionAdminContent({
            ...baseProps,
            profiles: [
                {
                    id: "123e4567-e89b-42d3-a456-426614174000",
                    username: "owner<script>",
                    display_name: "Owner <img>",
                    minecraft_player_name: "RTXLuke",
                    is_owner: true
                }
            ],
            grants: [
                {
                    profile_id: "123e4567-e89b-42d3-a456-426614174000",
                    cosmetic_type: "title",
                    cosmetic_id: "owner",
                    source: "owner",
                    acquired_at: "2026-07-17T12:00:00Z"
                },
                {
                    profile_id: "123e4567-e89b-42d3-a456-426614174000",
                    cosmetic_type: "background",
                    cosmetic_id: "founder_night",
                    source: "admin",
                    acquired_at: "2026-07-17T12:00:00Z"
                }
            ]
        });

        expect(html).toContain("data-progression-grant-form");
        expect(html).not.toContain("<script>");
        expect(html).not.toContain("Owner <img>");
        expect(html).toContain("@owner&lt;script&gt;");
        expect(html.match(/data-progression-grant-revoke/g)).toHaveLength(1);
    });

    it("filters archived and unrelated cosmetic types", () => {
        const html = renderProgressionAdminContent({
            ...baseProps,
            catalog: [catalog[0], { ...catalog[1], active: false }],
            filters: { search: "", type: "background", showArchived: false }
        });

        expect(html).toContain("No cosmetics match these filters");
        expect(html).not.toContain('data-progression-cosmetic-open="title:owner"');
    });

    it("switches the protected workspace to the weekly mission manager", () => {
        const html = renderProgressionAdminContent({
            ...baseProps,
            ready: false,
            section: "weekly",
            weekly: {
                ready: true,
                templates: [],
                filters: { search: "", difficulty: "all", showArchived: true },
                message: "",
                error: "",
                saving: false
            }
        });

        expect(html).toContain('data-progression-section="cosmetics"');
        expect(html).toContain('data-progression-section="weekly"');
        expect(html).toContain("Weekly rotation");
        expect(html).toContain("data-weekly-template-new");
        expect(html).not.toContain("data-progression-grant-form");
    });
});
