import { createFeedbackApi } from "./src/api/feedback.js";
import { createProgressionAdminApi } from "./src/api/progression.js";
import { isAdminProfile } from "./src/auth/permissions.js";
import {
    COSMETIC_ACQUISITION_TYPES,
    PROGRESSION_METRICS,
    PROGRESSION_MODES,
    WEEKLY_MISSION_DIFFICULTIES,
    WEEKLY_MISSION_METRICS,
    WEEKLY_MISSION_MODES,
    WEEKLY_MISSION_WEAPON_CATEGORIES,
    WEEKLY_MISSION_WEAPON_SCOPES,
    cosmeticCanAppearInShop,
    progressionOptionLabel
} from "./src/config/progression.js";
import {
    TICKET_SUBMIT_COOLDOWN_MS,
    USER_CLOSABLE_TICKET_STATUSES,
    USER_REOPENABLE_TICKET_STATUSES,
    ticketCategoryLabel,
    ticketContextLabel,
    ticketSeverityLabel,
    ticketSeverityRank,
    ticketStatusLabel
} from "./src/config/feedback.js";
import { validateReplyInput, validateTicketInput } from "./src/utils/feedback-validation.js";
import {
    createFeedbackAttachmentView,
    createFeedbackTicketId,
    feedbackAttachmentErrorMessage,
    removeFeedbackAttachment,
    uploadFeedbackAttachment,
    validateFeedbackAttachment
} from "./src/services/feedback-attachments.js";
import { createFeedbackDraftSession } from "./src/services/feedback-draft-session.js";
import {
    loadAdminTicketPreferences,
    saveAdminTicketPreferences
} from "./src/services/admin-ticket-preferences.js";
import {
    renderAdminDocumentationContent,
    renderAdminTicketsContent,
    renderFeedbackContent,
    renderTicketDetailContent
} from "./src/views/feedback.js";
import { renderProgressionAdminContent } from "./src/views/progression.js";

const MODE_LABELS = {
    overall: "Overall",
    battleRoyale: "Battle Royale",
    deathmatch: "Deathmatch"
};

const PUBLIC_MODE_LABELS = {
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

const PROFILE_WEAPON_SORTS = {
    kills: "Kills",
    hits: "Hits",
    headshotRate: "HS%",
    headshotKills: "HS Kills",
    utilityKills: "Utility",
    vehicleKills: "Vehicle"
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
const BADGE_SEEN_STORAGE_KEY = "cob_seen_badges_v1";
const WEEKLY_MISSION_STORAGE_KEY = "cob_weekly_missions_v1";
const ACCOUNT_MAX_LEVEL = 1000;
const ACCOUNT_XP_PER_LEVEL = 10000;
const WEEKLY_MISSION_COUNT = 7;
const WEEKLY_EASY_MISSION_COUNT = 4;
const MISSION_MODES = [
    { id: "battleRoyale", label: "Battle Royale", short: "BR" },
    { id: "deathmatch", label: "Deathmatch", short: "DM" }
];
const PROFILE_BASE_COLUMNS = "id, discord_id, username, avatar_url, is_admin, banned_from_voting, created_at";
const PROFILE_ACCOUNT_COLUMNS_LEGACY = [
    "display_name",
    "minecraft_player_uuid",
    "minecraft_player_name",
    "minecraft_player_id",
    "avatar_source",
    "custom_avatar_url",
    "custom_background_url",
    "profile_background",
    "pfp_border",
    "selected_badges",
    "unlocked_badges",
    "unlocked_backgrounds",
    "unlocked_pfp_borders",
    "xp"
];
const PROFILE_ACCOUNT_COLUMNS = [
    ...PROFILE_ACCOUNT_COLUMNS_LEGACY,
    "profile_title",
    "unlocked_icons",
    "unlocked_titles"
];
const PROFILE_SELECT_COLUMNS = `${PROFILE_BASE_COLUMNS}, ${PROFILE_ACCOUNT_COLUMNS.join(", ")}`;
const PROFILE_SELECT_COLUMNS_LEGACY = `${PROFILE_BASE_COLUMNS}, ${PROFILE_ACCOUNT_COLUMNS_LEGACY.join(", ")}`;
const PUBLIC_PROFILE_TABLE = "public_profiles";
const PUBLIC_PROFILE_COLUMNS_LEGACY = [
    "id",
    "username",
    "avatar_url",
    "created_at",
    "display_name",
    "minecraft_player_name",
    "minecraft_player_id",
    "avatar_source",
    "custom_avatar_url",
    "custom_background_url",
    "profile_background",
    "pfp_border",
    "selected_badges",
    "unlocked_badges",
    "unlocked_backgrounds",
    "unlocked_pfp_borders",
    "xp"
];
const PUBLIC_PROFILE_SELECT_COLUMNS = [
    ...PUBLIC_PROFILE_COLUMNS_LEGACY,
    "profile_title",
    "unlocked_icons",
    "unlocked_titles"
].join(", ");
const PUBLIC_PROFILE_SELECT_COLUMNS_LEGACY = PUBLIC_PROFILE_COLUMNS_LEGACY.join(", ");
const PLAYTEST_SELECT_COLUMNS = "id, title, description, main_slot_id, status, created_by, votes_frozen, archived_at, created_at, updated_at";
const PLAYTEST_SLOT_SELECT_COLUMNS = "id, playtest_id, start_datetime, end_datetime, label, is_main, source, confirmed_at, confirmed_by, created_at";
const AVAILABILITY_SELECT_COLUMNS = "id, playtest_id, slot_id, user_id, status, mode_preference, available_start_datetime, available_end_datetime, created_at, updated_at";
const NOTIFICATION_SELECT_COLUMNS = "id, playtest_id, slot_id, user_id, notify_on_confirmation, created_at, updated_at";
const RARITY_ORDER = ["common", "rare", "epic", "legendary", "mythic"];
const RARITY_LABELS = {
    common: "Common",
    rare: "Rare",
    epic: "Epic",
    legendary: "Legendary",
    mythic: "Mythic"
};

function storeCatalogEntries(type) {
    const entries = window.COB_STORE_COSMETICS?.[type];
    if (!Array.isArray(entries)) return [];
    return entries
        .filter((entry) => entry && typeof entry === "object" && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(String(entry.id || "")))
        .map((entry) => ({
            ...entry,
            id: String(entry.id),
            label: String(entry.label || entry.id).slice(0, 80),
            category: "Store",
            rarity: RARITY_ORDER.includes(entry.rarity) ? entry.rarity : "common",
            unlock: "store"
        }));
}

const COSMETIC_CATEGORY_ORDER = ["Default", "Store", "Game Modes", "Milestones", "Personal", "Legacy"];
const PROFILE_ICONS = [
    { id: "default", label: "Call of Block", category: "Default", rarity: "common", image: "./Icon.png", unlock: "default" },
    { id: "discord", label: "Discord picture", category: "Default", rarity: "common", source: "discord", unlock: "default" },
    { id: "minecraft", label: "Minecraft skin", category: "Default", rarity: "common", source: "minecraft", unlock: "default" },
    ...storeCatalogEntries("icon")
];
const PROFILE_BACKGROUNDS = [
    { id: "default", label: "Default", category: "Default", rarity: "common", unlock: "default", image: "./assets/profile-backgrounds/default.png" },
    { id: "br", label: "Battle Royale", category: "Game Modes", rarity: "rare", unlock: "br_winner", image: "./assets/profile-backgrounds/battle-royale.png" },
    { id: "dm", label: "Deathmatch", category: "Game Modes", rarity: "rare", unlock: "dm_winner", image: "./assets/profile-backgrounds/deathmatch.png" },
    { id: "night", label: "Night Ops", category: "Milestones", rarity: "epic", unlock: "veteran", image: "./assets/profile-backgrounds/night-ops.png" },
    { id: "custom", label: "Custom image", category: "Personal", rarity: "common", unlock: "custom" },
    ...storeCatalogEntries("background")
];
const PFP_BORDERS = [
    { id: "none", label: "None", category: "Default", rarity: "common", unlock: "default", image: "./assets/pfp-borders/none.png", inset: 0 },
    { id: "green", label: "Linked Green", category: "Milestones", rarity: "common", unlock: "linked", image: "./assets/pfp-borders/green.png", inset: 0 },
    { id: "gold", label: "First Win Gold", category: "Milestones", rarity: "rare", unlock: "first_win", image: "./assets/pfp-borders/gold.png", inset: 0 },
    { id: "blue", label: "Deathmatch Blue", category: "Game Modes", rarity: "rare", unlock: "dm_winner", image: "./assets/pfp-borders/blue.png", inset: 0 },
    { id: "red", label: "Battle Royale Red", category: "Game Modes", rarity: "rare", unlock: "br_winner", image: "./assets/pfp-borders/red.png", inset: 0 },
    ...storeCatalogEntries("border")
];
const PROFILE_TITLES = [
    { id: "none", label: "No title", text: "", category: "Default", rarity: "common", unlock: "default" },
    { id: "owner", label: "Owner", text: "Owner", category: "Exclusive", rarity: "mythic", unlock: "inventory" },
    { id: "linked_operative", label: "Linked Operative", text: "Linked Operative", category: "Milestones", rarity: "common", unlock: "linked" },
    { id: "br_survivor", label: "BR Survivor", text: "Battle Royale Survivor", category: "Game Modes", rarity: "rare", unlock: "br_winner" },
    { id: "dm_victor", label: "DM Victor", text: "Deathmatch Victor", category: "Game Modes", rarity: "rare", unlock: "dm_winner" },
    { id: "veteran", label: "Veteran", text: "Veteran", category: "Milestones", rarity: "rare", unlock: "veteran" },
    { id: "sharpshooter", label: "Sharpshooter", text: "Sharpshooter", category: "Milestones", rarity: "epic", unlock: "sharpshooter" },
    { id: "br_champion", label: "BR Champion", text: "Battle Royale Champion", category: "Game Modes", rarity: "legendary", unlock: "br_wins_live" },
    { id: "dm_champion", label: "DM Champion", text: "Deathmatch Champion", category: "Game Modes", rarity: "legendary", unlock: "dm_wins_live" },
    { id: "br_apex", label: "BR Apex", text: "Battle Royale Apex", category: "Game Modes", rarity: "mythic", unlock: "br_kills_10000" },
    { id: "dm_apex", label: "DM Apex", text: "Deathmatch Apex", category: "Game Modes", rarity: "mythic", unlock: "dm_kills_10000" },
    ...storeCatalogEntries("title")
];
const STORE_CATEGORY_LABELS = {
    all: "All",
    background: "Backgrounds",
    border: "Borders",
    icon: "Icons",
    title: "Titles"
};
const COSMETIC_CATALOG_TABLE = "cosmetic_catalog_items";
const PUBLIC_COSMETIC_CATALOG_VIEW = "public_cosmetic_catalog";
const PUBLIC_COSMETIC_INVENTORY_VIEW = "public_profile_cosmetic_inventory";
const COSMETIC_MEDIA_BUCKET = "profile-media";
const STORE_CHECKOUT_ENABLED = window.COB_STORE_CHECKOUT_ENABLED === true;
const COSMETIC_ACQUISITION_VALUES = new Set(COSMETIC_ACQUISITION_TYPES.map((option) => option.value));
const PROGRESSION_MODE_VALUES = new Set(PROGRESSION_MODES.map((option) => option.value));
const PROGRESSION_METRIC_VALUES = new Set(PROGRESSION_METRICS.map((option) => option.value));
const PLAYER_GRANT_SOURCE_VALUES = new Set(["friend", "admin"]);
const WEEKLY_DIFFICULTY_VALUES = new Set(WEEKLY_MISSION_DIFFICULTIES.map((option) => option.value));
const WEEKLY_MODE_VALUES = new Set(WEEKLY_MISSION_MODES.map((option) => option.value));
const WEEKLY_METRIC_VALUES = new Set(WEEKLY_MISSION_METRICS.map((option) => option.value));
const WEEKLY_WEAPON_SCOPE_VALUES = new Set(WEEKLY_MISSION_WEAPON_SCOPES.map((option) => option.value));
const WEEKLY_WEAPON_CATEGORY_VALUES = new Set(WEEKLY_MISSION_WEAPON_CATEGORIES.map((option) => option.value));
// Products are intentionally empty until a store-only catalog entry and its
// matching Stripe Price are registered. Achievement cosmetics are never used
// as store fallbacks.
const STORE_OFFLINE_ITEMS = [];
const BADGE_CATALOG = [
    { id: "linked", label: "Linked", rarity: "common", description: "Discord and Minecraft account paired.", progress: { type: "linked" }, test: ({ linked }) => linked },
    { id: "first_win", label: "First Win", rarity: "common", description: "Win at least one match.", progress: { scope: "overall", stat: "wins", target: 1, unit: "win" }, test: ({ stats }) => stats.wins >= 1 },
    { id: "br_winner", label: "BR Survivor", rarity: "common", description: "Win a Battle Royale game.", progress: { scope: "battleRoyale", stat: "wins", target: 1, unit: "BR win" }, test: ({ br }) => br.stats.wins >= 1 },
    { id: "dm_winner", label: "DM Victor", rarity: "common", description: "Win a Deathmatch game.", progress: { scope: "deathmatch", stat: "wins", target: 1, unit: "DM win" }, test: ({ dm }) => dm.stats.wins >= 1 },
    { id: "br_wins_10", label: "BR 10 Wins", rarity: "rare", description: "Win 10 Battle Royale games.", progress: { scope: "battleRoyale", stat: "wins", target: 10, unit: "BR wins" }, test: ({ br }) => br.stats.wins >= 10 },
    { id: "br_wins_50", label: "BR 50 Wins", rarity: "epic", description: "Win 50 Battle Royale games.", progress: { scope: "battleRoyale", stat: "wins", target: 50, unit: "BR wins" }, test: ({ br }) => br.stats.wins >= 50 },
    { id: "br_wins_live", label: "BR Wins", rarity: "legendary", description: "Dynamic badge unlocked at 100 Battle Royale wins.", dynamic: { mode: "battleRoyale", stat: "wins" }, progress: { scope: "battleRoyale", stat: "wins", target: 100, unit: "BR wins", live: true }, test: ({ br }) => br.stats.wins >= 100 },
    { id: "dm_wins_10", label: "DM 10 Wins", rarity: "rare", description: "Win 10 Deathmatch games.", progress: { scope: "deathmatch", stat: "wins", target: 10, unit: "DM wins" }, test: ({ dm }) => dm.stats.wins >= 10 },
    { id: "dm_wins_50", label: "DM 50 Wins", rarity: "epic", description: "Win 50 Deathmatch games.", progress: { scope: "deathmatch", stat: "wins", target: 50, unit: "DM wins" }, test: ({ dm }) => dm.stats.wins >= 50 },
    { id: "dm_wins_live", label: "DM Wins", rarity: "legendary", description: "Dynamic badge unlocked at 100 Deathmatch wins.", dynamic: { mode: "deathmatch", stat: "wins" }, progress: { scope: "deathmatch", stat: "wins", target: 100, unit: "DM wins", live: true }, test: ({ dm }) => dm.stats.wins >= 100 },
    { id: "br_kills_1000", label: "BR 1K Kills", rarity: "epic", description: "Score 1,000 Battle Royale kills.", progress: { scope: "battleRoyale", stat: "kills", target: 1000, unit: "BR kills" }, test: ({ br }) => br.stats.kills >= 1000 },
    { id: "br_kills_10000", label: "BR 10K Kills", rarity: "mythic", description: "Score 10,000 Battle Royale kills.", progress: { scope: "battleRoyale", stat: "kills", target: 10000, unit: "BR kills" }, test: ({ br }) => br.stats.kills >= 10000 },
    { id: "dm_kills_1000", label: "DM 1K Kills", rarity: "epic", description: "Score 1,000 Deathmatch kills.", progress: { scope: "deathmatch", stat: "kills", target: 1000, unit: "DM kills" }, test: ({ dm }) => dm.stats.kills >= 1000 },
    { id: "dm_kills_10000", label: "DM 10K Kills", rarity: "mythic", description: "Score 10,000 Deathmatch kills.", progress: { scope: "deathmatch", stat: "kills", target: 10000, unit: "DM kills" }, test: ({ dm }) => dm.stats.kills >= 10000 },
    { id: "br_mvp_10", label: "BR MVP 10", rarity: "rare", description: "Earn MVP 10 times in Battle Royale.", progress: { scope: "battleRoyale", stat: "mvp", target: 10, unit: "BR MVP awards" }, test: ({ br }) => br.stats.mvp >= 10 },
    { id: "br_mvp_100", label: "BR MVP 100", rarity: "legendary", description: "Earn MVP 100 times in Battle Royale.", progress: { scope: "battleRoyale", stat: "mvp", target: 100, unit: "BR MVP awards" }, test: ({ br }) => br.stats.mvp >= 100 },
    { id: "dm_mvp_10", label: "DM MVP 10", rarity: "rare", description: "Earn MVP 10 times in Deathmatch.", progress: { scope: "deathmatch", stat: "mvp", target: 10, unit: "DM MVP awards" }, test: ({ dm }) => dm.stats.mvp >= 10 },
    { id: "dm_mvp_100", label: "DM MVP 100", rarity: "legendary", description: "Earn MVP 100 times in Deathmatch.", progress: { scope: "deathmatch", stat: "mvp", target: 100, unit: "DM MVP awards" }, test: ({ dm }) => dm.stats.mvp >= 100 },
    { id: "sharpshooter", label: "Sharpshooter", rarity: "epic", description: "Reach 35% headshot rate with at least 20 hits.", progress: { type: "sharpshooter", rateTarget: 35, hitsTarget: 20 }, test: ({ stats, derived }) => stats.hits >= 20 && derived.headshotRate >= 35 },
    { id: "veteran", label: "Veteran", rarity: "rare", description: "Play 25 games.", progress: { scope: "overall", stat: "games", target: 25, unit: "games" }, test: ({ stats }) => stats.games >= 25 }
];
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

const adminTicketPreferences = loadAdminTicketPreferences();

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
    authProfileExtended: true,
    authCosmeticInventoryExtended: true,
    authMessage: "",
    accountProfiles: [],
    accountProfilesReady: false,
    accountProfileIndex: emptyAccountProfileIndex(),
    cosmeticOwnershipCache: new Map(),
    accountGifts: [],
    accountGiftsLoaded: false,
    accountCosmeticRevocations: new Set(),
    accountMessage: "",
    accountSaving: false,
    accountPanelOpen: false,
    cosmeticPicker: {
        type: "",
        showUnowned: false,
        rarityDirection: "asc"
    },
    store: {
        adminTab: "preview",
        category: "all",
        items: STORE_OFFLINE_ITEMS,
        loaded: false,
        loading: false,
        backendReady: false,
        catalogItems: [],
        catalogLoaded: false,
        catalogLoading: false,
        catalogReady: false,
        catalogProgressionReady: false,
        catalogMessage: "",
        editingKey: "",
        savingCatalog: false,
        purchasingKey: "",
        pendingPurchase: null,
        message: "",
        checkoutStatus: "",
        checkoutSessionId: "",
        checkoutType: "",
        checkoutItemId: "",
        checkoutHandled: false,
        checkoutFinalizing: false
    },
    feedback: {
        api: null,
        tickets: [],
        ticketsLoaded: false,
        ticketsLoading: false,
        adminTickets: [],
        adminTicketsLoaded: false,
        adminTicketsLoading: false,
        selectedTicket: null,
        selectedTicketId: "",
        detailLoadedId: "",
        detailLoading: false,
        attachment: { managed: false, loading: false, signedUrl: "", kind: "file", error: "" },
        messages: [],
        history: [],
        reporter: null,
        admins: [],
        adminMetadataLoaded: false,
        documentation: [],
        documentationLoaded: false,
        documentationLoading: false,
        submitting: false,
        replying: false,
        updating: false,
        cooldownUntil: 0,
        message: "",
        error: "",
        formErrors: {},
        statusFilter: "all",
        categoryFilter: "all",
        severityFilter: "all",
        search: "",
        sort: "updated",
        hideClosed: adminTicketPreferences.hideClosed
    },
    progression: {
        api: null,
        section: "cosmetics",
        loaded: false,
        loading: false,
        ready: false,
        rules: [],
        grants: [],
        revocations: [],
        profiles: [],
        players: [],
        playersReady: false,
        playerSelectedId: "",
        playerSearch: "",
        playerCollectionFilter: "all",
        playerCollectionSort: "ownership",
        playerGrantKey: "",
        playerRevokeKey: "",
        playerBanOpen: false,
        playerMessage: "",
        playerError: "",
        editorKey: "",
        creating: false,
        filterSearch: "",
        filterType: "all",
        showArchived: true,
        weeklyTemplates: [],
        weeklyReady: false,
        weeklyEditorId: "",
        creatingWeekly: false,
        weeklyFilterSearch: "",
        weeklyFilterDifficulty: "all",
        weeklyShowArchived: true,
        weeklyMessage: "",
        weeklyError: "",
        saving: false,
        message: "",
        error: ""
    },
    weeklyMissions: {
        loading: false,
        syncing: false,
        templates: [],
        templatesLoaded: false,
        templatesLoading: false,
        templatesReady: false,
        row: null,
        source: "",
        message: "",
        claimingId: "",
        animatingId: "",
        swapMissionId: "",
        swapping: false
    },
    pollMs: DEFAULT_API_POLL_MS,
    refreshTimer: null,
    dataSignature: "",
    mode: "battleRoyale",
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
    historyFilter: "battleRoyale",
    profileWeaponSort: "kills",
    profileWeaponSortDirection: "desc",
    expandedMatchIds: new Set(),
    championMode: "battleRoyale",
    championTimer: null,
    championScrollTimer: null,
    pendingScrollTarget: "",
    playtests: emptyPlaytestState(),
    cache: emptyCache()
};
const feedbackDraftSession = createFeedbackDraftSession({
    getUserId: () => state.authSession?.user?.id || ""
});
let activeBadgeProgressHost = null;
let badgeTooltipFrame = 0;
let adminTicketSearchTimer = 0;
let progressionSearchTimer = 0;
let weeklyTemplateSearchTimer = 0;
let playerManagerSearchTimer = 0;
let weeklyTemplateLoadPromise = null;

document.addEventListener("DOMContentLoaded", () => {
    setupLiveConfig();
    setupAuthClient();
    loadPlaytestState();
    applyRoute();
    bindStaticEvents();
    startChampionRotation();
    void initAuth();
    void loadRemotePlaytests({ silent: true });
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
    state.feedback.api = createFeedbackApi(state.authClient);
    state.progression.api = createProgressionAdminApi(state.authClient);
}

async function initAuth() {
    if (!state.authClient) {
        state.authReady = true;
        enforceProtectedAdminRoute();
        render();
        return;
    }

    try {
        const { data, error } = await state.authClient.auth.getSession();
        if (error) throw error;
        await applyAuthSession(data?.session || null, true);
        await loadAccountProfiles();
        await loadRemotePlaytests({ silent: true });
        state.authClient.auth.onAuthStateChange((_event, session) => {
            void applyAuthSession(session, true);
        });
    } catch (error) {
        console.error("Failed to initialize Discord login", error);
        state.authReady = true;
        state.authMessage = "Discord login is unavailable right now.";
        resetPlaytestViewer();
        resetFeedbackSessionState();
        resetProgressionAdminState();
        enforceProtectedAdminRoute();
        render();
    }
}

async function applyAuthSession(session, shouldRender = false) {
    state.authSession = session || null;
    state.authReady = !session?.user;

    if (!session?.user) {
        state.authProfile = null;
        state.authMessage = "";
        state.accountPanelOpen = false;
        resetAccountGiftState();
        resetWeeklyMissionState();
        resetStoreSessionState({ resetCatalog: true });
        resetFeedbackSessionState();
        resetProgressionAdminState();
        resetPlaytestViewer();
        await loadCosmeticCatalog({ force: true });
        await loadAccountProfiles();
        await loadRemotePlaytests({ silent: true });
        enforceProtectedAdminRoute();
        if (shouldRender) render();
        return;
    }

    updateViewerFromDiscordUser(session.user);
    await syncPlaytestProfile(session.user);
    await loadCosmeticCatalog({ force: true });
    await claimProgressionCosmetics();
    await loadAccountProfiles();
    await loadOwnCosmeticGifts();
    await loadRemotePlaytests({ silent: true });
    await syncWeeklyMissions();
    resetFeedbackSessionState();
    resetProgressionAdminState();
    consumeAuthReturn();
    resetStoreSessionState();
    state.authReady = true;
    enforceProtectedAdminRoute();
    if (state.view === "store" && isPlaytestAdmin()) await loadStoreData();
    if (shouldRender) render();
}

async function claimProgressionCosmetics() {
    if (!state.authClient || !state.authSession?.user || isCurrentAccountCommunityBanned()) return;
    try {
        const result = await state.authClient.rpc("claim_progression_cosmetics");
        if (result.error) {
            const code = String(result.error.code || "");
            if (["42883", "PGRST202"].includes(code) || /could not find.*claim_progression_cosmetics/i.test(result.error.message || "")) return;
            throw result.error;
        }
        const rewards = Array.isArray(result.data) ? result.data : [];
        if (rewards.length) {
            state.accountMessage = `${rewards.length} new progression cosmetic${rewards.length === 1 ? "" : "s"} unlocked.`;
        }
    } catch (error) {
        console.warn("Could not claim progression cosmetics", error);
    }
}

async function signInWithDiscord() {
    if (!state.authClient) {
        state.authMessage = "Discord login is not configured.";
        render();
        return;
    }

    state.authMessage = "";
    resetAccountGiftState();
    if (["playtests", "store", "feedback", "ticket"].includes(state.view)) rememberAuthReturn();
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
    state.accountPanelOpen = false;
    state.accountMessage = "";
    state.authMessage = "";
    resetAccountGiftState();
    resetWeeklyMissionState();
    resetStoreSessionState({ resetCatalog: true });
    resetFeedbackSessionState();
    resetProgressionAdminState();
    resetPlaytestViewer();
    await loadCosmeticCatalog({ force: true });
    await loadAccountProfiles();
    await loadRemotePlaytests({ silent: true });
    enforceProtectedAdminRoute();
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

function rememberAuthReturn() {
    const route = window.location.hash.replace(/^#/, "");
    const allowed = new Set(["playtests", "store", "feedback"]);
    if (!allowed.has(route) && !/^ticket=[0-9a-f-]{36}$/i.test(route)) return;
    try {
        window.localStorage?.setItem(PLAYTEST_AUTH_RETURN_KEY, route);
    } catch (_error) {
        // Returning to the public root is still valid if storage is unavailable.
    }
}

function consumeAuthReturn() {
    try {
        const route = window.localStorage?.getItem(PLAYTEST_AUTH_RETURN_KEY) || "";
        const allowed = new Set(["playtests", "store", "feedback"]);
        if (!allowed.has(route) && !/^ticket=[0-9a-f-]{36}$/i.test(route)) return;
        window.localStorage.removeItem(PLAYTEST_AUTH_RETURN_KEY);
        if (window.location.hash.replace(/^#/, "") !== route) window.location.hash = route;
        applyRoute();
    } catch (_error) {
        // Ignore storage issues; the user can still open the playtest view normally.
    }
}

function bindStaticEvents() {
    document.addEventListener("click", (event) => {
        const feedbackRetry = event.target.closest("[data-feedback-retry]");
        if (feedbackRetry) {
            event.preventDefault();
            state.feedback.ticketsLoaded = false;
            void loadOwnFeedbackTickets({ force: true });
            return;
        }

        const feedbackDraftDiscard = event.target.closest("[data-feedback-draft-discard]");
        if (feedbackDraftDiscard) {
            event.preventDefault();
            if (!window.confirm("Discard this saved ticket draft and its attachment?")) return;
            void feedbackDraftSession.discard();
            return;
        }

        const ticketRetry = event.target.closest("[data-ticket-retry]");
        if (ticketRetry) {
            event.preventDefault();
            state.feedback.detailLoadedId = "";
            void loadFeedbackTicketDetail(state.feedback.selectedTicketId, { force: true });
            return;
        }

        const adminTicketsRetry = event.target.closest("[data-admin-tickets-retry]");
        if (adminTicketsRetry) {
            event.preventDefault();
            state.feedback.adminTicketsLoaded = false;
            void loadAdminFeedbackTickets({ force: true });
            return;
        }

        const adminDocsRetry = event.target.closest("[data-admin-docs-retry]");
        if (adminDocsRetry) {
            event.preventDefault();
            state.feedback.documentationLoaded = false;
            void loadAdminDocumentation({ force: true });
            return;
        }

        const progressionRetry = event.target.closest("[data-progression-retry]");
        if (progressionRetry) {
            event.preventDefault();
            void loadProgressionAdminData({ force: true });
            return;
        }

        const progressionSection = event.target.closest("[data-progression-section]");
        if (progressionSection) {
            event.preventDefault();
            const section = progressionSection.dataset.progressionSection;
            if (!["cosmetics", "weekly", "players"].includes(section)) return;
            state.progression.section = section;
            state.progression.editorKey = "";
            state.progression.creating = false;
            state.progression.weeklyEditorId = "";
            state.progression.creatingWeekly = false;
            state.progression.playerGrantKey = "";
            state.progression.playerRevokeKey = "";
            state.progression.playerBanOpen = false;
            renderProgressionAdminPage();
            return;
        }

        const weeklyRetry = event.target.closest("[data-progression-weekly-retry]");
        if (weeklyRetry) {
            event.preventDefault();
            void loadProgressionAdminData({ force: true });
            return;
        }

        const playerManagerRetry = event.target.closest("[data-player-manager-retry]");
        if (playerManagerRetry) {
            event.preventDefault();
            void loadProgressionAdminData({ force: true });
            return;
        }

        const progressionCosmeticNew = event.target.closest("[data-progression-cosmetic-new]");
        if (progressionCosmeticNew) {
            event.preventDefault();
            state.progression.editorKey = "";
            state.progression.creating = true;
            renderProgressionAdminPage();
            focusProgressionEditor();
            return;
        }

        const progressionCosmeticOpen = event.target.closest("[data-progression-cosmetic-open]");
        if (progressionCosmeticOpen) {
            event.preventDefault();
            state.progression.editorKey = progressionCosmeticOpen.dataset.progressionCosmeticOpen || "";
            state.progression.creating = false;
            renderProgressionAdminPage();
            focusProgressionEditor();
            return;
        }

        const progressionCosmeticClose = event.target.closest("[data-progression-cosmetic-close]");
        if (progressionCosmeticClose) {
            event.preventDefault();
            state.progression.editorKey = "";
            state.progression.creating = false;
            renderProgressionAdminPage();
            return;
        }

        const progressionCosmeticArchive = event.target.closest("[data-progression-cosmetic-archive]");
        if (progressionCosmeticArchive) {
            event.preventDefault();
            void toggleProgressionCosmeticArchive(progressionCosmeticArchive.dataset.progressionCosmeticArchive || "");
            return;
        }

        const progressionCosmeticDelete = event.target.closest("[data-progression-cosmetic-delete]");
        if (progressionCosmeticDelete) {
            event.preventDefault();
            void deleteProgressionCosmetic(progressionCosmeticDelete.dataset.progressionCosmeticDelete || "");
            return;
        }

        const weeklyTemplateNew = event.target.closest("[data-weekly-template-new]");
        if (weeklyTemplateNew) {
            event.preventDefault();
            state.progression.weeklyEditorId = "";
            state.progression.creatingWeekly = true;
            renderProgressionAdminPage();
            focusProgressionEditor();
            return;
        }

        const weeklyTemplateOpen = event.target.closest("[data-weekly-template-open]");
        if (weeklyTemplateOpen) {
            event.preventDefault();
            state.progression.weeklyEditorId = weeklyTemplateOpen.dataset.weeklyTemplateOpen || "";
            state.progression.creatingWeekly = false;
            renderProgressionAdminPage();
            focusProgressionEditor();
            return;
        }

        const weeklyTemplateClose = event.target.closest("[data-weekly-template-close]");
        if (weeklyTemplateClose) {
            event.preventDefault();
            state.progression.weeklyEditorId = "";
            state.progression.creatingWeekly = false;
            renderProgressionAdminPage();
            return;
        }

        const weeklyTemplateArchive = event.target.closest("[data-weekly-template-archive]");
        if (weeklyTemplateArchive) {
            event.preventDefault();
            void toggleWeeklyMissionTemplateArchive(weeklyTemplateArchive.dataset.weeklyTemplateArchive || "");
            return;
        }

        const weeklyTemplateDelete = event.target.closest("[data-weekly-template-delete]");
        if (weeklyTemplateDelete) {
            event.preventDefault();
            void deleteWeeklyMissionTemplate(weeklyTemplateDelete.dataset.weeklyTemplateDelete || "");
            return;
        }

        const playerManagerSelect = event.target.closest("[data-player-manager-select]");
        if (playerManagerSelect) {
            event.preventDefault();
            state.progression.playerSelectedId = playerManagerSelect.dataset.playerManagerSelect || "";
            state.progression.playerGrantKey = "";
            state.progression.playerRevokeKey = "";
            state.progression.playerBanOpen = false;
            state.progression.playerMessage = "";
            state.progression.playerError = "";
            renderProgressionAdminPage();
            return;
        }

        const playerCollectionFilter = event.target.closest("[data-player-collection-filter]");
        if (playerCollectionFilter) {
            event.preventDefault();
            const filter = playerCollectionFilter.dataset.playerCollectionFilter;
            if (!["all", "owned", "unowned"].includes(filter)) return;
            state.progression.playerCollectionFilter = filter;
            renderProgressionAdminPage();
            return;
        }

        const playerGrantOpen = event.target.closest("[data-player-grant-open]");
        if (playerGrantOpen) {
            event.preventDefault();
            state.progression.playerGrantKey = playerGrantOpen.dataset.playerGrantOpen || "";
            state.progression.playerRevokeKey = "";
            state.progression.playerBanOpen = false;
            renderProgressionAdminPage();
            focusProgressionEditor();
            return;
        }

        const playerGrantClose = event.target.closest("[data-player-grant-close]");
        if (playerGrantClose) {
            event.preventDefault();
            state.progression.playerGrantKey = "";
            renderProgressionAdminPage();
            return;
        }

        const playerBanOpen = event.target.closest("[data-player-ban-open]");
        if (playerBanOpen && !playerBanOpen.disabled) {
            event.preventDefault();
            state.progression.playerBanOpen = true;
            state.progression.playerGrantKey = "";
            state.progression.playerRevokeKey = "";
            renderProgressionAdminPage();
            focusProgressionEditor();
            return;
        }

        const playerBanClose = event.target.closest("[data-player-ban-close]");
        if (playerBanClose) {
            event.preventDefault();
            state.progression.playerBanOpen = false;
            renderProgressionAdminPage();
            return;
        }

        const progressionGrantRevoke = event.target.closest("[data-progression-grant-revoke]");
        if (progressionGrantRevoke) {
            event.preventDefault();
            const profileId = progressionGrantRevoke.dataset.profileId || "";
            const cosmeticType = progressionGrantRevoke.dataset.cosmeticType || "";
            const cosmeticId = progressionGrantRevoke.dataset.cosmeticId || "";
            if (requiredFallbackCosmetic(cosmeticType, cosmeticId)) {
                state.progression.playerError = "The account's required fallback cosmetic cannot be revoked.";
                renderProgressionAdminPage();
                return;
            }
            state.progression.playerSelectedId = profileId;
            state.progression.playerRevokeKey = `${cosmeticType}:${cosmeticId}`;
            state.progression.playerGrantKey = "";
            state.progression.playerBanOpen = false;
            state.progression.playerError = "";
            renderProgressionAdminPage();
            focusProgressionEditor();
            return;
        }

        const playerRevokeClose = event.target.closest("[data-player-revoke-close]");
        if (playerRevokeClose) {
            event.preventDefault();
            state.progression.playerRevokeKey = "";
            renderProgressionAdminPage();
            return;
        }

        const ticketStatus = event.target.closest("[data-ticket-user-status]");
        if (ticketStatus) {
            event.preventDefault();
            void updateUserTicketStatus(ticketStatus.dataset.ticketUserStatus || "");
            return;
        }

        const copyTicketId = event.target.closest("[data-ticket-copy-id]");
        if (copyTicketId) {
            event.preventDefault();
            void copyTicketText(copyTicketId.dataset.ticketCopyId || "", "Ticket ID copied.");
            return;
        }

        const copyTicketSummary = event.target.closest("[data-ticket-copy-summary]");
        if (copyTicketSummary) {
            event.preventDefault();
            void copyTicketText(ticketSummaryText(state.feedback.selectedTicket), "Ticket summary copied.");
            return;
        }

        const storePurchaseClose = event.target.closest("[data-store-purchase-close]");
        if (storePurchaseClose || event.target.matches("[data-store-purchase-backdrop]")) {
            event.preventDefault();
            closeStorePurchaseDialog();
            return;
        }

        const confirmationClose = event.target.closest("[data-confirm-dialog-close]");
        if (confirmationClose || event.target.matches("[data-confirm-dialog-backdrop]")) {
            event.preventDefault();
            closeConfirmDialog();
            return;
        }

        const missionSwapClose = event.target.closest("[data-weekly-swap-close]");
        if (missionSwapClose || event.target.matches("[data-weekly-swap-backdrop]")) {
            event.preventDefault();
            closeWeeklyMissionSwapDialog();
            return;
        }

        const accountPanelClose = event.target.closest("[data-account-panel-close]");
        if (accountPanelClose || event.target.matches("[data-account-panel-backdrop]")) {
            event.preventDefault();
            closeAccountSidePanel();
            return;
        }

        const accountPanelOpen = event.target.closest("[data-account-panel-open]");
        if (accountPanelOpen) {
            event.preventDefault();
            openAccountSidePanel();
            return;
        }

        const missionClaim = event.target.closest("[data-weekly-claim]");
        if (missionClaim) {
            event.preventDefault();
            void claimWeeklyMission(missionClaim.dataset.weeklyClaim);
            return;
        }

        const missionSwap = event.target.closest("[data-weekly-swap]");
        if (missionSwap) {
            event.preventDefault();
            openWeeklyMissionSwapDialog(missionSwap.dataset.weeklySwap);
            return;
        }

        const storeAdminTab = event.target.closest("[data-store-admin-tab]");
        if (storeAdminTab) {
            event.preventDefault();
            const tab = storeAdminTab.dataset.storeAdminTab;
            if (["preview", "catalog"].includes(tab) && isPlaytestAdmin()) {
                state.store.adminTab = tab;
                renderStorePage();
            }
            return;
        }

        const storeCatalogNew = event.target.closest("[data-store-catalog-new]");
        if (storeCatalogNew) {
            event.preventDefault();
            state.store.editingKey = "";
            state.store.adminTab = "catalog";
            renderStorePage();
            window.requestAnimationFrame(() => document.querySelector("[data-catalog-form] [name='name']")?.focus());
            return;
        }

        const storeCatalogEdit = event.target.closest("[data-store-catalog-edit]");
        if (storeCatalogEdit) {
            event.preventDefault();
            state.store.editingKey = storeCatalogEdit.dataset.storeCatalogEdit || "";
            state.store.adminTab = "catalog";
            renderStorePage();
            window.requestAnimationFrame(() => document.querySelector("[data-catalog-form] [name='name']")?.focus());
            return;
        }

        const storeCatalogToggle = event.target.closest("[data-store-catalog-toggle]");
        if (storeCatalogToggle) {
            event.preventDefault();
            void toggleCatalogItemActive(storeCatalogToggle.dataset.storeCatalogToggle);
            return;
        }

        const storeCategory = event.target.closest("[data-store-category]");
        if (storeCategory) {
            event.preventDefault();
            const category = storeCategory.dataset.storeCategory;
            if (STORE_CATEGORY_LABELS[category]) {
                state.store.category = category;
                renderStorePage();
            }
            return;
        }

        const storeBuy = event.target.closest("[data-store-buy]");
        if (storeBuy) {
            event.preventDefault();
            openStorePurchaseDialog(storeBuy.dataset.storeType, storeBuy.dataset.storeBuy);
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

        const authLoginButton = event.target.closest("[data-auth-login]");
        if (authLoginButton) {
            event.preventDefault();
            void signInWithDiscord();
            return;
        }

        const authSignOutButton = event.target.closest("[data-auth-sign-out]");
        if (authSignOutButton) {
            event.preventDefault();
            void signOutDiscord();
            return;
        }

        const cosmeticPickerClose = event.target.closest("[data-cosmetic-picker-close]");
        if (cosmeticPickerClose || event.target.matches("[data-cosmetic-picker-backdrop]")) {
            event.preventDefault();
            closeCosmeticPicker();
            return;
        }

        const cosmeticPickerOpen = event.target.closest("[data-cosmetic-picker-open]");
        if (cosmeticPickerOpen) {
            event.preventDefault();
            openCosmeticPicker(cosmeticPickerOpen.dataset.cosmeticPickerOpen);
            return;
        }

        const cosmeticOption = event.target.closest("[data-cosmetic-option]");
        if (cosmeticOption) {
            event.preventDefault();
            selectCosmeticOption(cosmeticOption.dataset.cosmeticType, cosmeticOption.dataset.cosmeticOption);
            return;
        }

        const cosmeticSort = event.target.closest("[data-cosmetic-sort]");
        if (cosmeticSort) {
            event.preventDefault();
            state.cosmeticPicker.rarityDirection = state.cosmeticPicker.rarityDirection === "asc" ? "desc" : "asc";
            renderCosmeticPicker(true);
            return;
        }

        const contactButton = event.target.closest("[data-contact-email]");
        if (contactButton) {
            event.preventDefault();
            openContactEmail();
        }
    });

    document.addEventListener("submit", (event) => {
        if (event.target.matches("[data-feedback-create]")) {
            event.preventDefault();
            void submitFeedbackTicket(event.target);
            return;
        }

        if (event.target.matches("[data-ticket-reply]")) {
            event.preventDefault();
            void submitTicketReply(event.target);
            return;
        }

        if (event.target.matches("[data-admin-ticket-update]")) {
            event.preventDefault();
            void submitAdminTicketUpdate(event.target);
            return;
        }

        if (event.target.matches("[data-account-form]")) {
            event.preventDefault();
            void submitAccountForm(event.target);
            return;
        }

        if (event.target.matches("[data-weekly-swap-form]")) {
            event.preventDefault();
            void submitWeeklyMissionSwap();
            return;
        }

        if (event.target.matches("[data-store-purchase-form]")) {
            event.preventDefault();
            void submitStorePurchase();
            return;
        }

        if (event.target.matches("[data-catalog-form]")) {
            event.preventDefault();
            void submitCatalogForm(event.target);
            return;
        }

        if (event.target.matches("[data-progression-cosmetic-form]")) {
            event.preventDefault();
            void submitProgressionCosmetic(event.target);
            return;
        }

        if (event.target.matches("[data-weekly-template-form]")) {
            event.preventDefault();
            void submitWeeklyMissionTemplate(event.target);
            return;
        }

        if (event.target.matches("[data-progression-grant-form]")) {
            event.preventDefault();
            void submitProgressionGrant(event.target);
            return;
        }

        if (event.target.matches("[data-player-revoke-form]")) {
            event.preventDefault();
            void submitProgressionRevoke(event.target);
            return;
        }

        if (event.target.matches("[data-player-ban-form]")) {
            event.preventDefault();
            void submitPlayerCommunityBan(event.target);
            return;
        }

        if (!event.target.matches("[data-confirm-dialog-form]")) return;
        event.preventDefault();
        void submitConfirmDialog(event.target);
    });

    document.addEventListener("change", (event) => {
        const feedbackDraftForm = event.target.closest("[data-feedback-create]");
        if (feedbackDraftForm && event.target.matches("select[name], input[type='file'][name='attachment']")) {
            feedbackDraftSession.capture(feedbackDraftForm, {
                attachmentChanged: event.target.matches("input[type='file'][name='attachment']")
            });
            return;
        }

        if (event.target.matches("[data-feedback-filter]")) {
            const filter = event.target.dataset.feedbackFilter;
            if (filter === "status") state.feedback.statusFilter = event.target.value;
            if (filter === "category") state.feedback.categoryFilter = event.target.value;
            renderFeedbackPage();
            return;
        }

        if (event.target.matches("[data-admin-ticket-filter]")) {
            const filter = event.target.dataset.adminTicketFilter;
            if (filter === "status") state.feedback.statusFilter = event.target.value;
            if (filter === "category") state.feedback.categoryFilter = event.target.value;
            if (filter === "severity") state.feedback.severityFilter = event.target.value;
            if (filter === "sort") state.feedback.sort = event.target.value;
            renderAdminTicketsPage();
            return;
        }

        if (event.target.matches("[data-admin-ticket-hide-closed]")) {
            state.feedback.hideClosed = Boolean(event.target.checked);
            saveAdminTicketPreferences({ hideClosed: state.feedback.hideClosed });
            renderAdminTicketsPage();
            return;
        }

        if (event.target.matches("[data-progression-filter='type']")) {
            state.progression.filterType = event.target.value;
            renderProgressionAdminPage();
            return;
        }

        if (event.target.matches("[data-progression-show-archived]")) {
            state.progression.showArchived = Boolean(event.target.checked);
            renderProgressionAdminPage();
            return;
        }

        if (event.target.matches("[data-weekly-template-filter='difficulty']")) {
            state.progression.weeklyFilterDifficulty = event.target.value;
            renderProgressionAdminPage();
            return;
        }

        if (event.target.matches("[data-weekly-template-show-archived]")) {
            state.progression.weeklyShowArchived = Boolean(event.target.checked);
            renderProgressionAdminPage();
            return;
        }

        if (event.target.matches("[data-player-collection-sort]")) {
            const sort = event.target.value;
            if (!["ownership", "alphabetical"].includes(sort)) return;
            state.progression.playerCollectionSort = sort;
            renderProgressionAdminPage();
            return;
        }

        if (event.target.matches("[data-weekly-template-weapon-scope]")) {
            const form = event.target.closest("[data-weekly-template-form]");
            form?.querySelector("[data-weekly-template-exact-weapon]")?.toggleAttribute("hidden", event.target.value !== "exact_weapon");
            form?.querySelector("[data-weekly-template-category]")?.toggleAttribute("hidden", event.target.value !== "weapon_category");
            return;
        }

        if (event.target.matches("[data-progression-cosmetic-type], [data-progression-acquisition], [data-progression-time-limit], [data-progression-count-limit]")) {
            const form = event.target.closest("[data-progression-cosmetic-form]");
            syncProgressionCosmeticEditor(form);
            if (event.target.matches("[data-progression-cosmetic-type]")) updateProgressionDraftPreview(form);
            return;
        }

        if (event.target.matches("[data-progression-asset-input]")) {
            previewProgressionAsset(event.target);
            return;
        }

        const accountForm = event.target.closest("[data-account-form]");
        if (accountForm && event.target.matches("[name='avatarSource'], [name='profileBackground'], [name='pfpBorder'], [name='profileTitle']")) {
            updateAccountCustomizePreview(accountForm);
        }
        if (accountForm && event.target.matches("[name='selectedBadges']")) {
            enforceBadgeSelectionLimit(accountForm, event.target);
        }

        if (event.target.matches("[data-cosmetic-show-unowned]")) {
            state.cosmeticPicker.showUnowned = Boolean(event.target.checked);
            renderCosmeticPicker(true);
            return;
        }

        if (event.target.matches("[data-catalog-asset-input]")) {
            previewCatalogAsset(event.target);
            return;
        }

        if (event.target.matches("[data-catalog-shop-toggle]")) {
            const form = event.target.closest("[data-catalog-form]");
            form?.querySelector("[data-catalog-shop-fields]")?.toggleAttribute("hidden", !event.target.checked);
        }

        if (event.target.matches("[data-catalog-acquisition]")) {
            const form = event.target.closest("[data-catalog-form]");
            form?.querySelector("[data-catalog-shop-fields]")?.toggleAttribute("hidden", event.target.value !== "store");
        }
    });

    document.addEventListener("input", (event) => {
        const feedbackDraftForm = event.target.closest("[data-feedback-create]");
        if (feedbackDraftForm && event.target.matches("input:not([type='file']), textarea")) {
            feedbackDraftSession.capture(feedbackDraftForm);
            return;
        }

        if (event.target.matches("[data-admin-ticket-filter='search']")) {
            state.feedback.search = event.target.value.slice(0, 200);
            window.clearTimeout(adminTicketSearchTimer);
            const caret = event.target.selectionStart;
            adminTicketSearchTimer = window.setTimeout(() => {
                renderAdminTicketsPage();
                window.requestAnimationFrame(() => {
                    const input = document.querySelector("[data-admin-ticket-filter='search']");
                    input?.focus();
                    if (Number.isInteger(caret)) input?.setSelectionRange(caret, caret);
                });
            }, 160);
            return;
        }

        if (event.target.matches("[data-progression-filter='search']")) {
            state.progression.filterSearch = event.target.value.slice(0, 200);
            window.clearTimeout(progressionSearchTimer);
            const caret = event.target.selectionStart;
            progressionSearchTimer = window.setTimeout(() => {
                renderProgressionAdminPage();
                window.requestAnimationFrame(() => {
                    const input = document.querySelector("[data-progression-filter='search']");
                    input?.focus();
                    if (Number.isInteger(caret)) input?.setSelectionRange(caret, caret);
                });
            }, 120);
            return;
        }

        if (event.target.matches("[data-weekly-template-filter='search']")) {
            state.progression.weeklyFilterSearch = event.target.value.slice(0, 200);
            window.clearTimeout(weeklyTemplateSearchTimer);
            const caret = event.target.selectionStart;
            weeklyTemplateSearchTimer = window.setTimeout(() => {
                renderProgressionAdminPage();
                window.requestAnimationFrame(() => {
                    const input = document.querySelector("[data-weekly-template-filter='search']");
                    input?.focus();
                    if (Number.isInteger(caret)) input?.setSelectionRange(caret, caret);
                });
            }, 120);
            return;
        }

        if (event.target.matches("[data-player-manager-search]")) {
            state.progression.playerSearch = event.target.value.slice(0, 200);
            window.clearTimeout(playerManagerSearchTimer);
            const caret = event.target.selectionStart;
            playerManagerSearchTimer = window.setTimeout(() => {
                renderProgressionAdminPage();
                window.requestAnimationFrame(() => {
                    const input = document.querySelector("[data-player-manager-search]");
                    input?.focus();
                    if (Number.isInteger(caret)) input?.setSelectionRange(caret, caret);
                });
            }, 120);
            return;
        }

        const progressionForm = event.target.closest("[data-progression-cosmetic-form]");
        if (progressionForm && event.target.matches("[name='name'], [name='titleText'], [name='imageUrl']")) {
            updateProgressionDraftPreview(progressionForm);
            return;
        }

        const accountForm = event.target.closest("[data-account-form]");
        if (accountForm && event.target.matches("[name='displayName']")) {
            updateAccountCustomizePreview(accountForm);
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        if (state.store.pendingPurchase) {
            closeStorePurchaseDialog();
            return;
        }
        if (state.cosmeticPicker.type) {
            closeCosmeticPicker();
            return;
        }
        if (state.accountPanelOpen) closeAccountSidePanel();
    });

    document.addEventListener("mouseover", handleBadgeSeenEvent);
    document.addEventListener("error", (event) => {
        const image = event.target;
        if (image instanceof HTMLImageElement && image.hasAttribute("data-avatar-fallbacks")) {
            handleAvatarFallback(image);
        } else if (image instanceof HTMLImageElement && image.hasAttribute("data-player-manager-avatar")) {
            image.remove();
        }
    }, true);
    document.addEventListener("focusin", handleBadgeSeenEvent);
    document.addEventListener("mouseover", handleBadgeProgressEnter);
    document.addEventListener("mouseout", handleBadgeProgressLeave);
    document.addEventListener("focusin", handleBadgeProgressEnter);
    document.addEventListener("focusout", handleBadgeProgressLeave);
    window.addEventListener("scroll", hideBadgeProgressTooltip, true);
    window.addEventListener("resize", hideBadgeProgressTooltip);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") feedbackDraftSession.flush();
    });
    window.addEventListener("pagehide", () => feedbackDraftSession.flush());

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

        const weaponSort = event.target.closest("[data-profile-weapon-sort]");
        if (weaponSort) {
            const sort = weaponSort.dataset.profileWeaponSort;
            if (PROFILE_WEAPON_SORTS[sort]) {
                if (state.profileWeaponSort === sort) {
                    state.profileWeaponSortDirection = state.profileWeaponSortDirection === "desc" ? "asc" : "desc";
                } else {
                    state.profileWeaponSort = sort;
                    state.profileWeaponSortDirection = "desc";
                }
                render();
            }
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
    state.accountPanelOpen = false;
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
    if (route === "how-to-play" || route === "faq") {
        state.view = "home";
        state.pendingScrollTarget = route;
        return;
    }
    if (route === "admin-help") {
        if (state.authReady && !isPlaytestAdmin()) {
            state.view = "home";
            window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
            return;
        }
        state.view = "adminHelp";
        state.selectedId = null;
        state.profilePreviewOpen = false;
        return;
    }
    if (route === "feedback") {
        state.view = "feedback";
        state.selectedId = null;
        state.profilePreviewOpen = false;
        return;
    }
    if (route === "admin-tickets") {
        if (state.authReady && !isPlaytestAdmin()) {
            state.view = "feedback";
            window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}#feedback`);
            return;
        }
        state.view = "adminTickets";
        state.selectedId = null;
        state.profilePreviewOpen = false;
        return;
    }
    if (route === "admin-progression") {
        if (state.authReady && !isPlaytestAdmin()) {
            state.view = "home";
            window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
            return;
        }
        state.view = "adminProgression";
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
    if (route === "account") {
        state.view = "account";
        state.selectedId = null;
        state.profilePreviewOpen = false;
        return;
    }
    if (route === "store") {
        if (state.authReady && !isPlaytestAdmin()) {
            state.view = "home";
            window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
            return;
        }
        state.view = "store";
        state.selectedId = null;
        state.profilePreviewOpen = false;
        state.store.checkoutStatus = ["success", "cancelled"].includes(params.get("checkout"))
            ? params.get("checkout")
            : "";
        state.store.checkoutSessionId = params.get("session_id") || "";
        state.store.checkoutType = params.get("type") || "";
        state.store.checkoutItemId = params.get("item") || "";
        state.store.checkoutHandled = false;
        return;
    }
    if (route === "community-dates") {
        if (state.authReady && !isPlaytestAdmin()) {
            state.view = "playtests";
            window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}#playtests`);
            return;
        }
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
        if (PUBLIC_MODE_LABELS[mode]) state.mode = mode;
        if (!PUBLIC_MODE_LABELS[state.mode]) state.mode = "battleRoyale";
        const sort = params.get("sort");
        if (SORT_LABELS[sort]) state.sort = sort;
        state.page = 1;
        return;
    }

    const ticketId = params.get("ticket");
    if (ticketId) {
        state.view = "ticket";
        state.feedback.selectedTicketId = ticketId;
        state.selectedId = null;
        state.profilePreviewOpen = false;
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
    setRouteHash(hash);
}

function setRouteHash(hash) {
    if (window.location.hash.replace(/^#/, "") === hash) return false;
    window.location.hash = hash;
    return true;
}

function enforceProtectedAdminRoute() {
    if (!state.authReady || isPlaytestAdmin()) return;
    const protectedView = state.view;
    if (!["store", "adminHelp", "adminTickets", "adminProgression", "communityAdmin"].includes(protectedView)) return;

    let hash = "";
    if (protectedView === "adminTickets") {
        state.view = "feedback";
        hash = "#feedback";
    } else if (protectedView === "communityAdmin") {
        state.view = "playtests";
        hash = "#playtests";
    } else {
        state.view = "home";
    }

    state.store.pendingPurchase = null;
    state.store.checkoutStatus = "";
    state.store.checkoutSessionId = "";
    window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}${hash}`);
}

function routeTo(route) {
    state.accountPanelOpen = false;
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
        if (!setRouteHash("help")) render();
        return;
    }
    if (route === "how-to-play" || route === "faq") {
        state.view = "home";
        state.pendingScrollTarget = route;
        if (!setRouteHash(route)) render();
        return;
    }
    if (route === "admin-help") {
        if (!isPlaytestAdmin()) {
            state.view = "home";
            window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
            render();
            return;
        }
        state.view = "adminHelp";
        state.selectedId = null;
        state.profilePreviewOpen = false;
        if (!setRouteHash("admin-help")) render();
        return;
    }
    if (route === "feedback") {
        state.view = "feedback";
        state.selectedId = null;
        state.profilePreviewOpen = false;
        if (!setRouteHash("feedback")) render();
        return;
    }
    if (route === "admin-tickets") {
        if (!isPlaytestAdmin()) {
            state.view = "feedback";
            state.selectedId = null;
            state.profilePreviewOpen = false;
            if (!setRouteHash("feedback")) render();
            return;
        }
        state.view = "adminTickets";
        state.selectedId = null;
        state.profilePreviewOpen = false;
        if (!setRouteHash("admin-tickets")) render();
        return;
    }
    if (route === "admin-progression") {
        if (!isPlaytestAdmin()) {
            state.view = "home";
            state.selectedId = null;
            state.profilePreviewOpen = false;
            window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
            render();
            return;
        }
        state.view = "adminProgression";
        state.selectedId = null;
        state.profilePreviewOpen = false;
        if (!setRouteHash("admin-progression")) render();
        return;
    }
    if (route === "playtests") {
        state.view = "playtests";
        state.selectedId = null;
        state.profilePreviewOpen = false;
        if (!setRouteHash("playtests")) render();
        return;
    }
    if (route === "account") {
        state.view = "account";
        state.selectedId = null;
        state.profilePreviewOpen = false;
        if (!setRouteHash("account")) render();
        return;
    }
    if (route === "store") {
        if (!isPlaytestAdmin()) {
            state.view = "home";
            state.selectedId = null;
            state.profilePreviewOpen = false;
            window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
            render();
            return;
        }
        state.view = "store";
        state.selectedId = null;
        state.profilePreviewOpen = false;
        if (!setRouteHash("store")) render();
        return;
    }
    if (route === "community-dates") {
        if (!isPlaytestAdmin()) {
            state.view = "playtests";
            state.selectedId = null;
            state.profilePreviewOpen = false;
            if (!setRouteHash("playtests")) render();
            return;
        }
        state.view = "communityAdmin";
        state.selectedId = null;
        state.profilePreviewOpen = false;
        if (!setRouteHash("community-dates")) render();
        return;
    }
    if (route === "weapons") {
        routeToLeaderboard({ mainView: "weapons", mode: "battleRoyale", sort: "kills" });
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
    if (PUBLIC_MODE_LABELS[options.mode]) state.mode = options.mode;
    if (!PUBLIC_MODE_LABELS[state.mode]) state.mode = "battleRoyale";
    if (SORT_LABELS[options.sort]) state.sort = options.sort;
    state.page = 1;
    const hash = `view=leaderboards&board=${encodeURIComponent(state.mainView)}&mode=${encodeURIComponent(state.mode)}&sort=${encodeURIComponent(state.sort)}`;
    if (!setRouteHash(hash)) render();
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
    try {
        const { data: existing, error: selectError, extended, cosmeticsExtended } = await selectOwnProfile(user.id);
        state.authProfileExtended = extended;
        state.authCosmeticInventoryExtended = cosmeticsExtended;
        if (selectError) throw selectError;

        if (existing) {
            const updatePayload = { username, avatar_url: avatarUrl || null };
            if (state.authProfileExtended && !existing.display_name) updatePayload.display_name = username;
            const { data, error } = await state.authClient
                .from("profiles")
                .update(updatePayload)
                .eq("id", user.id)
                .select(ownProfileSelectColumns())
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
                avatar_url: avatarUrl || null,
                ...(state.authProfileExtended ? { display_name: username, avatar_source: "discord" } : {})
            })
            .select(ownProfileSelectColumns())
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

async function selectOwnProfile(userId) {
    const extendedResult = await state.authClient
        .from("profiles")
        .select(PROFILE_SELECT_COLUMNS)
        .eq("id", userId)
        .maybeSingle();
    if (!extendedResult.error) return { ...extendedResult, extended: true, cosmeticsExtended: true };

    const legacyResult = await state.authClient
        .from("profiles")
        .select(PROFILE_SELECT_COLUMNS_LEGACY)
        .eq("id", userId)
        .maybeSingle();
    if (!legacyResult.error) return { ...legacyResult, extended: true, cosmeticsExtended: false };

    const baseResult = await state.authClient
        .from("profiles")
        .select(PROFILE_BASE_COLUMNS)
        .eq("id", userId)
        .maybeSingle();
    return { ...baseResult, extended: false, cosmeticsExtended: false };
}

function ownProfileSelectColumns() {
    if (!state.authProfileExtended) return PROFILE_BASE_COLUMNS;
    return state.authCosmeticInventoryExtended ? PROFILE_SELECT_COLUMNS : PROFILE_SELECT_COLUMNS_LEGACY;
}

async function loadAccountProfiles() {
    if (!state.authClient) {
        state.accountProfiles = [];
        state.accountProfilesReady = true;
        rebuildAccountProfileIndex();
        return;
    }

    try {
        const [{ data, error }, inventoryResult] = await Promise.all([
            fetchPublicProfiles({ limit: 1000 }),
            fetchPublicCosmeticInventory()
        ]);
        if (error) throw error;
        const inventoryRows = inventoryResult.error ? [] : inventoryResult.data;
        state.accountProfiles = attachCosmeticInventory(Array.isArray(data) ? data : [], inventoryRows);
        if (state.authProfile) {
            state.authProfile = attachCosmeticInventory([state.authProfile], inventoryRows)[0] || state.authProfile;
        }
        state.accountProfilesReady = true;
        rebuildAccountProfileIndex();
    } catch (error) {
        console.warn("Could not load account profiles", error);
        state.accountProfiles = state.authProfile ? [state.authProfile] : [];
        state.accountProfilesReady = true;
        rebuildAccountProfileIndex();
    }

    // Stats and public account data load independently. Refresh account-backed
    // surfaces when the latter arrives so an already-open preview is not stale.
    if (state.data) render();
}

function resetAccountGiftState() {
    state.accountGifts = [];
    state.accountGiftsLoaded = false;
    state.accountCosmeticRevocations = new Set();
}

async function loadOwnCosmeticGifts({ force = false } = {}) {
    if (!state.progression.api || !state.authSession?.user || (state.accountGiftsLoaded && !force)) return;
    try {
        const [giftResult, revocationResult] = await Promise.all([
            state.progression.api.listOwnCosmeticGifts(),
            state.progression.api.listOwnCosmeticRevocations()
        ]);
        if (giftResult.error) throw giftResult.error;
        state.accountGifts = (Array.isArray(giftResult.data) ? giftResult.data : []).map((gift) => ({
            type: String(gift?.cosmetic_type || ""),
            id: String(gift?.cosmetic_id || ""),
            source: String(gift?.grant_source || ""),
            note: String(gift?.gift_note || "").trim().slice(0, 200),
            acquiredAt: String(gift?.acquired_at || "")
        })).filter((gift) => gift.type && gift.id);
        state.accountCosmeticRevocations = new Set(
            (Array.isArray(revocationResult.data) ? revocationResult.data : [])
                .map((entry) => cosmeticCatalogKey(entry?.cosmetic_type, entry?.cosmetic_id))
                .filter((key) => key !== ":")
        );
        if (revocationResult.error && !["42883", "PGRST202"].includes(String(revocationResult.error.code || ""))) {
            console.warn("Could not load cosmetic revocations", revocationResult.error);
        }
        state.accountGiftsLoaded = true;
    } catch (error) {
        const code = String(error?.code || "");
        if (!["42883", "PGRST202"].includes(code)) console.warn("Could not load cosmetic gifts", error);
        state.accountGifts = [];
        state.accountCosmeticRevocations = new Set();
        state.accountGiftsLoaded = true;
    }
}

async function fetchPublicCosmeticInventory() {
    if (!state.authClient) return { data: [], error: null };
    return state.authClient
        .from(PUBLIC_COSMETIC_INVENTORY_VIEW)
        .select("profile_id, cosmetic_type, cosmetic_id, acquired_at")
        .limit(10000);
}

function attachCosmeticInventory(profiles, inventoryRows) {
    const byProfile = new Map();
    for (const row of Array.isArray(inventoryRows) ? inventoryRows : []) {
        if (!row?.profile_id || !row.cosmetic_type || !row.cosmetic_id) continue;
        if (!byProfile.has(row.profile_id)) byProfile.set(row.profile_id, []);
        byProfile.get(row.profile_id).push({
            type: String(row.cosmetic_type),
            id: String(row.cosmetic_id),
            acquiredAt: row.acquired_at || ""
        });
    }
    return profiles.map((profile) => ({
        ...profile,
        cosmetic_inventory: byProfile.get(profile.id) || []
    }));
}

async function loadRemotePlaytests(options = {}) {
    const shouldRender = options.render !== false;
    const silent = Boolean(options.silent);
    if (!state.authClient) {
        state.playtests.remotePlaytests = [];
        state.playtests.remoteLoading = false;
        return false;
    }

    state.playtests.remoteLoading = true;
    if (!silent && shouldRender) render();

    try {
        const { data: playtestRows, error: playtestError } = await state.authClient
            .from("playtests")
            .select(PLAYTEST_SELECT_COLUMNS)
            .is("archived_at", null)
            .order("created_at", { ascending: false });
        if (playtestError) throw playtestError;

        const playtestIds = [...new Set((playtestRows || []).map((row) => row.id).filter(Boolean))];
        let slotRows = [];
        let availabilityRows = [];
        let subscriptionRows = [];

        if (playtestIds.length) {
            const { data: slots, error: slotError } = await state.authClient
                .from("playtest_slots")
                .select(PLAYTEST_SLOT_SELECT_COLUMNS)
                .in("playtest_id", playtestIds)
                .order("start_datetime", { ascending: true });
            if (slotError) throw slotError;
            slotRows = Array.isArray(slots) ? slots : [];

            const { data: availability, error: availabilityError } = await state.authClient
                .from("availability")
                .select(AVAILABILITY_SELECT_COLUMNS)
                .in("playtest_id", playtestIds);
            if (availabilityError) throw availabilityError;
            availabilityRows = Array.isArray(availability) ? availability : [];

            if (isDiscordLoggedIn()) {
                const { data: subscriptions, error: subscriptionError } = await state.authClient
                    .from("playtest_notification_subscriptions")
                    .select(NOTIFICATION_SELECT_COLUMNS)
                    .in("playtest_id", playtestIds);
                if (subscriptionError) throw subscriptionError;
                subscriptionRows = Array.isArray(subscriptions) ? subscriptions : [];
            }
        }

        const profileMap = await loadProfilesForVoteRows(availabilityRows);
        const remotePlaytests = mapRemotePlaytests(playtestRows || [], slotRows, availabilityRows, profileMap);
        state.playtests.remotePlaytests = remotePlaytests;
        state.playtests.remoteLoadedAt = new Date().toISOString();
        state.playtests.remoteError = "";
        syncRemoteConfirmations(remotePlaytests);
        syncRemoteUserVotes(remotePlaytests);
        syncRemoteSubscriptions(playtestIds, subscriptionRows);

        if (!activePlaytests().some((playtest) => playtest.id === state.playtests.activeId)) {
            state.playtests.activeId = activePlaytests()[0]?.id || "";
        }
        savePlaytestState();
        return true;
    } catch (error) {
        console.warn("Could not load Supabase playtests", error);
        state.playtests.remotePlaytests = [];
        state.playtests.remoteError = remotePlaytestErrorMessage(error);
        return false;
    } finally {
        state.playtests.remoteLoading = false;
        if (shouldRender) render();
    }
}

async function loadProfilesForVoteRows(availabilityRows) {
    const userIds = [...new Set((availabilityRows || []).map((row) => row.user_id).filter(Boolean))];
    if (!userIds.length || !state.authClient) return new Map();

    const extended = await fetchPublicProfiles({ userIds });
    let rows = extended.data;
    if (extended.error) {
        const base = await state.authClient
            .from("profiles")
            .select("id, username, avatar_url, created_at")
            .in("id", userIds);
        rows = base.error ? [] : base.data;
    }

    return new Map((rows || []).map((profile) => [profile.id, profile]));
}

async function fetchPublicProfiles({ userIds = null, limit = 0 } = {}) {
    if (!state.authClient) return { data: [], error: null };

    const run = async (table, columns) => {
        let query = state.authClient.from(table).select(columns);
        if (Array.isArray(userIds) && userIds.length) query = query.in("id", userIds);
        if (limit) query = query.limit(limit);
        return query;
    };

    const viewResult = await run(PUBLIC_PROFILE_TABLE, PUBLIC_PROFILE_SELECT_COLUMNS);
    if (!viewResult.error) return { ...viewResult, cosmeticsExtended: true };
    const legacyViewResult = await run(PUBLIC_PROFILE_TABLE, PUBLIC_PROFILE_SELECT_COLUMNS_LEGACY);
    if (!legacyViewResult.error) return { ...legacyViewResult, cosmeticsExtended: false };

    const profileResult = await run("profiles", PUBLIC_PROFILE_SELECT_COLUMNS);
    if (!profileResult.error) return { ...profileResult, cosmeticsExtended: true };
    const legacyProfileResult = await run("profiles", PUBLIC_PROFILE_SELECT_COLUMNS_LEGACY);
    return { ...legacyProfileResult, cosmeticsExtended: false };
}

function mapRemotePlaytests(playtestRows, slotRows, availabilityRows, profileMap) {
    const slotsByPlaytest = new Map();
    for (const row of slotRows || []) {
        const slot = remoteSlotToLocal(row);
        if (!slot) continue;
        if (!slotsByPlaytest.has(row.playtest_id)) slotsByPlaytest.set(row.playtest_id, []);
        slotsByPlaytest.get(row.playtest_id).push(slot);
    }

    const votesByPlaytest = new Map();
    for (const row of availabilityRows || []) {
        const vote = remoteAvailabilityToVote(row, profileMap);
        if (!vote) continue;
        if (!votesByPlaytest.has(row.playtest_id)) votesByPlaytest.set(row.playtest_id, {});
        const bySlot = votesByPlaytest.get(row.playtest_id);
        bySlot[row.slot_id] = bySlot[row.slot_id] || [];
        bySlot[row.slot_id].push(vote);
    }

    return (playtestRows || []).map((row) => {
        const slots = (slotsByPlaytest.get(row.id) || []).sort((a, b) => dateValue(a.startAt) - dateValue(b.startAt));
        const mainSlot = slots.find((slot) => slot.id === row.main_slot_id) || slots.find((slot) => slot.isMain) || slots[0] || null;
        return {
            id: String(row.id),
            title: String(row.title || "Community Playtest"),
            description: String(row.description || ""),
            status: ["upcoming", "voting", "closed", "finished"].includes(row.status) ? row.status : "voting",
            createdBy: row.created_by || "",
            createdAt: row.created_at || new Date().toISOString(),
            mainSlotId: mainSlot?.id || "",
            frozen: Boolean(row.votes_frozen),
            archived: Boolean(row.archived_at),
            remote: true,
            slots,
            remoteVotesBySlot: votesByPlaytest.get(row.id) || {}
        };
    }).filter((playtest) => !playtest.archived);
}

function remoteSlotToLocal(row) {
    if (!row?.id || !row.start_datetime) return null;
    return {
        id: String(row.id),
        label: String(row.label || (row.source === "community" ? "Community date" : "Featured date")),
        startAt: String(row.start_datetime),
        endAt: row.end_datetime ? String(row.end_datetime) : "",
        source: row.source === "community" ? "community" : "featured",
        isMain: Boolean(row.is_main),
        confirmedAt: row.confirmed_at || "",
        confirmedBy: row.confirmed_by || "",
        remote: true
    };
}

function remoteAvailabilityToVote(row, profileMap) {
    if (!row?.slot_id || !PLAYTEST_STATUS_OPTIONS.some((option) => option.id === row.status)) return null;
    const profile = profileMap.get(row.user_id) || {};
    const username = profile.display_name || profile.username || "Discord player";
    const startAt = row.available_start_datetime || "";
    const endAt = row.available_end_datetime || "";
    return {
        userId: row.user_id || "",
        username,
        status: row.status,
        updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
        modePreference: dbModePreferenceToLabel(row.mode_preference),
        startTime: localTimeKey(startAt),
        endTime: localTimeKey(endAt),
        availableStartAt: startAt,
        availableEndAt: endAt
    };
}

function syncRemoteConfirmations(playtests) {
    for (const playtest of playtests || []) {
        const confirmations = {};
        for (const slot of playtest.slots || []) {
            if (!slot.confirmedAt) continue;
            confirmations[slot.id] = {
                confirmedAt: slot.confirmedAt,
                confirmedBy: slot.confirmedBy || "",
                startAt: slot.startAt,
                endAt: slot.endAt || slot.startAt
            };
        }
        if (Object.keys(confirmations).length) {
            state.playtests.confirmedSlots[playtest.id] = confirmations;
        } else {
            delete state.playtests.confirmedSlots[playtest.id];
        }
    }
}

function syncRemoteUserVotes(playtests) {
    for (const playtest of playtests || []) {
        delete state.playtests.votes[playtest.id];
        if (!isDiscordLoggedIn()) continue;
        for (const slot of playtest.slots || []) {
            const ownVote = (playtest.remoteVotesBySlot?.[slot.id] || []).find((vote) => vote.userId === PLAYTEST_VIEWER.userId);
            if (!ownVote) continue;
            state.playtests.votes[playtest.id] = state.playtests.votes[playtest.id] || {};
            state.playtests.votes[playtest.id][slot.id] = ownVote;
        }
    }
}

function syncRemoteSubscriptions(playtestIds, subscriptionRows) {
    for (const playtestId of playtestIds || []) {
        delete state.playtests.notificationSubscriptions[playtestId];
    }
    if (!isDiscordLoggedIn()) return;
    for (const row of subscriptionRows || []) {
        if (!row?.playtest_id || !row.slot_id || row.notify_on_confirmation === false) continue;
        state.playtests.notificationSubscriptions[row.playtest_id] = state.playtests.notificationSubscriptions[row.playtest_id] || {};
        state.playtests.notificationSubscriptions[row.playtest_id][row.slot_id] = {
            id: row.id,
            userId: row.user_id,
            username: PLAYTEST_VIEWER.username,
            discordId: PLAYTEST_VIEWER.discordId,
            createdAt: row.created_at || new Date().toISOString()
        };
    }
}

function remotePlaytestErrorMessage(error) {
    const message = String(error?.message || error || "");
    if (message.includes("playtests") || message.includes("schema cache")) {
        return "Playtest database tables are missing. Run the Supabase playtest schema, then refresh.";
    }
    return "Could not load the public playtest calendar from Supabase.";
}

function applyPlaytestProfile(profile) {
    state.authProfile = profile || null;
    rebuildAccountProfileIndex();
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
        metadata.user_name
        || metadata.username
        || metadata.preferred_username
        || identityData.user_name
        || identityData.username
        || identityData.preferred_username
        || metadata.global_name
        || metadata.full_name
        || metadata.name
        || identityData.global_name
        || identityData.full_name
        || identityData.name
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
    void syncWeeklyMissions();

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
                sum.mvp += stats.mvp;
                return sum;
            }, { kills: 0, wins: 0, games: 0, deaths: 0, mvp: 0 });
            return `${id}:${mode.totalPlayers || 0}:${mode.players?.length || 0}:${totals.wins}:${totals.kills}:${totals.games}:${totals.deaths}:${totals.mvp}`;
        })
        .join(",");
    const profileParts = (data.profiles || []).map((profile) => {
        const br = normalizeStats(profile.battleRoyale?.stats);
        const dm = normalizeStats(profile.deathmatch?.stats);
        const weaponParts = ["battleRoyale", "deathmatch"].flatMap((mode) => (
            (profile[mode]?.details?.weapons || []).map((weapon) => {
                const stats = normalizeStats(weapon.stats);
                return `${mode}:${weapon.id || weapon.label}:${stats.kills}:${stats.hits}:${stats.headshots}:${stats.headshotKills}:${stats.utilityKills}:${stats.vehicleKills}`;
            })
        )).join(";");
        const last = (profile.recentMatches || [])[0]?.endedAt || "";
        return `${profile.playerId}:${br.games}:${br.kills}:${br.wins}:${br.hits}:${br.headshots}:${br.headshotKills}:${br.mvp}:${br.playtimeSeconds}:${br.utilityKills}:${br.vehicleKills}:${dm.games}:${dm.kills}:${dm.wins}:${dm.hits}:${dm.headshots}:${dm.headshotKills}:${dm.mvp}:${dm.playtimeSeconds}:${dm.utilityKills}:${dm.vehicleKills}:${profile.recentMatches?.length || 0}:${last}:${weaponParts}`;
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

function emptyAccountProfileIndex() {
    return {
        ready: false,
        candidates: [],
        byId: new Map(),
        byPlayerId: new Map(),
        byName: new Map()
    };
}

function rebuildAccountProfileIndex() {
    const index = emptyAccountProfileIndex();
    const seen = new Set();
    state.cosmeticOwnershipCache.clear();

    for (const account of [state.authProfile, ...(state.accountProfiles || [])]) {
        if (!account?.id || seen.has(account.id)) continue;
        seen.add(account.id);
        index.candidates.push(account);
        index.byId.set(account.id, account);

        for (const id of [account.minecraft_player_id, account.minecraft_player_uuid]) {
            const key = String(id || "").trim();
            if (key && !index.byPlayerId.has(key)) index.byPlayerId.set(key, account);
        }

        for (const key of accountMinecraftNameKeys(account)) {
            if (key && !index.byName.has(key)) index.byName.set(key, account);
        }
    }

    index.ready = true;
    state.accountProfileIndex = index;
}

function rebuildCache() {
    const profiles = Array.isArray(state.data?.profiles) ? state.data.profiles : [];
    state.cosmeticOwnershipCache.clear();
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
    renderAccountWidget();
    renderAccountSidePanel();
    renderPlaytestConfirmationDialog();
    renderWeeklyMissionSwapDialog();
    renderStorePurchaseDialog();

    switch (state.view) {
        case "home":
            renderHome();
            break;
        case "playtests":
            renderPlaytests();
            break;
        case "communityAdmin":
            renderCommunityAdminPage();
            break;
        case "feedback":
            renderFeedbackPage();
            break;
        case "ticket":
            renderTicketDetailPage();
            break;
        case "adminTickets":
            renderAdminTicketsPage();
            break;
        case "adminProgression":
            renderProgressionAdminPage();
            break;
        case "adminHelp":
            renderAdminDocumentationPage();
            break;
        case "account":
            renderAccountPage();
            break;
        case "store":
            renderStorePage();
            break;
        case "leaderboard":
            renderLeaderboardView();
            break;
        default:
            break;
    }

    renderCosmeticPicker();
    renderRoute();
}

function renderLeaderboardView() {
    renderMainViewTabs();
    renderModeTabs();
    renderSummary();
    renderTable();
    renderSortHeaders();
    renderProfilePreview();
}

function renderRoute() {
    document.body.classList.toggle("home-route", state.view === "home");
    document.body.classList.toggle("store-route", state.view === "store");
    document.body.classList.toggle(
        "progression-modal-open",
        state.view === "adminProgression" && progressionEditorOpen()
    );
    document.getElementById("home-view").classList.toggle("hidden", state.view !== "home");
    document.getElementById("admin-help-view").classList.toggle("hidden", state.view !== "adminHelp");
    document.getElementById("playtests-view").classList.toggle("hidden", state.view !== "playtests");
    document.getElementById("feedback-view").classList.toggle("hidden", state.view !== "feedback");
    document.getElementById("ticket-view").classList.toggle("hidden", state.view !== "ticket");
    document.getElementById("admin-tickets-view").classList.toggle("hidden", state.view !== "adminTickets");
    document.getElementById("admin-progression-view").classList.toggle("hidden", state.view !== "adminProgression");
    document.getElementById("community-admin-view").classList.toggle("hidden", state.view !== "communityAdmin");
    document.getElementById("account-view").classList.toggle("hidden", state.view !== "account");
    document.getElementById("store-view").classList.toggle("hidden", state.view !== "store");
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
    const canSeeStore = isPlaytestAdmin();
    document.querySelectorAll("[data-admin-store-link]").forEach((link) => {
        link.hidden = !canSeeStore;
        link.classList.toggle("hidden", !canSeeStore);
        link.setAttribute("aria-hidden", canSeeStore ? "false" : "true");
        if ("disabled" in link) link.disabled = !canSeeStore;
    });
    const storeButton = document.querySelector(".store-float");
    if (!storeButton) return;
    const active = canSeeStore && state.view === "store";
    storeButton.classList.toggle("active", active);
    storeButton.setAttribute("aria-current", active ? "page" : "false");
}

function renderAccountWidget() {
    const container = document.getElementById("account-widget");
    if (!container) return;

    if (!state.authClient) {
        container.innerHTML = `<button type="button" disabled title="${escapeHtml(state.authMessage || "Discord login is not configured.")}">Login</button>`;
        return;
    }

    if (!state.authReady) {
        container.innerHTML = `<button type="button" disabled>Checking...</button>`;
        return;
    }

    if (!isDiscordLoggedIn()) {
        container.innerHTML = `<button type="button" data-auth-login>Login</button>`;
        return;
    }

    const account = state.authProfile || {};
    const profile = linkedStatsProfile();
    const avatarUrl = accountAvatarUrl(account, profile, 64);
    const name = accountDisplayName(account);
    container.innerHTML = `
        <button class="account-pill" type="button" data-account-panel-open aria-label="${escapeHtml(`Open profile panel for ${name}`)}" aria-expanded="${state.accountPanelOpen ? "true" : "false"}">
            <span class="account-avatar-frame ${avatarFrameClass(account)}"${avatarFrameStyle(account)} ${avatarCosmeticOwnershipDataAttributes(account)}>
                ${renderAvatarImage(avatarUrl, account, profile, 64, "eager")}
            </span>
            <span>${escapeHtml(name)}</span>
        </button>
    `;
}

function openAccountSidePanel() {
    if (!isDiscordLoggedIn()) return;
    state.accountPanelOpen = true;
    renderAccountWidget();
    renderAccountSidePanel();
    void syncWeeklyMissions();
    window.requestAnimationFrame(() => {
        document.querySelector("[data-account-panel-close]")?.focus();
    });
}

function closeAccountSidePanel() {
    state.accountPanelOpen = false;
    renderAccountWidget();
    renderAccountSidePanel();
    window.requestAnimationFrame(() => {
        document.querySelector("[data-account-panel-open]")?.focus();
    });
}

function renderAccountSidePanel() {
    let host = document.getElementById("account-side-panel-host");
    if (!host) {
        host = document.createElement("div");
        host.id = "account-side-panel-host";
        document.body.appendChild(host);
    }

    const open = state.accountPanelOpen && isDiscordLoggedIn();
    document.body.classList.toggle("account-drawer-open", open);
    if (!open) {
        host.innerHTML = "";
        return;
    }

    const account = state.authProfile || {};
    const profile = linkedStatsProfile();
    const avatarUrl = accountAvatarUrl(account, profile, 72);
    const previousScrollTop = host.querySelector(".profile-drawer")?.scrollTop || 0;
    host.innerHTML = `
        <div class="profile-drawer-backdrop" data-account-panel-backdrop>
            <aside class="profile-drawer" role="dialog" aria-modal="true" aria-labelledby="profile-drawer-title">
                <header class="profile-drawer-header">
                    <h2 id="profile-drawer-title">PROFILE</h2>
                    <button class="profile-drawer-close" type="button" data-account-panel-close aria-label="Close profile panel">&times;</button>
                </header>
                <div class="profile-drawer-identity">
                    <span class="account-avatar-frame ${avatarFrameClass(account)}"${avatarFrameStyle(account)} ${avatarCosmeticOwnershipDataAttributes(account)}>
                        ${renderAvatarImage(avatarUrl, account, profile, 72, "eager")}
                    </span>
                    <div>
                        <strong>${escapeHtml(accountDisplayName(account))}</strong>
                        ${renderProfileTitle(account, { compact: true })}
                        ${renderAccountLevelPill(account)}
                    </div>
                </div>
                <div class="profile-drawer-actions ${isPlaytestAdmin() ? "admin" : ""}">
                    <button class="profile-drawer-customize" type="button" data-route="account">Customize profile</button>
                    <button class="profile-drawer-support" type="button" data-route="feedback">Feedback &amp; support</button>
                    ${isPlaytestAdmin() ? `
                        <button class="profile-drawer-tickets" type="button" data-route="admin-tickets">Ticket dashboard</button>
                        <button class="profile-drawer-progression" type="button" data-route="admin-progression">Progression &amp; missions</button>
                        <button class="profile-drawer-docs" type="button" data-route="admin-help">Admin documentation</button>
                        <button class="profile-drawer-store" type="button" data-route="store">Open store admin</button>
                    ` : ""}
                </div>
                ${renderAccountGifts()}
                ${renderWeeklyMissions(profile)}
            </aside>
        </div>
    `;
    const drawer = host.querySelector(".profile-drawer");
    if (drawer) drawer.scrollTop = previousScrollTop;
}

function renderAccountGifts() {
    if (!state.accountGiftsLoaded || !state.accountGifts.length) return "";
    return `
        <section class="profile-drawer-gifts">
            <header><p class="panel-kicker">Gifts</p><strong>${escapeHtml(state.accountGifts.length)}</strong></header>
            <div>
                ${state.accountGifts.map((gift) => {
                    const cosmetic = progressionCatalogItem(`${gift.type}:${gift.id}`);
                    return `
                        <article>
                            <strong>${escapeHtml(cosmetic?.name || cosmetic?.label || gift.id)}</strong>
                            ${gift.note ? `<span>${escapeHtml(gift.note)}</span>` : ""}
                            <small>${escapeHtml(gift.acquiredAt ? formatFullLocalDate(gift.acquiredAt) : gift.source === "friend" ? "Friend gift" : "Admin gift")}</small>
                        </article>
                    `;
                }).join("")}
            </div>
        </section>
    `;
}

function renderAccountPage() {
    const body = document.getElementById("account-body");
    if (!body) return;

    if (!state.authClient) {
        body.innerHTML = renderAccountLoginPanel("Discord login is not configured for this site yet.");
        return;
    }

    if (!isDiscordLoggedIn()) {
        body.innerHTML = renderAccountLoginPanel("Login with Discord to connect your profile, notifications, and cosmetics.");
        return;
    }

    const account = state.authProfile || {};
    const linkedProfile = linkedStatsProfile();
    const badgeState = accountBadgeState(account, linkedProfile);
    const selectedBadges = selectedAccountBadges(account, badgeState);
    const avatarUrl = accountAvatarUrl(account, linkedProfile, 128);
    const linkedName = linkedProfile?.name || account.minecraft_player_name || "";
    const schemaNote = state.authProfileExtended
        ? ""
        : `<p class="account-warning">Run the updated Supabase schema to unlock profile customization and Minecraft linking on the website.</p>`;
    const cosmeticSchemaNote = state.authProfileExtended && !state.authCosmeticInventoryExtended
        ? `<p class="account-warning">Additional cosmetic inventory fields are not configured yet. Existing customization remains available.</p>`
        : "";

    body.innerHTML = `
        <section class="account-hero ${profileBackgroundClass(account)}"${profileBackgroundStyle(account)} ${backgroundCosmeticOwnershipDataAttributes(account)}>
            <div class="account-hero-main">
                <span class="account-avatar-large ${avatarFrameClass(account)}"${avatarFrameStyle(account)} ${avatarCosmeticOwnershipDataAttributes(account)}>
                    ${renderAvatarImage(avatarUrl, account, linkedProfile, 128, "eager")}
                </span>
                <div>
                    <p class="panel-kicker">Account</p>
                    <h2>${escapeHtml(accountDisplayName(account))}</h2>
                    ${renderProfileTitle(account)}
                    <p>${linkedName ? `Linked to ${escapeHtml(linkedName)}` : "Minecraft account not linked yet."}</p>
                    ${renderAccountSignedDate(account)}
                    ${renderAccountLevelPill(account)}
                    <div class="account-badge-row">
                        ${selectedBadges.length
                            ? selectedBadges.map((badge) => renderProfileBadge(badge)).join("")
                            : `<span class="profile-badge empty">No badges equipped</span>`}
                    </div>
                </div>
            </div>
            <div class="account-actions">
                ${linkedProfile ? `<a href="#player=${encodeURIComponent(linkedProfile.playerId)}&tab=overview">Open stats profile</a>` : ""}
                <button type="button" data-auth-sign-out>Sign out</button>
            </div>
        </section>

        ${schemaNote}
        ${cosmeticSchemaNote}
        ${state.accountMessage ? `<p class="identity-status account-message">${escapeHtml(state.accountMessage)}</p>` : ""}
        ${renderAccountLinkPanel(account, linkedProfile)}
        ${linkedProfile ? renderAccountStatsPanel(linkedProfile) : ""}
        ${renderAccountCustomizeForm(account, badgeState)}
    `;
}

function resetStoreSessionState({ resetCatalog = false } = {}) {
    state.store.items = STORE_OFFLINE_ITEMS;
    state.store.loaded = false;
    state.store.loading = false;
    state.store.backendReady = false;
    state.store.purchasingKey = "";
    state.store.pendingPurchase = null;
    state.store.message = "";
    state.store.checkoutFinalizing = false;
    if (resetCatalog) {
        state.store.catalogItems = [];
        state.store.catalogLoaded = false;
        state.store.catalogLoading = false;
        state.store.catalogReady = false;
        state.store.catalogProgressionReady = false;
        state.store.catalogMessage = "";
        state.store.editingKey = "";
    }
}

function resetFeedbackSessionState() {
    const feedback = state.feedback;
    feedbackDraftSession.reset();
    feedback.tickets = [];
    feedback.ticketsLoaded = false;
    feedback.ticketsLoading = false;
    feedback.adminTickets = [];
    feedback.adminTicketsLoaded = false;
    feedback.adminTicketsLoading = false;
    feedback.selectedTicket = null;
    feedback.selectedTicketId = state.view === "ticket"
        ? new URLSearchParams(window.location.hash.replace(/^#/, "")).get("ticket") || ""
        : "";
    feedback.detailLoading = false;
    feedback.detailLoadedId = "";
    feedback.attachment = { managed: false, loading: false, signedUrl: "", kind: "file", error: "" };
    feedback.messages = [];
    feedback.history = [];
    feedback.reporter = null;
    feedback.admins = [];
    feedback.adminMetadataLoaded = false;
    feedback.documentation = [];
    feedback.documentationLoaded = false;
    feedback.documentationLoading = false;
    feedback.submitting = false;
    feedback.replying = false;
    feedback.updating = false;
    feedback.cooldownUntil = 0;
    feedback.message = "";
    feedback.error = "";
    feedback.formErrors = {};
}

function resetProgressionAdminState() {
    const progression = state.progression;
    progression.loaded = false;
    progression.loading = false;
    progression.ready = false;
    progression.section = "cosmetics";
    progression.rules = [];
    progression.grants = [];
    progression.revocations = [];
    progression.profiles = [];
    progression.players = [];
    progression.playersReady = false;
    progression.playerSelectedId = "";
    progression.playerSearch = "";
    progression.playerCollectionFilter = "all";
    progression.playerCollectionSort = "ownership";
    progression.playerGrantKey = "";
    progression.playerRevokeKey = "";
    progression.playerBanOpen = false;
    progression.playerMessage = "";
    progression.playerError = "";
    progression.editorKey = "";
    progression.creating = false;
    progression.filterSearch = "";
    progression.filterType = "all";
    progression.showArchived = true;
    progression.weeklyTemplates = [];
    progression.weeklyReady = false;
    progression.weeklyEditorId = "";
    progression.creatingWeekly = false;
    progression.weeklyFilterSearch = "";
    progression.weeklyFilterDifficulty = "all";
    progression.weeklyShowArchived = true;
    progression.weeklyMessage = "";
    progression.weeklyError = "";
    progression.saving = false;
    progression.message = "";
    progression.error = "";
}

function renderFeedbackPage() {
    const body = document.getElementById("feedback-body");
    if (!body) return;
    const loggedIn = isDiscordLoggedIn();
    const userId = state.authSession?.user?.id || "";
    if (loggedIn && !state.feedback.ticketsLoaded && !state.feedback.ticketsLoading) {
        void loadOwnFeedbackTickets();
    }
    body.innerHTML = renderFeedbackContent({
        authConfigured: Boolean(state.feedback.api),
        authReady: state.authReady,
        loggedIn,
        loading: state.feedback.ticketsLoading,
        tickets: state.feedback.tickets,
        statusFilter: state.feedback.statusFilter,
        categoryFilter: state.feedback.categoryFilter,
        message: state.feedback.message,
        error: state.feedback.error
    });
    const form = body.querySelector("[data-feedback-create]");
    if (form && loggedIn && userId) feedbackDraftSession.attach(form);
}

async function loadOwnFeedbackTickets({ force = false } = {}) {
    const feedback = state.feedback;
    const userId = state.authSession?.user?.id;
    if (!feedback.api || !userId || feedback.ticketsLoading || (feedback.ticketsLoaded && !force)) return;
    feedback.ticketsLoading = true;
    feedback.error = "";
    if (state.view === "feedback") renderFeedbackPage();
    try {
        const result = await feedback.api.listOwnTickets(userId);
        if (result.error) throw result.error;
        feedback.tickets = Array.isArray(result.data) ? result.data : [];
        feedback.ticketsLoaded = true;
    } catch (error) {
        console.error("Could not load feedback tickets", error);
        feedback.error = feedbackErrorMessage(error, "Could not load your tickets.");
        feedback.ticketsLoaded = true;
    } finally {
        feedback.ticketsLoading = false;
        if (state.view === "feedback") renderFeedbackPage();
    }
}

async function submitFeedbackTicket(form) {
    const feedback = state.feedback;
    const userId = state.authSession?.user?.id;
    if (!feedback.api || !userId || feedback.submitting) return;
    const status = form.querySelector("[data-feedback-form-status]");
    const submit = form.querySelector("button[type='submit']");
    clearFeedbackFieldErrors(form);

    if (isCurrentAccountCommunityBanned()) {
        if (status) status.textContent = "This account is community banned and cannot submit tickets.";
        return;
    }

    if (Date.now() < feedback.cooldownUntil) {
        const seconds = Math.max(1, Math.ceil((feedback.cooldownUntil - Date.now()) / 1000));
        if (status) status.textContent = `Please wait ${seconds} seconds before submitting another ticket.`;
        return;
    }

    const values = new FormData(form);
    const validation = validateTicketInput(Object.fromEntries(values.entries()));
    const attachmentInput = form.elements.namedItem("attachment");
    const selectedAttachment = attachmentInput instanceof HTMLInputElement ? attachmentInput.files?.[0] : null;
    const restoredAttachment = feedbackDraftSession.attachment(userId);
    const attachmentFile = selectedAttachment || restoredAttachment;
    const attachmentValidation = validateFeedbackAttachment(attachmentFile);
    const errors = { ...validation.errors };
    if (!attachmentValidation.valid) errors.attachment = attachmentValidation.error;
    if (attachmentFile && validation.value.externalMediaUrl) {
        errors.attachment = "Choose either a direct attachment or an external URL, not both.";
        errors.externalMediaUrl = "Remove this URL to upload the selected attachment.";
    }
    if (Object.keys(errors).length) {
        applyFeedbackFieldErrors(form, errors);
        if (status) status.textContent = "Check the highlighted fields.";
        focusFirstFeedbackError(form, errors);
        return;
    }

    feedback.submitting = true;
    if (submit) {
        submit.disabled = true;
        submit.textContent = "Submitting...";
    }
    let uploadedPath = "";
    if (status) status.textContent = attachmentFile ? "Uploading private attachment..." : "Creating ticket...";
    try {
        const ticketId = createFeedbackTicketId();
        if (attachmentFile) {
            const upload = await uploadFeedbackAttachment(state.authClient, {
                file: attachmentFile,
                userId,
                ticketId
            });
            uploadedPath = upload.path;
            validation.value.externalMediaUrl = upload.storedUrl;
            if (status) status.textContent = "Creating ticket...";
        }
        const result = await feedback.api.createTicket(validation.value, userId, ticketId);
        if (result.error) throw result.error;
        try {
            await feedbackDraftSession.clear(userId);
        } catch (draftError) {
            console.warn("Could not clear the submitted feedback draft", draftError);
            feedbackDraftSession.reset();
        }
        feedback.cooldownUntil = Date.now() + TICKET_SUBMIT_COOLDOWN_MS;
        feedback.tickets = [result.data, ...feedback.tickets.filter((ticket) => ticket.id !== result.data.id)];
        feedback.ticketsLoaded = true;
        feedback.message = attachmentFile ? "Ticket and private attachment submitted." : "Ticket submitted.";
        feedback.error = "";
        form.reset();
        window.location.hash = `ticket=${encodeURIComponent(result.data.id)}`;
    } catch (error) {
        console.error("Could not create feedback ticket", error);
        const failedDuringUpload = Boolean(attachmentFile) && !uploadedPath;
        if (uploadedPath) await removeFeedbackAttachment(state.authClient, uploadedPath);
        if (status) {
            status.textContent = failedDuringUpload
                ? feedbackAttachmentErrorMessage(error)
                : feedbackErrorMessage(error, "Could not submit the ticket.");
        }
    } finally {
        feedback.submitting = false;
        if (submit) {
            submit.disabled = false;
            submit.textContent = "Submit ticket";
        }
    }
}

function clearFeedbackFieldErrors(form) {
    form.querySelectorAll("[data-feedback-field-error]").forEach((element) => {
        element.textContent = "";
    });
    form.querySelectorAll("[aria-invalid='true']").forEach((element) => element.removeAttribute("aria-invalid"));
}

function applyFeedbackFieldErrors(form, errors) {
    for (const [name, message] of Object.entries(errors)) {
        const field = form.elements.namedItem(name);
        if (field instanceof HTMLElement) field.setAttribute("aria-invalid", "true");
        const error = form.querySelector(`[data-feedback-field-error='${CSS.escape(name)}']`);
        if (error) error.textContent = message;
    }
}

function focusFirstFeedbackError(form, errors) {
    const firstName = Object.keys(errors)[0];
    const field = firstName ? form.elements.namedItem(firstName) : null;
    if (field instanceof HTMLElement) field.focus();
}

function renderTicketDetailPage() {
    const body = document.getElementById("ticket-detail-body");
    if (!body) return;
    const feedback = state.feedback;
    const ticketId = feedback.selectedTicketId;
    const loggedIn = isDiscordLoggedIn();
    if (loggedIn && isFeedbackTicketId(ticketId) && feedback.detailLoadedId !== ticketId && !feedback.detailLoading) {
        void loadFeedbackTicketDetail(ticketId);
    }
    const authorNames = feedbackAuthorNames();
    body.innerHTML = renderTicketDetailContent({
        authConfigured: Boolean(feedback.api),
        authReady: state.authReady,
        loggedIn,
        admin: isPlaytestAdmin(),
        loading: feedback.detailLoading || (loggedIn && feedback.detailLoadedId !== ticketId),
        ticket: feedback.selectedTicket,
        messages: feedback.messages,
        history: feedback.history,
        reporter: feedback.reporter,
        admins: feedback.admins,
        accountId: state.authSession?.user?.id || "",
        error: !isFeedbackTicketId(ticketId) ? "Invalid ticket ID." : feedback.error,
        message: feedback.message,
        authorNames,
        attachment: feedback.attachment
    });
}

async function loadFeedbackTicketDetail(ticketId, { force = false } = {}) {
    const feedback = state.feedback;
    if (!feedback.api || !state.authSession?.user || feedback.detailLoading) return;
    if (!force && feedback.detailLoadedId === ticketId) return;
    if (!isFeedbackTicketId(ticketId)) {
        feedback.error = "Invalid ticket ID.";
        feedback.detailLoadedId = ticketId;
        renderTicketDetailPage();
        return;
    }

    feedback.detailLoading = true;
    feedback.error = "";
    if (feedback.detailLoadedId !== ticketId) feedback.message = "";
    feedback.selectedTicket = null;
    feedback.messages = [];
    feedback.history = [];
    feedback.reporter = null;
    feedback.attachment = { managed: false, loading: false, signedUrl: "", kind: "file", error: "" };
    if (state.view === "ticket") renderTicketDetailPage();
    try {
        const ticketResult = await feedback.api.getTicket(ticketId);
        if (ticketResult.error) throw ticketResult.error;
        feedback.selectedTicket = ticketResult.data || null;
        if (!feedback.selectedTicket) {
            feedback.detailLoadedId = ticketId;
            return;
        }

        try {
            const attachment = await createFeedbackAttachmentView(
                state.authClient,
                feedback.selectedTicket.external_media_url
            );
            feedback.attachment = {
                managed: attachment.managed,
                loading: false,
                signedUrl: attachment.signedUrl,
                kind: attachment.kind,
                error: ""
            };
        } catch (error) {
            console.warn("Could not open private feedback attachment", error);
            feedback.attachment = {
                managed: true,
                loading: false,
                signedUrl: "",
                kind: "file",
                error: feedbackAttachmentErrorMessage(error)
            };
        }

        const messagesResult = await feedback.api.listMessages(ticketId);
        if (messagesResult.error) throw messagesResult.error;
        feedback.messages = Array.isArray(messagesResult.data) ? messagesResult.data : [];

        if (isPlaytestAdmin()) {
            const [historyResult, reporterResult, adminsResult] = await Promise.all([
                feedback.api.listHistory(ticketId),
                feedback.api.getReporter(feedback.selectedTicket.created_by),
                feedback.adminMetadataLoaded ? Promise.resolve({ data: feedback.admins, error: null }) : feedback.api.listAdmins()
            ]);
            if (historyResult.error) throw historyResult.error;
            feedback.history = Array.isArray(historyResult.data) ? historyResult.data : [];
            if (reporterResult.error) console.warn("Could not load ticket reporter", reporterResult.error);
            else feedback.reporter = reporterResult.data || null;
            if (adminsResult.error) console.warn("Could not load ticket administrators", adminsResult.error);
            else {
                feedback.admins = Array.isArray(adminsResult.data) ? adminsResult.data : [];
                feedback.adminMetadataLoaded = true;
            }
        }
        feedback.detailLoadedId = ticketId;
    } catch (error) {
        console.error("Could not load ticket detail", error);
        feedback.error = feedbackErrorMessage(error, "Could not load this ticket.");
        feedback.detailLoadedId = ticketId;
    } finally {
        feedback.detailLoading = false;
        if (state.view === "ticket") renderTicketDetailPage();
    }
}

async function submitTicketReply(form) {
    const feedback = state.feedback;
    const ticket = feedback.selectedTicket;
    const userId = state.authSession?.user?.id;
    if (!feedback.api || !ticket || !userId || feedback.replying) return;
    const textarea = form.elements.namedItem("message");
    const errorHost = form.querySelector("[data-ticket-reply-error]");
    const status = form.querySelector("[data-ticket-reply-status]");
    const submit = form.querySelector("button[type='submit']");
    if (isCurrentAccountCommunityBanned()) {
        if (status) status.textContent = "This account is community banned and cannot send replies.";
        return;
    }
    const validation = validateReplyInput(textarea?.value);
    if (errorHost) errorHost.textContent = validation.error;
    if (!validation.valid) {
        textarea?.setAttribute("aria-invalid", "true");
        textarea?.focus();
        return;
    }

    feedback.replying = true;
    textarea?.removeAttribute("aria-invalid");
    if (submit) {
        submit.disabled = true;
        submit.textContent = "Sending...";
    }
    if (status) status.textContent = "Sending reply...";
    try {
        const privateNote = isPlaytestAdmin() && Boolean(form.elements.namedItem("privateNote")?.checked);
        const result = await feedback.api.addMessage(ticket.id, userId, validation.value, {
            staff: isPlaytestAdmin(),
            privateNote
        });
        if (result.error) throw result.error;
        feedback.messages.push(result.data);
        feedback.message = privateNote ? "Private staff note added." : "Reply sent.";
        feedback.adminTicketsLoaded = false;
        form.reset();
        await loadFeedbackTicketDetail(ticket.id, { force: true });
    } catch (error) {
        console.error("Could not add ticket reply", error);
        if (status) status.textContent = feedbackErrorMessage(error, "Could not send the reply.");
    } finally {
        feedback.replying = false;
        if (submit) {
            submit.disabled = false;
            submit.textContent = isPlaytestAdmin() ? "Add staff message" : "Send reply";
        }
    }
}

async function updateUserTicketStatus(status) {
    const feedback = state.feedback;
    const ticket = feedback.selectedTicket;
    if (!feedback.api || !ticket || feedback.updating || isPlaytestAdmin()) return;
    const allowed = status === "closed"
        ? USER_CLOSABLE_TICKET_STATUSES.includes(ticket.status)
        : status === "open" && USER_REOPENABLE_TICKET_STATUSES.includes(ticket.status);
    if (!allowed) return;
    if (status === "closed" && !window.confirm("Close this ticket? You can reopen it later.")) return;
    feedback.updating = true;
    try {
        const result = await feedback.api.updateTicket(ticket.id, { status });
        if (result.error) throw result.error;
        feedback.selectedTicket = result.data;
        feedback.message = status === "closed" ? "Ticket closed." : "Ticket reopened.";
        feedback.ticketsLoaded = false;
        feedback.detailLoadedId = ticket.id;
    } catch (error) {
        console.error("Could not change ticket status", error);
        feedback.error = feedbackErrorMessage(error, "Could not update the ticket.");
    } finally {
        feedback.updating = false;
        renderTicketDetailPage();
    }
}

async function submitAdminTicketUpdate(form) {
    const feedback = state.feedback;
    const ticket = feedback.selectedTicket;
    if (!feedback.api || !ticket || !isPlaytestAdmin() || feedback.updating) return;
    const values = new FormData(form);
    const statusValue = String(values.get("status") || "");
    const severity = String(values.get("severity") || "");
    const assignedAdmin = String(values.get("assignedAdmin") || "") || null;
    const statusHost = form.querySelector("[data-admin-ticket-status]");
    const submit = form.querySelector("button[type='submit']");
    if (["closed", "rejected"].includes(statusValue) && statusValue !== ticket.status
        && !window.confirm(`Change this ticket to ${ticketStatusLabel(statusValue)}?`)) return;

    feedback.updating = true;
    if (submit) {
        submit.disabled = true;
        submit.textContent = "Saving...";
    }
    if (statusHost) statusHost.textContent = "Saving admin changes...";
    try {
        const result = await feedback.api.updateTicket(ticket.id, { status: statusValue, severity, assignedAdmin });
        if (result.error) throw result.error;
        feedback.selectedTicket = result.data;
        feedback.message = "Admin changes saved.";
        feedback.adminTicketsLoaded = false;
        feedback.detailLoadedId = "";
        await loadFeedbackTicketDetail(ticket.id, { force: true });
    } catch (error) {
        console.error("Could not update ticket", error);
        if (statusHost) statusHost.textContent = feedbackErrorMessage(error, "Could not save admin changes.");
    } finally {
        feedback.updating = false;
        if (submit) {
            submit.disabled = false;
            submit.textContent = "Save admin changes";
        }
    }
}

function renderAdminTicketsPage() {
    const body = document.getElementById("admin-tickets-body");
    if (!body) return;
    if (!state.authReady) {
        body.innerHTML = renderAdminTicketsContent({ loading: true, tickets: [], filters: adminTicketFilters(), counts: emptyAdminTicketCounts(), error: "" });
        return;
    }
    if (!isPlaytestAdmin()) {
        enforceProtectedAdminRoute();
        return;
    }
    if (!state.feedback.adminTicketsLoaded && !state.feedback.adminTicketsLoading) void loadAdminFeedbackTickets();
    body.innerHTML = renderAdminTicketsContent({
        loading: state.feedback.adminTicketsLoading,
        tickets: filteredAdminFeedbackTickets(),
        filters: adminTicketFilters(),
        counts: adminTicketCounts(state.feedback.adminTickets),
        error: state.feedback.error
    });
}

async function loadAdminFeedbackTickets({ force = false } = {}) {
    const feedback = state.feedback;
    if (!feedback.api || !isPlaytestAdmin() || feedback.adminTicketsLoading || (feedback.adminTicketsLoaded && !force)) return;
    feedback.adminTicketsLoading = true;
    feedback.error = "";
    if (state.view === "adminTickets") renderAdminTicketsPage();
    try {
        const result = await feedback.api.listAdminTickets();
        if (result.error) throw result.error;
        feedback.adminTickets = (Array.isArray(result.data) ? result.data : []).map((ticket) => ({
            ...ticket,
            reporterLabel: feedbackReporterLabel(ticket.created_by)
        }));
        feedback.adminTicketsLoaded = true;
    } catch (error) {
        console.error("Could not load admin tickets", error);
        feedback.error = feedbackErrorMessage(error, "Could not load support tickets.");
        feedback.adminTicketsLoaded = true;
    } finally {
        feedback.adminTicketsLoading = false;
        if (state.view === "adminTickets") renderAdminTicketsPage();
    }
}

function adminTicketFilters() {
    return {
        search: state.feedback.search,
        category: state.feedback.categoryFilter,
        status: state.feedback.statusFilter,
        severity: state.feedback.severityFilter,
        sort: state.feedback.sort,
        hideClosed: state.feedback.hideClosed
    };
}

function filteredAdminFeedbackTickets() {
    const feedback = state.feedback;
    const query = feedback.search.trim().toLowerCase();
    const rows = feedback.adminTickets.filter((ticket) => {
        if (feedback.hideClosed && feedback.statusFilter === "all" && ticket.status === "closed") return false;
        if (feedback.categoryFilter !== "all" && ticket.category !== feedback.categoryFilter) return false;
        if (feedback.statusFilter !== "all" && ticket.status !== feedback.statusFilter) return false;
        if (feedback.severityFilter !== "all" && ticket.severity !== feedback.severityFilter) return false;
        if (!query) return true;
        return [
            ticket.id,
            ticket.title,
            ticket.reporterLabel,
            ticket.map_name,
            ticket.weapon_or_item,
            ticket.match_id
        ].some((value) => String(value || "").toLowerCase().includes(query));
    });

    return [...rows].sort((a, b) => {
        if (feedback.sort === "oldest") return dateValue(a.created_at) - dateValue(b.created_at);
        if (feedback.sort === "newest") return dateValue(b.created_at) - dateValue(a.created_at);
        if (feedback.sort === "severity") {
            const severity = ticketSeverityRank(b.severity) - ticketSeverityRank(a.severity);
            return severity || dateValue(b.updated_at) - dateValue(a.updated_at);
        }
        return dateValue(b.updated_at) - dateValue(a.updated_at);
    });
}

function adminTicketCounts(tickets) {
    const finalStatuses = new Set(["resolved", "closed", "rejected"]);
    return {
        open: tickets.filter((ticket) => !finalStatuses.has(ticket.status)).length,
        needInfo: tickets.filter((ticket) => ticket.status === "need_more_information").length,
        confirmed: tickets.filter((ticket) => ticket.status === "confirmed").length,
        planned: tickets.filter((ticket) => ticket.status === "planned").length,
        resolved: tickets.filter((ticket) => ticket.status === "resolved").length,
        highPriority: tickets.filter((ticket) => ["high", "critical"].includes(ticket.severity)).length
    };
}

function emptyAdminTicketCounts() {
    return { open: 0, needInfo: 0, confirmed: 0, planned: 0, resolved: 0, highPriority: 0 };
}

function feedbackReporterLabel(userId) {
    const account = state.accountProfileIndex?.byId?.get(userId)
        || state.accountProfiles.find((profile) => profile.id === userId)
        || (state.authProfile?.id === userId ? state.authProfile : null);
    return account ? accountDisplayName(account) : "Unknown player";
}

function feedbackAuthorNames() {
    const names = new Map();
    if (state.authProfile?.id) names.set(state.authProfile.id, accountDisplayName(state.authProfile));
    if (state.feedback.reporter?.id) {
        names.set(state.feedback.reporter.id, state.feedback.reporter.display_name || state.feedback.reporter.username || "Reporter");
    }
    for (const admin of state.feedback.admins) {
        names.set(admin.id, admin.display_name || admin.username || "Administrator");
    }
    return names;
}

function isFeedbackTicketId(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function feedbackErrorMessage(error, fallback) {
    const code = String(error?.code || "");
    const message = String(error?.message || "");
    if (["42P01", "PGRST205"].includes(code) || /feedback_(tickets|ticket_messages)/i.test(message) && /not find|does not exist/i.test(message)) {
        return "Feedback is temporarily unavailable because its database setup is incomplete.";
    }
    if (code === "42501" || /permission|row-level security|not authorized/i.test(message)) {
        return "This account does not have permission to perform that ticket action.";
    }
    if (/wait|already submitted|already sent|reopen the ticket/i.test(message)) return message;
    if (/jwt|session|token/i.test(message)) return "Your Discord session expired. Sign in again.";
    return fallback;
}

async function copyTicketText(value, successMessage) {
    try {
        await navigator.clipboard.writeText(value);
        state.feedback.message = successMessage;
        renderTicketDetailPage();
    } catch (error) {
        console.error("Could not copy ticket text", error);
        state.feedback.error = "Could not copy to the clipboard.";
        renderTicketDetailPage();
    }
}

function ticketSummaryText(ticket) {
    if (!ticket) return "";
    return [
        `[${ticketSeverityLabel(ticket.severity)}] ${ticket.title}`,
        `Ticket: ${ticket.id}`,
        `Status: ${ticketStatusLabel(ticket.status)}`,
        `Category: ${ticketCategoryLabel(ticket.category)}`,
        `Area: ${ticketContextLabel(ticket.context_area)}`,
        ticket.map_name ? `Map: ${ticket.map_name}` : "",
        ticket.weapon_or_item ? `Weapon/item: ${ticket.weapon_or_item}` : "",
        ticket.match_id ? `Match ID: ${ticket.match_id}` : "",
        "",
        ticket.description
    ].filter((line, index, lines) => line || (index > 0 && index < lines.length - 1)).join("\n");
}

function renderAdminDocumentationPage() {
    const body = document.getElementById("admin-documentation-body");
    if (!body) return;
    if (!state.authReady || state.feedback.documentationLoading) {
        body.innerHTML = renderAdminDocumentationContent({ loading: true, sections: [], error: "" });
        return;
    }
    if (!isPlaytestAdmin()) {
        enforceProtectedAdminRoute();
        return;
    }
    if (!state.feedback.documentationLoaded) void loadAdminDocumentation();
    body.innerHTML = renderAdminDocumentationContent({
        loading: state.feedback.documentationLoading,
        sections: state.feedback.documentation,
        error: state.feedback.error
    });
}

async function loadAdminDocumentation({ force = false } = {}) {
    const feedback = state.feedback;
    if (!feedback.api || !isPlaytestAdmin() || feedback.documentationLoading || (feedback.documentationLoaded && !force)) return;
    feedback.documentationLoading = true;
    feedback.error = "";
    if (state.view === "adminHelp") renderAdminDocumentationPage();
    try {
        const result = await feedback.api.listAdminDocumentation();
        if (result.error) throw result.error;
        feedback.documentation = Array.isArray(result.data) ? result.data : [];
        feedback.documentationLoaded = true;
    } catch (error) {
        console.error("Could not load admin documentation", error);
        feedback.error = feedbackErrorMessage(error, "Could not load protected documentation.");
        feedback.documentationLoaded = true;
    } finally {
        feedback.documentationLoading = false;
        if (state.view === "adminHelp") renderAdminDocumentationPage();
    }
}

function renderProgressionAdminPage() {
    const body = document.getElementById("admin-progression-body");
    if (!body) return;
    document.body.classList.toggle(
        "progression-modal-open",
        state.view === "adminProgression" && progressionEditorOpen()
    );
    if (!state.authReady) {
        body.innerHTML = renderProgressionAdminContent({
            loading: true,
            ready: false,
            catalog: [],
            rules: [],
            grants: [],
            profiles: [],
            editorKey: "",
            creating: false,
            filters: { search: "", type: "all", showArchived: true },
            message: "",
            error: "",
            saving: false
        });
        return;
    }
    if (!isPlaytestAdmin()) {
        enforceProtectedAdminRoute();
        return;
    }
    if (!state.progression.loaded && !state.progression.loading) void loadProgressionAdminData();
    const adminCatalog = progressionAdminCatalogItems();
    body.innerHTML = renderProgressionAdminContent({
        loading: state.progression.loading,
        ready: state.progression.ready,
        section: state.progression.section,
        catalog: adminCatalog,
        rules: state.progression.rules,
        grants: state.progression.grants,
        profiles: state.progression.profiles,
        editorKey: state.progression.editorKey,
        creating: state.progression.creating,
        filters: {
            search: state.progression.filterSearch,
            type: state.progression.filterType,
            showArchived: state.progression.showArchived
        },
        weekly: {
            ready: state.progression.weeklyReady,
            templates: state.progression.weeklyTemplates,
            editorId: state.progression.weeklyEditorId,
            creating: state.progression.creatingWeekly,
            filters: {
                search: state.progression.weeklyFilterSearch,
                difficulty: state.progression.weeklyFilterDifficulty,
                showArchived: state.progression.weeklyShowArchived
            },
            message: state.progression.weeklyMessage,
            error: state.progression.weeklyError,
            saving: state.progression.saving
        },
        player: {
            ready: state.progression.ready && state.progression.playersReady,
            players: state.progression.players,
            catalog: adminCatalog,
            grants: playerManagerEffectiveGrants(adminCatalog),
            revocations: state.progression.revocations,
            selectedId: state.progression.playerSelectedId,
            currentUserId: state.authSession?.user?.id || "",
            filters: {
                search: state.progression.playerSearch,
                collection: state.progression.playerCollectionFilter,
                sort: state.progression.playerCollectionSort
            },
            grantKey: state.progression.playerGrantKey,
            revokeKey: state.progression.playerRevokeKey,
            banOpen: state.progression.playerBanOpen,
            message: state.progression.playerMessage,
            error: state.progression.playerError || (!state.progression.ready ? state.progression.error : ""),
            saving: state.progression.saving
        },
        message: state.progression.message,
        error: state.progression.error,
        saving: state.progression.saving
    });
}

async function loadProgressionAdminData({ force = false } = {}) {
    const progression = state.progression;
    if (!progression.api || !isPlaytestAdmin() || progression.loading || (progression.loaded && !force)) return;
    progression.loading = true;
    progression.error = "";
    progression.weeklyError = "";
    progression.playerError = "";
    if (state.view === "adminProgression") renderProgressionAdminPage();

    try {
        await loadCosmeticCatalog({ force });
        const [rulesResult, grantsResult, weeklyResult, playersResult, revocationsResult] = await Promise.all([
            progression.api.listRules(),
            progression.api.listInventory(),
            progression.api.listWeeklyMissionTemplates(),
            progression.api.listManagedPlayers(),
            progression.api.listCosmeticRevocations()
        ]);
        if (weeklyResult.error) {
            progression.weeklyTemplates = [];
            progression.weeklyReady = false;
            progression.weeklyError = weeklyMissionAdminErrorMessage(weeklyResult.error);
            setWeeklyMissionTemplateCache([], false);
        } else {
            const templates = (Array.isArray(weeklyResult.data) ? weeklyResult.data : [])
                .map(normalizeWeeklyMissionTemplate)
                .filter(Boolean);
            progression.weeklyTemplates = templates;
            progression.weeklyReady = true;
            progression.weeklyError = "";
            setWeeklyMissionTemplateCache(templates, true);
        }
        if (playersResult.error || revocationsResult.error) {
            progression.players = [];
            progression.revocations = [];
            progression.playersReady = false;
            progression.playerError = playerManagerErrorMessage(playersResult.error || revocationsResult.error);
        } else {
            progression.players = (Array.isArray(playersResult.data) ? playersResult.data : [])
                .map(normalizeManagedPlayer)
                .filter(Boolean);
            progression.revocations = (Array.isArray(revocationsResult.data) ? revocationsResult.data : [])
                .map(normalizeCosmeticRevocation)
                .filter(Boolean);
            progression.playersReady = true;
            progression.playerError = "";
            if (!progression.players.some((profile) => profile.id === progression.playerSelectedId)) {
                progression.playerSelectedId = progression.players[0]?.id || "";
            }
        }
        if (!state.store.catalogProgressionReady) {
            throw new Error(state.store.catalogMessage || "Cosmetic progression access is not configured for administrators.");
        }
        if (rulesResult.error) throw rulesResult.error;
        if (grantsResult.error) throw grantsResult.error;
        progression.rules = Array.isArray(rulesResult.data) ? rulesResult.data : [];
        progression.grants = Array.isArray(grantsResult.data) ? grantsResult.data : [];
        progression.profiles = progression.players.map((profile) => ({
            id: profile.id,
            username: profile.username,
            display_name: profile.display_name,
            minecraft_player_name: profile.minecraft_player_name,
            is_owner: profile.is_owner
        }));
        progression.ready = true;
    } catch (error) {
        console.error("Could not load progression administration", error);
        progression.rules = [];
        progression.grants = [];
        progression.revocations = [];
        progression.profiles = [];
        progression.ready = false;
        progression.error = progressionAdminErrorMessage(error);
    } finally {
        progression.loaded = true;
        progression.loading = false;
        if (state.view === "adminProgression") renderProgressionAdminPage();
    }
}

function setWeeklyMissionTemplateCache(templates, ready) {
    state.weeklyMissions.templates = Array.isArray(templates) ? templates : [];
    state.weeklyMissions.templatesLoaded = true;
    state.weeklyMissions.templatesReady = Boolean(ready);
}

async function loadWeeklyMissionTemplates({ force = false } = {}) {
    const missionState = state.weeklyMissions;
    if (!state.progression.api || !state.authSession?.user) return;
    if (missionState.templatesLoaded && !force) return;
    if (weeklyTemplateLoadPromise) return weeklyTemplateLoadPromise;

    missionState.templatesLoading = true;
    weeklyTemplateLoadPromise = (async () => {
        try {
            const result = await state.progression.api.listWeeklyMissionTemplates();
            if (result.error) throw result.error;
            const templates = (Array.isArray(result.data) ? result.data : [])
                .map(normalizeWeeklyMissionTemplate)
                .filter(Boolean);
            setWeeklyMissionTemplateCache(templates, true);
        } catch (error) {
            console.warn("Weekly mission templates are not available", error);
            setWeeklyMissionTemplateCache([], false);
        } finally {
            missionState.templatesLoading = false;
            weeklyTemplateLoadPromise = null;
        }
    })();
    return weeklyTemplateLoadPromise;
}

function normalizeWeeklyMissionTemplate(row) {
    const id = String(row?.id || "").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)) return null;
    const familyValue = String(row?.family || id).trim().toLowerCase();
    const family = /^[a-z0-9][a-z0-9_-]{0,63}$/.test(familyValue) ? familyValue : id;
    const difficulty = WEEKLY_DIFFICULTY_VALUES.has(row?.difficulty) ? row.difficulty : "easy";
    const mode = WEEKLY_MODE_VALUES.has(row?.mode) ? row.mode : "overall";
    const metric = WEEKLY_METRIC_VALUES.has(row?.metric) ? row.metric : "games";
    const weaponScope = WEEKLY_WEAPON_SCOPE_VALUES.has(row?.weapon_scope) ? row.weapon_scope : "none";
    const weaponCategory = WEEKLY_WEAPON_CATEGORY_VALUES.has(row?.weapon_category) ? row.weapon_category : "";
    return {
        id,
        family,
        difficulty,
        label: String(row?.label || id).trim().slice(0, 80) || id,
        description: String(row?.description || "").trim().slice(0, 240),
        metric,
        target: Math.min(1_000_000_000, Math.max(1, Math.floor(number(row?.target)))),
        xp: Math.min(20_000, Math.max(1, Math.floor(number(row?.xp)))),
        mode,
        weaponScope,
        weaponId: String(row?.weapon_id || "").trim().slice(0, 80),
        weaponCategory,
        active: row?.active !== false,
        sortOrder: Math.min(100_000, Math.max(0, Math.floor(number(row?.sort_order)))),
        createdAt: String(row?.created_at || ""),
        updatedAt: String(row?.updated_at || "")
    };
}

function normalizeManagedPlayer(row) {
    const id = String(row?.id || "").trim();
    if (!id) return null;
    return {
        id,
        username: String(row?.username || "").trim().slice(0, 80),
        display_name: String(row?.display_name || "").trim().slice(0, 80),
        avatar_url: String(row?.avatar_url || "").trim().slice(0, 1000),
        minecraft_player_name: String(row?.minecraft_player_name || "").trim().slice(0, 80),
        is_admin: Boolean(row?.is_admin),
        is_owner: Boolean(row?.is_owner),
        banned_from_voting: Boolean(row?.banned_from_voting),
        ban_reason: String(row?.ban_reason || "").trim().slice(0, 300),
        banned_at: String(row?.banned_at || ""),
        banned_by_username: String(row?.banned_by_username || "").trim().slice(0, 80),
        created_at: String(row?.created_at || "")
    };
}

function normalizeCosmeticRevocation(row) {
    const profileId = String(row?.profile_id || "").trim();
    const type = String(row?.cosmetic_type || "").trim();
    const id = String(row?.cosmetic_id || "").trim();
    if (!profileId || !STORE_CATEGORY_LABELS[type] || type === "all" || !id) return null;
    return {
        profile_id: profileId,
        cosmetic_type: type,
        cosmetic_id: id,
        reason: String(row?.reason || "").trim().slice(0, 300),
        revoked_at: String(row?.revoked_at || ""),
        revoked_by_username: String(row?.revoked_by_username || "").trim().slice(0, 80)
    };
}

function focusProgressionEditor() {
    window.requestAnimationFrame(() => document.querySelector("[data-progression-cosmetic-close], [data-weekly-template-close], [data-player-grant-close], [data-player-revoke-close], [data-player-ban-close]")?.focus());
}

function progressionEditorOpen() {
    return Boolean(
        state.progression.editorKey
        || state.progression.creating
        || state.progression.weeklyEditorId
        || state.progression.creatingWeekly
        || state.progression.playerGrantKey
        || state.progression.playerRevokeKey
        || state.progression.playerBanOpen
    );
}

function progressionAdminCatalogItems() {
    const builtInGroups = [
        ["icon", PROFILE_ICONS],
        ["background", PROFILE_BACKGROUNDS],
        ["border", PFP_BORDERS],
        ["title", PROFILE_TITLES]
    ];
    const merged = new Map();

    for (const [type, entries] of builtInGroups) {
        entries.forEach((entry, index) => {
            const item = normalizeBuiltInAdminCosmetic(type, entry, index);
            merged.set(cosmeticCatalogKey(type, item.id), item);
        });
    }

    for (const remote of state.store.catalogItems) {
        const key = cosmeticCatalogKey(remote.type, remote.id);
        const builtIn = merged.get(key);
        merged.set(key, {
            ...(builtIn || {}),
            ...remote,
            builtIn: Boolean(builtIn),
            inferredRule: builtIn?.inferredRule || null
        });
    }

    return [...merged.values()];
}

function playerManagerEffectiveGrants(catalog) {
    const revoked = new Set(state.progression.revocations.map((entry) => playerCosmeticKey(
        entry.profile_id,
        entry.cosmetic_type,
        entry.cosmetic_id
    )));
    const grants = state.progression.grants.filter((entry) => !revoked.has(playerCosmeticKey(
        entry.profile_id,
        entry.cosmetic_type,
        entry.cosmetic_id
    )));
    const owned = new Set(grants.map((entry) => playerCosmeticKey(
        entry.profile_id,
        entry.cosmetic_type,
        entry.cosmetic_id
    )));
    const accounts = new Map(state.accountProfiles.map((account) => [account.id, account]));
    if (state.authProfile?.id) accounts.set(state.authProfile.id, state.authProfile);

    for (const profile of state.progression.players) {
        const account = accounts.get(profile.id) || profile;
        for (const item of catalog) {
            const key = playerCosmeticKey(profile.id, item.type, item.id);
            if (owned.has(key) || revoked.has(key)) continue;
            const source = automaticPlayerCosmeticSource(item, profile, account);
            if (!source) continue;
            grants.push({
                profile_id: profile.id,
                cosmetic_type: item.type,
                cosmetic_id: item.id,
                source,
                grant_note: "",
                granted_by: null,
                acquired_at: "",
                synthetic: true
            });
            owned.add(key);
        }
    }
    return grants;
}

function automaticPlayerCosmeticSource(item, profile, account) {
    if (item.acquisitionType === "default") return "default";
    if (item.acquisitionType === "owner") return profile.is_owner ? "owner" : "";
    const legacyField = {
        icon: "unlocked_icons",
        background: "unlocked_backgrounds",
        border: "unlocked_pfp_borders",
        title: "unlocked_titles"
    }[item.type];
    if (legacyField && arrayField(account?.[legacyField]).includes(item.id)) return "legacy";
    if (item.id === "custom" && item.type === "icon" && account?.custom_avatar_url) return "legacy";
    if (item.id === "custom" && item.type === "background" && account?.custom_background_url) return "legacy";
    if (item.acquisitionType !== "progression") return "";
    const key = cosmeticCatalogKey(item.type, item.id);
    const rule = state.progression.rules.find((entry) => cosmeticCatalogKey(
        entry.cosmetic_type,
        entry.cosmetic_id
    ) === key) || item.inferredRule;
    return progressionRuleSatisfiedForAccount(rule, account) ? "progression" : "";
}

function progressionRuleSatisfiedForAccount(rule, account) {
    if (!rule || rule.active === false) return false;
    if (rule.metric === "account_linked") {
        return Boolean(account?.minecraft_player_name || account?.minecraft_player_id || accountLinkedStatsProfile(account));
    }
    const linkedProfile = accountLinkedStatsProfile(account);
    if (!linkedProfile) return false;
    const mode = rule.mode === "battle_royale"
        ? normalizePlayer(linkedProfile.battleRoyale)
        : rule.mode === "deathmatch"
            ? normalizePlayer(linkedProfile.deathmatch)
            : buildProfileOverall(linkedProfile);
    const stats = normalizeStats(mode?.stats);
    const derived = normalizeDerived(mode?.derived, stats);
    const metric = {
        games: stats.games,
        wins: stats.wins,
        kills: stats.kills,
        deaths: stats.deaths,
        mvp: stats.mvp,
        hits: stats.hits,
        headshots: stats.headshots,
        headshot_kills: stats.headshotKills,
        best_kill_streak: stats.bestKillStreak,
        top_match_kills: stats.topMatchKills,
        utility_kills: stats.utilityKills,
        vehicle_kills: stats.vehicleKills,
        playtime_seconds: stats.playtimeSeconds,
        headshot_rate: stats.hits > 0 ? (stats.headshots / stats.hits) * 100 : derived.headshotRate
    }[rule.metric];
    return Number.isFinite(Number(metric)) && Number(metric) >= Number(rule.target);
}

function playerCosmeticKey(profileId, type, id) {
    return `${String(profileId || "")}|${cosmeticCatalogKey(type, id)}`;
}

function requiredFallbackCosmetic(type, id) {
    return (type === "icon" && id === "minecraft")
        || (type === "background" && id === "default")
        || (type === "border" && id === "none")
        || (type === "title" && id === "none");
}

function normalizeBuiltInAdminCosmetic(type, item, index) {
    const inferredRule = inferredCosmeticRule(item.unlock);
    const acquisitionType = item.id === "owner" && type === "title"
        ? "owner"
        : item.unlock === "default"
            ? "default"
            : item.unlock === "store"
                ? "store"
                : inferredRule
                    ? "progression"
                    : "exclusive";
    return {
        ...item,
        type,
        name: String(item.label || item.id),
        description: String(item.description || ""),
        image: String(item.image || ""),
        text: String(item.text ?? item.label ?? item.id),
        inset: number(item.inset),
        active: true,
        shopEnabled: acquisitionType === "store",
        acquisitionType,
        availableFrom: "",
        availableUntil: "",
        supplyLimit: null,
        unitAmount: Math.max(0, Math.floor(number(item.unitAmount))),
        currency: String(item.currency || "eur"),
        featured: Boolean(item.featured),
        sortOrder: index,
        remoteCatalog: false,
        builtIn: true,
        inferredRule
    };
}

function inferredCosmeticRule(unlockId) {
    const badge = BADGE_CATALOG.find((entry) => entry.id === unlockId);
    if (!badge?.progress) return null;
    if (badge.progress.type === "linked") {
        return { mode: "overall", metric: "account_linked", target: 1, active: true, sort_order: 0 };
    }
    if (badge.progress.type === "sharpshooter") {
        return { mode: "overall", metric: "headshot_rate", target: badge.progress.rateTarget || 35, active: true, sort_order: 0 };
    }
    if (!badge.progress.stat || !badge.progress.target) return null;
    const mode = badge.progress.scope === "battleRoyale"
        ? "battle_royale"
        : badge.progress.scope === "deathmatch"
            ? "deathmatch"
            : "overall";
    return {
        mode,
        metric: badge.progress.stat,
        target: badge.progress.target,
        active: true,
        sort_order: 0
    };
}

function progressionCosmeticByKey(key) {
    return progressionAdminCatalogItems().find((item) => cosmeticCatalogKey(item.type, item.id) === key) || null;
}

async function submitProgressionCosmetic(form) {
    const progression = state.progression;
    if (!progression.api || !isPlaytestAdmin() || !state.authSession?.user || progression.saving) return;
    const values = new FormData(form);
    const status = form.querySelector("[data-progression-editor-status]");

    try {
        const originalKey = String(values.get("originalKey") || "").trim();
        const existing = originalKey ? progressionCosmeticByKey(originalKey) : null;
        const type = String(values.get("cosmeticType") || "").trim().toLowerCase();
        const id = String(values.get("cosmeticId") || "").trim().toLowerCase();
        const key = cosmeticCatalogKey(type, id);
        if (!STORE_CATEGORY_LABELS[type] || type === "all") throw new Error("Choose a valid cosmetic type.");
        if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)) throw new Error("The cosmetic ID can only use lowercase letters, numbers, _ and -.");
        if (!existing && progressionAdminCatalogItems().some((item) => cosmeticCatalogKey(item.type, item.id) === key)) {
            throw new Error("That cosmetic ID already exists.");
        }

        const name = String(values.get("name") || "").trim().replace(/\s+/g, " ").slice(0, 80);
        if (!name) throw new Error("Enter a cosmetic name.");
        const acquisitionType = String(values.get("acquisitionType") || "exclusive").trim();
        if (!COSMETIC_ACQUISITION_VALUES.has(acquisitionType)) throw new Error("Choose how the cosmetic is earned.");
        if (type === "title" && id === "owner" && acquisitionType !== "owner") {
            throw new Error("The Owner title must remain owner-only.");
        }

        let ruleConfig = null;
        if (acquisitionType === "progression") {
            const mode = String(values.get("mode") || "overall");
            const metric = String(values.get("metric") || "games");
            const target = Number(values.get("target"));
            if (!PROGRESSION_MODE_VALUES.has(mode)) throw new Error("Choose a valid game mode.");
            if (!PROGRESSION_METRIC_VALUES.has(metric)) throw new Error("Choose a valid tracked requirement.");
            if (!Number.isFinite(target) || target <= 0 || target > 1_000_000_000) throw new Error("Required amount must be above zero.");
            ruleConfig = { mode, metric, target, active: values.get("ruleActive") === "on" };
        }

        const shopEnabled = acquisitionType === "store";
        const timeLimited = shopEnabled && values.get("timeLimited") === "on";
        const countLimited = shopEnabled && values.get("countLimited") === "on";
        const availableFrom = timeLimited ? catalogOptionalIsoDate(values.get("availableFrom")) : null;
        const availableUntil = timeLimited ? catalogOptionalIsoDate(values.get("availableUntil")) : null;
        if (timeLimited && (!availableFrom || !availableUntil)) {
            throw new Error("Choose both the start and end of the limited sale.");
        }
        if (availableFrom && availableUntil && Date.parse(availableUntil) <= Date.parse(availableFrom)) {
            throw new Error("Available until must be later than available from.");
        }
        const supplyText = countLimited ? String(values.get("supplyLimit") || "").trim() : "";
        const supplyLimit = supplyText ? Number(supplyText) : null;
        if (countLimited && (supplyLimit === null || !Number.isInteger(supplyLimit) || supplyLimit < 1 || supplyLimit > 100_000_000)) {
            throw new Error("Available copies must be a positive whole number.");
        }

        const price = Number(values.get("shopPrice"));
        const unitAmount = shopEnabled ? Math.round(price * 100) : null;
        if (shopEnabled && (!Number.isFinite(unitAmount) || unitAmount < 1)) throw new Error("Enter a shop preview price above zero.");

        let imageUrl = type === "title" ? "" : String(values.get("imageUrl") || existing?.image || "").trim().slice(0, 1000);
        const asset = values.get("asset");
        progression.saving = true;
        progression.error = "";
        progression.message = "";
        if (status) status.textContent = "Saving cosmetic...";
        if (type !== "title" && asset instanceof File && asset.size > 0) imageUrl = await uploadCatalogAsset(asset, type, id);
        const dynamicIcon = type === "icon" && ["discord", "minecraft"].includes(id);
        if (type !== "title" && !dynamicIcon && !imageUrl) throw new Error("Add a PNG, WebP or GIF asset URL or upload a file.");

        const payload = {
            cosmetic_type: type,
            cosmetic_id: id,
            name,
            description: String(values.get("description") || "").trim().slice(0, 300),
            category: String(values.get("category") || "Default").trim().replace(/\s+/g, " ").slice(0, 40) || "Default",
            rarity: cleanRarity(values.get("rarity")),
            image_url: type === "title" ? null : imageUrl || null,
            title_text: type === "title" ? String(values.get("titleText") || name).trim().replace(/\s+/g, " ").slice(0, 48) || name : null,
            border_inset: type === "border" ? Math.min(30, Math.max(0, number(values.get("borderInset")))) : 0,
            active: values.get("active") === "on",
            acquisition_type: acquisitionType,
            available_from: shopEnabled ? availableFrom : null,
            available_until: shopEnabled ? availableUntil : null,
            supply_limit: shopEnabled ? supplyLimit : null,
            shop_enabled: shopEnabled,
            shop_unit_amount: unitAmount,
            shop_currency: String(values.get("shopCurrency") || "eur").trim().toLowerCase(),
            shop_featured: shopEnabled && values.get("shopFeatured") === "on",
            sort_order: Math.min(100000, Math.max(0, Math.floor(number(values.get("sortOrder"))))),
            created_by: state.authSession.user.id,
            updated_at: new Date().toISOString()
        };
        const catalogResult = await progression.api.saveCatalogItem(payload);
        if (catalogResult.error) throw catalogResult.error;

        const currentRule = progression.rules.find((rule) => cosmeticCatalogKey(rule.cosmetic_type, rule.cosmetic_id) === key);
        if (ruleConfig) {
            const ruleResult = await progression.api.saveRule({
                id: currentRule?.id || "",
                cosmeticType: type,
                cosmeticId: id,
                mode: ruleConfig.mode,
                metric: ruleConfig.metric,
                target: ruleConfig.target,
                active: ruleConfig.active,
                sortOrder: payload.sort_order,
                createdBy: state.authSession.user.id
            });
            if (ruleResult.error) throw ruleResult.error;
        } else if (currentRule) {
            const ruleResult = await progression.api.deleteRuleForCosmetic(type, id);
            if (ruleResult.error) throw ruleResult.error;
        }

        if (status) status.textContent = "Checking every account against the new ownership settings...";
        const reconciliation = await progression.api.reconcileCosmetic(type, id);
        if (reconciliation.error) throw reconciliation.error;
        progression.editorKey = key;
        progression.creating = false;
        progression.message = `${name} saved. ${formatReconciliationResult(reconciliation.data)}`;
        await reloadProgressionAdminData();
    } catch (error) {
        console.error("Could not save cosmetic progression", error);
        progression.error = progressionAdminErrorMessage(error, "Could not save this cosmetic and its mission.");
    } finally {
        progression.saving = false;
        if (state.view === "adminProgression") renderProgressionAdminPage();
    }
}

async function toggleProgressionCosmeticArchive(key) {
    const item = progressionCosmeticByKey(key);
    const progression = state.progression;
    if (!item || !progression.api || progression.saving || !isPlaytestAdmin()) return;
    progression.saving = true;
    progression.error = "";
    try {
        await ensureProgressionCatalogOverride(item, { active: !item.active });
        const reconciliation = await progression.api.reconcileCosmetic(item.type, item.id);
        if (reconciliation.error) throw reconciliation.error;
        progression.message = `${item.name} ${item.active ? "archived" : "restored"}. ${formatReconciliationResult(reconciliation.data)}`;
        await reloadProgressionAdminData();
    } catch (error) {
        console.error("Could not change cosmetic archive state", error);
        progression.error = progressionAdminErrorMessage(error, "Could not change this cosmetic's archive state.");
    } finally {
        progression.saving = false;
        if (state.view === "adminProgression") renderProgressionAdminPage();
    }
}

async function deleteProgressionCosmetic(key) {
    const item = progressionCosmeticByKey(key);
    const progression = state.progression;
    if (!item || item.builtIn || !item.remoteCatalog || !progression.api || progression.saving || !isPlaytestAdmin()) return;
    if (!window.confirm(`Permanently delete ${item.name}? Its mission and every ownership record will also be deleted.`)) return;
    progression.saving = true;
    progression.error = "";
    try {
        const result = await progression.api.deleteCatalogItem(item.type, item.id);
        if (result.error) throw result.error;
        progression.editorKey = "";
        progression.creating = false;
        progression.message = `${item.name} permanently deleted.`;
        await reloadProgressionAdminData();
    } catch (error) {
        console.error("Could not delete cosmetic", error);
        progression.error = progressionAdminErrorMessage(error, "Could not permanently delete this cosmetic.");
    } finally {
        progression.saving = false;
        if (state.view === "adminProgression") renderProgressionAdminPage();
    }
}

function weeklyMissionTemplateById(templateId) {
    return state.progression.weeklyTemplates.find((template) => template.id === templateId) || null;
}

async function submitWeeklyMissionTemplate(form) {
    const progression = state.progression;
    if (!progression.api || !isPlaytestAdmin() || !state.authSession?.user || progression.saving) return;
    const values = new FormData(form);
    const status = form.querySelector("[data-weekly-template-status]");

    try {
        const originalId = String(values.get("originalId") || "").trim().toLowerCase();
        const templateId = String(values.get("templateId") || "").trim().toLowerCase();
        const family = String(values.get("family") || "").trim().toLowerCase();
        if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(templateId)) {
            throw new Error("The template ID can only use lowercase letters, numbers, _ and -.");
        }
        if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(family)) {
            throw new Error("The rotation group can only use lowercase letters, numbers, _ and -.");
        }
        if (originalId && originalId !== templateId) throw new Error("An existing template ID cannot be changed.");
        if (!originalId && weeklyMissionTemplateById(templateId)) throw new Error("That weekly mission ID already exists.");

        const difficulty = String(values.get("difficulty") || "");
        const mode = String(values.get("mode") || "");
        const metric = String(values.get("metric") || "");
        const weaponScope = String(values.get("weaponScope") || "none");
        const weaponCategory = String(values.get("weaponCategory") || "");
        if (!WEEKLY_DIFFICULTY_VALUES.has(difficulty)) throw new Error("Choose a valid mission difficulty.");
        if (!WEEKLY_MODE_VALUES.has(mode)) throw new Error("Choose a valid game mode.");
        if (!WEEKLY_METRIC_VALUES.has(metric)) throw new Error("Choose a valid tracked statistic.");
        if (!WEEKLY_WEAPON_SCOPE_VALUES.has(weaponScope)) throw new Error("Choose a valid weapon requirement.");
        if (weaponScope === "weapon_category" && !WEEKLY_WEAPON_CATEGORY_VALUES.has(weaponCategory)) {
            throw new Error("Choose a valid weapon category.");
        }

        const weaponId = String(values.get("weaponId") || "").trim().slice(0, 80);
        if (weaponScope === "exact_weapon" && !weaponId) throw new Error("Enter the tracked weapon ID.");
        const label = String(values.get("label") || "").trim().replace(/\s+/g, " ").slice(0, 80);
        if (!label) throw new Error("Enter a mission name.");
        const target = Number(values.get("target"));
        const xp = Number(values.get("xp"));
        const sortOrder = Number(values.get("sortOrder") || 0);
        if (!Number.isInteger(target) || target < 1 || target > 1_000_000_000) {
            throw new Error("Required amount must be a positive whole number.");
        }
        if (!Number.isInteger(xp) || xp < 1 || xp > 20_000) {
            throw new Error("XP must be a whole number between 1 and 20,000.");
        }
        if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 100_000) {
            throw new Error("Sort order must be a whole number between 0 and 100,000.");
        }

        progression.saving = true;
        progression.weeklyError = "";
        progression.weeklyMessage = "";
        if (status) status.textContent = "Saving weekly mission...";
        const payload = {
            id: templateId,
            family,
            difficulty,
            label,
            description: String(values.get("description") || "").trim().slice(0, 240),
            metric,
            target,
            xp,
            mode,
            weapon_scope: weaponScope,
            weapon_id: weaponScope === "exact_weapon" ? weaponId : null,
            weapon_category: weaponScope === "weapon_category" ? weaponCategory : null,
            active: values.get("active") === "on",
            sort_order: sortOrder
        };
        const result = await progression.api.saveWeeklyMissionTemplate(payload);
        if (result.error) throw result.error;
        progression.weeklyEditorId = templateId;
        progression.creatingWeekly = false;
        progression.weeklyMessage = `${label} saved. New settings apply to future rotations and swaps.`;
        await reloadWeeklyMissionAdminData();
    } catch (error) {
        console.error("Could not save weekly mission template", error);
        progression.weeklyError = weeklyMissionAdminErrorMessage(error, "Could not save this weekly mission.");
    } finally {
        progression.saving = false;
        if (state.view === "adminProgression") renderProgressionAdminPage();
    }
}

async function toggleWeeklyMissionTemplateArchive(templateId) {
    const template = weeklyMissionTemplateById(templateId);
    const progression = state.progression;
    if (!template || !progression.api || progression.saving || !isPlaytestAdmin()) return;
    progression.saving = true;
    progression.weeklyError = "";
    progression.weeklyMessage = "";
    try {
        const result = await progression.api.setWeeklyMissionTemplateActive(template.id, !template.active);
        if (result.error) throw result.error;
        progression.weeklyMessage = `${template.label} ${template.active ? "archived" : "restored"}. Existing player missions were not changed.`;
        await reloadWeeklyMissionAdminData();
    } catch (error) {
        console.error("Could not change weekly mission archive state", error);
        progression.weeklyError = weeklyMissionAdminErrorMessage(error, "Could not change this mission's archive state.");
    } finally {
        progression.saving = false;
        if (state.view === "adminProgression") renderProgressionAdminPage();
    }
}

async function deleteWeeklyMissionTemplate(templateId) {
    const template = weeklyMissionTemplateById(templateId);
    const progression = state.progression;
    if (!template || !progression.api || progression.saving || !isPlaytestAdmin()) return;
    if (!window.confirm(`Permanently delete ${template.label}? Existing assigned copies will remain until they rotate out.`)) return;
    progression.saving = true;
    progression.weeklyError = "";
    progression.weeklyMessage = "";
    try {
        const result = await progression.api.deleteWeeklyMissionTemplate(template.id);
        if (result.error) throw result.error;
        progression.weeklyEditorId = "";
        progression.creatingWeekly = false;
        progression.weeklyMessage = `${template.label} permanently deleted. Existing assigned copies were preserved.`;
        await reloadWeeklyMissionAdminData();
    } catch (error) {
        console.error("Could not delete weekly mission template", error);
        progression.weeklyError = weeklyMissionAdminErrorMessage(error, "Could not permanently delete this mission.");
    } finally {
        progression.saving = false;
        if (state.view === "adminProgression") renderProgressionAdminPage();
    }
}

async function reloadWeeklyMissionAdminData() {
    state.progression.loaded = false;
    state.weeklyMissions.templatesLoaded = false;
    await loadProgressionAdminData({ force: true });
}

async function ensureProgressionCatalogOverride(item, overrides = {}) {
    const acquisitionType = overrides.acquisitionType || item.acquisitionType || "exclusive";
    const shopEnabled = acquisitionType === "store";
    const result = await state.progression.api.saveCatalogItem({
        cosmetic_type: item.type,
        cosmetic_id: item.id,
        name: item.name || item.label || item.id,
        description: item.description || "",
        category: item.category || "Default",
        rarity: cleanRarity(item.rarity),
        image_url: item.image || null,
        title_text: item.type === "title" ? item.text || item.name || item.id : null,
        border_inset: item.type === "border" ? number(item.inset) : 0,
        active: Object.hasOwn(overrides, "active") ? Boolean(overrides.active) : item.active !== false,
        acquisition_type: acquisitionType,
        available_from: shopEnabled ? item.availableFrom || null : null,
        available_until: shopEnabled ? item.availableUntil || null : null,
        supply_limit: shopEnabled ? item.supplyLimit || null : null,
        shop_enabled: shopEnabled,
        shop_unit_amount: shopEnabled ? item.unitAmount || null : null,
        shop_currency: item.currency || "eur",
        shop_featured: shopEnabled && Boolean(item.featured),
        sort_order: Math.max(0, Math.floor(number(item.sortOrder))),
        created_by: state.authSession.user.id,
        updated_at: new Date().toISOString()
    });
    if (result.error) throw result.error;
    const existingRule = state.progression.rules.find((rule) =>
        cosmeticCatalogKey(rule.cosmetic_type, rule.cosmetic_id) === cosmeticCatalogKey(item.type, item.id)
    );
    if (acquisitionType === "progression" && !existingRule && item.inferredRule) {
        const ruleResult = await state.progression.api.saveRule({
            id: "",
            cosmeticType: item.type,
            cosmeticId: item.id,
            mode: item.inferredRule.mode,
            metric: item.inferredRule.metric,
            target: item.inferredRule.target,
            active: item.inferredRule.active !== false,
            sortOrder: Math.max(0, Math.floor(number(item.sortOrder))),
            createdBy: state.authSession.user.id
        });
        if (ruleResult.error) throw ruleResult.error;
    }
    return result.data;
}

async function reloadProgressionAdminData() {
    state.progression.loaded = false;
    state.store.catalogLoaded = false;
    state.store.loaded = false;
    await loadProgressionAdminData({ force: true });
    await loadAccountProfiles();
}

function formatReconciliationResult(value) {
    const result = value && typeof value === "object" ? value : {};
    const added = Math.max(0, Math.floor(number(result.added)));
    const removed = Math.max(0, Math.floor(number(result.removed)));
    const eligible = Math.max(0, Math.floor(number(result.eligible)));
    return `${eligible} eligible, ${added} added, ${removed} removed.`;
}

function syncProgressionCosmeticEditor(form) {
    if (!form) return;
    const type = String(form.elements.namedItem("cosmeticType")?.value || "background");
    const acquisition = String(form.elements.namedItem("acquisitionType")?.value || "exclusive");
    const storeEnabled = acquisition === "store";
    const timeLimited = storeEnabled && Boolean(form.elements.namedItem("timeLimited")?.checked);
    const countLimited = storeEnabled && Boolean(form.elements.namedItem("countLimited")?.checked);

    form.querySelector("[data-progression-asset-fields]")?.toggleAttribute("hidden", type === "title");
    form.querySelector("[data-progression-title-fields]")?.toggleAttribute("hidden", type !== "title");
    form.querySelector("[data-progression-border-fields]")?.toggleAttribute("hidden", type !== "border");
    form.querySelector("[data-progression-mission-fields]")?.toggleAttribute("hidden", acquisition !== "progression");
    form.querySelector("[data-progression-store-fields]")?.toggleAttribute("hidden", !storeEnabled);
    form.querySelector("[data-progression-time-fields]")?.toggleAttribute("hidden", !timeLimited);
    form.querySelector("[data-progression-count-fields]")?.toggleAttribute("hidden", !countLimited);

    for (const name of ["availableFrom", "availableUntil"]) {
        const input = form.elements.namedItem(name);
        if (input instanceof HTMLInputElement) input.required = timeLimited;
    }
    const supplyLimit = form.elements.namedItem("supplyLimit");
    if (supplyLimit instanceof HTMLInputElement) supplyLimit.required = countLimited;
}

function updateProgressionDraftPreview(form) {
    const dialog = form?.closest(".progression-cosmetic-dialog");
    const preview = dialog?.querySelector(".progression-dialog-preview");
    if (!form || !preview) return;
    const type = String(form.elements.namedItem("cosmeticType")?.value || "background");
    if (type === "title") {
        const title = String(form.elements.namedItem("titleText")?.value || form.elements.namedItem("name")?.value || "Title").trim();
        preview.innerHTML = `<span class="profile-title-cosmetic">${escapeHtml(title || "Title")}</span>`;
        return;
    }

    const assetInput = form.elements.namedItem("asset");
    if (assetInput instanceof HTMLInputElement && assetInput.files?.[0]) {
        previewProgressionAsset(assetInput);
        return;
    }
    const imageUrl = String(form.elements.namedItem("imageUrl")?.value || "").trim();
    if (/^https:\/\//i.test(imageUrl) || /^\.\.?(?:\/|\\)/.test(imageUrl) || /^\/(?!\/)/.test(imageUrl)) {
        preview.innerHTML = `<img src="${escapeHtml(imageUrl)}" alt="">`;
        return;
    }
    preview.innerHTML = `<span class="progression-preview-placeholder">${escapeHtml(STORE_CATEGORY_LABELS[type] || "Cosmetic")}</span>`;
}

function previewProgressionAsset(input) {
    const file = input?.files?.[0];
    const dialog = input?.closest(".progression-cosmetic-dialog");
    const preview = dialog?.querySelector(".progression-dialog-preview");
    const status = dialog?.querySelector("[data-progression-editor-status]");
    if (!file || !preview) return;
    if (!new Set(["image/png", "image/webp", "image/gif"]).has(file.type) || file.size > 8 * 1024 * 1024) {
        input.value = "";
        if (status) status.textContent = file.size > 8 * 1024 * 1024 ? "The asset is larger than 8 MB." : "Only PNG, WebP and GIF assets are accepted.";
        return;
    }
    const objectUrl = URL.createObjectURL(file);
    preview.innerHTML = `<img src="${escapeHtml(objectUrl)}" alt="">`;
    preview.querySelector("img")?.addEventListener("load", () => URL.revokeObjectURL(objectUrl), { once: true });
    if (status) status.textContent = "Preview updated. Save to upload the asset.";
}

async function submitProgressionGrant(form) {
    const progression = state.progression;
    if (!progression.api || !isPlaytestAdmin() || progression.saving) return;
    const values = new FormData(form);

    try {
        const profileId = String(values.get("profileId") || "").trim();
        const profile = progression.players.find((entry) => entry.id === profileId)
            || progression.profiles.find((entry) => entry.id === profileId);
        const cosmetic = progressionCatalogItem(values.get("cosmeticKey"));
        const source = String(values.get("source") || "").trim();
        if (!profile) throw new Error("Choose a player account.");
        if (!cosmetic) throw new Error("Choose a cosmetic.");
        if (!PLAYER_GRANT_SOURCE_VALUES.has(source)) throw new Error("Choose a valid gift type.");
        if (cosmetic.acquisitionType === "owner" && !profile.is_owner) {
            throw new Error("Owner-only cosmetics can only be granted to the owner account.");
        }

        progression.saving = true;
        progression.playerError = "";
        progression.playerMessage = "";
        renderProgressionAdminPage();
        if (!cosmetic.remoteCatalog) {
            await ensureProgressionCatalogOverride(cosmetic);
            const reconciliation = await progression.api.reconcileCosmetic(cosmetic.type, cosmetic.id);
            if (reconciliation.error) throw reconciliation.error;
            state.store.catalogLoaded = false;
        }
        const result = await progression.api.grantPlayerCosmetic({
            profileId,
            cosmeticType: cosmetic.type,
            cosmeticId: cosmetic.id,
            source,
            note: String(values.get("note") || "").trim().replace(/\s+/g, " ").slice(0, 200)
        });
        if (result.error) throw result.error;
        progression.playerGrantKey = "";
        progression.playerMessage = `${cosmetic.name} sent to ${profile.display_name || profile.username || "the selected player"}.`;
        progression.loaded = false;
        await loadProgressionAdminData({ force: true });
        await loadAccountProfiles();
        if (profileId === state.authSession?.user?.id) await loadOwnCosmeticGifts({ force: true });
    } catch (error) {
        console.error("Could not grant cosmetic", error);
        progression.playerError = playerManagerErrorMessage(error, "Could not send this cosmetic.");
    } finally {
        progression.saving = false;
        if (state.view === "adminProgression") renderProgressionAdminPage();
    }
}

async function submitProgressionRevoke(form) {
    const progression = state.progression;
    if (!progression.api || progression.saving || !isPlaytestAdmin()) return;
    const values = new FormData(form);
    const profileId = String(values.get("profileId") || "").trim();
    const cosmetic = progressionCatalogItem(values.get("cosmeticKey"));
    const note = String(values.get("note") || "").trim().replace(/\s+/g, " ").slice(0, 300);
    const grant = playerManagerEffectiveGrants(progressionAdminCatalogItems()).find((entry) =>
        entry.profile_id === profileId && entry.cosmetic_type === cosmetic?.type && entry.cosmetic_id === cosmetic?.id
    );
    try {
        if (!cosmetic || !grant) throw new Error("Choose an owned cosmetic from the selected player.");
        if (requiredFallbackCosmetic(cosmetic.type, cosmetic.id)) {
            throw new Error("The account's required fallback cosmetic cannot be revoked.");
        }
        if (note.length < 3) throw new Error("Add a revocation note of at least 3 characters.");

        progression.saving = true;
        progression.playerError = "";
        progression.playerMessage = "";
        renderProgressionAdminPage();
        const result = await progression.api.revokePlayerCosmetic(profileId, cosmetic.type, cosmetic.id, note);
        if (result.error) throw result.error;
        progression.playerRevokeKey = "";
        progression.playerMessage = `${cosmetic.name || "Cosmetic"} revoked. The note was saved with the revocation.`;
        progression.loaded = false;
        await loadProgressionAdminData({ force: true });
        await loadAccountProfiles();
        if (profileId === state.authSession?.user?.id) await loadOwnCosmeticGifts({ force: true });
    } catch (error) {
        console.error("Could not revoke cosmetic", error);
        progression.playerError = playerManagerErrorMessage(error, "Could not revoke this cosmetic.");
    } finally {
        progression.saving = false;
        if (state.view === "adminProgression") renderProgressionAdminPage();
    }
}

async function submitPlayerCommunityBan(form) {
    const progression = state.progression;
    if (!progression.api || !isPlaytestAdmin() || progression.saving) return;
    const values = new FormData(form);
    const profileId = String(values.get("profileId") || "").trim();
    const profile = progression.players.find((entry) => entry.id === profileId);
    const banned = String(values.get("banned") || "") === "true";

    try {
        if (!profile) throw new Error("Choose a valid player account.");
        if (profile.is_owner || profile.id === state.authSession?.user?.id) {
            throw new Error("The owner account and your own account cannot be banned here.");
        }
        const reason = String(values.get("reason") || "").trim().replace(/\s+/g, " ").slice(0, 300);
        progression.saving = true;
        progression.playerError = "";
        progression.playerMessage = "";
        renderProgressionAdminPage();
        const result = await progression.api.setPlayerBan(profile.id, banned, reason);
        if (result.error) throw result.error;
        progression.playerBanOpen = false;
        progression.playerMessage = banned
            ? `${profile.display_name || profile.username || "Player"} is now community banned.`
            : `${profile.display_name || profile.username || "Player"} has been unbanned.`;
        progression.loaded = false;
        await loadProgressionAdminData({ force: true });
    } catch (error) {
        console.error("Could not update player ban", error);
        progression.playerError = playerManagerErrorMessage(error, "Could not update this player's community access.");
    } finally {
        progression.saving = false;
        if (state.view === "adminProgression") renderProgressionAdminPage();
    }
}

function progressionCatalogItem(value) {
    const [type, id, extra] = String(value || "").split(":");
    if (extra || !type || !id) return null;
    return progressionAdminCatalogItems().find((item) => item.type === type && item.id === id) || null;
}

function progressionAdminErrorMessage(error, fallback = "Progression administration is unavailable.") {
    const code = String(error?.code || "");
    const message = String(error?.message || error || "");
    if (/row-level security|permission|unauthorized|forbidden|access is not configured/i.test(message)) {
        return "Run the newest Supabase progression access repair script, then retry.";
    }
    if (["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(code) || /schema|relation|column|progression|reconcile_cosmetic_ownership/i.test(message)) {
        return "Run the newest incremental Supabase progression script, then retry.";
    }
    return message || fallback;
}

function weeklyMissionAdminErrorMessage(error, fallback = "Weekly mission administration is unavailable.") {
    const code = String(error?.code || "");
    const message = String(error?.message || error || "");
    if (["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(code)
        || /weekly_mission_templates|admin_.*weekly_mission_template|schema cache/i.test(message)) {
        return "Run the newest Supabase weekly mission manager script, then retry.";
    }
    if (/at least 4 active easy|at least 3 active hard|rotation pool/i.test(message)) {
        return "Keep at least 4 active easy groups and 3 active hard groups in the weekly rotation.";
    }
    if (/row-level security|permission|administrator access required|unauthorized|forbidden/i.test(message)) {
        return "Supabase did not verify this account as an administrator.";
    }
    return message || fallback;
}

function playerManagerErrorMessage(error, fallback = "Player Manager is unavailable.") {
    const code = String(error?.code || "");
    const message = String(error?.message || error || "");
    if (/admin_revoke_player_cosmetic_with_note/i.test(message)) {
        return "Run the newest incremental Supabase cosmetic revoke notes script, then retry.";
    }
    if (["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(code)
        || /admin_list_managed_players|cosmetic_revocations|admin_set_player_community_ban|admin_(grant|revoke)_player_cosmetic|schema cache/i.test(message)) {
        return "Run the newest incremental Supabase cosmetic ownership repair script, then retry.";
    }
    if (/owner account|your own account|required fallback/i.test(message)) return message;
    if (/row-level security|permission|administrator access required|unauthorized|forbidden/i.test(message)) {
        return "Supabase did not verify this account as an administrator.";
    }
    return message || fallback;
}

async function loadCosmeticCatalog({ force = false } = {}) {
    if (state.store.catalogLoading || (state.store.catalogLoaded && !force)) return;
    state.store.catalogLoading = true;
    state.store.catalogMessage = "";

    if (!state.authClient) {
        state.store.catalogItems = [];
        state.store.catalogLoaded = true;
        state.store.catalogLoading = false;
        state.store.catalogReady = false;
        state.store.catalogProgressionReady = false;
        return;
    }

    const adminCatalog = isPlaytestAdmin();
    const source = adminCatalog ? COSMETIC_CATALOG_TABLE : PUBLIC_COSMETIC_CATALOG_VIEW;
    const legacyColumns = adminCatalog
        ? "cosmetic_type, cosmetic_id, name, description, category, rarity, image_url, title_text, border_inset, active, shop_enabled, shop_unit_amount, shop_currency, shop_featured, sort_order, created_at, updated_at"
        : "cosmetic_type, cosmetic_id, name, description, category, rarity, image_url, title_text, border_inset, active, sort_order, created_at, updated_at";
    const progressionColumns = `${legacyColumns}, acquisition_type, available_from, available_until, supply_limit`;
    const runCatalogQuery = (columns) => state.authClient
        .from(source)
        .select(columns)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
    let result = await runCatalogQuery(progressionColumns);
    const progressionError = result.error;
    const progressionReady = !result.error;
    if (result.error) result = await runCatalogQuery(legacyColumns);

    if (result.error) {
        if (adminCatalog) console.warn("Cosmetic catalog is unavailable", result.error);
        state.store.catalogItems = [];
        state.store.catalogReady = false;
        state.store.catalogProgressionReady = false;
        state.store.catalogMessage = catalogAdminSetupMessage(result.error);
    } else {
        state.store.catalogItems = (result.data || []).map(normalizeCosmeticCatalogRow).filter(Boolean);
        state.store.catalogReady = true;
        state.store.catalogProgressionReady = progressionReady;
        state.store.catalogMessage = progressionReady ? "" : catalogAdminSetupMessage(progressionError);
    }
    state.store.catalogLoaded = true;
    state.store.catalogLoading = false;
    state.cosmeticOwnershipCache.clear();
}

function catalogAdminSetupMessage(error) {
    const message = String(error?.message || "");
    if (/row-level security|permission|unauthorized|forbidden/i.test(message)) {
        return "Cosmetic catalog access is not configured for administrators.";
    }
    return "Cosmetic catalog progression columns are not configured.";
}

function normalizeCosmeticCatalogRow(value) {
    const type = String(value?.cosmetic_type || value?.type || "").trim().toLowerCase();
    const id = String(value?.cosmetic_id || value?.id || "").trim().toLowerCase();
    if (!STORE_CATEGORY_LABELS[type] || type === "all" || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)) return null;
    const name = String(value?.name || id).trim().slice(0, 80) || id;
    const imageUrl = String(value?.image_url || value?.image || "").trim();
    const shopEnabled = Boolean(value?.shop_enabled ?? value?.shopEnabled);
    const savedAcquisition = String(value?.acquisition_type || value?.acquisitionType || "").trim().toLowerCase();
    const acquisitionType = COSMETIC_ACQUISITION_VALUES.has(savedAcquisition)
        ? savedAcquisition
        : shopEnabled ? "store" : "exclusive";
    const supplyLimitValue = Number(value?.supply_limit ?? value?.supplyLimit);
    return {
        type,
        id,
        label: name,
        name,
        description: String(value?.description || "").trim().slice(0, 300),
        category: String(value?.category || "Store").trim().slice(0, 40) || "Store",
        rarity: cleanRarity(value?.rarity),
        image: imageUrl,
        text: String(value?.title_text || value?.text || name).trim().slice(0, 48),
        inset: Math.min(30, Math.max(0, number(value?.border_inset ?? value?.inset))),
        unlock: acquisitionType === "default" ? "default" : acquisitionType === "store" ? "store" : "inventory",
        active: value?.active !== false,
        shopEnabled,
        acquisitionType,
        availableFrom: value?.available_from || value?.availableFrom || "",
        availableUntil: value?.available_until || value?.availableUntil || "",
        supplyLimit: Number.isInteger(supplyLimitValue) && supplyLimitValue > 0 ? supplyLimitValue : null,
        unitAmount: Math.max(0, Math.floor(number(value?.shop_unit_amount ?? value?.unitAmount))),
        currency: String(value?.shop_currency || value?.currency || "eur").trim().toLowerCase(),
        featured: Boolean(value?.shop_featured ?? value?.featured),
        sortOrder: Math.max(0, Math.floor(number(value?.sort_order ?? value?.sortOrder))),
        createdAt: value?.created_at || "",
        updatedAt: value?.updated_at || "",
        remoteCatalog: true
    };
}

function cosmeticCatalogCollection(type, { includeInactive = false } = {}) {
    let builtIn = [];
    if (type === "icon") builtIn = PROFILE_ICONS;
    if (type === "background") builtIn = PROFILE_BACKGROUNDS;
    if (type === "border") builtIn = PFP_BORDERS;
    if (type === "title") builtIn = PROFILE_TITLES;
    if (type === "badges") return BADGE_CATALOG;

    const merged = new Map(builtIn.map((item) => [item.id, item]));
    for (const item of state.store.catalogItems) {
        if (item.type !== type) continue;
        if (!includeInactive && !item.active) {
            merged.delete(item.id);
            continue;
        }
        merged.set(item.id, item);
    }
    return [...merged.values()];
}

function cosmeticCatalogKey(type, id) {
    return `${String(type || "").trim()}:${String(id || "").trim()}`;
}

function remoteCatalogItem(key) {
    return state.store.catalogItems.find((item) => cosmeticCatalogKey(item.type, item.id) === key) || null;
}

function catalogShopItems() {
    return state.store.catalogItems
        .filter(cosmeticCanAppearInShop)
        .map((item) => ({
            type: item.type,
            id: item.id,
            name: item.name,
            description: item.description || "Store-exclusive cosmetic.",
            rarity: item.rarity,
            unitAmount: item.unitAmount,
            currency: item.currency || "eur",
            featured: item.featured,
            sortOrder: item.sortOrder,
            purchasable: false,
            catalogDraft: true
        }));
}

function mergeStoreItems(catalogItems, paymentItems) {
    const merged = new Map(catalogItems.map((item) => [storeProductKey(item.type, item.id), item]));
    for (const item of paymentItems) {
        const key = storeProductKey(item.type, item.id);
        merged.set(key, { ...(merged.get(key) || {}), ...item });
    }
    return [...merged.values()];
}

async function loadStoreData({ force = false } = {}) {
    if (!isPlaytestAdmin()) return;
    if (state.store.loading || (state.store.loaded && !force)) return;
    state.store.loading = true;
    if (state.view === "store") renderStorePage();

    await loadCosmeticCatalog({ force });
    let items = catalogShopItems();
    let backendReady = false;
    let message = STORE_CHECKOUT_ENABLED ? "Checkout offline" : "Purchases are paused. This page is an admin-only preview.";

    if (state.authClient) {
        const catalogResult = await state.authClient
            .from("cosmetic_store_items")
            .select("cosmetic_type, cosmetic_id, name, description, rarity, unit_amount, currency, featured, sort_order")
            .eq("active", true)
            .order("sort_order", { ascending: true });

        if (!catalogResult.error) {
            const remoteItems = (catalogResult.data || [])
                .map((item) => normalizeStoreItem({ ...item, purchasable: true }))
                .filter(Boolean);
            items = mergeStoreItems(items, remoteItems);
            backendReady = STORE_CHECKOUT_ENABLED;
            if (STORE_CHECKOUT_ENABLED) message = "";
        }
    }

    state.store.items = items;
    state.store.backendReady = backendReady;
    state.store.loaded = true;
    state.store.loading = false;
    if (!state.store.purchasingKey && !state.store.message) {
        if (state.store.checkoutStatus === "cancelled") {
            state.store.message = "Checkout cancelled. No payment was made.";
            clearStoreCheckoutRoute();
        } else if (state.store.checkoutStatus === "success" && !isDiscordLoggedIn()) {
            state.store.message = "Log in with the Discord account that started checkout to finish delivery.";
        } else {
            state.store.message = message;
        }
    }
    if (state.view === "store") renderStorePage();
    if (STORE_CHECKOUT_ENABLED && state.store.checkoutStatus === "success" && isDiscordLoggedIn()) {
        await finalizeStoreCheckoutReturn();
    }
}

function normalizeStoreItem(value) {
    const type = String(value?.cosmetic_type || value?.type || "").trim();
    const id = String(value?.cosmetic_id || value?.id || "").trim();
    if (!STORE_CATEGORY_LABELS[type] || type === "all" || !id) return null;
    const catalogItem = cosmeticCatalogItem(type, id);
    if (!catalogItem || catalogItem.unlock !== "store" || !cosmeticCanAppearInShop(catalogItem)) return null;
    const unitAmount = Math.max(0, Math.floor(number(value?.unit_amount ?? value?.unitAmount)));
    const currency = String(value?.currency || "").trim().toLowerCase();
    if (unitAmount < 1 || !/^[a-z]{3}$/.test(currency)) return null;
    return {
        type,
        id,
        name: String(value?.name || catalogItem.label || "Cosmetic").trim().slice(0, 80),
        description: String(value?.description || "Store-exclusive cosmetic.").trim().slice(0, 240),
        rarity: cleanRarity(value?.rarity || catalogItem.rarity),
        unitAmount,
        currency,
        featured: Boolean(value?.featured),
        sortOrder: Math.max(0, Math.floor(number(value?.sort_order ?? value?.sortOrder))),
        purchasable: Boolean(value?.purchasable),
        catalogDraft: Boolean(value?.catalogDraft)
    };
}

function storeProducts() {
    return state.store.items
        .map(normalizeStoreItem)
        .filter(Boolean)
        .sort((a, b) => Number(b.featured) - Number(a.featured) || a.sortOrder - b.sortOrder || a.unitAmount - b.unitAmount);
}

function storeProduct(type, id) {
    return storeProducts().find((item) => item.type === type && item.id === id) || null;
}

function storeProductKey(type, id) {
    return `${type}:${id}`;
}

function formatStorePrice(product) {
    const currency = String(product?.currency || "EUR").toUpperCase();
    try {
        const formatter = new Intl.NumberFormat(undefined, { style: "currency", currency });
        const fractionDigits = formatter.resolvedOptions().maximumFractionDigits;
        return formatter.format(number(product?.unitAmount) / (10 ** fractionDigits));
    } catch (_error) {
        return `${formatNumber(product?.unitAmount)} ${currency}`;
    }
}

function renderStorePage() {
    const body = document.getElementById("store-body");
    if (!body) return;
    if (!state.authReady) {
        body.innerHTML = `<section class="store-access-state"><strong>Checking admin access...</strong></section>`;
        return;
    }
    if (!isPlaytestAdmin()) {
        body.innerHTML = "";
        enforceProtectedAdminRoute();
        return;
    }
    if (!state.store.loaded && !state.store.loading) void loadStoreData();

    const adminTab = ["preview", "catalog"].includes(state.store.adminTab) ? state.store.adminTab : "preview";
    const category = STORE_CATEGORY_LABELS[state.store.category] ? state.store.category : "all";
    const products = storeProducts().filter((item) => category === "all" || item.type === category);
    const checkoutLabel = STORE_CHECKOUT_ENABLED && state.store.backendReady ? "Test checkout enabled" : "Purchases paused";

    body.innerHTML = `
        <section class="store-heading">
            <div>
                <p class="panel-kicker">Admin Only</p>
                <h2>Cosmetic Catalog</h2>
                <p>Prepare profile cosmetics and future shop listings without publishing purchases.</p>
            </div>
            <div class="store-balance ${STORE_CHECKOUT_ENABLED && state.store.backendReady ? "ready" : ""}">
                <span>Store state</span>
                <strong>${escapeHtml(state.store.loading ? "Loading..." : checkoutLabel)}</strong>
            </div>
        </section>

        <nav class="store-admin-tabs" aria-label="Catalog admin views">
            <button type="button" data-store-admin-tab="preview" class="${adminTab === "preview" ? "active" : ""}" aria-pressed="${adminTab === "preview" ? "true" : "false"}">Shop preview</button>
            <button type="button" data-store-admin-tab="catalog" class="${adminTab === "catalog" ? "active" : ""}" aria-pressed="${adminTab === "catalog" ? "true" : "false"}">Manage catalog</button>
        </nav>

        ${state.store.message ? `<p class="store-status">${escapeHtml(state.store.message)}</p>` : ""}
        ${adminTab === "catalog"
            ? renderStoreCatalogAdmin()
            : renderStorePreview(category, products)}
    `;
}

function renderStorePreview(category, products) {
    return `
        <nav class="store-tabs" aria-label="Store categories">
            ${Object.entries(STORE_CATEGORY_LABELS).map(([id, label]) => `
                <button type="button" data-store-category="${escapeHtml(id)}" class="${category === id ? "active" : ""}" aria-pressed="${category === id ? "true" : "false"}">${escapeHtml(label)}</button>
            `).join("")}
        </nav>
        ${products.length
            ? `<section class="store-grid" aria-live="polite">${products.map(renderStoreCard).join("")}</section>`
            : `<section class="store-empty"><h3>${category === "all" ? "No shop items prepared yet" : `No ${escapeHtml(STORE_CATEGORY_LABELS[category].toLowerCase())} prepared yet`}</h3></section>`}
    `;
}

function renderStoreCatalogAdmin() {
    if (state.store.catalogLoading && !state.store.catalogLoaded) {
        return `<section class="store-access-state"><strong>Loading cosmetic catalog...</strong></section>`;
    }
    if (!state.store.catalogReady) {
        return `
            <section class="catalog-setup-required">
                <p class="panel-kicker">Unavailable</p>
                <h3>Catalog management is not configured</h3>
                <p>${escapeHtml(state.store.catalogMessage || "The cosmetic catalog table is unavailable.")}</p>
            </section>
        `;
    }

    const editing = remoteCatalogItem(state.store.editingKey);
    const items = [...state.store.catalogItems]
        .sort((a, b) => Number(b.active) - Number(a.active) || a.type.localeCompare(b.type) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    return `
        <section class="catalog-admin-toolbar">
            <div>
                <p class="panel-kicker">Database Catalog</p>
                <h3>${formatNumber(items.length)} managed cosmetics</h3>
            </div>
            <button type="button" data-store-catalog-new>New cosmetic</button>
        </section>
        <section class="catalog-admin-layout">
            ${renderCatalogEditor(editing)}
            <div class="catalog-admin-collection" aria-live="polite">
                ${items.length ? items.map(renderCatalogAdminItem).join("") : `<p class="mode-empty">No database cosmetics yet. Create the first one with the form.</p>`}
            </div>
        </section>
    `;
}

function renderCatalogEditor(item = null) {
    const editing = Boolean(item);
    const value = item || {
        type: "background",
        id: "",
        name: "",
        description: "",
        category: "Store",
        rarity: "common",
        image: "",
        text: "",
        inset: 0,
        active: true,
        acquisitionType: "exclusive",
        availableFrom: "",
        availableUntil: "",
        supplyLimit: null,
        shopEnabled: false,
        unitAmount: 499,
        currency: "eur",
        featured: false,
        sortOrder: 0
    };
    const price = (Math.max(0, value.unitAmount) / 100).toFixed(2);
    const typeField = editing
        ? `<input type="hidden" name="cosmeticType" value="${escapeHtml(value.type)}"><span class="catalog-locked-value">${escapeHtml(STORE_CATEGORY_LABELS[value.type] || value.type)}</span>`
        : `<select name="cosmeticType" required>${Object.entries(STORE_CATEGORY_LABELS).filter(([id]) => id !== "all").map(([id, label]) => `<option value="${escapeHtml(id)}" ${value.type === id ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select>`;
    const idField = editing
        ? `<input type="hidden" name="cosmeticId" value="${escapeHtml(value.id)}"><span class="catalog-locked-value"><code>${escapeHtml(value.id)}</code></span>`
        : `<input name="cosmeticId" required maxlength="64" pattern="[a-z0-9][a-z0-9_-]{0,63}" placeholder="founder_night" autocomplete="off">`;

    return `
        <form class="catalog-editor" data-catalog-form>
            <header>
                <div>
                    <p class="panel-kicker">${editing ? "Edit Cosmetic" : "New Cosmetic"}</p>
                    <h3>${escapeHtml(editing ? value.name : "Catalog details")}</h3>
                </div>
                ${editing ? `<button type="button" data-store-catalog-new>Clear</button>` : ""}
            </header>
            <div class="catalog-editor-preview ${escapeHtml(value.type)}-preview" data-catalog-preview>
                ${renderCatalogEditorPreview(value)}
            </div>
            <div class="catalog-form-grid">
                <label><span>Type</span>${typeField}</label>
                <label><span>Cosmetic ID</span>${idField}</label>
                <label class="wide"><span>Name</span><input name="name" required maxlength="80" value="${escapeHtml(value.name)}" placeholder="Founder Night"></label>
                <label class="wide"><span>Description</span><textarea name="description" maxlength="300" rows="3" placeholder="Shown in cosmetic details and the future shop.">${escapeHtml(value.description)}</textarea></label>
                <label><span>Category</span><input name="category" maxlength="40" value="${escapeHtml(value.category)}" placeholder="Store"></label>
                <label><span>Rarity</span><select name="rarity">${RARITY_ORDER.map((rarity) => `<option value="${rarity}" ${value.rarity === rarity ? "selected" : ""}>${RARITY_LABELS[rarity]}</option>`).join("")}</select></label>
                <label><span>How it is earned</span><select name="acquisitionType" data-catalog-acquisition ${state.store.catalogProgressionReady ? "" : "disabled"}>${COSMETIC_ACQUISITION_TYPES.map((option) => `<option value="${escapeHtml(option.value)}" ${value.acquisitionType === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select></label>
                <label><span>Supply limit</span><input name="supplyLimit" type="number" min="1" max="100000000" step="1" value="${escapeHtml(value.supplyLimit || "")}" placeholder="Unlimited" ${state.store.catalogProgressionReady ? "" : "disabled"}></label>
                <label><span>Available from</span><input name="availableFrom" type="datetime-local" value="${escapeHtml(catalogDateTimeInputValue(value.availableFrom))}" ${state.store.catalogProgressionReady ? "" : "disabled"}></label>
                <label><span>Available until</span><input name="availableUntil" type="datetime-local" value="${escapeHtml(catalogDateTimeInputValue(value.availableUntil))}" ${state.store.catalogProgressionReady ? "" : "disabled"}></label>
                <label><span>Title text</span><input name="titleText" maxlength="48" value="${escapeHtml(value.text)}" placeholder="Used only for title cosmetics"></label>
                <label><span>Border inset %</span><input name="borderInset" type="number" min="0" max="30" step="0.5" value="${escapeHtml(String(value.inset))}"></label>
                <label class="wide catalog-file-field">
                    <span>PNG, WebP or GIF asset</span>
                    <input type="file" name="asset" accept="image/png,image/webp,image/gif" data-catalog-asset-input>
                    <small>${escapeHtml(catalogAssetRecommendation(value.type))}</small>
                </label>
                <label><span>Sort order</span><input name="sortOrder" type="number" min="0" max="100000" step="1" value="${escapeHtml(String(value.sortOrder))}"></label>
                <label class="catalog-check"><input type="checkbox" name="active" ${value.active ? "checked" : ""}><span>Visible in collections</span></label>
            </div>
            <div class="catalog-shop-fields" data-catalog-shop-fields ${value.acquisitionType === "store" ? "" : "hidden"}>
                <label><span>Preview price</span><input name="shopPrice" type="number" min="0.01" max="10000" step="0.01" value="${escapeHtml(price)}"></label>
                <label><span>Currency</span><select name="shopCurrency">${["eur", "usd", "gbp"].map((currency) => `<option value="${currency}" ${value.currency === currency ? "selected" : ""}>${currency.toUpperCase()}</option>`).join("")}</select></label>
                <label class="catalog-check"><input type="checkbox" name="shopFeatured" ${value.featured ? "checked" : ""}><span>Featured listing</span></label>
            </div>
            <p class="catalog-form-status" data-catalog-form-status></p>
            <button class="catalog-save-button" type="submit" ${state.store.savingCatalog ? "disabled" : ""}>${state.store.savingCatalog ? "Saving..." : editing ? "Save changes" : "Create cosmetic"}</button>
        </form>
    `;
}

function renderCatalogEditorPreview(item) {
    if (item.type === "title") {
        return `<span class="profile-title-cosmetic rarity-${escapeHtml(cleanRarity(item.rarity))}">${escapeHtml(item.text || item.name || "Title preview")}</span>`;
    }
    if (item.image) {
        return `<img src="${escapeHtml(item.image)}" alt="" data-catalog-preview-image>`;
    }
    return `<span class="catalog-preview-empty" data-catalog-preview-empty>No asset selected</span>`;
}

function catalogAssetRecommendation(type) {
    if (type === "background") return "Recommended 1920x800 or 1600x500. Maximum 8 MB.";
    if (type === "border") return "Recommended 512x512 transparent square. Maximum 8 MB.";
    if (type === "icon") return "Recommended 512x512 square. Maximum 8 MB.";
    return "Title cosmetics use the title text field; an asset is optional.";
}

function catalogDateTimeInputValue(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return localDate.toISOString().slice(0, 16);
}

function catalogOptionalIsoDate(value) {
    const text = String(value || "").trim();
    if (!text) return null;
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) throw new Error("Enter a valid availability date and time.");
    return date.toISOString();
}

function renderCatalogAdminItem(item) {
    const price = item.shopEnabled && item.unitAmount > 0 ? formatStorePrice(item) : "Not listed";
    const status = item.active ? "Visible" : "Archived";
    const acquisition = progressionOptionLabel(COSMETIC_ACQUISITION_TYPES, item.acquisitionType, "Exclusive");
    const supply = item.supplyLimit ? `${formatNumber(item.supplyLimit)} total` : "Unlimited";
    return `
        <article class="catalog-admin-item rarity-${escapeHtml(item.rarity)} ${item.active ? "" : "inactive"}">
            <div class="catalog-admin-item-preview">${renderCatalogEditorPreview(item)}</div>
            <div class="catalog-admin-item-copy">
                <span>${escapeHtml(STORE_CATEGORY_LABELS[item.type] || item.type)} / ${escapeHtml(RARITY_LABELS[item.rarity])}</span>
                <strong>${escapeHtml(item.name)}</strong>
                <small>${escapeHtml(status)} / ${escapeHtml(acquisition)} / ${escapeHtml(supply)} / ${escapeHtml(price)}</small>
            </div>
            <div class="catalog-admin-item-actions">
                <button type="button" data-store-catalog-edit="${escapeHtml(cosmeticCatalogKey(item.type, item.id))}">Edit</button>
                <button type="button" data-store-catalog-toggle="${escapeHtml(cosmeticCatalogKey(item.type, item.id))}">${item.active ? "Archive" : "Restore"}</button>
            </div>
        </article>
    `;
}

async function submitCatalogForm(form) {
    if (!isPlaytestAdmin() || !state.authClient || !state.authSession?.user || state.store.savingCatalog) return;
    const values = new FormData(form);
    const type = String(values.get("cosmeticType") || "").trim().toLowerCase();
    const id = String(values.get("cosmeticId") || "").trim().toLowerCase();
    const key = cosmeticCatalogKey(type, id);
    const editing = remoteCatalogItem(state.store.editingKey);
    const status = form.querySelector("[data-catalog-form-status]");
    const submit = form.querySelector("button[type='submit']");

    try {
        if (!STORE_CATEGORY_LABELS[type] || type === "all") throw new Error("Choose a valid cosmetic type.");
        if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)) throw new Error("The ID can only use lowercase letters, numbers, _ and -.");
        if (!editing && remoteCatalogItem(key)) throw new Error("That cosmetic ID already exists. Open it from the collection to edit it.");
        const builtInCollision = cosmeticCatalogCollection(type, { includeInactive: true })
            .find((item) => item.id === id && !item.remoteCatalog);
        if (!editing && builtInCollision) throw new Error("That ID is already used by a built-in cosmetic.");

        const name = String(values.get("name") || "").trim().replace(/\s+/g, " ").slice(0, 80);
        if (!name) throw new Error("Enter a cosmetic name.");
        const acquisitionType = String(values.get("acquisitionType") || editing?.acquisitionType || "exclusive").trim();
        if (!COSMETIC_ACQUISITION_VALUES.has(acquisitionType)) throw new Error("Choose how this cosmetic is earned.");
        if (!state.store.catalogProgressionReady && acquisitionType !== (editing?.acquisitionType || "exclusive")) {
            throw new Error("Run the current Supabase progression setup before changing unlock behavior.");
        }
        const shopEnabled = acquisitionType === "store";
        const priceNumber = Number(values.get("shopPrice"));
        const unitAmount = shopEnabled ? Math.round(priceNumber * 100) : 0;
        if (shopEnabled && (!Number.isFinite(unitAmount) || unitAmount < 1)) throw new Error("Enter a shop preview price above zero.");

        state.store.savingCatalog = true;
        if (submit) {
            submit.disabled = true;
            submit.textContent = "Saving...";
        }
        if (status) {
            status.textContent = "Preparing cosmetic...";
            status.classList.remove("error");
        }

        let imageUrl = editing?.image || "";
        const asset = values.get("asset");
        if (asset instanceof File && asset.size > 0) {
            if (status) status.textContent = "Uploading asset...";
            imageUrl = await uploadCatalogAsset(asset, type, id);
        }
        if (type !== "title" && !imageUrl) throw new Error("Upload a PNG, WebP or GIF asset for this cosmetic.");

        if (status) status.textContent = "Saving cosmetic...";

        const availableFrom = catalogOptionalIsoDate(values.get("availableFrom"));
        const availableUntil = catalogOptionalIsoDate(values.get("availableUntil"));
        if (availableFrom && availableUntil && Date.parse(availableUntil) <= Date.parse(availableFrom)) {
            throw new Error("Available until must be later than available from.");
        }
        const supplyInput = String(values.get("supplyLimit") || "").trim();
        const supplyLimit = supplyInput ? Number(supplyInput) : null;
        if (supplyLimit !== null && (!Number.isInteger(supplyLimit) || supplyLimit < 1 || supplyLimit > 100_000_000)) {
            throw new Error("Supply limit must be a whole number above zero, or left empty.");
        }

        const now = new Date().toISOString();
        const payload = {
            cosmetic_type: type,
            cosmetic_id: id,
            name,
            description: String(values.get("description") || "").trim().slice(0, 300),
            category: String(values.get("category") || "Store").trim().replace(/\s+/g, " ").slice(0, 40) || "Store",
            rarity: cleanRarity(values.get("rarity")),
            image_url: imageUrl || null,
            title_text: type === "title" ? String(values.get("titleText") || name).trim().replace(/\s+/g, " ").slice(0, 48) || name : null,
            border_inset: type === "border" ? Math.min(30, Math.max(0, number(values.get("borderInset")))) : 0,
            active: values.get("active") === "on",
            shop_enabled: shopEnabled,
            shop_unit_amount: shopEnabled ? unitAmount : null,
            shop_currency: String(values.get("shopCurrency") || "eur").trim().toLowerCase(),
            shop_featured: shopEnabled && values.get("shopFeatured") === "on",
            sort_order: Math.min(100000, Math.max(0, Math.floor(number(values.get("sortOrder"))))),
            created_by: state.authSession.user.id,
            updated_at: now
        };
        if (state.store.catalogProgressionReady) {
            Object.assign(payload, {
                acquisition_type: acquisitionType,
                available_from: availableFrom,
                available_until: availableUntil,
                supply_limit: supplyLimit
            });
        }

        const result = await state.authClient
            .from(COSMETIC_CATALOG_TABLE)
            .upsert(payload, { onConflict: "cosmetic_type,cosmetic_id" })
            .select("cosmetic_type, cosmetic_id")
            .single();
        if (result.error) throw result.error;

        let reconciliation = null;
        if (state.store.catalogProgressionReady && state.progression.api) {
            if (acquisitionType !== "progression") {
                const ruleResult = await state.progression.api.deleteRuleForCosmetic(type, id);
                if (ruleResult.error) throw ruleResult.error;
            }
            reconciliation = await state.progression.api.reconcileCosmetic(type, id);
            if (reconciliation.error) throw reconciliation.error;
            state.progression.loaded = false;
        }

        state.store.editingKey = key;
        state.store.loaded = false;
        await loadStoreData({ force: true });
        if (reconciliation) await loadAccountProfiles();
        state.store.message = `${name} ${editing ? "updated" : "created"}.${reconciliation ? ` ${formatReconciliationResult(reconciliation.data)}` : ""}`;
    } catch (error) {
        console.error("Could not save cosmetic catalog item", error);
        if (status) {
            status.textContent = error?.message || "Could not save the cosmetic.";
            status.classList.add("error");
        }
        return;
    } finally {
        state.store.savingCatalog = false;
        if (submit) submit.disabled = false;
    }
    renderStorePage();
}

async function uploadCatalogAsset(file, type, id) {
    const extensions = {
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif"
    };
    const extension = extensions[file?.type];
    if (!extension) throw new Error("Only PNG, WebP and GIF assets are accepted.");
    if (file.size > 8 * 1024 * 1024) throw new Error("The cosmetic asset must be 8 MB or smaller.");

    const userId = state.authSession?.user?.id;
    if (!userId) throw new Error("Your Discord session expired. Log in again.");
    const objectPath = `${userId}/catalog/${type}/${id}/${Date.now()}.${extension}`;
    const upload = await state.authClient.storage
        .from(COSMETIC_MEDIA_BUCKET)
        .upload(objectPath, file, {
            cacheControl: "3600",
            contentType: file.type,
            upsert: false
        });
    if (upload.error) throw upload.error;
    const publicResult = state.authClient.storage.from(COSMETIC_MEDIA_BUCKET).getPublicUrl(objectPath);
    const publicUrl = String(publicResult?.data?.publicUrl || "").trim();
    if (!publicUrl) throw new Error("The asset uploaded, but its public URL could not be created.");
    return publicUrl;
}

function previewCatalogAsset(input) {
    const file = input?.files?.[0];
    const form = input?.closest("[data-catalog-form]");
    const preview = form?.querySelector("[data-catalog-preview]");
    const status = form?.querySelector("[data-catalog-form-status]");
    if (!file || !preview) return;
    if (!new Set(["image/png", "image/webp", "image/gif"]).has(file.type) || file.size > 8 * 1024 * 1024) {
        input.value = "";
        if (status) {
            status.textContent = file.size > 8 * 1024 * 1024 ? "The asset is larger than 8 MB." : "Only PNG, WebP and GIF assets are accepted.";
            status.classList.add("error");
        }
        return;
    }
    if (status) {
        status.textContent = "Preview updated. Save the cosmetic to upload it.";
        status.classList.remove("error");
    }
    const objectUrl = URL.createObjectURL(file);
    preview.innerHTML = `<img src="${escapeHtml(objectUrl)}" alt="" data-catalog-preview-image>`;
    preview.querySelector("img")?.addEventListener("load", () => URL.revokeObjectURL(objectUrl), { once: true });
}

async function toggleCatalogItemActive(key) {
    if (!isPlaytestAdmin() || !state.authClient || state.store.savingCatalog) return;
    const item = remoteCatalogItem(key);
    if (!item) return;
    state.store.savingCatalog = true;
    state.store.message = `${item.active ? "Archiving" : "Restoring"} ${item.name}...`;
    renderStorePage();
    try {
        const result = await state.authClient
            .from(COSMETIC_CATALOG_TABLE)
            .update({ active: !item.active, updated_at: new Date().toISOString() })
            .eq("cosmetic_type", item.type)
            .eq("cosmetic_id", item.id)
            .select("cosmetic_id")
            .single();
        if (result.error) throw result.error;
        let reconciliation = null;
        if (state.store.catalogProgressionReady && state.progression.api) {
            reconciliation = await state.progression.api.reconcileCosmetic(item.type, item.id);
            if (reconciliation.error) throw reconciliation.error;
            state.progression.loaded = false;
        }
        state.store.loaded = false;
        await loadStoreData({ force: true });
        if (reconciliation) await loadAccountProfiles();
        state.store.message = `${item.name} ${item.active ? "archived" : "restored"}.${reconciliation ? ` ${formatReconciliationResult(reconciliation.data)}` : ""}`;
    } catch (error) {
        console.error("Could not change cosmetic visibility", error);
        state.store.message = error?.message || "Could not update the cosmetic.";
    } finally {
        state.store.savingCatalog = false;
        renderStorePage();
    }
}

function renderStoreCard(product) {
    const item = cosmeticCatalogItem(product.type, product.id);
    if (!item) return "";
    const account = state.authProfile || {};
    const profile = linkedStatsProfile();
    const badgeState = accountBadgeState(account, profile);
    const owned = isDiscordLoggedIn() && cosmeticItemOwned(product.type, item, account, badgeState);
    const rarity = cleanRarity(product.rarity || item.rarity);
    const key = storeProductKey(product.type, product.id);
    const purchasing = state.store.purchasingKey === key;
    const description = `${RARITY_LABELS[rarity]} ${cosmeticTypeNoun(product.type)}`;
    const ownership = cosmeticOwnershipText(cosmeticOwnershipStats(product.type, product.id));
    const action = owned
        ? `<span class="store-owned">Owned</span>`
        : !STORE_CHECKOUT_ENABLED || !product.purchasable
            ? `<span class="store-preview-only">Preview only</span>`
            : !state.store.backendReady
                ? `<button type="button" disabled>Unavailable</button>`
                : `<button type="button" data-store-type="${escapeHtml(product.type)}" data-store-buy="${escapeHtml(product.id)}" ${purchasing ? "disabled" : ""}>${purchasing ? "Opening..." : "Buy"}</button>`;

    return `
        <article class="store-card rarity-${rarity} ${owned ? "owned" : ""} ${product.featured ? "featured" : ""}">
            <div class="store-product-preview" tabindex="0" aria-label="${escapeHtml(`${item.label}. ${description}. ${ownership}`)}" ${cosmeticOwnershipDataAttributes(product.type, product.id, item.label, description)}>
                ${renderCosmeticOptionMedia(product.type, item, account, profile)}
                ${product.featured ? `<span class="store-featured-label">Featured</span>` : ""}
            </div>
            <div class="store-card-copy">
                <div class="store-card-meta">
                    <span>${escapeHtml(RARITY_LABELS[rarity])}</span>
                    <span>${escapeHtml(STORE_CATEGORY_LABELS[product.type])}</span>
                </div>
                <h3>${escapeHtml(product.name || item.label)}</h3>
                <p class="store-card-description">${escapeHtml(product.description)}</p>
                <small>${escapeHtml(ownership)}</small>
            </div>
            <footer class="store-card-footer">
                <strong>${escapeHtml(formatStorePrice(product))}</strong>
                ${action}
            </footer>
        </article>
    `;
}

function openStorePurchaseDialog(type, id) {
    if (!STORE_CHECKOUT_ENABLED || !isPlaytestAdmin() || !isDiscordLoggedIn() || !state.store.backendReady) return;
    const product = storeProduct(type, id);
    const item = cosmeticCatalogItem(type, id);
    if (!product || !item) return;
    const badgeState = accountBadgeState(state.authProfile, linkedStatsProfile());
    if (cosmeticItemOwned(type, item, state.authProfile, badgeState)) return;
    state.store.pendingPurchase = { type, id };
    state.store.message = "";
    renderStorePurchaseDialog();
    window.requestAnimationFrame(() => document.querySelector("[data-store-purchase-confirm]")?.focus());
}

function closeStorePurchaseDialog() {
    if (state.store.purchasingKey) return;
    state.store.pendingPurchase = null;
    renderStorePurchaseDialog();
}

function renderStorePurchaseDialog() {
    let host = document.getElementById("store-purchase-dialog-host");
    if (!host) {
        host = document.createElement("div");
        host.id = "store-purchase-dialog-host";
        document.body.appendChild(host);
    }

    const pending = STORE_CHECKOUT_ENABLED && isPlaytestAdmin() ? state.store.pendingPurchase : null;
    const product = pending ? storeProduct(pending.type, pending.id) : null;
    const item = product ? cosmeticCatalogItem(product.type, product.id) : null;
    document.body.classList.toggle("store-purchase-open", Boolean(product && item));
    if (!product || !item) {
        host.innerHTML = "";
        return;
    }

    const account = state.authProfile || {};
    const profile = linkedStatsProfile();
    const purchasing = state.store.purchasingKey === storeProductKey(product.type, product.id);
    host.innerHTML = `
        <div class="store-purchase-backdrop" data-store-purchase-backdrop>
            <form class="store-purchase-dialog" data-store-purchase-form role="dialog" aria-modal="true" aria-labelledby="store-purchase-title">
                <header>
                    <div>
                        <p class="panel-kicker">Confirm Purchase</p>
                        <h3 id="store-purchase-title">${escapeHtml(product.name || item.label)}</h3>
                    </div>
                    <button type="button" class="modal-icon-button" data-store-purchase-close aria-label="Close purchase dialog" ${purchasing ? "disabled" : ""}>x</button>
                </header>
                <div class="store-purchase-product">
                    <div class="store-purchase-preview">${renderCosmeticOptionMedia(product.type, item, account, profile)}</div>
                    <dl>
                        <div><dt>Price</dt><dd>${escapeHtml(formatStorePrice(product))}</dd></div>
                        <div><dt>Type</dt><dd>${escapeHtml(cosmeticTypeNoun(product.type))}</dd></div>
                        <div><dt>Rarity</dt><dd>${escapeHtml(RARITY_LABELS[cleanRarity(product.rarity || item.rarity)])}</dd></div>
                        <div><dt>Payment</dt><dd>Stripe</dd></div>
                    </dl>
                </div>
                <p class="store-checkout-note">You will continue to Stripe to complete this one-time purchase.</p>
                <div class="store-purchase-actions">
                    <button type="button" data-store-purchase-close ${purchasing ? "disabled" : ""}>Cancel</button>
                    <button type="submit" data-store-purchase-confirm ${purchasing ? "disabled" : ""}>${purchasing ? "Opening checkout..." : "Continue to checkout"}</button>
                </div>
            </form>
        </div>
    `;
}

async function submitStorePurchase() {
    const pending = state.store.pendingPurchase;
    const product = pending ? storeProduct(pending.type, pending.id) : null;
    if (!STORE_CHECKOUT_ENABLED || !isPlaytestAdmin() || !product || !product.purchasable || !state.authClient || !state.authSession?.user || !state.store.backendReady || state.store.purchasingKey) return;

    const key = storeProductKey(product.type, product.id);
    state.store.purchasingKey = key;
    state.store.message = "";
    renderStorePurchaseDialog();
    renderStorePage();

    try {
        const { data, error } = await state.authClient.functions.invoke("create-cosmetic-checkout", {
            body: {
                cosmeticType: product.type,
                cosmeticId: product.id
            }
        });
        if (error) throw new Error(await storeFunctionErrorMessage(error, "Checkout could not be created."));
        let checkoutUrl;
        try {
            checkoutUrl = new URL(data?.url || "");
        } catch (error) {
            throw new Error("Checkout returned an invalid URL.", { cause: error });
        }
        if (checkoutUrl.protocol !== "https:") throw new Error("Checkout returned an insecure URL.");
        window.location.assign(checkoutUrl.href);
    } catch (error) {
        console.error("Cosmetic purchase failed", error);
        state.store.message = error?.message || "Checkout failed.";
    } finally {
        state.store.purchasingKey = "";
        render();
    }
}

async function storeFunctionErrorMessage(error, fallback) {
    try {
        const body = await error?.context?.json?.();
        if (body?.error) return String(body.error);
    } catch (_error) {
        // The generic function error below remains useful when no JSON body exists.
    }
    return String(error?.message || fallback);
}

async function finalizeStoreCheckoutReturn() {
    if (!STORE_CHECKOUT_ENABLED || !isPlaytestAdmin()) return;
    if (state.store.checkoutHandled || state.store.checkoutFinalizing) return;
    if (state.store.checkoutStatus !== "success" || !state.store.checkoutSessionId) return;
    if (!state.authClient || !state.authSession?.user) return;

    state.store.checkoutHandled = true;
    state.store.checkoutFinalizing = true;
    state.store.message = "Confirming payment and updating your collection...";
    if (state.view === "store") renderStorePage();

    try {
        const { data, error } = await state.authClient.functions.invoke("finalize-cosmetic-checkout", {
            body: { sessionId: state.store.checkoutSessionId }
        });
        if (error) throw new Error(await storeFunctionErrorMessage(error, "Payment could not be verified."));

        const ownProfile = await selectOwnProfile(state.authSession.user.id);
        if (ownProfile.error || !ownProfile.data) {
            throw ownProfile.error || new Error("Payment was verified, but the updated profile could not be loaded.");
        }
        state.authProfileExtended = ownProfile.extended;
        state.authCosmeticInventoryExtended = ownProfile.cosmeticsExtended;
        applyPlaytestProfile(ownProfile.data);
        await loadAccountProfiles();

        const type = String(data?.cosmetic_type || state.store.checkoutType || "");
        const id = String(data?.cosmetic_id || state.store.checkoutItemId || "");
        const item = cosmeticCatalogItem(type, id);
        state.store.pendingPurchase = null;
        state.store.message = `${item?.label || "Cosmetic"} added to your collection.`;
        clearStoreCheckoutRoute();
    } catch (error) {
        console.error("Cosmetic fulfillment failed", error);
        state.store.message = `${error?.message || "Payment verification failed."} Reload this page to retry; Stripe will not charge you again.`;
    } finally {
        state.store.checkoutFinalizing = false;
        if (state.view === "store") renderStorePage();
    }
}

function clearStoreCheckoutRoute() {
    state.store.checkoutStatus = "";
    state.store.checkoutSessionId = "";
    state.store.checkoutType = "";
    state.store.checkoutItemId = "";
    if (state.view !== "store") return;
    const cleanUrl = `${window.location.pathname}${window.location.search}#store`;
    window.history.replaceState(null, document.title, cleanUrl);
}

function renderAccountLoginPanel(message) {
    return `
        <section class="account-login-panel">
            <p class="panel-kicker">Account</p>
            <h2>Login with Discord</h2>
            <p>${escapeHtml(message)}</p>
            <button type="button" data-auth-login ${state.authReady ? "" : "disabled"}>Login with Discord</button>
            ${state.authMessage ? `<p class="identity-status">${escapeHtml(state.authMessage)}</p>` : ""}
        </section>
    `;
}

function renderAccountSignedDate(account) {
    const signedAt = account?.created_at || account?.createdAt;
    if (!signedAt) return "";
    return `
        <small class="account-signed-date" title="${escapeHtml(formatFullLocalDate(signedAt))}">
            Signed ${escapeHtml(formatAccountSignedDate(signedAt))} - ${escapeHtml(formatAccountAge(signedAt))}
        </small>
    `;
}

function renderAccountLinkPanel(account, linkedProfile) {
    return `
        <section class="account-panel">
            <div>
                <p class="panel-kicker">Minecraft Link</p>
                <h3>${linkedProfile ? "Connected" : "Not connected"}</h3>
            </div>
            ${linkedProfile ? `
                <div class="linked-player-card">
                    ${renderPlayerAvatar(linkedProfile, linkedProfile, 64, "linked-player-avatar")}
                    <div>
                        <strong>${escapeHtml(linkedProfile.name)}</strong>
                        <span>${escapeHtml(account.minecraft_player_uuid || "Linked through Discord bot")}</span>
                    </div>
                </div>
            ` : `
                <p class="mode-empty">Run <code>/linkminecraft</code> in Discord, then run the shown <code>/discordlink &lt;code&gt;</code> command in Minecraft while the bot and server are online.</p>
            `}
        </section>
    `;
}

function renderAccountStatsPanel(profile) {
    const br = normalizePlayer(profile.battleRoyale);
    const dm = normalizePlayer(profile.deathmatch);
    const name = playerDisplayName(profile, profile);
    return `
        <section class="account-panel">
            <div>
                <p class="panel-kicker">Tracked Profile</p>
                <h3>${escapeHtml(name)}</h3>
            </div>
            <div class="account-stat-grid">
                ${renderStatCard("BR Wins", br.stats.wins)}
                ${renderStatCard("BR Kills", br.stats.kills)}
                ${renderStatCard("DM Wins", dm.stats.wins)}
                ${renderStatCard("DM Kills", dm.stats.kills)}
            </div>
        </section>
    `;
}

function renderAccountCustomizeForm(account, badgeState) {
    const avatarSource = cleanAvatarSource(account.avatar_source);
    const background = cleanProfileBackground(account.profile_background, account, badgeState);
    const border = cleanPfpBorder(account.pfp_border, account, badgeState);
    const title = cleanProfileTitle(account.profile_title, account, badgeState);
    const selectedIds = selectedAccountBadgeIds(account, badgeState.unlockedIds);
    const linkedProfile = linkedStatsProfile();
    const avatarUrl = accountAvatarUrl(account, linkedProfile, 180);

    return `
        <form class="account-panel account-form" data-account-form>
            <div>
                <p class="panel-kicker">Personalization</p>
                <h3>Customize profile</h3>
            </div>
            <div class="account-customizer">
                <div class="account-custom-fields">
                    <label>
                        <span>Display name</span>
                        <input name="displayName" type="text" maxlength="32" value="${escapeHtml(account.display_name || account.username || "")}" placeholder="Display name">
                    </label>
                    <div class="cosmetic-field-grid">
                        ${renderCosmeticFieldButton("icon", "Icon", account, linkedProfile, badgeState, selectedIds)}
                        ${renderCosmeticFieldButton("background", "Background", account, linkedProfile, badgeState, selectedIds)}
                        ${renderCosmeticFieldButton("border", "Icon border", account, linkedProfile, badgeState, selectedIds)}
                        ${renderCosmeticFieldButton("title", "Title", account, linkedProfile, badgeState, selectedIds)}
                        ${renderCosmeticFieldButton("badges", "Badges", account, linkedProfile, badgeState, selectedIds)}
                    </div>
                    <div class="cosmetic-form-values" hidden>
                        <input type="hidden" name="avatarSource" value="${escapeHtml(avatarSource)}">
                        <input type="hidden" name="profileBackground" value="${escapeHtml(background)}">
                        <input type="hidden" name="pfpBorder" value="${escapeHtml(border)}">
                        <input type="hidden" name="profileTitle" value="${escapeHtml(title)}">
                        ${BADGE_CATALOG.map((badge) => {
                            const unlocked = badgeState.unlockedIds.has(badge.id);
                            return `<input type="checkbox" name="selectedBadges" value="${escapeHtml(badge.id)}" data-cosmetic-owned="${unlocked ? "true" : "false"}" ${selectedIds.has(badge.id) ? "checked" : ""} ${unlocked ? "" : "disabled"}>`;
                        }).join("")}
                    </div>
                </div>
                <aside class="account-custom-preview ${profileBackgroundClass(account)}"${profileBackgroundStyle(account)} aria-label="Profile preview" data-account-preview ${backgroundCosmeticOwnershipDataAttributes(account)}>
                    <span class="account-preview-avatar ${avatarFrameClass(account)}" data-account-preview-avatar${avatarFrameStyle(account)} ${avatarCosmeticOwnershipDataAttributes(account)}>
                        ${renderAvatarImage(avatarUrl, account, linkedProfile, 180, "eager", "data-account-preview-img")}
                    </span>
                    <div>
                        <p class="panel-kicker">Preview</p>
                        <strong data-account-preview-name>${escapeHtml(accountDisplayName(account))}</strong>
                        <div data-account-preview-title>${renderProfileTitle(account, { empty: true })}</div>
                        <span data-account-preview-meta>${escapeHtml(avatarSourceLabel(avatarSource))} - ${escapeHtml(backgroundLabel(background))} - ${escapeHtml(pfpBorderLabel(border))} - ${escapeHtml(profileTitleLabel(title))}</span>
                    </div>
                </aside>
            </div>
            <button type="submit" ${state.accountSaving || !state.authProfileExtended ? "disabled" : ""}>${state.accountSaving ? "Saving..." : "Save profile"}</button>
        </form>
    `;
}

function renderCosmeticFieldButton(type, label, account, profile, badgeState, selectedIds) {
    const disabled = type === "title" && !state.authCosmeticInventoryExtended;
    return `
        <button class="cosmetic-field-button" type="button" data-cosmetic-picker-open="${escapeHtml(type)}" aria-label="${escapeHtml(`Choose ${label.toLowerCase()}`)}" ${disabled ? "disabled" : ""}>
            <span class="cosmetic-field-media" data-cosmetic-field-media="${escapeHtml(type)}">
                ${renderCosmeticFieldMedia(type, account, profile, badgeState, selectedIds)}
            </span>
            <span class="cosmetic-field-copy">
                <small>${escapeHtml(label)}</small>
                <strong data-cosmetic-field-label="${escapeHtml(type)}">${escapeHtml(cosmeticSelectionLabel(type, account, selectedIds))}</strong>
            </span>
        </button>
    `;
}

function renderCosmeticFieldMedia(type, account, profile, badgeState, selectedIds) {
    if (type === "background") {
        const url = profileBackgroundImageUrl(account);
        return renderCosmeticImage(url, backgroundLabel(account?.profile_background), "background");
    }

    if (type === "border") {
        const avatarUrl = accountAvatarUrl(account, profile, 72);
        return `
            <span class="cosmetic-mini-avatar ${avatarFrameClass(account)}"${avatarFrameStyle(account)}>
                ${renderAvatarImage(avatarUrl, account, profile, 72)}
            </span>
        `;
    }

    if (type === "title") {
        return `<span class="cosmetic-mini-title">${renderProfileTitle(account, { empty: true, compact: true, interactive: false })}</span>`;
    }

    if (type === "badges") {
        const ids = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
        const badges = BADGE_CATALOG
            .filter((badge) => ids.has(badge.id))
            .slice(0, 3)
            .map((badge) => badgeDisplay(badge, badgeState.context, true));
        return `
            <span class="cosmetic-mini-badges">
                ${badges.length ? badges.map(renderBadgeIcon).join("") : `<span class="cosmetic-empty-count">0</span>`}
            </span>
        `;
    }

    const avatarUrl = accountAvatarUrl(account, profile, 72);
    return renderCosmeticImage(avatarUrl, avatarSourceLabel(account?.avatar_source), "icon");
}

function renderCosmeticImage(url, label, mediaClass = "") {
    const safeUrl = String(url || "").trim();
    return `
        <span class="cosmetic-image ${escapeHtml(mediaClass)}">
            ${safeUrl ? `<img src="${escapeHtml(safeUrl)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.hidden=true;this.nextElementSibling.hidden=false;">` : ""}
            <span class="cosmetic-image-fallback" ${safeUrl ? "hidden" : ""}>${escapeHtml(badgeInitials(label || "Cosmetic"))}</span>
        </span>
    `;
}

function cosmeticSelectionLabel(type, account, selectedIds = new Set()) {
    if (type === "icon") return avatarSourceLabel(cleanAvatarSource(account?.avatar_source));
    if (type === "background") return backgroundLabel(cleanProfileBackground(account?.profile_background, account));
    if (type === "border") return pfpBorderLabel(cleanPfpBorder(account?.pfp_border, account));
    if (type === "title") return profileTitleLabel(cleanProfileTitle(account?.profile_title, account));
    const count = selectedIds instanceof Set ? selectedIds.size : new Set(selectedIds || []).size;
    return `${count} / 5 equipped`;
}

function updateCosmeticFieldButtons(form, account, profile, badgeState) {
    const selectedIds = new Set([...form.querySelectorAll("input[name='selectedBadges']:checked")].map((input) => input.value));
    for (const type of ["icon", "background", "border", "title", "badges"]) {
        const media = form.querySelector(`[data-cosmetic-field-media='${type}']`);
        if (media) media.innerHTML = renderCosmeticFieldMedia(type, account, profile, badgeState, selectedIds);
        const label = form.querySelector(`[data-cosmetic-field-label='${type}']`);
        if (label) label.textContent = cosmeticSelectionLabel(type, account, selectedIds);
    }
}

function openCosmeticPicker(type) {
    if (!["icon", "background", "border", "title", "badges"].includes(type)) return;
    if (type === "title" && !state.authCosmeticInventoryExtended) return;
    if (!isDiscordLoggedIn() || !document.querySelector("[data-account-form]")) return;
    state.cosmeticPicker.type = type;
    renderCosmeticPicker();
    window.requestAnimationFrame(() => document.querySelector("[data-cosmetic-picker-close]")?.focus());
}

function closeCosmeticPicker() {
    const type = state.cosmeticPicker.type;
    state.cosmeticPicker.type = "";
    document.body.classList.remove("cosmetic-picker-open");
    hideBadgeProgressTooltip();
    const host = document.getElementById("cosmetic-picker-host");
    if (host) host.innerHTML = "";
    window.requestAnimationFrame(() => document.querySelector(`[data-cosmetic-picker-open='${type}']`)?.focus());
}

function renderCosmeticPicker(preserveScroll = false) {
    const host = cosmeticPickerHost();
    if (!host) return;
    const type = state.cosmeticPicker.type;
    const form = document.querySelector("[data-account-form]");
    if (!["icon", "background", "border", "title", "badges"].includes(type) || !form || state.view !== "account") {
        host.innerHTML = "";
        document.body.classList.remove("cosmetic-picker-open");
        if (!form || state.view !== "account") state.cosmeticPicker.type = "";
        return;
    }

    hideBadgeProgressTooltip();
    const previousScrollTop = preserveScroll ? host.querySelector("[data-cosmetic-picker-scroll]")?.scrollTop || 0 : 0;
    const account = state.authProfile || {};
    const profile = linkedStatsProfile();
    const badgeState = accountBadgeState(account, profile);
    const draft = readAccountFormDraft(form);
    const selectedIds = new Set(draft.selectedBadges);
    const previewAccount = {
        ...account,
        display_name: String(draft.displayName || "").trim() || accountDisplayName(account),
        avatar_source: draft.avatarSource,
        profile_background: draft.profileBackground,
        pfp_border: draft.pfpBorder,
        profile_title: draft.profileTitle
    };
    const items = cosmeticPickerItems(type, account).map((item) => {
        const owned = cosmeticItemOwned(type, item, account, badgeState);
        const selected = cosmeticOptionSelected(type, item.id, draft, selectedIds);
        return {
            ...item,
            rarity: cleanRarity(item.rarity),
            owned,
            selected,
            displayItem: type === "badges" ? badgeDisplay(item, badgeState.context, owned) : item
        };
    });
    const visibleItems = items.filter((item) => state.cosmeticPicker.showUnowned || item.owned || item.selected);

    host.innerHTML = `
        <div class="cosmetic-picker-backdrop" data-cosmetic-picker-backdrop>
            <section class="cosmetic-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="cosmetic-picker-title">
                <header class="cosmetic-picker-header">
                    <div>
                        <p class="panel-kicker">Profile cosmetics</p>
                        <h3 id="cosmetic-picker-title">${escapeHtml(cosmeticTypeTitle(type))}</h3>
                    </div>
                    <button type="button" class="modal-icon-button" data-cosmetic-picker-close aria-label="Close cosmetic picker">x</button>
                </header>
                <div class="cosmetic-picker-scroll" data-cosmetic-picker-scroll>
                    ${renderCosmeticPickerPreview(previewAccount, profile, badgeState, selectedIds, type)}
                    <div class="cosmetic-picker-controls">
                        <label class="cosmetic-owned-toggle">
                            <input type="checkbox" data-cosmetic-show-unowned ${state.cosmeticPicker.showUnowned ? "checked" : ""}>
                            <span>Show unowned</span>
                        </label>
                        <button type="button" data-cosmetic-sort>${state.cosmeticPicker.rarityDirection === "asc" ? "Rarity: Common first" : "Rarity: Mythic first"}</button>
                    </div>
                    <div class="cosmetic-collection">
                        ${renderCosmeticGroups(type, visibleItems, previewAccount, profile, badgeState, selectedIds)}
                    </div>
                </div>
            </section>
        </div>
    `;
    const scroll = host.querySelector("[data-cosmetic-picker-scroll]");
    if (scroll) scroll.scrollTop = previousScrollTop;
    document.body.classList.add("cosmetic-picker-open");
}

function cosmeticPickerHost() {
    let host = document.getElementById("cosmetic-picker-host");
    if (host) return host;
    if (!document.body) return null;
    host = document.createElement("div");
    host.id = "cosmetic-picker-host";
    document.body.appendChild(host);
    return host;
}

function renderCosmeticPickerPreview(account, profile, badgeState, selectedIds, type) {
    const avatarUrl = accountAvatarUrl(account, profile, 112);
    const badges = BADGE_CATALOG
        .filter((badge) => selectedIds.has(badge.id))
        .slice(0, 5)
        .map((badge) => badgeDisplay(badge, badgeState.context, true));
    return `
        <section class="cosmetic-picker-preview ${profileBackgroundClass(account)}"${profileBackgroundStyle(account)} aria-label="Current cosmetic preview" ${backgroundCosmeticOwnershipDataAttributes(account)}>
            <div class="cosmetic-picker-preview-identity">
                <span class="cosmetic-picker-preview-avatar ${avatarFrameClass(account)}"${avatarFrameStyle(account)} ${avatarCosmeticOwnershipDataAttributes(account)}>
                    ${renderAvatarImage(avatarUrl, account, profile, 112, "eager")}
                </span>
                <div>
                    <small>${escapeHtml(cosmeticTypeTitle(type))}</small>
                    <strong>${escapeHtml(accountDisplayName(account))}</strong>
                    ${renderProfileTitle(account, { empty: true })}
                    <div class="account-badge-row compact">
                        ${badges.length ? badges.map(renderProfileBadge).join("") : `<span class="profile-badge empty">No badges equipped</span>`}
                    </div>
                </div>
            </div>
            <span class="cosmetic-preview-selection">${escapeHtml(cosmeticSelectionLabel(type, account, selectedIds))}</span>
        </section>
    `;
}

function cosmeticPickerItems(type, account) {
    if (type === "icon") {
        const legacy = account?.custom_avatar_url
            ? [{ id: "custom", label: "Uploaded icon", category: "Legacy", rarity: "common", image: account.custom_avatar_url, unlock: "custom" }]
            : [];
        return [...cosmeticCatalogCollection("icon"), ...legacy];
    }
    if (type === "background") {
        return cosmeticCatalogCollection("background")
            .filter((item) => item.id !== "custom" || Boolean(account?.custom_background_url))
            .map((item) => item.id === "custom"
                ? { ...item, label: "Uploaded background", category: "Legacy" }
                : item);
    }
    if (type === "border") return cosmeticCatalogCollection("border");
    if (type === "title") return cosmeticCatalogCollection("title");
    return BADGE_CATALOG;
}

function cosmeticItemOwned(type, item, account, badgeState) {
    if (type === "icon") return profileIconUnlocked(item.id, account, badgeState);
    if (type === "background") return profileBackgroundUnlocked(item.id, account, badgeState);
    if (type === "border") return pfpBorderUnlocked(item.id, account, badgeState);
    if (type === "title") return profileTitleUnlocked(item.id, account, badgeState);
    return badgeState.unlockedIds.has(item.id);
}

function cosmeticOptionSelected(type, id, draft, selectedIds) {
    if (type === "icon") return draft.avatarSource === id;
    if (type === "background") return draft.profileBackground === id;
    if (type === "border") return draft.pfpBorder === id;
    if (type === "title") return draft.profileTitle === id;
    return selectedIds.has(id);
}

function renderCosmeticGroups(type, items, account, profile, badgeState, selectedIds) {
    if (!items.length) return `<p class="mode-empty">No owned cosmetics in this collection.</p>`;
    if (type === "badges") {
        const rarities = state.cosmeticPicker.rarityDirection === "asc" ? [...RARITY_ORDER] : [...RARITY_ORDER].reverse();
        return rarities.map((rarity) => {
            const group = items
                .filter((item) => item.rarity === rarity)
                .sort((a, b) => a.label.localeCompare(b.label));
            return group.length ? renderCosmeticGroup(RARITY_LABELS[rarity], type, group, account, profile, badgeState, selectedIds) : "";
        }).join("");
    }

    const categories = [...new Set(items.map((item) => item.category || "Other"))]
        .sort((a, b) => cosmeticCategoryRank(a) - cosmeticCategoryRank(b) || a.localeCompare(b));
    return categories.map((category) => {
        const group = items
            .filter((item) => (item.category || "Other") === category)
            .sort(cosmeticRarityCompare);
        return renderCosmeticGroup(category, type, group, account, profile, badgeState, selectedIds);
    }).join("");
}

function renderCosmeticGroup(label, type, items, account, profile, badgeState, selectedIds) {
    return `
        <section class="cosmetic-group">
            <div class="cosmetic-group-heading">
                <h4>${escapeHtml(label)}</h4>
                <span>${items.length}</span>
            </div>
            <div class="cosmetic-grid ${type === "background" ? "background-grid" : ""}">
                ${items.map((item) => renderCosmeticOption(type, item, account, profile, badgeState, selectedIds)).join("")}
            </div>
        </section>
    `;
}

function renderCosmeticOption(type, item, account, profile, badgeState, selectedIds) {
    const rarity = cleanRarity(item.rarity);
    const selectionFull = type === "badges" && selectedIds.size >= 5 && !item.selected;
    const unavailable = !item.owned || selectionFull;
    const isNew = type === "badges" && item.owned && isBadgeNew(account, item.id);
    const displayItem = item.displayItem || item;
    const badgeAttributes = type === "badges"
        ? `data-badge-id="${escapeHtml(item.id)}" ${badgeProgressDataAttributes(displayItem)}`
        : "";
    const ownershipAttributes = cosmeticOwnershipDataAttributes(
        type,
        item.id,
        item.label,
        item.description || `${RARITY_LABELS[rarity]} ${cosmeticTypeNoun(type)}`
    );
    const stateLabel = item.selected ? (type === "badges" ? "Equipped" : "Selected") : item.owned ? "Owned" : "Unowned";
    return `
        <button type="button"
            class="cosmetic-option rarity-${rarity} ${item.selected ? "selected" : ""} ${item.owned ? "owned" : "unowned"} ${isNew ? "badge-new" : ""}"
            data-cosmetic-type="${escapeHtml(type)}"
            data-cosmetic-option="${escapeHtml(item.id)}"
            data-cosmetic-owned="${item.owned ? "true" : "false"}"
            aria-pressed="${item.selected ? "true" : "false"}"
            aria-disabled="${unavailable ? "true" : "false"}"
            ${badgeAttributes}
            ${ownershipAttributes}>
            ${renderCosmeticOptionMedia(type, displayItem, account, profile)}
            <span class="cosmetic-option-copy">
                <strong>${escapeHtml(item.label)}</strong>
                <small><span>${escapeHtml(RARITY_LABELS[rarity])}</span><span>${escapeHtml(stateLabel)}</span></small>
            </span>
        </button>
    `;
}

function renderCosmeticOptionMedia(type, item, account, profile) {
    if (type === "badges") {
        return `<span class="cosmetic-option-media badge-media">${renderBadgeIcon(item)}</span>`;
    }
    if (type === "border") {
        const avatarUrl = accountAvatarUrl(account, profile, 96);
        const hasFrame = item.id !== "none" && item.image;
        const frameStyle = hasFrame
            ? ` style="--avatar-frame-image: url('${escapeHtml(safeCssUrl(item.image))}'); --avatar-frame-inset: ${number(item.inset)}%"`
            : "";
        return `
            <span class="cosmetic-option-media border-media">
                <span class="cosmetic-option-avatar ${hasFrame ? "avatar-frame-image" : ""}"${frameStyle}>
                    ${renderAvatarImage(avatarUrl, account, profile, 96)}
                </span>
            </span>
        `;
    }
    if (type === "title") {
        return `
            <span class="cosmetic-option-media title-media">
                ${renderTitleCosmetic(item, { empty: true, large: true, interactive: false })}
            </span>
        `;
    }
    const url = type === "icon"
        ? profileIconOptionUrl(item, account, profile, 160)
        : profileBackgroundOptionUrl(item, account);
    return `<span class="cosmetic-option-media ${escapeHtml(type)}-media">${renderCosmeticImage(url, item.label, type)}</span>`;
}

function profileIconOptionUrl(item, account, profile, size) {
    if (item.id === "discord") return account?.avatar_url || skinHeadUrl(accountMinecraftName(account, profile), size);
    if (item.id === "minecraft") return skinHeadUrl(accountMinecraftName(account, profile), size);
    if (item.id === "custom") return account?.custom_avatar_url || "";
    return item.image || "";
}

function profileBackgroundOptionUrl(item, account) {
    if (item.id === "custom") return account?.custom_background_url || "";
    return item.image || "";
}

function cosmeticCategoryRank(category) {
    const index = COSMETIC_CATEGORY_ORDER.indexOf(category);
    return index < 0 ? COSMETIC_CATEGORY_ORDER.length : index;
}

function cosmeticRarityCompare(a, b) {
    const direction = state.cosmeticPicker.rarityDirection === "desc" ? -1 : 1;
    const rarityDifference = RARITY_ORDER.indexOf(cleanRarity(a.rarity)) - RARITY_ORDER.indexOf(cleanRarity(b.rarity));
    return rarityDifference * direction || a.label.localeCompare(b.label);
}

function cosmeticTypeTitle(type) {
    if (type === "icon") return "Choose icon";
    if (type === "background") return "Choose background";
    if (type === "border") return "Choose icon border";
    if (type === "title") return "Choose title";
    return "Equip badges";
}

function cosmeticTypeNoun(type) {
    if (type === "icon") return "profile icon";
    if (type === "background") return "profile background";
    if (type === "border") return "icon border";
    if (type === "title") return "profile title";
    return "badge";
}

function selectCosmeticOption(type, id) {
    if (type !== state.cosmeticPicker.type) return;
    const form = document.querySelector("[data-account-form]");
    if (!form) return;
    const account = state.authProfile || {};
    const profile = linkedStatsProfile();
    const badgeState = accountBadgeState(account, profile);
    const item = cosmeticPickerItems(type, account).find((entry) => entry.id === id);
    if (!item || !cosmeticItemOwned(type, item, account, badgeState)) return;

    if (type === "badges") {
        const inputs = [...form.querySelectorAll("input[name='selectedBadges']")];
        const input = inputs.find((entry) => entry.value === id);
        if (!input) return;
        const selectedCount = inputs.filter((entry) => entry.checked).length;
        if (!input.checked && selectedCount >= 5) return;
        input.checked = !input.checked;
        enforceBadgeSelectionLimit(form, input);
    } else {
        const fieldName = type === "icon"
            ? "avatarSource"
            : type === "background"
                ? "profileBackground"
                : type === "border"
                    ? "pfpBorder"
                    : "profileTitle";
        const input = form.elements[fieldName];
        if (!input) return;
        input.value = id;
    }

    updateAccountCustomizePreview(form);
    renderCosmeticPicker(true);
}

function enforceBadgeSelectionLimit(form, changedInput) {
    const inputs = [...form.querySelectorAll("input[name='selectedBadges']")];
    let selected = inputs.filter((input) => input.checked);
    if (selected.length > 5 && changedInput) {
        changedInput.checked = false;
        selected = inputs.filter((input) => input.checked);
    }
    const selectionFull = selected.length >= 5;
    for (const input of inputs) {
        const locked = input.dataset.cosmeticOwned === "false";
        input.disabled = Boolean(locked || (selectionFull && !input.checked));
    }
}

function updateAccountCustomizePreview(form) {
    if (!form) return;
    const preview = form.querySelector("[data-account-preview]");
    if (!preview) return;

    const account = state.authProfile || {};
    const linkedProfile = linkedStatsProfile();
    const badgeState = accountBadgeState(account, linkedProfile);
    const avatarSource = cleanAvatarSource(form.elements.avatarSource?.value);
    const background = cleanProfileBackground(form.elements.profileBackground?.value, account, badgeState);
    const border = cleanPfpBorder(form.elements.pfpBorder?.value, account, badgeState);
    const title = cleanProfileTitle(form.elements.profileTitle?.value, account, badgeState);
    const displayName = String(form.elements.displayName?.value || "").trim().replace(/\s+/g, " ") || accountDisplayName(account);
    const previewAccount = {
        ...account,
        display_name: displayName,
        avatar_source: avatarSource,
        profile_background: background,
        pfp_border: border,
        profile_title: title
    };

    const image = preview.querySelector("[data-account-preview-img]");
    const avatarUrl = accountPreviewAvatarUrl(previewAccount, account, linkedProfile, 180);
    setAvatarFallbacks(image, avatarUrl, previewAccount, linkedProfile, 180);
    if (image && image.getAttribute("src") !== avatarUrl) {
        image.src = avatarUrl;
    }

    const avatarFrame = preview.querySelector("[data-account-preview-avatar]");
    replaceClassPrefix(avatarFrame, "avatar-frame-", avatarFrameClass(previewAccount));
    setAvatarFrameImage(avatarFrame, previewAccount);
    setCosmeticTooltipData(avatarFrame, avatarCosmeticOwnershipTooltip(previewAccount));
    replaceClassPrefix(preview, "profile-bg-", profileBackgroundClass(previewAccount));
    setCosmeticTooltipData(preview, backgroundCosmeticOwnershipTooltip(previewAccount));

    const backgroundUrl = profileBackgroundImageUrl(previewAccount);
    if (backgroundUrl) {
        preview.style.setProperty("--profile-bg-image", `url('${backgroundUrl}')`);
    } else {
        preview.style.removeProperty("--profile-bg-image");
    }

    const name = preview.querySelector("[data-account-preview-name]");
    if (name) name.textContent = displayName;
    const titleHost = preview.querySelector("[data-account-preview-title]");
    if (titleHost) titleHost.innerHTML = renderProfileTitle(previewAccount, { empty: true });
    const meta = preview.querySelector("[data-account-preview-meta]");
    if (meta) meta.textContent = `${avatarSourceLabel(avatarSource)} - ${backgroundLabel(background)} - ${pfpBorderLabel(border)} - ${profileTitleLabel(title)}`;

    updateCosmeticFieldButtons(form, previewAccount, linkedProfile, badgeState);
}

function accountPreviewAvatarUrl(previewAccount, savedAccount, profile, size) {
    if (cleanAvatarSource(previewAccount?.avatar_source) === "custom" && !previewAccount?.custom_avatar_url) {
        return accountAvatarUrl(savedAccount, profile, size);
    }
    return accountAvatarUrl(previewAccount, profile, size);
}

function replaceClassPrefix(element, prefix, nextClass) {
    if (!element) return;
    for (const className of [...element.classList]) {
        if (className.startsWith(prefix)) element.classList.remove(className);
    }
    if (nextClass) element.classList.add(nextClass);
}

function renderWeeklyMissions(profile) {
    const missionState = state.weeklyMissions;
    if (missionState.loading && !missionState.row) {
        return `
            <section class="profile-drawer-missions">
                <div class="mission-head">
                    <div>
                        <p class="panel-kicker">Renewable Missions</p>
                        <h3>Preparing weekly rotation...</h3>
                    </div>
                </div>
            </section>
        `;
    }

    const row = missionState.row;
    const missions = Array.isArray(row?.missions) ? row.missions : [];
    if (!missions.length) {
        return `
            <section class="profile-drawer-missions">
                <div class="mission-head">
                    <div>
                        <p class="panel-kicker">Renewable Missions</p>
                        <h3>Weekly rotation unavailable</h3>
                    </div>
                </div>
                <p class="mode-empty">${escapeHtml(missionState.message || (profile ? "Missions will appear when the current stats finish loading." : "Your starter missions are being created. Link Minecraft to begin tracking progress."))}</p>
            </section>
        `;
    }

    const claimedIds = new Set(arrayField(row.claimed_ids));
    const completed = missions.filter((mission) => weeklyMissionProgress(profile, mission).complete).length;
    const cycle = weeklyMissionCycle();
    return `
        <section class="profile-drawer-missions weekly-missions-panel">
            <div class="mission-head">
                <div>
                    <p class="panel-kicker">Renewable Missions</p>
                    <h3>Weekly rotation</h3>
                    <span>Resets ${escapeHtml(formatFullLocalDate(cycle.endsAt))}</span>
                </div>
                <strong>${completed} / ${missions.length}</strong>
            </div>
            <div class="weekly-mission-summary">
                <span><b>4</b> easy</span>
                <span><b>3</b> hard</span>
                <span><b>${formatNumber(missions.reduce((sum, mission) => sum + number(mission.xp), 0))}</b> XP available</span>
            </div>
            ${profile ? "" : `<p class="weekly-mission-link-note">Link Minecraft to begin tracking mission progress. Your mission baselines will be set when the account is linked.</p>`}
            <p class="weekly-mission-rule">Untouched missions rotate every week. If you cannot finish a mission by the end of the week, it will not change once you have started it. You can manually swap that mission once. This balances the fact that the server is not online 24/7 yet.</p>
            <div class="mission-list">
                ${missions.map((mission) => renderWeeklyMissionRow(profile, mission, claimedIds)).join("")}
            </div>
            ${missionState.message ? `<p class="mode-empty">${escapeHtml(missionState.message)}</p>` : ""}
        </section>
    `;
}

function renderWeeklyMissionRow(profile, mission, claimedIds) {
    const progress = weeklyMissionProgress(profile, mission);
    const claimed = claimedIds.has(mission.id);
    const claiming = state.weeklyMissions.claimingId === mission.id;
    const animating = state.weeklyMissions.animatingId === mission.id;
    const communityBanned = isCurrentAccountCommunityBanned();
    const canSwap = Boolean(mission.carried) && !mission.swapUsed && !claimed && !communityBanned;
    const action = claimed
        ? `<span class="mission-xp claimed">Claimed</span>`
        : progress.complete
            ? `<button class="mission-claim-button" type="button" data-weekly-claim="${escapeHtml(mission.id)}" ${claiming || communityBanned || state.weeklyMissions.source !== "supabase" ? "disabled" : ""}>${claiming ? "Claiming..." : `Claim ${formatNumber(mission.xp)} XP`}</button>`
            : canSwap
                ? `<button class="mission-swap-button" type="button" data-weekly-swap="${escapeHtml(mission.id)}" ${state.weeklyMissions.source !== "supabase" ? "disabled" : ""}>Swap</button>`
                : `<span class="mission-xp">+${formatNumber(mission.xp)} XP</span>`;
    return `
        <article class="mission-row weekly-mission-row ${progress.complete ? "complete" : ""} ${mission.carried ? "carried" : ""} ${animating ? "rewarding" : ""}">
            <div>
                <span class="mission-difficulty ${escapeHtml(mission.difficulty)}">${escapeHtml(mission.difficulty)}</span>
                <strong>${escapeHtml(mission.label)}</strong>
                <span>${escapeHtml(mission.description)}</span>
                ${mission.carried ? `<small class="mission-carried-note">Carried over - progress preserved</small>` : ""}
            </div>
            <div class="mission-progress">
                <i style="width: ${Math.min(100, Math.round(progress.progress * 100))}%"></i>
            </div>
            <small>${escapeHtml(progress.status)}</small>
            <div class="mission-actions">
                ${action}
                ${animating ? `<span class="mission-claim-burst">+${formatNumber(mission.xp)} XP</span>` : ""}
            </div>
        </article>
    `;
}

function resetWeeklyMissionState() {
    state.weeklyMissions = {
        loading: false,
        syncing: false,
        templates: [],
        templatesLoaded: false,
        templatesLoading: false,
        templatesReady: false,
        row: null,
        source: "",
        message: "",
        claimingId: "",
        animatingId: "",
        swapMissionId: "",
        swapping: false
    };
}

async function syncWeeklyMissions() {
    const missionState = state.weeklyMissions;
    const account = state.authProfile;
    const profile = linkedStatsProfile();
    if (missionState.syncing || !state.authClient || !state.authSession?.user || !account?.id || !state.data) return;
    if (isCurrentAccountCommunityBanned()) {
        missionState.loading = false;
        missionState.message = "Community access is blocked for this account.";
        renderAccountMissionViews();
        return;
    }

    await loadWeeklyMissionTemplates();
    if (missionState.syncing) return;

    const cycle = weeklyMissionCycle();
    if (missionState.source === "local"
        && missionState.row?.cycle_key === cycle.key
        && !(missionState.row.awaiting_link && profile)) return;
    missionState.syncing = true;
    missionState.loading = !missionState.row || missionState.row.cycle_key !== cycle.key;
    renderAccountMissionViews();

    try {
        let row = missionState.row?.cycle_key === cycle.key ? missionState.row : null;
        if (!row || (row.awaiting_link && profile)) row = await loadRemoteWeeklyMissionRow(account, profile, cycle);
        missionState.row = normalizeWeeklyMissionRow(row);
        missionState.source = "supabase";
        missionState.message = "";
    } catch (error) {
        console.warn("Weekly mission persistence is not available", error);
        missionState.row = loadLocalWeeklyMissionRow(account, profile, cycle);
        missionState.source = "local";
        missionState.message = "Preview mode: run supabase-weekly-missions.sql to save mission progress and receive XP.";
    } finally {
        missionState.loading = false;
        missionState.syncing = false;
        renderAccountMissionViews();
    }
}

function renderAccountMissionViews() {
    if (state.view === "account") renderAccountPage();
    if (state.accountPanelOpen) renderAccountSidePanel();
}

async function loadRemoteWeeklyMissionRow(account, profile, cycle) {
    const columns = "user_id, cycle_key, cycle_ends_at, missions, claimed_ids, swapped_ids, awaiting_link, created_at, updated_at";
    const existing = await state.authClient
        .from("profile_weekly_missions")
        .select(columns)
        .eq("user_id", account.id)
        .eq("cycle_key", cycle.key)
        .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) {
        const needsInitialization = !Array.isArray(existing.data.missions)
            || existing.data.missions.length !== WEEKLY_MISSION_COUNT
            || (existing.data.awaiting_link && profile);
        if (!needsInitialization) return existing.data;
        return initializeRemoteWeeklyMissionRow(account, profile, cycle, columns);
    }

    const previousResult = await state.authClient
        .from("profile_weekly_missions")
        .select(columns)
        .eq("user_id", account.id)
        .lt("cycle_key", cycle.key)
        .order("cycle_key", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (previousResult.error) throw previousResult.error;

    const freshMissions = generateWeeklyMissions(account, profile, cycle);
    const missions = renewWeeklyMissions(previousResult.data, freshMissions, profile, cycle);
    const inserted = await state.authClient
        .from("profile_weekly_missions")
        .insert({
            user_id: account.id,
            cycle_key: cycle.key,
            cycle_ends_at: cycle.endsAt,
            missions,
            claimed_ids: [],
            swapped_ids: [],
            awaiting_link: !profile
        })
        .select(columns)
        .single();
    if (inserted.error) {
        const raced = await state.authClient
            .from("profile_weekly_missions")
            .select(columns)
            .eq("user_id", account.id)
            .eq("cycle_key", cycle.key)
            .maybeSingle();
        if (raced.error || !raced.data) throw inserted.error;
        return raced.data;
    }
    return inserted.data;
}

async function initializeRemoteWeeklyMissionRow(account, profile, cycle, columns) {
    const missions = generateWeeklyMissions(account, profile, cycle);
    const initialized = await state.authClient.rpc("initialize_weekly_missions", {
        p_cycle_key: cycle.key,
        p_cycle_ends_at: cycle.endsAt,
        p_missions: missions,
        p_awaiting_link: !profile
    });
    if (initialized.error) throw initialized.error;

    const refreshed = await state.authClient
        .from("profile_weekly_missions")
        .select(columns)
        .eq("user_id", account.id)
        .eq("cycle_key", cycle.key)
        .single();
    if (refreshed.error) throw refreshed.error;
    return refreshed.data;
}

function loadLocalWeeklyMissionRow(account, profile, cycle) {
    const storageId = `${account.id}:${cycle.key}`;
    try {
        const parsed = JSON.parse(window.localStorage?.getItem(WEEKLY_MISSION_STORAGE_KEY) || "{}");
        const existing = parsed?.[storageId];
        if (existing?.cycle_key === cycle.key && Array.isArray(existing.missions)) {
            return normalizeWeeklyMissionRow(existing);
        }
        const previous = Object.values(parsed)
            .filter((entry) => entry?.user_id === account.id && entry?.cycle_key < cycle.key)
            .sort((a, b) => String(b.cycle_key).localeCompare(String(a.cycle_key)))[0] || null;
        const freshMissions = generateWeeklyMissions(account, profile, cycle);
        const row = {
            user_id: account.id,
            cycle_key: cycle.key,
            cycle_ends_at: cycle.endsAt,
            missions: renewWeeklyMissions(previous, freshMissions, profile, cycle),
            claimed_ids: [],
            swapped_ids: [],
            awaiting_link: !profile
        };
        parsed[storageId] = row;
        window.localStorage?.setItem(WEEKLY_MISSION_STORAGE_KEY, JSON.stringify(parsed));
        return row;
    } catch (_error) {
        return {
            user_id: account.id,
            cycle_key: cycle.key,
            cycle_ends_at: cycle.endsAt,
            missions: generateWeeklyMissions(account, profile, cycle),
            claimed_ids: [],
            swapped_ids: [],
            awaiting_link: !profile
        };
    }
}

function normalizeWeeklyMissionRow(row) {
    return {
        ...row,
        missions: Array.isArray(row?.missions) ? row.missions.slice(0, WEEKLY_MISSION_COUNT) : [],
        claimed_ids: arrayField(row?.claimed_ids),
        swapped_ids: arrayField(row?.swapped_ids),
        awaiting_link: Boolean(row?.awaiting_link)
    };
}

function renewWeeklyMissions(previousRow, freshMissions, profile, cycle) {
    if (!previousRow?.missions?.length) return freshMissions;
    const claimedIds = new Set(arrayField(previousRow.claimed_ids));
    return freshMissions.map((freshMission, index) => {
        const previous = previousRow.missions[index];
        if (!previous || previous.difficulty !== freshMission.difficulty || claimedIds.has(previous.id)) return freshMission;
        const progress = weeklyMissionProgress(profile, previous);
        if (progress.value <= 0) return freshMission;
        return {
            ...previous,
            carried: true,
            carriedFrom: previous.carriedFrom || previousRow.cycle_key,
            carriedAt: cycle.startsAt
        };
    });
}

async function claimWeeklyMission(missionId) {
    const missionState = state.weeklyMissions;
    const profile = linkedStatsProfile();
    if (!missionId || isCurrentAccountCommunityBanned() || missionState.claimingId
        || missionState.source !== "supabase" || !missionState.row || !profile) return;
    const claimedIds = new Set(arrayField(missionState.row.claimed_ids));
    const mission = missionState.row.missions.find((entry) => entry.id === missionId);
    if (!mission || claimedIds.has(mission.id) || !weeklyMissionProgress(profile, mission).complete) return;

    missionState.claimingId = mission.id;
    renderAccountMissionViews();
    try {
        const { data, error } = await state.authClient.rpc("claim_weekly_mission", {
            p_cycle_key: missionState.row.cycle_key,
            p_mission_id: mission.id
        });
        if (error) throw error;
        claimedIds.add(mission.id);
        missionState.row.claimed_ids = [...claimedIds];
        const xp = number(Array.isArray(data) ? data[0] : data);
        if (xp || data === 0) applyAccountXp(xp);
        missionState.message = "";
        missionState.animatingId = mission.id;
        window.setTimeout(() => {
            if (state.weeklyMissions.animatingId !== mission.id) return;
            state.weeklyMissions.animatingId = "";
            renderAccountMissionViews();
        }, 1400);
    } catch (error) {
        missionState.message = "That mission could not be claimed. Check the weekly mission Supabase function.";
        console.warn("Could not claim weekly mission", mission.id, error);
    } finally {
        missionState.claimingId = "";
        renderAccountMissionViews();
    }
}

function applyAccountXp(xp) {
    if (!state.authProfile) return;
    state.authProfile = { ...state.authProfile, xp };
    state.accountProfiles = state.accountProfiles.map((account) => (
        account.id === state.authProfile.id ? { ...account, xp } : account
    ));
    rebuildAccountProfileIndex();
}

function openWeeklyMissionSwapDialog(missionId) {
    const mission = state.weeklyMissions.row?.missions?.find((entry) => entry.id === missionId);
    if (!mission?.carried || mission.swapUsed || state.weeklyMissions.row?.claimed_ids?.includes(missionId)) return;
    state.weeklyMissions.swapMissionId = missionId;
    renderWeeklyMissionSwapDialog();
}

function closeWeeklyMissionSwapDialog() {
    if (state.weeklyMissions.swapping) return;
    state.weeklyMissions.swapMissionId = "";
    renderWeeklyMissionSwapDialog();
}

function renderWeeklyMissionSwapDialog() {
    let host = document.getElementById("weekly-mission-dialog-host");
    if (!host) {
        host = document.createElement("div");
        host.id = "weekly-mission-dialog-host";
        document.body.appendChild(host);
    }

    const missionId = state.weeklyMissions.swapMissionId;
    const mission = state.weeklyMissions.row?.missions?.find((entry) => entry.id === missionId);
    if (!mission) {
        host.innerHTML = "";
        return;
    }

    host.innerHTML = `
        <div class="account-upload-backdrop" data-weekly-swap-backdrop>
            <form class="account-upload-dialog weekly-swap-dialog" data-weekly-swap-form>
                <div class="date-card-topline">
                    <p class="panel-kicker">Swap Mission</p>
                    <button type="button" class="modal-icon-button" data-weekly-swap-close aria-label="Close swap confirmation">x</button>
                </div>
                <h3>Replace ${escapeHtml(mission.label)}?</h3>
                <p>Your current progress will be discarded. The replacement will have the same difficulty and will start from your current stats. This mission slot can only be swapped once.</p>
                <div class="date-admin-actions modal-actions">
                    <button type="button" data-weekly-swap-close ${state.weeklyMissions.swapping ? "disabled" : ""}>Cancel</button>
                    <button type="submit" ${state.weeklyMissions.swapping ? "disabled" : ""}>${state.weeklyMissions.swapping ? "Swapping..." : "Swap mission"}</button>
                </div>
            </form>
        </div>
    `;
}

async function submitWeeklyMissionSwap() {
    const missionState = state.weeklyMissions;
    const profile = linkedStatsProfile();
    const mission = missionState.row?.missions?.find((entry) => entry.id === missionState.swapMissionId);
    if (isCurrentAccountCommunityBanned() || missionState.swapping || missionState.source !== "supabase"
        || !mission?.carried || mission.swapUsed || !profile) return;

    const replacement = generateWeeklyMissionReplacement(mission, profile);
    if (!replacement) {
        missionState.message = "No different mission is available for this slot right now.";
        closeWeeklyMissionSwapDialog();
        renderAccountMissionViews();
        return;
    }

    missionState.swapping = true;
    renderWeeklyMissionSwapDialog();
    try {
        const { data, error } = await state.authClient.rpc("swap_weekly_mission", {
            p_cycle_key: missionState.row.cycle_key,
            p_mission_id: mission.id,
            p_replacement: replacement
        });
        if (error) throw error;
        missionState.row.missions = Array.isArray(data) ? data : replacementMissionLocally(missionState.row.missions, mission.id, replacement);
        missionState.row.swapped_ids = [...new Set([...arrayField(missionState.row.swapped_ids), mission.id])];
        missionState.message = "Mission swapped. The new mission starts from your current stats.";
        missionState.swapMissionId = "";
    } catch (error) {
        missionState.message = "That mission could not be swapped. Check the weekly mission Supabase function.";
        console.warn("Could not swap weekly mission", mission.id, error);
    } finally {
        missionState.swapping = false;
        renderWeeklyMissionSwapDialog();
        renderAccountMissionViews();
    }
}

function generateWeeklyMissionReplacement(mission, profile) {
    const cycle = weeklyMissionCycle();
    const rng = seededRandom(`${state.authProfile?.id}:${cycle.key}:${mission.id}:${Date.now()}`);
    const usedFamilies = new Set((state.weeklyMissions.row?.missions || []).map((entry) => entry.family));
    const candidates = shuffleWithRandom(weeklyMissionCandidates(profile, mission.difficulty, rng), rng);
    const candidate = candidates.find((entry) => entry.family !== mission.family && !usedFamilies.has(entry.family))
        || candidates.find((entry) => entry.family !== mission.family);
    if (!candidate) return null;
    const replacement = {
        ...candidate,
        id: `${cycle.key}-${mission.difficulty}-swap-${Date.now()}`,
        baseline: weeklyMissionMetric(profile, candidate),
        swapUsed: true,
        swappedFrom: mission.id
    };
    return replacement;
}

function replacementMissionLocally(missions, missionId, replacement) {
    return (missions || []).map((mission) => mission.id === missionId ? replacement : mission);
}

function weeklyMissionCycle(now = new Date()) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const daysSinceMonday = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - daysSinceMonday);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const key = [
        start.getFullYear(),
        String(start.getMonth() + 1).padStart(2, "0"),
        String(start.getDate()).padStart(2, "0")
    ].join("-");
    return { key, startsAt: start.toISOString(), endsAt: end.toISOString() };
}

function generateWeeklyMissions(account, profile, cycle) {
    const rng = seededRandom(`${account.id}:${cycle.key}`);
    const easy = pickWeeklyMissions(weeklyMissionCandidates(profile, "easy", rng), WEEKLY_EASY_MISSION_COUNT, rng);
    const hard = pickWeeklyMissions(
        weeklyMissionCandidates(profile, "hard", rng),
        WEEKLY_MISSION_COUNT - WEEKLY_EASY_MISSION_COUNT,
        rng
    );
    return [...easy, ...hard].map((mission, index) => ({
        ...mission,
        id: `${cycle.key}-${mission.difficulty}-${index + 1}-${mission.family}`,
        baseline: weeklyMissionMetric(profile, mission)
    }));
}

function pickWeeklyMissions(candidates, count, rng) {
    const shuffled = shuffleWithRandom(candidates.filter(Boolean), rng);
    const selected = [];
    const families = new Set();
    for (const mission of shuffled) {
        if (families.has(mission.family)) continue;
        selected.push(mission);
        families.add(mission.family);
        if (selected.length >= count) break;
    }
    return selected;
}

function weeklyMissionCandidates(profile, difficulty, rng) {
    const requiredCount = difficulty === "easy" ? WEEKLY_EASY_MISSION_COUNT : WEEKLY_MISSION_COUNT - WEEKLY_EASY_MISSION_COUNT;
    const managed = state.weeklyMissions.templates
        .filter((template) => template.active && template.difficulty === difficulty)
        .map((template) => expandWeeklyMissionTemplate(template, profile, rng))
        .filter(Boolean);
    const managedFamilies = new Set(managed.map((mission) => mission.family));
    if (state.weeklyMissions.templatesReady && managedFamilies.size >= requiredCount) return managed;

    const fallback = fallbackWeeklyMissionCandidates(profile, difficulty, rng)
        .filter((mission) => !managedFamilies.has(mission.family));
    return [...managed, ...fallback];
}

function expandWeeklyMissionTemplate(template, profile, rng) {
    const randomMode = randomChoice(MISSION_MODES, rng);
    const selectedMode = template.mode === "random"
        ? randomMode
        : MISSION_MODES.find((entry) => entry.id === template.mode) || {
            id: "overall",
            label: "any mode",
            short: "All"
        };
    let mode = selectedMode.id;
    let weaponId = "";
    let weaponLabel = "weapon";
    let category = "";

    if (template.weaponScope === "exact_weapon") {
        weaponId = template.weaponId;
        const weapon = weeklyWeaponEntries(profile, mode).find((entry) => entry.id === weaponId)
            || weeklyWeaponEntries(profile, "overall").find((entry) => entry.id === weaponId);
        weaponLabel = weapon?.label || labelFromIdentifier(weaponId);
    } else if (template.weaponScope === "random_weapon") {
        let weapons = weeklyEligibleWeapons(profile, mode);
        if (!weapons.length && mode !== "overall") {
            weapons = weeklyEligibleWeapons(profile, "overall");
            mode = "overall";
        }
        const weapon = randomChoice(weapons, rng);
        if (!weapon) return null;
        weaponId = weapon.id;
        weaponLabel = weapon.label;
    } else if (template.weaponScope === "weapon_category") {
        category = template.weaponCategory;
    } else if (template.weaponScope === "random_category") {
        let categories = weeklyAvailableCategories(profile, mode);
        if (!categories.length && mode !== "overall") {
            categories = weeklyAvailableCategories(profile, "overall");
            mode = "overall";
        }
        category = randomChoice(categories, rng);
        if (!category) return null;
    }

    const resolvedMode = mode === "overall"
        ? { id: "overall", label: "any mode", short: "All" }
        : MISSION_MODES.find((entry) => entry.id === mode) || selectedMode;
    const tokens = {
        "{mode}": resolvedMode.label,
        "{mode_short}": resolvedMode.short,
        "{weapon}": weaponLabel,
        "{category}": weeklyCategoryLabel(category)
    };
    return {
        ...weeklyMission(
            template.family,
            template.difficulty,
            weeklyTemplateText(template.label, tokens),
            weeklyTemplateText(template.description, tokens),
            template.metric,
            template.target,
            template.xp,
            { mode, weaponId, category }
        ),
        templateId: template.id
    };
}

function weeklyTemplateText(value, tokens) {
    return Object.entries(tokens).reduce(
        (text, [token, replacement]) => text.split(token).join(replacement),
        String(value || "")
    );
}

function fallbackWeeklyMissionCandidates(profile, difficulty, rng) {
    const mode = randomChoice(MISSION_MODES, rng);
    const otherMode = MISSION_MODES.find((entry) => entry.id !== mode.id);
    const modeWeapons = weeklyEligibleWeapons(profile, mode.id);
    const weaponMode = modeWeapons.length ? mode.id : "overall";
    const weapon = randomChoice(modeWeapons.length ? modeWeapons : weeklyEligibleWeapons(profile, "overall"), rng);
    const modeCategories = weeklyAvailableCategories(profile, mode.id);
    const categoryMode = modeCategories.length ? mode.id : "overall";
    const category = randomChoice(modeCategories.length ? modeCategories : weeklyAvailableCategories(profile, "overall"), rng);
    const isEasy = difficulty === "easy";
    const missions = isEasy
        ? [
            weeklyMission("matches_any", difficulty, "Play the Field", "Play 2 tracked matches.", "games", 2, 300, { mode: "overall" }),
            weeklyMission("matches_mode", difficulty, `${mode.short} Warm-up`, `Play 1 ${mode.label} match.`, "games", 1, 300, { mode: mode.id }),
            weeklyMission("kills_any", difficulty, "On the Board", "Get 5 kills in any mode.", "kills", 5, 350, { mode: "overall" }),
            weeklyMission("kills_mode", difficulty, `${mode.short} Eliminations`, `Get 4 kills in ${mode.label}.`, "kills", 4, 400, { mode: mode.id }),
            weeklyMission("hits_mode", difficulty, `${mode.short} Pressure`, `Land 25 hits in ${mode.label}.`, "hits", 25, 350, { mode: mode.id }),
            weeklyMission("headshots", difficulty, "Keep It High", "Land 5 headshots in any mode.", "headshots", 5, 400, { mode: "overall" }),
            weeklyMission("headshot_kills", difficulty, "Clean Finish", "Get 2 headshot kills in any mode.", "headshotKills", 2, 450, { mode: "overall" }),
            weeklyMission("playtime", difficulty, "Stay in the Fight", "Play for 15 tracked minutes.", "playtimeSeconds", 900, 350, { mode: "overall" }),
            weeklyMission("utility", difficulty, "Utility Check", "Get 1 utility kill.", "utilityKills", 1, 500, { mode: "overall" }),
            weapon ? weeklyMission("weapon_hits", difficulty, `${weapon.label} Practice`, `Land 15 hits with the ${weapon.label}.`, "hits", 15, 450, { mode: weaponMode, weaponId: weapon.id }) : null,
            category ? weeklyMission("category_hits", difficulty, `${weeklyCategoryLabel(category)} Practice`, `Land 25 hits with ${weeklyCategoryLabel(category).toLowerCase()} weapons.`, "hits", 25, 450, { mode: categoryMode, category }) : null,
            weeklyMission("other_mode_hits", difficulty, `${otherMode.short} Switch-up`, `Land 20 hits in ${otherMode.label}.`, "hits", 20, 375, { mode: otherMode.id })
        ]
        : [
            weeklyMission("matches_mode_hard", difficulty, `${mode.short} Regular`, `Play 5 ${mode.label} matches.`, "games", 5, 900, { mode: mode.id }),
            weeklyMission("kills_any_hard", difficulty, "Heavy Week", "Get 30 kills in any mode.", "kills", 30, 1000, { mode: "overall" }),
            weeklyMission("kills_mode_hard", difficulty, `${mode.short} Specialist`, `Get 20 kills in ${mode.label}.`, "kills", 20, 1100, { mode: mode.id }),
            weeklyMission("hits_hard", difficulty, "Suppressing Fire", "Land 125 hits in any mode.", "hits", 125, 900, { mode: "overall" }),
            weeklyMission("headshots_hard", difficulty, "Above the Shoulders", "Land 25 headshots in any mode.", "headshots", 25, 1000, { mode: "overall" }),
            weeklyMission("headshot_kills_hard", difficulty, "Precision Week", "Get 8 headshot kills in any mode.", "headshotKills", 8, 1100, { mode: "overall" }),
            weeklyMission("win_mode", difficulty, `${mode.short} Victory`, `Win 1 ${mode.label} match.`, "wins", 1, 1200, { mode: mode.id }),
            weeklyStatSupported(profile, mode.id, "mvp")
                ? weeklyMission("mvp_mode", difficulty, `${mode.short} Standout`, `Earn MVP once in ${mode.label}.`, "mvp", 1, 1300, { mode: mode.id })
                : null,
            weeklyMission("playtime_hard", difficulty, "Full Session", "Play for 60 tracked minutes.", "playtimeSeconds", 3600, 900, { mode: "overall" }),
            weeklyMission("utility_hard", difficulty, "Utility Expert", "Get 3 utility kills.", "utilityKills", 3, 1200, { mode: "overall" }),
            weeklyMission("vehicle_hard", difficulty, "Anti-Vehicle", "Get 1 vehicle kill.", "vehicleKills", 1, 1400, { mode: "overall" }),
            weapon ? weeklyMission("weapon_kills", difficulty, `${weapon.label} Mastery`, `Get 10 kills with the ${weapon.label}.`, "kills", 10, 1200, { mode: weaponMode, weaponId: weapon.id }) : null,
            category ? weeklyMission("category_kills", difficulty, `${weeklyCategoryLabel(category)} Mastery`, `Get 15 kills with ${weeklyCategoryLabel(category).toLowerCase()} weapons.`, "kills", 15, 1200, { mode: categoryMode, category }) : null
        ];
    return missions.filter(Boolean);
}

function weeklyMission(family, difficulty, label, description, metric, target, xp, options = {}) {
    return {
        family,
        difficulty,
        label,
        description,
        metric,
        target,
        xp,
        mode: options.mode || "overall",
        weaponId: options.weaponId || "",
        category: options.category || ""
    };
}

function weeklyStatSupported(profile, mode, metric) {
    const stats = mode === "battleRoyale"
        ? profile?.battleRoyale?.stats
        : mode === "deathmatch"
            ? profile?.deathmatch?.stats
            : null;
    if (!stats) return false;
    if (metric === "mvp") {
        return ["mvp", "mvps", "mvpCount", "mvpAwards"].some((key) => Object.hasOwn(stats, key));
    }
    return Object.hasOwn(stats, metric);
}

function weeklyMissionProgress(profile, mission) {
    const current = weeklyMissionMetric(profile, mission);
    const value = Math.max(0, current - number(mission.baseline));
    const target = Math.max(1, number(mission.target));
    const complete = value >= target;
    const formatter = mission.metric === "playtimeSeconds" ? formatDuration : formatNumber;
    return {
        value,
        target,
        complete,
        progress: value / target,
        status: complete ? "Complete" : `${formatter(value)} / ${formatter(target)}`
    };
}

function weeklyMissionMetric(profile, mission) {
    if (!profile || !mission) return 0;
    if (mission.weaponId || mission.category) {
        const entries = weeklyWeaponEntries(profile, mission.mode);
        return entries.reduce((sum, entry) => {
            if (mission.weaponId && entry.id !== mission.weaponId) return sum;
            if (mission.category && weeklyWeaponCategory(entry) !== mission.category) return sum;
            return sum + number(normalizeStats(entry.stats)[mission.metric]);
        }, 0);
    }
    const player = mission.mode === "battleRoyale"
        ? normalizePlayer(profile.battleRoyale)
        : mission.mode === "deathmatch"
            ? normalizePlayer(profile.deathmatch)
            : buildProfileOverall(profile);
    return number(normalizeStats(player?.stats)[mission.metric]);
}

function weeklyEligibleWeapons(profile, mode) {
    return weeklyWeaponEntries(profile, mode)
        .filter((entry) => weeklyWeaponCategory(entry) !== "utility")
        .sort((a, b) => normalizeStats(b.stats).hits - normalizeStats(a.stats).hits);
}

function weeklyAvailableCategories(profile, mode) {
    return [...new Set(weeklyEligibleWeapons(profile, mode).map(weeklyWeaponCategory).filter(Boolean))];
}

function weeklyWeaponEntries(profile, mode) {
    if (!profile) return [];
    if (mode === "battleRoyale") return cleanWeaponEntries(profile?.battleRoyale?.details?.weapons || []);
    if (mode === "deathmatch") return cleanWeaponEntries(profile?.deathmatch?.details?.weapons || []);
    return combinedWeapons(profile);
}

function weeklyWeaponCategory(entry) {
    const value = `${entry?.id || ""} ${entry?.label || ""}`.toLowerCase();
    if (/grenade|smoke|knife|m320|launcher|mine|c4|rocket/.test(value)) return "utility";
    if (/m1014|shotgun/.test(value)) return "shotgun";
    if (/minigun|rpk|machine.?gun|lmg/.test(value)) return "lmg";
    if (/uzi|p90|smg|mp5|vector/.test(value)) return "smg";
    if (/deagle|b93|glock|m1911|pistol|revolver/.test(value)) return "pistol";
    if (/awp|mk14|bocek|sniper|marksman|crossbow/.test(value)) return "marksman";
    return "rifle";
}

function weeklyCategoryLabel(category) {
    return {
        rifle: "Rifle",
        smg: "SMG",
        pistol: "Pistol",
        marksman: "Marksman",
        shotgun: "Shotgun",
        lmg: "LMG",
        utility: "Utility"
    }[category] || labelFromIdentifier(category);
}

function seededRandom(seed) {
    let value = 2166136261;
    for (const char of String(seed)) {
        value ^= char.charCodeAt(0);
        value = Math.imul(value, 16777619);
    }
    return () => {
        value += 0x6D2B79F5;
        let result = value;
        result = Math.imul(result ^ (result >>> 15), result | 1);
        result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
        return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffleWithRandom(entries, rng) {
    const shuffled = [...entries];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(rng() * (index + 1));
        [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
    }
    return shuffled;
}

function randomChoice(entries, rng) {
    if (!entries?.length) return null;
    return entries[Math.floor(rng() * entries.length)] || entries[0];
}

function avatarSourceLabel(value) {
    if (value === "custom") return "Uploaded icon";
    return cosmeticCatalogItem("icon", value)?.label || "Minecraft skin";
}

function backgroundLabel(value) {
    return cosmeticCatalogItem("background", value)?.label || "Default";
}

function pfpBorderLabel(value) {
    return cosmeticCatalogItem("border", value)?.label || "None";
}

function profileTitleLabel(value) {
    return cosmeticCatalogItem("title", value)?.label || "No title";
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
    const account = accountProfileForPlayer(player, profile);
    const name = playerDisplayName(player, profile);
    const modeTab = modeId === "deathmatch" ? "deathmatch" : "battleRoyale";

    return `
        <a class="featured-player podium-rank-${rank}" href="#player=${encodeURIComponent(player.playerId)}&tab=${encodeURIComponent(modeTab)}">
            ${renderPlayerAvatar(player, profile, 96, "featured-avatar")}
            <div class="featured-player-main">
                <div>
                    <span class="rank-badge rank-${Math.min(rank, 3)}">${rank}</span>
                    <strong>${escapeHtml(name)}</strong>
                </div>
                ${renderProfileTitle(account, { compact: true, focusable: false })}
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
        const status = state.playtests.remoteLoading
            ? "Loading public playtests..."
            : state.playtests.remoteError || "No active playtests.";
        container.innerHTML = `<section class="playtest-side-block"><p class="mode-empty">${escapeHtml(status)}</p></section>`;
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
    const noPlaytest = !playtest;
    container.innerHTML = `
        <section class="playtest-side-block admin-draft-block">
            <details>
                <summary>Admin controls</summary>
                <div class="admin-action-grid">
                    <button type="button" data-route="community-dates">Community calendar</button>
                    <button type="button" data-playtest-admin="reload">Reload calendar</button>
                    <button type="button" data-playtest-admin="duplicate" ${noPlaytest ? "disabled" : ""}>Duplicate</button>
                    <button type="button" data-playtest-admin="${isClosed ? "reopen" : "close"}" ${noPlaytest ? "disabled" : ""}>${isClosed ? "Reopen" : "Close voting"}</button>
                    <button type="button" data-playtest-admin="${isFrozen ? "unfreeze" : "freeze"}" ${noPlaytest ? "disabled" : ""}>${isFrozen ? "Unfreeze" : "Freeze votes"}</button>
                    <button type="button" data-playtest-admin="reset-votes" ${noPlaytest ? "disabled" : ""}>Reset my votes</button>
                </div>
                ${noPlaytest ? `<p class="mode-empty">Create the first public playtest to enable date-specific admin actions.</p>` : ""}
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
        const emptyText = state.playtests.remoteLoading
            ? "Loading the public playtest calendar..."
            : state.playtests.remoteError || (isPlaytestAdmin() ? "Create one from the admin controls. It will be saved to the public Supabase calendar." : "No public playtest is available yet.");
        board.innerHTML = `
            <section class="playtest-empty">
                <h3>No playtest selected</h3>
                <p>${escapeHtml(emptyText)}</p>
            </section>
            ${renderEmptyPublicPlaytestTools()}
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

function renderEmptyPublicPlaytestTools() {
    const monthDate = new Date();
    return `
        <section class="calendar-vote-grid public-tools-empty">
            <article class="calendar-card">
                <div class="calendar-head">
                    <div>
                        <p class="panel-kicker">Public Calendar</p>
                        <h4>${escapeHtml(formatMonthLabel(monthDate))}</h4>
                    </div>
                    <div class="calendar-nav">
                        <button type="button" disabled>${escapeHtml(formatMonthLabel(monthDate).split(" ")[0])}</button>
                        <button type="button" disabled>Next</button>
                    </div>
                </div>
                <div class="calendar-grid">
                    ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => `<span class="calendar-weekday">${day}</span>`).join("")}
                    <span class="calendar-empty-message">Community date voting opens after the first public playtest is created.</span>
                </div>
            </article>
            <article class="main-date-card selected-date-card">
                <div class="date-card-topline">
                    <span class="main-date-label">Community tools</span>
                    ${renderConfirmationBadge("empty", null, "empty-public-tools")}
                </div>
                <strong>No public event yet</strong>
                <p class="selected-date-note">Players will be able to pick a date, set availability, and toggle Discord confirmation notifications here once an admin creates the event.</p>
                <div class="vote-row compact">
                    ${PLAYTEST_STATUS_OPTIONS.map((option) => `<button class="vote-button vote-${escapeHtml(option.id)}" type="button" disabled>${escapeHtml(option.label)}</button>`).join("")}
                </div>
            </article>
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
        const notifyDisabled = true;
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
                ${renderNotificationToggle(playtest.id, null, selected.dateKey, notifyDisabled, "Set availability first to enable confirmation notifications.")}
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

function renderNotificationToggle(playtestId, slotId, dateKeyValue, disabled, disabledReason = "") {
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
            : disabledReason || `${count} Discord notification opt-in${count === 1 ? "" : "s"}`;
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
                                    <small title="${escapeHtml(formatFullLocalDate(vote.updatedAt))}">
                                        ${["available", "preferred", "maybe"].includes(vote.status) ? `<span>${escapeHtml(formatVoteTimeRange(summary.slot, vote))}</span>` : ""}
                                        <time datetime="${escapeHtml(vote.updatedAt || "")}">Updated ${escapeHtml(formatRelativeTime(vote.updatedAt))}</time>
                                    </small>
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
        void setPlaytestVote(playtest.id, voteButton.dataset.slotId, voteButton.dataset.playtestVote, voteTimeRangeForButton(voteButton, slot));
        return;
    }

    const calendarVoteButton = event.target.closest("[data-playtest-calendar-vote]");
    if (calendarVoteButton) {
        void handleCalendarVote(calendarVoteButton);
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
            state.authMessage = "Set your availability before enabling confirmation notifications.";
            render();
            return;
        }
        void toggleNotificationSubscription(playtest.id, key);
        return;
    }

    const confirmButton = event.target.closest("[data-confirm-date]");
    if (confirmButton) {
        void handleConfirmDateClick(confirmButton);
        return;
    }

    const unconfirmButton = event.target.closest("[data-unconfirm-slot]");
    if (unconfirmButton) {
        if (!isPlaytestAdmin()) return;
        const playtest = activePlaytest();
        if (!playtest) return;
        void unconfirmPlaytestSlot(playtest.id, unconfirmButton.dataset.unconfirmSlot);
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
        void deletePlaytestSlot(playtest.id, slotId);
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
        void handlePlaytestAdmin(adminButton.dataset.playtestAdmin);
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

async function handleCalendarVote(calendarVoteButton) {
    const playtest = activePlaytest();
    if (!playtest || !canVoteOnPlaytest(playtest)) return;
    const timeRange = selectedCommunityTimeRange();
    const slot = await ensureCommunitySlot(playtest.id, calendarVoteButton.dataset.calendarDate, timeRange);
    if (!slot) return;
    await setPlaytestVote(playtest.id, slot.id, calendarVoteButton.dataset.playtestCalendarVote, timeRange);
}

async function handleConfirmDateClick(confirmButton) {
    if (!isPlaytestAdmin()) return;
    const playtest = activePlaytest();
    if (!playtest) return;
    let slotId = confirmButton.dataset.confirmSlot;
    if (!slotId) {
        const slot = await ensureCommunitySlot(playtest.id, confirmButton.dataset.confirmDate, selectedCommunityTimeRange());
        if (!slot) return;
        slotId = slot.id;
    }
    openConfirmDialog(playtest.id, slotId);
    render();
}

async function handlePlaytestSubmit(event) {
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
    if (state.authClient && isDiscordLoggedIn()) {
        const remoteCreated = await createRemotePlaytest(data, mainSlotAt, alternatives);
        if (remoteCreated) form.reset();
        return;
    }

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

async function createRemotePlaytest(data, mainSlotAt, alternatives) {
    if (!state.authClient || !isPlaytestAdmin()) return false;
    const title = String(data.get("title") || "Community Playtest").trim() || "Community Playtest";
    const description = String(data.get("description") || "").trim();
    const status = ["upcoming", "voting", "closed"].includes(data.get("status")) ? data.get("status") : "voting";

    try {
        const { data: playtest, error: playtestError } = await state.authClient
            .from("playtests")
            .insert({
                title,
                description,
                status,
                created_by: PLAYTEST_VIEWER.userId
            })
            .select(PLAYTEST_SELECT_COLUMNS)
            .single();
        if (playtestError) throw playtestError;

        const slotRows = [
            { startAt: mainSlotAt, label: "Featured date", isMain: true },
            ...alternatives.map((startAt, index) => ({ startAt, label: `Featured date ${index + 2}`, isMain: false }))
        ].map((slot) => ({
            playtest_id: playtest.id,
            start_datetime: slot.startAt,
            end_datetime: defaultSlotEndAt(slot.startAt),
            label: slot.label,
            is_main: slot.isMain,
            source: "featured"
        }));

        const { data: slots, error: slotError } = await state.authClient
            .from("playtest_slots")
            .insert(slotRows)
            .select(PLAYTEST_SLOT_SELECT_COLUMNS);
        if (slotError) throw slotError;

        const mainSlot = (slots || []).find((slot) => slot.is_main) || slots?.[0];
        if (mainSlot?.id) {
            const { error: updateError } = await state.authClient
                .from("playtests")
                .update({ main_slot_id: mainSlot.id })
                .eq("id", playtest.id);
            if (updateError) throw updateError;
        }

        state.playtests.activeId = playtest.id;
        state.authMessage = "";
        await loadRemotePlaytests({ silent: true, render: false });
        savePlaytestState();
        render();
        return true;
    } catch (error) {
        console.error("Failed to create Supabase playtest", error);
        state.authMessage = "Could not create the public event. Check your admin role and Supabase schema.";
        render();
        return false;
    }
}

async function handlePlaytestAdmin(action) {
    if (!isPlaytestAdmin()) return;
    if (action === "reload") {
        await loadRemotePlaytests({ silent: false });
        return;
    }
    const playtest = activePlaytest();
    if (!playtest) return;

    if (isRemotePlaytest(playtest)) {
        await handleRemotePlaytestAdmin(action, playtest);
        return;
    }

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

async function handleRemotePlaytestAdmin(action, playtest) {
    try {
        if (action === "duplicate") {
            await duplicateRemotePlaytest(playtest);
        } else if (action === "close" || action === "reopen") {
            const { error } = await state.authClient
                .from("playtests")
                .update({ status: action === "close" ? "closed" : "voting" })
                .eq("id", playtest.id);
            if (error) throw error;
        } else if (action === "freeze" || action === "unfreeze") {
            const { error } = await state.authClient
                .from("playtests")
                .update({ votes_frozen: action === "freeze" })
                .eq("id", playtest.id);
            if (error) throw error;
        } else if (action === "reset-votes") {
            const { error } = await state.authClient
                .from("availability")
                .delete()
                .eq("playtest_id", playtest.id)
                .eq("user_id", PLAYTEST_VIEWER.userId);
            if (error) throw error;
        }

        await loadRemotePlaytests({ silent: true, render: false });
        savePlaytestState();
        render();
    } catch (error) {
        console.error("Failed to update Supabase playtest", error);
        state.authMessage = "Could not update the public event. Check your admin role.";
        render();
    }
}

async function duplicateRemotePlaytest(playtest) {
    const { data: clone, error: playtestError } = await state.authClient
        .from("playtests")
        .insert({
            title: `${playtest.title} Copy`,
            description: playtest.description || "",
            status: "voting",
            created_by: PLAYTEST_VIEWER.userId,
            votes_frozen: false
        })
        .select(PLAYTEST_SELECT_COLUMNS)
        .single();
    if (playtestError) throw playtestError;

    const slotRows = (playtest.slots || []).map((slot, index) => ({
        playtest_id: clone.id,
        start_datetime: slot.startAt,
        end_datetime: slot.endAt || defaultSlotEndAt(slot.startAt),
        label: slot.label || "Featured date",
        is_main: slot.id === playtest.mainSlotId || (!playtest.mainSlotId && index === 0),
        source: "featured"
    }));
    if (slotRows.length) {
        const { data: slots, error: slotError } = await state.authClient
            .from("playtest_slots")
            .insert(slotRows)
            .select(PLAYTEST_SLOT_SELECT_COLUMNS);
        if (slotError) throw slotError;
        const mainSlot = (slots || []).find((slot) => slot.is_main) || slots?.[0];
        if (mainSlot?.id) {
            const { error: updateError } = await state.authClient
                .from("playtests")
                .update({ main_slot_id: mainSlot.id })
                .eq("id", clone.id);
            if (updateError) throw updateError;
        }
    }
    state.playtests.activeId = clone.id;
}

async function setPlaytestVote(playtestId, slotId, status, timeRange = null) {
    if (!PLAYTEST_STATUS_OPTIONS.some((option) => option.id === status)) return;
    if (isCurrentAccountCommunityBanned()) {
        state.authMessage = "This account is community banned and cannot vote.";
        render();
        return;
    }
    if (isRemotePlaytest(playtestId) && (!state.authClient || !isDiscordLoggedIn())) {
        state.authMessage = "Login with Discord required to vote.";
        render();
        return;
    }
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

    if (isRemotePlaytest(playtestId)) {
        try {
            const { error } = await state.authClient
                .from("availability")
                .upsert({
                    playtest_id: playtestId,
                    slot_id: slotId,
                    user_id: PLAYTEST_VIEWER.userId,
                    status,
                    mode_preference: labelToDbModePreference(preference.modePreference),
                    available_start_datetime: state.playtests.votes[playtestId][slotId].availableStartAt,
                    available_end_datetime: state.playtests.votes[playtestId][slotId].availableEndAt
                }, { onConflict: "playtest_id,slot_id,user_id" });
            if (error) throw error;
            state.authMessage = "";
            await loadRemotePlaytests({ silent: true, render: false });
            savePlaytestState();
            render();
            return;
        } catch (error) {
            console.error("Failed to save Supabase vote", error);
            if (state.playtests.votes?.[playtestId]) delete state.playtests.votes[playtestId][slotId];
            state.authMessage = "Could not save your vote. Check that the date is still open.";
            render();
            return;
        }
    }

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
    if (Array.isArray(playtest?.remoteVotesBySlot?.[slotId])) {
        return playtest.remoteVotesBySlot[slotId];
    }
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
    const remotePlaytests = Array.isArray(state.playtests.remotePlaytests) ? state.playtests.remotePlaytests : [];
    const remoteIds = new Set(remotePlaytests.map((playtest) => playtest.id));
    const localPlaytests = (Array.isArray(state.playtests.localPlaytests) ? state.playtests.localPlaytests : [])
        .filter((playtest) => !remoteIds.has(playtest.id));
    const playtests = [
        ...remotePlaytests,
        ...DEFAULT_PLAYTESTS,
        ...localPlaytests
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
    return isAdminProfile(state.authProfile);
}

function isDiscordLoggedIn() {
    return Boolean(state.authSession?.user && PLAYTEST_VIEWER.discordId);
}

function isCurrentAccountCommunityBanned() {
    return Boolean(state.authProfile?.banned_from_voting);
}

function isRemotePlaytest(playtestOrId) {
    const id = typeof playtestOrId === "string" ? playtestOrId : playtestOrId?.id;
    if (!id) return false;
    return Boolean(
        playtestOrId?.remote
        || (state.playtests.remotePlaytests || []).some((playtest) => playtest.id === id)
    );
}

function labelToDbModePreference(value) {
    if (value === "Battle Royale") return "battle_royale";
    if (value === "Deathmatch") return "deathmatch";
    return "either";
}

function dbModePreferenceToLabel(value) {
    if (value === "battle_royale") return "Battle Royale";
    if (value === "deathmatch") return "Deathmatch";
    return "Either";
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

async function submitConfirmDialog(form) {
    if (!isPlaytestAdmin()) return;
    const pending = state.playtests.pendingConfirmation;
    if (!pending) return;
    const range = normalizeTimeRange(
        form.querySelector("[data-confirm-start]")?.value,
        form.querySelector("[data-confirm-end]")?.value
    );
    await confirmPlaytestSlot(pending.playtestId, pending.slotId, range);
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

async function ensureCommunitySlot(playtestId, selectedKey, timeRange = normalizeTimeRange()) {
    if (!selectedKey || isPastDateKey(selectedKey)) return null;
    if (isRemotePlaytest(playtestId)) {
        return createRemoteCommunitySlot(playtestId, selectedKey, timeRange);
    }
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

async function createRemoteCommunitySlot(playtestId, selectedKey, timeRange = normalizeTimeRange()) {
    if (!state.authClient || !isDiscordLoggedIn()) {
        state.authMessage = "Login with Discord required to vote.";
        render();
        return null;
    }
    if (isCurrentAccountCommunityBanned()) {
        state.authMessage = "This account is community banned and cannot create community dates.";
        render();
        return null;
    }

    const existing = activePlaytests()
        .find((playtest) => playtest.id === playtestId)
        ?.slots
        ?.find((slot) => dateKey(slot.startAt) === selectedKey);
    if (existing) return existing;

    const normalizedRange = normalizeTimeRange(timeRange.startTime, timeRange.endTime);
    try {
        const { data, error } = await state.authClient
            .from("playtest_slots")
            .insert({
                playtest_id: playtestId,
                start_datetime: localDateTimeIso(selectedKey, normalizedRange.startTime),
                end_datetime: localDateTimeIso(selectedKey, normalizedRange.endTime),
                label: "Community date",
                is_main: false,
                source: "community"
            })
            .select(PLAYTEST_SLOT_SELECT_COLUMNS)
            .single();
        if (error) throw error;

        state.playtests.selectedCalendarDates[playtestId] = selectedKey;
        await loadRemotePlaytests({ silent: true, render: false });
        savePlaytestState();
        return findPlaytestSlot(playtestId, data.id) || remoteSlotToLocal(data);
    } catch (error) {
        console.error("Failed to create community date", error);
        state.authMessage = "Could not create that community date. Check that the event is still open.";
        render();
        return null;
    }
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

async function confirmPlaytestSlot(playtestId, slotId, timeRange = null) {
    if (!isPlaytestAdmin()) return;
    if (!slotId) return;
    const slot = findPlaytestSlot(playtestId, slotId);
    if (!slot) return;
    const normalizedRange = timeRange
        ? normalizeTimeRange(timeRange.startTime, timeRange.endTime)
        : confirmationDefaultTimeRange(playtestId, { slot });
    const key = dateKey(slot.startAt);
    const startAt = localDateTimeIso(key, normalizedRange.startTime);
    const endAt = localDateTimeIso(key, normalizedRange.endTime);

    if (isRemotePlaytest(playtestId)) {
        try {
            const { error: clearError } = await state.authClient
                .from("playtest_slots")
                .update({ confirmed_at: null, confirmed_by: null })
                .eq("playtest_id", playtestId)
                .not("confirmed_at", "is", null);
            if (clearError) throw clearError;

            const { error } = await state.authClient
                .from("playtest_slots")
                .update({
                    confirmed_at: new Date().toISOString(),
                    confirmed_by: PLAYTEST_VIEWER.userId,
                    start_datetime: startAt,
                    end_datetime: endAt
                })
                .eq("id", slotId)
                .eq("playtest_id", playtestId);
            if (error) throw error;

            await loadRemotePlaytests({ silent: true, render: false });
            return;
        } catch (error) {
            console.error("Failed to confirm Supabase playtest date", error);
            state.authMessage = "Could not confirm that date. Check your admin role.";
            return;
        }
    }

    state.playtests.confirmedSlots[playtestId] = {
        [slotId]: {
            confirmedAt: new Date().toISOString(),
            confirmedBy: PLAYTEST_VIEWER.userId,
            startAt,
            endAt
        }
    };
    recordAdminSystemEvent(playtestId, slotId, "confirmed");
}

async function unconfirmPlaytestSlot(playtestId, slotId) {
    if (!isPlaytestAdmin()) return;
    if (!slotId || !state.playtests.confirmedSlots?.[playtestId]?.[slotId]) return;

    if (isRemotePlaytest(playtestId)) {
        try {
            const { error } = await state.authClient
                .from("playtest_slots")
                .update({ confirmed_at: null, confirmed_by: null })
                .eq("id", slotId)
                .eq("playtest_id", playtestId);
            if (error) throw error;
            await loadRemotePlaytests({ silent: true, render: false });
            savePlaytestState();
            render();
            return;
        } catch (error) {
            console.error("Failed to unconfirm Supabase playtest date", error);
            state.authMessage = "Could not unconfirm that date. Check your admin role.";
            render();
            return;
        }
    }

    delete state.playtests.confirmedSlots[playtestId][slotId];
    recordAdminSystemEvent(playtestId, slotId, "unconfirmed");
    savePlaytestState();
    render();
}

function isNotificationSubscribed(playtestId, key) {
    if (!isDiscordLoggedIn()) return false;
    const subscription = key ? state.playtests.notificationSubscriptions?.[playtestId]?.[key] : null;
    return Boolean(subscription && subscription.userId === PLAYTEST_VIEWER.userId);
}

async function toggleNotificationSubscription(playtestId, key) {
    if (!key || !isDiscordLoggedIn()) return;
    if (isCurrentAccountCommunityBanned()) {
        state.authMessage = "This account is community banned and cannot change notifications.";
        render();
        return;
    }
    if (isRemotePlaytest(playtestId)) {
        try {
            const existing = state.playtests.notificationSubscriptions?.[playtestId]?.[key];
            if (existing?.userId === PLAYTEST_VIEWER.userId) {
                const { error } = await state.authClient
                    .from("playtest_notification_subscriptions")
                    .delete()
                    .eq("playtest_id", playtestId)
                    .eq("slot_id", key)
                    .eq("user_id", PLAYTEST_VIEWER.userId);
                if (error) throw error;
            } else {
                const { error } = await state.authClient
                    .from("playtest_notification_subscriptions")
                    .upsert({
                        playtest_id: playtestId,
                        slot_id: key,
                        user_id: PLAYTEST_VIEWER.userId,
                        notify_on_confirmation: true
                    }, { onConflict: "playtest_id,slot_id,user_id" });
                if (error) throw error;
            }
            await loadRemotePlaytests({ silent: true, render: false });
            savePlaytestState();
            render();
            return;
        } catch (error) {
            console.error("Failed to update Supabase notification subscription", error);
            state.authMessage = "Could not update the notification toggle.";
            render();
            return;
        }
    }

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
    savePlaytestState();
    render();
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

async function deletePlaytestSlot(playtestId, slotId) {
    if (!isPlaytestAdmin()) return;
    const playtest = activePlaytests().find((entry) => entry.id === playtestId);
    if (!canDeletePlaytestSlot(playtest, slotId)) return;
    const slot = playtest.slots.find((entry) => entry.id === slotId);
    if (!slot) return;

    recordAdminSystemEvent(playtestId, slotId, "deleted");

    if (isRemotePlaytest(playtestId)) {
        try {
            const { error } = await state.authClient
                .from("playtest_slots")
                .delete()
                .eq("id", slotId)
                .eq("playtest_id", playtestId);
            if (error) throw error;
            cleanupPlaytestSlotState(playtestId, slot);
            await loadRemotePlaytests({ silent: true, render: false });
            state.playtests.pendingSlotDelete = null;
            savePlaytestState();
            render();
            return;
        } catch (error) {
            console.error("Failed to delete Supabase playtest date", error);
            state.authMessage = "Could not delete that date. Check your admin role.";
            render();
            return;
        }
    }

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
    savePlaytestState();
    render();
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

function defaultSlotEndAt(startAt) {
    const date = new Date(startAt);
    if (Number.isNaN(date.getTime())) return "";
    date.setHours(date.getHours() + 2);
    return date.toISOString();
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
    const communitySlots = playtest.remote
        ? []
        : (state.playtests.communitySlots?.[playtest.id] || []).filter((slot) => !deletedSlots[slot.id]);
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
        remotePlaytests: [],
        remoteLoading: false,
        remoteLoadedAt: "",
        remoteError: "",
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

function formatAccountSignedDate(value) {
    return formatLocalDate(value, { day: "numeric", month: "short", year: "numeric" });
}

function formatAccountAge(value) {
    const time = dateValue(value);
    if (!time) return "new account";
    const days = Math.max(0, Math.floor((Date.now() - time) / 86400000));
    if (days < 1) return "joined today";
    if (days < 30) return `${days} day${days === 1 ? "" : "s"} old`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months === 1 ? "" : "s"} old`;
    const years = Math.floor(days / 365);
    return `${years} year${years === 1 ? "" : "s"} old`;
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
    if (!PUBLIC_MODE_LABELS[state.mode]) state.mode = "battleRoyale";
    for (const modeId of Object.keys(PUBLIC_MODE_LABELS)) {
        const button = createPill(PUBLIC_MODE_LABELS[modeId], state.mode === modeId, () => {
            state.mode = modeId;
            state.page = 1;
            render();
        });
        button.classList.add("tab-pill");
        button.setAttribute("aria-label", `${PUBLIC_MODE_LABELS[modeId]} mode${state.mode === modeId ? ", selected" : ""}`);
        container.appendChild(button);
    }
    const title = state.mainView === "players"
        ? `${PUBLIC_MODE_LABELS[state.mode]} ranking`
        : state.mainView === "weapons"
            ? `${PUBLIC_MODE_LABELS[state.mode]} weapon stats`
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
        const modeLabel = `in ${PUBLIC_MODE_LABELS[state.mode] || MODE_LABELS[state.mode] || "this mode"}`;
        count.textContent = `${rows.length} tracked ${noun} ${modeLabel}`;
        return;
    }

    if (state.mainView === "maps") {
        const noun = rows.length === 1 ? "map" : "maps";
        count.textContent = `${rows.length} tracked Deathmatch ${noun}`;
        return;
    }

    const noun = rows.length === 1 ? "player" : "players";
    const modeLabel = `in ${PUBLIC_MODE_LABELS[state.mode] || MODE_LABELS[state.mode] || "this mode"}`;
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
        const profile = profileById(player.playerId);
        const name = playerDisplayName(player, profile);
        const tr = document.createElement("tr");
        if (player.playerId === state.selectedId) tr.classList.add("selected");
        tr.dataset.playerId = player.playerId;

        tr.innerHTML = `
            <td><span class="rank-badge rank-${Math.min(displayRank, 3)}">${displayRank}</span></td>
            <td>
                <div class="leaderboard-player">
                    ${renderPlayerAvatar(player, profile, 42, "leaderboard-avatar")}
                    <div class="player-name">
                        <div class="player-identity-copy">
                            <strong>${escapeHtml(name)}</strong>
                            ${renderProfileTitle(accountProfileForPlayer(player, profile), { compact: true })}
                        </div>
                        <a class="profile-link" href="#player=${encodeURIComponent(player.playerId)}&tab=overview" aria-label="${escapeHtml(`Open ${name} profile`)}">Profile</a>
                    </div>
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

async function submitAccountForm(form) {
    if (!state.authClient || !state.authSession?.user || !state.authProfileExtended) return;

    try {
        const draft = readAccountFormDraft(form);
        const linkedProfile = linkedStatsProfile();
        const badgeState = accountBadgeState(state.authProfile, linkedProfile);
        const inferredLink = inferredMinecraftLinkPayload(state.authProfile, linkedProfile);
        const selectedBadges = draft.selectedBadges.filter((id) => badgeState.unlockedIds.has(id)).slice(0, 5);
        const customBackgroundUrl = state.authProfile?.custom_background_url || "";

        const badgeStateAfterUpload = accountBadgeState({
            ...state.authProfile,
            custom_background_url: customBackgroundUrl
        }, linkedProfile);
        const payload = {
            display_name: cleanDisplayName(draft.displayName),
            avatar_source: draft.avatarSource,
            custom_background_url: customBackgroundUrl || null,
            profile_background: cleanProfileBackground(draft.profileBackground, { ...state.authProfile, custom_background_url: customBackgroundUrl }, badgeStateAfterUpload),
            pfp_border: cleanPfpBorder(draft.pfpBorder, state.authProfile, badgeState),
            selected_badges: selectedBadges,
            ...(state.authCosmeticInventoryExtended
                ? { profile_title: cleanProfileTitle(draft.profileTitle, state.authProfile, badgeState) }
                : {})
        };

        state.accountSaving = true;
        state.accountMessage = "";
        setAccountFormSaving(form, true);

        const { data, error } = await state.authClient
            .from("profiles")
            .update(payload)
            .eq("id", state.authSession.user.id)
            .select(ownProfileSelectColumns())
            .single();
        if (error) throw error;
        verifySavedProfile(data, payload);

        const linkResult = await saveInferredMinecraftLink(inferredLink);
        applyPlaytestProfile(linkResult.profile || data);
        await loadAccountProfiles();
        state.accountMessage = linkResult.warning ? `Profile saved. ${linkResult.warning}` : "Profile saved.";
    } catch (error) {
        console.error("Failed to save account profile", error);
        state.accountMessage = error?.message || "Could not save profile right now.";
    } finally {
        state.accountSaving = false;
        render();
    }
}

function readAccountFormDraft(form) {
    const avatarInput = form?.querySelector("[name='avatarSource']");
    const displayInput = form?.querySelector("[name='displayName']");
    const backgroundSelect = form?.querySelector("[name='profileBackground']");
    const borderSelect = form?.querySelector("[name='pfpBorder']");
    const titleInput = form?.querySelector("[name='profileTitle']");
    const badgeState = accountBadgeState(state.authProfile, linkedStatsProfile());
    const selectedBadges = [...(form?.querySelectorAll("input[name='selectedBadges']:checked") || [])]
        .map((input) => String(input.value || "").trim())
        .filter(Boolean);

    return {
        displayName: displayInput?.value || "",
        avatarSource: cleanProfileIcon(avatarInput?.value, state.authProfile, badgeState),
        profileBackground: cleanProfileBackground(backgroundSelect?.value, state.authProfile, badgeState),
        pfpBorder: cleanPfpBorder(borderSelect?.value, state.authProfile, badgeState),
        profileTitle: cleanProfileTitle(titleInput?.value, state.authProfile, badgeState),
        selectedBadges
    };
}

function verifySavedProfile(saved, payload) {
    if (!saved?.id) throw new Error("Supabase did not return the saved profile row.");
    const checks = [
        ["display name", saved.display_name || "", payload.display_name || ""],
        ["profile picture", cleanAvatarSource(saved.avatar_source), cleanAvatarSource(payload.avatar_source)],
        ["background", cleanProfileBackground(saved.profile_background, saved), cleanProfileBackground(payload.profile_background, saved)],
        ["PFP border", cleanPfpBorder(saved.pfp_border, saved), cleanPfpBorder(payload.pfp_border, saved)]
    ];
    if (Object.hasOwn(payload, "profile_title")) {
        checks.push(["title", cleanProfileTitle(saved.profile_title, saved), cleanProfileTitle(payload.profile_title, saved)]);
    }

    const selectedSaved = arrayField(saved.selected_badges).sort().join(",");
    const selectedWanted = arrayField(payload.selected_badges).sort().join(",");
    checks.push(["badges", selectedSaved, selectedWanted]);
    if (payload.minecraft_player_id) checks.push(["Minecraft player id", saved.minecraft_player_id || "", payload.minecraft_player_id]);
    if (payload.minecraft_player_name) checks.push(["Minecraft player name", saved.minecraft_player_name || "", payload.minecraft_player_name]);

    const mismatches = checks
        .filter(([, actual, expected]) => String(actual) !== String(expected))
        .map(([label, actual, expected]) => `${label} saved as "${actual || "empty"}" instead of "${expected || "empty"}"`);

    if (mismatches.length) {
        throw new Error(`Supabase did not save the profile change: ${mismatches.join("; ")}.`);
    }
}

function setAccountFormSaving(form, saving) {
    const button = form?.querySelector("button[type='submit']");
    if (!button) return;
    if (saving) {
        button.dataset.idleText = button.textContent;
        button.textContent = "Saving...";
        button.disabled = true;
        return;
    }
    button.textContent = button.dataset.idleText || "Save profile";
    button.disabled = !state.authProfileExtended;
}

function linkedStatsProfile() {
    if (!state.authProfile) return null;
    return accountLinkedStatsProfile(state.authProfile);
}

function accountLinkedStatsProfile(account) {
    if (!account) return null;
    const playerId = String(account.minecraft_player_id || "").trim();
    if (playerId) {
        const byId = profileById(playerId);
        if (byId) return byId;
    }
    const nameKeys = accountMinecraftNameKeys(account);
    if (!nameKeys.size) return null;
    return state.cache.profiles.find((profile) => nameKeys.has(normalizePlayerName(profile.name))) || null;
}

function accountProfileForPlayer(player, profile) {
    if (!state.accountProfileIndex?.ready) rebuildAccountProfileIndex();
    const playerIds = new Set([player?.playerId, profile?.playerId]
        .map((id) => String(id || "").trim())
        .filter(Boolean));
    const nameKey = normalizePlayerName(player?.name || profile?.name || "");
    for (const playerId of playerIds) {
        const account = state.accountProfileIndex.byPlayerId.get(playerId);
        if (account) return account;
    }
    return nameKey ? state.accountProfileIndex.byName.get(nameKey) || null : null;
}

function accountMinecraftNameKeys(account) {
    const names = account?.minecraft_player_name
        ? [account.minecraft_player_name]
        : [account?.display_name, account?.username];
    return new Set(names.map(normalizePlayerName).filter(Boolean));
}

function inferredMinecraftLinkPayload(account, profile) {
    if (!account || !profile?.playerId || !profile?.name) return {};
    const payload = {};
    if (!String(account.minecraft_player_id || "").trim()) payload.minecraft_player_id = profile.playerId;
    if (!String(account.minecraft_player_name || "").trim()) payload.minecraft_player_name = profile.name;
    return payload;
}

async function saveInferredMinecraftLink(payload) {
    if (!payload?.minecraft_player_id && !payload?.minecraft_player_name) return { profile: null, warning: "" };
    try {
        const { data, error } = await state.authClient
            .from("profiles")
            .update(payload)
            .eq("id", state.authSession.user.id)
            .select(ownProfileSelectColumns())
            .single();
        if (error) throw error;
        return { profile: data, warning: "" };
    } catch (error) {
        console.warn("Profile saved, but inferred Minecraft link could not be stored", error);
        return {
            profile: null,
            warning: "Minecraft link was not stored, so run /linkminecraft if the leaderboard icon does not stay linked after renaming."
        };
    }
}

function accountProfileCandidates() {
    if (!state.accountProfileIndex?.ready) rebuildAccountProfileIndex();
    return state.accountProfileIndex.candidates;
}

function accountDisplayName(account) {
    return String(account?.display_name || account?.username || PLAYTEST_VIEWER.username || "Account").trim();
}

function playerDisplayName(player, profile) {
    const account = accountProfileForPlayer(player, profile);
    return account ? accountDisplayName(account) : String(player?.name || profile?.name || "Unknown").trim();
}

function renderPlayerAvatar(player, profile, size = 64, extraClass = "") {
    const account = accountProfileForPlayer(player, profile);
    const url = accountAvatarUrl(account, profile || player, size);
    return `
        <span class="player-avatar ${avatarFrameClass(account)} ${escapeHtml(extraClass)}"${avatarFrameStyle(account)} ${avatarCosmeticOwnershipDataAttributes(account)}>
            ${renderAvatarImage(url, account, profile || player, size)}
        </span>
    `;
}

function renderAvatarImage(url, account, profile, size, loading = "lazy", extraAttributes = "") {
    const currentUrl = String(url || skinHeadUrl(accountMinecraftName(account, profile), size));
    const fallbacks = avatarFallbackUrls(currentUrl, account, profile, size);
    const fallbackAttr = escapeHtml(JSON.stringify(fallbacks));
    const attrs = extraAttributes ? ` ${extraAttributes}` : "";
    return `<img src="${escapeHtml(currentUrl)}" alt="" loading="${escapeHtml(loading)}" decoding="async" referrerpolicy="no-referrer" data-avatar-fallbacks="${fallbackAttr}"${attrs}>`;
}

function avatarFallbackUrls(currentUrl, account, profile, size) {
    const name = accountMinecraftName(account, profile);
    const urls = [
        skinHeadUrl(name, size),
        alternateSkinHeadUrl(name, size),
        skinHeadUrl(DEFAULT_SKIN_NAME, size),
        alternateSkinHeadUrl(DEFAULT_SKIN_NAME, size)
    ];
    const seen = new Set([String(currentUrl || "")]);
    return urls.filter((entry) => {
        if (!entry || seen.has(entry)) return false;
        seen.add(entry);
        return true;
    });
}

function setAvatarFallbacks(image, currentUrl, account, profile, size) {
    if (!image) return;
    image.dataset.avatarFallbacks = JSON.stringify(avatarFallbackUrls(currentUrl, account, profile, size));
}

function handleAvatarFallback(image) {
    if (!image) return;
    let fallbacks = [];
    try {
        fallbacks = JSON.parse(image.dataset.avatarFallbacks || "[]");
    } catch (_error) {
        // Invalid fallback metadata leaves the list empty.
    }
    const next = fallbacks.shift();
    if (next) {
        image.dataset.avatarFallbacks = JSON.stringify(fallbacks);
        image.src = next;
        return;
    }
    image.removeAttribute("data-avatar-fallbacks");
}

function accountAvatarUrl(account, profile, size = 64) {
    if (account && !account.avatar_source && !profile?.name && account.avatar_url) return account.avatar_url;
    const source = cleanAvatarSource(account?.avatar_source);
    if (source === "custom" && account?.custom_avatar_url) return account.custom_avatar_url;
    if (source === "discord" && account?.avatar_url) return account.avatar_url;
    const option = cosmeticCatalogItem("icon", source);
    if (option?.image) return safeCssUrl(option.image);
    return skinHeadUrl(accountMinecraftName(account, profile), size);
}

function accountMinecraftName(account, profile) {
    return String(
        account?.minecraft_player_name
        || profile?.name
        || account?.display_name
        || DEFAULT_SKIN_NAME
    ).trim() || DEFAULT_SKIN_NAME;
}

function avatarFrameClass(account) {
    return pfpBorderImageUrl(account) ? "avatar-frame-image" : "";
}

function avatarFrameStyle(account) {
    const url = pfpBorderImageUrl(account);
    if (!url) return "";
    const option = pfpBorderOption(account);
    return ` style="--avatar-frame-image: url('${escapeHtml(url)}'); --avatar-frame-inset: ${number(option?.inset)}%"`;
}

function setAvatarFrameImage(element, account) {
    if (!element) return;
    const url = pfpBorderImageUrl(account);
    const option = pfpBorderOption(account);
    element.classList.toggle("avatar-frame-image", Boolean(url));
    if (url) {
        element.style.setProperty("--avatar-frame-image", `url('${url}')`);
        element.style.setProperty("--avatar-frame-inset", `${number(option?.inset)}%`);
    } else {
        element.style.removeProperty("--avatar-frame-image");
        element.style.removeProperty("--avatar-frame-inset");
    }
}

function pfpBorderOption(account) {
    const border = cleanPfpBorder(account?.pfp_border, account);
    return cosmeticCatalogItem("border", border) || cosmeticCatalogCollection("border")[0];
}

function pfpBorderImageUrl(account) {
    const option = pfpBorderOption(account);
    if (option?.id === "none") return "";
    return option?.image ? safeCssUrl(option.image) : "";
}

function profileBackgroundClass(account) {
    return `profile-bg-${cleanProfileBackground(account?.profile_background, account)}`;
}

function profileBackgroundStyle(account) {
    const url = profileBackgroundImageUrl(account);
    if (!url) return "";
    return ` style="--profile-bg-image: url('${escapeHtml(url)}')"`;
}

function profileBackgroundImageUrl(account) {
    const background = cleanProfileBackground(account?.profile_background, account);
    if (background === "custom") {
        const url = String(account?.custom_background_url || "").trim();
        return url ? safeCssUrl(url) : "";
    }
    const option = cosmeticCatalogItem("background", background);
    return option?.image ? safeCssUrl(option.image) : "";
}

function safeCssUrl(value) {
    return String(value || "").replace(/['"\\<>]/g, "");
}

function cosmeticCatalogItem(type, id) {
    if (type === "icon") {
        if (id === "custom") return { id: "custom", label: "Uploaded icon", category: "Legacy", rarity: "common", unlock: "custom" };
        return cosmeticCatalogCollection("icon").find((entry) => entry.id === id) || null;
    }
    if (type === "background") return cosmeticCatalogCollection("background").find((entry) => entry.id === id) || null;
    if (type === "border") return cosmeticCatalogCollection("border").find((entry) => entry.id === id) || null;
    if (type === "title") return cosmeticCatalogCollection("title").find((entry) => entry.id === id) || null;
    return BADGE_CATALOG.find((entry) => entry.id === id) || null;
}

function cosmeticOwnershipStats(type, id) {
    const key = `${type}:${id}`;
    const cached = state.cosmeticOwnershipCache.get(key);
    if (cached) return cached;

    const item = cosmeticCatalogItem(type, id);
    const accounts = accountProfileCandidates();
    let owned = 0;
    if (item) {
        for (const account of accounts) {
            const profile = accountLinkedStatsProfile(account);
            const badgeState = accountBadgeState(account, profile);
            if (cosmeticItemOwned(type, item, account, badgeState)) owned += 1;
        }
    }

    const result = {
        owned,
        total: accounts.length,
        percent: accounts.length ? owned / accounts.length * 100 : 0
    };
    state.cosmeticOwnershipCache.set(key, result);
    return result;
}

function cosmeticOwnershipPercent(stats) {
    if (!stats?.total) return "No ownership data yet";
    if (stats.owned > 0 && stats.percent < 0.1) return "<0.1%";
    if (stats.percent < 10) return `${Math.round(stats.percent * 10) / 10}%`;
    return `${Math.round(stats.percent)}%`;
}

function cosmeticOwnershipText(stats) {
    if (!stats?.total) return "No registered profile ownership data yet";
    return `${cosmeticOwnershipPercent(stats)} owned - ${formatNumber(stats.owned)} of ${formatNumber(stats.total)} registered profiles`;
}

function cosmeticTooltipDataAttributes(title, description, ownershipText) {
    return [
        "data-cosmetic-tooltip",
        `data-cosmetic-tooltip-title="${escapeHtml(title || "Cosmetic")}"`,
        `data-cosmetic-tooltip-description="${escapeHtml(description || "")}"`,
        `data-cosmetic-tooltip-ownership="${escapeHtml(ownershipText || "")}"`
    ].join(" ");
}

function setCosmeticTooltipData(element, { title = "Cosmetic", description = "", ownership = "" } = {}) {
    if (!element) return;
    element.setAttribute("data-cosmetic-tooltip", "");
    element.dataset.cosmeticTooltipTitle = title;
    element.dataset.cosmeticTooltipDescription = description;
    element.dataset.cosmeticTooltipOwnership = ownership;
}

function cosmeticOwnershipDataAttributes(type, id, label, description = "") {
    return cosmeticTooltipDataAttributes(
        label || "Cosmetic",
        description,
        cosmeticOwnershipText(cosmeticOwnershipStats(type, id))
    );
}

function avatarCosmeticOwnershipTooltip(account) {
    if (!account) return null;
    const iconId = cleanAvatarSource(account.avatar_source);
    const borderId = cleanPfpBorder(account.pfp_border, account);
    const icon = cosmeticCatalogItem("icon", iconId);
    const border = cosmeticCatalogItem("border", borderId);
    const iconStats = cosmeticOwnershipStats("icon", iconId);
    const borderStats = cosmeticOwnershipStats("border", borderId);
    return {
        title: "Profile icon and border",
        description: `Icon: ${icon?.label || avatarSourceLabel(iconId)}. Border: ${border?.label || pfpBorderLabel(borderId)}.`,
        ownership: `Icon ${cosmeticOwnershipPercent(iconStats)} owned - Border ${cosmeticOwnershipPercent(borderStats)} owned`
    };
}

function avatarCosmeticOwnershipDataAttributes(account) {
    const tooltip = avatarCosmeticOwnershipTooltip(account);
    return tooltip ? cosmeticTooltipDataAttributes(tooltip.title, tooltip.description, tooltip.ownership) : "";
}

function backgroundCosmeticOwnershipTooltip(account) {
    if (!account) return null;
    const id = cleanProfileBackground(account.profile_background, account);
    const background = cosmeticCatalogItem("background", id);
    return {
        title: background?.label || backgroundLabel(id),
        description: "Profile background",
        ownership: cosmeticOwnershipText(cosmeticOwnershipStats("background", id))
    };
}

function backgroundCosmeticOwnershipDataAttributes(account) {
    const tooltip = backgroundCosmeticOwnershipTooltip(account);
    return tooltip ? cosmeticTooltipDataAttributes(tooltip.title, tooltip.description, tooltip.ownership) : "";
}

function profileTitleOption(account) {
    const id = cleanProfileTitle(account?.profile_title, account);
    return cosmeticCatalogItem("title", id) || cosmeticCatalogCollection("title")[0];
}

function renderProfileTitle(account, options = {}) {
    const title = profileTitleOption(account);
    if (title.id === "none" && !options.empty) return "";
    return renderTitleCosmetic(title, options);
}

function renderTitleCosmetic(title, { empty = false, compact = false, large = false, interactive = true, focusable = true } = {}) {
    const rarity = cleanRarity(title?.rarity);
    const text = String(title?.text || (empty ? "No title equipped" : "")).trim();
    if (!text) return "";
    const classes = [
        "profile-title-cosmetic",
        `rarity-${rarity}`,
        title?.id === "none" ? "empty" : "",
        compact ? "compact" : "",
        large ? "large" : ""
    ].filter(Boolean).join(" ");
    const interactionAttributes = interactive
        ? `${focusable ? 'tabindex="0" ' : ""}${cosmeticOwnershipDataAttributes("title", title?.id || "none", title?.label || text, "Profile title")}`
        : "";
    return `<span class="${classes}" ${interactionAttributes}>${escapeHtml(text)}</span>`;
}

function renderProfileBadge(badge) {
    const rarity = cleanRarity(badge?.rarity);
    return `<span class="profile-badge badge-${escapeHtml(badge.id)} rarity-${rarity}" tabindex="0" aria-label="${escapeHtml(badgeProgressAriaLabel(badge))}" ${badgeProgressDataAttributes(badge)} ${cosmeticOwnershipDataAttributes("badges", badge.id, badge.label, badge.description || "Profile badge")}>${renderBadgeIcon(badge)}<span>${escapeHtml(badge.label)}</span></span>`;
}

function renderBadgeIcon(badge) {
    const label = badge?.label || "Badge";
    const value = badge?.value === undefined || badge?.value === null ? "" : compactBadgeNumber(badge.value);
    const rarity = cleanRarity(badge?.rarity);
    return `
        <span class="badge-icon rarity-${rarity}" aria-hidden="true">
            <img src="${escapeHtml(badgeIconUrl(badge))}" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false;">
            <span class="badge-icon-fallback" hidden>${escapeHtml(badgeInitials(label))}</span>
            ${value ? `<span class="badge-icon-value">${escapeHtml(value)}</span>` : ""}
        </span>
    `;
}

function badgeIconUrl(badge) {
    return badge?.icon || `./assets/badges/${encodeURIComponent(badge?.id || "default")}.png`;
}

function cleanRarity(value) {
    const rarity = String(value || "common").toLowerCase();
    return RARITY_ORDER.includes(rarity) ? rarity : "common";
}

function badgeInitials(label) {
    const words = String(label || "Badge").trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2) return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
    return (words[0] || "B").slice(0, 2).toUpperCase();
}

function accountBadgeState(account, profile) {
    const linked = Boolean(profile || accountLinkedStatsProfile(account));
    const linkedProfile = profile || accountLinkedStatsProfile(account);
    const overall = linkedProfile ? buildProfileOverall(linkedProfile) : null;
    const br = linkedProfile ? normalizePlayer(linkedProfile.battleRoyale) : normalizePlayer(null);
    const dm = linkedProfile ? normalizePlayer(linkedProfile.deathmatch) : normalizePlayer(null);
    const stats = normalizeStats(overall?.stats);
    const derived = normalizeDerived(overall?.derived, stats);
    const context = { account, linked, profile: linkedProfile, overall, br, dm, stats, derived };
    const unlockedIds = new Set(BADGE_CATALOG.filter((badge) => badge.test(context)).map((badge) => badge.id));
    for (const id of arrayField(account?.unlocked_badges)) unlockedIds.add(id);
    return { unlockedIds, context };
}

function selectedAccountBadgeIds(account, unlockedIds) {
    const selected = arrayField(account?.selected_badges).filter((id) => unlockedIds.has(id));
    return new Set(selected.slice(0, 5));
}

function selectedAccountBadges(account, badgeStateOrUnlockedIds) {
    const badgeState = badgeStateOrUnlockedIds?.unlockedIds
        ? badgeStateOrUnlockedIds
        : { unlockedIds: badgeStateOrUnlockedIds, context: null };
    const selectedIds = selectedAccountBadgeIds(account, badgeState.unlockedIds);
    return BADGE_CATALOG
        .filter((badge) => selectedIds.has(badge.id))
        .map((badge) => badgeDisplay(badge, badgeState.context, true));
}

function badgeDisplay(badge, context, unlocked = null) {
    const value = badgeDynamicValue(badge, context);
    const isUnlocked = unlocked === null ? Boolean(context && badge.test(context)) : Boolean(unlocked);
    return {
        ...badge,
        ...(value === null ? {} : { value }),
        progressState: badgeProgressState(badge, context, isUnlocked)
    };
}

function badgeDynamicValue(badge, context) {
    if (!badge?.dynamic) return null;
    const mode = badge.dynamic.mode === "battleRoyale" ? context?.br : context?.dm;
    const stats = normalizeStats(mode?.stats);
    return number(stats[badge.dynamic.stat]);
}

function compactBadgeNumber(value) {
    const numeric = number(value);
    if (numeric >= 1000000) return `${round2(numeric / 1000000)}M`;
    if (numeric >= 10000) return `${Math.floor(numeric / 1000)}K`;
    return formatNumber(numeric);
}

function badgeProgressState(badge, context, unlocked) {
    const requirement = badge?.progress;
    if (!requirement) return null;

    if (requirement.type === "linked") {
        return {
            complete: unlocked,
            percent: unlocked ? 100 : 0,
            status: unlocked ? "Discord and Minecraft linked" : "Discord and Minecraft not linked"
        };
    }

    if (requirement.type === "sharpshooter") {
        const rateTarget = number(requirement.rateTarget);
        const hitsTarget = number(requirement.hitsTarget);
        const actualRate = number(context?.derived?.headshotRate);
        const actualHits = number(context?.stats?.hits);
        const shownRate = unlocked ? Math.max(actualRate, rateTarget) : Math.min(actualRate, rateTarget);
        const shownHits = unlocked ? Math.max(actualHits, hitsTarget) : Math.min(actualHits, hitsTarget);
        const rateProgress = rateTarget > 0 ? actualRate / rateTarget : 1;
        const hitsProgress = hitsTarget > 0 ? actualHits / hitsTarget : 1;
        return {
            complete: unlocked,
            percent: unlocked ? 100 : Math.min(100, Math.max(0, Math.min(rateProgress, hitsProgress) * 100)),
            status: `${round2(shownRate)}% / ${formatNumber(rateTarget)}% headshot rate; ${formatNumber(shownHits)} / ${formatNumber(hitsTarget)} hits`
        };
    }

    const stats = requirement.scope === "battleRoyale"
        ? normalizeStats(context?.br?.stats)
        : requirement.scope === "deathmatch"
            ? normalizeStats(context?.dm?.stats)
            : normalizeStats(context?.stats);
    const actual = number(stats[requirement.stat]);
    const target = number(requirement.target);
    const shown = unlocked
        ? Math.max(actual, target)
        : Math.min(actual, target);
    const percent = target > 0 ? Math.min(100, Math.max(0, actual / target * 100)) : 100;
    return {
        complete: unlocked,
        percent: unlocked ? 100 : percent,
        status: `${formatNumber(shown)} / ${formatNumber(target)} ${requirement.unit}`
    };
}

function badgeProgressAriaLabel(badge) {
    const progress = badge?.progressState;
    const parts = [badge?.label || "Badge", badge?.description || ""];
    if (progress?.status) parts.push(`Progress: ${progress.status}`);
    if (progress?.complete) parts.push("Unlocked");
    return parts.filter(Boolean).join(". ");
}

function badgeProgressDataAttributes(badge) {
    const progress = badge?.progressState;
    if (!progress) return "";
    return [
        "data-badge-progress",
        `data-badge-progress-title="${escapeHtml(badge?.label || "Badge")}"`,
        `data-badge-progress-description="${escapeHtml(badge?.description || "")}"`,
        `data-badge-progress-status="${escapeHtml(progress.status || "")}"`,
        `data-badge-progress-percent="${Math.round(number(progress.percent))}"`,
        `data-badge-progress-complete="${progress.complete ? "true" : "false"}"`
    ].join(" ");
}

function handleBadgeProgressEnter(event) {
    const host = event.target.closest?.("[data-badge-progress], [data-cosmetic-tooltip]");
    if (!host) return;
    showBadgeProgressTooltip(host);
}

function handleBadgeProgressLeave(event) {
    const host = event.target.closest?.("[data-badge-progress], [data-cosmetic-tooltip]");
    if (!host || host !== activeBadgeProgressHost) return;
    if (event.relatedTarget && host.contains(event.relatedTarget)) return;
    if (event.type === "mouseout" && host.matches(":focus-within")) return;
    if (event.type === "focusout" && host.matches(":hover")) return;
    hideBadgeProgressTooltip();
}

function showBadgeProgressTooltip(host) {
    const tooltip = ensureBadgeProgressTooltip();
    if (host === activeBadgeProgressHost && tooltip.classList.contains("is-visible")) return;
    window.cancelAnimationFrame(badgeTooltipFrame);
    activeBadgeProgressHost = host;
    const hasProgress = host.hasAttribute("data-badge-progress");
    const title = host.dataset.badgeProgressTitle || host.dataset.cosmeticTooltipTitle || "Cosmetic";
    const description = host.dataset.badgeProgressDescription || host.dataset.cosmeticTooltipDescription || "";
    const status = host.dataset.badgeProgressStatus || "";
    const ownership = host.dataset.cosmeticTooltipOwnership || "";
    tooltip.querySelector("[data-badge-tooltip-title]").textContent = title;
    tooltip.querySelector("[data-badge-tooltip-description]").textContent = description;
    tooltip.querySelector("[data-badge-tooltip-description]").hidden = !description;
    tooltip.querySelector("[data-badge-tooltip-status]").textContent = status;
    tooltip.querySelector("[data-badge-tooltip-status]").hidden = !hasProgress || !status;
    tooltip.querySelector("[data-badge-tooltip-bar]").style.width = `${Math.min(100, Math.max(0, number(host.dataset.badgeProgressPercent)))}%`;
    tooltip.querySelector("[data-badge-tooltip-progress]").hidden = !hasProgress;
    tooltip.querySelector("[data-cosmetic-tooltip-ownership]").textContent = ownership;
    tooltip.querySelector("[data-cosmetic-tooltip-ownership]").hidden = !ownership;
    tooltip.classList.toggle("complete", hasProgress && host.dataset.badgeProgressComplete === "true");
    tooltip.style.left = "0";
    tooltip.style.top = "0";

    const hostRect = host.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const gap = 9;
    const edge = 10;
    let left = hostRect.left + hostRect.width / 2 - tooltipRect.width / 2;
    let top = hostRect.top - tooltipRect.height - gap;
    left = Math.min(window.innerWidth - tooltipRect.width - edge, Math.max(edge, left));
    if (top < edge) top = hostRect.bottom + gap;
    top = Math.min(window.innerHeight - tooltipRect.height - edge, Math.max(edge, top));
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
    tooltip.setAttribute("aria-hidden", "false");
    badgeTooltipFrame = window.requestAnimationFrame(() => {
        if (activeBadgeProgressHost === host) tooltip.classList.add("is-visible");
    });
}

function hideBadgeProgressTooltip() {
    const tooltip = document.getElementById("badge-progress-tooltip");
    window.cancelAnimationFrame(badgeTooltipFrame);
    if (tooltip) {
        tooltip.classList.remove("is-visible");
        tooltip.setAttribute("aria-hidden", "true");
    }
    activeBadgeProgressHost = null;
}

function ensureBadgeProgressTooltip() {
    let tooltip = document.getElementById("badge-progress-tooltip");
    if (tooltip) return tooltip;
    tooltip = document.createElement("div");
    tooltip.id = "badge-progress-tooltip";
    tooltip.className = "badge-progress-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.setAttribute("aria-hidden", "true");
    tooltip.innerHTML = `
        <strong data-badge-tooltip-title></strong>
        <span data-badge-tooltip-description></span>
        <div class="badge-tooltip-progress" data-badge-tooltip-progress><i data-badge-tooltip-bar></i></div>
        <small data-badge-tooltip-status></small>
        <small class="cosmetic-tooltip-ownership" data-cosmetic-tooltip-ownership></small>
    `;
    document.body.appendChild(tooltip);
    return tooltip;
}

function handleBadgeSeenEvent(event) {
    const badgeElement = event.target.closest?.("[data-badge-id].badge-new");
    if (!badgeElement) return;
    const badgeId = badgeElement.dataset.badgeId;
    if (!badgeId || !state.authProfile?.id) return;
    markBadgeSeen(state.authProfile, badgeId);
    badgeElement.classList.remove("badge-new");
}

function isBadgeNew(account, badgeId) {
    if (!account?.id || !badgeId) return false;
    return !seenBadgeIds(account).has(badgeId);
}

function seenBadgeIds(account) {
    if (!account?.id) return new Set();
    try {
        const raw = window.localStorage?.getItem(BADGE_SEEN_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return new Set(Array.isArray(parsed[account.id]) ? parsed[account.id] : []);
    } catch (_error) {
        return new Set();
    }
}

function markBadgeSeen(account, badgeId) {
    if (!account?.id || !badgeId) return;
    try {
        const raw = window.localStorage?.getItem(BADGE_SEEN_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        const seen = new Set(Array.isArray(parsed[account.id]) ? parsed[account.id] : []);
        seen.add(badgeId);
        parsed[account.id] = [...seen];
        window.localStorage?.setItem(BADGE_SEEN_STORAGE_KEY, JSON.stringify(parsed));
    } catch (_error) {
        // Badge dots are cosmetic; ignore storage failures.
    }
}

function renderAccountLevelPill(account) {
    const progress = accountProgress(account);
    return `
        <div class="account-level-pill" title="${escapeHtml(`${formatNumber(progress.totalXp)} total XP`)}">
            <strong>LVL ${progress.level}</strong>
            <span>${formatNumber(progress.totalXp)} XP</span>
        </div>
    `;
}

function accountProgress(account) {
    const storedXp = number(account?.xp);
    const totalXp = Math.min(ACCOUNT_MAX_LEVEL * ACCOUNT_XP_PER_LEVEL, storedXp);
    const level = Math.min(ACCOUNT_MAX_LEVEL, Math.floor(totalXp / ACCOUNT_XP_PER_LEVEL) + 1);
    const levelBaseXp = (level - 1) * ACCOUNT_XP_PER_LEVEL;
    const currentLevelXp = level >= ACCOUNT_MAX_LEVEL ? ACCOUNT_XP_PER_LEVEL : Math.max(0, totalXp - levelBaseXp);
    const xpRemaining = level >= ACCOUNT_MAX_LEVEL ? 0 : Math.max(0, ACCOUNT_XP_PER_LEVEL - currentLevelXp);
    return {
        level,
        totalXp,
        storedXp,
        currentLevelXp,
        xpRemaining,
        levelProgress: level >= ACCOUNT_MAX_LEVEL ? 1 : currentLevelXp / ACCOUNT_XP_PER_LEVEL
    };
}

function arrayField(value) {
    return Array.isArray(value) ? value.map((entry) => String(entry || "").trim()).filter(Boolean) : [];
}

function cleanDisplayName(value) {
    const text = String(value || "").trim().replace(/\s+/g, " ");
    return text.slice(0, 32) || accountDisplayName(state.authProfile);
}

function cleanAvatarSource(value) {
    const id = String(value || "").trim();
    if (id === "custom") return "custom";
    return cosmeticCatalogCollection("icon").some((option) => option.id === id) ? id : "minecraft";
}

function cleanProfileIcon(value, account = null, badgeState = null) {
    const source = cleanAvatarSource(value);
    if (!account) return source;
    if (profileIconUnlocked(source, account, badgeState || accountBadgeState(account, accountLinkedStatsProfile(account)))) return source;
    const saved = cleanAvatarSource(account?.avatar_source);
    return profileIconUnlocked(saved, account, badgeState || accountBadgeState(account, accountLinkedStatsProfile(account))) ? saved : "minecraft";
}

function profileIconUnlocked(id, account, badgeState = accountBadgeState(account, accountLinkedStatsProfile(account))) {
    if (cosmeticRevokedForAccount("icon", id, account)) return false;
    if (id === "custom") return Boolean(account?.custom_avatar_url);
    const managedOwnership = managedCosmeticOwnership("icon", id, account);
    if (managedOwnership !== null) return managedOwnership;
    if (profileCosmeticInventoryHas(account, "icon", id)) return true;
    if (arrayField(account?.unlocked_icons).includes(id)) return true;
    const option = cosmeticCatalogItem("icon", id);
    if (!option) return false;
    if (!option.unlock || option.unlock === "default") return true;
    return badgeState.unlockedIds?.has(option.unlock) || false;
}

function profileBackgroundUnlocked(id, account, badgeState = accountBadgeState(account, accountLinkedStatsProfile(account))) {
    if (cosmeticRevokedForAccount("background", id, account)) return false;
    if (id === "custom") return Boolean(account?.custom_background_url);
    const managedOwnership = managedCosmeticOwnership("background", id, account);
    if (managedOwnership !== null) return managedOwnership;
    if (id === "default") return true;
    if (profileCosmeticInventoryHas(account, "background", id)) return true;
    if (arrayField(account?.unlocked_backgrounds).includes(id)) return true;
    const option = cosmeticCatalogItem("background", id);
    if (!option) return false;
    if (!option.unlock || option.unlock === "default") return true;
    return badgeState.unlockedIds?.has(option.unlock) || false;
}

function pfpBorderUnlocked(id, account, badgeState = accountBadgeState(account, accountLinkedStatsProfile(account))) {
    if (cosmeticRevokedForAccount("border", id, account)) return false;
    const managedOwnership = managedCosmeticOwnership("border", id, account);
    if (managedOwnership !== null) return managedOwnership;
    if (id === "none") return true;
    if (profileCosmeticInventoryHas(account, "border", id)) return true;
    if (arrayField(account?.unlocked_pfp_borders).includes(id)) return true;
    const option = cosmeticCatalogItem("border", id);
    if (!option) return false;
    if (!option.unlock || option.unlock === "default") return true;
    return badgeState.unlockedIds?.has(option.unlock) || false;
}

function profileTitleUnlocked(id, account, badgeState = accountBadgeState(account, accountLinkedStatsProfile(account))) {
    if (cosmeticRevokedForAccount("title", id, account)) return false;
    const managedOwnership = managedCosmeticOwnership("title", id, account);
    if (managedOwnership !== null) return managedOwnership;
    if (id === "none") return true;
    if (profileCosmeticInventoryHas(account, "title", id)) return true;
    if (arrayField(account?.unlocked_titles).includes(id)) return true;
    const option = cosmeticCatalogItem("title", id);
    if (!option) return false;
    if (!option.unlock || option.unlock === "default") return true;
    return badgeState.unlockedIds?.has(option.unlock) || false;
}

function profileCosmeticInventoryHas(account, type, id) {
    return Array.isArray(account?.cosmetic_inventory)
        && account.cosmetic_inventory.some((item) => item?.type === type && item?.id === id);
}

function cosmeticRevokedForAccount(type, id, account) {
    return Boolean(
        account?.id
        && account.id === state.authSession?.user?.id
        && state.accountCosmeticRevocations.has(cosmeticCatalogKey(type, id))
    );
}

function managedCosmeticOwnership(type, id, account) {
    const managed = state.store.catalogItems.find((item) => item.type === type && item.id === id);
    if (!managed) return null;
    if (!managed.active) return false;
    if (managed.acquisitionType === "default") return true;
    return profileCosmeticInventoryHas(account, type, id);
}

function cleanProfileBackground(value, account = null, badgeState = null) {
    const id = String(value || "").trim();
    const valid = cosmeticCatalogCollection("background").some((option) => option.id === id) ? id : "default";
    if (!account) return valid;
    return profileBackgroundUnlocked(valid, account, badgeState || accountBadgeState(account, accountLinkedStatsProfile(account))) ? valid : "default";
}

function cleanPfpBorder(value, account = null, badgeState = null) {
    const id = String(value || "").trim();
    const valid = cosmeticCatalogCollection("border").some((option) => option.id === id) ? id : "none";
    if (!account) return valid;
    return pfpBorderUnlocked(valid, account, badgeState || accountBadgeState(account, accountLinkedStatsProfile(account))) ? valid : "none";
}

function cleanProfileTitle(value, account = null, badgeState = null) {
    const id = String(value || "").trim();
    const valid = cosmeticCatalogCollection("title").some((option) => option.id === id) ? id : "none";
    if (!account) return valid;
    return profileTitleUnlocked(valid, account, badgeState || accountBadgeState(account, accountLinkedStatsProfile(account))) ? valid : "none";
}

function normalizePlayerName(name) {
    return String(name || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function renderProfilePreview() {
    const container = document.getElementById("profile-body");
    const profile = profileById(state.selectedId);
    document.getElementById("profile-title").textContent = profile ? playerDisplayName(profile, profile) : "Select a player";

    if (!profile) {
        container.innerHTML = `<div class="profile-placeholder"><p>Pick a player row to inspect their stats.</p></div>`;
        return;
    }

    const account = accountProfileForPlayer(profile, profile);
    const name = playerDisplayName(profile, profile);
    const badges = selectedAccountBadges(account, accountBadgeState(account, profile));
    container.innerHTML = `
        <section class="profile-preview-hero ${profileBackgroundClass(account)}"${profileBackgroundStyle(account)} ${backgroundCosmeticOwnershipDataAttributes(account)}>
            <div class="profile-preview-head">
                ${renderPlayerAvatar(profile, profile, 96, "profile-preview-avatar")}
                <div class="profile-preview-copy">
                    <p class="panel-kicker profile-preview-kicker">${account ? "Linked Account" : "Tracked Player"}</p>
                    <strong>${escapeHtml(name)}</strong>
                    ${renderProfileTitle(account, { compact: true })}
                    <span class="profile-preview-linked">${account ? `Linked to ${escapeHtml(profile.name || "Minecraft player")}` : "No website account linked yet"}</span>
                    ${account ? renderAccountSignedDate(account) : ""}
                    ${account ? renderAccountLevelPill(account) : ""}
                </div>
            </div>
            <div class="account-badge-row compact profile-preview-badges">
                ${badges.length ? badges.map((badge) => renderProfileBadge(badge)).join("") : `<span class="profile-badge empty">No badges equipped</span>`}
            </div>
        </section>
        <button class="primary-action" type="button" id="open-full-profile">Open Full Profile</button>
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

    title.textContent = playerDisplayName(profile, profile);
    subtitle.textContent = "Stats update when the server publishes new data.";

    const tabs = renderPlayerTabs();
    const content = renderPlayerTabContent(profile);
    body.innerHTML = `${renderPlayerProfileHero(profile)}${tabs}${content}`;
}

function renderPlayerProfileHero(profile) {
    const account = accountProfileForPlayer(profile, profile);
    const name = playerDisplayName(profile, profile);
    const br = normalizePlayer(profile.battleRoyale);
    const dm = normalizePlayer(profile.deathmatch);
    const badgeState = accountBadgeState(account, profile);
    const badges = selectedAccountBadges(account, badgeState);
    return `
        <section class="player-profile-hero ${profileBackgroundClass(account)}"${profileBackgroundStyle(account)} ${backgroundCosmeticOwnershipDataAttributes(account)}>
            <div class="player-profile-identity">
                ${renderPlayerAvatar(profile, profile, 128, "player-profile-avatar")}
                <div>
                    <p class="panel-kicker">${account ? "Linked Account" : "Tracked Player"}</p>
                    <h3>${escapeHtml(name)}</h3>
                    ${renderProfileTitle(account)}
                    <span>${account ? escapeHtml(profile.name || "Linked Minecraft player") : "No website account linked yet"}</span>
                    ${account ? renderAccountSignedDate(account) : ""}
                    ${account ? renderAccountLevelPill(account) : ""}
                    <div class="account-badge-row">
                        ${badges.length ? badges.map((badge) => renderProfileBadge(badge)).join("") : `<span class="profile-badge empty">No badges equipped</span>`}
                    </div>
                </div>
            </div>
            <div class="player-profile-quickstats">
                ${renderStatCard("BR Wins", br.stats.wins)}
                ${renderStatCard("BR Kills", br.stats.kills)}
                ${renderStatCard("DM Wins", dm.stats.wins)}
                ${renderStatCard("DM Kills", dm.stats.kills)}
            </div>
        </section>
    `;
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
    const br = normalizePlayer(profile.battleRoyale);
    const dm = normalizePlayer(profile.deathmatch);
    const brWeapon = cleanWeaponEntries(br.details?.weapons || [])[0] || null;
    const dmWeapon = cleanWeaponEntries(dm.details?.weapons || [])[0] || null;

    return `
        <section class="detail-grid">
            ${renderStatCard("BR Wins", br.stats.wins)}
            ${renderStatCard("BR Kills", br.stats.kills)}
            ${renderStatCard("BR Games", br.stats.games)}
            ${renderStatCard("BR Playtime", formatDuration(br.stats.playtimeSeconds))}
            ${renderStatCard("DM Wins", dm.stats.wins)}
            ${renderStatCard("DM Kills", dm.stats.kills)}
            ${renderStatCard("DM Games", dm.stats.games)}
            ${renderStatCard("DM Playtime", formatDuration(dm.stats.playtimeSeconds))}
            ${renderStatCard("DM Win Rate", formatPercent(dm.derived.winRate))}
            ${renderStatCard("DM HS%", formatPercent(dm.derived.headshotRate))}
            ${renderStatCard("DM Highest Streak", dm.stats.bestKillStreak)}
            ${renderStatCard("Top DM Kills", dm.stats.topMatchKills)}
        </section>
        <section class="detail-section">
            <h3>Profile Snapshot</h3>
            <div class="snapshot-grid">
                ${renderSnapshotItem("BR Best Placement", br.details?.battleRoyalePlacement?.best ? `#${br.details.battleRoyalePlacement.best}` : "-")}
                ${renderSnapshotItem("BR Top Weapon", brWeapon ? brWeapon.label : "-")}
                ${renderSnapshotItem("BR Vehicle Kills", br.stats.vehicleKills)}
                ${renderSnapshotItem("Favorite DM Kit", dm.details?.favoriteKit?.label || "-")}
                ${renderSnapshotItem("Favorite DM Map", dm.details?.favoriteMap?.label || "-")}
                ${renderSnapshotItem("DM Top Weapon", dmWeapon ? dmWeapon.label : "-")}
                ${renderSnapshotItem("DM Headshot Kills", dm.stats.headshotKills)}
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
    const br = normalizePlayer(profile.battleRoyale).details?.weapons || [];
    const dm = normalizePlayer(profile.deathmatch).details?.weapons || [];
    if (!br.length && !dm.length) return renderEmptyDetail("No weapon stats yet. Weapon tables start filling in after the updated server jar records new hits and kills.");
    const sort = PROFILE_WEAPON_SORTS[state.profileWeaponSort] ? state.profileWeaponSort : "kills";
    const direction = state.profileWeaponSortDirection === "asc" ? "asc" : "desc";
    return `
        ${br.length ? renderWeaponTable("Battle Royale Weapons", br, sort, direction) : ""}
        ${dm.length ? renderWeaponTable("Deathmatch Weapons", dm, sort, direction) : ""}
    `;
}

function renderHistoryTab(profile) {
    if (!PUBLIC_MODE_LABELS[state.historyFilter]) state.historyFilter = "battleRoyale";
    return `
        <section class="detail-section">
            <div class="history-heading">
                <h3>Match History</h3>
                <span>Local time: ${escapeHtml(viewerTimeZoneLabel())}</span>
            </div>
            <div class="history-filters">
                ${Object.entries(PUBLIC_MODE_LABELS).map(([id, label]) => {
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
                ${participants.map((player, index) => renderMatchParticipant(player, index, match)).join("")}
            </div>
        </div>
    `;
}

function renderMatchParticipant(player, index, match) {
    const profile = player.playerId ? profileById(player.playerId) : null;
    const name = player.playerId ? playerDisplayName(player, profile) : String(player.name || "Unknown");
    return `
        <article class="roster-row ${player.won ? "winner" : ""}">
            <strong>${escapeHtml(match.mode === "battleRoyale" && player.placement ? formatPlacement(player.placement) : `#${index + 1}`)}</strong>
            ${player.playerId ? `<a class="roster-player-link" href="#player=${encodeURIComponent(player.playerId)}&tab=overview">${escapeHtml(name)}</a>` : `<span>${escapeHtml(name)}</span>`}
            <span>${escapeHtml(String(player.kills || 0))} K</span>
            <span>${escapeHtml(String(player.deaths || 0))} D</span>
            <span>${formatPercent(rate(player.headshots, player.hits))} HS</span>
            <span>${escapeHtml(player.topWeapon || "-")}</span>
        </article>
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

function renderWeaponTable(title, weapons, sort = "kills", direction = "desc") {
    const rows = sortProfileWeapons(cleanWeaponEntries(weapons), sort, direction);
    if (rows.length === 0) return "";
    return `
        <section class="detail-section">
            <h3>${escapeHtml(title)}</h3>
            <div class="weapon-table">
                <div class="weapon-row heading">
                    <span>Weapon</span>
                    <span>${renderProfileWeaponSortButton("kills")}</span>
                    <span>${renderProfileWeaponSortButton("hits")}</span>
                    <span>${renderProfileWeaponSortButton("headshotRate")}</span>
                    <span>${renderProfileWeaponSortButton("headshotKills")}</span>
                    <span>${renderProfileWeaponSortButton("utilityKills")}</span>
                    <span>${renderProfileWeaponSortButton("vehicleKills")}</span>
                </div>
                ${rows.map(renderWeaponRow).join("")}
            </div>
        </section>
    `;
}

function renderProfileWeaponSortButton(sort) {
    const safeSort = escapeHtml(sort);
    const active = state.profileWeaponSort === sort;
    const direction = state.profileWeaponSortDirection === "asc" ? "asc" : "desc";
    const currentDirection = direction === "desc" ? "descending" : "ascending";
    const nextDirection = active && direction === "desc" ? "ascending" : "descending";
    const label = PROFILE_WEAPON_SORTS[sort] || sort;
    return `
        <button class="sort-header weapon-sort-header ${active ? "active" : ""}" type="button" data-profile-weapon-sort="${safeSort}" aria-pressed="${active ? "true" : "false"}" aria-label="${escapeHtml(active
            ? `${label}, sorted ${currentDirection}. Activate to sort ${nextDirection}.`
            : `${label}, not sorted. Activate to sort descending.`)}">
            ${escapeHtml(label)} <span aria-hidden="true">${active ? (direction === "desc" ? "v" : "^") : ""}</span>
        </button>
    `;
}

function sortProfileWeapons(rows, sort, directionId = "desc") {
    const sortId = PROFILE_WEAPON_SORTS[sort] ? sort : "kills";
    const direction = directionId === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
        const primary = (weaponSortValue(a, sortId) - weaponSortValue(b, sortId)) * direction;
        if (primary) return primary;
        const kills = weaponSortValue(b, "kills") - weaponSortValue(a, "kills");
        if (kills) return kills;
        return weaponLabel(a).localeCompare(weaponLabel(b));
    });
}

function weaponSortValue(entry, sort) {
    const stats = normalizeStats(entry.stats);
    const derived = normalizeDerived(entry.derived, stats);
    switch (sort) {
        case "hits":
            return stats.hits;
        case "headshotRate":
            return derived.headshotRate;
        case "headshotKills":
            return stats.headshotKills;
        case "utilityKills":
            return stats.utilityKills;
        case "vehicleKills":
            return stats.vehicleKills;
        case "kills":
        default:
            return stats.kills;
    }
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
    const profile = row.playerId ? profileById(row.playerId) : null;
    const displayName = row.playerId ? playerDisplayName(row, profile) : "";
    return [row.name, row.label, row.id, displayName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
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
        total.mvp += next.mvp;
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
        mvp: number(stats?.mvp ?? stats?.mvps ?? stats?.mvpCount ?? stats?.mvpAwards),
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

function skinHeadUrl(name, size) {
    const safeName = String(name || DEFAULT_SKIN_NAME).trim() || DEFAULT_SKIN_NAME;
    const safeSize = Math.max(16, Math.min(256, Math.round(number(size) || 96)));
    return `https://api.mcheads.org/head/${encodeURIComponent(safeName)}/${safeSize}`;
}

function alternateSkinHeadUrl(name, size) {
    const safeName = String(name || DEFAULT_SKIN_NAME).trim() || DEFAULT_SKIN_NAME;
    const safeSize = Math.max(16, Math.min(256, Math.round(number(size) || 96)));
    return `https://mc-heads.net/avatar/${encodeURIComponent(safeName)}/${safeSize}`;
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
