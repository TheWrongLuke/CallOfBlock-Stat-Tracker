const MODE_LABELS = {
    overall: "Overall",
    battleRoyale: "Battle Royale",
    deathmatch: "Deathmatch"
};

const SORT_LABELS = {
    wins: "Wins",
    kills: "Kills",
    games: "Games",
    deaths: "Deaths",
    winRate: "Win Rate",
    avgKills: "Avg Kills",
    playtimeSeconds: "Playtime",
    headshotRate: "HS%",
    kdRatio: "KD"
};

const PLAYER_TABS = {
    overview: "Overview",
    battleRoyale: "Battle Royale",
    deathmatch: "Deathmatch",
    maps: "Maps",
    weapons: "Weapons",
    history: "History"
};

const DEFAULT_API_POLL_MS = 10000;

const state = {
    data: null,
    preview: false,
    dataMode: "Static file",
    apiUrl: "",
    supabaseUrl: "",
    supabaseKey: "",
    supabaseTable: "cob_stats_exports",
    supabaseRowId: "live",
    pollMs: DEFAULT_API_POLL_MS,
    refreshTimer: null,
    dataSignature: "",
    mode: "overall",
    sort: "wins",
    sortDirection: "desc",
    page: 1,
    pageSize: 20,
    query: "",
    selectedId: null,
    view: "leaderboard",
    playerTab: "overview",
    historyFilter: "overall",
    expandedMatchIds: new Set()
};

document.addEventListener("DOMContentLoaded", () => {
    setupLiveConfig();
    applyRoute();
    bindStaticEvents();
    void loadData();
});

function setupLiveConfig() {
    const params = new URLSearchParams(window.location.search);
    state.apiUrl = params.get("api") || window.COB_STATS_API_URL || "";
    state.supabaseUrl = params.get("supabaseUrl") || window.COB_SUPABASE_URL || "";
    state.supabaseKey = params.get("supabaseKey") || window.COB_SUPABASE_KEY || "";
    state.supabaseTable = params.get("supabaseTable") || window.COB_SUPABASE_TABLE || "cob_stats_exports";
    state.supabaseRowId = params.get("supabaseRowId") || window.COB_SUPABASE_ROW_ID || "live";
    const pollMs = Number(params.get("pollMs") || window.COB_STATS_POLL_MS || DEFAULT_API_POLL_MS);
    state.pollMs = Number.isFinite(pollMs) && pollMs >= 3000 ? pollMs : DEFAULT_API_POLL_MS;
}

function bindStaticEvents() {
    const search = document.getElementById("player-search");
    search.addEventListener("input", (event) => {
        state.query = event.target.value.trim().toLowerCase();
        state.page = 1;
        render();
    });

    document.querySelectorAll("[data-sort]").forEach((button) => {
        button.addEventListener("click", () => setSort(button.dataset.sort));
    });

    document.getElementById("leaderboard-body").addEventListener("click", (event) => {
        if (event.target.closest("a")) return;
        const row = event.target.closest("[data-player-id]");
        if (row) routeToPlayer(row.dataset.playerId);
    });

    document.getElementById("back-to-leaderboard").addEventListener("click", () => routeToLeaderboard());

    document.getElementById("player-detail-body").addEventListener("click", (event) => {
        const tabButton = event.target.closest("[data-player-tab]");
        if (tabButton) {
            state.playerTab = tabButton.dataset.playerTab;
            updatePlayerHash();
            render();
            return;
        }

        const historyFilter = event.target.closest("[data-history-filter]");
        if (historyFilter) {
            state.historyFilter = historyFilter.dataset.historyFilter;
            state.expandedMatchIds.clear();
            render();
            return;
        }

        const matchToggle = event.target.closest("[data-match-toggle]");
        if (matchToggle) {
            const matchId = matchToggle.dataset.matchToggle;
            if (state.expandedMatchIds.has(matchId)) {
                state.expandedMatchIds.delete(matchId);
            } else {
                state.expandedMatchIds.add(matchId);
            }
            render();
        }
    });

    window.addEventListener("hashchange", () => {
        applyRoute();
        render();
    });
}

function applyRoute() {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) {
        state.view = "leaderboard";
        return;
    }
    const params = new URLSearchParams(hash);
    const playerId = params.get("player");
    const tab = params.get("tab");
    if (!playerId) {
        state.view = "leaderboard";
        return;
    }
    state.view = "player";
    state.selectedId = playerId;
    state.playerTab = PLAYER_TABS[tab] ? tab : "overview";
}

function routeToPlayer(playerId, tab = state.playerTab || "overview") {
    if (!playerId) return;
    state.selectedId = playerId;
    state.view = "player";
    state.playerTab = PLAYER_TABS[tab] ? tab : "overview";
    updatePlayerHash();
}

