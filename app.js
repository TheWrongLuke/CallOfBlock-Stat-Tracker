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
    kdRatio: "KD",
    hits: "Hits",
    headshotKills: "Headshot Kills",
    utilityKills: "Utility Kills",
    vehicleKills: "Vehicle Kills"
};

const PLAYER_TABS = {
    overview: "Overview",
    battleRoyale: "Battle Royale",
    deathmatch: "Deathmatch",
    maps: "Maps",
    weapons: "Weapons",
    history: "History"
};

const MAIN_VIEWS = {
    players: "Players",
    weapons: "Weapons",
    maps: "Maps"
};

const DEFAULT_API_POLL_MS = 10000;
const DEFAULT_SKIN_NAME = "Steve";
const CHAMPION_ROTATE_MS = 5000;

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
    mainView: "players",
    sort: "wins",
    sortDirection: "desc",
    page: 1,
    pageSize: 20,
    query: "",
    selectedId: null,
    view: "home",
    profilePreviewOpen: false,
    playerTab: "overview",
    historyFilter: "overall",
    expandedMatchIds: new Set(),
    championMode: "battleRoyale",
    championTimer: null,
    championScrollTimer: null,
    cache: emptyCache()
};

document.addEventListener("DOMContentLoaded", () => {
    setupLiveConfig();
    applyRoute();
    bindStaticEvents();
    startChampionRotation();
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
    document.addEventListener("click", (event) => {
        const disabledLink = event.target.closest("a[aria-disabled='true']");
        if (disabledLink) {
            event.preventDefault();
            return;
        }

        const button = event.target.closest("[data-route]");
        if (button) {
            event.preventDefault();
            routeTo(button.dataset.route);
            return;
        }

        const championButton = event.target.closest("[data-champion-mode]");
        if (championButton) {
            event.preventDefault();
            showChampionMode(championButton.dataset.championMode, true);
        }
    });

    const search = document.getElementById("player-search");
    search.addEventListener("input", (event) => {
        state.query = event.target.value.trim().toLowerCase();
        state.page = 1;
        render();
    });

    document.querySelector(".leaderboard-table").addEventListener("click", (event) => {
        const button = event.target.closest("[data-sort]");
        if (button) setSort(button.dataset.sort);
    });

    document.getElementById("leaderboard-body").addEventListener("click", (event) => {
        if (event.target.closest("a")) return;
        const row = event.target.closest("[data-player-id]");
        if (row) {
            state.selectedId = row.dataset.playerId;
            state.profilePreviewOpen = true;
            render();
        }
    });

    document.getElementById("back-to-leaderboard").addEventListener("click", () => routeToLeaderboard());
    document.getElementById("close-profile-preview").addEventListener("click", () => {
        state.selectedId = null;
        state.profilePreviewOpen = false;
        render();
    });

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

    const championCarousel = document.getElementById("champion-carousel");
    championCarousel.addEventListener("scroll", () => {
        window.clearTimeout(state.championScrollTimer);
        state.championScrollTimer = window.setTimeout(() => {
            const mode = championCarousel.scrollLeft > championCarousel.clientWidth * 0.5 ? "deathmatch" : "battleRoyale";
            if (mode !== state.championMode) {
                state.championMode = mode;
                renderChampionControls();
            }
        }, 120);
    });

    window.addEventListener("hashchange", () => {
        applyRoute();
        render();
    });

    window.addEventListener("scroll", updateFloatingButtonPosition, { passive: true });
}

function startChampionRotation() {
    window.clearInterval(state.championTimer);
    state.championTimer = window.setInterval(() => {
        if (state.view !== "home") return;
        const nextMode = state.championMode === "battleRoyale" ? "deathmatch" : "battleRoyale";
        showChampionMode(nextMode, true);
    }, CHAMPION_ROTATE_MS);
}

function applyRoute() {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) {
        state.view = "home";
        return;
    }
    const params = new URLSearchParams(hash);
    const route = params.get("view") || hash;
    if (route === "home") {
        state.view = "home";
        return;
    }
    if (route === "leaderboards" || route === "leaderboard" || route === "weapons" || route === "maps") {
        state.view = "leaderboard";
        state.selectedId = null;
        state.profilePreviewOpen = false;
        const board = params.get("board") || (route === "weapons" || route === "maps" ? route : state.mainView);
        if (MAIN_VIEWS[board]) state.mainView = board;
        const mode = params.get("mode");
        if (MODE_LABELS[mode]) state.mode = mode;
        const sort = params.get("sort");
        if (SORT_LABELS[sort]) state.sort = sort;
        state.page = 1;
        return;
    }

    const playerId = params.get("player");
    const tab = params.get("tab");
    if (!playerId) {
        state.view = "home";
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
    state.profilePreviewOpen = false;
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

function routeTo(route) {
    if (route === "home") {
        state.view = "home";
        state.expandedMatchIds.clear();
        history.pushState("", document.title, window.location.pathname + window.location.search);
        render();
        return;
    }
    if (route === "weapons") {
        routeToLeaderboard({ mainView: "weapons", mode: "overall", sort: "kills" });
        return;
    }
    if (route === "maps") {
        routeToLeaderboard({ mainView: "maps", mode: state.mode, sort: "games" });
        return;
    }
    routeToLeaderboard({ mainView: "players" });
}

function routeToLeaderboard(options = {}) {
    routeToLeaderboardWithOptions(options);
}

function routeToLeaderboardWithOptions(options) {
    state.view = "leaderboard";
    state.expandedMatchIds.clear();
    state.selectedId = null;
    state.profilePreviewOpen = false;
    if (MAIN_VIEWS[options.mainView]) state.mainView = options.mainView;
    if (MODE_LABELS[options.mode]) state.mode = options.mode;
    if (SORT_LABELS[options.sort]) state.sort = options.sort;
    state.page = 1;
    const hash = `view=leaderboards&board=${encodeURIComponent(state.mainView)}&mode=${encodeURIComponent(state.mode)}&sort=${encodeURIComponent(state.sort)}`;
    if (window.location.hash.replace(/^#/, "") !== hash) {
        window.location.hash = hash;
    } else {
        render();
    }
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
    rebuildCache();

    if (previousSelectedId && profileById(previousSelectedId) && (state.view === "player" || state.profilePreviewOpen)) {
        state.selectedId = previousSelectedId;
    } else {
        state.selectedId = null;
        state.profilePreviewOpen = false;
        if (state.view === "player" && !state.selectedId) state.view = "leaderboard";
    }

    const rowCount = filteredLeaderboardRows().length;
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
        .map(([id, mode]) => {
            const totals = (mode.players || []).reduce((sum, player) => {
                const stats = normalizeStats(player.stats);
                sum.kills += stats.kills;
                sum.wins += stats.wins;
                sum.games += stats.games;
                sum.deaths += stats.deaths;
                return sum;
            }, { kills: 0, wins: 0, games: 0, deaths: 0 });
            return `${id}:${mode.totalPlayers || 0}:${mode.players?.length || 0}:${totals.wins}:${totals.kills}:${totals.games}:${totals.deaths}`;
        })
        .join(",");
    const profileParts = (data.profiles || []).map((profile) => {
        const br = normalizeStats(profile.battleRoyale?.stats);
        const dm = normalizeStats(profile.deathmatch?.stats);
        const last = (profile.recentMatches || [])[0]?.endedAt || "";
        return `${profile.playerId}:${br.games}:${br.kills}:${br.wins}:${dm.games}:${dm.kills}:${dm.wins}:${profile.recentMatches?.length || 0}:${last}`;
    }).join(",");
    const live = data.liveStatus || {};
    const livePart = `${live.onlinePlayers ?? ""}:${live.state ?? ""}:${live.mode ?? ""}:${live.mapId ?? ""}:${live.redScore ?? ""}:${live.blueScore ?? ""}:${live.matchPlayers ?? ""}:${live.alivePlayers ?? ""}:${live.teamMode ?? ""}`;
    return `${data.schemaVersion || ""}|${data.generatedAt || ""}|${data.profiles?.length || 0}|${modeParts}|${profileParts}|${livePart}`;
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

function emptyCache() {
    return {
        profiles: [],
        profileMap: new Map(),
        overallMode: { id: "overall", label: "Overall", totalPlayers: 0, players: [] },
        overallById: new Map(),
        weaponsByMode: { overall: [], battleRoyale: [], deathmatch: [] },
        maps: [],
        lastMatch: null
    };
}

function rebuildCache() {
    const profiles = Array.isArray(state.data?.profiles) ? state.data.profiles : [];
    const overallPlayers = profiles.map(buildOverallPlayer).filter(Boolean);
    applyRanks(overallPlayers);

    state.cache = {
        profiles,
        profileMap: new Map(profiles.map((profile) => [profile.playerId, profile])),
        overallMode: {
            id: "overall",
            label: "Overall",
            totalPlayers: overallPlayers.length,
            players: overallPlayers
        },
        overallById: new Map(overallPlayers.map((player) => [player.playerId, player])),
        weaponsByMode: {
            overall: aggregateWeapons(profiles, "overall"),
            battleRoyale: aggregateWeapons(profiles, "battleRoyale"),
            deathmatch: aggregateWeapons(profiles, "deathmatch")
        },
        maps: aggregateDeathmatchMaps(profiles),
        lastMatch: findLastMatch(profiles)
    };
}

function render() {
    renderHeroStatus();
    renderTopNav();
    renderHome();
    renderMainViewTabs();
    renderModeTabs();
    renderSummary();
    renderTable();
    renderSortHeaders();
    renderProfilePreview();
    renderRoute();
}

function renderRoute() {
    document.body.classList.toggle("home-route", state.view === "home");
    document.getElementById("home-view").classList.toggle("hidden", state.view !== "home");
    const dashboard = document.querySelector(".dashboard");
    dashboard.classList.toggle("hidden", state.view !== "leaderboard");
    dashboard.classList.toggle("profile-closed", state.view === "leaderboard" && !state.profilePreviewOpen);
    document.getElementById("player-view").classList.toggle("hidden", state.view !== "player");
    updateFloatingButtonPosition();
    if (state.view === "player") renderPlayerDetail();
}

function updateFloatingButtonPosition() {
    const compact = state.view === "home" && window.scrollY > 90;
    document.body.classList.toggle("home-scrolled", compact);
    if (state.view !== "home") document.body.classList.remove("home-scrolled");
}

function renderTopNav() {
    const floatingButton = document.querySelector(".tracker-float");
    if (floatingButton) {
        const onHome = state.view === "home";
        floatingButton.textContent = onHome ? "Tracker" : "Hub";
        floatingButton.dataset.route = onHome ? "leaderboard" : "home";
    }
}

function renderHome() {
    renderHomeLatestMatch();
    renderFeaturedList("battleRoyale", document.getElementById("featured-battle-royale"));
    renderFeaturedList("deathmatch", document.getElementById("featured-deathmatch"));
    renderChampionControls();
    window.requestAnimationFrame(() => syncChampionScroll(false));
}

function renderHomeLatestMatch() {
    const container = document.getElementById("home-latest-match");
    const match = state.cache.lastMatch;
    if (!match) {
        container.innerHTML = `
            <div class="latest-empty">
                <strong>No games have been played yet</strong>
                <span>The latest match card will appear after the next completed round.</span>
            </div>
        `;
        return;
    }

    const mode = match.modeLabel || MODE_LABELS[match.mode] || "Match";
    const players = number(match.playerCount);
    const winner = matchWinnerText(match);
    const score = match.mode === "deathmatch" && hasMatchScore(match)
        ? `<span>Final score Red ${escapeHtml(String(match.redScore))} - ${escapeHtml(String(match.blueScore))} Blue</span>`
        : "";

    container.innerHTML = `
        <div class="latest-match-card">
            <strong>${escapeHtml(mode)}</strong>
            <time datetime="${escapeHtml(match.endedAt || "")}" title="${escapeHtml(formatFullLocalDate(match.endedAt))}">${escapeHtml(formatCompactDate(match.endedAt))}</time>
            <div class="latest-match-meta">
                <span>${players} ${players === 1 ? "player" : "players"}</span>
                ${winner ? `<span>${escapeHtml(winner)}</span>` : ""}
                ${score}
            </div>
        </div>
    `;
}

function renderFeaturedList(modeId, container) {
    if (!container) return;
    const rows = featuredPlayers(modeId);
    if (rows.length === 0) {
        container.innerHTML = `<p class="mode-empty">No games have been played yet.</p>`;
        return;
    }

    container.innerHTML = rows.map((player, index) => renderFeaturedPlayer(player, index + 1, modeId)).join("");
}

function renderFeaturedPlayer(player, rank, modeId) {
    const stats = normalizeStats(player.stats);
    const derived = normalizeDerived(player.derived, stats);
    const profile = profileById(player.playerId);
    const name = player.name || profile?.name || "Unknown";
    const skinUrl = playerSkinUrl(player, profile, 96);
    const fallbackSkin = skinHeadUrl(DEFAULT_SKIN_NAME, 96);
    const modeTab = modeId === "deathmatch" ? "deathmatch" : "battleRoyale";

    return `
        <a class="featured-player podium-rank-${rank}" href="#player=${encodeURIComponent(player.playerId)}&tab=${encodeURIComponent(modeTab)}">
            <img src="${escapeHtml(skinUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${escapeHtml(fallbackSkin)}';">
            <div class="featured-player-main">
                <div>
                    <span class="rank-badge rank-${Math.min(rank, 3)}">${rank}</span>
                    <strong>${escapeHtml(name)}</strong>
                </div>
                <small>${stats.wins} wins - ${stats.kills} kills - ${stats.games} games</small>
            </div>
            <div class="featured-player-stat">
                <strong>${formatPercent(derived.winRate)}</strong>
                <span>WR</span>
            </div>
        </a>
    `;
}

function renderChampionControls() {
    document.querySelectorAll("[data-champion-mode]").forEach((button) => {
        button.classList.toggle("active", button.dataset.championMode === state.championMode);
    });
    const fullBoard = document.getElementById("champion-full-board");
    if (fullBoard) {
        fullBoard.href = `#view=leaderboards&mode=${encodeURIComponent(state.championMode)}&board=players&sort=wins`;
    }
}

function showChampionMode(modeId, smooth) {
    if (modeId !== "battleRoyale" && modeId !== "deathmatch") return;
    state.championMode = modeId;
    renderChampionControls();
    syncChampionScroll(smooth);
}

function syncChampionScroll(smooth) {
    const carousel = document.getElementById("champion-carousel");
    if (!carousel) return;
    const panel = carousel.querySelector(`[data-champion-panel="${state.championMode}"]`);
    const left = panel ? panel.offsetLeft - carousel.offsetLeft : 0;
    carousel.scrollTo({
        left,
        behavior: smooth ? "smooth" : "auto"
    });
}

function renderHeroStatus() {
    const totalPlayers = state.cache.overallMode.players.length;
    document.getElementById("hero-player-count").textContent = String(totalPlayers);
    renderLiveStatus();

    const lastMatch = state.cache.lastMatch;
    const lastGame = document.getElementById("last-game-played");
    if (!lastMatch) {
        lastGame.textContent = "Waiting for games";
        return;
    }

    const mode = compactModeLabel(lastMatch.modeLabel || MODE_LABELS[lastMatch.mode] || "Match");
    const date = formatCompactDate(lastMatch.endedAt);
    lastGame.innerHTML = `<span class="status-mode">${escapeHtml(mode)}</span><time datetime="${escapeHtml(lastMatch.endedAt || "")}" title="${escapeHtml(formatFullLocalDate(lastMatch.endedAt))}">${escapeHtml(date)}</time>`;
}

function renderLiveStatus() {
    const status = state.data?.liveStatus;
    const online = document.getElementById("online-player-count");
    const serverStatus = document.getElementById("server-status");
    if (!status || isExportStale()) {
        online.textContent = "Offline";
        serverStatus.textContent = "Server offline";
        return;
    }

    online.textContent = String(number(status.onlinePlayers));
    serverStatus.textContent = liveStatusText(status);
}

function liveStatusText(status) {
    if (!status || status.state === "idle") return "Idle";
    if (status.mode === "deathmatch") {
        const map = status.mapName || status.mapId || "Unknown map";
        const red = Number.isFinite(Number(status.redScore)) ? Number(status.redScore) : 0;
        const blue = Number.isFinite(Number(status.blueScore)) ? Number(status.blueScore) : 0;
        return `Deathmatch - ${map} - ${red}-${blue}`;
    }
    if (status.mode === "battleRoyale") {
        const teamMode = status.teamMode || "Solo";
        const stateLabel = status.state === "preparing" ? "Preparing" : "Running";
        const alive = number(status.alivePlayers);
        const players = number(status.matchPlayers);
        const countText = alive > 0 ? `${alive}/${players || alive} alive` : `${players} players`;
        return `Battle Royale - ${stateLabel} - ${teamMode} - ${countText}`;
    }
    return status.label || "Idle";
}

function isExportStale() {
    const generated = dateValue(state.data?.generatedAt);
    if (!generated) return false;
    return Date.now() - generated > 90000;
}

function renderMainViewTabs() {
    const container = document.getElementById("main-view-tabs");
    container.innerHTML = "";
    for (const [viewId, label] of Object.entries(MAIN_VIEWS)) {
        const button = createPill(label, state.mainView === viewId, () => {
            state.mainView = viewId;
            state.selectedId = null;
            state.profilePreviewOpen = false;
            state.page = 1;
            state.query = "";
            document.getElementById("player-search").value = "";
            if (viewId === "players") state.sort = "wins";
            if (viewId === "weapons") state.sort = "kills";
            if (viewId === "maps") state.sort = "games";
            state.sortDirection = "desc";
            render();
        });
        button.classList.add("tab-pill");
        container.appendChild(button);
    }
}

function renderModeTabs() {
    const container = document.getElementById("mode-tabs");
    container.innerHTML = "";
    container.classList.toggle("hidden", state.mainView === "maps");
    for (const modeId of Object.keys(MODE_LABELS)) {
        const button = createPill(MODE_LABELS[modeId], state.mode === modeId, () => {
            state.mode = modeId;
            state.page = 1;
            render();
        });
        button.classList.add("tab-pill");
        container.appendChild(button);
    }
    const title = state.mainView === "players"
        ? `${MODE_LABELS[state.mode]} ranking`
        : state.mainView === "weapons"
            ? `${MODE_LABELS[state.mode]} weapon stats`
            : "Deathmatch map stats";
    document.getElementById("leaderboard-title").textContent = title;
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
    const count = document.getElementById("leaderboard-count");
    const rows = currentLeaderboardRows();
    const search = document.getElementById("player-search");
    search.placeholder = state.mainView === "weapons"
        ? "Weapon name"
        : state.mainView === "maps"
            ? "Map name"
            : "Player name";

    if (state.mainView === "weapons") {
        const noun = rows.length === 1 ? "weapon" : "weapons";
        const modeLabel = state.mode === "overall" ? "across all modes" : `in ${MODE_LABELS[state.mode]}`;
        count.textContent = `${rows.length} tracked ${noun} ${modeLabel}`;
        return;
    }

    if (state.mainView === "maps") {
        const noun = rows.length === 1 ? "map" : "maps";
        count.textContent = `${rows.length} tracked Deathmatch ${noun}`;
        return;
    }

    const noun = rows.length === 1 ? "player" : "players";
    const modeLabel = state.mode === "overall" ? "across all modes" : `in ${MODE_LABELS[state.mode]}`;
    count.textContent = `${rows.length} tracked ${noun} ${modeLabel}`;
}

function renderTable() {
    const rows = filteredLeaderboardRows();
    const body = document.getElementById("leaderboard-body");
    const empty = document.getElementById("empty-state");
    const wrap = document.querySelector(".table-wrap");
    const head = document.querySelector(".leaderboard-table thead");

    body.innerHTML = "";
    head.innerHTML = renderTableHead();

    if (rows.length === 0) {
        empty.querySelector("h3").textContent = emptyStateText();
        empty.classList.remove("hidden");
        wrap.classList.add("hidden");
        renderPagination(0, 0);
        return;
    }

    empty.classList.add("hidden");
    wrap.classList.remove("hidden");

    const start = (state.page - 1) * state.pageSize;
    const pageRows = rows.slice(start, start + state.pageSize);
    if (state.mainView === "weapons") {
        pageRows.forEach((entry, index) => body.appendChild(renderWeaponLeaderboardRow(entry, start + index + 1)));
        renderPagination(rows.length, Math.ceil(rows.length / state.pageSize));
        return;
    }

    if (state.mainView === "maps") {
        pageRows.forEach((entry, index) => body.appendChild(renderMapLeaderboardRow(entry, start + index + 1)));
        renderPagination(rows.length, Math.ceil(rows.length / state.pageSize));
        return;
    }

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

function renderTableHead() {
    if (state.mainView === "weapons") {
        return `
            <tr>
                <th>#</th>
                <th>Weapon</th>
                <th><button class="sort-header" type="button" data-sort="kills">Kills <span data-sort-indicator="kills"></span></button></th>
                <th><button class="sort-header" type="button" data-sort="hits">Hits <span data-sort-indicator="hits"></span></button></th>
                <th><button class="sort-header" type="button" data-sort="headshotRate">HS% <span data-sort-indicator="headshotRate"></span></button></th>
                <th><button class="sort-header" type="button" data-sort="headshotKills">HS Kills <span data-sort-indicator="headshotKills"></span></button></th>
                <th><button class="sort-header" type="button" data-sort="utilityKills">Utility <span data-sort-indicator="utilityKills"></span></button></th>
                <th><button class="sort-header" type="button" data-sort="vehicleKills">Vehicle <span data-sort-indicator="vehicleKills"></span></button></th>
            </tr>
        `;
    }

    if (state.mainView === "maps") {
        return `
            <tr>
                <th>#</th>
                <th>Map</th>
                <th><button class="sort-header" type="button" data-sort="games">Games <span data-sort-indicator="games"></span></button></th>
                <th><button class="sort-header" type="button" data-sort="kills">Kills <span data-sort-indicator="kills"></span></button></th>
                <th><button class="sort-header" type="button" data-sort="avgKills">Avg K <span data-sort-indicator="avgKills"></span></button></th>
                <th><button class="sort-header" type="button" data-sort="deaths">Deaths <span data-sort-indicator="deaths"></span></button></th>
                <th><button class="sort-header" type="button" data-sort="kdRatio">KD <span data-sort-indicator="kdRatio"></span></button></th>
                <th><button class="sort-header" type="button" data-sort="headshotRate">HS% <span data-sort-indicator="headshotRate"></span></button></th>
                <th><button class="sort-header" type="button" data-sort="playtimeSeconds">Playtime <span data-sort-indicator="playtimeSeconds"></span></button></th>
            </tr>
        `;
    }

    return `
        <tr>
            <th>#</th>
            <th>Player</th>
            <th><button class="sort-header" type="button" data-sort="wins">Wins <span data-sort-indicator="wins"></span></button></th>
            <th><button class="sort-header" type="button" data-sort="kills">Kills <span data-sort-indicator="kills"></span></button></th>
            <th><button class="sort-header" type="button" data-sort="games">Games <span data-sort-indicator="games"></span></button></th>
            <th><button class="sort-header" type="button" data-sort="deaths">Deaths <span data-sort-indicator="deaths"></span></button></th>
            <th><button class="sort-header" type="button" data-sort="winRate">Win Rate <span data-sort-indicator="winRate"></span></button></th>
            <th><button class="sort-header" type="button" data-sort="avgKills">Avg K <span data-sort-indicator="avgKills"></span></button></th>
            <th><button class="sort-header" type="button" data-sort="playtimeSeconds">Playtime <span data-sort-indicator="playtimeSeconds"></span></button></th>
            <th><button class="sort-header" type="button" data-sort="headshotRate">HS% <span data-sort-indicator="headshotRate"></span></button></th>
            <th><button class="sort-header" type="button" data-sort="kdRatio">KD <span data-sort-indicator="kdRatio"></span></button></th>
        </tr>
    `;
}

function renderWeaponLeaderboardRow(entry, rank) {
    const stats = normalizeStats(entry.stats);
    const derived = normalizeDerived(entry.derived, stats);
    const label = weaponLabel(entry);
    const tr = document.createElement("tr");
    tr.innerHTML = `
        <td><span class="rank-badge rank-${Math.min(rank, 3)}">${rank}</span></td>
        <td><strong>${escapeHtml(label)}</strong></td>
        <td>${stats.kills}</td>
        <td>${stats.hits}</td>
        <td>${formatPercent(derived.headshotRate)}</td>
        <td>${stats.headshotKills}</td>
        <td>${stats.utilityKills}</td>
        <td>${stats.vehicleKills}</td>
    `;
    return tr;
}

function renderMapLeaderboardRow(entry, rank) {
    const stats = normalizeStats(entry.stats);
    const derived = normalizeDerived(entry.derived, stats);
    const tr = document.createElement("tr");
    tr.innerHTML = `
        <td><span class="rank-badge rank-${Math.min(rank, 3)}">${rank}</span></td>
        <td><strong>${escapeHtml(entry.label || entry.id || "Unknown")}</strong></td>
        <td>${stats.games}</td>
        <td>${stats.kills}</td>
        <td>${formatNumber(derived.avgKills)}</td>
        <td>${stats.deaths}</td>
        <td>${formatNumber(derived.kdRatio)}</td>
        <td>${formatPercent(derived.headshotRate)}</td>
        <td>${formatDuration(stats.playtimeSeconds)}</td>
    `;
    return tr;
}

function emptyStateText() {
    if (state.mainView === "weapons") return "No weapon stats have been tracked yet";
    if (state.mainView === "maps") return "No Deathmatch map stats have been tracked yet";
    return "No games have been played yet";
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
    const skinUrl = playerSkinUrl(profile, profile, 96);
    const fallbackSkin = skinHeadUrl(DEFAULT_SKIN_NAME, 96);
    container.innerHTML = `
        <div class="profile-preview-head">
            <img src="${escapeHtml(skinUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${escapeHtml(fallbackSkin)}';">
            <div>
                <span>Selected Player</span>
                <strong>${escapeHtml(profile.name || "Unknown")}</strong>
            </div>
        </div>
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
    const rows = cleanWeaponEntries(weapons);
    if (rows.length === 0) return "";
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
                ${rows.map(renderWeaponRow).join("")}
            </div>
        </section>
    `;
}

function renderWeaponRow(entry) {
    const stats = normalizeStats(entry.stats);
    const derived = normalizeDerived(entry.derived, stats);
    return `
        <article class="weapon-row">
            <strong>${escapeHtml(weaponLabel(entry))}</strong>
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

function filteredLeaderboardRows() {
    const rows = [...currentLeaderboardRows()];
    rows.sort(comparePlayers(state.sort));
    if (!state.query) return rows;
    return rows.filter((row) => rowSearchText(row).includes(state.query));
}

function currentLeaderboardRows() {
    if (state.mainView === "weapons") return state.cache.weaponsByMode[state.mode] || [];
    if (state.mainView === "maps") return state.cache.maps;
    return currentMode().players || [];
}

function rowSearchText(row) {
    return String(row.name || row.label || row.id || "").toLowerCase();
}

function currentMode() {
    if (state.mode === "overall") return buildOverallMode();
    return state.data?.modes?.[state.mode] || { players: [] };
}

function buildOverallMode() {
    return state.cache.overallMode || emptyCache().overallMode;
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
    return state.cache.overallById.get(profile?.playerId) || buildOverallPlayer(profile);
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
        const normalized = normalizeWeaponEntry(entry);
        if (!normalized) continue;
        const current = merged.get(normalized.id) || {
            id: normalized.id,
            label: normalized.label,
            stats: normalizeStats(null)
        };
        current.stats = combineStats(current.stats, normalized.stats);
        current.derived = derivedFromStats(current.stats);
        merged.set(normalized.id, current);
    }
    return [...merged.values()].sort((a, b) => {
        const kills = normalizeStats(b.stats).kills - normalizeStats(a.stats).kills;
        if (kills) return kills;
        return normalizeStats(b.stats).hits - normalizeStats(a.stats).hits;
    });
}

function aggregateWeapons(profiles, mode) {
    const merged = new Map();
    for (const profile of profiles) {
        const sources = mode === "battleRoyale"
            ? [profile.battleRoyale?.details?.weapons || []]
            : mode === "deathmatch"
                ? [profile.deathmatch?.details?.weapons || []]
                : [profile.battleRoyale?.details?.weapons || [], profile.deathmatch?.details?.weapons || []];

        for (const entries of sources) {
            for (const entry of entries) {
                const normalized = normalizeWeaponEntry(entry);
                if (!normalized) continue;
                const current = merged.get(normalized.id) || {
                    id: normalized.id,
                    label: normalized.label,
                    stats: normalizeStats(null)
                };
                current.stats = combineStats(current.stats, normalized.stats);
                current.derived = derivedFromStats(current.stats);
                merged.set(normalized.id, current);
            }
        }
    }

    return [...merged.values()].sort(comparePlayersBy("kills", "desc"));
}

function cleanWeaponEntries(entries) {
    return (entries || []).map(normalizeWeaponEntry).filter(Boolean);
}

function normalizeWeaponEntry(entry) {
    if (!entry) return null;
    const id = String(entry.id || entry.label || "").trim();
    if (!id) return null;
    const lowerId = id.toLowerCase();
    const lowerLabel = String(entry.label || "").trim().toLowerCase();
    if (lowerId.endsWith(":bullet") || lowerLabel === "bullet") return null;
    return {
        ...entry,
        id,
        label: weaponLabel(entry),
        stats: normalizeStats(entry.stats),
        derived: normalizeDerived(entry.derived, normalizeStats(entry.stats))
    };
}

function weaponLabel(entry) {
    const id = String(entry?.id || "").toLowerCase();
    if (id === "minecraft:player") return "Melee";
    const label = String(entry?.label || "").trim();
    if (!label || label.toLowerCase() === "bullet") return labelFromIdentifier(entry?.id || "Unknown");
    return label;
}

function labelFromIdentifier(value) {
    const tail = String(value || "Unknown").split(":").pop().replaceAll("-", "_");
    return tail.split("_").filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") || "Unknown";
}

function aggregateDeathmatchMaps(profiles) {
    const merged = new Map();
    for (const profile of profiles) {
        for (const entry of profile.deathmatch?.details?.deathmatchMaps || []) {
            const id = entry?.id || entry?.label;
            if (!id) continue;
            const current = merged.get(id) || {
                id,
                label: entry.label || id,
                stats: normalizeStats(null)
            };
            current.stats = combineStats(current.stats, entry.stats);
            current.derived = derivedFromStats(current.stats);
            merged.set(id, current);
        }
    }
    return [...merged.values()].sort(comparePlayersBy("games", "desc"));
}

function filteredHistory(profile, mode) {
    const matches = profile?.recentMatches || [];
    if (mode === "overall") return matches;
    return matches.filter((match) => match.mode === mode);
}

function findLastMatch(profiles) {
    const matches = new Map();
    for (const profile of profiles) {
        for (const match of profile.recentMatches || []) {
            const key = match.matchId || `${match.mode || "match"}-${match.endedAt || ""}`;
            const current = matches.get(key);
            if (!current || dateValue(match.endedAt) > dateValue(current.endedAt)) matches.set(key, match);
        }
    }
    return [...matches.values()].sort((a, b) => dateValue(b.endedAt) - dateValue(a.endedAt))[0] || null;
}

function featuredPlayers(modeId) {
    const players = state.data?.modes?.[modeId]?.players || [];
    return [...players]
        .filter((player) => normalizeStats(player.stats).games > 0)
        .sort(comparePlayersBy("wins", "desc"))
        .slice(0, 5);
}

function matchWinnerText(match) {
    if (!match) return "";
    const winner = (match.participants || []).find((player) => player.won);
    if (winner?.name) return `Winner: ${winner.name}`;
    if (match.mode === "battleRoyale" && match.won) return "Winner recorded";
    if (match.mode === "deathmatch" && hasMatchScore(match)) {
        const red = number(match.redScore);
        const blue = number(match.blueScore);
        if (red === blue) return "Draw";
        return red > blue ? "Red won" : "Blue won";
    }
    return "";
}

function profileById(playerId) {
    return state.cache.profileMap.get(playerId) || null;
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
        return rowSearchText(a).localeCompare(rowSearchText(b));
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
        case "hits":
            return stats.hits;
        case "headshotKills":
            return stats.headshotKills;
        case "utilityKills":
            return stats.utilityKills;
        case "vehicleKills":
            return stats.vehicleKills;
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

function dateValue(value) {
    const time = value ? new Date(value).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
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

function formatCompactDate(value) {
    if (!value) return "TBD";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString(undefined, {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit"
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

function compactModeLabel(value) {
    const text = String(value || "").toLowerCase();
    if (text.includes("battle")) return "BR";
    if (text.includes("death")) return "DM";
    return value || "Match";
}

function viewerTimeZoneLabel() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "your timezone";
}

function playerSkinUrl(player, profile, size) {
    return skinHeadUrl(player?.name || profile?.name || DEFAULT_SKIN_NAME, size);
}

function skinHeadUrl(name, size) {
    const safeName = String(name || DEFAULT_SKIN_NAME).trim() || DEFAULT_SKIN_NAME;
    const safeSize = Math.max(16, Math.min(256, Math.round(number(size) || 96)));
    return `https://api.mcheads.org/head/${encodeURIComponent(safeName)}/${safeSize}`;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#39;");
}
