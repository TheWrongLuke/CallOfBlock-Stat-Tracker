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
        expect(html).toMatch(/data-progression-asset-fields\s*>/);
        expect(html).toMatch(/data-progression-title-fields hidden/);
        expect(html).toMatch(/data-progression-border-fields hidden/);
        expect(html).toMatch(/data-progression-mission-fields\s*>/);
        expect(html).toMatch(/data-progression-store-fields hidden/);
        expect(html.match(/data-progression-cosmetic-close/g)).toHaveLength(1);
        expect(html).not.toMatch(/data-progression-editor-backdrop[^>]*data-progression-cosmetic-close/);
    });

    it("only renders the fields used by a title cosmetic", () => {
        const html = renderProgressionAdminContent({
            ...baseProps,
            editorKey: "title:owner"
        });

        expect(html).toMatch(/data-progression-asset-fields hidden/);
        expect(html).toMatch(/data-progression-title-fields\s*>/);
        expect(html).toMatch(/data-progression-border-fields hidden/);
        expect(html).toMatch(/data-progression-mission-fields hidden/);
        expect(html).toMatch(/data-progression-store-fields hidden/);
    });

    it("shows store limits only when the item actually uses them", () => {
        const html = renderProgressionAdminContent({
            ...baseProps,
            catalog: [
                {
                    ...catalog[1],
                    acquisitionType: "store",
                    availableFrom: "2026-08-01T12:00:00Z",
                    availableUntil: "2026-08-08T12:00:00Z",
                    supplyLimit: 25,
                    unitAmount: 499,
                    currency: "eur"
                }
            ],
            editorKey: "background:founder_night"
        });

        expect(html).toMatch(/data-progression-mission-fields hidden/);
        expect(html).toMatch(/data-progression-store-fields\s*>/);
        expect(html).toMatch(/data-progression-time-limit checked/);
        expect(html).toMatch(/data-progression-time-fields\s*>/);
        expect(html).toMatch(/data-progression-count-limit checked/);
        expect(html).toMatch(/data-progression-count-fields\s*>/);
        expect(html).toContain('value="4.99"');
    });

    it("moves manual ownership controls out of the cosmetic catalog", () => {
        const html = renderProgressionAdminContent(baseProps);

        expect(html).toContain('data-progression-section="players"');
        expect(html).not.toContain("data-progression-grant-form");
        expect(html).not.toContain("progression-grant-workspace");
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

    it("switches the protected workspace to Player Manager", () => {
        const html = renderProgressionAdminContent({
            ...baseProps,
            section: "players",
            player: {
                ready: true,
                players: [],
                catalog,
                grants: [],
                filters: { search: "", collection: "all" }
            }
        });

        expect(html).toContain('data-progression-section="players"');
        expect(html).toContain("Registered players");
        expect(html).toContain("No registered players");
        expect(html).not.toContain("data-progression-cosmetic-new");
    });
});
