import {
    WEEKLY_MISSION_DIFFICULTIES,
    WEEKLY_MISSION_METRICS,
    WEEKLY_MISSION_MODES,
    WEEKLY_MISSION_WEAPON_CATEGORIES,
    WEEKLY_MISSION_WEAPON_SCOPES,
    progressionOptionLabel
} from "../config/progression.js";
import { escapeHtml } from "../utils/sanitization.js";

export function renderWeeklyMissionAdminContent({
    ready,
    templates,
    editorId = "",
    creating = false,
    filters = {},
    message = "",
    error = "",
    saving = false
}) {
    if (!ready) {
        return `
            <section class="progression-state error" role="alert">
                <strong>Weekly mission catalog setup is required.</strong>
                <span>${escapeHtml(error || "Run the newest weekly mission manager script, then retry.")}</span>
                <button type="button" data-progression-weekly-retry>Retry</button>
            </section>
        `;
    }

    const editorTemplate = creating
        ? newWeeklyMissionDraft()
        : templates.find((template) => template.id === editorId) || null;
    const visibleTemplates = filterTemplates(templates, filters);
    const activeEasy = templates.filter((template) => template.active && template.difficulty === "easy").length;
    const activeHard = templates.filter((template) => template.active && template.difficulty === "hard").length;

    return `
        ${message ? `<p class="progression-notice">${escapeHtml(message)}</p>` : ""}
        ${error ? `<p class="progression-notice error" role="alert">${escapeHtml(error)}</p>` : ""}
        <section class="progression-metrics" aria-label="Weekly mission pool overview">
            <div><span>Total templates</span><strong>${escapeHtml(templates.length)}</strong></div>
            <div><span>Active easy</span><strong>${escapeHtml(activeEasy)}</strong></div>
            <div><span>Active hard</span><strong>${escapeHtml(activeHard)}</strong></div>
            <div><span>Weekly rotation</span><strong>4 + 3</strong></div>
        </section>
        <section class="progression-catalog-toolbar weekly-template-toolbar">
            <label class="wide"><span>Find mission</span><input type="search" value="${escapeHtml(filters.search || "")}" data-weekly-template-filter="search" placeholder="Name, ID, requirement"></label>
            <label><span>Difficulty</span><select data-weekly-template-filter="difficulty">${renderOptions([{ value: "all", label: "All difficulties" }, ...WEEKLY_MISSION_DIFFICULTIES], filters.difficulty || "all")}</select></label>
            <label class="progression-check"><input type="checkbox" data-weekly-template-show-archived ${filters.showArchived ? "checked" : ""}><span>Show archived</span></label>
            <button type="button" data-weekly-template-new>New mission</button>
        </section>
        <section class="weekly-template-grid" aria-live="polite">
            ${visibleTemplates.length ? visibleTemplates.map(renderWeeklyMissionCard).join("") : `<p class="progression-empty">No weekly missions match these filters.</p>`}
        </section>
        ${editorTemplate ? renderWeeklyMissionEditor(editorTemplate, saving, creating) : ""}
    `;
}

function renderWeeklyMissionCard(template) {
    return `
        <button class="weekly-template-card ${template.active ? "" : "archived"}" type="button" data-weekly-template-open="${escapeHtml(template.id)}">
            <span class="mission-difficulty ${escapeHtml(template.difficulty)}">${escapeHtml(template.difficulty)}</span>
            <strong>${escapeHtml(template.label)}</strong>
            <span>${escapeHtml(template.description)}</span>
            <small>${escapeHtml(weeklyRequirementSummary(template))}</small>
            <small>${escapeHtml(`${template.xp.toLocaleString()} XP / group ${template.family}`)}</small>
        </button>
    `;
}

