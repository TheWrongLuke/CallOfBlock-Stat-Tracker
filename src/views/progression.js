import {
    COSMETIC_ACQUISITION_TYPES,
    PROGRESSION_METRICS,
    PROGRESSION_MODES,
    progressionOptionLabel
} from "../config/progression.js";
import { escapeHtml } from "../utils/sanitization.js";
import { renderPlayerManagerContent } from "./player-manager.js";
import { renderWeeklyMissionAdminContent } from "./weekly-mission-admin.js";

const COSMETIC_TYPES = Object.freeze([
    { value: "background", label: "Background" },
    { value: "border", label: "Icon border" },
    { value: "icon", label: "Profile icon" },
    { value: "title", label: "Title" }
]);
const RARITIES = Object.freeze(["common", "rare", "epic", "legendary", "mythic"]);
export function renderProgressionAdminContent({
    loading,
    ready,
    catalog,
    rules,
    grants,
    editorKey = "",
    creating = false,
    filters = {},
    section = "cosmetics",
    weekly = {},
    player = {},
    message,
    error,
    saving
}) {
    if (loading) return renderState("Loading progression controls...");
    const sectionTabs = renderManagerTabs(section);
    if (section === "weekly") {
        return `${sectionTabs}${renderWeeklyMissionAdminContent(weekly)}`;
    }
    if (section === "players") {
        return `${sectionTabs}${renderPlayerManagerContent(player)}`;
    }
    if (!ready) {
        return `
            ${sectionTabs}
            <section class="progression-state error" role="alert">
                <strong>Progression database setup is required.</strong>
                <span>${escapeHtml(error || "Run the newest Supabase cosmetic manager script, then retry.")}</span>
                <button type="button" data-progression-retry>Retry</button>
            </section>
        `;
    }

    const editorItem = creating ? newCosmeticDraft() : catalog.find((item) => cosmeticKey(item) === editorKey) || null;
    const editorRule = editorItem
        ? rules.find((rule) => ruleKey(rule) === cosmeticKey(editorItem)) || editorItem.inferredRule || null
        : null;
    const visibleCatalog = filterCatalog(catalog, filters);
    const activeRules = rules.filter((rule) => rule.active).length;
    const uniqueOwners = new Set(grants.map((grant) => grant.profile_id)).size;

    return `
        ${sectionTabs}
        ${message ? `<p class="progression-notice">${escapeHtml(message)}</p>` : ""}
        ${error ? `<p class="progression-notice error" role="alert">${escapeHtml(error)}</p>` : ""}
        <section class="progression-metrics" aria-label="Progression overview">
            <div><span>All cosmetics</span><strong>${escapeHtml(catalog.length)}</strong></div>
            <div><span>Active missions</span><strong>${escapeHtml(activeRules)}</strong></div>
            <div><span>Ownership records</span><strong>${escapeHtml(grants.length)}</strong></div>
            <div><span>Profiles with items</span><strong>${escapeHtml(uniqueOwners)}</strong></div>
        </section>
        <section class="progression-catalog-toolbar">
            <label class="wide"><span>Find cosmetic</span><input type="search" value="${escapeHtml(filters.search || "")}" data-progression-filter="search" placeholder="Name, ID, category"></label>
            <label><span>Type</span><select data-progression-filter="type">${renderOptions([{ value: "all", label: "All types" }, ...COSMETIC_TYPES], filters.type || "all")}</select></label>
            <label class="progression-check"><input type="checkbox" data-progression-show-archived ${filters.showArchived ? "checked" : ""}><span>Show archived</span></label>
            <button type="button" data-progression-cosmetic-new>New cosmetic</button>
        </section>
        <section class="progression-catalog-grid" aria-live="polite">
            ${visibleCatalog.length ? visibleCatalog.map((item) => renderCosmeticCard(item, rules, grants)).join("") : `<p class="progression-empty">No cosmetics match these filters.</p>`}
        </section>
        ${editorItem ? renderCosmeticEditorModal(editorItem, editorRule, grants, saving, creating) : ""}
    `;
}

function renderManagerTabs(section) {
    return `
        <nav class="progression-manager-tabs" aria-label="Progression manager sections">
            <button type="button" data-progression-section="cosmetics" aria-current="${section === "cosmetics" ? "page" : "false"}">Cosmetics</button>
            <button type="button" data-progression-section="weekly" aria-current="${section === "weekly" ? "page" : "false"}">Weekly missions</button>
            <button type="button" data-progression-section="players" aria-current="${section === "players" ? "page" : "false"}">Player Manager</button>
        </nav>
    `;
}

