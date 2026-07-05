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
const CONTACT_EMAIL_CODES = [108, 117, 107, 97, 115, 46, 102, 111, 115, 115, 97, 116, 105, 46, 100, 101, 118, 101, 108, 111, 112, 101, 114, 64, 103, 109, 97, 105, 108, 46, 99, 111, 109];
const PLAYTEST_STORAGE_KEY = "cob_playtest_scheduler_v2";
const PLAYTEST_AUTH_RETURN_KEY = "cob_playtest_auth_return";
const DEFAULT_PLAYTEST_VIEWER = {
    userId: "local-preview-user",
    username: "You",
    avatarInitials: "YOU",
    avatarUrl: "",
    discordId: "",
    isAdmin: false
};
const PLAYTEST_VIEWER = { ...DEFAULT_PLAYTEST_VIEWER };

const PLAYTEST_STATUS_OPTIONS = [
    { id: "available", label: "Available", score: 3 },
    { id: "maybe", label: "Maybe", score: 1 },
    { id: "unavailable", label: "Unavailable", score: 0 },
    { id: "preferred", label: "Preferred", score: 5 }
];

const PLAYTEST_COUNT_ORDER = ["available", "preferred", "maybe", "unavailable"];
const PLAYTEST_MODE_OPTIONS = ["Battle Royale", "Deathmatch", "Either"];
const PLAYTEST_INTEREST_MIN_SCALE = 10;
const COMMUNITY_SLOT_ACTIVE_STATUSES = new Set(["available", "preferred", "maybe"]);
const CONFIRMATION_STATUS_HELP = "Unconfirmed means this is a possible event date. The admin will confirm the event on that date if it will be possible to execute.";
const BEST_DATE_SCORE_HELP = "Best Date ranks by the strongest overlapping time window first. Preferred = 5, Available = 3, Maybe = 1, Unavailable = 0.";

const PLAYTEST_SEED_USERS = [];
const DEFAULT_PLAYTESTS = [];

const state = {
    data: null,
    preview: false,
    dataMode: "Static file",
    apiUrl: "",
    supabaseUrl: "",
    supabaseKey: "",
    supabaseTable: "cob_stats_exports",
    supabaseRowId: "live",
    publicSiteUrl: "",
    authClient: null,
    authReady: false,
    authSession: null,
    authProfile: null,
    authMessage: "",
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
    pendingScrollTarget: "",
    playtests: emptyPlaytestState(),
    cache: emptyCache()
};

document.addEventListener("DOMContentLoaded", () => {
    setupLiveConfig();
    setupAuthClient();
    loadPlaytestState();
    applyRoute();
    bindStaticEvents();
    startChampionRotation();
    void initAuth();
    void loadData();
});

function setupLiveConfig() {
    const params = new URLSearchParams(window.location.search);
    state.apiUrl = params.get("api") || window.COB_STATS_API_URL || "";
    state.supabaseUrl = params.get("supabaseUrl") || window.COB_SUPABASE_URL || "";
    state.supabaseKey = params.get("supabaseKey") || window.COB_SUPABASE_KEY || "";
    state.supabaseTable = params.get("supabaseTable") || window.COB_SUPABASE_TABLE || "cob_stats_exports";
    state.supabaseRowId = params.get("supabaseRowId") || window.COB_SUPABASE_ROW_ID || "live";
    state.publicSiteUrl = params.get("publicSiteUrl") || window.COB_PUBLIC_SITE_URL || "";
    const pollMs = Number(params.get("pollMs") || window.COB_STATS_POLL_MS || DEFAULT_API_POLL_MS);
    state.pollMs = Number.isFinite(pollMs) && pollMs >= 3000 ? pollMs : DEFAULT_API_POLL_MS;
}

function setupAuthClient() {
    if (!state.supabaseUrl || !state.supabaseKey) {
        state.authMessage = "Discord login is not configured.";
        return;
    }
    if (!window.supabase?.createClient) {
        state.authMessage = "Discord login could not load. Try refreshing the page.";
        return;
    }

    state.authClient = window.supabase.createClient(state.supabaseUrl, state.supabaseKey, {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true
        },
        global: {
            headers: {
                "x-client-info": "call-of-block-stats-site"
            }
        }
    });
}

async function initAuth() {
    if (!state.authClient) {
        state.authReady = true;
        render();
        return;
    }

    try {
        const { data, error } = await state.authClient.auth.getSession();
        if (error) throw error;
        await applyAuthSession(data?.session || null);
        state.authClient.auth.onAuthStateChange((_event, session) => {
            void applyAuthSession(session, true);
        });
    } catch (error) {
        console.error("Failed to initialize Discord login", error);
        state.authReady = true;
        state.authMessage = "Discord login is unavailable right now.";
        resetPlaytestViewer();
        render();
    }
}

async function applyAuthSession(session, shouldRender = false) {
    state.authSession = session || null;
    state.authReady = true;

    if (!session?.user) {
        state.authProfile = null;
        state.authMessage = "";
        resetPlaytestViewer();
        if (shouldRender) render();
        return;
    }

    updateViewerFromDiscordUser(session.user);
    await syncPlaytestProfile(session.user);
    consumePlaytestAuthReturn();
    if (shouldRender) render();
}

async function signInWithDiscord() {
    if (!state.authClient) {
        state.authMessage = "Discord login is not configured.";
        render();
        return;
    }

    state.authMessage = "";
    rememberPlaytestAuthReturn();
    const { error } = await state.authClient.auth.signInWithOAuth({
        provider: "discord",
        options: {
            redirectTo: playtestAuthRedirectUrl()
        }
    });
    if (error) {
        console.error("Discord login failed", error);
        state.authMessage = "Discord login failed. Try again.";
        render();
    }
}

async function signOutDiscord() {
    if (!state.authClient) return;
    const { error } = await state.authClient.auth.signOut();
    if (error) {
        console.error("Discord sign out failed", error);
        state.authMessage = "Could not sign out right now.";
        render();
        return;
    }
    state.authSession = null;
    state.authProfile = null;
    state.authMessage = "";
    resetPlaytestViewer();
    render();
}

function playtestAuthRedirectUrl() {
    let url;
    try {
        url = new URL(state.publicSiteUrl || window.location.href, window.location.origin);
    } catch (_error) {
        url = new URL(window.location.href);
    }
    url.hash = "";
    for (const key of ["code", "error", "error_code", "error_description"]) {
        url.searchParams.delete(key);
    }
    return url.toString();
}

function rememberPlaytestAuthReturn() {
    try {
        window.localStorage?.setItem(PLAYTEST_AUTH_RETURN_KEY, "playtests");
    } catch (_error) {
        // Returning to the public root is still valid if storage is unavailable.
    }
}

