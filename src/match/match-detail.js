import { MatchMapRenderer } from "./match-map-renderer.js";
import { MatchPlaybackController } from "./match-playback-controller.js";
import { validateMatchTelemetry } from "./match-telemetry-normalizer.js";

const FILTER_LABELS = {
    engagements: "Engagements",
    eliminations: "Eliminations",
    vehicles: "Vehicles",
    zone: "Zone events",
    streaks: "Streaks",
    respawns: "Respawns"
};

export function createMatchDetailPage({
    container,
    api,
    replayApi,
    getSummary = () => null,
    getActivePlayerId = () => "",
    getBackHref = () => "#view=leaderboards&board=players&mode=battleRoyale&sort=wins",
    getPlayerPresentation = () => ({}),
    isAdmin = () => false,
    isAuthenticated = () => false
}) {
    let activeMatchId = "";
    let activePlayerId = "";
    let summary = null;
    let telemetry = null;
    let playback = null;
    let mapRenderer = null;
    let requestToken = 0;
    let replayState = { loading: false, available: null, replays: [], error: "", message: "" };

    container.addEventListener("click", handleClick);
    container.addEventListener("change", handleChange);
    container.addEventListener("input", handleInput);
    container.addEventListener("submit", handleSubmit);
    container.addEventListener("keydown", handleKeyDown);

    return {
        open,
        close,
        refresh() {
            if (activeMatchId) void open(activeMatchId, { force: true });
        }
    };

    async function open(matchId, { force = false } = {}) {
        const id = String(matchId || "").trim();
        const playerId = String(getActivePlayerId() || "").trim();
        if (!id) {
            renderFailure("No match ID was provided.");
            return;
        }
        if (!force && activeMatchId === id && activePlayerId === playerId && (telemetry || summary?.hasTelemetry === false))
            return;
        closePlayback();
        activeMatchId = id;
        activePlayerId = playerId;
        summary = getSummary(id, playerId);
        telemetry = null;
        replayState = { loading: false, available: null, replays: [], error: "", message: "" };
        const token = ++requestToken;
        if (summary && summary.hasTelemetry === false) {
            renderLegacy();
            return;
        }
        renderLoading();
        try {
            const loaded = await api.load(id, { force });
            if (token !== requestToken || activeMatchId !== id) return;
            telemetry = loaded;
            renderLoaded();
            void loadReplays(token);
        } catch (error) {
            if (token !== requestToken || activeMatchId !== id) return;
            if (summary && !summary.hasTelemetry) {
                renderLegacy();
            } else {
                renderFailure(error?.message || "Detailed telemetry could not be loaded.");
            }
        }
    }

    function close() {
        requestToken++;
        activeMatchId = "";
        activePlayerId = "";
        summary = null;
        telemetry = null;
        closePlayback();
    }

    function closePlayback() {
        playback?.destroy();
        mapRenderer?.destroy();
        playback = null;
        mapRenderer = null;
    }

    function renderLoading() {
        container.innerHTML = `
            <section class="match-detail-shell match-detail-state" aria-live="polite">
                ${renderBackLink(getBackHref())}
                <p class="panel-kicker">Match details</p>
                <h2>Loading tactical telemetry...</h2>
                <div class="match-loading-bar" aria-hidden="true"></div>
            </section>
        `;
    }

    function renderFailure(message) {
        container.innerHTML = `
            <section class="match-detail-shell match-detail-state" aria-live="polite">
                ${renderBackLink(getBackHref())}
                <p class="panel-kicker">Match details</p>
                <h2>Telemetry could not be loaded</h2>
                <p>${escapeHtml(message)}</p>
                <button type="button" data-match-retry>Retry</button>
            </section>
        `;
    }

    function renderLegacy() {
        const participants = summary?.participants || [];
        container.innerHTML = `
            <section class="match-detail-shell" aria-live="polite">
                ${renderBackLink(getBackHref())}
                <header class="match-detail-header">
                    <div>
                        <p class="panel-kicker">Match details</p>
                        <h2>${escapeHtml(summary?.modeLabel || modeLabel(summary?.mode))}</h2>
                        <p>${escapeHtml(formatDayMonthYear(summary?.endedAt))} - ${escapeHtml(activeMatchId)}</p>
                    </div>
                    <span class="match-telemetry-badge legacy">Legacy match</span>
                </header>
                <section class="match-legacy-state">
                    <h3>Tactical playback unavailable</h3>
                    <p>Tactical playback is unavailable because detailed telemetry was not recorded for this match.</p>
                </section>
                ${renderAggregateSummary(summary)}
                ${renderLegacyParticipants(participants)}
            </section>
        `;
    }

    function renderLoaded() {
        const diagnostics = validateMatchTelemetry(telemetry);
        container.innerHTML = `
            <section class="match-detail-shell" aria-live="polite">
                ${renderBackLink(getBackHref())}
                ${renderMatchHeader()}
                ${renderResultSummary()}
                <div class="match-playback-layout">
                    <section class="match-map-panel" aria-labelledby="tactical-playback-title">
                        <div class="match-section-heading">
                            <div>
                                <p class="panel-kicker">Tactical playback</p>
                                <h3 id="tactical-playback-title">${escapeHtml(telemetry.map.label)}</h3>
                            </div>
                            <span data-match-time>${formatMatchTime(0)}</span>
                        </div>
                        <div data-match-map></div>
                        ${renderPlaybackControls()}
                        ${renderTimeline()}
                    </section>
                    <aside class="match-event-panel" aria-live="polite">
                        <div data-match-event-feed></div>
                    </aside>
                </div>
                ${renderParticipantScoreboard()}
                <section class="match-replays" aria-labelledby="match-replays-title">
                    <div class="match-section-heading">
                        <div>
                            <p class="panel-kicker">Replay Mod files</p>
                            <h3 id="match-replays-title">Replay downloads</h3>
                        </div>
                    </div>
                    <p class="match-replay-notice">Replay files may contain player names, chat, scoreboard information, and other data visible to the recording client.</p>
                    <div data-match-replays>${renderReplayState()}</div>
                </section>
                ${isAdmin() ? renderDiagnostics(diagnostics) : ""}
            </section>
        `;
        const mapHost = container.querySelector("[data-match-map]");
        mapRenderer = new MatchMapRenderer(mapHost, telemetry, getPlayerPresentation);
        playback = new MatchPlaybackController(telemetry, updatePlayback);
        updatePlayback(playback.state());
    }

    function renderMatchHeader() {
        return `
            <header class="match-detail-header">
                <div>
                    <p class="panel-kicker">${escapeHtml(modeLabel(telemetry.mode))}</p>
                    <h2>${escapeHtml(telemetry.map.label)}</h2>
                    <p>${escapeHtml(formatDayMonthYear(telemetry.endedAt))} - ${escapeHtml(formatDuration(telemetry.durationMs))}</p>
                </div>
                <dl class="match-meta">
                    <div><dt>Match ID</dt><dd>${escapeHtml(telemetry.matchId)}</dd></div>
                    <div><dt>Players</dt><dd>${telemetry.participants.length}</dd></div>
                    <div><dt>Map version</dt><dd>${escapeHtml(telemetry.map.mapVersion || "Unavailable")}</dd></div>
                    <div><dt>Telemetry</dt><dd>v${telemetry.telemetryVersion}</dd></div>
                </dl>
            </header>
            ${telemetry.warnings.length ? `<p class="match-calibration-warning">${escapeHtml(telemetry.warnings[0])}</p>` : ""}
        `;
    }

    function renderResultSummary() {
        const winner = telemetry.result?.winner;
        const mvp = telemetry.result?.mvp;
        const samePlayer = Boolean(winner?.playerId && mvp?.playerId && winner.playerId === mvp.playerId);
        const finalScores = telemetry.result?.finalScores;
        return `
            <section class="match-result-summary" aria-label="Match result">
                ${
                    samePlayer
                        ? renderResultItem(
                              "Winner & MVP",
                              playerName(winner.playerId),
                              participantResultText(winner.playerId)
                          )
                        : `
                            ${renderResultItem(
                                winner?.type === "team" ? "Winning team" : "Winner",
                                winner?.playerId ? playerName(winner.playerId) : winnerLabel(winner),
                                winnerScoreText(winner, finalScores)
                            )}
                            ${renderResultItem("Match MVP", mvp?.playerId ? playerName(mvp.playerId) : "Unavailable", mvpText(mvp))}
                        `
                }
                ${renderResultItem("End reason", telemetry.result?.endReason || "Unavailable", finalScoreText(finalScores))}
            </section>
        `;
    }

    function renderResultItem(label, value, meta = "") {
        return `
            <article>
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(value || "Unavailable")}</strong>
                ${meta ? `<small>${escapeHtml(meta)}</small>` : ""}
            </article>
        `;
    }

    function renderPlaybackControls() {
        return `
            <div class="match-playback-controls" data-match-viewer-controls tabindex="0" aria-label="Tactical playback controls">
                <div class="match-control-row">
                    <button type="button" data-match-previous aria-label="Previous playback moment">Previous</button>
                    <button type="button" data-match-play aria-label="Play tactical playback">Play</button>
                    <button type="button" data-match-next aria-label="Next playback moment">Next</button>
                    <span data-match-status>Moment 1 of 1</span>
                </div>
                <fieldset class="match-speed-control">
                    <legend>Speed</legend>
                    ${[0.5, 1, 2]
                        .map(
                            (speed) => `
                            <label>
                                <input type="radio" name="match-speed" value="${speed}" ${speed === 1 ? "checked" : ""}>
                                <span>${speed}x</span>
                            </label>
                        `
                        )
                        .join("")}
                </fieldset>
                <fieldset class="match-event-filters">
                    <legend>Events</legend>
                    ${Object.entries(FILTER_LABELS)
                        .map(
                            ([id, label]) => `
                            <label>
                                <input type="checkbox" data-match-filter="${id}" checked>
                                <span>${escapeHtml(label)}</span>
                            </label>
                        `
                        )
                        .join("")}
                </fieldset>
                <div class="match-skip-control">
                    <label>
                        <input type="checkbox" data-match-skip-idle checked>
                        <span>Skip idle time</span>
                    </label>
                    <details>
                        <summary aria-label="Explain skip idle time">?</summary>
                        <p>When enabled, playback skips quiet periods and moves between engagements and other meaningful moments. When disabled, every recorded match snapshot is played in chronological order.</p>
                    </details>
                </div>
            </div>
        `;
    }

    function renderTimeline() {
        return `
            <div class="match-timeline">
                <label for="match-timeline-range">Match timeline</label>
                <div class="match-timeline-track">
                    <input id="match-timeline-range" type="range" min="0" max="${Math.max(1, telemetry.durationMs)}" step="100" value="0" data-match-timeline>
                    <div class="match-timeline-markers" data-match-timeline-markers>
                        ${telemetry.events.map(renderTimelineMarker).join("")}
                    </div>
                </div>
                <div>
                    <span>00:00</span>
                    <output data-match-timeline-output>00:00</output>
                    <span>${formatMatchTime(telemetry.durationMs)}</span>
                </div>
            </div>
        `;
    }

    function renderTimelineMarker(event) {
        const left =
            telemetry.durationMs > 0 ? Math.min(100, Math.max(0, (event.timeMs / telemetry.durationMs) * 100)) : 0;
        return `
            <button
                type="button"
                class="timeline-event-marker event-${escapeHtml(event.type)}"
                style="left:${left}%"
                data-match-event="${escapeHtml(event.eventId)}"
                data-event-type="${escapeHtml(event.type)}"
                aria-label="${escapeHtml(`${eventLabel(event.type)} at ${formatMatchTime(event.timeMs)}`)}"
            ></button>
        `;
    }

    function renderParticipantScoreboard() {
        const results = telemetry.result?.participants || [];
        const resultById = new Map(results.map((result) => [result.playerId, result]));
        return `
            <section class="match-scoreboard" aria-labelledby="match-scoreboard-title">
                <div class="match-section-heading">
                    <div>
                        <p class="panel-kicker">Participants</p>
                        <h3 id="match-scoreboard-title">Final scoreboard</h3>
                    </div>
                </div>
                <div class="match-scoreboard-wrap" tabindex="0">
                    <table>
                        <thead>
                            <tr><th>Player</th><th>Team</th><th>Result</th><th>Place</th><th>Kills</th><th>Deaths</th><th>HS kills</th><th>Streak</th><th>Longest</th></tr>
                        </thead>
                        <tbody>
                            ${telemetry.participants
                                .map((participant) =>
                                    renderScoreboardRow(participant, resultById.get(participant.playerId))
                                )
                                .join("")}
                        </tbody>
                    </table>
                </div>
            </section>
        `;
    }

    function renderScoreboardRow(participant, result) {
        const presentation = playerPresentation(participant.playerId, participant);
        const avatar = presentation.avatarUrl
            ? `<img src="${escapeHtml(presentation.avatarUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
            : `<span>${escapeHtml(initialsFor(presentation.name))}</span>`;
        return `
            <tr class="${result?.won ? "winner" : ""}">
                <th>
                    <a href="#player=${encodeURIComponent(participant.playerId)}&tab=overview">
                        ${avatar}
                        <span>${escapeHtml(presentation.name)}</span>
                    </a>
                </th>
                <td>${escapeHtml(participant.teamId || "Solo")}</td>
                <td>${result ? (result.won ? "Win" : "Loss") : "Unavailable"}</td>
                <td>${valueOrUnavailable(result?.placement)}</td>
                <td>${valueOrUnavailable(result?.kills)}</td>
                <td>${valueOrUnavailable(result?.deaths)}</td>
                <td>${valueOrUnavailable(result?.headshotKills)}</td>
                <td>${valueOrUnavailable(result?.bestKillStreak)}</td>
                <td>${result?.longestKillDistance === null || result?.longestKillDistance === undefined ? "Unavailable" : `${round(result.longestKillDistance)} blocks`}</td>
            </tr>
        `;
    }

    function renderReplayState() {
        if (replayState.loading) return `<p>Loading replay access...</p>`;
        if (replayState.error) return `<p class="match-replay-error">${escapeHtml(replayState.error)}</p>`;
        if (replayState.available === false) {
            return `
                <p>Replay downloads are not configured yet. Tactical playback remains available.</p>
                ${isAdmin() ? renderReplayAdminForm() : ""}
            `;
        }
        const replayRows = replayState.replays.length
            ? replayState.replays.map(renderReplayRow).join("")
            : `<p>No Replay Mod file has been attached to this match.</p>`;
        return `
            ${replayState.message ? `<p class="match-replay-message">${escapeHtml(replayState.message)}</p>` : ""}
            <div class="match-replay-list">${replayRows}</div>
            ${isAdmin() ? renderReplayAdminForm() : ""}
        `;
    }

    function renderReplayRow(replay) {
        const replayId = replay.replay_id || replay.replayId || "";
        const recorderName = replay.recorder_name || replay.recorderName || "";
        const visibility = replay.visibility || "participants";
        const checksum = replay.sha256 || "";
        const uploadedAt = replay.uploaded_at || replay.uploadedAt || "";
        const canDownload =
            isAdmin() || replay.can_download === true || replay.canDownload === true || visibility === "public";
        return `
            <article class="match-replay-row">
                <div class="match-replay-summary">
                    <strong>${escapeHtml(replay.label || "Replay perspective")}</strong>
                    <span>${escapeHtml(recorderName || "Unknown recorder")}</span>
                    <small>${escapeHtml(visibility)} - ${escapeHtml(formatBytes(replay.file_size ?? replay.fileSize))}${uploadedAt ? ` - ${escapeHtml(formatDayMonthYear(uploadedAt))}` : ""}</small>
                    ${checksum ? `<code title="${escapeHtml(checksum)}">SHA-256 ${escapeHtml(checksum)}</code>` : ""}
                </div>
                <div class="match-replay-actions">
                    ${
                        canDownload
                            ? `<button type="button" data-replay-download="${escapeHtml(replayId)}">Download</button>`
                            : `<span class="match-replay-locked">${isAuthenticated() ? "Not available to this account" : "Discord login and linked Minecraft account required"}</span>`
                    }
                    ${isAdmin() ? renderReplayManagement(replay, replayId, visibility, recorderName) : ""}
                </div>
            </article>
        `;
    }

    function renderReplayManagement(replay, replayId, visibility, recorderName) {
        return `
            <details class="match-replay-manage">
                <summary>Manage</summary>
                <form data-replay-edit-form data-replay-id="${escapeHtml(replayId)}">
                    <label>Label <input type="text" name="label" maxlength="80" value="${escapeHtml(replay.label || "")}" required></label>
                    <label>Recorder name <input type="text" name="recorderName" maxlength="64" value="${escapeHtml(recorderName)}"></label>
                    <label>Visibility
                        <select name="visibility">
                            ${["participants", "community", "public"]
                                .map(
                                    (value) =>
                                        `<option value="${value}" ${visibility === value ? "selected" : ""}>${escapeHtml(labelFromId(value))}</option>`
                                )
                                .join("")}
                        </select>
                    </label>
                    <label>Replay Mod version <input type="text" name="replayModVersion" maxlength="32" value="${escapeHtml(replay.replay_mod_version || replay.replayModVersion || "")}"></label>
                    <label>Modpack version <input type="text" name="modpackVersion" maxlength="32" value="${escapeHtml(replay.modpack_version || replay.modpackVersion || "")}"></label>
                    <label>Notes <textarea name="notes" maxlength="500">${escapeHtml(replay.notes || "")}</textarea></label>
                    <label><input type="checkbox" name="mayContainChat" ${replay.may_contain_chat === false || replay.mayContainChat === false ? "" : "checked"}> May contain chat</label>
                    <label class="match-replay-replace">Replace file <input type="file" accept=".mcpr,application/zip" data-replay-replace="${escapeHtml(replayId)}"></label>
                    <div>
                        <button type="submit">Save metadata</button>
                        <button type="button" data-replay-delete="${escapeHtml(replayId)}">Delete replay</button>
                    </div>
                </form>
            </details>
        `;
    }

    function renderReplayAdminForm() {
        return `
            <form class="match-replay-admin" data-replay-upload-form>
                <h4>Attach administrator replay</h4>
                <label>Replay file <input type="file" name="replay" accept=".mcpr,application/zip" required></label>
                <label>Label <input type="text" name="label" maxlength="80" placeholder="Admin cinematic perspective" required></label>
                <label>Recorder name <input type="text" name="recorderName" maxlength="64"></label>
                <label>Visibility
                    <select name="visibility">
                        <option value="participants">Participants</option>
                        <option value="community">Community</option>
                        <option value="public">Public</option>
                    </select>
                </label>
                <label>Replay Mod version <input type="text" name="replayModVersion" maxlength="32"></label>
                <label>Modpack version <input type="text" name="modpackVersion" maxlength="32"></label>
                <label>Notes <textarea name="notes" maxlength="500"></textarea></label>
                <label><input type="checkbox" name="mayContainChat" checked> May contain chat</label>
                <button type="submit">Upload replay</button>
            </form>
        `;
    }

    function renderDiagnostics(diagnostics) {
        return `
            <details class="match-diagnostics">
                <summary>Admin telemetry diagnostics</summary>
                <div data-match-diagnostics>
                    ${diagnosticsMarkup(diagnostics)}
                </div>
                <button type="button" data-match-validate>Validate telemetry</button>
            </details>
        `;
    }

    function diagnosticsMarkup(diagnostics) {
        const firstEvent = telemetry.events[0]?.timeMs;
        const lastEvent = telemetry.events.at(-1)?.timeMs;
        return `
            <dl>
                <div><dt>Match ID</dt><dd>${escapeHtml(telemetry.matchId)}</dd></div>
                <div><dt>Version</dt><dd>${telemetry.telemetryVersion}</dd></div>
                <div><dt>Snapshot interval</dt><dd>${valueOrUnavailable(telemetry.capture.snapshotIntervalMs, " ms")}</dd></div>
                <div><dt>Snapshots</dt><dd>${telemetry.snapshots.length}</dd></div>
                <div><dt>Events</dt><dd>${telemetry.events.length}</dd></div>
                <div><dt>Engagements</dt><dd>${telemetry.engagements.length}</dd></div>
                <div><dt>First / last event</dt><dd>${firstEvent === undefined ? "Unavailable" : `${formatMatchTime(firstEvent)} / ${formatMatchTime(lastEvent)}`}</dd></div>
                <div><dt>Duration</dt><dd>${formatDuration(telemetry.durationMs)}</dd></div>
                <div><dt>Map</dt><dd>${escapeHtml(`${telemetry.map.mapId} v${telemetry.map.mapVersion}`)}</dd></div>
                <div><dt>Winner / MVP</dt><dd>${telemetry.result?.winner ? "Present" : "Missing"} / ${telemetry.result?.mvp ? "Present" : "Missing"}</dd></div>
                <div><dt>Replays</dt><dd>${replayState.replays.length}</dd></div>
                <div><dt>Storage</dt><dd>Separate match telemetry record</dd></div>
                <div><dt>Payload</dt><dd>${formatBytes(diagnostics.payloadBytes)}</dd></div>
                <div><dt>Website load</dt><dd>${diagnostics.valid ? "Valid" : "Loaded with validation errors"}</dd></div>
            </dl>
            <p><strong>Events:</strong> ${escapeHtml(
                Object.entries(diagnostics.eventCounts)
                    .map(([type, count]) => `${type}: ${count}`)
                    .join(", ") || "none"
            )}</p>
            ${diagnostics.errors.length ? `<div class="diagnostic-errors"><strong>Errors</strong><ul>${diagnostics.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul></div>` : "<p>No validation errors.</p>"}
            ${diagnostics.warnings.length ? `<div><strong>Warnings</strong><ul>${diagnostics.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul></div>` : ""}
        `;
    }

    function updatePlayback(playbackState) {
        if (!telemetry || !playbackState) return;
        mapRenderer?.update(playbackState.snapshot, playbackState.events, playbackState.currentEventId);
        setText("[data-match-time]", formatMatchTime(playbackState.snapshot?.timeMs || 0));
        setText("[data-match-status]", `${playbackState.statusLabel} - ${playbackState.moment?.label || "Snapshot"}`);
        setText("[data-match-play]", playbackState.playing ? "Pause" : "Play");
        const playButton = container.querySelector("[data-match-play]");
        playButton?.setAttribute(
            "aria-label",
            playbackState.playing ? "Pause tactical playback" : "Play tactical playback"
        );
        const timeline = container.querySelector("[data-match-timeline]");
        if (timeline) timeline.value = String(playbackState.snapshot?.timeMs || 0);
        setText("[data-match-timeline-output]", formatMatchTime(playbackState.snapshot?.timeMs || 0));
        updateTimelineMarkers(playbackState);
        renderEventFeed(playbackState);
        renderMatchEndOverlay(playbackState);
    }

    function updateTimelineMarkers(playbackState) {
        container.querySelectorAll("[data-event-type]").forEach((marker) => {
            const filter = filterForEventType(marker.dataset.eventType);
            marker.hidden = filter ? !playbackState.filters[filter] : false;
            marker.classList.toggle("selected", marker.dataset.matchEvent === playbackState.currentEventId);
        });
    }

    function renderEventFeed(playbackState) {
        const host = container.querySelector("[data-match-event-feed]");
        if (!host) return;
        const time = playbackState.snapshot?.timeMs || 0;
        const visible = telemetry.events.filter((event) => eventPassesFilters(event, playbackState.filters));
        const current =
            visible.find((event) => event.eventId === playbackState.currentEventId) ||
            [...visible].reverse().find((event) => event.timeMs <= time && time - event.timeMs <= 1500) ||
            null;
        const recent = visible
            .filter((event) => event.timeMs < time)
            .slice(-4)
            .reverse();
        const upcoming = visible.find((event) => event.timeMs > time);
        host.innerHTML = `
            <p class="panel-kicker">Current moment</p>
            ${current ? renderEventCard(current, true) : `<div class="match-current-empty"><strong>${escapeHtml(playbackState.moment?.label || "Snapshot")}</strong><span>${formatMatchTime(time)}</span></div>`}
            <h4>Recent</h4>
            <div class="match-event-list">
                ${recent.length ? recent.map((event) => renderEventButton(event)).join("") : "<p>No earlier selected events.</p>"}
            </div>
            ${upcoming ? `<h4>Upcoming</h4><div class="match-event-list">${renderEventButton(upcoming)}</div>` : ""}
        `;
    }

    function renderEventCard(event, current = false) {
        const actorId = event.killerId || event.attackerId || event.playerId;
        const targetId = event.victimId;
        const lines = [
            event.weaponLabel || labelFromId(event.weaponId),
            event.headshot ? "Headshot" : "",
            event.distance3d === null ? "" : `${round(event.distance3d)} blocks`,
            event.verticalDifference === null
                ? ""
                : `${round(Math.abs(event.verticalDifference))} blocks ${event.verticalDifference >= 0 ? "height advantage" : "below target"}`,
            event.finalDamage === null ? "" : `${round(event.finalDamage)} final damage`,
            event.killerHealthAfter === null ? "" : `${round(event.killerHealthAfter)} HP remaining`
        ].filter(Boolean);
        return `
            <article class="match-event-card ${current ? "current" : ""}">
                <span>${escapeHtml(eventLabel(event.type))} - ${formatMatchTime(event.timeMs)}</span>
                <strong>${escapeHtml(actorId ? playerName(actorId) : event.teamId || "Match")}${targetId ? ` -> ${escapeHtml(playerName(targetId))}` : ""}</strong>
                ${lines.map((line) => `<small>${escapeHtml(line)}</small>`).join("")}
            </article>
        `;
    }

    function renderEventButton(event) {
        return `
            <button type="button" data-match-event="${escapeHtml(event.eventId)}">
                <span>${formatMatchTime(event.timeMs)} - ${escapeHtml(eventLabel(event.type))}</span>
                <strong>${escapeHtml(eventSummary(event))}</strong>
            </button>
        `;
    }

    function renderMatchEndOverlay(playbackState) {
        const stage = container.querySelector(".tactical-map-stage");
        if (!stage) return;
        let overlay = stage.querySelector("[data-match-end-overlay]");
        const matchEnded =
            playbackState.events.some((event) => event.type === "match_end") ||
            playbackState.snapshot?.timeMs >= telemetry.durationMs;
        if (!matchEnded) {
            overlay?.remove();
            return;
        }
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.className = "match-end-overlay";
            overlay.dataset.matchEndOverlay = "";
            stage.append(overlay);
        }
        const winner = telemetry.result?.winner;
        const mvp = telemetry.result?.mvp;
        const same = winner?.playerId && winner.playerId === mvp?.playerId;
        overlay.innerHTML = same
            ? `<span>Match complete</span><strong>Winner &amp; MVP</strong><b>${escapeHtml(playerName(winner.playerId))}</b><small>${escapeHtml(participantResultText(winner.playerId))}</small>`
            : `<span>Match complete</span><strong>${escapeHtml(winnerLabel(winner))}</strong><b>MVP: ${escapeHtml(mvp?.playerId ? playerName(mvp.playerId) : "Unavailable")}</b><small>${escapeHtml(finalScoreText(telemetry.result?.finalScores))}</small>`;
    }

    async function loadReplays(token) {
        replayState.loading = true;
        updateReplayHost();
        try {
            const listed = await replayApi.list(activeMatchId);
            if (token !== requestToken) return;
            replayState = {
                loading: false,
                available: listed.available,
                replays: listed.replays?.length ? listed.replays : telemetry.replays,
                error: "",
                message: ""
            };
        } catch (error) {
            if (token !== requestToken) return;
            replayState = {
                loading: false,
                available: true,
                replays: telemetry.replays,
                error: error?.message || "Replay metadata could not be loaded.",
                message: ""
            };
        }
        updateReplayHost();
    }

    function updateReplayHost() {
        const host = container.querySelector("[data-match-replays]");
        if (host) host.innerHTML = renderReplayState();
    }

    async function handleClick(event) {
        const retry = event.target.closest("[data-match-retry]");
        if (retry) {
            await open(activeMatchId, { force: true });
            return;
        }
        const download = event.target.closest("[data-replay-download]");
        if (download) {
            await downloadReplay(download.dataset.replayDownload, download);
            return;
        }
        const remove = event.target.closest("[data-replay-delete]");
        if (remove) {
            await deleteReplay(remove.dataset.replayDelete);
            return;
        }
        if (!playback) return;
        if (event.target.closest("[data-match-previous]")) playback.previous();
        else if (event.target.closest("[data-match-play]")) playback.togglePlay();
        else if (event.target.closest("[data-match-next]")) playback.next();
        else if (event.target.closest("[data-match-validate]")) {
            const host = container.querySelector("[data-match-diagnostics]");
            if (host) host.innerHTML = diagnosticsMarkup(validateMatchTelemetry(telemetry));
        } else {
            const eventButton = event.target.closest("[data-match-event]");
            if (eventButton) playback.selectEvent(eventButton.dataset.matchEvent);
        }
    }

    async function handleChange(event) {
        const replacement = event.target.closest("[data-replay-replace]");
        if (replacement) {
            await replaceReplay(replacement.dataset.replayReplace, replacement.files?.[0]);
            return;
        }
        if (!playback) return;
        if (event.target.matches("[name='match-speed']")) playback.setSpeed(event.target.value);
        if (event.target.matches("[data-match-skip-idle]")) playback.setSkipIdle(event.target.checked);
        if (event.target.matches("[data-match-filter]")) {
            playback.setFilter(event.target.dataset.matchFilter, event.target.checked);
        }
    }

    function handleInput(event) {
        if (playback && event.target.matches("[data-match-timeline]")) playback.seek(event.target.value);
    }

    async function handleSubmit(event) {
        const editForm = event.target.closest("[data-replay-edit-form]");
        if (editForm) {
            event.preventDefault();
            await updateReplayMetadata(editForm);
            return;
        }
        const form = event.target.closest("[data-replay-upload-form]");
        if (!form) return;
        event.preventDefault();
        const file = form.elements.replay.files?.[0];
        const submit = form.querySelector("[type='submit']");
        const metadata = replayMetadataFromForm(form);
        submit.disabled = true;
        replayState.error = "";
        replayState.message = "Uploading and validating replay...";
        updateReplayHost();
        try {
            await replayApi.upload(activeMatchId, file, metadata);
            await refreshReplayList("Replay uploaded and validated.");
        } catch (error) {
            replayState.error = error?.message || "Replay upload failed.";
            replayState.message = "";
            updateReplayHost();
        }
    }

    function replayMetadataFromForm(form) {
        return {
            label: form.elements.label.value.trim(),
            recorderName: form.elements.recorderName.value.trim(),
            visibility: form.elements.visibility.value,
            minecraftVersion: "1.20.1",
            replayModVersion: form.elements.replayModVersion.value.trim(),
            modpackVersion: form.elements.modpackVersion.value.trim(),
            notes: form.elements.notes.value.trim(),
            mayContainChat: form.elements.mayContainChat.checked
        };
    }

    async function refreshReplayList(message = "") {
        const listed = await replayApi.list(activeMatchId);
        replayState = {
            loading: false,
            available: listed.available,
            replays: listed.replays,
            error: "",
            message
        };
        updateReplayHost();
    }

    async function updateReplayMetadata(form) {
        const replayId = form.dataset.replayId;
        replayState.error = "";
        replayState.message = "Saving replay metadata...";
        updateReplayHost();
        try {
            await replayApi.update(replayId, replayMetadataFromForm(form));
            await refreshReplayList("Replay metadata saved.");
        } catch (error) {
            replayState.error = error?.message || "Replay metadata could not be saved.";
            replayState.message = "";
            updateReplayHost();
        }
    }

    async function replaceReplay(replayId, file) {
        if (!file) return;
        replayState.error = "";
        replayState.message = "Uploading and validating replacement...";
        updateReplayHost();
        try {
            await replayApi.replace(replayId, file);
            await refreshReplayList("Replay file replaced.");
        } catch (error) {
            replayState.error = error?.message || "Replay replacement failed.";
            replayState.message = "";
            updateReplayHost();
        }
    }

    async function deleteReplay(replayId) {
        if (!globalThis.confirm("Delete this replay file and its metadata? This cannot be undone.")) return;
        replayState.error = "";
        replayState.message = "Deleting replay...";
        updateReplayHost();
        try {
            await replayApi.remove(replayId);
            await refreshReplayList("Replay deleted.");
        } catch (error) {
            replayState.error = error?.message || "Replay could not be deleted.";
            replayState.message = "";
            updateReplayHost();
        }
    }

    function handleKeyDown(event) {
        if (!playback || !event.target.closest("[data-match-viewer-controls], [data-match-map]")) return;
        if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(event.target.tagName) && event.key === " ") return;
        if (event.key === " ") {
            event.preventDefault();
            playback.togglePlay();
        } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            playback.previous();
        } else if (event.key === "ArrowRight") {
            event.preventDefault();
            playback.next();
        } else if (event.key === "Escape") {
            mapRenderer?.closeTooltip();
        }
    }

    async function downloadReplay(replayId, button) {
        button.disabled = true;
        const oldText = button.textContent;
        button.textContent = "Authorizing...";
        try {
            const result = await replayApi.requestDownload(replayId);
            const url = String(result?.url || "");
            if (!/^https:\/\//i.test(url)) throw new Error("The replay service did not return a signed download URL.");
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = "";
            anchor.rel = "noopener";
            anchor.click();
        } catch (error) {
            replayState.error = error?.message || "Replay download could not be authorized.";
            updateReplayHost();
        } finally {
            if (button.isConnected) {
                button.disabled = false;
                button.textContent = oldText;
            }
        }
    }

    function playerPresentation(playerId, participant = null) {
        const supplied = getPlayerPresentation(playerId, participant) || {};
        return {
            name: supplied.name || participant?.name || "Unknown player",
            avatarUrl: supplied.avatarUrl || ""
        };
    }

    function playerName(playerId) {
        const participant = telemetry?.participants.find((item) => item.playerId === playerId);
        return playerPresentation(playerId, participant).name;
    }

    function participantResultText(playerId) {
        const result = telemetry.result?.participants?.find((entry) => entry.playerId === playerId);
        if (!result) return "";
        return [
            result.placement ? `${ordinal(result.placement)} place` : "",
            result.kills === null ? "" : `${result.kills} eliminations`,
            result.damage === null ? "" : `${round(result.damage)} damage`
        ]
            .filter(Boolean)
            .join(" - ");
    }

    function eventSummary(event) {
        const actor = event.killerId || event.attackerId || event.playerId;
        if (event.type === "zone_phase_changed") return `Zone phase ${event.zone?.phase ?? "changed"}`;
        if (event.type === "team_eliminated") return `${event.teamId || "Team"} eliminated`;
        if (event.type === "match_end") return "Match complete";
        return (
            [actor ? playerName(actor) : "", event.victimId ? playerName(event.victimId) : ""]
                .filter(Boolean)
                .join(" -> ") || eventLabel(event.type)
        );
    }

    function setText(selector, value) {
        const element = container.querySelector(selector);
        if (element) element.textContent = value;
    }
}

function renderBackLink(href = "#view=leaderboards&board=players&mode=battleRoyale&sort=wins") {
    return `<a class="match-back-link" href="${escapeHtml(href)}">Back to stats</a>`;
}

function renderAggregateSummary(match) {
    if (!match) return "";
    return `
        <section class="match-result-summary">
            <article><span>Result</span><strong>${match.won ? "Win" : "Loss"}</strong></article>
            <article><span>Kills / deaths</span><strong>${valueOrUnavailable(match.kills)} / ${valueOrUnavailable(match.deaths)}</strong></article>
            <article><span>Placement</span><strong>${valueOrUnavailable(match.placement)}</strong></article>
            <article><span>Duration</span><strong>${match.playtimeSeconds === null || match.playtimeSeconds === undefined ? "Unavailable" : formatDuration(match.playtimeSeconds * 1000)}</strong></article>
        </section>
    `;
}

function renderLegacyParticipants(participants) {
    if (!participants.length) return `<p class="match-calibration-warning">The participant roster is unavailable.</p>`;
    return `
        <section class="match-scoreboard">
            <h3>Recorded participants</h3>
            <div class="match-scoreboard-wrap"><table>
                <thead><tr><th>Player</th><th>Kills</th><th>Deaths</th><th>Place</th></tr></thead>
                <tbody>${participants
                    .map(
                        (player) => `
                        <tr><th>${escapeHtml(player.name || "Unknown")}</th><td>${valueOrUnavailable(player.kills)}</td><td>${valueOrUnavailable(player.deaths)}</td><td>${valueOrUnavailable(player.placement)}</td></tr>
                    `
                    )
                    .join("")}</tbody>
            </table></div>
        </section>
    `;
}

function winnerLabel(winner) {
    if (!winner) return "Unavailable";
    if (winner.playerId) return "";
    return winner.teamId ? labelFromId(winner.teamId) : "Unavailable";
}

function winnerScoreText(winner, scores) {
    if (!winner) return "";
    if (winner.finalScore !== null && winner.finalScore !== undefined) {
        return `${winner.finalScore} - ${winner.opponentScore ?? "?"}`;
    }
    return finalScoreText(scores);
}

function mvpText(mvp) {
    if (!mvp) return "";
    const score = mvp.score === null || mvp.score === undefined ? "" : ` - ${mvp.score}`;
    return `${labelFromId(mvp.reason || "Server MVP")}${score}`;
}

function finalScoreText(scores) {
    if (!scores) return "";
    if (scores.red !== null && scores.blue !== null) return `Red ${scores.red} - ${scores.blue} Blue`;
    return scores.target !== null ? `Target ${scores.target}` : "";
}

function filterForEventType(type) {
    if (["engagement_start", "damage"].includes(type)) return "engagements";
    if (["elimination", "team_eliminated"].includes(type)) return "eliminations";
    if (type === "vehicle_destroyed") return "vehicles";
    if (type === "zone_phase_changed") return "zone";
    if (["rapid_streak", "ace"].includes(type)) return "streaks";
    if (type === "respawn") return "respawns";
    return "";
}

function eventPassesFilters(event, filters) {
    const filter = filterForEventType(event.type);
    return filter ? filters[filter] : event.type === "match_end";
}

function modeLabel(mode) {
    if (mode === "battleRoyale") return "Battle Royale";
    if (mode === "deathmatch") return "Deathmatch";
    return "Match";
}

function eventLabel(type) {
    return labelFromId(type || "event");
}

function labelFromId(value) {
    return String(value || "")
        .split(":")
        .pop()
        .replaceAll("_", " ")
        .replaceAll("-", " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function valueOrUnavailable(value, suffix = "") {
    return value === null || value === undefined ? "Unavailable" : `${escapeHtml(String(value))}${escapeHtml(suffix)}`;
}

function formatDayMonthYear(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "Date unavailable";
    return new Intl.DateTimeFormat(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short"
    }).format(date);
}

function formatDuration(milliseconds) {
    const seconds = Math.max(0, Math.round(Number(milliseconds || 0) / 1000));
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return minutes ? `${minutes}m ${remaining}s` : `${remaining}s`;
}

function formatMatchTime(milliseconds) {
    const seconds = Math.max(0, Math.floor(Number(milliseconds || 0) / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatBytes(bytes) {
    const value = Number(bytes);
    if (!(value >= 0)) return "Unavailable";
    if (value < 1024) return `${value} B`;
    if (value < 1024 ** 2) return `${round(value / 1024)} KB`;
    if (value < 1024 ** 3) return `${round(value / 1024 ** 2)} MB`;
    return `${round(value / 1024 ** 3)} GB`;
}

function initialsFor(name) {
    return (
        String(name || "?")
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0])
            .join("")
            .toUpperCase() || "?"
    );
}

function ordinal(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "Unavailable";
    const mod100 = number % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${number}th`;
    return `${number}${number % 10 === 1 ? "st" : number % 10 === 2 ? "nd" : number % 10 === 3 ? "rd" : "th"}`;
}

function round(value) {
    return Math.round(Number(value) * 10) / 10;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
