import {
    COSMETIC_GRANT_SOURCES,
    PROGRESSION_METRICS,
    PROGRESSION_MODES,
    progressionOptionLabel
} from "../config/progression.js";
import { formatDateTime } from "../utils/dates.js";
import { escapeHtml } from "../utils/sanitization.js";

export function renderProgressionAdminContent({
    loading,
    ready,
    catalog,
    rules,
    grants,
    profiles,
    editingRuleId,
    message,
    error,
    saving
}) {
    if (loading) return renderState("Loading progression controls...");
    if (!ready) {
        return `
            <section class="progression-state error" role="alert">
                <strong>Progression database setup is required.</strong>
                <span>${escapeHtml(error || "Run the current Supabase setup script, then retry.")}</span>
                <button type="button" data-progression-retry>Retry</button>
            </section>
        `;
    }

    const remoteCatalog = catalog.filter((item) => item?.remoteCatalog);
    const editingRule = rules.find((rule) => rule.id === editingRuleId) || null;
    const activeRules = rules.filter((rule) => rule.active).length;
    const uniqueOwners = new Set(grants.map((grant) => grant.profile_id)).size;

    return `
        ${message ? `<p class="progression-notice">${escapeHtml(message)}</p>` : ""}
        ${error ? `<p class="progression-notice error" role="alert">${escapeHtml(error)}</p>` : ""}
        <section class="progression-metrics" aria-label="Progression overview">
            <div><span>Catalog items</span><strong>${escapeHtml(remoteCatalog.length)}</strong></div>
            <div><span>Active rules</span><strong>${escapeHtml(activeRules)}</strong></div>
            <div><span>Granted items</span><strong>${escapeHtml(grants.length)}</strong></div>
            <div><span>Profiles with grants</span><strong>${escapeHtml(uniqueOwners)}</strong></div>
        </section>
        <section class="progression-admin-grid">
            ${renderRuleEditor(editingRule, remoteCatalog, saving)}
            ${renderGrantEditor(profiles, remoteCatalog, saving)}
        </section>
        <section class="progression-data-grid">
            ${renderRules(rules, remoteCatalog)}
            ${renderGrants(grants, profiles, remoteCatalog)}
        </section>
    `;
}

function renderRuleEditor(rule, catalog, saving) {
    const value = rule || {
        cosmetic_type: "",
        cosmetic_id: "",
        mode: "overall",
        metric: "games",
        target: 1,
        active: true,
        sort_order: 0
    };
    return `
        <form class="progression-editor" data-progression-rule-form>
            <header>
                <div><p class="panel-kicker">Unlock Rule</p><h3>${rule ? "Edit progression rule" : "New progression rule"}</h3></div>
                ${rule ? `<button type="button" data-progression-rule-new>Clear</button>` : ""}
            </header>
            <input type="hidden" name="ruleId" value="${escapeHtml(rule?.id || "")}">
            <label><span>Reward cosmetic</span><select name="cosmeticKey" required>${renderCatalogOptions(catalog, `${value.cosmetic_type}:${value.cosmetic_id}`, "Choose a catalog item")}</select></label>
            <div class="progression-form-row">
                <label><span>Mode</span><select name="mode">${renderOptions(PROGRESSION_MODES, value.mode)}</select></label>
                <label><span>Stat</span><select name="metric">${renderOptions(PROGRESSION_METRICS, value.metric)}</select></label>
            </div>
            <div class="progression-form-row">
                <label><span>Required amount</span><input name="target" type="number" min="0.01" max="1000000000" step="0.01" value="${escapeHtml(value.target)}" required></label>
                <label><span>Sort order</span><input name="sortOrder" type="number" min="0" max="100000" step="1" value="${escapeHtml(value.sort_order || 0)}"></label>
            </div>
            <label class="progression-check"><input type="checkbox" name="active" ${value.active ? "checked" : ""}><span>Rule active</span></label>
            <button type="submit" ${saving ? "disabled" : ""}>${saving ? "Saving..." : rule ? "Save rule" : "Create rule"}</button>
        </form>
    `;
}

function renderGrantEditor(profiles, catalog, saving) {
    return `
        <form class="progression-editor" data-progression-grant-form>
            <header><div><p class="panel-kicker">Exclusive Access</p><h3>Grant a cosmetic</h3></div></header>
            <label><span>Player account</span><select name="profileId" required>${renderProfileOptions(profiles)}</select></label>
            <label><span>Cosmetic</span><select name="cosmeticKey" required>${renderCatalogOptions(catalog, "", "Choose a catalog item")}</select></label>
            <label><span>Grant type</span><select name="source">${renderOptions(COSMETIC_GRANT_SOURCES, "friend")}</select></label>
            <label><span>Private note</span><input name="note" maxlength="200" placeholder="Why this account received it"></label>
            <button type="submit" ${saving ? "disabled" : ""}>${saving ? "Saving..." : "Grant cosmetic"}</button>
        </form>
    `;
}

