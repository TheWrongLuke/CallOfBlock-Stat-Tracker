import { badgeTierEditableTarget, badgeTierPerMapTarget } from "../config/badge-catalog.js";
import { escapeHtml } from "../utils/sanitization.js";

const BADGE_TYPES = Object.freeze([
    { value: "all", label: "All badge types" },
    { value: "live-counter", label: "Live counters" },
    { value: "limited", label: "Limited upgrades" },
    { value: "permanent", label: "Permanent" },
    { value: "special", label: "Special" }
]);
const DEFAULT_BADGE_ICON = "./assets/badges/default.png";

export function renderBadgeAdminContent({
    ready,
    badges = [],
    editorId = "",
    filters = {},
    message = "",
    error = "",
    saving = false
}) {
    if (!ready) {
        return `
            <section class="progression-state error" role="alert">
                <strong>Badge editor setup is required.</strong>
                <span>${escapeHtml(error || "Run the newest private Supabase badge editor script, then retry.")}</span>
                <button type="button" data-badge-editor-retry>Retry</button>
            </section>
        `;
    }

    const visibleBadges = filterBadges(badges, filters);
    const editorBadge = badges.find((badge) => badge.id === editorId) || null;
    const tieredCount = badges.filter((badge) => badge.tiers?.length).length;

    return `
        ${message ? `<p class="progression-notice">${escapeHtml(message)}</p>` : ""}
        ${error ? `<p class="progression-notice error" role="alert">${escapeHtml(error)}</p>` : ""}
        <section class="progression-metrics badge-admin-metrics" aria-label="Badge catalogue overview">
            <div><span>All badges</span><strong>${escapeHtml(badges.length)}</strong></div>
            <div><span>Upgradeable</span><strong>${escapeHtml(tieredCount)}</strong></div>
            <div><span>Permanent</span><strong>${escapeHtml(badges.filter((badge) => badge.badgeType === "permanent").length)}</strong></div>
            <div><span>Special</span><strong>${escapeHtml(badges.filter((badge) => badge.badgeType === "special").length)}</strong></div>
        </section>
        <section class="progression-catalog-toolbar badge-admin-toolbar">
            <label class="wide"><span>Find badge</span><input type="search" value="${escapeHtml(filters.search || "")}" data-badge-editor-filter="search" placeholder="Badge or level name"></label>
            <label><span>Type</span><select data-badge-editor-filter="type">${renderOptions(BADGE_TYPES, filters.type || "all")}</select></label>
        </section>
        <section class="badge-admin-grid" aria-live="polite">
            ${
                visibleBadges.length
                    ? visibleBadges.map(renderBadgeCard).join("")
                    : `<p class="progression-empty">No badges match these filters.</p>`
            }
        </section>
        ${editorBadge ? renderBadgeEditor(editorBadge, saving) : ""}
    `;
}

function renderBadgeCard(badge) {
    const levels = Array.isArray(badge.tiers) ? badge.tiers.length : 0;
    const rarity = badge.tiers?.[0]?.rarity || badge.rarity || "common";
    return `
        <button class="badge-admin-card rarity-${escapeHtml(rarity)}" type="button" data-badge-editor-open="${escapeHtml(badge.id)}">
            <span class="badge-admin-card-icon">${renderBadgeImage(badge.iconUrl || badge.icon, badge.label)}</span>
            <span class="badge-admin-card-copy">
                <small>${escapeHtml(badgeTypeLabel(badge.badgeType))}</small>
                <strong>${escapeHtml(badge.label)}</strong>
                <span>${escapeHtml(levels ? `${levels} editable levels` : "Single badge")}</span>
                <small>${escapeHtml(badge.id)}</small>
            </span>
        </button>
    `;
}

