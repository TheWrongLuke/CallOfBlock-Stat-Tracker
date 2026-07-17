import { describe, expect, it } from "vitest";
import { renderProgressionAdminContent } from "../../src/views/progression.js";

const catalog = [
    {
        type: "title",
        id: "owner",
        name: "Owner",
        remoteCatalog: true
    },
    {
        type: "background",
        id: "founder_night",
        name: "Founder Night",
        remoteCatalog: true
    }
];

describe("progression admin view", () => {
    it("renders protected setup state when the schema is unavailable", () => {
        const html = renderProgressionAdminContent({
            loading: false,
            ready: false,
            catalog: [],
            rules: [],
            grants: [],
            profiles: [],
            editingRuleId: "",
            message: "",
            error: "Run the setup script.",
            saving: false
        });

        expect(html).toContain("Progression database setup is required");
        expect(html).toContain("data-progression-retry");
    });

    it("escapes account and cosmetic labels in grant controls", () => {
        const html = renderProgressionAdminContent({
            loading: false,
            ready: true,
            catalog,
            rules: [],
            grants: [],
            profiles: [
                {
                    id: "123e4567-e89b-42d3-a456-426614174000",
                    username: "owner<script>",
                    display_name: "Owner <img>",
                    minecraft_player_name: "RTXLuke",
                    is_owner: true
                }
            ],
            editingRuleId: "",
            message: "",
            error: "",
            saving: false
        });

        expect(html).toContain("data-progression-rule-form");
        expect(html).toContain("data-progression-grant-form");
        expect(html).not.toContain("<script>");
        expect(html).not.toContain("<img>");
        expect(html).toContain("@owner&lt;script&gt;");
    });

    it("renders rule and grant management actions", () => {
        const html = renderProgressionAdminContent({
            loading: false,
            ready: true,
            catalog,
            rules: [
                {
                    id: "rule-1",
                    cosmetic_type: "background",
                    cosmetic_id: "founder_night",
                    mode: "battle_royale",
                    metric: "wins",
                    target: 10,
                    active: true,
                    sort_order: 0
                }
            ],
            grants: [
                {
                    profile_id: "profile-1",
                    cosmetic_type: "title",
                    cosmetic_id: "owner",
                    source: "owner",
                    acquired_at: "2026-07-17T12:00:00Z"
                }
            ],
            profiles: [{ id: "profile-1", username: "owner", display_name: "Owner", is_owner: true }],
            editingRuleId: "",
            message: "",
            error: "",
            saving: false
        });

        expect(html).toContain('data-progression-rule-edit="rule-1"');
        expect(html).toContain("data-progression-grant-revoke");
        expect(html).toContain("Founder Night");
    });
});