function renderRules(rules, catalog) {
    const catalogMap = catalogMapByKey(catalog);
    return `
        <section class="progression-list-panel">
            <header><p class="panel-kicker">Progression</p><h3>${escapeHtml(rules.length)} unlock rules</h3></header>
            <div class="progression-list">
                ${rules.length ? rules.map((rule) => {
                    const cosmetic = catalogMap.get(`${rule.cosmetic_type}:${rule.cosmetic_id}`);
                    return `
                        <article class="progression-list-item ${rule.active ? "" : "inactive"}">
                            <div>
                                <span>${escapeHtml(`${progressionOptionLabel(PROGRESSION_MODES, rule.mode)} / ${progressionOptionLabel(PROGRESSION_METRICS, rule.metric)}`)}</span>
                                <strong>${escapeHtml(cosmetic?.name || rule.cosmetic_id)}</strong>
                                <small>Unlock at ${escapeHtml(rule.target)}${rule.active ? "" : " / inactive"}</small>
                            </div>
                            <div class="progression-row-actions">
                                <button type="button" data-progression-rule-edit="${escapeHtml(rule.id)}">Edit</button>
                                <button type="button" data-progression-rule-delete="${escapeHtml(rule.id)}">Delete</button>
                            </div>
                        </article>
                    `;
                }).join("") : `<p class="progression-empty">No progression rules yet.</p>`}
            </div>
        </section>
    `;
}

function renderGrants(grants, profiles, catalog) {
    const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
    const catalogMap = catalogMapByKey(catalog);
    return `
        <section class="progression-list-panel">
            <header><p class="panel-kicker">Inventory</p><h3>${escapeHtml(grants.length)} direct grants</h3></header>
            <div class="progression-list">
                ${grants.length ? grants.map((grant) => {
                    const profile = profilesById.get(grant.profile_id);
                    const cosmetic = catalogMap.get(`${grant.cosmetic_type}:${grant.cosmetic_id}`);
                    return `
                        <article class="progression-list-item">
                            <div>
                                <span>${escapeHtml(grant.source || "admin")} / ${escapeHtml(formatDateTime(grant.acquired_at))}</span>
                                <strong>${escapeHtml(cosmetic?.name || grant.cosmetic_id)}</strong>
                                <small>${escapeHtml(profileCommunicationLabel(profile))}${grant.grant_note ? ` / ${escapeHtml(grant.grant_note)}` : ""}</small>
                            </div>
                            <div class="progression-row-actions">
                                <button type="button" data-progression-grant-revoke data-profile-id="${escapeHtml(grant.profile_id)}" data-cosmetic-type="${escapeHtml(grant.cosmetic_type)}" data-cosmetic-id="${escapeHtml(grant.cosmetic_id)}">Revoke</button>
                            </div>
                        </article>
                    `;
                }).join("") : `<p class="progression-empty">No direct cosmetic grants yet.</p>`}
            </div>
        </section>
    `;
}

function renderCatalogOptions(catalog, selected, placeholder) {
    const items = [...catalog].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
    return `<option value="">${escapeHtml(placeholder)}</option>${items.map((item) => {
        const key = `${item.type}:${item.id}`;
        return `<option value="${escapeHtml(key)}" ${key === selected ? "selected" : ""}>${escapeHtml(`${item.type} / ${item.name}`)}</option>`;
    }).join("")}`;
}

function renderProfileOptions(profiles) {
    return `<option value="">Choose a player</option>${profiles.map((profile) => `<option value="${escapeHtml(profile.id)}">${escapeHtml(profileCommunicationLabel(profile))}</option>`).join("")}`;
}

function renderOptions(options, selected) {
    return options.map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === selected ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
}

function profileCommunicationLabel(profile) {
    if (!profile) return "Unknown profile";
    const displayName = String(profile.display_name || "").trim();
    const username = String(profile.username || "").trim();
    const minecraft = String(profile.minecraft_player_name || "").trim();
    const discord = username ? `@${username.replace(/^@/, "")}` : "Discord unavailable";
    return [displayName && displayName.toLowerCase() !== username.toLowerCase() ? displayName : "", discord, minecraft].filter(Boolean).join(" / ");
}

function catalogMapByKey(catalog) {
    return new Map(catalog.map((item) => [`${item.type}:${item.id}`, item]));
}

function renderState(message) {
    return `<section class="progression-state" aria-busy="true"><strong>${escapeHtml(message)}</strong></section>`;
}
