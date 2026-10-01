import { createNetworkAdminApi } from "../api/network-admin.js";
import { escapeHtml as esc } from "../utils/sanitization.js";
import { renderReplayUploadForm, replayMetadataFromForm } from "../match/replay-admin-form.js";

const modes = {
    battleRoyale: "Battle Royale",
    teamDeathmatch: "Team Deathmatch",
    freeForAll: "Free For All",
    duel: "Duels",
    zombieSurvival: "Zombie Survival"
};
const date = (value) => (value ? new Date(value).toLocaleString() : "-");
const raw = (value) => `<pre>${esc(JSON.stringify(value, null, 2))}</pre>`;
const delta = (value) => `${value > 0 ? "+" : ""}${value}`;
const table = (head, rows) =>
    `<div class="admin-table-scroll"><table><thead><tr>${head.map((label) => `<th>${esc(label)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
export function renderMatchList(page) {
    return table(
        ["Match", "Started", "Backend", "Mode / Map", "Players", "State", "Replay", "Warnings"],
        page.matches.map(
            (m) => `<tr>
        <td><button type="button" class="admin-match-link" data-match-open="${esc(m.match_id)}">${esc(m.match_id)}</button></td>
        <td>${esc(date(m.started_at))}</td><td>${esc(m.server_id)}</td><td>${esc(modes[m.mode] || m.mode)}<br>${esc(m.map_id)}</td>
        <td>${esc(m.player_count)}</td><td><span class="match-state ${esc(m.state.toLowerCase())}">${esc(m.state)}</span></td>
        <td>${m.replay_count ? esc(m.replay_count) : "Unavailable"}</td><td>${m.retries ? `${esc(m.retries)} retries` : ""}${m.reconnect_incidents ? ` ${esc(m.reconnect_incidents)} reconnect incidents` : ""}</td>
    </tr>`
        )
    );
}
export function renderMatchDetail(frame) {
    const m = frame.match;
    return `<header class="admin-match-heading"><div><h1>${esc(modes[m.mode] || m.mode)} / ${esc(m.map_id)}</h1>
        <p><code>${esc(m.match_id)}</code></p><p>${esc(m.server_id)} &middot; TEST &middot; ${esc(m.state)}</p>
        <p>${esc(date(m.started_at))} &rarr; ${esc(date(m.ended_at))}</p></div>
        ${["COMPLETED", "VOIDED"].includes(m.state) ? `<button type="button" data-match-preview="${m.state === "COMPLETED" ? "VOIDED" : "COMPLETED"}">${m.state === "COMPLETED" ? "Void Match" : "Restore Match"}</button>` : ""}</header>
        <h2>Players (${frame.players.length})</h2>${table(
            ["Player / UUID", "Raw Result", "Contribution"],
            frame.players.map(
                (p) => `<tr><td>${esc(p.name)}<br><code>${esc(p.playerUuid)}</code></td>
            <td>${raw(p.raw)}</td><td>${raw(p.contribution)}</td></tr>`
            )
        )}
        <h2>Replays</h2>${
            frame.replays.length
                ? `<ul>${frame.replays
                      .filter((r) => !(frame.recordings || []).some((file) => file.replay_id === r.artifact_id))
                      .map(
                          (r) => `<li>${esc(r.kind || "Replay")} &middot; ${esc(r.recorder_player_uuid || "Server")}
            ${r.available ? `<button type="button" data-replay-open="${esc(r.artifact_id)}">Open replay</button>` : "Replay unavailable"}</li>`
                      )
                      .join("")}</ul>`
                : (frame.recordings || []).length
                  ? ""
                  : "<p>Replay unavailable</p>"
        }
        ${
            (frame.recordings || []).length
                ? `<ul>${frame.recordings
                      .map(
                          (
                              r
                          ) => `<li>${esc(r.label || r.file_name)} &middot; ${esc(r.recorder_name || "Administrator perspective")}
            <button type="button" data-recording-download="${esc(r.replay_id)}">Download Replay Mod File</button><code>${esc(r.sha256)}</code></li>`
                      )
                      .join("")}</ul>`
                : ""
        }
        ${["COMPLETED", "VOIDED"].includes(m.state) ? `<details><summary>Attach Replay Mod File</summary>${renderReplayUploadForm({ participants: frame.players })}</details>` : ""}
        <details><summary>Disconnect / Reconnect Incidents (${frame.incidents.length})</summary>${raw(frame.incidents)}</details>
        <details><summary>Finalization / Retry</summary>${raw(frame.finalization)}</details>
        <details><summary>Audit (${frame.operations.length})</summary>${raw(frame.operations)}</details>`;
}
export function renderVoidImpact(impact) {
    return `<h2>${impact.targetState === "VOIDED" ? "Void" : "Restore"} Match</h2><p><code>${esc(impact.matchId)}</code> &middot; TEST</p>
        <p>History: ${impact.history.beforeVisible ? "Visible" : "Hidden"} &rarr; ${impact.history.afterVisible ? "Visible" : "Hidden"}.
        Replays (${esc(impact.replay.artifactCount)}): ${impact.replay.beforeVisible ? "Visible" : "Hidden"} &rarr; ${impact.replay.afterVisible ? "Visible" : "Hidden"}.</p>
        ${impact.players
            .map(
                (p) => `<section class="admin-player-impact"><h3>${esc(p.name)}</h3><code>${esc(p.playerUuid)}</code>
            ${
                p.progression
                    ? `<p>XP ${esc(p.progression.xp.before)} &rarr; ${esc(p.progression.xp.after)} (${esc(delta(p.progression.xp.delta))})
                &middot; Level ${esc(p.progression.level.before)} &rarr; ${esc(p.progression.level.after)}</p>`
                    : ""
            }
            ${
                p.stats.length
                    ? table(
                          ["Stat / Streak", "Before", "After", "Change"],
                          p.stats.map(
                              (s) =>
                                  `<tr><td>${esc(s.field)}</td><td>${esc(s.before)}</td><td>${esc(s.after)}</td><td>${esc(delta(s.delta))}</td></tr>`
                          )
                      )
                    : "<p>No aggregate changes</p>"
            }
            <details><summary>Achievements</summary>${raw(p.achievementIds)}</details>
            ${
                p.progression
                    ? `<details><summary>Missions (${p.progression.changedMissions.length})</summary>${raw(p.progression.changedMissions)}${raw(p.progression.changedClaims)}</details>
                <details><summary>Badges (${p.progression.changedBadges.length})</summary>${raw(p.progression.changedBadges)}</details>
                <h4>Revoked Rewards / Unlocks</h4>${p.progression.revokedEntitlements.length ? raw(p.progression.revokedEntitlements) : "<p>None</p>"}
                ${p.progression.addedEntitlements.length ? `<h4>Restored Rewards / Unlocks</h4>${raw(p.progression.addedEntitlements)}` : ""}`
                    : ""
            }</section>`
            )
            .join("")}`;
}
export function createAdminMatchPage(host, { apiFactory = createNetworkAdminApi } = {}) {
    let identity = "",
        api,
        sequence = 0,
        busy = false,
        loaded = false,
        page = { matches: [] },
        frame = null,
        preview = null,
        error = "",
        limit = 50,
        search = "",
        before = null,
        history = [];
    const viewerHost = document.createElement("section");
    let viewer = null,
        viewerLoading = null,
        selectedArtifact = null;
    let links = null;
    async function openReplay(artifactId) {
        selectedArtifact = artifactId;
        viewer?.close();
        paint();
        if (!viewerLoading)
            viewerLoading = Promise.all([
                import("../match/match-detail.js"),
                import("../match/match-telemetry-normalizer.js")
            ]).then(([page, normalizer]) => {
                viewer = page.createMatchDetailPage({
                    container: viewerHost,
                    api: {
                        load: async (id) =>
                            normalizer.normalizeMatchTelemetry(await api.replay(id, selectedArtifact), id)
                    },
                    getBackHref: () => `/admin/matches/?match=${encodeURIComponent(frame.match.match_id)}`
                });
            });
        try {
            await viewerLoading;
            if (selectedArtifact === artifactId && frame && api)
                await viewer.open(frame.match.match_id, { force: true });
        } catch (e) {
            error = e.message;
            paint();
        }
    }
    function paint() {
        host.innerHTML = `<div class="admin-match-controls"><button type="button" data-match-back ${!frame && !history.length ? "disabled" : ""} title="Back">&larr;</button>
            <h1>${frame ? "Match" : "Matches"}</h1><span class="match-state">TEST</span><button type="button" data-match-refresh title="Refresh" aria-label="Refresh">&#8635;</button>
            ${
                !frame
                    ? `<form data-match-search><input name="search" aria-label="Search matches" maxlength="160" value="${esc(search)}" placeholder="Match / backend / mode / map">
                <select name="limit" aria-label="Page size"><option value="50" ${limit === 50 ? "selected" : ""}>50</option><option value="100" ${limit === 100 ? "selected" : ""}>100</option></select><button type="submit">Search</button></form>`
                    : ""
            }</div>
            ${error ? `<p role="alert" class="admin-match-error">${esc(error)}</p>` : ""}${busy ? '<p role="status">Loading...</p>' : ""}
            ${frame ? renderMatchDetail(frame) : renderMatchList(page)}
            ${
                !frame
                    ? `<details><summary>TEST Account Links</summary>
                <button type="button" data-account-links>Load Accounts</button>
                ${
                    links
                        ? `<form data-account-link><label>Account <select name="accountId" required>
                    ${links.accounts.map((a) => `<option value="${esc(a.accountId)}">${esc(a.name)} (${esc(a.accountId)})${a.playerUuid ? ` / ${esc(a.playerUuid)}` : ""}</option>`).join("")}</select></label>
                    <label>Minecraft UUID <input name="playerUuid" required pattern="[0-9a-fA-F-]{36}" list="test-player-uuids"></label>
                    <datalist id="test-player-uuids">${links.players.map((p) => `<option value="${esc(p.playerUuid)}">${esc(p.name)}</option>`).join("")}</datalist>
                    <label><input type="checkbox" required> Confirm this TEST UUID association</label><button type="submit">Link Account</button></form>`
                        : ""
                }</details>`
                    : ""
            }
            ${!frame ? `<button type="button" data-match-next ${page.matches.length < limit ? "disabled" : ""}>Next Page &rarr;</button>` : ""}
            ${
                preview
                    ? `<dialog class="admin-void-dialog"><form data-match-confirm>${renderVoidImpact(preview.impact)}
                <label>Reason <textarea name="reason" maxlength="1024" ${preview.submitted ? "readonly" : ""}>${esc(preview.reason || "")}</textarea></label>
                <label class="admin-confirm-checkbox"><input type="checkbox" required> Confirm ${preview.impact.targetState === "VOIDED" ? "void" : "restore"} for this match</label>
                <p role="alert">${esc(error)}</p><div class="admin-confirm-actions"><button type="button" data-match-cancel>Cancel</button>
                <button type="submit" ${busy ? "disabled" : ""}>${preview.submitted ? "Retry Confirmation" : "Confirm"}</button></div></form></dialog>`
                    : ""
            }`;
        if (preview) host.querySelector("dialog")?.showModal();
        if (selectedArtifact && frame) host.append(viewerHost);
        host.querySelectorAll("button").forEach((button) => {
            if (busy) button.disabled = true;
        });
    }
    async function perform(operation) {
        if (busy) return;
        busy = true;
        error = "";
        const current = ++sequence;
        paint();
        try {
            await operation(current);
        } catch (e) {
            if (current === sequence) error = e.message || "Operation unavailable. Retry.";
        } finally {
            if (current === sequence) {
                busy = false;
                paint();
            }
        }
    }
    const load = async (current) => {
        const id = new URLSearchParams(window.location.search).get("match");
        const result = id ? await api.detail(id) : await api.list({ limit, before, search });
        if (current !== sequence) return;
        if (id) frame = result;
        else {
            frame = null;
            page = result;
        }
        loaded = true;
    };
    function open(id) {
        const url = new URL(window.location.href);
        if (id) url.searchParams.set("match", id);
        else url.searchParams.delete("match");
        window.history.replaceState(null, "", url);
        preview = null;
        void perform(load);
        viewer?.close();
        selectedArtifact = null;
    }
    host.addEventListener("click", (event) => {
        const button = event.target.closest("button");
        if (!button || busy || !api) return;
        if (button.hasAttribute("data-match-open")) open(button.dataset.matchOpen);
        else if (button.hasAttribute("data-match-back")) {
            if (frame) open(null);
            else {
                before = history.pop() || null;
                void perform(load);
            }
        } else if (button.hasAttribute("data-match-refresh")) {
            preview = null;
            void perform(load);
        } else if (button.hasAttribute("data-match-next")) {
            const last = page.matches.at(-1);
            if (!last) return;
            history.push(before);
            before = { at: last.at, matchId: last.match_id };
            void perform(load);
        } else if (button.hasAttribute("data-match-preview")) {
            void perform(async (current) => {
                const result = await api.preview(frame.match.match_id, button.dataset.matchPreview);
                if (current === sequence) preview = result;
            });
        } else if (button.hasAttribute("data-match-cancel")) {
            preview = null;
            error = "";
            paint();
        } else if (button.hasAttribute("data-replay-open")) void openReplay(button.dataset.replayOpen);
        else if (button.hasAttribute("data-recording-download"))
            void perform(async () => {
                const result = await api.downloadRecording(frame.match.match_id, button.dataset.recordingDownload);
                if (!/^https:\/\//i.test(result.url || "")) throw new Error("Signed replay download unavailable.");
                const anchor = document.createElement("a");
                anchor.href = result.url;
                anchor.download = "";
                anchor.rel = "noopener";
                anchor.click();
            });
        else if (button.hasAttribute("data-account-links"))
            void perform(async (current) => {
                const result = await api.accountLinks();
                if (current === sequence) links = result;
            });
    });
    host.addEventListener("submit", (event) => {
        event.preventDefault();
        if (busy || !api) return;
        const data = new FormData(event.target);
        if (event.target.hasAttribute("data-match-search")) {
            search = String(data.get("search") || "");
            limit = Number(data.get("limit"));
            before = null;
            history = [];
            void perform(load);
        } else if (event.target.hasAttribute("data-account-link")) {
            void perform(async (current) => {
                await api.linkAccount(String(data.get("accountId")), String(data.get("playerUuid")).toLowerCase());
                const result = await api.accountLinks();
                if (current === sequence) links = result;
            });
        } else if (event.target.hasAttribute("data-replay-upload-form") && frame) {
            const file = event.target.elements.replay.files?.[0],
                metadata = replayMetadataFromForm(event.target);
            void perform(async (current) => {
                await api.uploadRecording(frame.match.match_id, file, metadata);
                if (current === sequence) await load(current);
            });
        } else if (event.target.hasAttribute("data-match-confirm") && preview) {
            preview.reason = String(data.get("reason") || "");
            preview.submitted = true;
            void perform(async (current) => {
                await api.confirm(frame.match.match_id, preview.confirmation, preview.reason);
                if (current === sequence) {
                    preview = null;
                    await load(current);
                }
            });
        }
    });
    host.addEventListener(
        "cancel",
        () => {
            if (!busy) preview = null;
        },
        true
    );
    return {
        render({ client, ready, admin, accountId }) {
            if (!ready || !admin || !client) {
                sequence++;
                identity = "";
                api = null;
                loaded = false;
                busy = false;
                preview = null;
                frame = null;
                page = { matches: [] };
                links = null;
                viewer?.close();
                selectedArtifact = null;
                host.innerHTML = `<h1>Matches</h1><p>${!ready ? "Checking administrator access..." : "Administrator sign-in required."}</p>`;
                return;
            }
            if (identity !== accountId) {
                sequence++;
                identity = accountId;
                api = apiFactory(client);
                loaded = false;
                frame = null;
                preview = null;
                busy = false;
                links = null;
            }
            if (!loaded && !busy) void perform(load);
        }
    };
}