function renderBadgeEditor(badge, saving) {
    const levels = Array.isArray(badge.tiers) ? badge.tiers : [];
    return `
        <div class="progression-modal-backdrop" data-badge-editor-backdrop>
            <section class="progression-cosmetic-dialog badge-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="badge-editor-title">
                <header class="progression-dialog-header badge-editor-header">
                    <div class="progression-dialog-preview badge-editor-header-preview" data-badge-preview-for="base">
                        ${renderBadgeImage(badge.iconUrl || badge.icon, badge.label)}
                    </div>
                    <div>
                        <p class="panel-kicker">Badge Editor</p>
                        <h3 id="badge-editor-title">${escapeHtml(badge.label)}</h3>
                        <span>${escapeHtml(levels.length ? `${levels.length} levels / ${badge.id}` : `Single badge / ${badge.id}`)}</span>
                    </div>
                    <button class="progression-dialog-close" type="button" data-badge-editor-close aria-label="Close badge editor">X</button>
                </header>
                <form class="progression-cosmetic-form badge-editor-form" data-badge-editor-form>
                    <input type="hidden" name="badgeId" value="${escapeHtml(badge.id)}">
                    <fieldset>
                        <legend>Badge identity</legend>
                        <div class="badge-editor-identity">
                            <div class="badge-editor-asset-preview" data-badge-preview-for="base">
                                ${renderBadgeImage(badge.iconUrl || badge.icon, badge.label)}
                            </div>
                            <div class="progression-editor-fields">
                                <label class="wide"><span>Badge name</span><input name="badgeLabel" value="${escapeHtml(badge.label)}" maxlength="80" required></label>
                                <label class="wide"><span>Description</span><textarea name="badgeDescription" rows="3" maxlength="300">${escapeHtml(badge.description || "")}</textarea></label>
                                <label class="wide"><span>Icon URL</span><input name="badgeIconUrl" value="${escapeHtml(remoteAssetValue(badge.iconUrl || badge.icon))}" maxlength="1000" placeholder="Optional HTTPS PNG, WebP or GIF URL"></label>
                                <label class="wide"><span>Replace icon</span><input type="file" name="badgeAsset" accept="image/png,image/webp,image/gif" data-badge-asset-input data-badge-asset-scope="base"><small>PNG, WebP or animated GIF, maximum 8 MB.</small></label>
                            </div>
                        </div>
                    </fieldset>
                    <fieldset>
                        <legend>${levels.length ? "Upgrade levels" : "Unlock behavior"}</legend>
                        ${
                            levels.length
                                ? `<div class="badge-editor-tier-list">${levels.map((tier, index) => renderBadgeTierEditor(badge, tier, index, levels.length)).join("")}</div>`
                                : `<p class="badge-editor-no-levels">This badge has no upgrade levels. Its unlock detector or manual grant remains unchanged; this editor changes its public name, description, and icon.</p>`
                        }
                    </fieldset>
                    <p class="progression-editor-status" data-badge-editor-status role="status"></p>
                    <footer class="progression-dialog-actions">
                        <button class="primary" type="submit" ${saving ? "disabled" : ""}>${saving ? "Saving badge..." : "Save badge and levels"}</button>
                    </footer>
                </form>
            </section>
        </div>
    `;
}

