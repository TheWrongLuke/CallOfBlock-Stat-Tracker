import { describe, expect, it, vi } from "vitest";
import { createProgressionAdminApi } from "../../src/api/progression.js";

describe("progression admin API", () => {
    it("uses the reconciliation RPC after a cosmetic configuration changes", async () => {
        const rpc = vi.fn().mockResolvedValue({ data: { eligible: 2, added: 1, removed: 0 }, error: null });
        const api = createProgressionAdminApi({ rpc });

        const result = await api.reconcileCosmetic("background", "battle_royale");

        expect(rpc).toHaveBeenCalledWith("reconcile_cosmetic_ownership", {
            p_cosmetic_type: "background",
            p_cosmetic_id: "battle_royale"
        });
        expect(result.error).toBeNull();
    });

    it("permanently deletes through the protected cleanup RPC", async () => {
        const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
        const api = createProgressionAdminApi({ rpc });

        await api.deleteCatalogItem("icon", "custom_reward");

        expect(rpc).toHaveBeenCalledWith("delete_cosmetic_catalog_item", {
            p_cosmetic_type: "icon",
            p_cosmetic_id: "custom_reward"
        });
    });

    it("saves weekly mission templates through the protected admin RPC", async () => {
        const rpc = vi.fn().mockResolvedValue({ data: { id: "easy_kills" }, error: null });
        const api = createProgressionAdminApi({ rpc });
        const template = {
            id: "easy_kills",
            family: "kills_any",
            difficulty: "easy",
            metric: "kills",
            target: 5,
            xp: 350
        };

        await api.saveWeeklyMissionTemplate(template);

        expect(rpc).toHaveBeenCalledWith("admin_save_weekly_mission_template", {
            p_template: template
        });
    });

    it("archives and deletes weekly mission templates through protected RPCs", async () => {
        const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
        const api = createProgressionAdminApi({ rpc });

        await api.setWeeklyMissionTemplateActive("hard_wins", false);
        await api.deleteWeeklyMissionTemplate("hard_wins");

        expect(rpc).toHaveBeenNthCalledWith(1, "admin_set_weekly_mission_template_active", {
            p_template_id: "hard_wins",
            p_active: false
        });
        expect(rpc).toHaveBeenNthCalledWith(2, "admin_delete_weekly_mission_template", {
            p_template_id: "hard_wins"
        });
    });
});
