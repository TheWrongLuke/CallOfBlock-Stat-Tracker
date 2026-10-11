import { createNetworkAdminApi } from "./network-admin.js";
const RULE_COLUMNS =
    "id, cosmetic_type, cosmetic_id, mode, metric, target, active, sort_order, created_by, created_at, updated_at";
const INVENTORY_COLUMNS = "profile_id, cosmetic_type, cosmetic_id, source, grant_note, granted_by, acquired_at";
const WEEKLY_TEMPLATE_COLUMNS =
    "id, family, difficulty, label, description, metric, target, xp, mode, weapon_scope, weapon_id, weapon_category, requirements, active, sort_order, created_at, updated_at";
const BADGE_OVERRIDE_COLUMNS = "badge_id, label, description, icon_url, tiers, created_at, updated_at";

export function createProgressionAdminApi(client, { network = null } = {}) {
    if (!client) throw new Error("A Supabase client is required.");
    const uuidMode = () => globalThis.window?.COB_STATS_ENVIRONMENT === "TEST";
    const networkApi = network || createNetworkAdminApi(client);
    let directory = null;
    const operations = new Map();
    const loadDirectory = () =>
        (directory ||= networkApi.players().catch((error) => {
            directory = null;
            throw error;
        }));
    const invalidate = () => {
        directory = null;
    };
    async function withPlayers(load, merge) {
        try {
            const [result, players] = await Promise.all([load(), loadDirectory()]);
            if (result.error) return result;
            return { data: merge(result.data || [], players), error: null };
        } catch (error) {
            return { data: null, error };
        }
    }
    async function uuidMutation(profileId, payload) {
        try {
            const players = await loadDirectory();
            const player = players.find((p) => (p.account_id || p.player_uuid) === profileId);
            if (!player) return null;
            const key = JSON.stringify([profileId, payload]);
            const operationId = operations.get(key) || crypto.randomUUID();
            operations.set(key, operationId);
            const data = await networkApi.editPlayer(player.player_uuid, { ...payload, operationId });
            operations.delete(key);
            invalidate();
            return { data, error: null, uuidOwned: true };
        } catch (error) {
            return { data: null, error };
        }
    }

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
            const load = () =>
                client
                    .from("profile_cosmetic_inventory")
                    .select(INVENTORY_COLUMNS)
                    .order("acquired_at", { ascending: false })
                    .limit(10000);
            if (!uuidMode()) return load();
            return withPlayers(load, (rows, players) => {
                const ids = new Set(players.map((p) => p.account_id || p.player_uuid));
                return [
                    ...rows.filter((row) => !ids.has(row.profile_id)),
                    ...players.flatMap((p) =>
                        (p.entitlements || []).map((item) => {
                            const sources =
                                p.entitlement_sources?.[JSON.stringify([item.type, item.id])]?.sources || [];
                            const protectedItem = sources.some((s) =>
                                /^(baseline:|purchase:|legacy:|independent:|default:|owner:)/.test(s)
                            );
                            return {
                                profile_id: p.account_id || p.player_uuid,
                                cosmetic_type: item.type,
                                cosmetic_id: item.id,
                                source: protectedItem
                                    ? "legacy"
                                    : sources.some((s) => s.startsWith("gift:"))
                                      ? "friend"
                                      : sources.some((s) => s.startsWith("admin:"))
                                        ? "admin"
                                        : "progression",
                                protected: protectedItem
                            };
                        })
                    )
                ];
            });
        },

        async listManagedPlayers() {
            invalidate();
            const load = () => client.rpc("admin_list_managed_players");
            if (!uuidMode()) return load();
            return withPlayers(load, (rows, players) => {
                const result = new Map(rows.map((p) => [p.id, p]));
                for (const player of players) {
                    const id = player.account_id || player.player_uuid;
                    result.set(id, {
                        ...player,
                        ...result.get(id),
                        id,
                        player_uuid: player.player_uuid,
                        uuid_owned: true,
                        account_id: player.account_id,
                        xp: player.xp,
                        level: player.level,
                        mission_progress: player.missions,
                        mission_assignments: player.mission_assignments,
                        badge_progress: player.badges,
                        achievement_ids: player.achievements,
                        progression_pending: player.pending
                    });
                }
                return [...result.values()];
            });
        },

        async listCosmeticRevocations() {
            const load = () => client.rpc("admin_list_cosmetic_revocation_history");
            if (!uuidMode()) return load();
            return withPlayers(load, (rows, players) => [
                ...rows,
                ...players.flatMap((p) =>
                    (p.revocations || []).map((r) => ({ ...r, profile_id: p.account_id || p.player_uuid }))
                )
            ]);
        },

        async listPendingCosmeticGifts() {
            return client.rpc("admin_list_pending_cosmetic_gifts");
        },

        async setPlayerBan(profileId, banned, reason) {
            return client.rpc("admin_set_player_community_ban", {
                p_profile_id: profileId,
                p_banned: banned,
                p_reason: reason || null
            });
        },

        async sendCosmeticGift(grant) {
            if (uuidMode()) {
                const result = await uuidMutation(grant.profileId, {
                    action: "GRANT",
                    type: grant.cosmeticType,
                    id: grant.cosmeticId,
                    source: grant.source === "friend" ? "gift" : "admin",
                    note: grant.note || ""
                });
                if (result) return result;
            }
            return client.rpc("admin_send_cosmetic_gift", {
                p_profile_id: grant.profileId,
                p_cosmetic_type: grant.cosmeticType,
                p_cosmetic_id: grant.cosmeticId,
                p_source: grant.source,
                p_note: grant.note || null
            });
        },

        async revokePlayerCosmetic(profileId, cosmeticType, cosmeticId, note) {
            if (uuidMode()) {
                const result = await uuidMutation(profileId, {
                    action: "REVOKE",
                    type: cosmeticType,
                    id: cosmeticId,
                    source: "admin",
                    note
                });
                if (result) return result;
            }
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

        async listBadgeOverrides() {
            return client.from("badge_catalog_overrides").select(BADGE_OVERRIDE_COLUMNS).order("badge_id");
        },

        async saveBadgeOverride(badge) {
            return client.rpc("admin_save_badge_catalog_override", { p_badge: badge });
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