function renderBadgeTierEditor(badge, tier, index, total) {
    const target = badgeTierEditableTarget(tier);
    const perMapTarget = badgeTierPerMapTarget(tier);
    const icon = tier.iconUrl || tier.icon || badge.iconUrl || badge.icon;
    const rarity = tier.rarity || badge.rarity || "common";
    return `
        <section class="badge-editor-tier rarity-${escapeHtml(rarity)}" data-badge-tier="${index}">
            <header>
                <div class="badge-editor-tier-icon" data-badge-preview-for="tier-${index}">
                    ${renderBadgeImage(icon, tier.name)}
                </div>
                <div>
                    <small>Level ${index + 1} of ${total}</small>
                    <strong>${escapeHtml(tier.name)}</strong>
                    <span>${escapeHtml(rarityLabel(rarity))}</span>
                </div>
            </header>
            <div class="progression-editor-fields">
                <label class="wide"><span>Level name</span><input name="tierName_${index}" value="${escapeHtml(tier.name)}" maxlength="80" required></label>
                <label><span>${escapeHtml(thresholdLabel(tier))}</span><input name="tierTarget_${index}" type="number" min="0" max="1000000000" step="0.01" value="${escapeHtml(target)}" required></label>
                ${
                    perMapTarget === null
                        ? ""
                        : `<label><span>${escapeHtml(perMapLabel(tier))}</span><input name="tierTargetPerMap_${index}" type="number" min="0" max="1000000000" step="0.01" value="${escapeHtml(perMapTarget)}" required></label>`
                }
                <label class="wide"><span>Level description</span><textarea name="tierDescription_${index}" rows="2" maxlength="300">${escapeHtml(tier.description || "")}</textarea></label>
                <label class="wide"><span>Level icon URL</span><input name="tierIconUrl_${index}" value="${escapeHtml(remoteAssetValue(tier.iconUrl || tier.icon))}" maxlength="1000" placeholder="Optional HTTPS PNG, WebP or GIF URL"></label>
                <label class="wide"><span>Replace level icon</span><input type="file" name="tierAsset_${index}" accept="image/png,image/webp,image/gif" data-badge-asset-input data-badge-asset-scope="tier-${index}"><small>Leave empty to use the badge icon. Animated GIFs remain animated.</small></label>
            </div>
        </section>
    `;
}

function filterBadges(badges, filters) {
    const search = String(filters.search || "")
        .trim()
        .toLowerCase();
    const type = String(filters.type || "all");
    return badges
        .filter((badge) => type === "all" || badge.badgeType === type)
        .filter(
            (badge) =>
                !search ||
                [badge.id, badge.label, badge.description, ...(badge.tiers || []).map((tier) => tier.name)].some(
                    (value) =>
                        String(value || "")
                            .toLowerCase()
                            .includes(search)
                )
        )
        .sort((a, b) => badgeTypeRank(a.badgeType) - badgeTypeRank(b.badgeType) || a.label.localeCompare(b.label));
}

function renderBadgeImage(value, label) {
    const source = badgeAssetUrl(value) || DEFAULT_BADGE_ICON;
    return `<img src="${escapeHtml(source)}" alt="${escapeHtml(label || "Badge")}" loading="lazy" onerror="this.onerror=null;this.src='${DEFAULT_BADGE_ICON}'">`;
}

function badgeAssetUrl(value) {
    const url = String(value || "").trim();
    if (/^https:\/\//i.test(url) || /^\.\.?(?:\/|\\)/.test(url) || /^\/(?!\/)/.test(url)) return url;
    return "";
}

function remoteAssetValue(value) {
    const url = String(value || "").trim();
    return /^https:\/\//i.test(url) ? url : "";
}

function thresholdLabel(tier) {
    const requirement = tier?.requirement;
    if (requirement?.type === "dmMaps") return "Maps required";
    if (requirement?.type === "placement") return `${humanize(requirement.stat)} required`;
    if (requirement?.type === "flag") return "Required completions";
    return "Unlock threshold";
}

function perMapLabel(tier) {
    return `${humanize(tier?.requirement?.stat || "results")} per map`;
}

function humanize(value) {
    return String(value || "")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function badgeTypeLabel(value) {
    return BADGE_TYPES.find((entry) => entry.value === value)?.label || humanize(value || "Badge");
}

function badgeTypeRank(value) {
    return BADGE_TYPES.findIndex((entry) => entry.value === value);
}

function rarityLabel(value) {
    const rarity = String(value || "common");
    return rarity.charAt(0).toUpperCase() + rarity.slice(1);
}

function renderOptions(options, selected) {
    return options
        .map(
            (option) =>
                `<option value="${escapeHtml(option.value)}" ${option.value === selected ? "selected" : ""}>${escapeHtml(option.label)}</option>`
        )
        .join("");
}