function renderCosmeticCard(item, rules, grants) {
    const key = cosmeticKey(item);
    const rule = rules.find((entry) => ruleKey(entry) === key) || item.inferredRule || null;
    const acquisition = progressionOptionLabel(COSMETIC_ACQUISITION_TYPES, item.acquisitionType, "Exclusive");
    const owners = new Set(grants.filter((grant) => ruleKey(grant) === key).map((grant) => grant.profile_id)).size;
    return `
        <button class="progression-cosmetic-card rarity-${escapeHtml(item.rarity)} ${item.active ? "" : "archived"}" type="button" data-progression-cosmetic-open="${escapeHtml(key)}">
            <span class="progression-cosmetic-preview">${renderCosmeticPreview(item)}</span>
            <span class="progression-cosmetic-copy">
                <small>${escapeHtml(`${typeLabel(item.type)} / ${rarityLabel(item.rarity)}`)}</small>
                <strong>${escapeHtml(item.name || item.label || item.id)}</strong>
                <span>${escapeHtml(item.active ? acquisition : "Archived")}</span>
                <small>${escapeHtml(ruleSummary(rule, item.acquisitionType))}</small>
                <small>${escapeHtml(`${owners} ownership record${owners === 1 ? "" : "s"}${item.builtIn ? " / built-in" : ""}`)}</small>
            </span>
        </button>
    `;
}