function updatePlayerHash() {
    if (!state.selectedId) return;
    const hash = `player=${encodeURIComponent(state.selectedId)}&tab=${encodeURIComponent(state.playerTab)}`;
    if (window.location.hash.replace(/^#/, "") !== hash) {
        window.location.hash = hash;
    }
}

function routeToLeaderboard() {
    state.view = "leaderboard";
    state.expandedMatchIds.clear();
    history.pushState("", document.title, window.location.pathname + window.location.search);
    render();
}

async function loadData() {
    await refreshData({ initial: true });
    if (!state.supabaseUrl && !state.apiUrl) return;

    window.clearInterval(state.refreshTimer);
    state.refreshTimer = window.setInterval(() => {
        void refreshData({ initial: false });
    }, state.pollMs);
}

async function refreshData({ initial }) {
    const supabaseData = await fetchSupabaseExport();
    if (isStatsExport(supabaseData)) {
        applyData(supabaseData, false, "Supabase database");
        return;
    }

    if (state.apiUrl) {
        const apiData = await fetchJson(state.apiUrl);
        if (isStatsExport(apiData)) {
            applyData(apiData, false, "Live API");
            return;
        }
    }

    if (!initial && state.data) return;

    let data = await fetchJson("./data/stats.json");
    let preview = false;
    let dataMode = "Static file";
    if (!hasTrackedPlayers(data)) {
        const sample = await fetchJson("./data/stats.sample.json");
        if (sample) {
            data = sample;
            preview = true;
            dataMode = "Sample data";
        }
    }

    applyData(data || emptyExport(), preview, dataMode);
}

async function fetchSupabaseExport() {
    if (!state.supabaseUrl || !state.supabaseKey) return null;

    const baseUrl = state.supabaseUrl.replace(/\/+$/, "");
    const table = encodeURIComponent(state.supabaseTable || "cob_stats_exports");
    const rowId = encodeURIComponent(state.supabaseRowId || "live");
    const url = `${baseUrl}/rest/v1/${table}?id=eq.${rowId}&select=payload&limit=1`;

    try {
        const response = await fetch(url, {
            cache: "no-store",
            headers: {
                "apikey": state.supabaseKey,
                "Authorization": `Bearer ${state.supabaseKey}`,
                "Accept": "application/json"
            }
        });
        if (!response.ok) return null;

        const rows = await response.json();
        return rows?.[0]?.payload || null;
    } catch (error) {
        console.error("Failed to load Supabase stats", error);
        return null;
    }
}

function applyData(data, preview, dataMode) {
    const signature = exportSignature(data);
    if (signature === state.dataSignature && state.preview === preview && state.dataMode === dataMode) return;

    const previousSelectedId = state.selectedId;
    state.data = data;
    state.preview = preview;
    state.dataMode = dataMode;
    state.dataSignature = signature;

    if (previousSelectedId && profileById(previousSelectedId)) {
        state.selectedId = previousSelectedId;
    } else {
        state.selectedId = state.data.profiles?.[0]?.playerId || null;
        if (state.view === "player" && !state.selectedId) state.view = "leaderboard";
    }

    const rowCount = filteredPlayers().length;
    const totalPages = Math.max(1, Math.ceil(rowCount / state.pageSize));
    state.page = Math.min(state.page, totalPages);
    render();
}

async function fetchJson(path) {
    try {
        const response = await fetch(path, { cache: "no-store" });
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        console.error("Failed to load", path, error);
        return null;
    }
}

function isStatsExport(data) {
    return Boolean(data?.modes && Array.isArray(data.profiles));
}

function exportSignature(data) {
    if (!data) return "";
    const modeParts = Object.entries(data.modes || {})
        .map(([id, mode]) => `${id}:${mode.totalPlayers || 0}:${mode.players?.length || 0}`)
        .join(",");
    return `${data.schemaVersion || ""}|${data.generatedAt || ""}|${data.profiles?.length || 0}|${modeParts}`;
}

function hasTrackedPlayers(data) {
    if (!data?.modes) return false;
    return Object.values(data.modes).some((mode) => Array.isArray(mode.players) && mode.players.length > 0);
}

function emptyExport() {
    return {
        generatedAt: null,
        sourceFile: "match_leaderboards_web.json",
        supportedSorts: Object.keys(SORT_LABELS),
        modes: {
            battleRoyale: { id: "battleRoyale", label: "Battle Royale", totalPlayers: 0, leaderboards: {}, players: [] },
            deathmatch: { id: "deathmatch", label: "Deathmatch", totalPlayers: 0, leaderboards: {}, players: [] }
        },
        profiles: []
    };
}

function render() {
    renderModeTabs();
    renderSortHeaders();
    renderSummary();
    renderTable();
    renderProfilePreview();
    renderRoute();
}

function renderRoute() {
    document.querySelector(".dashboard").classList.toggle("hidden", state.view !== "leaderboard");
    document.getElementById("player-view").classList.toggle("hidden", state.view !== "player");
    if (state.view === "player") renderPlayerDetail();
}

function renderModeTabs() {
    const container = document.getElementById("mode-tabs");
    container.innerHTML = "";
    for (const modeId of Object.keys(MODE_LABELS)) {
        const button = createPill(MODE_LABELS[modeId], state.mode === modeId, () => {
            state.mode = modeId;
            state.page = 1;
            render();
        });
        button.classList.add("tab-pill");
        container.appendChild(button);
    }
    document.getElementById("leaderboard-title").textContent = `${MODE_LABELS[state.mode]} ranking`;
}

function renderSortHeaders() {
    document.querySelectorAll("[data-sort]").forEach((button) => {
        const active = button.dataset.sort === state.sort;
        button.classList.toggle("active", active);
        button.setAttribute("aria-sort", active ? (state.sortDirection === "desc" ? "descending" : "ascending") : "none");
    });

    document.querySelectorAll("[data-sort-indicator]").forEach((indicator) => {
        indicator.textContent = indicator.dataset.sortIndicator === state.sort
            ? (state.sortDirection === "desc" ? "v" : "^")
            : "";
    });
}

function renderSummary() {
    const mode = currentMode();
    const players = mode.players || [];
    const count = document.getElementById("leaderboard-count");
    const noun = players.length === 1 ? "player" : "players";
    const modeLabel = state.mode === "overall" ? "across all modes" : `in ${MODE_LABELS[state.mode]}`;
    count.textContent = `${players.length} tracked ${noun} ${modeLabel}`;
}

function renderTable() {
    const rows = filteredPlayers();
    const body = document.getElementById("leaderboard-body");
    const empty = document.getElementById("empty-state");
    const wrap = document.querySelector(".table-wrap");

    body.innerHTML = "";

    if (rows.length === 0) {
        empty.classList.remove("hidden");
        wrap.classList.add("hidden");
        renderPagination(0, 0);
        return;
    }

    empty.classList.add("hidden");
    wrap.classList.remove("hidden");

    const start = (state.page - 1) * state.pageSize;
    const pageRows = rows.slice(start, start + state.pageSize);
    pageRows.forEach((player, index) => {
        const displayRank = start + index + 1;
        const stats = normalizeStats(player.stats);
        const derived = normalizeDerived(player.derived, stats);
        const tr = document.createElement("tr");
        if (player.playerId === state.selectedId) tr.classList.add("selected");
        tr.dataset.playerId = player.playerId;

        tr.innerHTML = `
            <td><span class="rank-badge rank-${Math.min(displayRank, 3)}">${displayRank}</span></td>
            <td>
                <div class="player-name">
                    <strong>${escapeHtml(player.name)}</strong>
                    <a class="profile-link" href="#player=${encodeURIComponent(player.playerId)}&tab=overview">Profile</a>
                </div>
            </td>
            <td>${stats.wins}</td>
            <td>${stats.kills}</td>
            <td>${stats.games}</td>
            <td>${stats.deaths}</td>
            <td>${formatPercent(derived.winRate)}</td>
            <td>${formatNumber(derived.avgKills)}</td>
            <td>${formatDuration(stats.playtimeSeconds)}</td>
            <td>${formatPercent(derived.headshotRate)}</td>
            <td>${formatNumber(derived.kdRatio)}</td>
        `;
        body.appendChild(tr);
    });

    renderPagination(rows.length, Math.ceil(rows.length / state.pageSize));
}

function renderPagination(totalRows, totalPages) {
    const container = document.getElementById("pagination");
    container.innerHTML = "";
    if (totalRows <= 0) return;

    const left = document.createElement("div");
    left.className = "page-status";
    const start = (state.page - 1) * state.pageSize + 1;
    const end = Math.min(totalRows, state.page * state.pageSize);
    left.textContent = `Showing ${start}-${end} of ${totalRows}`;

    const right = document.createElement("div");
    right.className = "tab-row";

    right.appendChild(createPageButton("Prev", state.page > 1, () => {
        state.page -= 1;
        render();
    }));

    for (const page of pageWindow(totalPages, state.page, 5)) {
        const button = createPageButton(String(page), true, () => {
            state.page = page;
            render();
        });
        if (page === state.page) button.classList.add("active");
        right.appendChild(button);
    }

    right.appendChild(createPageButton("Next", state.page < totalPages, () => {
        state.page += 1;
        render();
    }));

    container.appendChild(left);
    container.appendChild(right);
}

function renderProfilePreview() {
    const container = document.getElementById("profile-body");
    const profile = profileById(state.selectedId);
    document.getElementById("profile-title").textContent = profile?.name || "Select a player";

    if (!profile) {
        container.innerHTML = `<div class="profile-placeholder"><p>Pick a player row to inspect their stats.</p></div>`;
        return;
    }

    const overall = buildProfileOverall(profile);
    container.innerHTML = `
        <button class="primary-action" type="button" id="open-full-profile">Open Full Profile</button>
        ${renderModeBlock("Overall", overall, { compact: true })}
        ${renderModeBlock("Battle Royale", profile.battleRoyale, { compact: true })}
        ${renderModeBlock("Deathmatch", profile.deathmatch, { compact: true })}
    `;
    document.getElementById("open-full-profile").addEventListener("click", () => routeToPlayer(profile.playerId));
}

function renderPlayerDetail() {
    const profile = profileById(state.selectedId);
    const title = document.getElementById("player-detail-title");
    const subtitle = document.getElementById("player-detail-subtitle");
    const body = document.getElementById("player-detail-body");

    if (!profile) {
        title.textContent = "Player not found";
        subtitle.textContent = "";
        body.innerHTML = `<div class="profile-placeholder"><p>This player is not in the current stats export.</p></div>`;
        return;
    }

    title.textContent = profile.name;
    subtitle.textContent = "Stats update when the server publishes new data.";

    const tabs = renderPlayerTabs();
    const content = renderPlayerTabContent(profile);
    body.innerHTML = `${tabs}${content}`;
}

function renderPlayerTabs() {
    return `
        <nav class="player-tabs" aria-label="Player sections">
            ${Object.entries(PLAYER_TABS).map(([id, label]) => `
                <button class="tab-pill ${state.playerTab === id ? "active" : ""}" type="button" data-player-tab="${escapeHtml(id)}">${escapeHtml(label)}</button>
            `).join("")}
        </nav>
    `;
}

function renderPlayerTabContent(profile) {
    switch (state.playerTab) {
        case "battleRoyale":
            return renderBattleRoyaleTab(profile);
        case "deathmatch":
            return renderDeathmatchTab(profile);
        case "maps":
            return renderMapsTab(profile);
        case "weapons":
            return renderWeaponsTab(profile);
        case "history":
            return renderHistoryTab(profile);
        case "overview":
        default:
            return renderOverviewTab(profile);
    }
}

function renderOverviewTab(profile) {
    const overall = buildProfileOverall(profile);
    const br = normalizePlayer(profile.battleRoyale);
    const dm = normalizePlayer(profile.deathmatch);
    const weapons = combinedWeapons(profile);
    const favoriteWeapon = weapons[0] || null;
    const stats = normalizeStats(overall?.stats);
    const derived = normalizeDerived(overall?.derived, stats);

    return `
        <section class="detail-grid">
            ${renderStatCard("Wins", stats.wins)}
            ${renderStatCard("Kills", stats.kills)}
            ${renderStatCard("Games", stats.games)}
            ${renderStatCard("Playtime", formatDuration(stats.playtimeSeconds))}
            ${renderStatCard("Win Rate", formatPercent(derived.winRate))}
            ${renderStatCard("HS%", formatPercent(derived.headshotRate))}
            ${renderStatCard("Highest Streak", Math.max(br.stats.bestKillStreak, dm.stats.bestKillStreak))}
            ${renderStatCard("Top DM Kills", dm.stats.topMatchKills)}
        </section>
        <section class="detail-section">
            <h3>Profile Snapshot</h3>
            <div class="snapshot-grid">
                ${renderSnapshotItem("Favorite Weapon", favoriteWeapon ? favoriteWeapon.label : "-")}
                ${renderSnapshotItem("BR Best Placement", br.details?.battleRoyalePlacement?.best ? `#${br.details.battleRoyalePlacement.best}` : "-")}
                ${renderSnapshotItem("Favorite DM Kit", dm.details?.favoriteKit?.label || "-")}
                ${renderSnapshotItem("Utility Kills", stats.utilityKills)}
                ${renderSnapshotItem("Vehicle Kills", stats.vehicleKills)}
                ${renderSnapshotItem("Headshot Kills", stats.headshotKills)}
            </div>
        </section>
    `;
}

function renderBattleRoyaleTab(profile) {
    const player = normalizePlayer(profile.battleRoyale);
    if (!player.exists) return renderEmptyDetail("No Battle Royale games have been played yet.");
    const placement = player.details?.battleRoyalePlacement || {};
    return `
        ${renderModeBlock("Battle Royale", player)}
        <section class="detail-section">
            <h3>Placement</h3>
            <div class="snapshot-grid">
                ${renderSnapshotItem("Best", placement.best ? `#${placement.best}` : "-")}
                ${renderSnapshotItem("Average", placement.average ? `#${formatNumber(placement.average)}` : "-")}
                ${renderSnapshotItem("Top 3", placement.top3 || 0)}
                ${renderSnapshotItem("Top 5", placement.top5 || 0)}
                ${renderSnapshotItem("Top 10", placement.top10 || 0)}
            </div>
        </section>
        ${renderWeaponTable("BR Weapons", player.details?.weapons || [])}
    `;
}

function renderDeathmatchTab(profile) {
    const player = normalizePlayer(profile.deathmatch);
    if (!player.exists) return renderEmptyDetail("No Deathmatch games have been played yet.");
    return `
        ${renderModeBlock("Deathmatch", player)}
        <section class="detail-section">
            <h3>Deathmatch Details</h3>
            <div class="snapshot-grid">
                ${renderSnapshotItem("Top Match Kills", player.stats.topMatchKills)}
                ${renderSnapshotItem("Highest Streak", player.stats.bestKillStreak)}
                ${renderSnapshotItem("Favorite Kit", player.details?.favoriteKit?.label || "-")}
                ${renderSnapshotItem("Favorite Map", player.details?.favoriteMap?.label || "-")}
            </div>
        </section>
        ${renderBreakdownTable("Maps", player.details?.deathmatchMaps || [], { wide: true })}
        ${renderBreakdownTable("Kits", player.details?.deathmatchKits || [], { wide: true })}
    `;
}

function renderMapsTab(profile) {
    const dm = normalizePlayer(profile.deathmatch);
    const maps = dm.details?.deathmatchMaps || [];
    return maps.length
        ? renderBreakdownTable("Deathmatch Maps", maps, { wide: true })
        : renderEmptyDetail("No map stats yet. New Deathmatch games will start filling this in.");
}

function renderWeaponsTab(profile) {
    const overall = combinedWeapons(profile);
    const br = normalizePlayer(profile.battleRoyale).details?.weapons || [];
    const dm = normalizePlayer(profile.deathmatch).details?.weapons || [];
    if (overall.length === 0) return renderEmptyDetail("No weapon stats yet. Weapon tables start filling in after the updated server jar records new hits and kills.");
    return `
        ${renderWeaponTable("All Weapons", overall)}
        ${renderWeaponTable("Battle Royale Weapons", br)}
        ${renderWeaponTable("Deathmatch Weapons", dm)}
    `;
}

function renderHistoryTab(profile) {
    return `
        <section class="detail-section">
            <div class="history-heading">
                <h3>Match History</h3>
                <span>Local time: ${escapeHtml(viewerTimeZoneLabel())}</span>
            </div>
            <div class="history-filters">
                ${Object.entries(MODE_LABELS).map(([id, label]) => `
                    <button class="tab-pill ${state.historyFilter === id ? "active" : ""}" type="button" data-history-filter="${escapeHtml(id)}">${escapeHtml(label)}</button>
                `).join("")}
            </div>
            ${renderHistoryList(filteredHistory(profile, state.historyFilter), { expandable: true })}
        </section>
    `;
}

function renderHistoryList(matches, { expandable }) {
    if (!matches || matches.length === 0) return `<p class="mode-empty">No game history yet.</p>`;
    return `
        <div class="history-list detail-history">
            ${matches.map((match) => renderMatchHistoryRow(match, { expandable })).join("")}
        </div>
    `;
}

function renderMatchHistoryRow(match, { expandable }) {
    const result = match.won ? "Win" : "Loss";
    const resultClass = match.won ? "win" : "loss";
    const mode = match.modeLabel || MODE_LABELS[match.mode] || "Match";
    const expanded = state.expandedMatchIds.has(match.matchId);
    const placement = match.mode === "battleRoyale" && match.placement ? `<span>${escapeHtml(formatPlacement(match.placement))} place</span>` : "";
    const finalScore = match.mode === "deathmatch" && hasMatchScore(match)
        ? `<span>Final score Red ${escapeHtml(String(match.redScore))} - ${escapeHtml(String(match.blueScore))} Blue</span>`
        : "";
    const buttonAttrs = expandable ? `button type="button" data-match-toggle="${escapeHtml(match.matchId)}"` : "article";
    const closeTag = expandable ? "button" : "article";

    return `
        <article class="history-card ${expanded ? "expanded" : ""}">
            <${buttonAttrs} class="history-row">
                <div>
                    <strong class="${resultClass}">${result}</strong>
                    <span>${escapeHtml(mode)} - ${escapeHtml(String(match.playerCount || 0))} players</span>
                    ${placement}
                    ${finalScore}
                </div>
                <div>
                    <strong>${escapeHtml(String(match.kills || 0))} / ${escapeHtml(String(match.deaths || 0))}</strong>
                    <span>K / D</span>
                </div>
                <div>
                    <strong>${formatPercent(rate(match.headshots, match.hits))}</strong>
                    <span>HS%</span>
                </div>
                <time datetime="${escapeHtml(match.endedAt || "")}" title="${escapeHtml(formatFullLocalDate(match.endedAt))}">${escapeHtml(formatShortDate(match.endedAt))}</time>
            </${closeTag}>
            ${expanded ? renderMatchParticipants(match) : ""}
        </article>
    `;
}

function renderMatchParticipants(match) {
    const participants = match.participants || [];
    if (participants.length === 0) {
        return `<div class="match-expanded"><p class="mode-empty">Detailed roster was not saved for this match.</p></div>`;
    }
    return `
        <div class="match-expanded">
            <div class="match-roster">
                ${participants.map((player, index) => `
                    <article class="roster-row ${player.won ? "winner" : ""}">
                        <strong>${escapeHtml(match.mode === "battleRoyale" && player.placement ? formatPlacement(player.placement) : `#${index + 1}`)}</strong>
                        ${player.playerId ? `<a class="roster-player-link" href="#player=${encodeURIComponent(player.playerId)}&tab=overview">${escapeHtml(player.name || "Unknown")}</a>` : `<span>${escapeHtml(player.name || "Unknown")}</span>`}
                        <span>${escapeHtml(String(player.kills || 0))} K</span>
                        <span>${escapeHtml(String(player.deaths || 0))} D</span>
                        <span>${formatPercent(rate(player.headshots, player.hits))} HS</span>
                        <span>${escapeHtml(player.topWeapon || "-")}</span>
                    </article>
                `).join("")}
            </div>
        </div>
    `;
}

function renderModeBlock(label, payload, options = {}) {
    const player = normalizePlayer(payload);
    if (!player.exists) {
        return `
            <section class="mode-block">
                <h3>${escapeHtml(label)}</h3>
                <p class="mode-empty">No games have been played yet.</p>
            </section>
        `;
    }

    const stats = player.stats;
    const derived = player.derived;
    const compact = options.compact;
    const statItems = [
        ["Wins", stats.wins],
        ["Kills", stats.kills],
        ["Games", stats.games],
        ["Deaths", stats.deaths],
        ["Win Rate", formatPercent(derived.winRate)],
        ["Avg Kills", formatNumber(derived.avgKills)],
        ["Playtime", formatDuration(stats.playtimeSeconds)],
        ["HS%", formatPercent(derived.headshotRate)],
        ["KD Ratio", formatNumber(derived.kdRatio)]
    ];
    if (!compact) {
        statItems.push(["Highest Streak", stats.bestKillStreak]);
        statItems.push(["Top Match Kills", stats.topMatchKills]);
    }

    return `
        <section class="mode-block">
            <h3>${escapeHtml(label)}</h3>
            <div class="profile-stats">
                ${statItems.map(([statLabel, value]) => renderProfileStat(statLabel, value)).join("")}
            </div>
            ${compact ? "" : `
                <ul class="profile-rank-list">
                    <li>Rank by Wins: ${player.ranks.wins || "-"}</li>
                    <li>Rank by Kills: ${player.ranks.kills || "-"}</li>
                    <li>Rank by Games: ${player.ranks.games || "-"}</li>
                </ul>
            `}
        </section>
    `;
}

function renderBreakdownTable(title, entries, options = {}) {
    if (!entries || entries.length === 0) return "";
    return `
        <section class="detail-section">
            <h3>${escapeHtml(title)}</h3>
            <div class="breakdown-list ${options.wide ? "wide" : ""}">
                ${entries.map(renderBreakdownRow).join("")}
            </div>
        </section>
    `;
}

function renderBreakdownRow(entry) {
    const stats = normalizeStats(entry.stats);
    const derived = normalizeDerived(entry.derived, stats);
    return `
        <article class="breakdown-row">
            <strong>${escapeHtml(entry.label)}</strong>
            <span>${stats.games} games</span>
            <span>${formatNumber(derived.avgKills)} avg K</span>
            <span>${formatPercent(derived.winRate)} WR</span>
            <span>${formatNumber(derived.kdRatio)} KD</span>
            <span>${formatDuration(stats.playtimeSeconds)}</span>
        </article>
    `;
}

function renderWeaponTable(title, weapons) {
    if (!weapons || weapons.length === 0) return "";
    return `
        <section class="detail-section">
            <h3>${escapeHtml(title)}</h3>
            <div class="weapon-table">
                <div class="weapon-row heading">
                    <span>Weapon</span>
                    <span>Kills</span>
                    <span>Hits</span>
                    <span>HS%</span>
                    <span>HS Kills</span>
                    <span>Utility</span>
                    <span>Vehicle</span>
                </div>
                ${weapons.map(renderWeaponRow).join("")}
            </div>
        </section>
    `;
}

function renderWeaponRow(entry) {
    const stats = normalizeStats(entry.stats);
    const derived = normalizeDerived(entry.derived, stats);
    return `
        <article class="weapon-row">
            <strong>${escapeHtml(entry.label)}</strong>
            <span>${stats.kills}</span>
            <span>${stats.hits}</span>
            <span>${formatPercent(derived.headshotRate)}</span>
            <span>${stats.headshotKills}</span>
            <span>${stats.utilityKills}</span>
            <span>${stats.vehicleKills}</span>
        </article>
    `;
}

function renderStatCard(label, value) {
    return `<article class="detail-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></article>`;
}

function renderSnapshotItem(label, value) {
    return `<article class="snapshot-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></article>`;
}

function renderProfileStat(label, value) {
    return `<div class="profile-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function renderEmptyDetail(text) {
    return `<section class="detail-section"><p class="mode-empty">${escapeHtml(text)}</p></section>`;
}

function filteredPlayers() {
    const players = [...(currentMode().players || [])];
    players.sort(comparePlayers(state.sort));
    if (!state.query) return players;
    return players.filter((player) => player.name.toLowerCase().includes(state.query));
}

function currentMode() {
    if (state.mode === "overall") return buildOverallMode();
    return state.data?.modes?.[state.mode] || { players: [] };
}

function buildOverallMode() {
    const players = (state.data?.profiles || []).map(buildOverallPlayer).filter(Boolean);
    applyRanks(players);
    return {
        id: "overall",
        label: "Overall",
        totalPlayers: players.length,
        players
    };
}

function buildOverallPlayer(profile) {
    if (!profile) return null;
    const stats = combineStats(profile.battleRoyale?.stats, profile.deathmatch?.stats);
    if (stats.games <= 0) return null;
    return {
        playerId: profile.playerId,
        name: profile.name,
        stats,
        ranks: { wins: 0, kills: 0, games: 0 },
        derived: derivedFromStats(stats)
    };
}

function buildProfileOverall(profile) {
    const player = buildOverallPlayer(profile);
    if (!player) return null;
    const overall = buildOverallMode();
    const ranked = overall.players.find((entry) => entry.playerId === player.playerId);
    return ranked || player;
}

function combineStats(...statsList) {
    return statsList.reduce((total, stats) => {
        const next = normalizeStats(stats);
        total.wins += next.wins;
        total.kills += next.kills;
        total.deaths += next.deaths;
        total.games += next.games;
        total.playtimeSeconds += next.playtimeSeconds;
        total.hits += next.hits;
        total.headshots += next.headshots;
        total.headshotKills += next.headshotKills;
        total.bestKillStreak = Math.max(total.bestKillStreak, next.bestKillStreak);
        total.topMatchKills = Math.max(total.topMatchKills, next.topMatchKills);
        total.utilityKills += next.utilityKills;
        total.vehicleKills += next.vehicleKills;
        return total;
    }, normalizeStats(null));
}

function normalizePlayer(player) {
    if (!player) {
        return {
            exists: false,
            playerId: "",
            name: "",
            stats: normalizeStats(null),
            ranks: { wins: 0, kills: 0, games: 0 },
            derived: derivedFromStats(normalizeStats(null)),
            details: {}
        };
    }
    const stats = normalizeStats(player.stats);
    return {
        ...player,
        exists: true,
        stats,
        ranks: player.ranks || { wins: 0, kills: 0, games: 0 },
        derived: normalizeDerived(player.derived, stats),
        details: player.details || {}
    };
}

function normalizeStats(stats) {
    return {
        wins: number(stats?.wins),
        kills: number(stats?.kills),
        deaths: number(stats?.deaths),
        games: number(stats?.games ?? stats?.matches),
        playtimeSeconds: number(stats?.playtimeSeconds),
        hits: number(stats?.hits),
        headshots: number(stats?.headshots),
        headshotKills: number(stats?.headshotKills),
        bestKillStreak: number(stats?.bestKillStreak),
        topMatchKills: number(stats?.topMatchKills),
        utilityKills: number(stats?.utilityKills),
        vehicleKills: number(stats?.vehicleKills)
    };
}

function normalizeDerived(derived, stats) {
    const fallback = derivedFromStats(stats);
    return {
        winRate: number(derived?.winRate ?? fallback.winRate),
        avgKills: number(derived?.avgKills ?? fallback.avgKills),
        avgDeaths: number(derived?.avgDeaths ?? fallback.avgDeaths),
        kdRatio: number(derived?.kdRatio ?? fallback.kdRatio),
        avgPlaytimeSeconds: number(derived?.avgPlaytimeSeconds ?? fallback.avgPlaytimeSeconds),
        headshotRate: number(derived?.headshotRate ?? fallback.headshotRate)
    };
}

function derivedFromStats(stats) {
    const games = number(stats?.games);
    const deaths = number(stats?.deaths);
    const kills = number(stats?.kills);
    const hits = number(stats?.hits);
    return {
        winRate: games > 0 ? round2(number(stats?.wins) / games) : 0,
        avgKills: games > 0 ? round2(kills / games) : 0,
        avgDeaths: games > 0 ? round2(deaths / games) : 0,
        kdRatio: deaths > 0 ? round2(kills / deaths) : (kills > 0 ? kills : 0),
        avgPlaytimeSeconds: games > 0 ? round2(number(stats?.playtimeSeconds) / games) : 0,
        headshotRate: hits > 0 ? round2(number(stats?.headshots) / hits) : 0
    };
}

function combinedWeapons(profile) {
    const merged = new Map();
    for (const entry of [
        ...(profile.battleRoyale?.details?.weapons || []),
        ...(profile.deathmatch?.details?.weapons || [])
    ]) {
        if (!entry?.id) continue;
        const current = merged.get(entry.id) || {
            id: entry.id,
            label: entry.label,
            stats: normalizeStats(null)
        };
        current.stats = combineStats(current.stats, entry.stats);
        current.derived = derivedFromStats(current.stats);
        merged.set(entry.id, current);
    }
    return [...merged.values()].sort((a, b) => {
        const kills = normalizeStats(b.stats).kills - normalizeStats(a.stats).kills;
        if (kills) return kills;
        return normalizeStats(b.stats).hits - normalizeStats(a.stats).hits;
    });
}

function filteredHistory(profile, mode) {
    const matches = profile?.recentMatches || [];
    if (mode === "overall") return matches;
    return matches.filter((match) => match.mode === mode);
}

function profileById(playerId) {
    return (state.data?.profiles || []).find((entry) => entry.playerId === playerId) || null;
}

function applyRanks(players) {
    for (const sort of ["wins", "kills", "games"]) {
        [...players].sort(comparePlayersBy(sort, "desc")).forEach((player, index) => {
            player.ranks[sort] = index + 1;
        });
    }
}

function comparePlayers(sort) {
    return comparePlayersBy(sort, state.sortDirection);
}

function comparePlayersBy(sort, directionId) {
    return (a, b) => {
        const direction = directionId === "asc" ? 1 : -1;
        const primary = (sortValue(a, sort) - sortValue(b, sort)) * direction;
        if (primary !== 0) return primary;
        const secondary = normalizeStats(b.stats).wins - normalizeStats(a.stats).wins;
        if (secondary !== 0) return secondary;
        const tertiary = normalizeStats(b.stats).kills - normalizeStats(a.stats).kills;
        if (tertiary !== 0) return tertiary;
        return a.name.localeCompare(b.name);
    };
}

function sortValue(player, sort) {
    const stats = normalizeStats(player.stats);
    const derived = normalizeDerived(player.derived, stats);
    switch (sort) {
        case "kills":
            return stats.kills;
        case "games":
            return stats.games;
        case "deaths":
            return stats.deaths;
        case "winRate":
            return derived.winRate;
        case "avgKills":
            return derived.avgKills;
        case "playtimeSeconds":
            return stats.playtimeSeconds;
        case "headshotRate":
            return derived.headshotRate;
        case "kdRatio":
            return derived.kdRatio;
        case "wins":
        default:
            return stats.wins;
    }
}

function setSort(sort) {
    if (!SORT_LABELS[sort]) return;
    if (state.sort === sort) {
        state.sortDirection = state.sortDirection === "desc" ? "asc" : "desc";
    } else {
        state.sort = sort;
        state.sortDirection = "desc";
    }
    state.page = 1;
    render();
}

function createPill(label, active, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    if (active) button.classList.add("active");
    button.addEventListener("click", onClick);
    return button;
}

function createPageButton(label, enabled, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "page-button";
    button.textContent = label;
    button.disabled = !enabled;
    if (enabled) button.addEventListener("click", onClick);
    return button;
}

function pageWindow(totalPages, currentPage, radius) {
    const start = Math.max(1, currentPage - radius);
    const end = Math.min(totalPages, currentPage + radius);
    const pages = [];
    for (let page = start; page <= end; page++) pages.push(page);
    return pages;
}

function number(value) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function rate(part, total) {
    return number(total) > 0 ? number(part) / number(total) : 0;
}

function formatPercent(value) {
    return `${Math.round((value || 0) * 100)}%`;
}

function formatNumber(value) {
    return Number(value || 0).toFixed(2).replace(/\.00$/, "");
}

function formatPlacement(value) {
    const place = Math.max(0, Math.round(number(value)));
    if (place <= 0) return "-";
    const lastTwo = place % 100;
    if (lastTwo >= 11 && lastTwo <= 13) return `${place}th`;
    switch (place % 10) {
        case 1: return `${place}st`;
        case 2: return `${place}nd`;
        case 3: return `${place}rd`;
        default: return `${place}th`;
    }
}

function hasMatchScore(match) {
    return match?.redScore !== null
        && match?.redScore !== undefined
        && match?.blueScore !== null
        && match?.blueScore !== undefined
        && Number.isFinite(Number(match.redScore))
        && Number.isFinite(Number(match.blueScore));
}

function formatDuration(seconds) {
    const total = Math.max(0, Math.round(number(seconds)));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${total}s`;
}

function round2(value) {
    return Math.round(value * 100) / 100;
}

function formatShortDate(value) {
    if (!value) return "Unknown time";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short"
    });
}

function formatFullLocalDate(value) {
    if (!value) return "Unknown time";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "long"
    });
}

function viewerTimeZoneLabel() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "your timezone";
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#39;");
}
