const RULE_COLUMNS =
    "id, cosmetic_type, cosmetic_id, mode, metric, target, active, sort_order, created_by, created_at, updated_at";
const INVENTORY_COLUMNS = "profile_id, cosmetic_type, cosmetic_id, source, grant_note, granted_by, acquired_at";
const WEEKLY_TEMPLATE_COLUMNS =
    "id, family, difficulty, label, description, metric, target, xp, mode, weapon_scope, weapon_id, weapon_category, active, sort_order, created_at, updated_at";

export function createProgressionAdminApi(client) {
    if (!client) throw new Error("A Supabase client is required.");

    return {
        async listRules() {
            return client
                .from("cosmetic_progression_rules")
                .select(RULE_COLUMNS)
                .order("sort_order", { ascending: true })
                .order("created_at", { ascending: true })
                .limit(1000);
        },

        async listInventory() {
            return client
                .from("profile_cosmetic_inventory")
                .select(INVENTORY_COLUMNS)
                .order("acquired_at", { ascending: false })
                .limit(10000);
        },

        async listManagedPlayers() {
            return client.rpc("admin_list_managed_players");
        },

        async listCosmeticRevocations() {
            return client.rpc("admin_list_cosmetic_revocation_history");
        },

        async listOwnCosmeticGifts() {
            return client.rpc("list_my_cosmetic_gifts");
        },

        async setPlayerBan(profileId, banned, reason) {
            return client.rpc("admin_set_player_community_ban", {
                p_profile_id: profileId,
                p_banned: banned,
                p_reason: reason || null
            });
        },

        async grantPlayerCosmetic(grant) {
            return client.rpc("admin_grant_player_cosmetic", {
                p_profile_id: grant.profileId,
                p_cosmetic_type: grant.cosmeticType,
                p_cosmetic_id: grant.cosmeticId,
                p_source: grant.source,
                p_note: grant.note || null
            });
        },

        async revokePlayerCosmetic(profileId, cosmeticType, cosmeticId, note) {
            return client.rpc("admin_revoke_player_cosmetic_reearnable", {
                p_profile_id: profileId,
                p_cosmetic_type: cosmeticType,
                p_cosmetic_id: cosmeticId,
                p_note: note
            });
        },

        async listWeeklyMissionTemplates() {
            return client
                .from("weekly_mission_templates")
                .select(WEEKLY_TEMPLATE_COLUMNS)
                .order("difficulty", { ascending: true })
                .order("sort_order", { ascending: true })
                .order("label", { ascending: true })
                .limit(1000);
        },

        async saveWeeklyMissionTemplate(template) {
            return client.rpc("admin_save_weekly_mission_template", { p_template: template });
        },

        async setWeeklyMissionTemplateActive(templateId, active) {
            return client.rpc("admin_set_weekly_mission_template_active", {
                p_template_id: templateId,
                p_active: active
            });
        },

        async deleteWeeklyMissionTemplate(templateId) {
            return client.rpc("admin_delete_weekly_mission_template", { p_template_id: templateId });
        },

        async saveRule(rule) {
            const payload = {
                cosmetic_type: rule.cosmeticType,
                cosmetic_id: rule.cosmeticId,
                mode: rule.mode,
                metric: rule.metric,
                target: rule.target,
                active: rule.active,
                sort_order: rule.sortOrder,
                created_by: rule.createdBy,
                updated_at: new Date().toISOString()
            };
            if (rule.id) payload.id = rule.id;
            return client
                .from("cosmetic_progression_rules")
                .upsert(payload, { onConflict: "cosmetic_type,cosmetic_id" })
                .select(RULE_COLUMNS)
                .single();
        },

        async deleteRule(ruleId) {
            return client.from("cosmetic_progression_rules").delete().eq("id", ruleId);
        },

        async deleteRuleForCosmetic(cosmeticType, cosmeticId) {
            return client
                .from("cosmetic_progression_rules")
                .delete()
                .eq("cosmetic_type", cosmeticType)
                .eq("cosmetic_id", cosmeticId);
        },

        async saveCatalogItem(payload) {
            return client
                .from("cosmetic_catalog_items")
                .upsert(payload, { onConflict: "cosmetic_type,cosmetic_id" })
                .select("cosmetic_type, cosmetic_id")
                .single();
        },

        async deleteCatalogItem(cosmeticType, cosmeticId) {
            return client.rpc("delete_cosmetic_catalog_item", {
                p_cosmetic_type: cosmeticType,
                p_cosmetic_id: cosmeticId
            });
        },

        async reconcileCosmetic(cosmeticType, cosmeticId) {
            return client.rpc("reconcile_cosmetic_ownership_v2", {
                p_cosmetic_type: cosmeticType,
                p_cosmetic_id: cosmeticId
            });
        },

        async setCatalogAcquisition(cosmeticType, cosmeticId, acquisitionType) {
            return client
                .from("cosmetic_catalog_items")
                .update({ acquisition_type: acquisitionType, updated_at: new Date().toISOString() })
                .eq("cosmetic_type", cosmeticType)
                .eq("cosmetic_id", cosmeticId);
        },

        async grantCosmetic(grant) {
            return client
                .from("profile_cosmetic_inventory")
                .upsert(
                    {
                        profile_id: grant.profileId,
                        cosmetic_type: grant.cosmeticType,
                        cosmetic_id: grant.cosmeticId,
                        source: grant.source,
                        grant_note: grant.note || null,
                        granted_by: grant.grantedBy,
                        acquired_at: new Date().toISOString()
                    },
                    { onConflict: "profile_id,cosmetic_type,cosmetic_id" }
                )
                .select(INVENTORY_COLUMNS)
                .single();
        },

        async revokeCosmetic(profileId, cosmeticType, cosmeticId) {
            return client
                .from("profile_cosmetic_inventory")
                .delete()
                .eq("profile_id", profileId)
                .eq("cosmetic_type", cosmeticType)
                .eq("cosmetic_id", cosmeticId);
        }
    };
}