function renderCosmeticEditorModal(item, rule, grants, saving, creating) {
    const key = cosmeticKey(item);
    const owners = new Set(grants.filter((grant) => ruleKey(grant) === key).map((grant) => grant.profile_id)).size;
    const acquisition = item.acquisitionType || "exclusive";
    const price = (Math.max(0, Number(item.unitAmount) || 0) / 100).toFixed(2);
    const usesAsset = item.type !== "title";
    const usesTitleText = item.type === "title";
    const usesBorderInset = item.type === "border";
    const timeLimited = Boolean(item.availableFrom || item.availableUntil);
    const countLimited = Number(item.supplyLimit) > 0;
    return `
        <div class="progression-modal-backdrop" data-progression-editor-backdrop>
            <section class="progression-cosmetic-dialog" role="dialog" aria-modal="true" aria-labelledby="progression-editor-title">
                <header class="progression-dialog-header">
                    <div class="progression-dialog-preview">${renderCosmeticPreview(item)}</div>
                    <div>
                        <p class="panel-kicker">${creating ? "New Cosmetic" : escapeHtml(typeLabel(item.type))}</p>
                        <h3 id="progression-editor-title">${escapeHtml(creating ? "Create cosmetic" : item.name || item.id)}</h3>
                        <span>${escapeHtml(creating ? "Configure the catalog item and its ownership rule." : `${owners} current ownership record${owners === 1 ? "" : "s"}`)}</span>
                    </div>
                    <button class="progression-dialog-close" type="button" data-progression-cosmetic-close aria-label="Close cosmetic editor">X</button>
                </header>
                <form class="progression-cosmetic-form" data-progression-cosmetic-form>
                    <input type="hidden" name="originalKey" value="${escapeHtml(creating ? "" : key)}">
                    <input type="hidden" name="builtIn" value="${item.builtIn ? "true" : "false"}">
                    <fieldset>
                        <legend>Catalog identity</legend>
                        <div class="progression-editor-fields">
                            <label><span>Type</span><select name="cosmeticType" data-progression-cosmetic-type ${creating ? "" : "disabled"}>${renderOptions(COSMETIC_TYPES, item.type)}</select>${creating ? "" : `<input type="hidden" name="cosmeticType" value="${escapeHtml(item.type)}">`}</label>
                            <label><span>Cosmetic ID</span><input name="cosmeticId" value="${escapeHtml(item.id)}" maxlength="64" pattern="[a-z0-9][a-z0-9_-]{0,63}" ${creating ? "" : "readonly"} required></label>
                            <label class="wide"><span>Name</span><input name="name" value="${escapeHtml(item.name || item.label || "")}" maxlength="80" required></label>
                            <label><span>Category</span><input name="category" value="${escapeHtml(item.category || "Default")}" maxlength="40" required></label>
                            <label><span>Rarity</span><select name="rarity">${renderOptions(
                                RARITIES.map((value) => ({ value, label: rarityLabel(value) })),
                                item.rarity || "common"
                            )}</select></label>
                            <label class="wide"><span>Description</span><textarea name="description" rows="3" maxlength="300">${escapeHtml(item.description || "")}</textarea></label>
                            <div class="progression-editor-fields progression-type-fields" data-progression-asset-fields ${usesAsset ? "" : "hidden"}>
                                <label class="wide"><span>Asset URL</span><input name="imageUrl" value="${escapeHtml(item.image || "")}" maxlength="1000" placeholder="PNG, WebP or GIF URL"></label>
                                <label class="wide"><span>Replace asset</span><input type="file" name="asset" accept="image/png,image/webp,image/gif" data-progression-asset-input><small>PNG, WebP or GIF, maximum 8 MB.</small></label>
                            </div>
                            <div class="progression-editor-fields progression-type-fields" data-progression-title-fields ${usesTitleText ? "" : "hidden"}>
                                <label class="wide"><span>Title text</span><input name="titleText" value="${escapeHtml(item.text || item.name || "")}" maxlength="48"></label>
                            </div>
                            <div class="progression-editor-fields progression-type-fields" data-progression-border-fields ${usesBorderInset ? "" : "hidden"}>
                                <label class="wide"><span>Border inset %</span><input name="borderInset" type="number" min="0" max="30" step="0.5" value="${escapeHtml(item.inset || 0)}"></label>
                            </div>
                            <label><span>Sort order</span><input name="sortOrder" type="number" min="0" max="100000" step="1" value="${escapeHtml(item.sortOrder || 0)}"></label>
                            <label class="progression-check"><input type="checkbox" name="active" ${item.active !== false ? "checked" : ""}><span>Active and visible</span></label>
                        </div>
                    </fieldset>
                    <fieldset>
                        <legend>How players get it</legend>
                        <div class="progression-editor-fields">
                            <label class="wide"><span>Ownership method</span><select name="acquisitionType" data-progression-acquisition>${renderOptions(COSMETIC_ACQUISITION_TYPES, acquisition)}</select></label>
                        </div>
                        <div class="progression-mission-fields" data-progression-mission-fields ${acquisition === "progression" ? "" : "hidden"}>
                            <label><span>Game mode</span><select name="mode">${renderOptions(PROGRESSION_MODES, rule?.mode || "overall")}</select></label>
                            <label><span>Tracked requirement</span><select name="metric">${renderOptions(PROGRESSION_METRICS, rule?.metric || "games")}</select></label>
                            <label><span>Required amount</span><input name="target" type="number" min="0.01" max="1000000000" step="0.01" value="${escapeHtml(rule?.target || 1)}"></label>
                            <label class="progression-check"><input type="checkbox" name="ruleActive" ${rule?.active !== false ? "checked" : ""}><span>Mission active</span></label>
                            <p class="wide">Saving creates or replaces this cosmetic's unlock mission, then checks every account against the new requirement.</p>
                        </div>
                        <div class="progression-store-fields" data-progression-store-fields ${acquisition === "store" ? "" : "hidden"}>
                            <label><span>Preview price</span><input name="shopPrice" type="number" min="0.01" max="10000" step="0.01" value="${escapeHtml(price)}"></label>
                            <label><span>Currency</span><select name="shopCurrency">${renderOptions(
                                ["eur", "usd", "gbp"].map((value) => ({ value, label: value.toUpperCase() })),
                                item.currency || "eur"
                            )}</select></label>
                            <label class="progression-check wide"><input type="checkbox" name="timeLimited" data-progression-time-limit ${timeLimited ? "checked" : ""}><span>Time-limited sale</span></label>
                            <div class="progression-store-limit-fields wide" data-progression-time-fields ${timeLimited ? "" : "hidden"}>
                                <label><span>Available from</span><input name="availableFrom" type="datetime-local" value="${escapeHtml(dateTimeInputValue(item.availableFrom))}" ${acquisition === "store" && timeLimited ? "required" : ""}></label>
                                <label><span>Available until</span><input name="availableUntil" type="datetime-local" value="${escapeHtml(dateTimeInputValue(item.availableUntil))}" ${acquisition === "store" && timeLimited ? "required" : ""}></label>
                            </div>
                            <label class="progression-check wide"><input type="checkbox" name="countLimited" data-progression-count-limit ${countLimited ? "checked" : ""}><span>Limited quantity</span></label>
                            <div class="progression-store-limit-fields wide" data-progression-count-fields ${countLimited ? "" : "hidden"}>
                                <label class="wide"><span>Available copies</span><input name="supplyLimit" type="number" min="1" max="100000000" step="1" value="${escapeHtml(item.supplyLimit || "")}" ${acquisition === "store" && countLimited ? "required" : ""}></label>
                            </div>
                            <label class="progression-check"><input type="checkbox" name="shopFeatured" ${item.featured ? "checked" : ""}><span>Featured listing</span></label>
                        </div>
                    </fieldset>
                    <p class="progression-editor-status" data-progression-editor-status role="status"></p>
                    <footer class="progression-dialog-actions">
                        ${creating ? "" : `<button type="button" data-progression-cosmetic-archive="${escapeHtml(key)}">${item.active ? "Archive" : "Restore"}</button>`}
                        ${creating || item.builtIn ? "" : `<button class="danger" type="button" data-progression-cosmetic-delete="${escapeHtml(key)}">Delete permanently</button>`}
                        <button class="primary" type="submit" ${saving ? "disabled" : ""}>${saving ? "Saving and checking accounts..." : "Save and reconcile ownership"}</button>
                    </footer>
                </form>
            </section>
        </div>
    `;
}

