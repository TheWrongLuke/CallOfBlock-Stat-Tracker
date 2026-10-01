import { escapeHtml as esc } from "../utils/sanitization.js";
export function renderReplayUploadForm({ participants = [] } = {}) {
    return `<form class="match-replay-admin" data-replay-upload-form>
        <h4>Attach administrator replay</h4>
        <label>Replay file <input type="file" name="replay" accept=".mcpr,application/zip" required></label>
        <label>Label <input type="text" name="label" maxlength="80" placeholder="Admin cinematic perspective" required></label>
        ${
            participants.length
                ? `<label>Recorder <select name="recorderPlayerUuid"><option value="">Administrator perspective</option>
            ${participants.map((p) => `<option value="${esc(p.playerUuid)}">${esc(p.name)} (${esc(p.playerUuid)})</option>`).join("")}</select></label>`
                : ""
        }
        <label>Recorder name <input type="text" name="recorderName" maxlength="64"></label>
        <label>Visibility <select name="visibility"><option value="participants">Participants</option>
            <option value="community">Community</option><option value="public">Public</option></select></label>
        <label>Replay Mod version <input type="text" name="replayModVersion" maxlength="32"></label>
        <label>Modpack version <input type="text" name="modpackVersion" maxlength="32"></label>
        <label>Notes <textarea name="notes" maxlength="500"></textarea></label>
        <label><input type="checkbox" name="mayContainChat" checked> May contain chat</label>
        <button type="submit">Upload replay</button></form>`;
}
export function replayMetadataFromForm(form) {
    const text = (name) => String(form.elements[name]?.value || "").trim();
    return {
        label: text("label"),
        recorderName: text("recorderName"),
        visibility: text("visibility"),
        minecraftVersion: "1.20.1",
        replayModVersion: text("replayModVersion"),
        modpackVersion: text("modpackVersion"),
        notes: text("notes"),
        mayContainChat: form.elements.mayContainChat?.checked === true,
        ...(form.elements.recorderPlayerUuid ? { recorderPlayerUuid: text("recorderPlayerUuid") || null } : {})
    };
}
