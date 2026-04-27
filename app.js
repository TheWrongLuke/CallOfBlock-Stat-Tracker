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
    kdRatio: "KD"
};

const DEFAULT_API_POLL_MS = 10000;

const state = {
    data: null,
    preview: false,
    dataMode: "Static file",
    apiUrl: "",
    pollMs: DEFAULT_API_POLL_MS,
    refreshTimer: null,
    mode: "overall",
    sort: "wins",
    sortDirection: "desc",
    page: 1,
    pageSize: 20,
    query: "",
    selectedId: null
};

document.addEventListener("DOMContentLoaded", () => {
    setupLiveConfig();
    bindStaticEvents();
    void loadData();
});

function setupLiveConfig() {
    const params = new URLSearchParams(window.location.search);
    state.apiUrl = params.get("api") || window.COB_STATS_API_URL || "";
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
        button.addEventListener("click", () => {
            setSort(button.dataset.sort);
        });
    });
}

async function loadData() {
    await refreshData({ initial: true });
    if (!state.apiUrl) return;

    window.clearInterval(state.refreshTimer);
    state.refreshTimer = window.setInterval(() => {
        void refreshData({ initial: false });
    }, state.pollMs);
}

async function refreshData({ initial }) {
    if (state.apiUrl) {
        const apiData = await fetchJson(state.apiUrl);
        if (isStatsExport(apiData)) {
            applyData(apiData, false, "Live API");
            return;
        }
    }

    if (!initial && state.data) {
        return;
    }

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

function applyData(data, preview, dataMode) {
    const previousSelectedId = state.selectedId;
    state.data = data;
    state.preview = preview;
    state.dataMode = dataMode;
    if (previousSelectedId && (state.data.profiles || []).some((profile) => profile.playerId === previousSelectedId)) {
        state.selectedId = previousSelectedId;
    } else {
        state.selectedId = state.data.profiles?.[0]?.playerId || null;
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

function hasTrackedPlayers(data) {
    if (!data?.modes) return false;
    return Object.values(data.modes).some((mode) => Array.isArray(mode.players) && mode.players.length > 0);
}

function emptyExport() {
    return {
        generatedAt: null,
        sourceFile: "match_leaderboards_web.json",
        supportedSorts: ["wins", "kills", "games"],
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
    renderProfile();
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
    const summary = [
        { label: "Tracked Players", value: players.length, helper: MODE_LABELS[state.mode] }
    ];

    const container = document.getElementById("summary-grid");
    container.innerHTML = "";
    for (const item of summary) {
        const card = document.createElement("article");
        card.className = "summary-card";
        card.innerHTML = `<span>${escapeHtml(item.label)}</span><strong>${escapeHtml(String(item.value))}</strong><span>${escapeHtml(item.helper)}</span>`;
        container.appendChild(card);
    }
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
        const tr = document.createElement("tr");
        if (player.playerId === state.selectedId) tr.classList.add("selected");
        tr.addEventListener("click", () => {
            state.selectedId = player.playerId;
            render();
        });

        tr.innerHTML = `
            <td><span class="rank-badge rank-${Math.min(displayRank, 3)}">${displayRank}</span></td>
            <td>
                <div class="player-name">
                    <strong>${escapeHtml(player.name)}</strong>
                </div>
            </td>
            <td>${player.stats.wins}</td>
            <td>${player.stats.kills}</td>
            <td>${player.stats.games}</td>
            <td>${player.stats.deaths}</td>
            <td>${formatPercent(player.derived.winRate)}</td>
            <td>${formatNumber(player.derived.avgKills)}</td>
            <td>${formatNumber(player.derived.kdRatio)}</td>
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

    const prev = createPageButton("Prev", state.page > 1, () => {
        if (state.page <= 1) return;
        state.page -= 1;
        render();
    });
    right.appendChild(prev);

    const visiblePages = pageWindow(totalPages, state.page, 5);
    for (const page of visiblePages) {
        const button = createPageButton(String(page), true, () => {
            state.page = page;
            render();
        });
        if (page === state.page) button.classList.add("active");
        right.appendChild(button);
    }

    const next = createPageButton("Next", state.page < totalPages, () => {
        if (state.page >= totalPages) return;
        state.page += 1;
        render();
    });
    right.appendChild(next);

    container.appendChild(left);
    container.appendChild(right);
}

function renderProfile() {
    const container = document.getElementById("profile-body");
    const profile = state.data?.profiles?.find((entry) => entry.playerId === state.selectedId) || null;
    document.getElementById("profile-title").textContent = profile?.name || "Select a player";

    if (!profile) {
        container.innerHTML = `<div class="profile-placeholder"><p>Pick a player row to inspect their Battle Royale and Deathmatch stats side by side.</p></div>`;
        return;
    }

    container.innerHTML = [
        renderModeBlock("Overall", buildProfileOverall(profile)),
        renderModeBlock("Battle Royale", profile.battleRoyale),
        renderModeBlock("Deathmatch", profile.deathmatch),
        renderMatchHistory(profile.recentMatches || [])
    ].join("");
}

function renderMatchHistory(matches) {
    const rows = [...matches].slice(0, 12);
    if (rows.length === 0) {
        return `
            <section class="mode-block history-block">
                <h3>Game History</h3>
                <p class="mode-empty">No game history yet.</p>
            </section>
        `;
    }

    return `
        <section class="mode-block history-block">
            <h3>Game History</h3>
            <div class="history-list">
                ${rows.map(renderMatchHistoryRow).join("")}
            </div>
        </section>
    `;
}

function renderMatchHistoryRow(match) {
    const result = match.won ? "Win" : "Loss";
    const resultClass = match.won ? "win" : "loss";
    const mode = match.modeLabel || MODE_LABELS[match.mode] || "Match";
    return `
        <article class="history-row">
            <div>
                <strong class="${resultClass}">${result}</strong>
                <span>${escapeHtml(mode)} • ${escapeHtml(String(match.playerCount || 0))} players</span>
            </div>
            <div>
                <strong>${escapeHtml(String(match.kills || 0))} / ${escapeHtml(String(match.deaths || 0))}</strong>
                <span>K / D</span>
            </div>
            <time datetime="${escapeHtml(match.endedAt || "")}">${escapeHtml(formatShortDate(match.endedAt))}</time>
        </article>
    `;
}

function renderModeBlock(label, payload) {
    if (!payload) {
        return `
            <section class="mode-block">
                <h3>${escapeHtml(label)}</h3>
                <p class="mode-empty">No games have been played yet.</p>
            </section>
        `;
    }

    return `
        <section class="mode-block">
            <h3>${escapeHtml(label)}</h3>
            <div class="profile-stats">
                ${renderProfileStat("Wins", payload.stats.wins)}
                ${renderProfileStat("Kills", payload.stats.kills)}
                ${renderProfileStat("Games", payload.stats.games)}
                ${renderProfileStat("Deaths", payload.stats.deaths)}
                ${renderProfileStat("Win Rate", formatPercent(payload.derived.winRate))}
                ${renderProfileStat("Avg Kills", formatNumber(payload.derived.avgKills))}
                ${renderProfileStat("Avg Deaths", formatNumber(payload.derived.avgDeaths))}
                ${renderProfileStat("KD Ratio", formatNumber(payload.derived.kdRatio))}
            </div>
            <ul class="profile-rank-list">
                <li>Rank by Wins: ${payload.ranks.wins || "-"}</li>
                <li>Rank by Kills: ${payload.ranks.kills || "-"}</li>
                <li>Rank by Games: ${payload.ranks.games || "-"}</li>
            </ul>
            ${label === "Deathmatch" ? renderDeathmatchDetails(payload.details) : ""}
        </section>
    `;
}

function renderDeathmatchDetails(details) {
    if (!details) return "";
    const maps = details.deathmatchMaps || [];
    const kits = details.deathmatchKits || [];
    if (maps.length === 0 && kits.length === 0) return "";

    return `
        <div class="dm-details">
            ${renderFavorite("Favorite Kit", details.favoriteKit)}
            ${renderBreakdownTable("Maps", maps)}
            ${renderBreakdownTable("Kits", kits)}
        </div>
    `;
}

function renderFavorite(label, entry) {
    if (!entry) return "";
    return `
        <div class="favorite-card">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(entry.label)}</strong>
            <small>${entry.stats.games} games - ${formatNumber(entry.derived.avgKills)} avg kills - ${formatPercent(entry.derived.winRate)} winrate</small>
        </div>
    `;
}

function renderBreakdownTable(title, entries) {
    if (!entries || entries.length === 0) return "";
    return `
        <div class="breakdown-block">
            <h4>${escapeHtml(title)}</h4>
            <div class="breakdown-list">
                ${entries.slice(0, 8).map(renderBreakdownRow).join("")}
            </div>
        </div>
    `;
}

function renderBreakdownRow(entry) {
    return `
        <article class="breakdown-row">
            <strong>${escapeHtml(entry.label)}</strong>
            <span>${entry.stats.games} games</span>
            <span>${formatNumber(entry.derived.avgKills)} avg K</span>
            <span>${formatPercent(entry.derived.winRate)} WR</span>
            <span>${formatNumber(entry.derived.kdRatio)} KD</span>
        </article>
    `;
}

function renderProfileStat(label, value) {
    return `<div class="profile-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
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
        if (!stats) return total;
        total.wins += Number(stats.wins || 0);
        total.kills += Number(stats.kills || 0);
        total.deaths += Number(stats.deaths || 0);
        total.games += Number(stats.games || 0);
        return total;
    }, { wins: 0, kills: 0, deaths: 0, games: 0 });
}

function derivedFromStats(stats) {
    const games = Number(stats.games || 0);
    const deaths = Number(stats.deaths || 0);
    const kills = Number(stats.kills || 0);
    return {
        winRate: games > 0 ? round2((stats.wins || 0) / games) : 0,
        avgKills: games > 0 ? round2(kills / games) : 0,
        avgDeaths: games > 0 ? round2(deaths / games) : 0,
        kdRatio: deaths > 0 ? round2(kills / deaths) : (kills > 0 ? kills : 0)
    };
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
        const secondary = b.stats.wins - a.stats.wins;
        if (secondary !== 0) return secondary;
        const tertiary = b.stats.kills - a.stats.kills;
        if (tertiary !== 0) return tertiary;
        return a.name.localeCompare(b.name);
    };
}

function sortValue(player, sort) {
    switch (sort) {
        case "kills":
            return player.stats.kills;
        case "games":
            return player.stats.games;
        case "deaths":
            return player.stats.deaths;
        case "winRate":
            return player.derived.winRate;
        case "avgKills":
            return player.derived.avgKills;
        case "kdRatio":
            return player.derived.kdRatio;
        case "wins":
        default:
            return player.stats.wins;
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

function average(items, getter) {
    if (items.length === 0) return 0;
    return items.reduce((sum, item) => sum + getter(item), 0) / items.length;
}

function best(items, getter) {
    if (items.length === 0) return 0;
    return items.reduce((max, item) => Math.max(max, getter(item)), 0);
}

function formatPercent(value) {
    return `${Math.round((value || 0) * 100)}%`;
}

function formatNumber(value) {
    return Number(value || 0).toFixed(2).replace(/\.00$/, "");
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
        minute: "2-digit"
    });
}

function formatDateTime(value) {
    try {
        return new Date(value).toLocaleString();
    } catch (error) {
        return value;
    }
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#39;");
}