function filterCatalog(catalog, filters) {
    const search = String(filters.search || "")
        .trim()
        .toLowerCase();
    const type = filters.type || "all";
    return catalog
        .filter((item) => filters.showArchived || item.active)
        .filter((item) => type === "all" || item.type === type)
        .filter(
            (item) =>
                !search ||
                [item.name, item.id, item.category, item.description].some((value) =>
                    String(value || "")
                        .toLowerCase()
                        .includes(search)
                )
        )
        .sort(
            (a, b) =>
                Number(b.active) - Number(a.active) ||
                a.type.localeCompare(b.type) ||
                a.sortOrder - b.sortOrder ||
                a.name.localeCompare(b.name)
        );
}

function renderCosmeticPreview(item) {
    if (item.type === "title")
        return `<span class="profile-title-cosmetic rarity-${escapeHtml(item.rarity || "common")}">${escapeHtml(item.text || item.name || "Title")}</span>`;
    const imageUrl = cosmeticAssetUrl(item.image);
    if (imageUrl) return `<img src="${escapeHtml(imageUrl)}" alt="" loading="lazy">`;
    const sourceLabel =
        item.source === "discord" ? "Discord" : item.source === "minecraft" ? "Minecraft" : typeLabel(item.type);
    return `<span class="progression-preview-placeholder">${escapeHtml(sourceLabel)}</span>`;
}

function cosmeticAssetUrl(value) {
    const url = String(value || "").trim();
    if (/^https:\/\//i.test(url) || /^\.\.?(?:\/|\\)/.test(url) || /^\/(?!\/)/.test(url)) return url;
    return "";
}

function ruleSummary(rule, acquisitionType) {
    if (acquisitionType !== "progression")
        return acquisitionType === "default" ? "Automatically owned" : "No automatic mission";
    if (!rule) return "Mission not configured";
    const mode = progressionOptionLabel(PROGRESSION_MODES, rule.mode);
    const metric = progressionOptionLabel(PROGRESSION_METRICS, rule.metric);
    return `${mode}: ${metric} ${rule.target}${rule.active === false ? " / inactive" : ""}`;
}

function newCosmeticDraft() {
    return {
        type: "background",
        id: "",
        name: "",
        description: "",
        category: "Default",
        rarity: "common",
        image: "",
        text: "",
        inset: 0,
        active: true,
        acquisitionType: "exclusive",
        availableFrom: "",
        availableUntil: "",
        supplyLimit: null,
        unitAmount: 0,
        currency: "eur",
        featured: false,
        sortOrder: 0,
        builtIn: false,
        remoteCatalog: false
    };
}

function renderOptions(options, selected) {
    return options
        .map(
            (option) =>
                `<option value="${escapeHtml(option.value)}" ${option.value === selected ? "selected" : ""}>${escapeHtml(option.label)}</option>`
        )
        .join("");
}

function cosmeticKey(item) {
    return `${item?.type || item?.cosmetic_type || ""}:${item?.id || item?.cosmetic_id || ""}`;
}

function ruleKey(value) {
    return `${value?.cosmetic_type || value?.type || ""}:${value?.cosmetic_id || value?.id || ""}`;
}

function typeLabel(type) {
    return COSMETIC_TYPES.find((entry) => entry.value === type)?.label || type || "Cosmetic";
}

function rarityLabel(rarity) {
    const value = String(rarity || "common");
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function dateTimeInputValue(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
}

function renderState(message) {
    return `<section class="progression-state" aria-busy="true"><strong>${escapeHtml(message)}</strong></section>`;
}
