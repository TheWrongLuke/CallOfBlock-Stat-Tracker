import { describe, expect, it } from "vitest";
import { renderWeeklyMissionAdminContent } from "../../src/views/weekly-mission-admin.js";

const templates = [
    {
        id: "easy_kills",
        family: "kills_any",
        difficulty: "easy",
        label: "On the Board",
        description: "Get 5 kills in any mode.",
        metric: "kills",
        target: 5,
        xp: 350,
        mode: "overall",
        weaponScope: "none",
        weaponId: "",
        weaponCategory: "",
        active: true,
        sortOrder: 10
    },
    {
        id: "hard_weapon",
        family: "weapon_kills",
        difficulty: "hard",
        label: "<script> Mastery",
        description: "Get kills with {weapon}.",
        metric: "kills",
        target: 10,
        xp: 1200,
        mode: "random",
        weaponScope: "random_weapon",
        weaponId: "",
        weaponCategory: "",
        active: false,
        sortOrder: 20
    }
];

const baseProps = {
    ready: true,
    templates,
    filters: { search: "", difficulty: "all", showArchived: true },
    message: "",
    error: "",
    saving: false
};

describe("weekly mission administration view", () => {
    it("renders the managed pool and escapes template content", () => {
        const html = renderWeeklyMissionAdminContent(baseProps);

        expect(html).toContain('data-weekly-template-open="easy_kills"');
        expect(html).toContain('data-weekly-template-open="hard_weapon"');
        expect(html).toContain("&lt;script&gt; Mastery");
        expect(html).not.toContain("<script>");
        expect(html).toContain("New mission");
        expect(html).toContain("4 + 3");
    });

    it("opens a complete editor whose only close control is the X button", () => {
        const html = renderWeeklyMissionAdminContent({
            ...baseProps,
            editorId: "easy_kills"
        });

        expect(html).toContain("data-weekly-template-backdrop");
        expect(html).toContain("data-weekly-template-form");
        expect(html).toContain('name="weaponScope"');
        expect(html).toContain('name="target"');
        expect(html).toContain('name="xp"');
        expect(html.match(/data-weekly-template-close/g)).toHaveLength(1);
        expect(html).not.toMatch(/data-weekly-template-backdrop[^>]*data-weekly-template-close/);
    });

    it("filters archived missions and difficulty without removing editor controls", () => {
        const html = renderWeeklyMissionAdminContent({
            ...baseProps,
            filters: { search: "", difficulty: "hard", showArchived: false }
        });

        expect(html).toContain("No weekly missions match these filters");
        expect(html).not.toContain('data-weekly-template-open="easy_kills"');
        expect(html).not.toContain('data-weekly-template-open="hard_weapon"');
        expect(html).toContain("data-weekly-template-new");
    });

    it("shows a dedicated setup state when the catalog is unavailable", () => {
        const html = renderWeeklyMissionAdminContent({
            ...baseProps,
            ready: false,
            templates: [],
            error: "Install the weekly schema."
        });

        expect(html).toContain("Weekly mission catalog setup is required");
        expect(html).toContain("data-progression-weekly-retry");
    });
});