function renderWeeklyMissionEditor(template, saving, creating) {
    const exactWeapon = template.weaponScope === "exact_weapon";
    const category = template.weaponScope === "weapon_category";
    return `
        <div class="progression-modal-backdrop" data-weekly-template-backdrop>
            <section class="progression-cosmetic-dialog weekly-template-dialog" role="dialog" aria-modal="true" aria-labelledby="weekly-template-editor-title">
                <header class="progression-dialog-header weekly-template-dialog-header">
                    <div class="weekly-template-dialog-mark ${escapeHtml(template.difficulty)}">${escapeHtml(template.difficulty === "hard" ? "H" : "E")}</div>
                    <div>
                        <p class="panel-kicker">Weekly Mission</p>
                        <h3 id="weekly-template-editor-title">${escapeHtml(creating ? "Create mission" : template.label)}</h3>
                        <span>${escapeHtml(creating ? "New rotation template" : weeklyRequirementSummary(template))}</span>
                    </div>
                    <button class="progression-dialog-close" type="button" data-weekly-template-close aria-label="Close weekly mission editor">X</button>
                </header>
                <form class="progression-cosmetic-form weekly-template-form" data-weekly-template-form>
                    <input type="hidden" name="originalId" value="${escapeHtml(creating ? "" : template.id)}">
                    <fieldset>
                        <legend>Mission identity</legend>
                        <div class="progression-editor-fields">
                            <label><span>Template ID</span><input name="templateId" value="${escapeHtml(template.id)}" maxlength="64" pattern="[a-z0-9][a-z0-9_-]{0,63}" ${creating ? "" : "readonly"} required></label>
                            <label><span>Rotation group</span><input name="family" value="${escapeHtml(template.family)}" maxlength="64" pattern="[a-z0-9][a-z0-9_-]{0,63}" required></label>
                            <label><span>Difficulty</span><select name="difficulty">${renderOptions(WEEKLY_MISSION_DIFFICULTIES, template.difficulty)}</select></label>
                            <label><span>Sort order</span><input name="sortOrder" type="number" min="0" max="100000" step="1" value="${escapeHtml(template.sortOrder)}"></label>
                            <label class="wide"><span>Mission name</span><input name="label" value="${escapeHtml(template.label)}" maxlength="80" placeholder="{mode_short} Specialist" required></label>
                            <label class="wide"><span>Description</span><textarea name="description" rows="3" maxlength="240" placeholder="Get 20 kills in {mode}.">${escapeHtml(template.description)}</textarea></label>
                            <label class="progression-check wide"><input type="checkbox" name="active" ${template.active ? "checked" : ""}><span>Active in future rotations and swaps</span></label>
                        </div>
                    </fieldset>
                    <fieldset>
                        <legend>Requirement and reward</legend>
                        <div class="progression-editor-fields">
                            <label><span>Game mode</span><select name="mode">${renderOptions(WEEKLY_MISSION_MODES, template.mode)}</select></label>
                            <label><span>Tracked statistic</span><select name="metric">${renderOptions(WEEKLY_MISSION_METRICS, template.metric)}</select></label>
                            <label><span>Required amount</span><input name="target" type="number" min="1" max="1000000000" step="1" value="${escapeHtml(template.target)}" required></label>
                            <label><span>XP reward</span><input name="xp" type="number" min="1" max="20000" step="1" value="${escapeHtml(template.xp)}" required></label>
                            <label class="wide"><span>Weapon requirement</span><select name="weaponScope" data-weekly-template-weapon-scope>${renderOptions(WEEKLY_MISSION_WEAPON_SCOPES, template.weaponScope)}</select></label>
                            <label class="wide" data-weekly-template-exact-weapon ${exactWeapon ? "" : "hidden"}><span>Weapon ID</span><input name="weaponId" value="${escapeHtml(template.weaponId)}" maxlength="80" placeholder="weapon_internal_id"></label>
                            <label class="wide" data-weekly-template-category ${category ? "" : "hidden"}><span>Weapon category</span><select name="weaponCategory">${renderOptions(WEEKLY_MISSION_WEAPON_CATEGORIES, template.weaponCategory || "rifle")}</select></label>
                        </div>
                    </fieldset>
                    <p class="progression-editor-status" data-weekly-template-status role="status"></p>
                    <footer class="progression-dialog-actions">
                        ${creating ? "" : `<button type="button" data-weekly-template-archive="${escapeHtml(template.id)}">${template.active ? "Archive" : "Restore"}</button>`}
                        ${creating ? "" : `<button class="danger" type="button" data-weekly-template-delete="${escapeHtml(template.id)}">Delete permanently</button>`}
                        <button class="primary" type="submit" ${saving ? "disabled" : ""}>${saving ? "Saving..." : "Save mission"}</button>
                    </footer>
                </form>
            </section>
        </div>
    `;
}

function filterTemplates(templates, filters) {
    const search = String(filters.search || "")
        .trim()
        .toLowerCase();
    const difficulty = filters.difficulty || "all";
    return [...templates]
        .filter((template) => filters.showArchived || template.active)
        .filter((template) => difficulty === "all" || template.difficulty === difficulty)
        .filter(
            (template) =>
                !search ||
                [
                    template.id,
                    template.family,
                    template.label,
                    template.description,
                    template.metric,
                    template.mode,
                    template.weaponId,
                    template.weaponCategory
                ].some((value) =>
                    String(value || "")
                        .toLowerCase()
                        .includes(search)
                )
        )
        .sort(
            (a, b) =>
                Number(b.active) - Number(a.active) ||
                difficultyRank(a.difficulty) - difficultyRank(b.difficulty) ||
                a.sortOrder - b.sortOrder ||
                a.label.localeCompare(b.label)
        );
}

function weeklyRequirementSummary(template) {
    const mode = progressionOptionLabel(WEEKLY_MISSION_MODES, template.mode);
    const metric = progressionOptionLabel(WEEKLY_MISSION_METRICS, template.metric);
    const scope = progressionOptionLabel(WEEKLY_MISSION_WEAPON_SCOPES, template.weaponScope);
    const weapon = template.weaponScope === "none" ? "" : ` / ${scope}`;
    return `${mode} / ${metric} ${template.target}${weapon}${template.active ? "" : " / archived"}`;
}

function newWeeklyMissionDraft() {
    return {
        id: "",
        family: "",
        difficulty: "easy",
        label: "",
        description: "",
        metric: "games",
        target: 1,
        xp: 300,
        mode: "overall",
        weaponScope: "none",
        weaponId: "",
        weaponCategory: "rifle",
        active: true,
        sortOrder: 0
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

function difficultyRank(value) {
    return value === "easy" ? 0 : 1;
}
