const RULE_COLUMNS =
    "id, cosmetic_type, cosmetic_id, mode, metric, target, active, sort_order, created_by, created_at, updated_at";
const INVENTORY_COLUMNS =
    "profile_id, cosmetic_type, cosmetic_id, source, grant_note, granted_by, acquired_at";
const PROFILE_COLUMNS = "id, username, display_name, minecraft_player_name, is_owner";

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
                .limit(1000);
        },

        async listProfiles() {
            return client.from("profiles").select(PROFILE_COLUMNS).order("username", { ascending: true }).limit(1000);
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
            if (rule.id) {
                delete payload.created_by;
                return client
                    .from("cosmetic_progression_rules")
                    .update(payload)
                    .eq("id", rule.id)
                    .select(RULE_COLUMNS)
                    .single();
            }
            return client.from("cosmetic_progression_rules").insert(payload).select(RULE_COLUMNS).single();
        },

        async deleteRule(ruleId) {
            return client.from("cosmetic_progression_rules").delete().eq("id", ruleId);
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