function consumePlaytestAuthReturn() {
    try {
        if (window.localStorage?.getItem(PLAYTEST_AUTH_RETURN_KEY) !== "playtests") return;
        window.localStorage.removeItem(PLAYTEST_AUTH_RETURN_KEY);
        state.view = "playtests";
        state.selectedId = null;
        state.profilePreviewOpen = false;
        if (window.location.hash.replace(/^#/, "") !== "playtests") {
            window.location.hash = "playtests";
        }
    } catch (_error) {
        // Ignore storage issues; the user can still open the playtest view normally.
    }
}

function bindStaticEvents() {
    document.addEventListener("click", (event) => {
        const confirmationClose = event.target.closest("[data-confirm-dialog-close]");
        if (confirmationClose || event.target.matches("[data-confirm-dialog-backdrop]")) {
            event.preventDefault();
            closeConfirmDialog();
            return;
        }

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
            return;
        }

        const contactButton = event.target.closest("[data-contact-email]");
        if (contactButton) {
            event.preventDefault();
            openContactEmail();
        }
    });

    document.addEventListener("submit", (event) => {
        if (!event.target.matches("[data-confirm-dialog-form]")) return;
        event.preventDefault();
        submitConfirmDialog(event.target);
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

    const playtestsView = document.getElementById("playtests-view");
    if (playtestsView) {
        playtestsView.addEventListener("click", handlePlaytestClick);
        playtestsView.addEventListener("change", handlePlaytestChange);
        playtestsView.addEventListener("submit", handlePlaytestSubmit);
    }

    const communityAdminView = document.getElementById("community-admin-view");
    if (communityAdminView) {
        communityAdminView.addEventListener("click", handlePlaytestClick);
    }

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
    if (route === "help") {
        state.view = "home";
        state.pendingScrollTarget = "help";
        return;
    }
    if (route === "admin-help") {
        state.view = "adminHelp";
        state.selectedId = null;
        state.profilePreviewOpen = false;
        return;
    }
    if (route === "playtests") {
        state.view = "playtests";
        state.selectedId = null;
        state.profilePreviewOpen = false;
        return;
    }
    if (route === "community-dates") {
        state.view = "communityAdmin";
        state.selectedId = null;
        state.profilePreviewOpen = false;
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
    if (route === "help") {
        state.view = "home";
        state.pendingScrollTarget = "help";
        window.location.hash = "help";
        render();
        return;
    }
    if (route === "admin-help") {
        state.view = "adminHelp";
        state.selectedId = null;
        state.profilePreviewOpen = false;
        window.location.hash = "admin-help";
        render();
        return;
    }
    if (route === "playtests") {
        state.view = "playtests";
        state.selectedId = null;
        state.profilePreviewOpen = false;
        window.location.hash = "playtests";
        render();
        return;
    }
    if (route === "community-dates") {
        if (!isPlaytestAdmin()) {
            state.view = "playtests";
            state.selectedId = null;
            state.profilePreviewOpen = false;
            window.location.hash = "playtests";
            render();
            return;
        }
        state.view = "communityAdmin";
        state.selectedId = null;
        state.profilePreviewOpen = false;
        window.location.hash = "community-dates";
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

async function syncPlaytestProfile(user) {
    if (!state.authClient || !user?.id) return null;

    const discordId = discordIdFromUser(user);
    if (!discordId) {
        state.authMessage = "Discord login connected, but Discord ID was not returned.";
        return null;
    }

    const username = discordUsernameFromUser(user);
    const avatarUrl = discordAvatarFromUser(user);
    const profileColumns = "id, discord_id, username, avatar_url, is_admin, banned_from_voting";

    try {
        const { data: existing, error: selectError } = await state.authClient
            .from("profiles")
            .select(profileColumns)
            .eq("id", user.id)
            .maybeSingle();
        if (selectError) throw selectError;

        if (existing) {
            const { data, error } = await state.authClient
                .from("profiles")
                .update({ username, avatar_url: avatarUrl || null })
                .eq("id", user.id)
                .select(profileColumns)
                .single();
            if (error) throw error;
            applyPlaytestProfile(data);
            return data;
        }

        const { data, error } = await state.authClient
            .from("profiles")
            .insert({
                id: user.id,
                discord_id: discordId,
                username,
                avatar_url: avatarUrl || null
            })
            .select(profileColumns)
            .single();
        if (error) throw error;
        applyPlaytestProfile(data);
        return data;
    } catch (error) {
        console.error("Failed to sync Discord profile", error);
        state.authProfile = null;
        PLAYTEST_VIEWER.isAdmin = false;
        state.authMessage = "Discord login worked, but profile sync failed. Check the playtest schema.";
        return null;
    }
}

function applyPlaytestProfile(profile) {
    state.authProfile = profile || null;
    if (!profile) return;
    PLAYTEST_VIEWER.userId = profile.id || PLAYTEST_VIEWER.userId;
    PLAYTEST_VIEWER.discordId = profile.discord_id || PLAYTEST_VIEWER.discordId;
    PLAYTEST_VIEWER.username = profile.username || PLAYTEST_VIEWER.username;
    PLAYTEST_VIEWER.avatarUrl = profile.avatar_url || PLAYTEST_VIEWER.avatarUrl;
    PLAYTEST_VIEWER.avatarInitials = initialsForName(PLAYTEST_VIEWER.username);
    PLAYTEST_VIEWER.isAdmin = Boolean(profile.is_admin);
    state.authMessage = "";
}

function updateViewerFromDiscordUser(user) {
    PLAYTEST_VIEWER.userId = user.id || DEFAULT_PLAYTEST_VIEWER.userId;
    PLAYTEST_VIEWER.discordId = discordIdFromUser(user);
    PLAYTEST_VIEWER.username = discordUsernameFromUser(user);
    PLAYTEST_VIEWER.avatarUrl = discordAvatarFromUser(user);
    PLAYTEST_VIEWER.avatarInitials = initialsForName(PLAYTEST_VIEWER.username);
    PLAYTEST_VIEWER.isAdmin = false;
}

function resetPlaytestViewer() {
    Object.assign(PLAYTEST_VIEWER, DEFAULT_PLAYTEST_VIEWER);
}

function discordIdentityFromUser(user) {
    return (user?.identities || []).find((identity) => identity.provider === "discord") || null;
}

function discordIdFromUser(user) {
    const identity = discordIdentityFromUser(user);
    const metadata = user?.user_metadata || {};
    const identityData = identity?.identity_data || {};
    return String(
        identityData.provider_id
        || identityData.id
        || identityData.sub
        || metadata.provider_id
        || metadata.id
        || metadata.sub
        || identity?.identity_id
        || ""
    );
}

function discordUsernameFromUser(user) {
    const identity = discordIdentityFromUser(user);
    const metadata = user?.user_metadata || {};
    const identityData = identity?.identity_data || {};
    return String(
        metadata.global_name
        || metadata.full_name
        || metadata.name
        || metadata.user_name
        || identityData.global_name
        || identityData.full_name
        || identityData.name
        || identityData.user_name
        || user?.email?.split("@")[0]
        || "Discord user"
    );
}

function discordAvatarFromUser(user) {
    const identity = discordIdentityFromUser(user);
    const metadata = user?.user_metadata || {};
    const identityData = identity?.identity_data || {};
    return String(
        metadata.avatar_url
        || metadata.picture
        || identityData.avatar_url
        || identityData.picture
        || ""
    );
}

function initialsForName(value) {
    const parts = String(value || "You").trim().split(/\s+/).filter(Boolean);
    const initials = parts.length > 1
        ? `${parts[0][0] || ""}${parts[1][0] || ""}`
        : (parts[0] || "You").slice(0, 3);
    return initials.toUpperCase();
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
    renderPlaytests();
    renderCommunityAdminPage();
    renderPlaytestConfirmationDialog();
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
    document.getElementById("admin-help-view").classList.toggle("hidden", state.view !== "adminHelp");
    document.getElementById("playtests-view").classList.toggle("hidden", state.view !== "playtests");
    document.getElementById("community-admin-view").classList.toggle("hidden", state.view !== "communityAdmin");
    const dashboard = document.querySelector(".dashboard");
    dashboard.classList.toggle("hidden", state.view !== "leaderboard");
    dashboard.classList.toggle("profile-closed", state.view === "leaderboard" && !state.profilePreviewOpen);
    document.getElementById("player-view").classList.toggle("hidden", state.view !== "player");
    updateFloatingButtonPosition();
    if (state.view === "player") renderPlayerDetail();
    if (state.view === "home" && state.pendingScrollTarget) {
        const targetId = state.pendingScrollTarget;
        state.pendingScrollTarget = "";
        window.requestAnimationFrame(() => {
            document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    }
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
        floatingButton.setAttribute("aria-label", onHome ? "Open stats tracker" : "Return to server hub");
        floatingButton.title = onHome ? "Open stats tracker" : "Return to server hub";
    }
}

function renderHome() {
    renderHomeLatestMatch();
    renderHomePlaytestPromo();
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

function renderHomePlaytestPromo() {
    const container = document.getElementById("home-playtest-promo");
    if (!container) return;

    const upcoming = upcomingConfirmedPlaytestEvent();
    if (!upcoming) {
        container.innerHTML = `
            <div>
                <p class="panel-kicker">Community Playtests</p>
                <h2>Vote the next session into shape.</h2>
                <p>
                    Planned dates are highlighted as featured sessions, while extra community suggestions live on the calendar.
                    Pick Available, Maybe, Unavailable, or Preferred, then choose whether you would rather test Battle Royale,
                    Deathmatch, or either mode.
                </p>
            </div>
            <div class="playtest-promo-actions">
                <a href="#playtests">Open playtest scheduler</a>
                <span>Calendar voting</span>
                <span>Best-date score</span>
                <span>Mode interest</span>
            </div>
        `;
        return;
    }

    const scheduledSlot = confirmedDisplaySlot(upcoming.playtest.id, upcoming.summary.slot);
    container.innerHTML = `
        <div class="upcoming-event-main">
            <p class="panel-kicker">Upcoming Playtest</p>
            <h2 class="upcoming-event-date">${escapeHtml(formatSlotDay(scheduledSlot.startAt))}</h2>
            <time class="upcoming-event-time" datetime="${escapeHtml(scheduledSlot.startAt)}">${escapeHtml(formatSlotTimeRange(scheduledSlot))}</time>
            <p>
                ${escapeHtml(upcoming.playtest.title)} is confirmed for ${escapeHtml(formatSlotWeekday(scheduledSlot.startAt))}.
                Join the scheduler to see availability, votes, and notification options.
            </p>
        </div>
        <div class="playtest-promo-actions upcoming-event-actions">
            <a href="#playtests">Open playtest scheduler</a>
            <span>${escapeHtml(formatSlotWeekday(scheduledSlot.startAt))}</span>
            <span>${upcoming.summary.availableTotal} available</span>
            <span>${upcoming.summary.counts.preferred} preferred</span>
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

function renderPlaytests() {
    const root = document.getElementById("playtests-view");
    if (!root) return;

    const playtests = activePlaytests();
    const active = activePlaytest(playtests);
    renderPlaytestList(playtests, active);
    renderPlaytestIdentity();
    renderPlaytestPreferences(active);
    renderPlaytestAdmin(active);
    renderPlaytestBoard(active);
}

function renderCommunityAdminPage() {
    const board = document.getElementById("community-admin-board");
    if (!board) return;

    if (!isPlaytestAdmin()) {
        board.innerHTML = `
            <section class="playtest-empty">
                <h3>Admin access required</h3>
                <p>The community admin calendar is only available after Discord/Supabase admin auth is connected.</p>
            </section>
        `;
        return;
    }

    const playtests = activePlaytests();
    const playtest = activePlaytest(playtests);
    if (!playtest) {
        board.innerHTML = `
            <section class="playtest-empty">
                <h3>No playtest selected</h3>
                <p>Create one from the scheduler admin controls first.</p>
            </section>
        `;
        return;
    }

    const summaries = summarizePlaytestSlots(playtest);
    const communitySummaries = summaries
        .filter((summary) => !isFeaturedSlot(summary.slot))
        .sort((a, b) => dateValue(a.slot.startAt) - dateValue(b.slot.startAt) || b.score - a.score);
    const eventSummaries = summaries
        .filter((summary) => isFeaturedSlot(summary.slot))
        .sort((a, b) => dateValue(a.slot.startAt) - dateValue(b.slot.startAt) || b.score - a.score);
    const confirmedCount = [...communitySummaries, ...eventSummaries].filter((summary) => isSlotConfirmed(playtest.id, summary.slot.id)).length;
    const filters = adminCalendarFilters();

    board.innerHTML = `
        <section class="community-admin-summary">
            <div>
                <p class="panel-kicker">${escapeHtml(playtest.title)}</p>
                <h3>Admin Calendar</h3>
                <p>${escapeHtml(`${communitySummaries.length} community vote date${communitySummaries.length === 1 ? "" : "s"} and ${eventSummaries.length} planned event${eventSummaries.length === 1 ? "" : "s"} collected. Times are shown in ${viewerTimeZoneLabel()}.`)}</p>
            </div>
            <div class="playtest-meta-strip">
                <span>${communitySummaries.length} community</span>
                <span>${eventSummaries.length} planned</span>
                <span>${confirmedCount} confirmed</span>
                <span>${summariesTotalVoters([...communitySummaries, ...eventSummaries])} voters</span>
            </div>
        </section>
        ${renderCommunityAdminCalendar(playtest, communitySummaries, eventSummaries, filters)}
    `;
}

function renderCommunityAdminCalendar(playtest, communitySummaries, eventSummaries = [], filters = adminCalendarFilters()) {
    const monthDate = calendarMonthDate(playtest);
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const first = new Date(year, month, 1, 12, 0, 0);
    const blankCells = (first.getDay() + 6) % 7;
    const dayCount = new Date(year, month + 1, 0).getDate();
    const summariesByDay = new Map();

    for (const summary of communitySummaries) {
        const key = dateKey(summary.slot.startAt);
        if (!summariesByDay.has(key)) summariesByDay.set(key, []);
        summariesByDay.get(key).push(summary);
    }

    const eventsByDay = new Map();
    for (const summary of eventSummaries) {
        const key = dateKey(summary.slot.startAt);
        if (!eventsByDay.has(key)) eventsByDay.set(key, []);
        eventsByDay.get(key).push(summary);
    }

    const cells = [];
    let visibleCommunityCount = 0;
    let visibleEventCount = 0;
    for (let index = 0; index < blankCells; index++) cells.push(`<span class="admin-calendar-cell empty"></span>`);
    for (let day = 1; day <= dayCount; day++) {
        const dayDate = new Date(year, month, day, 12, 0, 0);
        const dayKey = dateKey(dayDate);
        const dayCommunitySummaries = filters.community ? summariesByDay.get(dayKey) || [] : [];
        const dayEventSummaries = filters.events ? eventsByDay.get(dayKey) || [] : [];
        const visibleSummaries = [...dayEventSummaries, ...dayCommunitySummaries];
        visibleCommunityCount += dayCommunitySummaries.length;
        visibleEventCount += dayEventSummaries.length;
        const hasConfirmed = visibleSummaries.some((summary) => isSlotConfirmed(playtest.id, summary.slot.id));
        cells.push(`
            <article class="admin-calendar-cell ${dayCommunitySummaries.length ? "has-community" : ""} ${dayEventSummaries.length ? "has-event" : ""} ${hasConfirmed ? "has-confirmed" : ""}">
                <div class="admin-calendar-day">
                    <strong>${day}</strong>
                    <span>${escapeHtml(formatDateKeyWeekday(dayKey).slice(0, 3))}</span>
                </div>
                ${visibleSummaries.length ? renderAdminDayAvailabilityBar(dayKey, visibleSummaries) : ""}
                ${visibleSummaries.length === 0
                    ? `<small>${filters.community || filters.events ? "No shown dates" : "Layers hidden"}</small>`
                    : [
                        ...dayEventSummaries.map((summary) => renderAdminCalendarSlot(playtest, summary, "event")),
                        ...dayCommunitySummaries.map((summary) => renderAdminCalendarSlot(playtest, summary, "community"))
                    ].join("")}
            </article>
        `);
    }

    return `
        <section class="community-calendar-panel">
            <div class="calendar-head">
                <div>
                    <p class="panel-kicker">Community Calendar</p>
                    <h4>${escapeHtml(formatMonthLabel(monthDate))}</h4>
                </div>
                <div class="admin-calendar-controls">
                    ${renderAdminCalendarLayerToggles(filters, communitySummaries.length, eventSummaries.length)}
                    <div class="calendar-nav">
                        <button type="button" data-playtest-month="0" class="${state.playtests.calendarMonthOffset === 0 ? "active" : ""}" aria-pressed="${state.playtests.calendarMonthOffset === 0 ? "true" : "false"}" aria-label="${escapeHtml(`Show ${formatMonthLabel(baseCalendarMonthDate(playtest))}`)}">${escapeHtml(formatMonthLabel(baseCalendarMonthDate(playtest)).split(" ")[0])}</button>
                        <button type="button" data-playtest-month="1" class="${state.playtests.calendarMonthOffset === 1 ? "active" : ""}" aria-pressed="${state.playtests.calendarMonthOffset === 1 ? "true" : "false"}" aria-label="${escapeHtml(`Show ${formatMonthLabel(new Date(baseCalendarMonthDate(playtest).getFullYear(), baseCalendarMonthDate(playtest).getMonth() + 1, 1, 12, 0, 0))}`)}">Next</button>
                    </div>
                </div>
            </div>
            <div class="admin-calendar-grid">
                ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => `<span class="calendar-weekday">${day}</span>`).join("")}
                ${cells.join("")}
            </div>
            ${renderAdminCalendarEmptyNote(monthDate, filters, visibleCommunityCount, visibleEventCount)}
        </section>
    `;
}

function renderAdminCalendarLayerToggles(filters, communityCount, eventCount) {
    const options = [
        { id: "community", label: "Community votes", count: communityCount },
        { id: "events", label: "My events", count: eventCount }
    ];

    return `
        <div class="admin-layer-toggles" role="group" aria-label="Calendar layers">
            ${options.map((option) => {
                const active = Boolean(filters[option.id]);
                return `
                    <button
                        type="button"
                        class="${active ? "active" : ""}"
                        data-admin-calendar-filter="${escapeHtml(option.id)}"
                        aria-pressed="${active ? "true" : "false"}"
                        aria-label="${escapeHtml(`${active ? "Hide" : "Show"} ${option.label.toLowerCase()} on the calendar`)}"
                    >
                        <span>${escapeHtml(option.label)}</span>
                        <small>${option.count}</small>
                    </button>
                `;
            }).join("")}
        </div>
    `;
}

function renderAdminCalendarEmptyNote(monthDate, filters, visibleCommunityCount, visibleEventCount) {
    if (!filters.community && !filters.events) {
        return `<p class="mode-empty admin-month-empty">Community votes and planned events are hidden.</p>`;
    }
    if (visibleCommunityCount + visibleEventCount > 0) return "";

    const visibleLayers = [
        filters.community ? "community votes" : "",
        filters.events ? "planned events" : ""
    ].filter(Boolean).join(" or ");
    return `<p class="mode-empty admin-month-empty">No ${escapeHtml(visibleLayers)} in ${escapeHtml(formatMonthLabel(monthDate))}.</p>`;
}

function renderAdminDayAvailabilityBar(dayKey, daySummaries) {
    const segments = adminDayAvailabilitySegments(dayKey, daySummaries);
    const peak = segments.reduce((best, segment) => {
        if (!best || segment.count > best.count) return segment;
        return best;
    }, null);
    const peakText = peak?.count
        ? `Peak ${peak.label} - ${peak.count} ${peak.count === 1 ? "person" : "people"}`
        : "No availability";

    return `
        <div class="admin-day-availability" aria-label="${escapeHtml(peakText)}">
            <div class="admin-hour-bar">
                ${segments.map((segment) => `
                    <span
                        class="admin-hour-segment hour-level-${segment.level}"
                        title="${escapeHtml(`${segment.label} - ${segment.nextLabel}: ${segment.count} ${segment.count === 1 ? "person" : "people"}`)}"
                    ></span>
                `).join("")}
            </div>
            <div class="admin-hour-axis" aria-hidden="true">
                <span>00</span>
                <span>06</span>
                <span>12</span>
                <span>18</span>
                <span>24</span>
            </div>
            <small class="admin-day-peak">${escapeHtml(peakText)}</small>
        </div>
    `;
}

function adminDayAvailabilitySegments(dayKey, daySummaries) {
    return Array.from({ length: 24 }, (_, hour) => {
        const start = localDateFromKey(dayKey, minutesToTime(hour * 60)).getTime();
        const end = hour === 23
            ? localDateFromKey(nextLocalDateKey(dayKey), "00:00").getTime()
            : localDateFromKey(dayKey, minutesToTime((hour + 1) * 60)).getTime();
        const voters = new Set();

        for (const summary of daySummaries) {
            for (const vote of summary.votes || []) {
                const interval = voteAvailabilityInterval(summary.slot, vote);
                if (!interval || interval.start >= end || interval.end <= start) continue;
                voters.add(vote.userId || vote.username);
            }
        }

        const count = voters.size;
        return {
            hour,
            count,
            level: count === 0 ? 0 : Math.min(5, count),
            label: minutesToTime(hour * 60),
            nextLabel: hour === 23 ? "24:00" : minutesToTime((hour + 1) * 60)
        };
    });
}

function renderAdminCalendarSlot(playtest, summary, layer) {
    const confirmed = isSlotConfirmed(playtest.id, summary.slot.id);
    const displaySlot = confirmedDisplaySlot(playtest.id, summary.slot);
    const slotLabel = `${formatSlotShortRange(displaySlot)} ${formatSlotTimeRange(displaySlot)}`;
    const layerLabel = layer === "event"
        ? (playtest.mainSlotId === summary.slot.id ? "Main event" : "My event")
        : "Community vote";
    const adminActions = isPlaytestAdmin()
        ? `
            <div class="date-admin-actions">
                <button type="button" data-confirm-date="${escapeHtml(dateKey(summary.slot.startAt))}" data-confirm-slot="${escapeHtml(summary.slot.id)}" aria-label="${escapeHtml(`Confirm ${slotLabel}`)}" ${confirmed || isPastSlot(summary.slot) ? "disabled" : ""}>Confirm</button>
                <button type="button" data-unconfirm-slot="${escapeHtml(summary.slot.id)}" aria-label="${escapeHtml(`Unconfirm ${slotLabel}`)}" ${confirmed ? "" : "disabled"}>Unconfirm</button>
                ${renderAdminSlotDeleteControl(playtest, summary)}
            </div>
        `
        : "";
    return `
        <section class="admin-calendar-slot admin-calendar-slot-${escapeHtml(layer)}">
            <div class="date-card-topline">
                <time datetime="${escapeHtml(displaySlot.startAt)}">${escapeHtml(formatSlotTimeRange(displaySlot))}</time>
                <span class="admin-slot-type">${escapeHtml(layerLabel)}</span>
                ${renderConfirmationBadge(playtest.id, summary.slot.id, `admin-${summary.slot.id}`)}
            </div>
            <div class="admin-slot-stats">
                <span>${summary.availableTotal} available</span>
                <span>${summary.counts.preferred} preferred</span>
                <span>${summary.counts.maybe} maybe</span>
                <span>Best ${summary.bestTime ? escapeHtml(formatOverlapRange(summary.bestTime)) : "No overlap"}</span>
                <span>Overlap ${summary.rankScore ?? summary.score}</span>
            </div>
            ${adminActions}
        </section>
    `;
}

function renderAdminSlotDeleteControl(playtest, summary) {
    const slotId = summary.slot.id;
    const pending = slotDeletePendingState(playtest.id, slotId);
    const canDelete = canDeletePlaytestSlot(playtest, slotId);
    const slotLabel = `${formatSlotShortRange(summary.slot)} ${formatSlotTimeRange(summary.slot)}`;
    if (!canDelete) {
        return `<button class="slot-delete-button" type="button" disabled title="Keep at least one date in a playtest." aria-label="${escapeHtml(`Delete ${slotLabel}`)}">Delete</button>`;
    }
    if (!pending.pending) {
        return `<button class="slot-delete-button" type="button" data-admin-delete-slot="${escapeHtml(slotId)}" aria-label="${escapeHtml(`Delete ${slotLabel}`)}">Delete</button>`;
    }
    if (!pending.ready) {
        return `<button class="slot-delete-button waiting" type="button" disabled aria-label="${escapeHtml(`Wait before deleting ${slotLabel}`)}">Wait ${pending.remainingSeconds}s</button>
            <button class="slot-delete-cancel" type="button" data-admin-cancel-delete-slot="${escapeHtml(slotId)}" aria-label="${escapeHtml(`Cancel deleting ${slotLabel}`)}">Cancel</button>`;
    }
    return `<button class="slot-delete-button danger" type="button" data-admin-delete-slot="${escapeHtml(slotId)}" aria-label="${escapeHtml(`Confirm delete ${slotLabel}`)}">Confirm delete</button>
        <button class="slot-delete-cancel" type="button" data-admin-cancel-delete-slot="${escapeHtml(slotId)}" aria-label="${escapeHtml(`Cancel deleting ${slotLabel}`)}">Cancel</button>`;
}

function renderPlaytestList(playtests, active) {
    const container = document.getElementById("playtest-list");
    if (!container) return;
    if (playtests.length === 0) {
        container.innerHTML = `<section class="playtest-side-block"><p class="mode-empty">No active playtests.</p></section>`;
        return;
    }

    container.innerHTML = `
        <section class="playtest-side-block">
            <p class="panel-kicker">Featured Plans</p>
            <div class="playtest-list">
                ${playtests.map((playtest) => {
                    const summaries = summarizePlaytestSlots(playtest);
                    const best = bestPlaytestSlots(summaries)[0];
                    const selected = active?.id === playtest.id;
                    return `
                        <button class="playtest-list-item ${selected ? "active" : ""}" type="button" data-playtest-select="${escapeHtml(playtest.id)}" aria-pressed="${selected ? "true" : "false"}" aria-label="${escapeHtml(`${playtest.title}${selected ? ", selected" : ""}`)}">
                            <span>${escapeHtml(playtestStatusLabel(playtest))}</span>
                            <strong>${escapeHtml(playtest.title)}</strong>
                            <small>${best ? `${escapeHtml(formatSlotShortRange(best.slot))} - Score ${best.score}` : "No slots"}</small>
                        </button>
                    `;
                }).join("")}
            </div>
        </section>
    `;
}

function renderPlaytestIdentity() {
    const container = document.getElementById("playtest-identity");
    if (!container) return;
    const loggedIn = isDiscordLoggedIn();
    const authLabel = playtestAuthLabel();
    const avatar = PLAYTEST_VIEWER.avatarUrl
        ? `<img class="identity-avatar" src="${escapeHtml(PLAYTEST_VIEWER.avatarUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
        : `<span class="identity-avatar">${escapeHtml(PLAYTEST_VIEWER.avatarInitials)}</span>`;
    container.innerHTML = `
        <section class="playtest-side-block identity-block">
            <p class="panel-kicker">Discord Identity</p>
            <div class="identity-row">
                ${avatar}
                <div>
                    <strong>${escapeHtml(PLAYTEST_VIEWER.username)}</strong>
                    <small>${escapeHtml(authLabel)}</small>
                </div>
            </div>
            <div class="identity-actions">
                ${loggedIn
                    ? `<button type="button" data-auth-sign-out>Sign out</button>`
                    : `<button type="button" data-auth-login ${state.authClient && state.authReady ? "" : "disabled"}>Login with Discord</button>`}
                <a href="https://discord.gg/y8JRduKyZA" target="_blank" rel="noopener noreferrer">Open Discord</a>
            </div>
            ${state.authMessage ? `<p class="identity-status">${escapeHtml(state.authMessage)}</p>` : ""}
        </section>
    `;
}

function renderPlaytestPreferences(playtest) {
    const container = document.getElementById("playtest-preferences");
    if (!container) return;
    if (!playtest) {
        container.innerHTML = "";
        return;
    }

    const preference = playtestPreference(playtest.id);
    container.innerHTML = `
        <section class="playtest-side-block">
            <p class="panel-kicker">Session Preference</p>
            <fieldset class="preference-field">
                <legend>Mode</legend>
                ${PLAYTEST_MODE_OPTIONS.map((mode) => `
                    <label>
                        <input type="radio" name="playtest-mode" value="${escapeHtml(mode)}" ${preference.modePreference === mode ? "checked" : ""}>
                        <span>${escapeHtml(mode)}</span>
                    </label>
                `).join("")}
            </fieldset>
        </section>
    `;
}

function renderPlaytestAdmin(playtest) {
    const container = document.getElementById("playtest-admin");
    if (!container) return;
    if (!isPlaytestAdmin()) {
        container.innerHTML = "";
        return;
    }
    const isFrozen = Boolean(playtest?.frozen);
    const isClosed = playtest?.status === "closed" || playtest?.status === "finished";
    container.innerHTML = `
        <section class="playtest-side-block admin-draft-block">
            <details>
                <summary>Admin controls</summary>
                ${playtest ? `
                    <div class="admin-action-grid">
                        <button type="button" data-route="community-dates">Community calendar</button>
                        <button type="button" data-playtest-admin="duplicate">Duplicate</button>
                        <button type="button" data-playtest-admin="${isClosed ? "reopen" : "close"}">${isClosed ? "Reopen" : "Close voting"}</button>
                        <button type="button" data-playtest-admin="${isFrozen ? "unfreeze" : "freeze"}">${isFrozen ? "Unfreeze" : "Freeze votes"}</button>
                        <button type="button" data-playtest-admin="reset-votes">Reset my votes</button>
                    </div>
                ` : ""}
                <form class="playtest-create-form" id="playtest-create-form">
                    <label>
                        <span>Title</span>
                        <input name="title" type="text" placeholder="Battle Royale Playtest" required>
                    </label>
                    <label>
                        <span>Description</span>
                        <textarea name="description" rows="3" placeholder="Focus for this test"></textarea>
                    </label>
                    <label>
                        <span>First featured date</span>
                        <input name="mainSlot" type="datetime-local" required>
                    </label>
                    <label>
                        <span>Other featured dates</span>
                        <textarea name="alternativeSlots" rows="4" placeholder="2026-07-17T20:00&#10;2026-07-19T20:00"></textarea>
                    </label>
                    <label>
                        <span>Status</span>
                        <select name="status">
                            <option value="voting">Voting</option>
                            <option value="upcoming">Upcoming</option>
                            <option value="closed">Closed</option>
                        </select>
                    </label>
                    <button type="submit">Create playtest</button>
                </form>
            </details>
        </section>
    `;
}

function renderPlaytestBoard(playtest) {
    const board = document.getElementById("playtest-board");
    if (!board) return;
    if (!playtest) {
        board.innerHTML = `
            <section class="playtest-empty">
                <h3>No playtest selected</h3>
                <p>${isPlaytestAdmin() ? "Create one from the admin controls or restore a local draft." : "No public playtest is available yet."}</p>
            </section>
        `;
        return;
    }

    const summaries = summarizePlaytestSlots(playtest);
    const ranked = bestPlaytestSlots(summaries);
    const best = ranked[0];
    const second = ranked[1];
    const canVote = canVoteOnPlaytest(playtest);
    const lockedReason = playtestLockReason(playtest);
    const selected = selectedCalendarDateInfo(playtest, summaries, best);
    const featuredSummaries = summaries.filter((summary) => isFeaturedSlot(summary.slot));
    const nextEvent = nextEventSummary(playtest, summaries);

    board.innerHTML = `
        <section class="playtest-detail-head">
            <div>
                <p class="panel-kicker">${escapeHtml(playtestStatusLabel(playtest))}</p>
                <h3>${escapeHtml(playtest.title)}</h3>
                <p>${escapeHtml(playtest.description || "Community playtest")}</p>
            </div>
            <div class="playtest-meta-strip">
                <span>${escapeHtml(summariesTotalVoters(summaries))} voters</span>
                <span>${featuredSummaries.length} featured dates</span>
                <span>${summaries.length - featuredSummaries.length} community dates</span>
            </div>
        </section>

        <section class="playtest-summary-grid">
            ${nextEvent ? renderNextEventCard(nextEvent, playtest) : ""}
            ${best ? renderBestDateCard(best, second, playtest) : ""}
            ${best ? renderPreferenceSummary(best, "Best date") : ""}
        </section>

        ${lockedReason ? `<div class="playtest-lock-note">${escapeHtml(lockedReason)}</div>` : ""}

        <section class="featured-slot-section">
            <div class="featured-slot-head">
                <p class="panel-kicker">Featured Dates</p>
                <span>Your planned dates appear here. Community-picked dates stay in the calendar.</span>
            </div>
            <div class="playtest-slot-grid">
                ${featuredSummaries.map((summary) => renderPlaytestSlotCard(summary, playtest, canVote, summaries)).join("")}
            </div>
        </section>

        <section class="calendar-vote-grid">
            ${renderPlaytestCalendar(playtest, summaries)}
            ${renderSelectedDateCard(selected, playtest, canVote)}
        </section>

        <section class="playtest-analytics-grid">
            ${renderPlaytestHeatmap(ranked)}
            ${renderPlaytestResults(best, second, playtest)}
        </section>
    `;
}

function renderNextEventCard(summary, playtest) {
    const scheduledSlot = confirmedDisplaySlot(playtest.id, summary.slot);
    return `
        <article class="main-date-card next-event-card">
            <div class="date-card-topline">
                <span class="main-date-label">Next event</span>
                ${renderConfirmationBadge(playtest.id, summary.slot.id, `next-${summary.slot.id}`)}
            </div>
            <strong>${escapeHtml(formatSlotWeekday(scheduledSlot.startAt))}</strong>
            <span>${escapeHtml(formatSlotDay(scheduledSlot.startAt))}</span>
            <time datetime="${escapeHtml(scheduledSlot.startAt)}">${escapeHtml(formatSlotTimeRange(scheduledSlot))}</time>
            <div class="main-date-counts">
                <span>${summary.availableTotal} available</span>
                <span>${summary.counts.preferred} preferred</span>
            </div>
            <p class="selected-date-note">This is the confirmed scheduled playtest date.</p>
        </article>
    `;
}

function renderPlaytestConfirmationDialog() {
    let host = document.getElementById("playtest-confirmation-host");
    if (!host) {
        host = document.createElement("div");
        host.id = "playtest-confirmation-host";
        document.body.appendChild(host);
    }

    const pending = state.playtests.pendingConfirmation;
    if (!pending) {
        host.innerHTML = "";
        return;
    }

    const playtest = activePlaytests().find((entry) => entry.id === pending.playtestId);
    const summaries = playtest ? summarizePlaytestSlots(playtest) : [];
    const summary = summaries.find((entry) => entry.slot.id === pending.slotId);
    if (!playtest || !summary) {
        state.playtests.pendingConfirmation = null;
        host.innerHTML = "";
        return;
    }

    const range = normalizeTimeRange(pending.startTime, pending.endTime);
    const bestText = summary.bestTime ? formatOverlapRange(summary.bestTime) : "No shared best time yet";
    host.innerHTML = `
        <div class="playtest-modal-backdrop" data-confirm-dialog-backdrop>
            <form class="playtest-confirm-dialog" data-confirm-dialog-form>
                <div class="date-card-topline">
                    <p class="panel-kicker">Confirm Event</p>
                    <button type="button" class="modal-icon-button" data-confirm-dialog-close aria-label="Close confirmation dialog">x</button>
                </div>
                <h3>${escapeHtml(formatSlotWeekday(summary.slot.startAt))}</h3>
                <p>${escapeHtml(formatSlotDay(summary.slot.startAt))}</p>
                <div class="confirm-time-note">
                    <span>Best time</span>
                    <strong>${escapeHtml(bestText)}</strong>
                </div>
                <div class="community-time-fields confirm-time-fields">
                    <label>
                        <span>Start</span>
                        <input type="text" name="confirm-start" value="${escapeHtml(range.startTime)}" placeholder="20:00" maxlength="5" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" data-confirm-start required>
                    </label>
                    <label>
                        <span>End</span>
                        <input type="text" name="confirm-end" value="${escapeHtml(range.endTime)}" placeholder="22:00" maxlength="5" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" data-confirm-end required>
                    </label>
                </div>
                <small class="selected-date-note">Times use ${escapeHtml(viewerTimeZoneLabel())}. You can move the final session earlier or later before confirming.</small>
                <div class="date-admin-actions modal-actions">
                    <button type="button" data-confirm-dialog-close>Cancel</button>
                    <button type="submit">Confirm event</button>
                </div>
            </form>
        </div>
    `;
}

function renderSelectedDateCard(selected, playtest, canVote) {
    if (!selected.summary) {
        const isPast = isPastDateKey(selected.dateKey);
        const notifyDisabled = isPast || !canVote;
        const defaultTimes = normalizeTimeRange();
        const selectedDateLabel = formatDateKeyDay(selected.dateKey);
        return `
            <article class="main-date-card selected-date-card">
                <div class="date-card-topline">
                    <span class="main-date-label">Selected date</span>
                    ${renderConfirmationBadge(playtest.id, null, `selected-${selected.dateKey}`)}
                </div>
                <strong>${escapeHtml(formatDateKeyWeekday(selected.dateKey))}</strong>
                <span>${escapeHtml(formatDateKeyDay(selected.dateKey))}</span>
                <div class="community-time-fields">
                    <label>
                        <span>Start</span>
                        <input type="text" value="${escapeHtml(defaultTimes.startTime)}" placeholder="20:00" maxlength="5" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" data-community-start aria-label="${escapeHtml(`Start time for ${selectedDateLabel}`)}">
                    </label>
                    <label>
                        <span>End</span>
                        <input type="text" value="${escapeHtml(defaultTimes.endTime)}" placeholder="22:00" maxlength="5" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" data-community-end aria-label="${escapeHtml(`End time for ${selectedDateLabel}`)}">
                    </label>
                </div>
                <small class="selected-date-note">Times use ${escapeHtml(viewerTimeZoneLabel())}.</small>
                <p class="selected-date-note">${isPast ? "This date has already passed." : "No one has started this date yet. Voting here will create a community date."}</p>
                ${renderNotificationToggle(playtest.id, null, selected.dateKey, notifyDisabled)}
                ${isPlaytestAdmin() ? renderConfirmationControls(playtest.id, null, selected.dateKey, isPast) : ""}
                <div class="vote-row compact">
                    ${PLAYTEST_STATUS_OPTIONS.map((option) => `
                        <button
                            class="vote-button vote-${escapeHtml(option.id)}"
                            type="button"
                            data-playtest-calendar-vote="${escapeHtml(option.id)}"
                            data-calendar-date="${escapeHtml(selected.dateKey)}"
                            aria-label="${escapeHtml(`${option.label} for ${formatDateKeyDay(selected.dateKey)}`)}"
                            aria-pressed="false"
                            ${canVote && !isPast ? "" : "disabled"}
                        >${escapeHtml(option.label)}</button>
                    `).join("")}
                </div>
            </article>
        `;
    }

    const summary = selected.summary;
    const displaySlot = confirmedDisplaySlot(playtest.id, summary.slot);
    const tag = isFeaturedSlot(summary.slot) ? "Featured date" : "Community date";
    const slotCanVote = canVote && !isPastSlot(summary.slot);
    const userVote = state.playtests.votes?.[playtest.id]?.[summary.slot.id];
    return `
        <article class="main-date-card selected-date-card">
            <div class="date-card-topline">
                <span class="main-date-label">${escapeHtml(tag)}</span>
                ${renderConfirmationBadge(playtest.id, summary.slot.id, `selected-${summary.slot.id}`)}
            </div>
            <strong>${escapeHtml(formatSlotWeekday(displaySlot.startAt))}</strong>
            <span>${escapeHtml(formatSlotDay(displaySlot.startAt))}</span>
            <time datetime="${escapeHtml(displaySlot.startAt)}">${escapeHtml(formatSlotTimeRange(displaySlot))}</time>
            <div class="main-date-counts">
                <span>${summary.availableTotal} available</span>
                <span>${summary.counts.preferred} preferred</span>
            </div>
            ${renderBestTimeSummary(summary)}
            ${renderVoteTimeFields(summary.slot, userVote, !slotCanVote)}
            ${renderNotificationToggle(playtest.id, summary.slot.id, dateKey(summary.slot.startAt), !slotCanVote)}
            ${isPlaytestAdmin() ? renderConfirmationControls(playtest.id, summary.slot.id, dateKey(summary.slot.startAt), isPastSlot(summary.slot)) : ""}
            <div class="vote-row compact">
                ${PLAYTEST_STATUS_OPTIONS.map((option) => renderVoteButton(option, summary, playtest, slotCanVote)).join("")}
            </div>
        </article>
    `;
}

function renderBestDateCard(best, second, playtest) {
    return `
        <article class="best-date-card">
            <div class="date-card-topline">
                <p class="panel-kicker">${playtest.status === "closed" || playtest.status === "finished" ? "Winner" : "Best Date"}</p>
                ${renderConfirmationBadge(playtest.id, best.slot.id, `best-${best.slot.id}`)}
            </div>
            <strong>${escapeHtml(formatSlotWeekday(best.slot.startAt))}</strong>
            <span>${escapeHtml(formatSlotDay(best.slot.startAt))} at ${escapeHtml(formatSlotTimeRange(best.slot))}</span>
            <div class="score-row">
                <div class="score-pill">Overlap ${best.rankScore || best.score}</div>
                ${renderHelpTipButton("best-date-score", BEST_DATE_SCORE_HELP, "How the Best Date score is calculated")}
            </div>
            ${renderBestTimeSummary(best)}
            <small>Date score ${best.score}</small>
            ${second ? `<small>Second: ${escapeHtml(formatSlotShortRange(second.slot))}, overlap ${second.rankScore || second.score}</small>` : ""}
        </article>
    `;
}

function renderConfirmationBadge(playtestId, slotId, helpKey = "") {
    const confirmed = slotId && isSlotConfirmed(playtestId, slotId);
    const badge = `<span class="confirmation-badge ${confirmed ? "confirmed" : "unconfirmed"}">${confirmed ? "Confirmed" : "Unconfirmed"}</span>`;
    if (confirmed) return badge;
    return `
        <span class="confirmation-help-row">
            ${badge}
            ${renderHelpTipButton(`confirmation-${playtestId}-${helpKey || slotId || "date"}`, CONFIRMATION_STATUS_HELP, "What unconfirmed means")}
        </span>
    `;
}

function renderHelpTipButton(id, text, label) {
    const active = state.playtests.activeHelpTip === id;
    return `
        <span class="help-tip-wrap ${active ? "active" : ""}">
            <button
                class="help-tip-button"
                type="button"
                data-help-tip="${escapeHtml(id)}"
                aria-label="${escapeHtml(label)}"
                aria-expanded="${active ? "true" : "false"}"
            >?</button>
            <span class="help-tip-popover" role="tooltip">${escapeHtml(text)}</span>
        </span>
    `;
}

function renderNotificationToggle(playtestId, slotId, dateKeyValue, disabled) {
    const key = slotId || `date:${dateKeyValue}`;
    const subscribed = isNotificationSubscribed(playtestId, key);
    const count = slotId ? notificationSubscriberCount(playtestId, slotId) : 0;
    const labelContext = dateKeyValue ? formatDateKeyDay(dateKeyValue) : "this date";
    const loginRequired = !isDiscordLoggedIn();
    const authPending = state.authClient && !state.authReady;
    const effectiveDisabled = disabled || loginRequired || authPending;
    const helperText = authPending
        ? "Checking Discord login..."
        : loginRequired
            ? "Login with Discord required for notification to be toggled."
            : `${count} Discord notification opt-in${count === 1 ? "" : "s"}`;
    return `
        <div class="notify-row">
            <label class="notify-toggle ${subscribed ? "active" : ""}">
                <input
                    type="checkbox"
                    data-notify-toggle="${escapeHtml(key)}"
                    data-calendar-date="${escapeHtml(dateKeyValue || "")}"
                    aria-label="${escapeHtml(`Notify me on confirmation for ${labelContext}`)}"
                    ${subscribed ? "checked" : ""}
                    ${effectiveDisabled ? "disabled" : ""}
                >
                <span>Notify me on confirmation</span>
            </label>
            <small class="${loginRequired && !authPending ? "notify-warning" : ""}">${escapeHtml(helperText)}</small>
        </div>
    `;
}

function renderConfirmationControls(playtestId, slotId, dateKeyValue, disabled) {
    const confirmed = slotId && isSlotConfirmed(playtestId, slotId);
    const labelContext = dateKeyValue ? formatDateKeyDay(dateKeyValue) : "this date";
    return `
        <div class="date-admin-actions">
            <button
                type="button"
                data-confirm-date="${escapeHtml(dateKeyValue || "")}"
                data-confirm-slot="${escapeHtml(slotId || "")}"
                aria-label="${escapeHtml(`Confirm ${labelContext}`)}"
                ${disabled || confirmed ? "disabled" : ""}
            >Confirm date</button>
            <button
                type="button"
                data-unconfirm-slot="${escapeHtml(slotId || "")}"
                aria-label="${escapeHtml(`Unconfirm ${labelContext}`)}"
                ${!slotId || !confirmed ? "disabled" : ""}
            >Unconfirm</button>
        </div>
    `;
}

function renderPreferenceSummary(summary, contextLabel) {
    const modes = tallyPreferences(summary.availableVoters, "modePreference");
    return `
        <article class="preference-summary-card">
            <p class="panel-kicker">Session Interest</p>
            <span class="interest-context">${escapeHtml(contextLabel)} - ${escapeHtml(formatSlotShortRange(summary.slot))}</span>
            <strong>${summary.availableTotal} available</strong>
            <div class="preference-bars">
                ${renderPreferenceBars(modes, "No mode votes yet")}
            </div>
        </article>
    `;
}

function renderPreferenceBars(entries, emptyText) {
    if (entries.length === 0) return `<span class="muted-line">${escapeHtml(emptyText)}</span>`;
    const max = Math.max(PLAYTEST_INTEREST_MIN_SCALE, ...entries.map((entry) => entry.count));
    return entries.slice(0, 4).map((entry) => `
        <div class="preference-bar-row">
            <span>${escapeHtml(entry.label)}</span>
            <div><i style="width: ${Math.max(8, Math.round((entry.count / max) * 100))}%"></i></div>
            <strong>${entry.count}</strong>
        </div>
    `).join("");
}

function renderVoteTimeFields(slot, userVote, disabled) {
    const range = voteInputRangeForSlot(slot, userVote);
    const slotLabel = formatSlotShortRange(slot);
    return `
        <div class="vote-time-fields" data-vote-time-slot="${escapeHtml(slot.id)}">
            <span>Your time</span>
            <label>
                <small>Start</small>
                <input type="text" value="${escapeHtml(range.startTime)}" placeholder="20:00" maxlength="5" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" data-vote-start aria-label="${escapeHtml(`Start time for ${slotLabel}`)}" ${disabled ? "disabled" : ""}>
            </label>
            <label>
                <small>End</small>
                <input type="text" value="${escapeHtml(range.endTime)}" placeholder="22:00" maxlength="5" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" data-vote-end aria-label="${escapeHtml(`End time for ${slotLabel}`)}" ${disabled ? "disabled" : ""}>
            </label>
        </div>
    `;
}

function renderBestTimeSummary(summary) {
    if (!summary.bestTime) return `<p class="best-time-line muted-line">No shared time yet</p>`;
    return `
        <div class="best-time-line">
            <span>Best time</span>
            <strong>${escapeHtml(formatOverlapRange(summary.bestTime))}</strong>
            <small>${escapeHtml(overlapPeopleText(summary.bestTime))}</small>
        </div>
    `;
}

function renderPlaytestSlotCard(summary, playtest, canVote, summaries = []) {
    const expanded = state.playtests.expandedSlotIds.has(summary.slot.id);
    const maxAvailable = Math.max(PLAYTEST_INTEREST_MIN_SCALE, ...summaries.map((item) => item.availableTotal));
    const fill = Math.min(100, Math.round((summary.availableTotal / maxAvailable) * 100));
    const slotCanVote = canVote && !isPastSlot(summary.slot);
    const userVote = state.playtests.votes?.[playtest.id]?.[summary.slot.id];
    const displaySlot = confirmedDisplaySlot(playtest.id, summary.slot);
    return `
        <article class="playtest-slot-card ${isFeaturedSlot(summary.slot) ? "featured-slot" : ""}">
            <div class="slot-card-head">
                <div>
                    <div class="date-card-topline">
                        <span>${escapeHtml(summary.slot.label || "Featured date")}</span>
                        ${renderConfirmationBadge(playtest.id, summary.slot.id, `slot-card-${summary.slot.id}`)}
                    </div>
                    <strong>${escapeHtml(formatSlotWeekday(displaySlot.startAt))}</strong>
                    <time datetime="${escapeHtml(displaySlot.startAt)}">${escapeHtml(formatSlotDay(displaySlot.startAt))} - ${escapeHtml(formatSlotTimeRange(displaySlot))}</time>
                </div>
                <button class="slot-expand" type="button" data-playtest-expand="${escapeHtml(summary.slot.id)}" aria-expanded="${expanded ? "true" : "false"}" aria-label="${escapeHtml(`${expanded ? "Hide" : "Show"} votes for ${formatSlotShortRange(displaySlot)}`)}">${expanded ? "Hide" : "Votes"}</button>
            </div>
            <div class="availability-meter"><span style="width: ${fill}%"></span></div>
            <div class="vote-count-grid">
                ${PLAYTEST_COUNT_ORDER.map((status) => `
                    <span class="count-${escapeHtml(status)}">
                        <strong>${status === "available" ? summary.availableTotal : summary.counts[status]}</strong>
                        ${escapeHtml(statusLabel(status))}
                    </span>
                `).join("")}
            </div>
            ${renderBestTimeSummary(summary)}
            ${renderVoteTimeFields(summary.slot, userVote, !slotCanVote)}
            <div class="vote-row">
                ${PLAYTEST_STATUS_OPTIONS.map((option) => renderVoteButton(option, summary, playtest, slotCanVote)).join("")}
            </div>
            ${expanded ? renderVoteBreakdown(summary) : ""}
        </article>
    `;
}

function renderVoteButton(option, summary, playtest, canVote) {
    const userVote = state.playtests.votes?.[playtest.id]?.[summary.slot.id];
    const active = userVote?.status === option.id;
    const slotLabel = formatSlotShortRange(summary.slot);
    return `
        <button
            class="vote-button vote-${escapeHtml(option.id)} ${active ? "active" : ""}"
            type="button"
            data-playtest-vote="${escapeHtml(option.id)}"
            data-slot-id="${escapeHtml(summary.slot.id)}"
            aria-label="${escapeHtml(`${option.label} for ${slotLabel}${active ? ", selected" : ""}`)}"
            aria-pressed="${active ? "true" : "false"}"
            ${canVote ? "" : "disabled"}
        >${escapeHtml(option.label)}</button>
    `;
}

function renderVoteBreakdown(summary) {
    return `
        <div class="vote-breakdown">
            ${PLAYTEST_COUNT_ORDER.map((status) => {
                const voters = summary.votersByStatus[status] || [];
                return `
                    <section>
                        <h4>${escapeHtml(statusLabel(status))} (${status === "available" ? summary.counts.available : voters.length})</h4>
                        ${voters.length === 0
                            ? `<p class="mode-empty">No voters</p>`
                            : `<ul>${voters.map((vote) => `
                                <li>
                                    <span>${escapeHtml(vote.username)}</span>
                                    <small>${["available", "preferred", "maybe"].includes(vote.status) ? `${escapeHtml(formatVoteTimeRange(summary.slot, vote))} - ` : ""}Updated ${escapeHtml(formatRelativeTime(vote.updatedAt))}</small>
                                </li>
                            `).join("")}</ul>`}
                    </section>
                `;
            }).join("")}
        </div>
    `;
}

function renderPlaytestCalendar(playtest, summaries) {
    const monthDate = calendarMonthDate(playtest);
    const baseMonthDate = baseCalendarMonthDate(playtest);
    const nextMonthDate = new Date(baseMonthDate.getFullYear(), baseMonthDate.getMonth() + 1, 1, 12, 0, 0);
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const first = new Date(year, month, 1, 12, 0, 0);
    const blankCells = (first.getDay() + 6) % 7;
    const dayCount = new Date(year, month + 1, 0).getDate();
    const maxScore = Math.max(...summaries.map((summary) => summary.score), 1);
    const summariesByDay = new Map(summaries.map((summary) => [dateKey(summary.slot.startAt), summary]));
    const selectedKey = selectedDateKey(playtest, summaries);
    const cells = [];
    for (let index = 0; index < blankCells; index++) cells.push(`<span class="calendar-cell empty"></span>`);
    for (let day = 1; day <= dayCount; day++) {
        const dayDate = new Date(year, month, day, 12, 0, 0);
        const dayKey = dateKey(dayDate);
        const summary = summariesByDay.get(dayKey);
        const ratio = summary ? summary.score / maxScore : 0;
        const level = ratio >= 0.74 ? "high" : ratio >= 0.44 ? "medium" : summary ? "low" : "none";
        const isFeatured = summary && isFeaturedSlot(summary.slot);
        const isConfirmed = summary && isSlotConfirmed(playtest.id, summary.slot.id);
        const isSelected = dayKey === selectedKey;
        const title = summary
            ? `${formatSlotDay(summary.slot.startAt)}: ${isConfirmed ? "confirmed" : "unconfirmed"}, ${summary.availableTotal} available, best time ${summary.bestTime ? formatOverlapRange(summary.bestTime) : "not found"}, ${summary.counts.preferred} preferred, ${summary.counts.maybe} maybe, ${summary.counts.unavailable} unavailable`
            : `${formatDateKeyDay(dayKey)}: no votes yet`;
        const ariaLabel = `${title}. ${isSelected ? "Selected date" : "Select date"}`;
        cells.push(`
            <button class="calendar-cell level-${level} ${isFeatured ? "calendar-featured" : ""} ${isConfirmed ? "calendar-confirmed" : ""} ${isSelected ? "calendar-selected" : ""}" type="button" data-calendar-date="${escapeHtml(dayKey)}" title="${escapeHtml(title)}" aria-label="${escapeHtml(ariaLabel)}" aria-pressed="${isSelected ? "true" : "false"}">
                <strong>${day}</strong>
                ${summary ? `<small aria-hidden="true">${isConfirmed ? "OK" : summary.availableTotal}</small>` : ""}
            </button>
        `);
    }

    return `
        <article class="calendar-card">
            <div class="calendar-head">
                <div>
                    <p class="panel-kicker">Calendar</p>
                    <h4>${escapeHtml(formatMonthLabel(monthDate))}</h4>
                </div>
                <div class="calendar-nav">
                    <button type="button" data-playtest-month="0" class="${state.playtests.calendarMonthOffset === 0 ? "active" : ""}" aria-pressed="${state.playtests.calendarMonthOffset === 0 ? "true" : "false"}" aria-label="${escapeHtml(`Show ${formatMonthLabel(baseMonthDate)}`)}">${escapeHtml(formatMonthLabel(baseMonthDate).split(" ")[0])}</button>
                    <button type="button" data-playtest-month="1" class="${state.playtests.calendarMonthOffset === 1 ? "active" : ""}" aria-pressed="${state.playtests.calendarMonthOffset === 1 ? "true" : "false"}" aria-label="${escapeHtml(`Show ${formatMonthLabel(nextMonthDate)}`)}">Next</button>
                </div>
            </div>
            <div class="calendar-grid">
                ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => `<span class="calendar-weekday">${day}</span>`).join("")}
                ${cells.join("")}
            </div>
        </article>
    `;
}

function renderPlaytestHeatmap(ranked) {
    const expanded = Boolean(state.playtests.heatmapExpanded);
    const visibleRows = expanded ? ranked : ranked.slice(0, 5);
    const maxScore = Math.max(...ranked.map((summary) => summary.rankScore || summary.score), 1);
    return `
        <article class="heatmap-card">
            <p class="panel-kicker">Heatmap</p>
            <h4>Best availability</h4>
            <div class="heatmap-list">
                ${visibleRows.map((summary) => `
                    <div class="heatmap-row">
                        <div>
                            <strong>${escapeHtml(formatSlotWeekday(summary.slot.startAt))}</strong>
                            <span>${escapeHtml(summary.bestTime ? formatOverlapRange(summary.bestTime) : formatSlotTimeRange(summary.slot))} - ${summary.total} votes</span>
                        </div>
                        <div class="heatmap-bar"><i style="width: ${Math.max(6, Math.round(((summary.rankScore || summary.score) / maxScore) * 100))}%"></i></div>
                        <small>${summary.rankScore || summary.score}</small>
                    </div>
                `).join("")}
            </div>
            ${ranked.length > 5 ? `<button class="heatmap-toggle" type="button" data-heatmap-toggle>${expanded ? "LESS" : "MORE"}</button>` : ""}
        </article>
    `;
}

function renderPlaytestResults(best, second, playtest) {
    if (!best) return "";
    return `
        <article class="results-card">
            <p class="panel-kicker">${playtest.status === "closed" || playtest.status === "finished" ? "Results" : "Best Date Detail"}</p>
            <h4>${escapeHtml(formatSlotWeekday(best.slot.startAt))}</h4>
            <dl>
                <div><dt>Pool time</dt><dd>${escapeHtml(formatSlotShortRange(best.slot))}</dd></div>
                <div><dt>Best time</dt><dd>${escapeHtml(best.bestTime ? formatOverlapRange(best.bestTime) : "No shared time yet")}</dd></div>
                <div><dt>Overlap</dt><dd>${best.rankScore || best.score}</dd></div>
                <div><dt>Participants</dt><dd>${best.availableTotal}</dd></div>
                <div><dt>Preferred</dt><dd>${best.counts.preferred}</dd></div>
                <div><dt>Maybe</dt><dd>${best.counts.maybe}</dd></div>
                ${second ? `<div><dt>Second</dt><dd>${escapeHtml(formatSlotShortRange(second.slot))}</dd></div>` : ""}
            </dl>
        </article>
    `;
}

function handlePlaytestClick(event) {
    const helpButton = event.target.closest("[data-help-tip]");
    if (helpButton) {
        const id = helpButton.dataset.helpTip;
        state.playtests.activeHelpTip = state.playtests.activeHelpTip === id ? "" : id;
        render();
        return;
    }

    const authLoginButton = event.target.closest("[data-auth-login]");
    if (authLoginButton) {
        void signInWithDiscord();
        return;
    }

    const authSignOutButton = event.target.closest("[data-auth-sign-out]");
    if (authSignOutButton) {
        void signOutDiscord();
        return;
    }

    const selectButton = event.target.closest("[data-playtest-select]");
    if (selectButton) {
        state.playtests.activeId = selectButton.dataset.playtestSelect;
        savePlaytestState();
        render();
        return;
    }

    const voteButton = event.target.closest("[data-playtest-vote]");
    if (voteButton) {
        const playtest = activePlaytest();
        if (!playtest || !canVoteOnPlaytest(playtest)) return;
        const slot = playtest.slots.find((entry) => entry.id === voteButton.dataset.slotId);
        setPlaytestVote(playtest.id, voteButton.dataset.slotId, voteButton.dataset.playtestVote, voteTimeRangeForButton(voteButton, slot));
        return;
    }

    const calendarVoteButton = event.target.closest("[data-playtest-calendar-vote]");
    if (calendarVoteButton) {
        const playtest = activePlaytest();
        if (!playtest || !canVoteOnPlaytest(playtest)) return;
        const slot = ensureCommunitySlot(playtest.id, calendarVoteButton.dataset.calendarDate, selectedCommunityTimeRange());
        if (!slot) return;
        setPlaytestVote(playtest.id, slot.id, calendarVoteButton.dataset.playtestCalendarVote, selectedCommunityTimeRange());
        return;
    }

    const calendarButton = event.target.closest("[data-calendar-date]");
    if (calendarButton && !calendarButton.matches("[data-notify-toggle]") && !calendarButton.matches("[data-playtest-calendar-vote]")) {
        const playtest = activePlaytest();
        if (!playtest) return;
        state.playtests.selectedCalendarDates[playtest.id] = calendarButton.dataset.calendarDate;
        savePlaytestState();
        render();
        return;
    }

    const notifyButton = event.target.closest("[data-notify-toggle]");
    if (notifyButton) {
        if (!isDiscordLoggedIn()) {
            state.authMessage = "Login with Discord required for notification to be toggled.";
            render();
            return;
        }
        const playtest = activePlaytest();
        if (!playtest) return;
        let key = notifyButton.dataset.notifyToggle;
        if (key.startsWith("date:")) {
            const slot = ensureCommunitySlot(playtest.id, notifyButton.dataset.calendarDate, selectedCommunityTimeRange());
            if (!slot) return;
            key = slot.id;
        }
        toggleNotificationSubscription(playtest.id, key);
        savePlaytestState();
        render();
        return;
    }

    const confirmButton = event.target.closest("[data-confirm-date]");
    if (confirmButton) {
        if (!isPlaytestAdmin()) return;
        const playtest = activePlaytest();
        if (!playtest) return;
        let slotId = confirmButton.dataset.confirmSlot;
        if (!slotId) {
            const slot = ensureCommunitySlot(playtest.id, confirmButton.dataset.confirmDate, selectedCommunityTimeRange());
            if (!slot) return;
            slotId = slot.id;
        }
        openConfirmDialog(playtest.id, slotId);
        render();
        return;
    }

    const unconfirmButton = event.target.closest("[data-unconfirm-slot]");
    if (unconfirmButton) {
        if (!isPlaytestAdmin()) return;
        const playtest = activePlaytest();
        if (!playtest) return;
        unconfirmPlaytestSlot(playtest.id, unconfirmButton.dataset.unconfirmSlot);
        savePlaytestState();
        render();
        return;
    }

    const monthButton = event.target.closest("[data-playtest-month]");
    if (monthButton) {
        state.playtests.calendarMonthOffset = monthButton.dataset.playtestMonth === "1" ? 1 : 0;
        savePlaytestState();
        render();
        return;
    }

    const adminCalendarFilterButton = event.target.closest("[data-admin-calendar-filter]");
    if (adminCalendarFilterButton) {
        if (!isPlaytestAdmin()) return;
        toggleAdminCalendarFilter(adminCalendarFilterButton.dataset.adminCalendarFilter);
        savePlaytestState();
        render();
        return;
    }

    const slotDeleteCancelButton = event.target.closest("[data-admin-cancel-delete-slot]");
    if (slotDeleteCancelButton) {
        if (!isPlaytestAdmin()) return;
        cancelSlotDeleteConfirm(slotDeleteCancelButton.dataset.adminCancelDeleteSlot);
        render();
        return;
    }

    const slotDeleteButton = event.target.closest("[data-admin-delete-slot]");
    if (slotDeleteButton) {
        if (!isPlaytestAdmin()) return;
        const playtest = activePlaytest();
        if (!playtest) return;
        const slotId = slotDeleteButton.dataset.adminDeleteSlot;
        const pending = slotDeletePendingState(playtest.id, slotId);
        if (!pending.pending || !pending.ready) {
            startSlotDeleteConfirm(playtest.id, slotId);
            render();
            return;
        }
        deletePlaytestSlot(playtest.id, slotId);
        savePlaytestState();
        render();
        return;
    }

    const expandButton = event.target.closest("[data-playtest-expand]");
    if (expandButton) {
        const slotId = expandButton.dataset.playtestExpand;
        if (state.playtests.expandedSlotIds.has(slotId)) {
            state.playtests.expandedSlotIds.delete(slotId);
        } else {
            state.playtests.expandedSlotIds.add(slotId);
        }
        render();
        return;
    }

    const heatmapButton = event.target.closest("[data-heatmap-toggle]");
    if (heatmapButton) {
        state.playtests.heatmapExpanded = !state.playtests.heatmapExpanded;
        savePlaytestState();
        render();
        return;
    }

    const adminButton = event.target.closest("[data-playtest-admin]");
    if (adminButton) {
        if (!isPlaytestAdmin()) return;
        handlePlaytestAdmin(adminButton.dataset.playtestAdmin);
    }
}

function handlePlaytestChange(event) {
    const active = activePlaytest();
    if (!active) return;
    if (event.target.name === "playtest-mode") {
        const preference = playtestPreference(active.id);
        preference.modePreference = PLAYTEST_MODE_OPTIONS.includes(event.target.value) ? event.target.value : "Either";
        state.playtests.preferences[active.id] = preference;
        syncPreferenceToExistingVotes(active.id, preference);
        savePlaytestState();
        render();
        return;
    }
}

function handlePlaytestSubmit(event) {
    if (event.target.id !== "playtest-create-form") return;
    event.preventDefault();
    if (!isPlaytestAdmin()) return;
    const form = event.target;
    const data = new FormData(form);
    const mainSlotAt = parsePlaytestDateInput(data.get("mainSlot"));
    if (!mainSlotAt) return;

    const id = `local-playtest-${Date.now()}`;
    const alternatives = String(data.get("alternativeSlots") || "")
        .split(/\r?\n/)
        .map((value) => parsePlaytestDateInput(value.trim()))
        .filter(Boolean);
    const slots = [
        { id: `${id}-main`, label: "Featured date", startAt: mainSlotAt, source: "featured" },
        ...alternatives.map((startAt, index) => ({ id: `${id}-alt-${index + 1}`, label: `Featured date ${index + 2}`, startAt, source: "featured" }))
    ];

    const playtest = {
        id,
        title: String(data.get("title") || "Community Playtest").trim() || "Community Playtest",
        description: String(data.get("description") || "").trim(),
        status: ["upcoming", "voting", "closed"].includes(data.get("status")) ? data.get("status") : "voting",
        createdBy: PLAYTEST_VIEWER.userId,
        createdAt: new Date().toISOString(),
        mainSlotId: `${id}-main`,
        slots
    };

    state.playtests.localPlaytests.push(playtest);
    state.playtests.activeId = id;
    savePlaytestState();
    form.reset();
    render();
}

function handlePlaytestAdmin(action) {
    if (!isPlaytestAdmin()) return;
    const playtest = activePlaytest();
    if (!playtest) return;
    const override = playtestOverride(playtest.id);

    if (action === "duplicate") {
        duplicatePlaytest(playtest);
    } else if (action === "close") {
        override.status = "closed";
    } else if (action === "reopen") {
        override.status = "voting";
    } else if (action === "freeze") {
        override.frozen = true;
    } else if (action === "unfreeze") {
        override.frozen = false;
    } else if (action === "reset-votes") {
        delete state.playtests.votes[playtest.id];
        closeEmptyCommunitySlots();
    }

    savePlaytestState();
    render();
}

function setPlaytestVote(playtestId, slotId, status, timeRange = null) {
    if (!PLAYTEST_STATUS_OPTIONS.some((option) => option.id === status)) return;
    const preference = playtestPreference(playtestId);
    const slot = findPlaytestSlot(playtestId, slotId);
    const normalizedRange = timeRange
        ? normalizeTimeRange(timeRange.startTime || timeRange.start, timeRange.endTime || timeRange.end)
        : defaultVoteTimeRangeForSlot(slot);
    const dateKeyValue = dateKey(slot?.startAt || new Date());
    state.playtests.votes[playtestId] = state.playtests.votes[playtestId] || {};
    state.playtests.votes[playtestId][slotId] = {
        userId: PLAYTEST_VIEWER.userId,
        username: PLAYTEST_VIEWER.username,
        status,
        updatedAt: new Date().toISOString(),
        modePreference: preference.modePreference,
        startTime: normalizedRange.startTime,
        endTime: normalizedRange.endTime,
        availableStartAt: localDateTimeIso(dateKeyValue, normalizedRange.startTime),
        availableEndAt: localDateTimeIso(dateKeyValue, normalizedRange.endTime)
    };
    recordAdminVoteEvent(playtestId, slotId, status);
    closeEmptyCommunitySlots();
    savePlaytestState();
    render();
}

function summarizePlaytestSlots(playtest) {
    return (playtest?.slots || []).map((slot) => {
        const votes = collectSlotVotes(playtest, slot.id);
        const votersByStatus = {
            available: votes.filter((vote) => vote.status === "available"),
            preferred: votes.filter((vote) => vote.status === "preferred"),
            maybe: votes.filter((vote) => vote.status === "maybe"),
            unavailable: votes.filter((vote) => vote.status === "unavailable")
        };
        const counts = Object.fromEntries(Object.entries(votersByStatus).map(([status, voters]) => [status, voters.length]));
        const availableVoters = [...votersByStatus.available, ...votersByStatus.preferred];
        const score = counts.available * 3 + counts.preferred * 5 + counts.maybe;
        const bestTime = bestVoteOverlap(slot, votes);
        return {
            slot,
            votes,
            votersByStatus,
            counts,
            availableVoters,
            availableTotal: availableVoters.length,
            total: votes.length,
            score,
            bestTime,
            rankScore: bestTime?.score || score
        };
    });
}

function collectSlotVotes(playtest, slotId) {
    const byUser = new Map();
    for (const vote of seedVotesForSlot(playtest, slotId)) {
        byUser.set(vote.userId, vote);
    }
    const localVote = state.playtests.votes?.[playtest.id]?.[slotId];
    if (localVote?.status) byUser.set(PLAYTEST_VIEWER.userId, localVote);
    return [...byUser.values()].sort((a, b) => statusSortValue(a.status) - statusSortValue(b.status) || a.username.localeCompare(b.username));
}

function closeEmptyCommunitySlots() {
    let changed = false;
    for (const [playtestId, slots] of Object.entries(state.playtests.communitySlots || {})) {
        if (!Array.isArray(slots) || !slots.length) continue;
        const keptSlots = [];
        for (const slot of slots) {
            if (communitySlotHasParticipant(playtestId, slot.id)) {
                keptSlots.push(slot);
                continue;
            }
            cleanupPlaytestSlotState(playtestId, slot);
            changed = true;
        }
        if (keptSlots.length) {
            state.playtests.communitySlots[playtestId] = keptSlots;
        } else {
            delete state.playtests.communitySlots[playtestId];
        }
    }
    return changed;
}

function communitySlotHasParticipant(playtestId, slotId) {
    return collectSlotVotes({ id: playtestId }, slotId)
        .some((vote) => COMMUNITY_SLOT_ACTIVE_STATUSES.has(vote.status));
}

function seedVotesForSlot(playtest, slotId) {
    const matrix = playtest?.seedMatrix?.[slotId];
    if (!matrix) return [];
    const votes = [];
    for (const status of PLAYTEST_COUNT_ORDER) {
        for (const userIndex of matrix[status] || []) {
            const user = PLAYTEST_SEED_USERS[userIndex];
            if (!user) continue;
            votes.push({
                userId: user.userId,
                username: user.username,
                status,
                updatedAt: seedUpdatedAt(userIndex),
                modePreference: user.modePreference
            });
        }
    }
    return votes;
}

function bestVoteOverlap(slot, votes) {
    const intervals = votes
        .map((vote) => voteAvailabilityInterval(slot, vote))
        .filter(Boolean);
    if (intervals.length === 0) return null;

    const eventGroups = new Map();
    for (const interval of intervals) {
        if (!eventGroups.has(interval.start)) eventGroups.set(interval.start, []);
        if (!eventGroups.has(interval.end)) eventGroups.set(interval.end, []);
        eventGroups.get(interval.start).push({ type: 1, status: interval.status });
        eventGroups.get(interval.end).push({ type: -1, status: interval.status });
    }

    const times = [...eventGroups.keys()].sort((a, b) => a - b);
    const active = { available: 0, preferred: 0, maybe: 0 };
    let best = null;

    for (let index = 0; index < times.length; index++) {
        const time = times[index];
        for (const event of eventGroups.get(time)) {
            active[event.status] = Math.max(0, (active[event.status] || 0) + event.type);
        }

        const nextTime = times[index + 1];
        if (!nextTime || nextTime <= time) continue;

        const score = active.available * statusWeight("available")
            + active.preferred * statusWeight("preferred")
            + active.maybe * statusWeight("maybe");
        if (score <= 0) continue;

        const candidate = {
            start: time,
            end: nextTime,
            startAt: new Date(time).toISOString(),
            endAt: new Date(nextTime).toISOString(),
            score,
            availableTotal: active.available + active.preferred,
            preferredTotal: active.preferred,
            maybeTotal: active.maybe,
            total: active.available + active.preferred + active.maybe,
            durationMinutes: Math.max(0, Math.round((nextTime - time) / 60000))
        };

        if (isBetterOverlap(candidate, best)) best = candidate;
    }

    return best;
}

function voteAvailabilityInterval(slot, vote) {
    if (!["available", "preferred", "maybe"].includes(vote?.status)) return null;
    let start = dateValue(vote.availableStartAt);
    let end = dateValue(vote.availableEndAt);

    if (!start || !end || end <= start) {
        const range = voteInputRangeForSlot(slot, vote);
        const key = dateKey(slot?.startAt || new Date());
        start = dateValue(localDateTimeIso(key, range.startTime));
        end = dateValue(localDateTimeIso(key, range.endTime));
    }

    if (!start || !end || end <= start) return null;
    return {
        start,
        end,
        status: vote.status
    };
}

function isBetterOverlap(candidate, best) {
    if (!best) return true;
    if (candidate.score !== best.score) return candidate.score > best.score;
    if (candidate.availableTotal !== best.availableTotal) return candidate.availableTotal > best.availableTotal;
    if (candidate.total !== best.total) return candidate.total > best.total;
    if (candidate.durationMinutes !== best.durationMinutes) return candidate.durationMinutes > best.durationMinutes;
    return candidate.start < best.start;
}

function statusWeight(status) {
    return PLAYTEST_STATUS_OPTIONS.find((option) => option.id === status)?.score || 0;
}

function bestPlaytestSlots(summaries) {
    return [...summaries].sort((a, b) => {
        const rankScore = (b.rankScore || 0) - (a.rankScore || 0);
        if (rankScore) return rankScore;
        const overlapAvailable = (b.bestTime?.availableTotal || 0) - (a.bestTime?.availableTotal || 0);
        if (overlapAvailable) return overlapAvailable;
        const score = b.score - a.score;
        if (score) return score;
        const available = b.availableTotal - a.availableTotal;
        if (available) return available;
        return dateValue(a.slot.startAt) - dateValue(b.slot.startAt);
    });
}

function summariesTotalVoters(summaries) {
    const voters = new Set();
    for (const summary of summaries) {
        for (const vote of summary.votes) voters.add(vote.userId);
    }
    return voters.size;
}

function tallyPreferences(voters, property) {
    const counts = new Map();
    for (const vote of voters) {
        const label = vote[property] || "Either";
        counts.set(label, (counts.get(label) || 0) + 1);
    }
    return [...counts.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function canVoteOnPlaytest(playtest) {
    if (!playtest) return false;
    if (playtest.frozen) return false;
    if (playtest.status !== "voting") return false;
    return true;
}

function playtestLockReason(playtest) {
    if (!playtest) return "";
    if (playtest.frozen) return "Votes are frozen for this playtest.";
    if (playtest.status === "closed") return "Voting is closed.";
    if (playtest.status === "finished") return "This playtest is finished.";
    if (playtest.status === "upcoming") return "Voting has not opened yet.";
    return "";
}

function activePlaytests() {
    const playtests = [
        ...DEFAULT_PLAYTESTS,
        ...(Array.isArray(state.playtests.localPlaytests) ? state.playtests.localPlaytests : [])
    ].map(applyPlaytestOverride).filter((playtest) => !playtest.archived);

    if (!playtests.some((playtest) => playtest.id === state.playtests.activeId)) {
        state.playtests.activeId = playtests[0]?.id || "";
    }
    return playtests;
}

function activePlaytest(playtests = activePlaytests()) {
    return playtests.find((playtest) => playtest.id === state.playtests.activeId) || playtests[0] || null;
}

function isPlaytestAdmin() {
    return Boolean(PLAYTEST_VIEWER.isAdmin);
}

function isDiscordLoggedIn() {
    return Boolean(state.authSession?.user && PLAYTEST_VIEWER.discordId);
}

function playtestAuthLabel() {
    if (!state.authClient) return "Discord login unavailable";
    if (!state.authReady) return "Checking Discord login...";
    if (!isDiscordLoggedIn()) return "Login required for Discord notifications";
    return PLAYTEST_VIEWER.isAdmin ? "Discord connected - Admin" : "Discord connected";
}

function nextEventSummary(playtest, summaries) {
    const now = Date.now();
    const confirmedFuture = summaries
        .filter((summary) => isSlotConfirmed(playtest.id, summary.slot.id) && confirmedSlotStartValue(playtest.id, summary.slot) >= now)
        .sort((a, b) => confirmedSlotStartValue(playtest.id, a.slot) - confirmedSlotStartValue(playtest.id, b.slot));
    return confirmedFuture[0] || null;
}

function upcomingConfirmedPlaytestEvent() {
    const events = [];
    for (const playtest of activePlaytests()) {
        const summaries = summarizePlaytestSlots(playtest);
        const next = nextEventSummary(playtest, summaries);
        if (next) {
            events.push({
                playtest,
                summary: next,
                startsAt: confirmedSlotStartValue(playtest.id, next.slot)
            });
        }
    }
    events.sort((a, b) => a.startsAt - b.startsAt);
    return events[0] || null;
}

function selectedCalendarDateInfo(playtest, summaries, fallbackSummary) {
    const key = selectedDateKey(playtest, summaries, fallbackSummary);
    return {
        dateKey: key,
        summary: summaries.find((summary) => dateKey(summary.slot.startAt) === key) || null
    };
}

function selectedDateKey(playtest, summaries, fallbackSummary = null) {
    const stored = state.playtests.selectedCalendarDates?.[playtest.id];
    if (stored) return stored;
    const fallback = fallbackSummary || bestPlaytestSlots(summaries)[0] || summaries[0];
    return fallback ? dateKey(fallback.slot.startAt) : dateKey(new Date().toISOString());
}

function isFeaturedSlot(slot) {
    return slot?.source !== "community";
}

function openConfirmDialog(playtestId, slotId) {
    if (!isPlaytestAdmin()) return;
    const playtest = activePlaytests().find((entry) => entry.id === playtestId);
    const summary = playtest ? summarizePlaytestSlots(playtest).find((entry) => entry.slot.id === slotId) : null;
    if (!playtest || !summary) return;
    const range = confirmationDefaultTimeRange(playtestId, summary);
    state.playtests.pendingConfirmation = {
        playtestId,
        slotId,
        startTime: range.startTime,
        endTime: range.endTime
    };
}

function closeConfirmDialog() {
    state.playtests.pendingConfirmation = null;
    render();
}

function submitConfirmDialog(form) {
    if (!isPlaytestAdmin()) return;
    const pending = state.playtests.pendingConfirmation;
    if (!pending) return;
    const range = normalizeTimeRange(
        form.querySelector("[data-confirm-start]")?.value,
        form.querySelector("[data-confirm-end]")?.value
    );
    confirmPlaytestSlot(pending.playtestId, pending.slotId, range);
    state.playtests.pendingConfirmation = null;
    savePlaytestState();
    render();
}

function confirmationDefaultTimeRange(playtestId, summary) {
    const existing = confirmationForSlot(playtestId, summary.slot.id);
    if (existing?.startAt && existing?.endAt) {
        return normalizeTimeRange(localTimeKey(existing.startAt), localTimeKey(existing.endAt));
    }
    if (summary.bestTime?.startAt && summary.bestTime?.endAt) {
        return normalizeTimeRange(localTimeKey(summary.bestTime.startAt), localTimeKey(summary.bestTime.endAt));
    }
    return defaultVoteTimeRangeForSlot(summary.slot);
}

function selectedCommunityTimeRange() {
    const container = document.querySelector(".selected-date-card .community-time-fields");
    return normalizeTimeRange(
        container?.querySelector("[data-community-start]")?.value,
        container?.querySelector("[data-community-end]")?.value
    );
}

function voteTimeRangeForButton(button, slot) {
    const container = button.closest(".selected-date-card, .playtest-slot-card");
    const fields = container?.querySelector("[data-vote-time-slot]");
    const fallback = defaultVoteTimeRangeForSlot(slot);
    return normalizeTimeRange(
        fields?.querySelector("[data-vote-start]")?.value || fallback.startTime,
        fields?.querySelector("[data-vote-end]")?.value || fallback.endTime
    );
}

function defaultVoteTimeRangeForSlot(slot) {
    const startTime = localTimeKey(slot?.startAt) || "20:00";
    const startMinutes = timeToMinutes(startTime);
    const endTime = slot?.endAt
        ? localTimeKey(slot.endAt)
        : minutesToTime(Math.min(1439, (startMinutes === null ? 1200 : startMinutes) + 120));
    return normalizeTimeRange(startTime, endTime);
}

function voteInputRangeForSlot(slot, vote) {
    if (vote?.startTime && vote?.endTime) return normalizeTimeRange(vote.startTime, vote.endTime);
    if (vote?.availableStartAt && vote?.availableEndAt) {
        return normalizeTimeRange(localTimeKey(vote.availableStartAt), localTimeKey(vote.availableEndAt));
    }
    return defaultVoteTimeRangeForSlot(slot);
}

function findPlaytestSlot(playtestId, slotId) {
    const playtest = activePlaytests().find((entry) => entry.id === playtestId);
    return playtest?.slots?.find((slot) => slot.id === slotId) || null;
}

function ensureCommunitySlot(playtestId, selectedKey, timeRange = normalizeTimeRange()) {
    if (!selectedKey || isPastDateKey(selectedKey)) return null;
    state.playtests.communitySlots[playtestId] = state.playtests.communitySlots[playtestId] || [];
    const existing = state.playtests.communitySlots[playtestId].find((slot) => dateKey(slot.startAt) === selectedKey);
    if (existing) return existing;
    const normalizedRange = normalizeTimeRange(timeRange.startTime, timeRange.endTime);
    const slot = {
        id: `community-${playtestId}-${selectedKey}`,
        label: "Community date",
        startAt: localDateTimeIso(selectedKey, normalizedRange.startTime),
        endAt: localDateTimeIso(selectedKey, normalizedRange.endTime),
        source: "community"
    };
    state.playtests.communitySlots[playtestId].push(slot);
    state.playtests.selectedCalendarDates[playtestId] = selectedKey;
    return slot;
}

function confirmedSlotId(playtestId) {
    const confirmations = state.playtests.confirmedSlots?.[playtestId] || {};
    return Object.keys(confirmations)[0] || "";
}

function confirmationForSlot(playtestId, slotId) {
    return slotId ? state.playtests.confirmedSlots?.[playtestId]?.[slotId] || null : null;
}

function isSlotConfirmed(playtestId, slotId) {
    return Boolean(slotId && state.playtests.confirmedSlots?.[playtestId]?.[slotId]);
}

function confirmedDisplaySlot(playtestId, slot) {
    const confirmation = confirmationForSlot(playtestId, slot?.id);
    if (!slot || !confirmation?.startAt || !confirmation?.endAt) return slot;
    return {
        ...slot,
        startAt: confirmation.startAt,
        endAt: confirmation.endAt
    };
}

function confirmedSlotStartValue(playtestId, slot) {
    const confirmation = confirmationForSlot(playtestId, slot?.id);
    return dateValue(confirmation?.startAt || slot?.startAt);
}

function confirmPlaytestSlot(playtestId, slotId, timeRange = null) {
    if (!isPlaytestAdmin()) return;
    if (!slotId) return;
    const slot = findPlaytestSlot(playtestId, slotId);
    if (!slot) return;
    const normalizedRange = timeRange
        ? normalizeTimeRange(timeRange.startTime, timeRange.endTime)
        : confirmationDefaultTimeRange(playtestId, { slot });
    const key = dateKey(slot.startAt);
    state.playtests.confirmedSlots[playtestId] = {
        [slotId]: {
            confirmedAt: new Date().toISOString(),
            confirmedBy: PLAYTEST_VIEWER.userId,
            startAt: localDateTimeIso(key, normalizedRange.startTime),
            endAt: localDateTimeIso(key, normalizedRange.endTime)
        }
    };
    recordAdminSystemEvent(playtestId, slotId, "confirmed");
}

function unconfirmPlaytestSlot(playtestId, slotId) {
    if (!isPlaytestAdmin()) return;
    if (!slotId || !state.playtests.confirmedSlots?.[playtestId]?.[slotId]) return;
    delete state.playtests.confirmedSlots[playtestId][slotId];
    recordAdminSystemEvent(playtestId, slotId, "unconfirmed");
}

function isNotificationSubscribed(playtestId, key) {
    if (!isDiscordLoggedIn()) return false;
    const subscription = key ? state.playtests.notificationSubscriptions?.[playtestId]?.[key] : null;
    return Boolean(subscription && subscription.userId === PLAYTEST_VIEWER.userId);
}

function toggleNotificationSubscription(playtestId, key) {
    if (!key || !isDiscordLoggedIn()) return;
    state.playtests.notificationSubscriptions[playtestId] = state.playtests.notificationSubscriptions[playtestId] || {};
    const existing = state.playtests.notificationSubscriptions[playtestId][key];
    if (existing?.userId === PLAYTEST_VIEWER.userId) {
        delete state.playtests.notificationSubscriptions[playtestId][key];
    } else {
        state.playtests.notificationSubscriptions[playtestId][key] = {
            userId: PLAYTEST_VIEWER.userId,
            username: PLAYTEST_VIEWER.username,
            discordId: PLAYTEST_VIEWER.discordId,
            createdAt: new Date().toISOString()
        };
    }
}

function notificationSubscriberCount(playtestId, slotId) {
    return state.playtests.notificationSubscriptions?.[playtestId]?.[slotId] ? 1 : 0;
}

function slotDeletePendingState(playtestId, slotId) {
    const pending = state.playtests.pendingSlotDelete;
    if (!pending || pending.playtestId !== playtestId || pending.slotId !== slotId) {
        return { pending: false, ready: false, remainingSeconds: 0 };
    }
    const elapsed = Date.now() - pending.requestedAt;
    const remainingMs = Math.max(0, 3000 - elapsed);
    return {
        pending: true,
        ready: remainingMs <= 0,
        remainingSeconds: Math.max(1, Math.ceil(remainingMs / 1000))
    };
}

function startSlotDeleteConfirm(playtestId, slotId) {
    if (!isPlaytestAdmin()) return;
    const playtest = activePlaytests().find((entry) => entry.id === playtestId);
    if (!canDeletePlaytestSlot(playtest, slotId)) return;
    const requestedAt = Date.now();
    state.playtests.pendingSlotDelete = { playtestId, slotId, requestedAt };
    window.setTimeout(() => {
        const pending = state.playtests.pendingSlotDelete;
        if (pending?.playtestId === playtestId && pending?.slotId === slotId && pending.requestedAt === requestedAt) {
            render();
        }
    }, 3050);
}

function cancelSlotDeleteConfirm(slotId) {
    if (!state.playtests.pendingSlotDelete) return;
    if (!slotId || state.playtests.pendingSlotDelete.slotId === slotId) {
        state.playtests.pendingSlotDelete = null;
    }
}

function canDeletePlaytestSlot(playtest, slotId) {
    const slots = playtest?.slots || [];
    return Boolean(slotId && slots.some((slot) => slot.id === slotId));
}

function deletePlaytestSlot(playtestId, slotId) {
    if (!isPlaytestAdmin()) return;
    const playtest = activePlaytests().find((entry) => entry.id === playtestId);
    if (!canDeletePlaytestSlot(playtest, slotId)) return;
    const slot = playtest.slots.find((entry) => entry.id === slotId);
    if (!slot) return;

    recordAdminSystemEvent(playtestId, slotId, "deleted");

    if (slot.source === "community") {
        state.playtests.communitySlots[playtestId] = (state.playtests.communitySlots?.[playtestId] || []).filter((entry) => entry.id !== slotId);
    } else {
        state.playtests.deletedSlots[playtestId] = state.playtests.deletedSlots[playtestId] || {};
        state.playtests.deletedSlots[playtestId][slotId] = {
            deletedAt: new Date().toISOString(),
            deletedBy: PLAYTEST_VIEWER.userId
        };
    }

    cleanupPlaytestSlotState(playtestId, slot);
    state.playtests.pendingSlotDelete = null;
}

function cleanupPlaytestSlotState(playtestId, slot) {
    const slotId = slot?.id;
    if (!slotId) return;
    if (state.playtests.votes?.[playtestId]) {
        delete state.playtests.votes[playtestId][slotId];
    }
    if (state.playtests.confirmedSlots?.[playtestId]) {
        delete state.playtests.confirmedSlots[playtestId][slotId];
    }
    if (state.playtests.notificationSubscriptions?.[playtestId]) {
        delete state.playtests.notificationSubscriptions[playtestId][slotId];
        delete state.playtests.notificationSubscriptions[playtestId][`date:${dateKey(slot.startAt)}`];
    }
    if (state.playtests.selectedCalendarDates?.[playtestId] === dateKey(slot.startAt)) {
        delete state.playtests.selectedCalendarDates[playtestId];
    }
    if (state.playtests.pendingConfirmation?.playtestId === playtestId && state.playtests.pendingConfirmation?.slotId === slotId) {
        state.playtests.pendingConfirmation = null;
    }
    if (state.playtests.pendingSlotDelete?.playtestId === playtestId && state.playtests.pendingSlotDelete?.slotId === slotId) {
        state.playtests.pendingSlotDelete = null;
    }
    state.playtests.expandedSlotIds?.delete(slotId);
}

function recordAdminVoteEvent(playtestId, slotId, status) {
    const playtest = activePlaytests().find((entry) => entry.id === playtestId);
    if (!playtest) return;
    const summary = summarizePlaytestSlots(playtest).find((entry) => entry.slot.id === slotId);
    if (!summary) return;
    state.playtests.adminVoteEvents.unshift({
        id: `vote-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        type: "vote",
        playtestId,
        slotId,
        slotStartAt: summary.slot.startAt,
        username: PLAYTEST_VIEWER.username,
        status,
        availableTotal: summary.availableTotal,
        preferredTotal: summary.counts.preferred,
        totalVotes: summary.total,
        createdAt: new Date().toISOString()
    });
    state.playtests.adminVoteEvents = state.playtests.adminVoteEvents.slice(0, 40);
}

function recordAdminSystemEvent(playtestId, slotId, action) {
    const playtest = activePlaytests().find((entry) => entry.id === playtestId);
    const slot = playtest?.slots?.find((entry) => entry.id === slotId);
    if (!slot) return;
    state.playtests.adminVoteEvents.unshift({
        id: `${action}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        type: action,
        playtestId,
        slotId,
        slotStartAt: slot.startAt,
        username: "Admin",
        status: action,
        availableTotal: 0,
        preferredTotal: 0,
        totalVotes: 0,
        createdAt: new Date().toISOString()
    });
    state.playtests.adminVoteEvents = state.playtests.adminVoteEvents.slice(0, 40);
}

function baseCalendarMonthDate(playtest) {
    const firstSlot = [...(playtest?.slots || [])].sort((a, b) => dateValue(a.startAt) - dateValue(b.startAt))[0];
    const base = new Date(firstSlot?.startAt || Date.now());
    return new Date(base.getFullYear(), base.getMonth(), 1, 12, 0, 0);
}

function calendarMonthDate(playtest) {
    const base = baseCalendarMonthDate(playtest);
    return new Date(base.getFullYear(), base.getMonth() + (state.playtests.calendarMonthOffset || 0), 1, 12, 0, 0);
}

function isPastSlot(slot) {
    return dateValue(slot?.startAt) < Date.now();
}

function isPastDateKey(key) {
    return localDateFromKey(key, "23:59").getTime() < Date.now();
}

function dateKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    const validDate = Number.isNaN(date.getTime()) ? new Date() : date;
    return localDateKey(validDate);
}

function localDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function nextLocalDateKey(key) {
    const date = localDateFromKey(key, "12:00");
    date.setDate(date.getDate() + 1);
    return localDateKey(date);
}

function localDateFromKey(key, time = "20:00") {
    const dateMatch = String(key || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const timeParts = parseTimeParts(time) || parseTimeParts("20:00");
    if (!dateMatch) {
        const fallback = new Date();
        fallback.setHours(timeParts.hours, timeParts.minutes, 0, 0);
        return fallback;
    }
    return new Date(
        Number(dateMatch[1]),
        Number(dateMatch[2]) - 1,
        Number(dateMatch[3]),
        timeParts.hours,
        timeParts.minutes,
        0,
        0
    );
}

function localDateTimeIso(key, time) {
    return localDateFromKey(key, time).toISOString();
}

function localTimeKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function parseTimeParts(value) {
    const match = String(value || "").trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (!match) return null;
    return {
        hours: Number(match[1]),
        minutes: Number(match[2])
    };
}

function timeToMinutes(value) {
    const parts = parseTimeParts(value);
    return parts ? parts.hours * 60 + parts.minutes : null;
}

function minutesToTime(minutes) {
    const safeMinutes = Math.max(0, Math.min(1439, minutes));
    const hours = String(Math.floor(safeMinutes / 60)).padStart(2, "0");
    const mins = String(safeMinutes % 60).padStart(2, "0");
    return `${hours}:${mins}`;
}

function normalizeTimeRange(startTime = "20:00", endTime = "22:00") {
    let startMinutes = timeToMinutes(startTime);
    if (startMinutes === null) startMinutes = timeToMinutes("20:00");
    let endMinutes = timeToMinutes(endTime);
    if (endMinutes === null || endMinutes <= startMinutes) {
        endMinutes = Math.min(1439, startMinutes + 120);
    }
    if (endMinutes <= startMinutes) {
        startMinutes = Math.max(0, endMinutes - 60);
    }
    return {
        startTime: minutesToTime(startMinutes),
        endTime: minutesToTime(endMinutes)
    };
}

function applyPlaytestOverride(playtest) {
    const override = state.playtests.overrides?.[playtest.id] || {};
    const deletedSlots = state.playtests.deletedSlots?.[playtest.id] || {};
    const playtestSlots = (playtest.slots || []).filter((slot) => !deletedSlots[slot.id]);
    const communitySlots = (state.playtests.communitySlots?.[playtest.id] || []).filter((slot) => !deletedSlots[slot.id]);
    return { ...playtest, ...override, slots: [...playtestSlots, ...communitySlots] };
}

function playtestOverride(playtestId) {
    state.playtests.overrides[playtestId] = state.playtests.overrides[playtestId] || {};
    return state.playtests.overrides[playtestId];
}

function adminCalendarFilters() {
    state.playtests.adminCalendarFilters = sanitizeAdminCalendarFilters(state.playtests.adminCalendarFilters);
    return state.playtests.adminCalendarFilters;
}

function toggleAdminCalendarFilter(filterId) {
    if (!["community", "events"].includes(filterId)) return;
    const filters = adminCalendarFilters();
    filters[filterId] = !filters[filterId];
}

function playtestPreference(playtestId) {
    const preference = state.playtests.preferences?.[playtestId] || {};
    return {
        modePreference: PLAYTEST_MODE_OPTIONS.includes(preference.modePreference) ? preference.modePreference : "Either"
    };
}

function syncPreferenceToExistingVotes(playtestId, preference) {
    const votes = state.playtests.votes?.[playtestId] || {};
    Object.values(votes).forEach((vote) => {
        vote.modePreference = preference.modePreference;
        vote.updatedAt = new Date().toISOString();
    });
}

function duplicatePlaytest(playtest) {
    if (!isPlaytestAdmin()) return;
    const id = `local-playtest-${Date.now()}`;
    const slotIdMap = new Map((playtest.slots || []).map((slot, index) => [slot.id, `${id}-slot-${index + 1}`]));
    const clone = {
        id,
        title: `${playtest.title} Copy`,
        description: playtest.description,
        status: "voting",
        createdBy: PLAYTEST_VIEWER.userId,
        createdAt: new Date().toISOString(),
        mainSlotId: slotIdMap.get(playtest.mainSlotId) || `${id}-slot-1`,
        slots: (playtest.slots || []).map((slot, index) => ({
            id: slotIdMap.get(slot.id) || `${id}-slot-${index + 1}`,
            label: slot.label,
            startAt: slot.startAt,
            endAt: slot.endAt || "",
            source: "featured"
        }))
    };
    state.playtests.localPlaytests.push(clone);
    state.playtests.activeId = id;
}

function deletePlaytest(playtestId) {
    if (!isPlaytestAdmin()) return;
    const before = state.playtests.localPlaytests.length;
    state.playtests.localPlaytests = state.playtests.localPlaytests.filter((playtest) => playtest.id !== playtestId);
    if (state.playtests.localPlaytests.length === before) return;
    delete state.playtests.votes[playtestId];
    delete state.playtests.preferences[playtestId];
    delete state.playtests.confirmedSlots[playtestId];
    delete state.playtests.notificationSubscriptions[playtestId];
    delete state.playtests.deletedSlots[playtestId];
    state.playtests.adminVoteEvents = state.playtests.adminVoteEvents.filter((event) => event.playtestId !== playtestId);
    const next = activePlaytests()[0];
    state.playtests.activeId = next?.id || "";
}

function loadPlaytestState() {
    const fallback = emptyPlaytestState();
    try {
        const raw = window.localStorage?.getItem(PLAYTEST_STORAGE_KEY);
        if (!raw) {
            state.playtests = fallback;
            return;
        }
        const parsed = JSON.parse(raw);
        state.playtests = {
            ...fallback,
            activeId: typeof parsed.activeId === "string" ? parsed.activeId : fallback.activeId,
            votes: parsed.votes && typeof parsed.votes === "object" ? parsed.votes : {},
            preferences: parsed.preferences && typeof parsed.preferences === "object" ? parsed.preferences : {},
            localPlaytests: Array.isArray(parsed.localPlaytests) ? parsed.localPlaytests.map(sanitizeLocalPlaytest).filter(Boolean) : [],
            communitySlots: parsed.communitySlots && typeof parsed.communitySlots === "object" ? sanitizeCommunitySlots(parsed.communitySlots) : {},
            selectedCalendarDates: parsed.selectedCalendarDates && typeof parsed.selectedCalendarDates === "object" ? parsed.selectedCalendarDates : {},
            calendarMonthOffset: parsed.calendarMonthOffset === 1 ? 1 : 0,
            heatmapExpanded: Boolean(parsed.heatmapExpanded),
            adminCalendarFilters: sanitizeAdminCalendarFilters(parsed.adminCalendarFilters),
            confirmedSlots: parsed.confirmedSlots && typeof parsed.confirmedSlots === "object" ? parsed.confirmedSlots : {},
            notificationSubscriptions: parsed.notificationSubscriptions && typeof parsed.notificationSubscriptions === "object" ? parsed.notificationSubscriptions : {},
            adminVoteEvents: Array.isArray(parsed.adminVoteEvents) ? parsed.adminVoteEvents.slice(0, 40) : [],
            overrides: parsed.overrides && typeof parsed.overrides === "object" ? sanitizePlaytestOverrides(parsed.overrides) : {},
            deletedSlots: parsed.deletedSlots && typeof parsed.deletedSlots === "object" ? sanitizeDeletedSlots(parsed.deletedSlots) : {},
            pendingSlotDelete: null,
            activeHelpTip: "",
            expandedSlotIds: new Set()
        };
        if (closeEmptyCommunitySlots()) savePlaytestState();
    } catch (error) {
        console.error("Failed to load playtest state", error);
        state.playtests = fallback;
    }
}

function savePlaytestState() {
    try {
        const payload = {
            activeId: state.playtests.activeId,
            votes: state.playtests.votes,
            preferences: state.playtests.preferences,
            localPlaytests: state.playtests.localPlaytests,
            communitySlots: state.playtests.communitySlots,
            selectedCalendarDates: state.playtests.selectedCalendarDates,
            calendarMonthOffset: state.playtests.calendarMonthOffset,
            heatmapExpanded: state.playtests.heatmapExpanded,
            adminCalendarFilters: adminCalendarFilters(),
            confirmedSlots: state.playtests.confirmedSlots,
            notificationSubscriptions: state.playtests.notificationSubscriptions,
            adminVoteEvents: state.playtests.adminVoteEvents,
            overrides: state.playtests.overrides,
            deletedSlots: state.playtests.deletedSlots
        };
        window.localStorage?.setItem(PLAYTEST_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
        console.error("Failed to save playtest state", error);
    }
}

function emptyPlaytestState() {
    return {
        activeId: DEFAULT_PLAYTESTS[0]?.id || "",
        votes: {},
        preferences: {},
        localPlaytests: [],
        communitySlots: {},
        selectedCalendarDates: {},
        calendarMonthOffset: 0,
        heatmapExpanded: false,
        adminCalendarFilters: {
            community: true,
            events: true
        },
        confirmedSlots: {},
        notificationSubscriptions: {},
        adminVoteEvents: [],
        overrides: {},
        deletedSlots: {},
        pendingConfirmation: null,
        pendingSlotDelete: null,
        activeHelpTip: "",
        expandedSlotIds: new Set()
    };
}

function sanitizeLocalPlaytest(playtest) {
    if (!playtest || typeof playtest !== "object" || typeof playtest.id !== "string") return null;
    const slots = Array.isArray(playtest.slots)
        ? playtest.slots.filter((slot) => slot?.id && slot?.startAt).map((slot) => ({
            id: String(slot.id),
            label: String(slot.label || "Alternative"),
            startAt: String(slot.startAt),
            endAt: slot.endAt ? String(slot.endAt) : ""
        }))
        : [];
    if (slots.length === 0) return null;
    return {
        id: playtest.id,
        title: String(playtest.title || "Community Playtest"),
        description: String(playtest.description || ""),
        status: ["upcoming", "voting", "closed", "finished"].includes(playtest.status) ? playtest.status : "voting",
        createdBy: String(playtest.createdBy || PLAYTEST_VIEWER.userId),
        createdAt: String(playtest.createdAt || new Date().toISOString()),
        mainSlotId: slots.some((slot) => slot.id === playtest.mainSlotId) ? playtest.mainSlotId : slots[0].id,
        slots
    };
}

function sanitizeCommunitySlots(value) {
    return Object.fromEntries(Object.entries(value).map(([playtestId, slots]) => [
        playtestId,
        Array.isArray(slots)
            ? slots.filter((slot) => slot?.id && slot?.startAt).map((slot) => ({
                id: String(slot.id),
                label: "Community date",
                startAt: String(slot.startAt),
                endAt: slot.endAt ? String(slot.endAt) : "",
                source: "community"
            }))
            : []
    ]));
}

function sanitizeAdminCalendarFilters(value) {
    const filters = value && typeof value === "object" ? value : {};
    return {
        community: filters.community !== false,
        events: filters.events !== false
    };
}

function sanitizePlaytestOverrides(value) {
    const defaultIds = new Set(DEFAULT_PLAYTESTS.map((playtest) => playtest.id));
    return Object.fromEntries(Object.entries(value).map(([playtestId, override]) => {
        const safeOverride = override && typeof override === "object" ? { ...override } : {};
        if (defaultIds.has(playtestId)) delete safeOverride.archived;
        return [playtestId, safeOverride];
    }));
}

function sanitizeDeletedSlots(value) {
    return Object.fromEntries(Object.entries(value).map(([playtestId, slots]) => [
        playtestId,
        slots && typeof slots === "object"
            ? Object.fromEntries(Object.entries(slots).map(([slotId, entry]) => [
                slotId,
                {
                    deletedAt: String(entry?.deletedAt || new Date().toISOString()),
                    deletedBy: String(entry?.deletedBy || PLAYTEST_VIEWER.userId)
                }
            ]))
            : {}
    ]));
}

function parsePlaytestDateInput(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString();
}

function seedUpdatedAt(index) {
    const minutes = 4 + (number(index) * 7) % 84;
    return new Date(Date.now() - minutes * 60000).toISOString();
}

function statusSortValue(status) {
    const index = PLAYTEST_COUNT_ORDER.indexOf(status);
    return index === -1 ? 99 : index;
}

function statusLabel(status) {
    return PLAYTEST_STATUS_OPTIONS.find((option) => option.id === status)?.label || status;
}

function playtestStatusLabel(playtest) {
    if (playtest?.frozen) return "Frozen";
    const status = String(playtest?.status || "upcoming");
    return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatSlotWeekday(value) {
    return formatLocalDate(value, { weekday: "long" });
}

function formatSlotDay(value) {
    return formatLocalDate(value, { day: "numeric", month: "long" });
}

function formatSlotTime(value) {
    return formatLocalDate(value, { hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short" });
}

function formatSlotShort(value) {
    return formatLocalDate(value, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short" });
}

function formatSlotTimeRange(slot) {
    if (!slot?.endAt) return formatSlotTime(slot?.startAt);
    if (dateKey(slot.startAt) !== dateKey(slot.endAt)) {
        return `${formatSlotTime(slot.startAt)} - ${formatSlotShort(slot.endAt)}`;
    }
    return `${formatSlotTime(slot.startAt)} - ${formatSlotTime(slot.endAt)}`;
}

function formatSlotShortRange(slot) {
    if (!slot?.endAt) return formatSlotShort(slot?.startAt);
    if (dateKey(slot.startAt) !== dateKey(slot.endAt)) {
        return `${formatSlotShort(slot.startAt)} - ${formatSlotShort(slot.endAt)}`;
    }
    return `${formatSlotShort(slot.startAt)} - ${formatSlotTime(slot.endAt)}`;
}

function formatOverlapRange(overlap) {
    if (!overlap) return "No shared time";
    if (dateKey(overlap.startAt) !== dateKey(overlap.endAt)) {
        return `${formatSlotShort(overlap.startAt)} - ${formatSlotShort(overlap.endAt)}`;
    }
    return `${formatSlotTime(overlap.startAt)} - ${formatSlotTime(overlap.endAt)}`;
}

function formatVoteTimeRange(slot, vote) {
    const interval = voteAvailabilityInterval(slot, vote);
    if (!interval) return "No time";
    return formatOverlapRange({
        startAt: new Date(interval.start).toISOString(),
        endAt: new Date(interval.end).toISOString()
    });
}

function overlapPeopleText(overlap) {
    if (!overlap) return "No voters overlap yet";
    const available = `${overlap.availableTotal} ${overlap.availableTotal === 1 ? "person" : "people"} can meet`;
    const maybe = overlap.maybeTotal ? `, ${overlap.maybeTotal} maybe` : "";
    return `${available}${maybe}`;
}

function formatDateKeyWeekday(value) {
    return formatLocalDate(localDateFromKey(value), { weekday: "long" });
}

function formatDateKeyDay(value) {
    return formatLocalDate(localDateFromKey(value), { day: "numeric", month: "long" });
}

function formatMonthLabel(value) {
    return formatLocalDate(value, { month: "long", year: "numeric" });
}

function formatLocalDate(value, options) {
    if (!value) return "TBD";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString(undefined, options).replace("24:", "00:");
}

function formatRelativeTime(value) {
    const time = dateValue(value);
    if (!time) return "recently";
    const diffSeconds = Math.max(0, Math.round((Date.now() - time) / 1000));
    if (diffSeconds < 60) return "just now";
    const minutes = Math.round(diffSeconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
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
    const detail = document.getElementById("server-status-detail");
    if (!status || isExportStale()) {
        online.textContent = "Offline";
        serverStatus.textContent = "Server offline";
        if (detail) detail.textContent = state.data?.generatedAt ? `Last export ${formatCompactDate(state.data.generatedAt)}` : "No live export yet";
        return;
    }

    online.textContent = String(number(status.onlinePlayers));
    serverStatus.textContent = liveStatusHeadline(status);
    if (detail) detail.textContent = liveStatusText(status);
}

function liveStatusHeadline(status) {
    if (!status || status.state === "idle") return "Idle";
    if (status.mode === "deathmatch") return status.state === "ending" ? "DM ending" : "DM live";
    if (status.mode === "battleRoyale") {
        if (status.state === "preparing") return "BR preparing";
        return status.state === "ending" ? "BR ending" : "BR live";
    }
    return status.label || "Idle";
}

function liveStatusText(status) {
    if (!status || status.state === "idle") return "Waiting for the next match";
    if (status.mode === "deathmatch") {
        const map = status.mapName || status.mapId || "Unknown map";
        const red = Number.isFinite(Number(status.redScore)) ? Number(status.redScore) : 0;
        const blue = Number.isFinite(Number(status.blueScore)) ? Number(status.blueScore) : 0;
        const players = number(status.matchPlayers);
        return `${map} - Red ${red} / Blue ${blue}${players ? ` - ${players} players` : ""}`;
    }
    if (status.mode === "battleRoyale") {
        const teamMode = status.teamMode || "Solo";
        const stateLabel = status.state === "preparing" ? "Preparing" : "Running";
        const alive = number(status.alivePlayers);
        const players = number(status.matchPlayers);
        const countText = alive > 0 ? `${alive}/${players || alive} alive` : `${players} players`;
        return `${stateLabel} - ${teamMode} - ${countText}`;
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
        button.setAttribute("aria-label", `${label} stat view${state.mainView === viewId ? ", selected" : ""}`);
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
        button.setAttribute("aria-label", `${MODE_LABELS[modeId]} mode${state.mode === modeId ? ", selected" : ""}`);
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
        const direction = active ? state.sortDirection : "desc";
        const currentDirection = state.sortDirection === "desc" ? "descending" : "ascending";
        const nextDirection = direction === "desc" ? "ascending" : "descending";
        const label = SORT_LABELS[button.dataset.sort] || button.textContent.trim();
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
        button.setAttribute("aria-label", active
            ? `${label}, sorted ${currentDirection}. Activate to sort ${nextDirection}.`
            : `${label}, not sorted. Activate to sort descending.`);
        const header = button.closest("th");
        if (header) header.setAttribute("aria-sort", active ? currentDirection : "none");
    });

    document.querySelectorAll("[data-sort-indicator]").forEach((indicator) => {
        indicator.textContent = indicator.dataset.sortIndicator === state.sort
            ? (state.sortDirection === "desc" ? "v" : "^")
            : "";
        indicator.setAttribute("aria-hidden", "true");
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
        wrap.classList.remove("table-scrollable");
        renderPagination(0, 0);
        return;
    }

    empty.classList.add("hidden");
    wrap.classList.remove("hidden");
    wrap.setAttribute("aria-label", `${document.getElementById("leaderboard-title").textContent} table with sortable columns`);
    window.requestAnimationFrame(() => {
        wrap.classList.toggle("table-scrollable", wrap.scrollWidth > wrap.clientWidth + 4);
    });

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
                    <a class="profile-link" href="#player=${encodeURIComponent(player.playerId)}&tab=overview" aria-label="${escapeHtml(`Open ${player.name} profile`)}">Profile</a>
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
    const sortColumn = (sort, label = SORT_LABELS[sort]) => `<th>${renderSortButton(sort, label)}</th>`;
    if (state.mainView === "weapons") {
        return `
            <tr>
                <th>#</th>
                <th>Weapon</th>
                ${sortColumn("kills")}
                ${sortColumn("hits")}
                ${sortColumn("headshotRate")}
                ${sortColumn("headshotKills")}
                ${sortColumn("utilityKills", "Utility")}
                ${sortColumn("vehicleKills", "Vehicle")}
            </tr>
        `;
    }

    if (state.mainView === "maps") {
        return `
            <tr>
                <th>#</th>
                <th>Map</th>
                ${sortColumn("games")}
                ${sortColumn("kills")}
                ${sortColumn("avgKills", "Avg K")}
                ${sortColumn("deaths")}
                ${sortColumn("kdRatio")}
                ${sortColumn("headshotRate")}
                ${sortColumn("playtimeSeconds")}
            </tr>
        `;
    }

    return `
        <tr>
            <th>#</th>
            <th>Player</th>
            ${sortColumn("wins")}
            ${sortColumn("kills")}
            ${sortColumn("games")}
            ${sortColumn("deaths")}
            ${sortColumn("winRate")}
            ${sortColumn("avgKills", "Avg K")}
            ${sortColumn("playtimeSeconds")}
            ${sortColumn("headshotRate")}
            ${sortColumn("kdRatio")}
        </tr>
    `;
}

function renderSortButton(sort, visibleLabel = SORT_LABELS[sort]) {
    const safeSort = escapeHtml(sort);
    const label = visibleLabel || SORT_LABELS[sort] || sort;
    return `<button class="sort-header" type="button" data-sort="${safeSort}">${escapeHtml(label)} <span aria-hidden="true" data-sort-indicator="${safeSort}"></span></button>`;
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
    }, "Previous leaderboard page"));

    for (const page of pageWindow(totalPages, state.page, 5)) {
        const button = createPageButton(String(page), true, () => {
            state.page = page;
            render();
        }, `Go to leaderboard page ${page}`);
        if (page === state.page) {
            button.classList.add("active");
            button.setAttribute("aria-current", "page");
            button.setAttribute("aria-label", `Leaderboard page ${page}, current page`);
        }
        right.appendChild(button);
    }

    right.appendChild(createPageButton("Next", state.page < totalPages, () => {
        state.page += 1;
        render();
    }, "Next leaderboard page"));

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
            ${Object.entries(PLAYER_TABS).map(([id, label]) => {
                const active = state.playerTab === id;
                return `
                    <button class="tab-pill ${active ? "active" : ""}" type="button" data-player-tab="${escapeHtml(id)}" aria-pressed="${active ? "true" : "false"}" aria-label="${escapeHtml(`${label} player section${active ? ", selected" : ""}`)}">${escapeHtml(label)}</button>
                `;
            }).join("")}
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
                ${Object.entries(MODE_LABELS).map(([id, label]) => {
                    const active = state.historyFilter === id;
                    return `
                        <button class="tab-pill ${active ? "active" : ""}" type="button" data-history-filter="${escapeHtml(id)}" aria-pressed="${active ? "true" : "false"}" aria-label="${escapeHtml(`${label} match history${active ? ", selected" : ""}`)}">${escapeHtml(label)}</button>
                    `;
                }).join("")}
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
    button.setAttribute("aria-pressed", active ? "true" : "false");
    button.addEventListener("click", onClick);
    return button;
}

function createPageButton(label, enabled, onClick, ariaLabel = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "page-button";
    button.textContent = label;
    button.disabled = !enabled;
    if (ariaLabel) button.setAttribute("aria-label", ariaLabel);
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

function openContactEmail() {
    const email = String.fromCharCode(...CONTACT_EMAIL_CODES);
    const subject = encodeURIComponent("Call of Block");
    window.location.href = `mailto:${email}?subject=${subject}`;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#39;");
}
