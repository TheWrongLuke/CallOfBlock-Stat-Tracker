import { describe, expect, it } from "vitest";
import { BADGE_CATALOG } from "../../src/config/badges.js";
import { renderBadgeAdminContent } from "../../src/views/badge-admin.js";

const baseProps = {
    ready: true,
    badges: BADGE_CATALOG,
    editorId: "",
    filters: { search: "", type: "all" },
    message: "",
    error: "",
    saving: false
};

describe("badge administration view", () => {
    it("shows a setup state before the private migration is available", () => {
        const html = renderBadgeAdminContent({ ...baseProps, ready: false, error: "Run the script." });

        expect(html).toContain("Badge editor setup is required");
        expect(html).toContain("data-badge-editor-retry");
    });

    it("renders every default badge as an editable card", () => {
        const html = renderBadgeAdminContent(baseProps);

        expect(html.match(/data-badge-editor-open=/g)).toHaveLength(64);
        expect(html).toContain('data-badge-editor-open="br_wins_counter"');
        expect(html).toContain('data-badge-editor-open="owner"');
    });

    it("renders every level collapsed in one scrollable modal with GIF-capable icon inputs", () => {
        const html = renderBadgeAdminContent({ ...baseProps, editorId: "br_wins_counter" });

        expect(html).toContain("Save badge and levels");
        expect(html.match(/data-badge-tier=/g)).toHaveLength(5);
        expect(html.match(/<details class="badge-editor-tier/g)).toHaveLength(5);
        expect(html).not.toMatch(/data-badge-tier="0" open/);
        expect(html).toContain("<summary>");
        expect(html).toContain('name="tierName_0"');
        expect(html).toContain('name="tierTarget_4"');
        expect(html).toContain('accept="image/png,image/webp,image/gif"');
        expect(html.match(/data-badge-editor-close/g)).toHaveLength(1);
        expect(html).not.toMatch(/data-badge-editor-backdrop[^>]*data-badge-editor-close/);
    });

    it("renders an unsaved draft and preserves expanded levels", () => {
        const html = renderBadgeAdminContent({
            ...baseProps,
            editorId: "br_wins_counter",
            draft: {
                badgeId: "br_wins_counter",
                label: "Unsaved winner name",
                description: "Draft description",
                iconUrl: "",
                previewUrl: "",
                tiers: [{ name: "Draft level", description: "", target: "7", targetPerMap: null, iconUrl: "" }]
            },
            expandedTiers: [0]
        });

        expect(html).toContain('value="Unsaved winner name"');
        expect(html).toContain('data-badge-tier="0" open');
        expect(html).toContain('value="Draft level"');
        expect(html).toContain('name="tierTarget_0" type="number" min="0" max="1000000000" step="0.01" value="7"');
    });

    it("keeps non-upgradable badges editable without inventing a threshold", () => {
        const html = renderBadgeAdminContent({ ...baseProps, editorId: "owner" });

        expect(html).toContain("has no upgrade levels");
        expect(html).not.toContain('name="tierTarget_0"');
    });

    it("exposes both map-count and per-map thresholds for map mastery", () => {
        const html = renderBadgeAdminContent({ ...baseProps, editorId: "dm_map_mastery" });

        expect(html).toContain("Maps required");
        expect(html).toContain('name="tierTargetPerMap_0"');
        expect(html).toContain("Games per map");
    });
});
