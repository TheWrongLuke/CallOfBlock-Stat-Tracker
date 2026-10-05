import { expect, test } from "@playwright/test";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";

const statsExportFixture = JSON.parse(
    readFileSync(new URL("../../data/stats.sample.json", import.meta.url), "utf8").replace(/^\uFEFF/, "")
);
const liveStatsExportFixture = JSON.parse(
    readFileSync(new URL("../../data/stats.json", import.meta.url), "utf8").replace(/^\uFEFF/, "")
);
const zombieTelemetryFixture = JSON.parse(
    readFileSync(new URL("../fixtures/match-telemetry/fixture-zombie.json", import.meta.url), "utf8")
);

test.beforeEach(async ({ page }) => {
    await page.route("**/data/match-telemetry/fixture-*.json", async (route) => {
        const name = new URL(route.request().url()).pathname.split("/").at(-1);
        if (!/^fixture-(?:br|dm|partial|zombie)\.json$/.test(name)) return route.fallback();
        await route.fulfill({
            contentType: "application/json",
            body: readFileSync(new URL(`../fixtures/match-telemetry/${name}`, import.meta.url), "utf8")
        });
    });
});

function zombieTelemetryWithCount(count) {
    const fixture = structuredClone(zombieTelemetryFixture);
    fixture.matchId = `fixture-zombie-${count}`;
    fixture.events = fixture.events.filter((event) => !["zombie_damage", "zombie_death"].includes(event.type));
    fixture.zombieSnapshots = [0, 1000, 2000, 3000].map((timeMs, snapshotIndex) => ({
        timeMs,
        zombies: Array.from({ length: count }, (_value, index) => ({
            zombieId: `z-${index + 1}`,
            type: index % 10 === 0 ? "runner" : "normal",
            x: -420 + ((index * 31 + snapshotIndex * 3) % 740),
            y: 70 + (index % 4),
            z: -410 + ((index * 47 + snapshotIndex * 2) % 720)
        }))
    }));
    return fixture;
}

const supabaseStub = `
(() => {
    function builder() {
        let proxy;
        proxy = new Proxy({}, {
            get(_target, property) {
                if (property === "then") return (resolve) => resolve({ data: [], error: null });
                return () => proxy;
            }
        });
        return proxy;
    }
    window.supabase = {
        createClient() {
            return {
                auth: {
                    getSession: async () => ({ data: { session: null }, error: null }),
                    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
                    signInWithOAuth: async () => ({ error: null }),
                    signOut: async () => ({ error: null })
                },
                from: () => builder(),
                rpc: async () => ({ data: null, error: null })
            };
        }
    };
})();
`;

const configStub = `
window.COB_SUPABASE_URL = "https://test.supabase.co";
window.COB_SUPABASE_KEY = "publishable-test-key";
window.COB_SUPABASE_TABLE = "cob_stats_exports";
window.COB_SUPABASE_ROW_ID = "live";
window.COB_PUBLIC_SITE_URL = "http://127.0.0.1:4175/";
window.COB_STATS_API_URL = "";
`;

const countingSupabaseStub = supabaseStub
    .replace(
        "function builder() {",
        `function builder(table) {
        window.__supabaseTableRequests = window.__supabaseTableRequests || {};
        window.__supabaseTableRequests[table] = (window.__supabaseTableRequests[table] || 0) + 1;`
    )
    .replace("from: () => builder(),", "from: (table) => builder(table),");

const transparentPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
);

const adminSupabaseStub = `
(() => {
    const profile = {
        id: "123e4567-e89b-42d3-a456-426614174000",
        discord_id: "discord-test-user",
        username: "test-admin",
        display_name: "Test Admin",
        avatar_url: null,
        avatar_source: "minecraft",
        is_admin: true,
        is_owner: true,
        banned_from_voting: false,
        minecraft_player_name: "AdminMC",
        created_at: "2026-07-01T12:00:00Z",
        xp: 12500,
        selected_badges: [],
        unlocked_badges: [],
        unlocked_backgrounds: ["night"],
        unlocked_pfp_borders: ["green"],
        unlocked_icons: [],
        unlocked_titles: ["owner"]
    };
    const member = {
        id: "223e4567-e89b-42d3-a456-426614174111",
        username: "community-player",
        display_name: "Community Player",
        avatar_url: null,
        minecraft_player_name: "PlayerMC",
        is_admin: false,
        is_owner: false,
        banned_from_voting: false,
        ban_reason: null,
        banned_at: null,
        banned_by_username: null,
        created_at: "2026-07-02T12:00:00Z"
    };
    const emailPreferences = {
        playtest_email: false,
        ticket_response_email: false,
        admin_ticket_email: false,
        admin_account_created_email: false
    };
    function currentCycleKey() {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
        return [start.getFullYear(), String(start.getMonth() + 1).padStart(2, "0"), String(start.getDate()).padStart(2, "0")].join("-");
    }
    const missionRow = {
        user_id: profile.id,
        cycle_key: currentCycleKey(),
        cycle_ends_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        missions: [{
            id: "easy_kills:test-cycle:1",
            family: "kills_any",
            difficulty: "easy",
            label: "On the Board",
            description: "Get 5 kills in any mode.",
            metric: "kills",
            target: 5,
            xp: 350,
            mode: "overall",
            baseline: 0,
            requirements: { type: "stat" },
            carried: false,
            swapUsed: false
        }],
        claimed_ids: [],
        swapped_ids: [],
        awaiting_link: false,
        created_at: "2026-07-01T12:00:00Z",
        updated_at: "2026-07-01T12:00:00Z"
    };
    const badgeOverrides = [];

    function resultFor(table, calls) {
        const single = calls.some(([method]) => method === "single" || method === "maybeSingle");
        const write = calls.find(([method]) => method === "upsert");
        if (table === "cosmetic_catalog_items" && write) {
            window.__catalogWrites = window.__catalogWrites || [];
            window.__catalogWrites.push(write[1][0]);
            if (window.__failCosmeticSave) {
                window.__failCosmeticSave = false;
                return {data: null, error: {message: "Simulated save failure"}};
            }
            window.__savedCosmetics = window.__savedCosmetics || [];
            const item = write[1][0];
            const index = window.__savedCosmetics.findIndex(row => row.cosmetic_type === item.cosmetic_type && row.cosmetic_id === item.cosmetic_id);
            if (index >= 0) window.__savedCosmetics.splice(index, 1, item);
            else window.__savedCosmetics.push(item);
            return {data: item, error: null};
        }
        if (table === "profiles") return { data: single ? profile : [profile], error: null };
        if (table === "public_profiles") return { data: [profile], error: null };
        if (table === "badge_catalog_overrides") return { data: badgeOverrides.map((entry) => ({ ...entry })), error: null };
        if (table === "cosmetic_catalog_items") return {
            data: [...(window.__savedCosmetics || []), {
                cosmetic_type: "icon",
                cosmetic_id: "minecraft",
                name: "Minecraft skin",
                description: "Use the linked Minecraft skin.",
                category: "Default",
                rarity: "common",
                image_url: "./assets/branding/icon.png",
                title_text: null,
                border_inset: 0,
                active: true,
                shop_enabled: false,
                shop_unit_amount: 0,
                shop_currency: "eur",
                shop_featured: false,
                sort_order: 2,
                acquisition_type: "default",
                available_from: null,
                available_until: null,
                supply_limit: null,
                created_at: "2026-07-01T12:00:00Z",
                updated_at: "2026-07-01T12:00:00Z"
            }],
            error: null
        };
        if (table === "profile_cosmetic_inventory") return {
            data: [{
                profile_id: member.id,
                cosmetic_type: "title",
                cosmetic_id: "br_survivor",
                source: "progression",
                grant_note: null,
                granted_by: null,
                acquired_at: "2026-07-12T12:00:00Z"
            }],
            error: null
        };
        if (table === "weekly_mission_templates") return {
            data: [{
                id: "easy_kills",
                family: "kills_any",
                difficulty: "easy",
                label: "On the Board",
                description: "Get 5 kills in any mode.",
                metric: "kills",
                target: 5,
                xp: 350,
                mode: "overall",
                weapon_scope: "none",
                weapon_id: null,
                weapon_category: null,
                active: true,
                sort_order: 10,
                created_at: "2026-07-17T12:00:00Z",
                updated_at: "2026-07-17T12:00:00Z"
            }],
            error: null
        };
        return { data: [], error: null };
    }

    function builder(table) {
        const calls = [];
        let proxy;
        proxy = new Proxy({}, {
            get(_target, property) {
                if (property === "then") {
                    return (resolve) => resolve(resultFor(table, calls));
                }
                return (...args) => {
                    calls.push([String(property), args]);
                    return proxy;
                };
            }
        });
        return proxy;
    }

    window.supabase = {
        createClient() {
            return {
                auth: {
                    getSession: async () => ({
                        data: {
                            session: {
                                user: {
                                    id: profile.id,
                                    user_metadata: {
                                        sub: profile.discord_id,
                                        username: profile.username,
                                        global_name: profile.display_name
                                    }
                                }
                            }
                        },
                        error: null
                    }),
                    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
                    signInWithOAuth: async () => ({ error: null }),
                    signOut: async () => ({ error: null })
                },
                from: (table) => builder(table),
                functions: {
                    invoke: async (name, options) => {
                        window.__edgeFunctionCalls = window.__edgeFunctionCalls || [];
                        window.__edgeFunctionCalls.push({ name, options });
                        return { data: { deleted: name === "delete-account" }, error: null };
                    }
                },
                rpc: async (name, args = {}) => {
                    if (name === "get_weekly_mission_state_v4") {
                        const {findStatsProfile, mergeStatsProfile} = await import(location.origin + '/src/core/mission-profile.js');
                        const {weeklyMissionProgress} = await import(location.origin + '/src/core/weekly-mission-progress.js');
                        const snapshots = await Promise.all(['', ':weapons', ':maps'].map(async (suffix) => {
                            const response = await fetch('https://test.supabase.co/rest/v1/cob_stats_exports?id=eq.'
                                + encodeURIComponent('profile:' + profile.minecraft_player_id + suffix));
                            const rows = await response.json();
                            return findStatsProfile(rows[0]?.payload, profile.minecraft_player_id);
                        }));
                        const stats = snapshots.every(Boolean) ? mergeStatsProfile(...snapshots) : null;
                        if (stats?.battleRoyale?.stats) stats.battleRoyale.stats.kills += window.__missionBonus || 0;
                        return {data: {...missionRow, stats_profile: stats, missions: missionRow.missions.map(mission => ({
                            ...mission, serverProgress: stats ? weeklyMissionProgress(stats, mission) : undefined
                        }))}, error: null};
                    }
                    if (name === "get_my_notification_preferences") {
                        return { data: { ...emailPreferences }, error: null };
                    }
                    if (name === "save_my_notification_preferences") {
                        Object.assign(emailPreferences, {
                            playtest_email: Boolean(args.p_playtest_email),
                            ticket_response_email: Boolean(args.p_ticket_response_email),
                            admin_ticket_email: Boolean((profile.is_admin || profile.is_owner) && args.p_admin_ticket_email),
                            admin_account_created_email: Boolean(
                                (profile.is_admin || profile.is_owner) && args.p_admin_account_created_email
                            )
                        });
                        return { data: { ...emailPreferences }, error: null };
                    }
                    if (name === "sync_discord_profile_v2" && window.__profileSyncDelayMs) {
                        await new Promise((resolve) => setTimeout(resolve, window.__profileSyncDelayMs));
                    }
                    if (name === "save_profile_customization_v2") {
                        Object.assign(profile, {
                            display_name: args.p_display_name,
                            avatar_source: args.p_avatar_source,
                            profile_background: args.p_profile_background,
                            pfp_border: args.p_pfp_border,
                            profile_title: args.p_profile_title,
                            selected_badges: [...(args.p_selected_badges || [])]
                        });
                    }
                    if (name === "admin_save_badge_catalog_override") {
                        const saved = {
                            ...args.p_badge,
                            created_at: "2026-07-24T12:00:00Z",
                            updated_at: new Date().toISOString()
                        };
                        const existingIndex = badgeOverrides.findIndex((entry) => entry.badge_id === saved.badge_id);
                        if (existingIndex >= 0) badgeOverrides.splice(existingIndex, 1, saved);
                        else badgeOverrides.push(saved);
                        return { data: [saved], error: null };
                    }
                    return {
                        data: name === "sync_discord_profile_v2" || name === "save_profile_customization_v2"
                            ? profile
                                : name === "reconcile_cosmetic_ownership_v2"
                                    ? { eligible: 0, added: 0, removed: 0 }
                                    : name === "admin_list_managed_players"
                                        ? [profile, member]
                                        : [],
                        error: null
                    };
                },
                storage: { from: () => ({}) }
            };
        }
    };
})();
`;

const memberSupabaseStub = adminSupabaseStub
    .replace("is_admin: true", "is_admin: false")
    .replace("is_owner: true", "is_owner: false");

const playtestAdminSupabaseStub = adminSupabaseStub
    .replace(
        "function resultFor(table, calls) {",
        `
    const eventId = "423e4567-e89b-42d3-a456-426614174000";
    const slotId = "523e4567-e89b-42d3-a456-426614174000";
    window.__playtestEvents = [{id: eventId, title: "Friends arena test", description: "TDM and FFA", status: "voting", created_by: profile.id, main_slot_id: slotId, votes_frozen: false, archived_at: null, created_at: "2030-10-01T12:00:00Z"}];
    window.__playtestSlots = [{id: slotId, playtest_id: eventId, start_datetime: "2030-10-02T18:00:00Z", end_datetime: "2030-10-02T20:00:00Z", label: "Featured date", source: "featured", is_main: true}];
    window.__playtestVotes = [
        {id: "vote", playtest_id: eventId, slot_id: slotId, user_id: profile.id, status: "available", mode_preference: "either", available_start_datetime: "2030-10-02T18:00:00Z", available_end_datetime: "2030-10-02T19:00:00Z"},
        {id: "vote-member", playtest_id: eventId, slot_id: slotId, user_id: member.id, status: "maybe", mode_preference: "deathmatch", available_start_datetime: "2030-10-02T18:30:00Z", available_end_datetime: "2030-10-02T20:00:00Z"},
        {id: "vote-away", playtest_id: eventId, slot_id: slotId, user_id: "away", status: "unavailable", mode_preference: "battle_royale"}
    ];
    function resultFor(table, calls) {
        if (table === "public_profiles") return {data: [profile, member, {id: "away", username: "Busy Friend"}], error: null};
        if (table === "playtests") {
            const update = calls.find(([method]) => method === "update");
            const id = calls.find(([method, args]) => method === "eq" && args[0] === "id")?.[1][1];
            if (update) {
                const row = window.__playtestEvents.find(event => event.id === id);
                if (!row) return {data: null, error: {message: "Event missing"}};
                Object.assign(row, update[1][0]);
                return {data: {...row}, error: null};
            }
            const rows = window.__playtestEvents.filter(row => !calls.some(([method, args]) => method === "is" && args[0] === "archived_at") || !row.archived_at);
            return {data: rows.map(row => ({...row})), error: null};
        }
        if (table === "playtest_slots") return {data: window.__playtestSlots.map(row => ({...row})), error: null};
        if (table === "availability") return {data: window.__playtestVotes.map(row => ({...row})), error: null};
`
    )
    .replace(
        "rpc: async (name, args = {}) => {",
        `rpc: async (name, args = {}) => {
    if (name === "admin_create_playtest_with_notifications") {
        window.__playtestCreateCalls = window.__playtestCreateCalls || [];
        window.__playtestCreateCalls.push(args);
        if (!window.__playtestEvents.some(row => row.id === args.p_request_id)) {
            const starts = args.p_starts;
            const mainId = args.p_request_id + "-main";
            window.__playtestEvents.push({id: args.p_request_id, title: args.p_title, description: args.p_description, status: args.p_status, created_by: profile.id, main_slot_id: mainId, votes_frozen: false, archived_at: null, created_at: new Date().toISOString()});
            starts.forEach((start, index) => window.__playtestSlots.push({id: index ? args.p_request_id + "-" + index : mainId, playtest_id: args.p_request_id, start_datetime: start, end_datetime: new Date(Date.parse(start) + args.p_duration_minutes * 60000).toISOString(), source: "featured", label: "Featured date", is_main: index === 0}));
        }
        if (window.__losePlaytestResponse) {
            window.__losePlaytestResponse = false;
            return {data: null, error: {message: "Simulated lost response; retry safely"}};
        }
        return {data: args.p_request_id, error: null};
    }
`
    );

const communityCalendarSupabaseStub = playtestAdminSupabaseStub
    .replace(
        /window\.__playtestEvents = \[\{id: eventId[^\n]+/,
        `window.__playtestEvents = [{id: eventId, title: "Community calendar", description: "Plan matches with the community", status: "voting", is_community_calendar: true, votes_frozen: false, archived_at: null}];`
    )
    .replace(/window\.__playtestSlots = \[\{id: slotId[^\n]+/, "window.__playtestSlots = [];")
    .replace(/window\.__playtestVotes = \[[\s\S]+?\n {4}\];/, "window.__playtestVotes = [];")
    .replace(
        'if (table === "playtest_slots") return',
        `if (table === "playtest_slots" && calls.some(([method]) => method === "insert")) {
        if (window.__playtestEvents[0].votes_frozen) return {data: null, error: {message: "Community calendar is paused"}};
        const value = calls.find(([method]) => method === "insert")[1][0];
        const slot = {...value, id: "community-slot-" + window.__playtestSlots.length};
        window.__playtestSlots.push(slot);
        return {data: {...slot}, error: null};
    }
    if (table === "availability" && calls.some(([method]) => method === "upsert")) {
        if (window.__playtestEvents[0].votes_frozen) return {data: null, error: {message: "Community calendar is paused"}};
        const value = calls.find(([method]) => method === "upsert")[1][0];
        const index = window.__playtestVotes.findIndex(row => row.slot_id === value.slot_id && row.user_id === value.user_id);
        if (index < 0) window.__playtestVotes.push({...value, id: "community-vote"});
        else Object.assign(window.__playtestVotes[index], value);
        return {data: null, error: null};
    }
    if (table === "playtest_slots") return`
    );

const accountStatsSupabaseStub = adminSupabaseStub.replace(
    'minecraft_player_name: "AdminMC",',
    'minecraft_player_name: "RTXLuke",\n        minecraft_player_id: "sample-rtxluke",'
);

const discordAvatarSupabaseStub = adminSupabaseStub
    .replace('discord_id: "discord-test-user"', 'discord_id: "138564775733886986"')
    .replace(
        "avatar_url: null",
        'avatar_url: "https://cdn.discordapp.com/avatars/138564775733886986/a_deadbeef.png?size=128"'
    )
    .replace('avatar_source: "minecraft"', 'avatar_source: "discord"')
    .replace('cosmetic_id: "minecraft"', 'cosmetic_id: "default"')
    .replace('image_url: "./assets/branding/icon.png"', 'image_url: "./Icon.png"');

const giftSupabaseStub = adminSupabaseStub.replace(
    "rpc: async (name, args = {}) => {",
    `rpc: async (name, args = {}) => {
                    window.__giftNotification = window.__giftNotification || {
                        id: "323e4567-e89b-42d3-a456-426614174222",
                        notification_type: "cosmetic_gift",
                        title: "You received Night Ops",
                        message: "Thanks for helping with the server.",
                        cosmetic_type: "background",
                        cosmetic_id: "night",
                        gift_source: "friend",
                        read_at: null,
                        claimed_at: null,
                        created_at: "2026-07-19T12:00:00Z",
                        sender_name: "TheWrongLuke",
                        cosmetic_name: "Night Ops",
                        deleted: false
                    };
                    const gift = window.__giftNotification;
                    if (name === "list_my_notifications") {
                        return { data: gift.deleted ? [] : [{ ...gift }], error: null };
                    }
                    if (name === "set_my_notification_read") {
                        gift.read_at = args.p_read ? new Date().toISOString() : null;
                        return { data: true, error: null };
                    }
                    if (name === "claim_my_cosmetic_gift") {
                        gift.claimed_at = new Date().toISOString();
                        gift.read_at = gift.read_at || gift.claimed_at;
                        return { data: { claimed: true }, error: null };
                    }
                    if (name === "delete_my_notification") {
                        gift.deleted = true;
                        return { data: true, error: null };
                    }
                    `
);

const delayedAdminSupabaseStub = `window.__profileSyncDelayMs = 1200;\n${adminSupabaseStub}`
    .replace(
        "function builder(table) {\n        const calls = [];",
        `function builder(table) {
        window.__queriedSupabaseTables = window.__queriedSupabaseTables || [];
        window.__queriedSupabaseTables.push(table);
        const calls = [];`
    )
    .replace(
        "return (resolve) => resolve(resultFor(table, calls));",
        `return (resolve) => setTimeout(
                        () => resolve(resultFor(table, calls)),
                        table === "profiles" ? 1200 : 0
                    );`
    );

async function installPageStubs(page, supabaseBody, statsPayload = statsExportFixture) {
    await page.route("https://cdn.jsdelivr.net/**", (route) =>
        route.fulfill({ contentType: "text/javascript", body: supabaseBody })
    );
    await page.route("https://test.supabase.co/rest/v1/**", (route) => {
        const requestedRow = new URL(route.request().url()).searchParams.get("id");
        const requestedPayload =
            requestedRow === "eq.live"
                ? liveStatsExportFixture
                : typeof statsPayload === "function"
                  ? statsPayload(requestedRow)
                  : statsPayload;
        return route.fulfill({
            contentType: "application/json",
            body: JSON.stringify([{ payload: requestedPayload }])
        });
    });
    await page.route("https://mc-heads.net/**", (route) =>
        route.fulfill({
            status: 502,
            contentType: "application/json",
            body: '{"error":"unavailable"}'
        })
    );
    await page.route("https://api.mcheads.org/**", (route) =>
        route.fulfill({ contentType: "image/png", body: transparentPng })
    );
    await page.route("https://fonts.googleapis.com/**", (route) =>
        route.fulfill({ contentType: "text/css", body: "" })
    );
    await page.route("**/api-config.js*", (route) =>
        route.fulfill({ contentType: "text/javascript", body: configStub })
    );
}

async function openApp(page, hash = "") {
    await installPageStubs(page, supabaseStub);
    await page.goto(`/${hash}`);
    await page.waitForLoadState("domcontentloaded");
}

async function openAuthenticatedApp(page, hash = "") {
    const authenticatedStub = supabaseStub.replace(
        "session: null",
        `session: {
            user: {
                id: "123e4567-e89b-42d3-a456-426614174000",
                user_metadata: { sub: "discord-test-user", global_name: "Test Player" }
            }
        }`
    );
    await installPageStubs(page, authenticatedStub);
    await page.goto(`/${hash}`);
    await page.waitForLoadState("domcontentloaded");
}

async function openAdminApp(page, hash = "#admin-progression") {
    await installPageStubs(page, adminSupabaseStub);
    await page.goto(`/${hash}`);
    await page.waitForLoadState("domcontentloaded");
}

async function openMemberApp(page, hash = "") {
    await installPageStubs(page, memberSupabaseStub);
    await page.goto(`/${hash}`);
    await page.waitForLoadState("domcontentloaded");
}

async function openGiftApp(page, hash = "") {
    await installPageStubs(page, giftSupabaseStub);
    await page.goto(`/${hash}`);
    await page.waitForLoadState("domcontentloaded");
}

async function openDelayedAdminApp(page, hash = "#admin-help") {
    await installPageStubs(page, delayedAdminSupabaseStub);
    await page.goto(`/${hash}`);
    await page.waitForLoadState("domcontentloaded");
}

async function openStatsFromHome(page) {
    const desktopStats = page.locator('.site-header-nav a[data-site-route="stats"]');
    if (await desktopStats.isVisible()) {
        await desktopStats.click();
        return;
    }

    const mobileMenu = page.locator(".mobile-site-menu");
    await mobileMenu.locator("summary").click();
    await mobileMenu.getByRole("link", { name: "Stats Tracker" }).click();
}

test("homepage and primary navigation load without fatal errors", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await openApp(page);
    await expect(page.getByRole("heading", { level: 1, name: "Call of Block" })).toBeVisible();
    await expect(page.locator(".featured-video-card")).toHaveCount(2);
    await expect(page.locator(".featured-video-card").first()).toHaveAttribute("href", "https://youtu.be/JZqvvCtTd6Y");
    await expect(page.locator(".featured-video-card").last()).toHaveAttribute("href", "https://youtu.be/Os_69_Fz0xU");
    await expect(page.locator("#leaderboard-view")).toBeHidden();
    await expect(page.locator("[data-stats-refresh-control]")).toBeHidden();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await openStatsFromHome(page);
    await expect(page.locator("#leaderboard-view")).toBeVisible();
    await expect(page.locator("[data-stats-refresh-control]")).toBeVisible();
    await expect(page.locator("[data-stats-refresh-label]")).toHaveText(/^\d+[smh]$/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    expect(pageErrors).toEqual([]);
});

test("public pages do not expose editorial placeholder copy", async ({ page }) => {
    await installPageStubs(page, supabaseStub);
    const routes = ["/", "/stats/", "/playtests/", "/feedback/", "/help/", "/about/"];
    const editorialPlaceholder =
        /specific featured video|once one is published|placeholder (?:copy|content|text)|(?:add|replace) (?:this|it) here|\bTBD\b/i;

    for (const route of routes) {
        await page.goto(route);
        await page.waitForLoadState("domcontentloaded");
        await expect(page.locator("body")).not.toContainText(editorialPlaceholder);
    }

    await page.goto("/");
    await expect(page.locator(".video-section")).toContainText("See Call of Block in action.");
});

test("public pages keep the compact mobile shell at supported widths", async ({ page }) => {
    await installPageStubs(page, supabaseStub);
    const routes = ["/", "/stats/", "/playtests/", "/feedback/", "/help/", "/about/"];
    const viewports = [
        { width: 320, height: 780 },
        { width: 360, height: 800 },
        { width: 390, height: 844 },
        { width: 430, height: 900 },
        { width: 768, height: 900 }
    ];

    for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        for (const route of routes) {
            await page.goto(route);
            await page.waitForLoadState("domcontentloaded");
            await expect(page.locator("h1")).toBeVisible();
            const layout = await page.evaluate(() => {
                const header = document.querySelector(".site-header");
                const hero = document.querySelector(".hero");
                const h1 = document.querySelector("h1");
                const homeContent = document.querySelector("#home-view");
                return {
                    route: document.body.dataset.publicRoute,
                    viewportHeight: window.innerHeight,
                    documentWidth: document.documentElement.scrollWidth,
                    viewportWidth: document.documentElement.clientWidth,
                    headerWidth: header?.getBoundingClientRect().width || 0,
                    headerHeight: header?.getBoundingClientRect().height || 0,
                    heroHeight: hero?.getBoundingClientRect().height || 0,
                    h1Size: Number.parseFloat(getComputedStyle(h1).fontSize),
                    homeContentTop: homeContent?.getBoundingClientRect().top || 0
                };
            });

            expect(layout.documentWidth, `${route} overflow at ${viewport.width}px`).toBeLessThanOrEqual(
                layout.viewportWidth + 1
            );
            expect(layout.headerWidth, `${route} header width at ${viewport.width}px`).toBeGreaterThanOrEqual(
                layout.viewportWidth - 1
            );
            expect(layout.headerHeight, `${route} header at ${viewport.width}px`).toBeGreaterThanOrEqual(52);
            expect(layout.headerHeight, `${route} header at ${viewport.width}px`).toBeLessThanOrEqual(60);
            expect(layout.h1Size, `${route} h1 at ${viewport.width}px`).toBeLessThanOrEqual(44);

            if (layout.route === "home") {
                expect(layout.homeContentTop, `home fold at ${viewport.width}px`).toBeLessThan(layout.viewportHeight);
            } else if (!["stats"].includes(layout.route)) {
                expect(layout.heroHeight, `${route} hero at ${viewport.width}px`).toBeLessThan(
                    layout.viewportHeight / 2
                );
            }
        }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/help/");
    const mobileMenu = page.locator(".mobile-site-menu");
    await mobileMenu.locator("summary").click();
    await expect(mobileMenu.getByRole("link", { name: "Stats Tracker" })).toBeVisible();
    await expect(mobileMenu.getByRole("link", { name: "About" })).toBeVisible();

    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    const landscape = await page.evaluate(() => ({
        heroHeight: document.querySelector(".hero")?.getBoundingClientRect().height || 0,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        championsVisible: getComputedStyle(document.querySelector(".hero-champions")).display !== "none"
    }));
    expect(landscape.documentWidth).toBeLessThanOrEqual(landscape.viewportWidth + 1);
    expect(landscape.heroHeight).toBeLessThan(280);
    expect(landscape.championsVisible).toBe(false);
});

test("desktop routes share one compact header with active navigation", async ({ page }) => {
    await installPageStubs(page, supabaseStub);
    const desktopWidths = [1024, 1280, 1440, 1920];

    for (const width of desktopWidths) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/");
        await page.waitForLoadState("domcontentloaded");
        const layout = await page.evaluate(() => {
            const header = document.querySelector(".site-header")?.getBoundingClientRect();
            const brand = document.querySelector(".site-header-brand")?.getBoundingClientRect();
            const navigation = document.querySelector(".site-header-nav")?.getBoundingClientRect();
            const actions = document.querySelector(".site-header-actions")?.getBoundingClientRect();
            const hero = document.querySelector(".hero")?.getBoundingClientRect();
            return {
                headerHeight: header?.height || 0,
                brandRight: brand?.right || 0,
                navigationLeft: navigation?.left || 0,
                navigationRight: navigation?.right || 0,
                actionsLeft: actions?.left || 0,
                heroTop: hero?.top || 0,
                headerBottom: header?.bottom || 0,
                documentWidth: document.documentElement.scrollWidth,
                viewportWidth: document.documentElement.clientWidth
            };
        });

        expect(layout.headerHeight, `desktop header at ${width}px`).toBeGreaterThanOrEqual(60);
        expect(layout.headerHeight, `desktop header at ${width}px`).toBeLessThanOrEqual(68);
        expect(layout.brandRight).toBeLessThanOrEqual(layout.navigationLeft + 1);
        expect(layout.navigationRight).toBeLessThanOrEqual(layout.actionsLeft + 1);
        expect(layout.heroTop).toBeGreaterThanOrEqual(layout.headerBottom - 1);
        expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
        await expect(page.locator(".site-header-nav")).toBeVisible();
        await expect(page.locator(".mobile-site-menu")).toBeHidden();
        await expect(page.locator(".tracker-float")).toHaveCount(0);
    }

    await page.setViewportSize({ width: 1280, height: 900 });
    const routes = [
        ["/", "home"],
        ["/stats/", "stats"],
        ["/playtests/", "playtests"],
        ["/feedback/", "feedback"],
        ["/help/", "help"],
        ["/about/", "about"]
    ];
    for (const [path, route] of routes) {
        await page.goto(path);
        await page.waitForLoadState("domcontentloaded");
        await expect(page.locator(`.site-header-nav a[data-site-route="${route}"]`)).toHaveAttribute(
            "aria-current",
            "page"
        );
        await expect(page.locator('.site-header-nav a[aria-current="page"]')).toHaveCount(1);
    }
});

test("statistics refresh only on demand and preserves the active route", async ({ page }) => {
    let statsRequests = 0;
    page.on("request", (request) => {
        if (request.url().includes("/rest/v1/cob_stats_exports")) statsRequests += 1;
    });

    await openApp(page, "#view=leaderboards&board=players&mode=deathmatch&sort=kills");
    await expect(page.locator("[data-stats-refresh-status]")).toContainText("last refreshed");
    const requestsAfterLoad = statsRequests;

    await page.waitForTimeout(10_500);
    expect(statsRequests).toBe(requestsAfterLoad);

    const routeBeforeRefresh = await page.evaluate(() => window.location.hash);
    await page.locator("[data-stats-refresh]").click();
    await expect(page.locator("[data-stats-refresh-status]")).toContainText("last refreshed");
    expect(statsRequests).toBe(requestsAfterLoad + 2);
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(routeBeforeRefresh);
    await expect(page.locator("#leaderboard-view")).toBeVisible();
});

test("the homepage initializes only the public resources it needs", async ({ page }) => {
    await installPageStubs(page, countingSupabaseStub);
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1, name: "Call of Block" })).toBeVisible();

    await expect.poll(() => page.evaluate(() => window.__supabaseTableRequests?.public_profiles || 0)).toBe(1);
    const counts = await page.evaluate(() => ({
        ...window.__supabaseTableRequests
    }));
    expect(counts.public_profiles).toBe(1);
    expect(counts.public_cosmetic_catalog).toBe(1);
    expect(counts.playtest_slots).toBe(1);
    expect(counts.playtests || 0).toBe(0);
    expect(counts.public_profile_cosmetic_inventory || 0).toBe(0);
    expect(counts.badge_catalog_overrides || 0).toBe(0);
});

test("the homepage reuses its public statistics cache after a reload", async ({ page }) => {
    await installPageStubs(page, supabaseStub);
    await page.goto("/");
    await expect(page.locator("#featured-battle-royale .featured-player").first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__cobPublicDataDiagnostics?.requests?.length || 0)).toBe(2);

    await page.reload();
    await expect(page.locator("#featured-battle-royale .featured-player").first()).toBeVisible();
    expect(await page.evaluate(() => window.__cobPublicDataDiagnostics?.requests?.length || 0)).toBe(0);
});

test("the homepage keeps five champion slots for every game mode", async ({ page }) => {
    await installPageStubs(page, supabaseStub);
    await page.goto("/");
    await expect(page.locator("#featured-battle-royale .featured-player").first()).toBeVisible();
    await expect(page.locator("[data-champion-panel]")).toHaveCount(5);
    for (const mode of ["battleRoyale", "zombieSurvival", "teamDeathmatch", "freeForAll", "duel"]) {
        const panel = page.locator(`[data-champion-panel="${mode}"]`);
        await expect(panel.locator(".featured-header h3")).not.toBeEmpty();
        await expect(panel.locator(".podium-list .featured-player")).toHaveCount(5);
    }
    await expect(page.locator("#featured-zombie-survival-empty")).toContainText("No games played yet");
});

test("the signed-in homepage account pill opens the profile drawer and reveals admin Store access", async ({
    page
}) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await openAdminApp(page, "");
    const accountButton = page.locator("[data-shell-account-open]");
    await expect(accountButton).toBeVisible();
    await expect(accountButton).toContainText("Test Admin");
    await expect(page.locator(".store-float")).toBeVisible();
    await expect(page.locator(".store-float")).toHaveAttribute("href", "/admin/catalog/");
    await expect(page.locator("[data-notification-panel-open]")).toBeVisible();
    const headerLayout = await page.evaluate(() => {
        const navigation = document.querySelector(".site-header-nav")?.getBoundingClientRect();
        const actions = document.querySelector(".site-header-actions")?.getBoundingClientRect();
        return {
            navigationRight: navigation?.right || 0,
            actionsLeft: actions?.left || 0,
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: document.documentElement.clientWidth
        };
    });
    expect(headerLayout.navigationRight).toBeLessThanOrEqual(headerLayout.actionsLeft + 1);
    expect(headerLayout.documentWidth).toBeLessThanOrEqual(headerLayout.viewportWidth + 1);

    await accountButton.click();
    const drawer = page.locator("#account-side-panel-host .profile-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("heading", { name: "PROFILE" })).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Customize profile" })).toHaveAttribute("href", "/account/");
    await expect(drawer.getByRole("link", { name: "Catalog administration" })).toHaveAttribute(
        "href",
        "/admin/catalog/"
    );
    await expect(drawer.getByText("Renewable Missions")).toBeVisible();
    await expect(drawer.getByText("On the Board")).toBeVisible();

    await drawer.getByRole("button", { name: "Close profile panel" }).click();
    await expect(drawer).toBeHidden();
});

test("authenticated public pages share the complete account drawer", async ({ page }) => {
    await installPageStubs(page, adminSupabaseStub);
    await page.route("https://mc-heads.net/**", (route) =>
        route.fulfill({ contentType: "image/png", body: transparentPng })
    );

    for (const path of ["/playtests/", "/feedback/", "/help/", "/about/"]) {
        await page.goto(path);
        const accountButton = page.locator("[data-shell-account-open]");
        await expect(accountButton).toBeVisible();
        await expect(accountButton.locator("img")).toHaveAttribute("src", /avatar\/AdminMC\/96/);

        await accountButton.click();
        await expect(page.locator(".profile-drawer")).toContainText("Test Admin");
        await expect(page.locator(".profile-drawer-store")).toBeVisible();
        await expect(page.locator(".weekly-missions-panel")).toContainText("On the Board");
        await page.locator("[data-shell-account-close]").click();

        await page.locator("[data-notification-panel-open]").click();
        await expect(page.locator(".notification-drawer")).toBeVisible();
        await page.locator("[data-home-notification-close]").click();
    }
});

test("homepage profile and notification drawers have one deterministic owner", async ({ page }) => {
    await openAdminApp(page, "");
    const result = await page.evaluate(async () => {
        const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
        const failures = [];
        const heading = () => document.querySelector("#account-side-panel-host h2")?.textContent || "";
        for (let index = 0; index < 20; index += 1) {
            document.querySelector("[data-shell-account-open]")?.click();
            await frame();
            if (heading() !== "PROFILE") failures.push(`profile-open-${index}`);
            document.querySelector("[data-shell-account-close]")?.click();
            await frame();
            if (heading()) failures.push(`profile-close-${index}`);
        }
        for (let index = 0; index < 20; index += 1) {
            document.querySelector("[data-notification-panel-open]")?.click();
            await frame();
            if (heading() !== "NOTIFICATIONS") failures.push(`notification-open-${index}`);
            document.querySelector("[data-home-notification-close]")?.click();
            await frame();
            if (heading()) failures.push(`notification-close-${index}`);
        }
        for (let index = 0; index < 20; index += 1) {
            document.querySelector("[data-shell-account-open]")?.click();
            document.querySelector("[data-notification-panel-open]")?.click();
            await frame();
            if (heading() !== "NOTIFICATIONS") failures.push(`profile-to-notifications-${index}`);
            document.querySelector("[data-shell-account-open]")?.click();
            await frame();
            if (heading() !== "PROFILE") failures.push(`notifications-to-profile-${index}`);
            document.querySelector("[data-shell-account-close]")?.click();
            await frame();
        }
        return {
            failures,
            drawerCount: document.querySelectorAll("#account-side-panel-host .profile-drawer").length,
            bodyOpen: document.body.classList.contains("account-drawer-open")
        };
    });
    expect(result).toEqual({ failures: [], drawerCount: 0, bodyOpen: false });
});

test("statistics payloads follow the active route instead of loading the full export", async ({ page }) => {
    const requestedRows = [];
    page.on("request", (request) => {
        if (request.url().includes("/rest/v1/cob_stats_exports")) {
            requestedRows.push(new URL(request.url()).searchParams.get("id"));
        }
    });

    await installPageStubs(page, countingSupabaseStub);
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await expect.poll(() => requestedRows.includes("eq.home")).toBe(true);
    await expect.poll(() => requestedRows.includes("eq.status")).toBe(true);
    expect(requestedRows).not.toContain("eq.live");

    await openStatsFromHome(page);
    await expect.poll(() => requestedRows.includes("eq.mode:battleRoyale")).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__supabaseTableRequests?.public_profiles || 0)).toBe(1);
    const inventoryRequestCount = await page.evaluate(
        () => window.__supabaseTableRequests?.public_profile_cosmetic_inventory || 0
    );
    expect(inventoryRequestCount).toBeLessThanOrEqual(1);

    await page.getByRole("button", { name: "Weapons stat view" }).click();
    await expect.poll(() => requestedRows.includes("eq.weapons:battleRoyale")).toBe(true);

    await page.getByRole("button", { name: "Players stat view" }).click();
    await page.locator("#leaderboard-body .profile-link").first().click();
    await expect.poll(() => requestedRows.some((row) => row?.startsWith("eq.profile:"))).toBe(true);
});

test("private account statistics load the linked player slice", async ({ page }) => {
    const requestedRows = [];
    const fullPayload = structuredClone(statsExportFixture);
    const homePayload = structuredClone(statsExportFixture);
    const linkedHomeProfile = homePayload.profiles.find((profile) => profile.playerId === "sample-rtxluke");
    linkedHomeProfile.battleRoyale.stats.wins = 0;
    linkedHomeProfile.battleRoyale.stats.kills = 0;

    await installPageStubs(page, accountStatsSupabaseStub, (requestedRow) => {
        requestedRows.push(requestedRow);
        return requestedRow === "eq.profile:sample-rtxluke" ? fullPayload : homePayload;
    });
    await page.goto("/stats/#account");

    const wins = page.locator(".account-stat-grid .detail-stat", {
        hasText: "BR Wins"
    });
    const kills = page.locator(".account-stat-grid .detail-stat", {
        hasText: "BR Kills"
    });
    await expect(wins.locator("strong")).toHaveText("5");
    await expect(kills.locator("strong")).toHaveText("33");
    expect(requestedRows).toContain("eq.profile:sample-rtxluke");
});

for (const route of ["/", "/stats/", "/playtests/", "/feedback/", "/help/", "/about/"]) {
    test(`weekly mission progress is consistent on ${route}`, async ({ page }, testInfo) => {
        const missions = [
            {
                id: "br-progress",
                label: "BR progress",
                mode: "battleRoyale",
                metric: "kills",
                baseline: 10,
                target: 100
            },
            {
                id: "weapon-progress",
                label: "Weapon progress",
                mode: "deathmatch",
                metric: "kills",
                weaponId: "scar_l",
                baseline: 1,
                target: 10
            },
            {
                id: "map-progress",
                label: "Map progress",
                mode: "deathmatch",
                mapId: "raid",
                baseline: 0,
                target: 10,
                requirements: { type: "map_stat", metric: "wins" }
            }
        ].map((mission) => ({
            difficulty: "easy",
            xp: 100,
            description: "Test mission",
            requirements: { type: "stat" },
            ...mission
        }));
        const stub = accountStatsSupabaseStub.replace(
            "const badgeOverrides = [];",
            `missionRow.missions = ${JSON.stringify(missions)}; const badgeOverrides = [];`
        );
        await installPageStubs(page, stub, (row) => {
            const payload = structuredClone(statsExportFixture);
            const profile = payload.profiles.find((entry) => entry.playerId === "sample-rtxluke");
            profile.battleRoyale.stats.kills = row?.startsWith("eq.profile:") ? 33 : 0;
            for (const [mode, kills, wins] of [
                ["teamDeathmatch", 4, 2],
                ["freeForAll", 2, 1]
            ]) {
                profile[mode] = {
                    stats: { kills: 99 },
                    details: {
                        weapons: row?.endsWith(":weapons") ? [{ id: "scar_l", stats: { kills } }] : [],
                        maps: row?.endsWith(":maps") ? [{ id: "raid", stats: { wins } }] : []
                    }
                };
            }
            return payload;
        });
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(route);
        await page.locator(route === "/stats/" ? "[data-account-panel-open]" : "[data-shell-account-open]").click();
        const br = page.locator(".weekly-mission-row", { hasText: "BR progress" });
        const weapon = page.locator(".weekly-mission-row", {
            hasText: "Weapon progress"
        });
        const map = page.locator(".weekly-mission-row", {
            hasText: "Map progress"
        });
        await expect(br).toContainText("23 / 100");
        await expect(br.locator(".mission-progress i")).toHaveAttribute("style", /width: 23%/);
        await expect(weapon).toContainText("5 / 10");
        await expect(map).toContainText("3 / 10");
        expect(errors).toEqual([]);
        if (route === "/stats/" || route === "/help/") {
            await br.scrollIntoViewIfNeeded();
            await page.screenshot({
                path: testInfo.outputPath("mission-progress.png")
            });
        }
        if (route === "/help/") {
            await page.evaluate(() => {
                window.dispatchEvent(
                    new CustomEvent("cob:stats-slice-updated", {
                        detail: {
                            id: "profile:sample-rtxluke",
                            payload: {
                                profiles: [
                                    {
                                        playerId: "sample-rtxluke",
                                        battleRoyale: { stats: { kills: 43 } },
                                        teamDeathmatch: { stats: {} },
                                        freeForAll: { stats: {} }
                                    }
                                ]
                            }
                        }
                    })
                );
            });
            // Partial exports cannot replace the authenticated, complete mission snapshot.
            await expect(br).toContainText("23 / 100");
            await page.evaluate(() => {
                window.__missionBonus = 10;
                window.dispatchEvent(new Event("focus"));
            });
            await expect(br).toContainText("33 / 100");
            await expect(weapon).toContainText("5 / 10");
        }
    });
}

test("missing mission statistics stay unknown and retry on reopening", async ({ page }) => {
    await installPageStubs(page, accountStatsSupabaseStub);
    let available = false;
    await page.route("https://test.supabase.co/rest/v1/cob_stats_exports**", (route) =>
        route.fulfill({
            contentType: "application/json",
            body: JSON.stringify(available ? [{ payload: statsExportFixture }] : [])
        })
    );
    await page.goto("/help/");
    await page.locator("[data-shell-account-open]").click();
    const mission = page.locator(".weekly-mission-row", {
        hasText: "On the Board"
    });
    await expect(mission).toContainText("Progress unavailable");
    await expect(mission.locator(".mission-progress")).toHaveCount(0);
    await expect(mission.locator("[data-home-weekly-claim]")).toHaveCount(0);
    available = true;
    await page.locator("[data-shell-account-close]").click();
    await page.locator("[data-shell-account-open]").click();
    await expect(mission).toContainText("Complete");
    await expect(mission.locator(".mission-progress i")).toHaveAttribute("style", /100%/);
});

test("signing out discards an in-flight mission load", async ({ page }) => {
    await installPageStubs(page, accountStatsSupabaseStub);
    let release;
    const gate = new Promise((resolve) => {
        release = resolve;
    });
    let waiting = 0;
    await page.route("https://test.supabase.co/rest/v1/cob_stats_exports**", async (route) => {
        if (new URL(route.request().url()).searchParams.get("id")?.startsWith("eq.profile:")) {
            waiting++;
            await gate;
        }
        await route.fulfill({
            contentType: "application/json",
            body: JSON.stringify([{ payload: statsExportFixture }])
        });
    });
    await page.goto("/help/");
    await page.locator("[data-shell-account-open]").click();
    await expect.poll(() => waiting).toBe(3);
    await page.evaluate(async () => {
        const { initializeSiteShell } = await import("/src/core/site-shell.js");
        const shell = await initializeSiteShell({ loadStatus: false });
        shell.session = null;
        shell.setProfile(null);
        window.__missionShell = shell;
    });
    release();
    await expect(page.locator('[data-account-access="login"]')).toBeVisible();
    await expect
        .poll(() => page.evaluate(() => window.__missionShell.accountPanelAddon()))
        .not.toContain("On the Board");
    await expect(page.locator(".weekly-mission-row")).toHaveCount(0);
});

test("existing public hash routes still open", async ({ page }) => {
    await openApp(page, "#playtests");
    await expect(page.locator("#playtests-view")).toBeVisible();
    await page.goto("/#how-to-play");
    await expect(page.locator("#how-to-play")).toBeVisible();
    await expect(page.locator("#how-to-play")).toContainText("#minecraft-verification");
    await page.goto("/#faq");
    await expect(page.locator("#faq")).toBeVisible();
    await expect(page.locator("#faq")).toContainText("#minecraft-verification");
    await page.goto("/#view=leaderboards&mode=battleRoyale&board=players&sort=wins");
    await expect(page.locator("#leaderboard-view")).toBeVisible();
});

test("canonical public pages load directly with unique indexable metadata", async ({ page }) => {
    const pageErrors = [];
    const consoleErrors = [];
    const failedAssets = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("response", (response) => {
        const url = new URL(response.url());
        if (url.hostname === "127.0.0.1" && response.status() >= 400) {
            failedAssets.push(`${response.status()} ${url.pathname}`);
        }
    });
    await installPageStubs(page, supabaseStub);
    await page.unroute("https://mc-heads.net/**");
    await page.route("https://mc-heads.net/**", (route) =>
        route.fulfill({ contentType: "image/png", body: transparentPng })
    );
    const pages = [
        {
            path: "/",
            route: "home",
            title: "Call of Block | Competitive Minecraft PvP & Battle Royale",
            canonical: "https://callofblock.com/",
            heading: "Call of Block",
            view: "#home-view"
        },
        {
            path: "/stats/",
            route: "stats",
            title: "Call of Block Stats Tracker | Minecraft PvP Leaderboards",
            canonical: "https://callofblock.com/stats/",
            heading: "Call of Block Stats Tracker",
            intro: "Compare Battle Royale, Zombie Survival, TDM, FFA and Duels",
            view: "#leaderboard-view"
        },
        {
            path: "/playtests/",
            route: "playtests",
            title: "Call of Block Playtests | Join Minecraft PvP Testing",
            canonical: "https://callofblock.com/playtests/",
            heading: "Call of Block Playtests",
            intro: "Vote for dates and availability",
            view: "#playtests-view"
        },
        {
            path: "/feedback/",
            route: "feedback",
            title: "Call of Block Feedback & Support",
            canonical: "https://callofblock.com/feedback/",
            heading: "Call of Block Feedback & Support",
            intro: "Send bug reports, cheat reports, balance feedback",
            view: "#feedback-view"
        },
        {
            path: "/help/",
            route: "help",
            title: "Call of Block Help | Server, Accounts and Stats",
            canonical: "https://callofblock.com/help/",
            heading: "Call of Block Help",
            intro: "Find current player instructions",
            view: "#help"
        },
        {
            path: "/about/",
            route: "about",
            title: "About Call of Block | Competitive Minecraft PvP Project",
            canonical: "https://callofblock.com/about/",
            heading: "About Call of Block",
            intro: "independent Minecraft 1.20.1 Forge multiplayer project",
            view: "#about-project"
        }
    ];

    const descriptions = new Set();
    for (const entry of pages) {
        const response = await page.goto(entry.path);
        expect(response?.ok()).toBe(true);
        await page.waitForLoadState("domcontentloaded");
        await expect(page).toHaveTitle(entry.title);
        await expect(page.locator("link[rel='canonical']")).toHaveAttribute("href", entry.canonical);
        await expect(page.locator("meta[property='og:url']")).toHaveAttribute("content", entry.canonical);
        await expect(page.locator("body")).toHaveAttribute("data-public-route", entry.route);
        await expect(page.locator(entry.view)).toBeVisible();
        await expect(page.getByRole("heading", { level: 1, name: entry.heading })).toBeVisible();
        if (entry.intro) await expect(page.locator(".hero-text")).toContainText(entry.intro);
        await expect(page.locator("#public-page-title")).toHaveCount(0);
        const structuredData = JSON.parse(await page.locator("#page-structured-data").textContent());
        if (entry.route === "home") {
            const website = structuredData["@graph"].find((item) => item["@type"] === "WebSite");
            const organization = structuredData["@graph"].find((item) => item["@type"] === "Organization");
            expect(website).toMatchObject({
                name: "Call of Block",
                url: "https://callofblock.com/"
            });
            expect(website.alternateName).toEqual(expect.arrayContaining(["Call of Block 2", "CallOfBlock", "COB"]));
            expect(organization).toMatchObject({
                name: "Call of Block",
                url: "https://callofblock.com/"
            });
        } else {
            expect(structuredData["@graph"].some((item) => item["@type"] === "BreadcrumbList")).toBe(true);
        }
        const description = await page.locator("meta[name='description']").getAttribute("content");
        expect(description).toBeTruthy();
        descriptions.add(description);
        const horizontalOverflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        expect(horizontalOverflow).toBeLessThanOrEqual(1);
    }
    expect(descriptions.size).toBe(pages.length);

    await page.goto("/about/");
    await expect(page.locator("#about-project")).toContainText("official website");
    await expect(page.locator("#about-the-creator")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Official modpack on CurseForge" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Official modpack on Modrinth" })).toBeVisible();

    const primaryLinks = await page
        .locator("nav[aria-label='Primary navigation'] a")
        .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    expect(primaryLinks).toEqual(["/", "/stats/", "/playtests/", "/feedback/", "/help/", "/about/"]);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(failedAssets).toEqual([]);
});

test("public entry points share styling without loading unrelated tracker code", async ({ page }) => {
    await installPageStubs(page, supabaseStub);
    const routes = ["/", "/playtests/", "/feedback/", "/help/", "/about/"];

    for (const route of routes) {
        await page.goto(route);
        await page.waitForLoadState("domcontentloaded");
        await expect(page.locator("#public-page-title")).toHaveCount(0);
        const resources = await page.evaluate(() =>
            performance.getEntriesByType("resource").map((entry) => entry.name)
        );
        expect(resources.some((url) => /\/src\/app\.js(?:\?|$)/.test(url))).toBe(false);
        expect(resources.some((url) => /\/src\/config\/store-catalog\.js(?:\?|$)/.test(url))).toBe(false);
        const stylesheets = await page
            .locator("link[rel='stylesheet']")
            .evaluateAll((links) => links.map((link) => new URL(link.href).pathname));
        expect(stylesheets).toEqual(["/assets/css/styles.min.css"]);
    }

    await page.goto("/stats/");
    await expect(page.locator("#leaderboard-view")).toBeVisible();
    const statsResources = await page.evaluate(() =>
        performance.getEntriesByType("resource").map((entry) => entry.name)
    );
    expect(statsResources.some((url) => /\/src\/app\.js(?:\?|$)/.test(url))).toBe(true);
    expect(statsResources.some((url) => /\/src\/config\/store-catalog\.js(?:\?|$)/.test(url))).toBe(false);
});

test("robots and sitemap expose only canonical public pages", async ({ request }) => {
    const robots = await request.get("/robots.txt");
    expect(robots.ok()).toBe(true);
    await expect(robots.text()).resolves.toContain("Sitemap: https://callofblock.com/sitemap.xml");

    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.ok()).toBe(true);
    const xml = await sitemap.text();
    for (const path of ["", "stats/", "playtests/", "feedback/", "help/", "about/"]) {
        expect(xml).toContain(`<loc>https://callofblock.com/${path}</loc>`);
    }
    expect(xml).not.toMatch(/admin|login|supabase|replay/i);
});

test("stats page accepts crawlable query filters", async ({ page }) => {
    await openApp(page);
    await page.goto("/stats/?mode=deathmatch&view=weapons&sort=kills");
    await expect(page.locator("#leaderboard-view")).toBeVisible();
    await expect(page.locator("#main-view-tabs button.active")).toContainText("Weapons");
    await expect(page.locator("#mode-tabs button.active")).toContainText("Team Deathmatch");
});

test("Duel and Zombie Survival have separate public leaderboard routes", async ({ page }) => {
    await openApp(page, "#view=leaderboards&mode=zombieSurvival&board=players&sort=survivalDurationMs");

    await expect(page.locator("#leaderboard-view")).toBeVisible();
    await expect(page.locator("#leaderboard-title")).toHaveText("Longest Survival");
    await expect(page.getByRole("button", { name: "Zombie Survival mode, selected" })).toBeVisible();

    await page.getByRole("button", { name: "Duel mode" }).click();
    await expect(page.locator("#leaderboard-title")).toHaveText("Duel ranking");
    await expect(page.getByRole("button", { name: "Duel mode, selected" })).toBeVisible();
});

test("creator trust section and footer trust links are visible to public visitors", async ({ page }) => {
    await openApp(page);

    const creatorSection = page.locator("#about-the-creator");
    await expect(creatorSection).toBeVisible();
    await expect(
        creatorSection.getByRole("heading", {
            name: "Who is behind Call of Block?"
        })
    ).toBeVisible();
    await expect(creatorSection).toContainText("Lukas / TheWrongLuke");
    await expect(creatorSection.getByRole("link", { name: "Portfolio" })).toHaveAttribute("target", "_blank");
    await expect(creatorSection.getByRole("link", { name: "GitHub" })).toHaveAttribute("rel", /noopener/);

    const footer = page.locator(".site-footer");
    await expect(footer).toContainText("Explore");
    await expect(footer).toContainText("Community");
    await expect(footer).toContainText("About & Trust");
    await expect(footer.locator("[data-admin-store-link]")).toBeHidden();
    await expect(footer.getByRole("link", { name: "Website Safety" })).toBeVisible();

    for (const path of ["/stats/", "/playtests/", "/feedback/", "/help/", "/about/"]) {
        await page.goto(path);
        await expect(page.locator("#about-the-creator")).toHaveCount(0);
        await expect(page.getByRole("link", { name: "Who is behind Call of Block?" })).toHaveCount(0);
    }
});

test("website safety footer link opens the targeted FAQ entry", async ({ page }) => {
    await openApp(page);

    await page.locator('.site-footer a[href="/help/#view=faq&entry=faq-safety"]').click();
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe("#view=faq&entry=faq-safety");
    await expect(page.locator("#faq-safety")).toHaveJSProperty("open", true);
    await expect(page.locator("#faq-safety")).toContainText("Discord OAuth");
    await expect(page.locator("#faq-safety summary")).toBeFocused();

    await page.evaluate(() => {
        document.querySelector('.site-footer a[href="/help/#view=faq&entry=faq-safety"]')?.click();
    });
    await expect(page.locator("#faq-safety")).toHaveJSProperty("open", true);
    await expect(page.locator("#faq-safety summary")).toBeFocused();
});

test("a player profile can be opened from existing test data", async ({ page }) => {
    await openApp(page, "#view=leaderboards&mode=battleRoyale&board=players&sort=wins");
    const firstProfileLink = page.locator("#leaderboard-body .profile-link").first();
    await expect(firstProfileLink).toBeVisible();
    await firstProfileLink.click();
    await expect(page.locator("#player-view")).toBeVisible();
    await expect(page.locator('[data-player-tab="overview"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#player-view")).toContainText("Collateral Hits");
    await expect(page.locator("#player-view")).toContainText("Collateral Kills");
    await expect(page.locator("#player-view")).toContainText("Collateral Headshot Kills");
});

test("history map thumbnails resolve against the page rather than the stylesheet directory", async ({ page }) => {
    const payload = structuredClone(statsExportFixture);
    const profile = payload.profiles.find((entry) => entry.battleRoyale);
    profile.teamDeathmatch = {
        stats: { games: 1, wins: 1, kills: 8 },
        details: { maps: [{ id: "shmar", label: "Shmar", stats: { games: 1, wins: 1 } }] }
    };
    await installPageStubs(page, supabaseStub, payload);
    await page.goto(`/stats/#player=${encodeURIComponent(profile.playerId)}&tab=history&profileMode=teamDeathmatch`);
    const thumbnail = page.locator(".profile-map-summary").first();
    await expect(thumbnail).toContainText("Shmar");
    const url = await thumbnail.evaluate((element) => {
        const value = element.style.getPropertyValue("--summary-map-image");
        return value.slice(5, -2);
    });
    expect(new URL(url).pathname).toBe("/assets/maps/shmar.png");
    const response = await page.request.get(url);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
});

test("profile percentile context is real, rank-first for small populations, and keyboard accessible", async ({
    page
}) => {
    const payload = structuredClone(statsExportFixture);
    const profile = payload.profiles.find((entry) => entry.battleRoyale);
    profile.battleRoyale.percentiles = {
        wins: {
            mode: "battleRoyale",
            metric: "wins",
            value: profile.battleRoyale.stats.wins,
            rank: 1,
            qualifiedPlayers: 4,
            topPercent: 25,
            minimumGames: 3
        }
    };
    await installPageStubs(page, supabaseStub, payload);
    await page.goto(`/stats/#player=${encodeURIComponent(profile.playerId)}&tab=overview`);
    const percentile = page.locator(".percentile-context").first();
    await expect(percentile).toHaveText("#1 of 4");
    await expect(percentile).toHaveAttribute("aria-label", /Top 25% of 4 qualified Battle Royale players\. Rank #1\./);
    await percentile.focus();
    await expect(percentile).toBeFocused();
    await expect(page.locator(".percentile-context", { hasText: "Top 0.0%" })).toHaveCount(0);
});

test("mobile percentile help uses viewport width instead of the narrow rank badge", async ({ page }) => {
    const payload = structuredClone(statsExportFixture);
    const profile = payload.profiles.find((entry) => entry.battleRoyale);
    profile.battleRoyale.percentiles = {
        wins: {
            mode: "battleRoyale",
            metric: "wins",
            value: profile.battleRoyale.stats.wins,
            rank: 2,
            qualifiedPlayers: 4,
            topPercent: 50,
            minimumGames: 3
        }
    };
    await page.setViewportSize({ width: 390, height: 844 });
    await installPageStubs(page, supabaseStub, payload);
    await page.goto(`/stats/#player=${encodeURIComponent(profile.playerId)}&tab=overview`);
    const percentile = page.locator(".percentile-context").first();
    await percentile.focus();
    const styles = await percentile.evaluate((element) => ({
        badgeTransform: getComputedStyle(element).transform,
        tooltipPosition: getComputedStyle(element, "::after").position,
        tooltipWidth: Number.parseFloat(getComputedStyle(element, "::after").width),
        wordBreak: getComputedStyle(element, "::after").wordBreak
    }));
    expect(styles.badgeTransform).toBe("none");
    expect(styles.tooltipPosition).toBe("fixed");
    expect(styles.tooltipWidth).toBeGreaterThanOrEqual(280);
    expect(styles.wordBreak).toBe("normal");
});

test("player overview loads its history slice on the first visit", async ({ page }) => {
    const historyPayload = structuredClone(statsExportFixture);
    const profile = historyPayload.profiles.find((entry) => entry.battleRoyale);
    profile.recentMatches = [
        {
            matchId: "initial-overview-history",
            mode: "battleRoyale",
            modeLabel: "Battle Royale",
            endedAt: "2026-08-31T12:00:00Z",
            won: true,
            kills: 4,
            deaths: 1,
            mapId: "initial-history-map",
            mapLabel: "Initial History Map"
        }
    ];
    const corePayload = structuredClone(historyPayload);
    corePayload.profiles.find((entry) => entry.playerId === profile.playerId).recentMatches = [];
    const requestedRows = [];
    const expectedHistoryRow = `eq.profile:${profile.playerId}:history`;

    await installPageStubs(page, supabaseStub, (requestedRow) => {
        requestedRows.push(requestedRow);
        return requestedRow === expectedHistoryRow ? historyPayload : corePayload;
    });
    await page.goto(`/stats/#player=${encodeURIComponent(profile.playerId)}&tab=overview`);

    await expect(page.locator(".profile-overview-history .history-card")).toHaveCount(1);
    await expect(page.locator(".profile-overview-history")).toContainText("4 / 1");
    expect(requestedRows).toContain(expectedHistoryRow);
    expect(requestedRows).not.toContain(`eq.profile:${profile.playerId}`);
});

test("player profile sections filter TDM and FFA independently and paginate weapons", async ({ page }) => {
    const payload = structuredClone(statsExportFixture);
    const profile = payload.profiles.find((entry) => entry.battleRoyale);
    const weapon = (index) => ({
        id: `tacz:tdm_weapon_${index}`,
        label: `TDM Weapon ${index}`,
        stats: { games: 2, kills: 30 - index, deaths: 1, hits: 50, headshots: 10 }
    });
    profile.teamDeathmatch = {
        stats: { games: 2, wins: 1, kills: 24, deaths: 8, hits: 70, headshots: 20 },
        details: {
            weapons: Array.from({ length: 14 }, (_, index) => weapon(index + 1)),
            maps: [
                {
                    id: "hijacked",
                    label: "Hijacked",
                    stats: { games: 2, wins: 1, kills: 24 }
                },
                { id: "raid", label: "Raid", stats: { games: 3, wins: 2, kills: 18 } },
                {
                    id: "duel_a",
                    label: "Arena A",
                    stats: { games: 4, wins: 1, kills: 12 }
                },
                {
                    id: "duel_b",
                    label: "Arena B",
                    stats: { games: 1, wins: 1, kills: 8 }
                }
            ]
        }
    };
    profile.freeForAll = {
        stats: { games: 1, wins: 1, kills: 8, deaths: 2, hits: 20, headshots: 4 },
        details: {
            weapons: [
                {
                    id: "tacz:ffa_weapon",
                    label: "FFA Weapon",
                    stats: { games: 1, kills: 8, hits: 20 }
                }
            ],
            maps: [{ id: "raid", label: "Raid", stats: { games: 1, wins: 1, kills: 8 } }]
        }
    };
    profile.recentMatches = [
        {
            matchId: "tdm-history",
            mode: "deathmatch",
            modeVariant: "teamDeathmatch",
            modeLabel: "Team Deathmatch",
            endedAt: "2026-08-30T12:00:00Z",
            won: true,
            kills: 12,
            deaths: 4,
            mapId: "hijacked",
            mapLabel: "Hijacked"
        },
        {
            matchId: "ffa-history",
            mode: "deathmatch",
            modeVariant: "freeForAll",
            modeLabel: "Free For All",
            endedAt: "2026-08-29T12:00:00Z",
            won: false,
            kills: 8,
            deaths: 2,
            mapId: "raid",
            mapLabel: "Raid"
        },
        {
            matchId: "legacy-history",
            mode: "deathmatch",
            modeLabel: "Deathmatch",
            endedAt: "2026-08-28T12:00:00Z",
            won: true,
            kills: 99,
            deaths: 0,
            mapLabel: "Legacy Map"
        }
    ];
    await installPageStubs(page, supabaseStub, payload);
    await page.goto(`/stats/#player=${encodeURIComponent(profile.playerId)}&tab=overview`);

    await expect(page.locator(".player-tabs [data-player-tab]")).toHaveCount(4);
    await expect(page.locator(".player-profile-overview-summary")).toBeVisible();
    await expect(page.locator(".player-profile-overview-summary")).not.toContainText("Top Weapons");
    await expect(page.locator(".player-profile-overview-summary .activity-calendar.compact")).toBeVisible();
    const overviewCalendarBox = await page
        .locator(".player-profile-overview-summary .activity-calendar.compact")
        .boundingBox();
    expect(overviewCalendarBox).not.toBeNull();
    expect(Math.abs(overviewCalendarBox.width - overviewCalendarBox.height)).toBeLessThanOrEqual(2);
    const primaryTabs = page.locator(".player-tabs");
    await expect(primaryTabs).toHaveCSS("display", "grid");
    await expect(primaryTabs).toHaveCSS("grid-template-columns", /.+ .+ .+ .+/);
    await page.evaluate(() => window.scrollTo(0, 240));
    const scrollBeforeModeChange = await page.evaluate(() => window.scrollY);
    await page.locator('[data-profile-mode="teamDeathmatch"]').evaluate((button) => button.click());
    await expect(page.locator(".profile-overview-history")).toContainText("Team Deathmatch");
    await expect(page.locator(".profile-overview-history")).not.toContainText("Free For All");
    await expect(page.locator(".profile-overview-history")).not.toContainText("Legacy Map");
    await expect
        .poll(() => page.evaluate(() => window.scrollY))
        .toBeGreaterThanOrEqual(Math.max(0, scrollBeforeModeChange - 2));

    await page.locator('[data-player-tab="weapons"]').click();
    await page.locator('[data-profile-mode="teamDeathmatch"]').click();
    await expect(page.locator(".weapon-row:not(.heading)")).toHaveCount(12);
    await expect(page.locator(".profile-weapon-pagination")).toContainText("Page 1 of 2");
    await page.locator('[data-profile-mode="freeForAll"]').click();
    await expect(page.locator(".weapon-row:not(.heading)")).toHaveCount(1);
    await expect(page.locator("#player-view")).toContainText("FFA Weapon");
    await expect(page.locator("#player-view")).not.toContainText("TDM Weapon 1");

    await page.locator('[data-player-tab="history"]').click();
    await expect(page.locator(".profile-history-sidebar > .activity-calendar")).toContainText("Last 60 days");
    await page.locator('[data-profile-mode="teamDeathmatch"]').click();
    await expect(page.locator(".profile-history-main")).toContainText("Team Deathmatch");
    await expect(page.locator(".profile-history-main")).not.toContainText("Free For All");
    await expect(page.locator(".profile-history-sidebar")).toContainText("Top Weapons");
    await expect(page.locator(".profile-history-sidebar .weapons li")).toHaveCount(3);
    await expect(page.locator(".profile-history-sidebar .weapons .profile-summary-metric").first()).toContainText(
        "Kills"
    );
    await expect(page.locator(".profile-history-sidebar .maps li")).toHaveCount(4);
    await expect(page.locator(".profile-history-sidebar .maps .profile-summary-metric")).toHaveCount(4);
    await expect(page.locator(".profile-history-sidebar .maps .profile-summary-metric").first()).toContainText("Win%");
    const historyCalendarFit = await page
        .locator(".profile-history-sidebar .activity-calendar-scroll")
        .evaluate((element) => ({
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth
        }));
    expect(historyCalendarFit.scrollWidth).toBeLessThanOrEqual(historyCalendarFit.clientWidth + 1);
    const weaponButton = page.locator(".profile-history-sidebar .profile-summary-action");
    await expect(weaponButton).toBeVisible();
    const weaponButtonStyle = await weaponButton.evaluate((element) => ({
        borderStyle: getComputedStyle(element).borderStyle,
        backgroundColor: getComputedStyle(element).backgroundColor
    }));
    expect(weaponButtonStyle.borderStyle).toBe("solid");
    expect(weaponButtonStyle.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-player-tab="overview"]').click();
    const mobileLayout = await page.evaluate(() => {
        const calendar = document.querySelector(".player-profile-overview-summary .activity-calendar.compact");
        const tabs = document.querySelector(".player-tabs");
        const calendarBounds = calendar?.getBoundingClientRect();
        return {
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth,
            calendarWidth: calendarBounds?.width || 0,
            calendarHeight: calendarBounds?.height || 0,
            tabWidth: tabs?.getBoundingClientRect().width || 0
        };
    });
    expect(mobileLayout.documentWidth).toBeLessThanOrEqual(mobileLayout.viewportWidth + 1);
    expect(Math.abs(mobileLayout.calendarWidth - mobileLayout.calendarHeight)).toBeLessThanOrEqual(2);
    expect(mobileLayout.tabWidth).toBeLessThanOrEqual(mobileLayout.viewportWidth);
});

test("legacy duplicate profile IDs resolve to the canonical merged profile", async ({ page }) => {
    const legacyId = "p_1978b4b211a8";
    const canonicalId = "sample-rtxluke";
    const payload = structuredClone(statsExportFixture);
    payload.playerAliases = { [legacyId]: canonicalId };
    await installPageStubs(page, supabaseStub, payload);

    await page.goto(`/stats/#player=${legacyId}&tab=overview`);
    await expect(page.locator("#player-view")).toBeVisible();
    await expect(page.locator("#player-view")).toContainText("RTXLuke");
    await expect
        .poll(() => page.evaluate(() => window.location.hash))
        .toBe(`#player=${canonicalId}&tab=overview&profileMode=battleRoyale`);
});

test("feedback asks logged-out visitors to sign in", async ({ page }) => {
    await openApp(page, "#feedback");
    await expect(page.locator("#feedback-view")).toBeVisible();
    await expect(page.getByRole("button", { name: "Login with Discord" })).toBeVisible();
});

test("signed-in feedback restores ticket fields and evidence after reload and reopening", async ({ page, context }) => {
    await openAuthenticatedApp(page, "#feedback");
    const form = page.locator("[data-feedback-create]");
    await expect(form).toBeVisible();
    await expect(form.locator("select[name='category'] option[value='cheat_report']")).toHaveText("Cheat Report");
    await form.locator("select[name='category']").selectOption("cheat_report");
    await form.locator("input[name='title']").fill("Suspicious movement during a match");
    await form
        .locator("textarea[name='description']")
        .fill("The player moved repeatedly through solid walls during the final part of the match.");
    await form.locator(".ticket-optional-fields").evaluate((details) => {
        details.open = true;
    });
    const attachment = form.locator("input[name='attachment']");
    await expect(attachment).toBeVisible();
    await expect(attachment).toHaveAttribute("accept", /image\/png/);
    await expect(attachment).toHaveAttribute("accept", /video\/mp4/);
    await attachment.setInputFiles({
        name: "evidence.png",
        mimeType: "image/png",
        buffer: Buffer.from("draft-evidence")
    });
    await expect(form.locator("[data-feedback-draft-status]")).toHaveText("Draft saved on this device.");

    await page.reload();
    await expect(form).toBeVisible();
    await expect(form.locator("select[name='category']")).toHaveValue("cheat_report");
    await expect(form.locator("input[name='title']")).toHaveValue("Suspicious movement during a match");
    await expect(form.locator("textarea[name='description']")).toHaveValue(
        /The player moved repeatedly through solid walls/
    );
    await expect(form.locator("[data-feedback-draft-status]")).toHaveText("Draft restored from this device.");
    await expect(form.locator("[data-feedback-draft-discard]")).toBeVisible();
    await expect.poll(() => attachment.evaluate((input) => input.files?.[0]?.name || "")).toBe("evidence.png");

    await page.close();
    const reopenedPage = await context.newPage();
    await openAuthenticatedApp(reopenedPage, "#feedback");
    const reopenedForm = reopenedPage.locator("[data-feedback-create]");
    await expect(reopenedForm.locator("input[name='title']")).toHaveValue("Suspicious movement during a match");
    await expect
        .poll(() => reopenedForm.locator("input[name='attachment']").evaluate((input) => input.files?.[0]?.name || ""))
        .toBe("evidence.png");
});

test("admin routes reject a logged-out visitor", async ({ page }) => {
    const routes = [
        ["#admin-tickets", /\/admin\/tickets\/$/],
        ["#admin-progression", /\/admin\/progression\/$/],
        ["#store", /\/admin\/catalog\/$/],
        ["#community-dates", /\/admin\/community\/$/],
        ["#community-admin", /\/admin\/community\/$/],
        ["#admin-matches", /\/admin\/matches\/$/]
    ];

    await openApp(page, routes[0][0]);
    for (const [route, destination] of routes) {
        await page.goto(`/${route}`);
        await expect(page).toHaveURL(destination);
        await expect(page.locator("main:visible")).toContainText(/Administrator|administrator|Admin access required/);
        await expect(
            page.locator("[data-match-confirm], [data-store-catalog-edit], [data-admin-ticket-save]")
        ).toHaveCount(0);
        await expect(page.locator("#leaderboard-view")).toHaveCount(0);
    }
    await expect(page.getByRole("button", { name: "Admin documentation" })).toHaveCount(0);
});

test("admin routes reject a signed-in non-admin on direct navigation and refresh", async ({ page }) => {
    await openMemberApp(page, "#admin-progression");
    await expect(page).not.toHaveURL(/#admin-progression$/);
    await expect(page).toHaveURL(/\/admin\/progression\/$/);
    await expect(page.locator("#admin-progression-view")).toContainText(/Administrator|administrator/);

    await page.evaluate(() => window.history.replaceState(null, document.title, "#admin-help"));
    await page.reload();
    await expect(page).not.toHaveURL(/#admin-help$/);
    await expect(page).toHaveURL(/\/admin\/docs\/$/);
    await expect(page.locator("#admin-documentation-body")).toContainText("Administrator access required.");
    await expect(page.getByRole("button", { name: "Admin documentation" })).toHaveCount(0);
});

test("protected admin content waits for profile verification", async ({ page }) => {
    await openDelayedAdminApp(page);
    await expect(page).toHaveURL(/\/admin\/docs\/$/);
    await expect(page.locator("#admin-documentation-body")).not.toContainText("/cob destruction");
    await expect(page.locator("#leaderboard-view")).toHaveCount(0);
    expect(await page.evaluate(() => window.__queriedSupabaseTables || [])).not.toContain(
        "admin_documentation_sections"
    );

    await expect(page.locator("#admin-help-view")).toBeVisible();
    await expect
        .poll(() => page.evaluate(() => window.__queriedSupabaseTables || []))
        .toContain("admin_documentation_sections");
    await expect(page.locator("#admin-documentation-body")).toContainText(
        "/cob destruction <status|on|off|toggle|reset>"
    );
    await expect(page.locator("#admin-documentation-body")).toContainText(
        "/cob match invalidate <matchId> --dry-run <reason>"
    );
    await expect(page.locator("#admin-documentation-body")).not.toContainText("/bradmin");
});

test("legacy Stats documentation URLs redirect without rendering the discarded page", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await installPageStubs(page, countingSupabaseStub);
    for (const hash of ["#admin-help", "#view=admin-help"]) {
        await page.goto(`/stats/${hash}`);
        await expect(page).toHaveURL(/\/admin\/docs\/$/);
        await expect(page.locator("#admin-documentation-body")).toContainText("Administrator access required.");
        expect(pageErrors).toEqual([]);
    }
    await page.goto("/stats/");
    await expect(page.locator("#leaderboard-view")).toBeVisible();
    await page.evaluate(() => {
        window.location.hash = "admin-help";
    });
    await expect(page).toHaveURL(/\/admin\/docs\/$/);
    await expect(page.locator("#admin-documentation-body")).toContainText("Administrator access required.");
    expect(pageErrors).toEqual([]);
});

test("admin documentation has its own non-indexed page and never fetches public statistics", async ({
    page,
    request
}, testInfo) => {
    const statsRequests = [];
    page.on("request", (request) => {
        if (request.url().includes("/cob_stats_exports")) statsRequests.push(request.url());
    });
    await openAdminApp(page, "admin/docs/");
    await expect(page.locator("#admin-documentation-body .admin-command-entry").first()).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://callofblock.com/admin/docs/");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
    await expect(page.locator("#leaderboard-view")).toHaveCount(0);
    expect(statsRequests).toEqual([]);
    expect(await (await request.get("/sitemap.xml")).text()).not.toContain("/admin/");
    await page.screenshot({ path: testInfo.outputPath("admin-docs.png") });
});

test("admin documentation rejects logged-out visitors without querying protected sections", async ({ page }) => {
    await installPageStubs(page, countingSupabaseStub);
    await page.goto("/admin/docs/");
    await expect(page.locator("#admin-documentation-body")).toContainText("Administrator access required.");
    expect(await page.evaluate(() => window.__supabaseTableRequests?.admin_documentation_sections || 0)).toBe(0);
    await expect(page.locator(".admin-command-entry")).toHaveCount(0);
});

test("complete admin command documentation stays readable without page overflow", async ({ page }, testInfo) => {
    await openAdminApp(page, "#admin-help");
    const body = page.locator("#admin-documentation-body");
    await expect(body.locator(".admin-command-entry").first()).toBeVisible();
    await expect(body).toContainText("Permission");
    await expect(body).toContainText("Persistence");

    for (const width of [320, 360, 390, 430, 768]) {
        await page.setViewportSize({ width, height: width === 768 ? 900 : 780 });
        const dimensions = await page.evaluate(() => ({
            viewport: window.innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            commandWidths: [...document.querySelectorAll(".admin-command-code code")].map((entry) => ({
                client: entry.clientWidth,
                scroll: entry.scrollWidth
            }))
        }));
        expect(dimensions.documentWidth, `document overflow at ${width}px`).toBeLessThanOrEqual(
            dimensions.viewport + 1
        );
        expect(
            dimensions.commandWidths.every((entry) => entry.scroll <= entry.client + 1),
            `command overflow at ${width}px`
        ).toBe(true);
        if (width === 320)
            await page.screenshot({
                path: testInfo.outputPath("admin-docs-320.png")
            });
    }
});

test("public command help uses only the canonical cob command root", async ({ page }) => {
    await openApp(page, "#help");
    const help = page.locator("#help");
    await expect(help).toContainText("/cob help");
    await expect(help).toContainText("/cob br queue join");
    await expect(help).toContainText("/cob dm queue ffa join");
    await expect(help).not.toContainText("/brmenu");
    await expect(help).not.toContainText("/joindm");
});

test("the cosmetic editor stays open until its X button is used", async ({ page }) => {
    await openAdminApp(page);
    const firstCosmetic = page.locator("[data-progression-cosmetic-open]").first();
    await expect(firstCosmetic).toBeVisible();
    await firstCosmetic.click();

    const dialog = page.locator(".progression-cosmetic-dialog");
    await expect(dialog).toBeVisible();
    await page.locator("[data-progression-editor-backdrop]").evaluate((backdrop) => {
        backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();

    await page.locator("[data-progression-cosmetic-close]").click();
    await expect(dialog).toBeHidden();
});

test("new cosmetic fields follow type, ownership, and store limits", async ({ page }) => {
    await openAdminApp(page);
    await page.locator("[data-progression-cosmetic-new]").click();

    const form = page.locator("[data-progression-cosmetic-form]");
    const type = form.locator("[data-progression-cosmetic-type]");
    const acquisition = form.locator("[data-progression-acquisition]");
    await expect(form.locator("[data-progression-asset-fields]")).toBeVisible();
    await expect(form.locator("[data-progression-title-fields]")).toBeHidden();
    await expect(form.locator("[data-progression-border-fields]")).toBeHidden();

    await type.selectOption("title");
    await expect(form.locator("[data-progression-asset-fields]")).toBeHidden();
    await expect(form.locator("[data-progression-title-fields]")).toBeVisible();
    await expect(form.locator("[data-progression-border-fields]")).toBeHidden();

    await type.selectOption("border");
    await expect(form.locator("[data-progression-asset-fields]")).toBeVisible();
    await expect(form.locator("[data-progression-title-fields]")).toBeHidden();
    await expect(form.locator("[data-progression-border-fields]")).toBeVisible();

    await expect(form.locator("[data-progression-mission-fields]")).toBeHidden();
    await expect(form.locator("[data-progression-store-fields]")).toBeHidden();
    await acquisition.selectOption("progression");
    await expect(form.locator("[data-progression-mission-fields]")).toBeVisible();
    for (const mode of ["battle_royale", "zombie_survival", "team_deathmatch", "free_for_all", "duels"]) {
        await form.locator('select[name="mode"]').selectOption(mode);
        await expect(form.locator('select[name="mode"]')).toHaveValue(mode);
    }
    await expect(form.locator("[data-progression-store-fields]")).toBeHidden();

    await acquisition.selectOption("store");
    await expect(form.locator("[data-progression-mission-fields]")).toBeHidden();
    await expect(form.locator("[data-progression-store-fields]")).toBeVisible();
    await expect(form.locator("[data-progression-time-fields]")).toBeHidden();
    await expect(form.locator("[data-progression-count-fields]")).toBeHidden();

    await form.locator("[data-progression-time-limit]").check();
    await expect(form.locator("[data-progression-time-fields]")).toBeVisible();
    await expect(form.locator("input[name='availableFrom']")).toHaveAttribute("required", "");
    await form.locator("[data-progression-count-limit]").check();
    await expect(form.locator("[data-progression-count-fields]")).toBeVisible();
    await expect(form.locator("input[name='supplyLimit']")).toHaveAttribute("required", "");

    await acquisition.selectOption("exclusive");
    await expect(form.locator("[data-progression-store-fields]")).toBeHidden();
    await expect(form.locator("input[name='availableFrom']")).not.toHaveAttribute("required", "");
    await expect(form.locator("input[name='supplyLimit']")).not.toHaveAttribute("required", "");
});

test("a private tester title submits without hidden store validation and retains a failed draft", async ({ page }) => {
    await openAdminApp(page);
    await page.locator("[data-progression-playtester-title]").click();
    const form = page.locator("[data-progression-cosmetic-form]");
    await form.locator('[name="cosmeticType"]').selectOption("title");
    await form.locator('[name="cosmeticId"]').fill("private_playtester");
    await form.locator('[name="name"]').fill("Private Playtester");
    await form.locator('[name="titleText"]').fill("Private Playtester");
    await expect(form.locator('[name="shopPrice"]')).toBeDisabled();
    await page.evaluate(() => {
        window.__failCosmeticSave = true;
    });
    await form.locator('button[type="submit"]').click();
    await expect(form.locator("[data-progression-editor-status]")).toContainText("Simulated save failure");
    await expect(form.locator('[name="cosmeticId"]')).toHaveValue("private_playtester");
    await expect(form.locator('[name="titleText"]')).toHaveValue("Private Playtester");
    await form.locator('button[type="submit"]').click();
    await expect(page.locator('[data-progression-cosmetic-open="title:private_playtester"]')).toHaveCount(1);
    const writes = await page.evaluate(() => window.__catalogWrites);
    expect(writes).toHaveLength(2);
    expect(writes[1]).toMatchObject({
        cosmetic_type: "title",
        cosmetic_id: "private_playtester",
        title_text: "Private Playtester",
        image_url: null,
        acquisition_type: "exclusive",
        shop_enabled: false
    });
    await expect(form.locator("[data-progression-title-fields]")).toBeVisible();
    await expect(form.locator("[data-progression-asset-fields]")).toBeHidden();
    await expect(form.locator('[name="titleText"]')).toHaveValue("Private Playtester");
});

test("playtest admin creates atomically and retries the same ID after a lost response", async ({ page }) => {
    await installPageStubs(page, playtestAdminSupabaseStub);
    await page.goto("/admin/community/");
    await page.locator('[data-playtest-admin="new"]').click();
    const form = page.locator("#playtest-create-form");
    await form.locator('[name="title"]').fill("Private BR test");
    await form.locator('[name="mainSlot"]').fill("2030-10-03T19:00");
    await form.locator('[name="notifyMembers"]').check();
    await form.locator('[name="alternativeSlots"]').fill("bad date");
    await form.locator('button[type="submit"]').click();
    await expect(page.locator("#playtest-admin [role='alert']")).toContainText("Date 2");
    expect(await page.evaluate(() => window.__playtestCreateCalls || [])).toHaveLength(0);
    await form.locator('[name="alternativeSlots"]').fill("2030-10-04T19:00");
    await page.evaluate(() => {
        window.__losePlaytestResponse = true;
    });
    await form.locator('button[type="submit"]').click();
    await expect(page.locator("#playtest-admin [role='alert']")).toContainText("lost response");
    await expect(form.locator('[name="title"]')).toHaveValue("Private BR test");
    await form.locator('button[type="submit"]').click();
    await expect(page.locator("#playtest-admin [role='status']")).toContainText("created");
    const result = await page.evaluate(() => ({
        calls: window.__playtestCreateCalls,
        events: window.__playtestEvents,
        slots: window.__playtestSlots
    }));
    expect(result.calls).toHaveLength(2);
    expect(result.calls[0].p_request_id).toBe(result.calls[1].p_request_id);
    expect(result.calls[0].p_notify_members).toBe(true);
    expect(result.calls[1].p_notify_members).toBe(true);
    expect(result.events.filter((row) => row.title === "Private BR test")).toHaveLength(1);
    expect(result.slots.filter((row) => row.playtest_id === result.calls[0].p_request_id)).toHaveLength(2);
});

test("playtest admin edits, freezes, finishes, archives and restores without losing responses", async ({
    page
}, testInfo) => {
    await installPageStubs(page, playtestAdminSupabaseStub);
    await page.goto("/admin/community/");
    await expect(page.locator(".admin-playtest-roster")).toContainText("Test Admin");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.locator('[data-playtest-admin="edit"]').click();
    await page.locator('#playtest-create-form [name="title"]').fill("Friends weekend test");
    await page.locator('#playtest-create-form button[type="submit"]').click();
    await expect(page.locator("#playtest-admin [role='status']")).toContainText("details saved");
    await page.locator('[data-playtest-admin="freeze"]').click();
    await expect(page.locator('[data-playtest-admin="unfreeze"]')).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator('[data-playtest-admin="finish"]').click();
    await expect(page.locator("#playtest-list")).toContainText("Finished");
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.locator('[data-playtest-admin="archive"]').click();
    expect(await page.evaluate(() => window.__playtestEvents[0].archived_at)).toBeNull();
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator('[data-playtest-admin="archive"]').click();
    await expect(page.locator("#playtest-list")).toContainText("No active playtests");
    await page.locator("[data-admin-playtest-archived]").check();
    await expect(page.locator("#playtest-list")).toContainText("Archived");
    await page.locator('[data-playtest-admin="restore"]').click();
    await expect(page.locator("#playtest-list")).toContainText("Finished");
    const downloadPromise = page.waitForEvent("download");
    await page.locator('[data-playtest-admin="export"]').click();
    expect((await downloadPromise).suggestedFilename()).toContain("availability.csv");
    expect(await page.evaluate(() => window.__playtestVotes)).toHaveLength(3);
    await page.locator("[data-admin-playtest-search]").fill("no match");
    await page.locator("[data-admin-playtest-search]").press("Tab");
    await expect(page.locator("#playtest-list")).toContainText("No playtests match");
    await page.locator("[data-admin-playtest-search]").fill("");
    await page.locator("[data-admin-playtest-search]").press("Tab");
    await page.screenshot({
        path: testInfo.outputPath("playtest-admin.png"),
        fullPage: true
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test("duplicate playtests remain drafts, status filters work, and reload retains unsaved edits", async ({ page }) => {
    await installPageStubs(page, playtestAdminSupabaseStub);
    await page.goto("/admin/community/");
    await page.locator('[data-playtest-admin="duplicate"]').click();
    const form = page.locator("#playtest-create-form");
    await expect(form.locator('[name="title"]')).toHaveValue("Friends arena test Copy");
    expect(await page.evaluate(() => window.__playtestEvents)).toHaveLength(1);
    await form.locator('[name="title"]').fill("Unsaved plan");
    await page.locator('[data-playtest-admin="reload"]').click();
    await expect(form.locator('[name="title"]')).toHaveValue("Unsaved plan");
    await page.locator('[data-playtest-admin="cancel"]').click();
    await page.locator("[data-admin-playtest-status]").selectOption("closed");
    await expect(page.locator("#playtest-list")).toContainText("No playtests match");
    await page.locator("[data-admin-playtest-status]").selectOption("voting");
    await expect(page.locator("#playtest-list")).toContainText("Friends arena test");
    await expect(page.locator(".admin-playtest-roster")).toContainText("Community Player");
    await expect(page.locator(".admin-playtest-roster")).toContainText("Busy Friend");
    expect(await page.evaluate(() => window.__playtestCreateCalls || [])).toHaveLength(0);
});

test("community availability works without an admin event and stays saved when paused", async ({ page }, testInfo) => {
    await installPageStubs(page, communityCalendarSupabaseStub);
    await page.goto("/playtests/");
    await expect(page.locator("#playtest-board h3")).toHaveText("Community calendar");
    for (const mode of ["Battle Royale", "Zombie Survival", "Team Deathmatch", "Free For All", "Duels"]) {
        await expect(page.getByRole("radio", { name: mode, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("radio", { name: "Deathmatch", exact: true })).toHaveCount(0);
    await page.getByRole("radio", { name: "Free For All", exact: true }).check();
    await expect(page.locator(".calendar-cell[data-calendar-date]")).not.toHaveCount(0);
    await page.locator(".calendar-cell[data-calendar-date]").last().click();
    await page.locator('.selected-date-card [data-playtest-calendar-vote="available"]').click();
    await expect(page.locator('.selected-date-card [data-playtest-vote="available"]')).toHaveAttribute(
        "aria-pressed",
        "true"
    );
    expect(await page.evaluate(() => window.__playtestEvents)).toHaveLength(1);
    expect(await page.evaluate(() => window.__playtestVotes)).toHaveLength(1);
    expect(await page.evaluate(() => window.__playtestVotes[0].mode_preference)).toBe("free_for_all");
    await page.locator("[data-playtest-reload]").click();
    await expect(page.locator('.selected-date-card [data-playtest-vote="available"]')).toHaveAttribute(
        "aria-pressed",
        "true"
    );
    await page.evaluate(() => {
        window.__playtestEvents[0].votes_frozen = true;
    });
    await page.locator("[data-playtest-reload]").click();
    await expect(page.locator(".playtest-lock-note")).toContainText("Community calendar is paused");
    await expect(page.locator('.selected-date-card [data-playtest-vote="available"]')).toBeDisabled();
    expect(await page.evaluate(() => window.__playtestVotes)).toHaveLength(1);
    await page.evaluate(() => {
        window.__playtestEvents[0].votes_frozen = false;
    });
    await page.locator("[data-playtest-reload]").click();
    await expect(page.locator('.selected-date-card [data-playtest-vote="available"]')).toBeEnabled();
    await page.screenshot({
        path: testInfo.outputPath("community-calendar.png"),
        fullPage: true
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test("Admin can pause and resume community planning independently of a featured event", async ({ page }, testInfo) => {
    await installPageStubs(page, communityCalendarSupabaseStub);
    await page.goto("/admin/community/");
    await expect(page.locator('[data-playtest-admin="community-pause"]')).toBeVisible();
    await expect(page.locator('[data-playtest-admin="archive"]')).toHaveCount(0);
    await page.evaluate(() => {
        window.__playtestVotes.push({
            id: "vote",
            playtest_id: window.__playtestEvents[0].id,
            user_id: "tester",
            status: "maybe"
        });
        window.__playtestEvents.push({
            id: "event",
            title: "Admin event",
            status: "voting",
            votes_frozen: false,
            archived_at: null
        });
    });
    await page.locator('[data-playtest-admin="reload"]').click();
    await page.locator('[data-playtest-select="event"]').click();
    await page.locator('[data-playtest-admin="community-pause"]').click();
    await expect(page.locator('[data-playtest-admin="community-resume"]')).toBeVisible();
    expect(await page.evaluate(() => window.__playtestEvents[0].votes_frozen)).toBe(true);
    expect(await page.evaluate(() => window.__playtestEvents[1].votes_frozen)).toBe(false);
    expect(await page.evaluate(() => window.__playtestVotes)).toHaveLength(1);
    await page.locator('[data-playtest-admin="community-resume"]').click();
    await expect(page.locator('[data-playtest-admin="community-pause"]')).toBeVisible();
    await page.locator('[data-playtest-admin="community-open"]').click();
    await expect(page.locator('[data-playtest-select][aria-pressed="true"]')).toContainText("Community calendar");
    await expect(page.locator('[data-playtest-admin="finish"]')).toHaveCount(0);
    await page.screenshot({
        path: testInfo.outputPath("community-calendar-admin.png"),
        fullPage: true
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test("an administrator can edit badge levels and animated icons in one persistent modal", async ({ page }) => {
    await openAdminApp(page);
    await page.locator('[data-progression-section="badges"]').click();
    const badgeCard = page.locator('[data-badge-editor-open="br_wins_counter"]');
    await expect(badgeCard).toBeVisible();
    await badgeCard.click();

    const dialog = page.locator(".badge-editor-dialog");
    const form = dialog.locator("[data-badge-editor-form]");
    await expect(dialog).toBeVisible();
    await expect(form.locator("[data-badge-tier]")).toHaveCount(5);
    await expect(form.locator("[data-badge-tier][open]")).toHaveCount(0);
    await expect(form.locator('input[name="tierTarget_0"]')).toBeHidden();
    await expect(form.locator('input[name="tierTarget_0"]')).toHaveValue("1");
    await expect(form.locator('input[name="tierAsset_0"]')).toHaveAttribute("accept", /image\/gif/);

    await page.locator("[data-badge-editor-backdrop]").evaluate((backdrop) => {
        backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();

    await form.locator('input[name="badgeLabel"]').fill("Battle Winner");
    await form.locator('[data-badge-tier="0"] > summary').click();
    await expect(form.locator('input[name="tierTarget_0"]')).toBeVisible();
    await form.locator('input[name="tierName_0"]').fill("First Crown");
    await form.locator('input[name="tierTarget_0"]').fill("2");
    await form.locator('[data-badge-tier="4"] > summary').click();
    await form.locator('input[name="tierIconUrl_4"]').fill("https://cdn.example.com/apex-winner.gif");

    await page.evaluate(() => window.dispatchEvent(new HashChangeEvent("hashchange")));
    await expect(dialog.locator('input[name="tierIconUrl_4"]')).toBeFocused();
    await expect(dialog.locator('input[name="badgeLabel"]')).toHaveValue("Battle Winner");
    await expect(dialog.locator('input[name="tierName_0"]')).toHaveValue("First Crown");
    await expect(dialog.locator('[data-badge-tier="0"]')).toHaveAttribute("open", "");
    await expect(dialog.locator('[data-badge-tier="4"]')).toHaveAttribute("open", "");

    await form.getByRole("button", { name: "Save badge and levels" }).click();

    await expect(dialog.locator("[data-badge-editor-status]")).toHaveText("Battle Winner and 5 levels were saved.");
    await expect(dialog.locator('input[name="badgeLabel"]')).toHaveValue("Battle Winner");
    await expect(dialog.locator('input[name="tierName_0"]')).toHaveValue("First Crown");
    await expect(dialog.locator('input[name="tierTarget_0"]')).toHaveValue("2");
    await expect(dialog.locator('input[name="tierIconUrl_4"]')).toHaveValue("https://cdn.example.com/apex-winner.gif");

    await page.locator("[data-badge-editor-close]").click();
    await expect(dialog).toBeHidden();
    await expect(badgeCard).toContainText("Battle Winner");
});

test("an administrator can open the weekly mission editor and only close it with X", async ({ page }) => {
    await openAdminApp(page);
    await page.locator('[data-progression-section="weekly"]').click();
    await expect(page.locator("[data-weekly-template-new]")).toBeVisible();
    await expect(page.locator('[data-weekly-template-open="easy_kills"]')).toBeVisible();
    await page.locator("[data-weekly-template-new]").click();

    const dialog = page.locator(".weekly-template-dialog");
    await expect(dialog).toBeVisible();
    await page.locator("[data-weekly-template-backdrop]").evaluate((backdrop) => {
        backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();

    await page.locator("[data-weekly-template-close]").click();
    await expect(dialog).toBeHidden();
});

test("an administrator can search players, inspect collections, and open protected actions", async ({ page }) => {
    await openAdminApp(page);
    await page.locator('[data-progression-section="players"]').click();
    const search = page.locator("[data-player-manager-search]");
    await expect(search).toBeVisible();
    await search.fill("PlayerMC");
    const member = page.locator('[data-player-manager-select="223e4567-e89b-42d3-a456-426614174111"]');
    await expect(member).toBeVisible();
    await member.click();

    await expect(page.getByText("Complete Collection", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Backgrounds", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Profile icons", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Icon borders", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Titles", exact: true })).toBeVisible();
    await page.locator("[data-player-collection-sort]").selectOption("alphabetical");
    await expect(page.locator("[data-player-collection-sort]")).toHaveValue("alphabetical");
    await expect(page.locator('[data-player-cosmetic-key="title:br_survivor"]')).toHaveClass(/(^|\s)owned(\s|$)/);
    await expect(page.locator('[data-player-cosmetic-key="title:sharpshooter"]')).toHaveClass(/(^|\s)unowned(\s|$)/);
    await expect(
        page.locator('[data-player-cosmetic-key="title:sharpshooter"] [data-progression-grant-revoke]')
    ).toHaveCount(0);
    const revoke = page.locator('[data-player-cosmetic-key="title:br_survivor"] [data-progression-grant-revoke]');
    await expect(revoke).toHaveCount(1);
    await revoke.click();
    const revokeDialog = page.locator("[data-player-revoke-form]");
    await expect(revokeDialog).toBeVisible();
    await expect(revokeDialog.locator('textarea[name="note"]')).toHaveAttribute("required", "");
    await page.locator("[data-player-revoke-backdrop]").evaluate((backdrop) => {
        backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await page.keyboard.press("Escape");
    await expect(revokeDialog).toBeVisible();
    await page.locator("[data-player-revoke-close]").click();
    await expect(revokeDialog).toBeHidden();

    const give = page.locator("[data-player-grant-open]:not([disabled])").first();
    await expect(give).toBeVisible();
    await give.click();
    const giftDialog = page.locator(".player-action-dialog");
    await expect(giftDialog).toBeVisible();
    await expect(giftDialog.locator('textarea[name="note"]')).toBeVisible();
    await page.locator("[data-player-grant-backdrop]").evaluate((backdrop) => {
        backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await page.keyboard.press("Escape");
    await expect(giftDialog).toBeVisible();
    await page.locator("[data-player-grant-close]").click();
    await expect(giftDialog).toBeHidden();

    await page.locator("[data-player-ban-open]").click();
    await expect(page.locator("[data-player-ban-form]")).toBeVisible();
    await expect(page.locator('[data-player-ban-form] textarea[name="reason"]')).toBeVisible();
    await page.locator("[data-player-ban-close]").click();
    await expect(page.locator("[data-player-ban-form]")).toBeHidden();
});

test("earned cosmetics show a reward popup without a second claim", async ({ page }) => {
    const earnedStub = giftSupabaseStub.replace('notification_type: "cosmetic_gift"', 'notification_type: "system"')
        .replace('gift_source: "friend"', 'gift_source: "unlock"');
    await installPageStubs(page, earnedStub);
    await page.goto("/");
    const dialog = page.locator(".notification-gift-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Reward Unlocked");
    await expect(dialog.locator("[data-notification-claim]")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(dialog).toBeHidden();
    await page.locator("[data-notification-panel-open]").click();
    await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
    await expect(page.locator(".notification-item")).toContainText("Reward unlocked");
});

test("a cosmetic gift opens once and remains manageable in the private notification inbox", async ({ page }) => {
    await openGiftApp(page);

    const giftDialog = page.locator(".notification-gift-dialog");
    await expect(giftDialog).toBeVisible();
    await expect(giftDialog).toContainText("Night Ops");
    await expect(giftDialog).toContainText("Thanks for helping with the server.");
    await page.locator(".notification-gift-dialog [data-notification-gift-close]").last().click();
    await expect(giftDialog).toBeHidden();

    const bellButton = page.locator("[data-notification-panel-open]");
    await expect(bellButton.locator("svg.notification-bell-symbol")).toBeVisible();
    const bellOffset = await bellButton.evaluate((button) => {
        const icon = button.querySelector(".notification-bell-symbol");
        const buttonBox = button.getBoundingClientRect();
        const iconBox = icon.getBoundingClientRect();
        return {
            x: Math.abs(iconBox.left + iconBox.width / 2 - (buttonBox.left + buttonBox.width / 2)),
            y: Math.abs(iconBox.top + iconBox.height / 2 - (buttonBox.top + buttonBox.height / 2))
        };
    });
    expect(bellOffset.x).toBeLessThanOrEqual(0.5);
    expect(bellOffset.y).toBeLessThanOrEqual(0.5);

    await bellButton.click();
    await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
    await page.locator('[data-notification-toggle="323e4567-e89b-42d3-a456-426614174222"]').click();
    await expect(page.locator('[data-notification-claim="323e4567-e89b-42d3-a456-426614174222"]')).toBeVisible();

    await page.locator('[data-notification-read="323e4567-e89b-42d3-a456-426614174222"]').click();
    await expect(page.locator(".notification-bell-button > strong")).toHaveText("1");
    await page.locator('[data-notification-toggle="323e4567-e89b-42d3-a456-426614174222"]').click();
    await page.locator('[data-notification-toggle="323e4567-e89b-42d3-a456-426614174222"]').click();
    await page.locator('[data-notification-claim="323e4567-e89b-42d3-a456-426614174222"]').click();
    await expect(page.locator(".notification-item-meta")).toContainText("Claimed");
    await expect(page.locator('[data-notification-claim="323e4567-e89b-42d3-a456-426614174222"]')).toHaveCount(0);

    page.once("dialog", (dialog) => dialog.accept());
    await page.locator('[data-notification-delete="323e4567-e89b-42d3-a456-426614174222"]').click();
    await expect(page.locator('[data-notification-toggle="323e4567-e89b-42d3-a456-426614174222"]')).toHaveCount(0);
    await expect(page.getByText("Your inbox is empty")).toBeVisible();
});

test("the Minecraft avatar survives a failed primary skin service", async ({ page }) => {
    await openAdminApp(page, "#account");
    await expect(page.locator("[data-account-form]")).toBeVisible();
    await expect(page.locator(".account-hero .account-avatar-large img")).toHaveAttribute(
        "src",
        /https:\/\/api\.mcheads\.org\/head\/AdminMC\/128/
    );
    await expect(page.locator("[data-account-preview-img]")).toHaveAttribute(
        "src",
        /https:\/\/api\.mcheads\.org\/head\/AdminMC\//
    );
    await expect(page.locator(".account-hero .avatar-image-fallback")).toBeHidden();
});

test("Discord avatars support animation and stale URLs fall back without breaking built-in icons", async ({ page }) => {
    const discordRequests = [];
    page.on("request", (request) => {
        if (request.url().startsWith("https://cdn.discordapp.com/")) discordRequests.push(request.url());
    });
    await installPageStubs(page, discordAvatarSupabaseStub);
    await page.route("https://cdn.discordapp.com/avatars/**", (route) =>
        route.fulfill({ status: 404, contentType: "text/plain", body: "missing" })
    );
    await page.route("https://cdn.discordapp.com/embed/avatars/**", (route) =>
        route.fulfill({ contentType: "image/png", body: transparentPng })
    );
    await page.goto("/#account");

    await expect(page.locator("[data-account-form]")).toBeVisible();
    await expect(page.locator(".account-hero .account-avatar-large img")).toHaveAttribute(
        "src",
        /https:\/\/cdn\.discordapp\.com\/embed\/avatars\/[0-5]\.png/
    );
    expect(discordRequests.some((url) => /\/a_deadbeef\.gif\?size=128$/.test(url))).toBe(true);

    await page.locator('[data-cosmetic-picker-open="icon"]').click();
    await expect(page.locator('[data-cosmetic-option="default"] img')).toHaveAttribute(
        "src",
        "/assets/branding/icon-256.webp?v=cob2-20261004"
    );
    await expect(page.locator('[data-cosmetic-option="discord"] img')).toHaveAttribute(
        "src",
        /https:\/\/cdn\.discordapp\.com\/embed\/avatars\/[0-5]\.png/
    );
});

for (const route of ["/", "/stats/#account", "/playtests/", "/feedback/", "/help/", "/about/"]) {
    test(`refreshed Discord avatar overrides stale login metadata on ${route}`, async ({ page }, testInfo) => {
        const refreshedAvatar = "https://cdn.discordapp.com/avatars/138564775733886986/a_current.gif?size=256";
        const staleLoginAvatar = "https://cdn.discordapp.com/embed/avatars/0.png";
        const stub = discordAvatarSupabaseStub
            .replace(
                "sub: profile.discord_id,",
                `sub: profile.discord_id, avatar_url: ${JSON.stringify(staleLoginAvatar)},`
            )
            .replace(
                'data: { deleted: name === "delete-account" },',
                `data: name === "refresh-discord-avatar" ? { avatar_url: ${JSON.stringify(refreshedAvatar)} }
                    : { deleted: name === "delete-account" },`
            );
        await installPageStubs(page, stub);
        await page.route("https://cdn.discordapp.com/**", (request) =>
            request.fulfill({ contentType: "image/png", body: transparentPng })
        );
        await page.goto(route);
        const avatar = page.locator("#account-widget img.avatar-image");
        await expect(avatar).toHaveAttribute("src", refreshedAvatar);
        await expect.poll(() => avatar.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
        if (route === "/stats/#account") {
            await expect(page.locator(".account-hero .account-avatar-large img")).toHaveAttribute(
                "src",
                refreshedAvatar
            );
            await expect(page.locator("[data-account-preview-img]")).toHaveAttribute("src", refreshedAvatar);
            await page.locator('[data-cosmetic-picker-open="icon"]').click();
            await expect(page.locator('[data-cosmetic-option="discord"] img')).toHaveAttribute("src", refreshedAvatar);
            await testInfo.attach("discord-avatar-picker", {
                body: await page.screenshot(),
                contentType: "image/png"
            });
        }
    });
}

test("account privacy controls require DELETE and invoke the server-side deletion function", async ({ page }) => {
    const calls = [];
    await page.exposeFunction("recordAccountDelete", (call) => calls.push(call));
    await installPageStubs(
        page,
        adminSupabaseStub.replace(
            "window.__edgeFunctionCalls.push({ name, options });",
            "window.__edgeFunctionCalls.push({ name, options }); await window.recordAccountDelete({name,options});"
        )
    );
    await page.goto("/account/");
    await expect(page.locator("[data-notification-preferences-form]")).toContainText("Email Notifications");
    const deletion = page.locator("[data-account-delete-form]");
    await page.locator(".account-danger-zone summary").click();
    await deletion.locator("input[name='confirmation']").fill("DELETE");
    await deletion.getByRole("button", { name: "Permanently delete account" }).click();
    await expect
        .poll(() => calls.filter((call) => call.name === "delete-account"))
        .toEqual([
            {
                name: "delete-account",
                options: { body: { confirmation: "DELETE" } }
            }
        ]);
    await expect(page).toHaveURL("http://127.0.0.1:4175/");
    await expect(page.locator("[data-account-delete-form]")).toHaveCount(0);
});

test("email preference categories expose admin alerts only to administrators", async ({ page }) => {
    await openMemberApp(page, "#account");
    const memberPreferences = page.locator("[data-notification-preferences-form]");
    await expect(memberPreferences.locator('input[name="playtestEmail"]')).toHaveCount(1);
    await expect(memberPreferences.locator('input[name="ticketResponseEmail"]')).toHaveCount(1);
    await expect(memberPreferences.locator('input[name="adminTicketEmail"]')).toHaveCount(0);
    await expect(memberPreferences.locator('input[name="adminAccountCreatedEmail"]')).toHaveCount(0);
});

test("administrator email preferences include private operational alerts", async ({ page }) => {
    await openAdminApp(page, "#account");
    const adminPreferences = page.locator("[data-notification-preferences-form]");
    await expect(adminPreferences.locator('input[name="playtestEmail"]')).toHaveCount(1);
    await expect(adminPreferences.locator('input[name="ticketResponseEmail"]')).toHaveCount(1);
    await expect(adminPreferences.locator('input[name="adminTicketEmail"]')).toHaveCount(1);
    await expect(adminPreferences.locator('input[name="adminAccountCreatedEmail"]')).toHaveCount(1);
});

test("personal cosmetics remember the Show unowned preference after reload", async ({ page }) => {
    await openAdminApp(page, "#account");
    await expect(page.locator("[data-account-form]")).toBeVisible();
    const openBackgrounds = page.locator('[data-cosmetic-picker-open="background"]');
    await expect(openBackgrounds).toHaveCount(1);
    await openBackgrounds.click();

    const showUnowned = page.locator("[data-cosmetic-show-unowned]");
    await expect(showUnowned).toHaveCount(1);
    await showUnowned.check();
    await expect(showUnowned).toBeChecked();
    await page.locator("[data-cosmetic-picker-close]").click();

    await page.reload();
    await expect(page.locator("[data-account-form]")).toBeVisible();
    await page.locator('[data-cosmetic-picker-open="background"]').click();
    await expect(page.locator("[data-cosmetic-show-unowned]")).toBeChecked();
});

test("rarity colors frame every personalization card", async ({ page }) => {
    await openAdminApp(page, "#account");
    await expect(page.locator("[data-account-form]")).toBeVisible();

    for (const type of ["icon", "background", "border", "title", "badges"]) {
        await page.locator(`[data-cosmetic-picker-open="${type}"]`).click();
        const showUnowned = page.locator("[data-cosmetic-show-unowned]");
        if (!(await showUnowned.isChecked())) await showUnowned.check();

        const card = page.locator(`.cosmetic-option[data-cosmetic-type="${type}"]`).first();
        await expect(card).toBeVisible();
        const cardStyle = await card.evaluate((element) => {
            const style = getComputedStyle(element);
            return {
                borderTop: style.borderTopColor,
                borderRight: style.borderRightColor,
                borderBottom: style.borderBottomColor,
                borderLeft: style.borderLeftColor,
                opacity: style.opacity
            };
        });

        expect(
            new Set([cardStyle.borderTop, cardStyle.borderRight, cardStyle.borderBottom, cardStyle.borderLeft]).size
        ).toBe(1);
        expect(cardStyle.opacity).toBe("1");
        await page.locator("[data-cosmetic-picker-close]").click();
    }

    await page.locator('[data-cosmetic-picker-open="badges"]').click();
    await expect(page.locator('[data-badge-id="br_wins_counter"] .badge-tier-level')).toHaveText("LVL 1/5");
    await expect(page.locator('[data-badge-id="ace_counter"] .badge-tier-level')).toHaveText("LVL 1/3");

    const rarityBorders = await page.locator(".cosmetic-collection").evaluate((collection) => {
        const border = (selector) => getComputedStyle(collection.querySelector(selector)).borderTopColor;
        return {
            common: border(".cosmetic-option.rarity-common"),
            mythic: border(".cosmetic-option.rarity-mythic")
        };
    });
    expect(rarityBorders.common).not.toBe(rarityBorders.mythic);
});

test("approved badge artwork keeps its complete frame in the picker and equipped profile", async ({
    page
}, testInfo) => {
    await openAdminApp(page, "#account");
    await expect(page.locator("[data-account-form]")).toBeVisible();
    await page.locator('[data-cosmetic-picker-open="badges"]').click();
    const showUnowned = page.locator("[data-cosmetic-show-unowned]");
    if (!(await showUnowned.isChecked())) await showUnowned.check();

    for (const [id, award] of [
        ["br_kills_counter", "br_kills_counter_common"],
        ["point_blank", "point_blank"],
        ["grounded", "grounded"],
        ["anti_armor_ace", "anti_armor_ace"],
        ["owner", "owner"]
    ]) {
        const icon = page.locator(`[data-badge-id="${id}"] .badge-icon`);
        await icon.scrollIntoViewIfNeeded();
        await expect(icon).toHaveClass(/badge-artwork/);
        await expect(icon.locator("img")).toHaveAttribute("src", `./assets/badges/combat-v2/${award}.png?v=3`);
        await expect.poll(() => icon.locator("img").evaluate((img) => img.complete && img.naturalWidth)).toBe(512);
        const style = await icon.evaluate((element) => {
            const css = getComputedStyle(element);
            return {
                clip: css.clipPath,
                radius: css.borderRadius,
                fit: getComputedStyle(element.querySelector("img")).objectFit
            };
        });
        expect(style).toEqual({ clip: "none", radius: "0px", fit: "contain" });
    }

    await page.screenshot({ path: testInfo.outputPath("approved-combat-badge-picker.png") });
    const adminBadge = page.locator('[data-cosmetic-option="admin"]');
    await adminBadge.click();
    await page.locator("[data-cosmetic-picker-close]").click();
    const equipped = page.locator("[data-account-preview-badges] .badge-admin .badge-artwork");
    await expect(equipped).toBeVisible();
    await expect(equipped.locator("img")).toHaveAttribute("src", "./assets/badges/combat-v2/admin.png?v=3");
    const badge = equipped.locator("..");
    await expect(badge).toHaveClass(/equipped-badge/);
    await expect(badge).toHaveAttribute("aria-label", /Admin/);
    await expect(badge.locator(".badge-tier-level, .badge-icon-value")).toHaveCount(0);
    expect(
        await badge.evaluate((element) => {
            const css = getComputedStyle(element);
            return {
                border: css.borderWidth,
                background: css.backgroundColor,
                shadow: css.boxShadow,
                text: element.innerText.trim(),
                width: element.getBoundingClientRect().width,
                height: element.getBoundingClientRect().height
            };
        })
    ).toEqual({ border: "0px", background: "rgba(0, 0, 0, 0)", shadow: "none", text: "", width: 44, height: 44 });
    await badge.focus();
    await expect(page.locator(".badge-progress-tooltip")).toContainText("Admin");
    await page.screenshot({ path: testInfo.outputPath("artwork-only-equipped-profile.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test("equipped badges remain selected after saving the profile", async ({ page }) => {
    await openAdminApp(page, "#account");
    await expect(page.locator("[data-account-form]")).toBeVisible();
    await page.locator('[data-cosmetic-picker-open="badges"]').click();

    const adminBadge = page.locator('[data-cosmetic-option="admin"]');
    await expect(adminBadge).toHaveAttribute("data-cosmetic-owned", "true");
    await adminBadge.click();
    await expect(adminBadge).toHaveAttribute("aria-pressed", "true");
    await page.locator("[data-cosmetic-picker-close]").click();

    await page.locator('[data-account-form] button[type="submit"]').click();
    await expect(page.getByText("Profile saved.", { exact: true })).toBeVisible();
    await expect(page.locator("[data-cosmetic-field-label='badges']")).toHaveText("1 / 5 equipped");

    await page.locator('[data-cosmetic-picker-open="badges"]').click();
    await expect(page.locator('[data-cosmetic-option="admin"]')).toHaveAttribute("aria-pressed", "true");
});

test("profile editing preview reflects the complete unsaved cosmetic draft", async ({ page }) => {
    await openAdminApp(page, "#account");
    const form = page.locator("[data-account-form]");
    const preview = page.locator("[data-account-preview]");
    await expect(form).toBeVisible();
    await expect(preview.locator(".account-level-pill")).toContainText("LVL 2");

    await form.locator("[name='displayName']").fill("Draft Operator");
    await expect(preview.locator("[data-account-preview-name]")).toHaveText("Draft Operator");

    await page.locator('[data-cosmetic-picker-open="icon"]').click();
    await page.locator('[data-cosmetic-option="default"]').click();
    await page.locator("[data-cosmetic-picker-close]").click();
    await expect(preview.locator("[data-account-preview-img]")).toHaveAttribute(
        "src",
        /assets\/branding\/icon-256\.webp/
    );

    await page.locator('[data-cosmetic-picker-open="background"]').click();
    await page.locator('[data-cosmetic-option="night"]').click();
    await page.locator("[data-cosmetic-picker-close]").click();
    await expect(preview).toHaveAttribute("data-account-preview-background", "night");
    const backgroundImage = await preview.evaluate((element) => getComputedStyle(element).backgroundImage);
    expect(backgroundImage).toContain("/assets/profile-backgrounds/night-ops.png");
    expect(backgroundImage).not.toContain("/assets/css/assets/");

    await page.locator('[data-cosmetic-picker-open="border"]').click();
    await page.locator('[data-cosmetic-option="green"]').click();
    await page.locator("[data-cosmetic-picker-close]").click();
    await expect(preview.locator("[data-account-preview-avatar]")).toHaveClass(/avatar-frame-image/);

    await page.locator('[data-cosmetic-picker-open="title"]').click();
    await page.locator('[data-cosmetic-option="owner"]').click();
    await page.locator("[data-cosmetic-picker-close]").click();
    await expect(preview.locator("[data-account-preview-title]")).toContainText("Owner");

    await page.locator('[data-cosmetic-picker-open="badges"]').click();
    await page.locator('[data-cosmetic-option="admin"]').click();
    await page.locator("[data-cosmetic-picker-close]").click();
    await expect(preview.locator("[data-account-preview-badges] .badge-admin")).toBeVisible();
});

test("TEST network status counts an empty online network without using legacy production presence", async ({
    page
}) => {
    await installPageStubs(page);
    await page.route("**/api-config.js*", (route) =>
        route.fulfill({
            contentType: "text/javascript",
            body:
                configStub +
                '\nwindow.COB_STATS_ENVIRONMENT="TEST";window.COB_NETWORK_STATS_API_URL=location.origin+"/functions/v1/network-stats";'
        })
    );
    let legacyReads = 0;
    await page.route("**/rest/v1/cob_stats_exports*", (route) => {
        legacyReads++;
        return route.fulfill({ contentType: "application/json", body: "[]" });
    });
    let live = {
        state: "online",
        onlinePlayers: 0,
        label: "Network online",
        detail: "Waiting for the next match"
    };
    await page.route("**/network-stats/network/**", (route) =>
        route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({
                ...statsExportFixture,
                environment: "TEST",
                generatedAt: new Date().toISOString(),
                liveStatus: live
            })
        })
    );
    for (const path of ["/", "/stats/"]) {
        await page.goto(path);
        await expect(page.locator("#online-player-count")).toHaveText("0");
        await expect(page.locator("#server-status")).toHaveText("Network online");
    }
    live = {
        state: "unknown",
        onlinePlayers: null,
        label: "Status unavailable",
        detail: "Waiting for live network status"
    };
    await page.reload();
    await expect(page.locator("#online-player-count")).toHaveText("Unavailable");
    await expect(page.locator("#server-status")).toHaveText("Status unavailable");
    expect(legacyReads).toBe(0);
});

test("TEST customization persists across pages without losing identity or unsaved drafts", async ({ page }) => {
    await installPageStubs(page, adminSupabaseStub.replace("session: {", 'session: { access_token: "fixture-token",'));
    await page.route("**/api-config.js*", (route) =>
        route.fulfill({
            contentType: "text/javascript",
            body:
                configStub +
                '\nwindow.COB_STATS_ENVIRONMENT="TEST";window.COB_NETWORK_STATS_API_URL=location.origin+"/functions/v1/network-stats";'
        })
    );
    let customization = null,
        rejectSave = true,
        saves = 0;
    const cycle = new Date();
    cycle.setHours(0, 0, 0, 0);
    cycle.setDate(cycle.getDate() - ((cycle.getDay() + 6) % 7));
    const cycleKey = [
        cycle.getFullYear(),
        String(cycle.getMonth() + 1).padStart(2, "0"),
        String(cycle.getDate()).padStart(2, "0")
    ].join("-");
    const row = () => ({
        id: "123e4567-e89b-42d3-a456-426614174000",
        user_id: "123e4567-e89b-42d3-a456-426614174000",
        environment: "TEST",
        xp: 12500,
        weekly_missions_completed: 0,
        hard_missions_completed: 0,
        player_id: "p_123456abcdef",
        player_uuid: "4d8a51b6-1cfd-4cbc-8527-97eda0c4202d",
        cycle_key: cycleKey,
        cycle_ends_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        missions: [],
        claimed_ids: [],
        stats_profile: {},
        entitlements: [
            { type: "icon", id: "minecraft" },
            { type: "icon", id: "discord" },
            { type: "background", id: "default" },
            { type: "background", id: "night" },
            { type: "border", id: "none" },
            { type: "border", id: "green" },
            { type: "title", id: "none" },
            { type: "title", id: "owner" },
            { type: "badge", id: "owner" }
        ],
        customization
    });
    await page.route("**/network-stats/network/**", (route) =>
        route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({
                ...statsExportFixture,
                environment: "TEST",
                liveStatus: {
                    state: "online",
                    onlinePlayers: 0,
                    label: "Network online"
                }
            })
        })
    );
    await page.route("**/network-stats/account/**", async (route) => {
        if (new URL(route.request().url()).pathname.endsWith("/account/link")) {
            return route.fulfill({
                contentType: "application/json",
                body: JSON.stringify({
                    environment: "TEST",
                    user_id: row().user_id,
                    linked: true,
                    player_uuid: "90000000-0000-4000-8000-000000000001"
                })
            });
        }
        if (route.request().method() === "POST") {
            saves++;
            if (rejectSave)
                return route.fulfill({
                    status: 503,
                    contentType: "application/json",
                    body: '{"error":"Save temporarily unavailable"}'
                });
            const p = route.request().postDataJSON().preferences;
            customization = {
                display_name: p.displayName,
                avatar_source: p.avatarSource,
                profile_background: p.profileBackground,
                pfp_border: p.pfpBorder,
                profile_title: p.profileTitle,
                selected_badges: p.selectedBadges
            };
        }
        return route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({ ...row(), ...customization })
        });
    });
    await page.goto("/stats/#account");
    await expect(page).toHaveURL(/\/account\/$/);
    const form = page.locator("[data-account-form]");
    await expect(form).toBeVisible();
    await form.locator("[name='displayName']").fill("Saved Operator");
    for (const [type, id] of [
        ["icon", "discord"],
        ["background", "night"],
        ["border", "green"],
        ["title", "owner"]
    ]) {
        await page.locator(`[data-cosmetic-picker-open="${type}"]`).click();
        await page.locator(`[data-cosmetic-option="${id}"]`).click();
        await page.locator("[data-cosmetic-picker-close]").click();
    }
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(form.locator("[name='displayName']")).toHaveValue("Saved Operator");
    for (const [name, value] of [
        ["avatarSource", "discord"],
        ["profileBackground", "night"],
        ["pfpBorder", "green"],
        ["profileTitle", "owner"]
    ])
        await expect(form.locator(`[name='${name}']`)).toHaveValue(value);
    await form.locator("button[type='submit']").click();
    await expect(page.getByText("Save temporarily unavailable", { exact: true })).toBeVisible();
    await expect(form.locator("[name='displayName']")).toHaveValue("Saved Operator");
    for (const [name, value] of [
        ["avatarSource", "discord"],
        ["profileBackground", "night"],
        ["pfpBorder", "green"],
        ["profileTitle", "owner"]
    ])
        await expect(form.locator(`[name='${name}']`)).toHaveValue(value);
    rejectSave = false;
    await form.locator("button[type='submit']").click();
    await expect(page.getByText("Profile saved.", { exact: true })).toBeVisible();
    expect(saves).toBe(2);
    await page.locator("[data-account-panel-open]").click();
    await expect(page.locator(".profile-drawer")).toContainText("Saved Operator");
    await expect(page.locator(".profile-drawer-tickets[href='/admin/matches/']")).toBeVisible();
    for (const path of ["/", "/playtests/", "/feedback/"]) {
        await page.goto(path);
        await page.locator("[data-shell-account-open]").click();
        await expect(page.locator(".profile-drawer")).toContainText("Saved Operator");
        await expect(page.locator(".profile-drawer-tickets[href='/admin/matches/']")).toBeVisible();
    }
    await page.goto("/account/");
    await expect(form.locator("[name='displayName']")).toHaveValue("Saved Operator");
    await page.goto("/stats/");
    await expect(page.locator("#account-view")).toHaveCount(0);
});

test("linked Minecraft UUID drives skins while unlinked missions remain visible without fake progress", async ({
    page
}) => {
    const minecraftUuid = "4d8a51b6-1cfd-4cbc-8527-97eda0c4202d";
    const stub = adminSupabaseStub
        .replace("session: {", 'session: { access_token: "fixture-token",')
        .replace('display_name: "Test Admin"', 'display_name: "kiraval"')
        .replace('minecraft_player_name: "AdminMC"', 'minecraft_player_name: ""');
    await installPageStubs(page, stub);
    await page.route("**/api-config.js*", (route) =>
        route.fulfill({
            contentType: "text/javascript",
            body:
                configStub +
                '\nwindow.COB_STATS_ENVIRONMENT="TEST";window.COB_NETWORK_STATS_API_URL=location.origin+"/functions/v1/network-stats";'
        })
    );
    await page.route("**/network-stats/network/**", (route) =>
        route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({ ...statsExportFixture, environment: "TEST" })
        })
    );
    let linked = false;
    const cycle = new Date();
    cycle.setHours(0, 0, 0, 0);
    cycle.setDate(cycle.getDate() - ((cycle.getDay() + 6) % 7));
    const cycleKey = [
        cycle.getFullYear(),
        String(cycle.getMonth() + 1).padStart(2, "0"),
        String(cycle.getDate()).padStart(2, "0")
    ].join("-");
    await page.route("**/network-stats/account/**", (route) => {
        const row = {
            environment: "TEST",
            user_id: "123e4567-e89b-42d3-a456-426614174000",
            awaiting_link: !linked,
            player_uuid: linked ? minecraftUuid : null,
            player_id: linked ? "p_123456abcdef" : null,
            cycle_key: cycleKey,
            cycle_ends_at: new Date(Date.now() + 7 * 86400000).toISOString(),
            missions: Array.from({ length: 7 }, (_, index) => ({
                id: `mission-${index}`,
                label: `Mission ${index + 1}`,
                description: "Get kills",
                difficulty: index < 4 ? "easy" : "hard",
                metric: "kills",
                mode: "overall",
                target: 10,
                xp: 500
            })),
            claimed_ids: [],
            swapped_ids: [],
            stats_profile: linked ? {} : null,
            ...(linked ? { xp: 12500, entitlements: [{ type: "icon", id: "minecraft" }] } : {})
        };
        return route.fulfill({
            contentType: "application/json",
            body: JSON.stringify(
                new URL(route.request().url()).pathname.endsWith("/account/link") ? { ...row, linked } : row
            )
        });
    });
    for (const path of ["/account/", "/", "/playtests/", "/stats/"]) {
        await page.goto(path);
        await page
            .locator(
                ["/account/", "/stats/"].includes(path) ? "[data-account-panel-open]" : "[data-shell-account-open]"
            )
            .click();
        const drawer = page.locator(".profile-drawer");
        await expect(drawer.locator(".weekly-mission-row")).toHaveCount(7);
        await expect(drawer).toContainText("Connect Minecraft to sync recorded progress and claim rewards.");
        await expect(drawer.locator(".mission-progress")).toHaveCount(0);
        await expect(drawer.locator(".mission-claim-button")).toHaveCount(0);
        await expect(drawer).toContainText("LVL 2");
        if (path === "/account/") {
            await page.mouse.move(0, 0);
            await page.waitForTimeout(350);
            await page.screenshot({ path: test.info().outputPath("prelink-missions.png"), fullPage: false });
        }
    }
    linked = true;
    for (const path of ["/account/", "/", "/playtests/", "/stats/"]) {
        await page.goto(path);
        await page
            .locator(
                ["/account/", "/stats/"].includes(path) ? "[data-account-panel-open]" : "[data-shell-account-open]"
            )
            .click();
        const skin = page.locator(`.profile-drawer img[src*='${minecraftUuid.replaceAll("-", "")}']`).first();
        await expect(skin).toBeVisible();
        await expect(skin).toHaveAttribute("src", /api\.mcheads\.org\/head\/4d8a51b61cfd4cbc852797eda0c4202d/);
        await expect(page.locator("img[src*='kiraval']")).toHaveCount(0);
        if (path === "/account/") {
            await page.mouse.move(0, 0);
            await page.waitForTimeout(350);
            await page.screenshot({ path: test.info().outputPath("uuid-skin.png"), fullPage: false });
        }
    }
});

for (const viewer of ["guest", "another account"]) {
    test(`public customization and UUID skins are consistent for ${viewer}`, async ({ page }) => {
        const playerId = "p_6469f76b9499",
            accountId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
        const data = JSON.parse(JSON.stringify(statsExportFixture).replaceAll("sample-ryukai79", playerId));
        data.environment = "TEST";
        await installPageStubs(page, viewer === "guest" ? supabaseStub : memberSupabaseStub);
        await page.route("**/api-config.js*", (route) =>
            route.fulfill({
                contentType: "text/javascript",
                body:
                    configStub +
                    '\nwindow.COB_STATS_ENVIRONMENT="TEST";window.COB_NETWORK_STATS_API_URL=location.origin+"/functions/v1/network-stats";'
            })
        );
        let avatarSource = "discord",
            requests = 0;
        const avatar = "https://cdn.discordapp.com/avatars/123456789012345678/abcdef1234567890.png";
        await page.route("https://cdn.discordapp.com/**", (route) =>
            route.fulfill({ contentType: "image/png", body: transparentPng })
        );
        await page.route("**/network-stats/network/**", (route) => {
            const url = new URL(route.request().url());
            if (url.pathname.endsWith("/accounts")) {
                requests++;
                return route.fulfill({
                    contentType: "application/json",
                    body: JSON.stringify({
                        environment: "TEST",
                        profiles: [
                            {
                                id: accountId,
                                username: "kiraval",
                                display_name: "Public Operator",
                                minecraft_player_name: "Ryukai79",
                                minecraft_player_id: playerId,
                                minecraft_player_uuid: "4d8a51b6-1cfd-4cbc-8527-97eda0c4202d",
                                network_stats_environment: "TEST",
                                avatar_source: avatarSource,
                                avatar_url: avatar,
                                profile_background: "night",
                                pfp_border: "green",
                                profile_title: "owner",
                                selected_badges: ["owner"],
                                unlocked_badges: ["owner"],
                                unlocked_backgrounds: ["night"],
                                unlocked_pfp_borders: ["green"],
                                unlocked_icons: ["discord", "minecraft"],
                                unlocked_titles: ["owner"],
                                xp: 1550,
                                created_at: "2026-07-01T12:00:00Z"
                            }
                        ]
                    })
                });
            }
            return route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
        });
        await page.goto(`/stats/#player=${playerId}&tab=overview`);
        const hero = page.locator(".player-profile-hero");
        await expect(hero).toContainText("Linked Account");
        await expect(hero).toContainText("Public Operator");
        await expect(hero).toContainText("1,550");
        await expect(hero).not.toContainText("No website account linked yet");
        await expect(hero).toHaveClass(/profile-bg-night/);
        await expect(hero.locator(".avatar-frame-image")).toBeVisible();
        await expect(hero.locator(".account-badge-row img")).toHaveCount(1);
        await expect(hero.locator(`img[src*='123456789012345678']`)).toBeVisible();
        await page.screenshot({ path: test.info().outputPath("public-customization.png"), fullPage: false });
        avatarSource = "minecraft";
        await page.reload();
        await expect(hero.locator("img[src*='4d8a51b61cfd4cbc852797eda0c4202d']")).toBeVisible();
        await expect(hero.locator("img[src*='kiraval']")).toHaveCount(0);
        expect(requests).toBeGreaterThanOrEqual(2);
    });
}

test("drawer refresh retains its animated shell, scroll and focus without reopening a closed panel", async ({
    page
}) => {
    await openAdminApp(page, "");
    await page.locator("[data-shell-account-open]").click();
    await expect(page.locator(".weekly-missions-panel")).toBeVisible();
    const result = await page.evaluate(async () => {
        const { updateDrawerContent } = await import("/src/core/profile-drawer.js");
        const host = document.getElementById("account-side-panel-host"),
            drawer = host.querySelector(".profile-drawer"),
            backdrop = host.firstElementChild;
        const close = drawer.querySelector("[data-shell-account-close]");
        drawer.scrollTop = 300;
        close.focus({ preventScroll: true });
        const markup = host.innerHTML.replace("Test Admin", "Updated Admin");
        const before = drawer.scrollTop;
        updateDrawerContent(host, markup);
        const retained = {
            dialog: host.querySelector(".profile-drawer") === drawer,
            backdrop: host.firstElementChild === backdrop,
            scroll: drawer.scrollTop === before,
            focus: document.activeElement.hasAttribute("data-shell-account-close")
        };
        const { getDrawerController } = await import("/src/core/drawer-controller.js");
        const controller = getDrawerController();
        controller.close();
        controller.refresh("profile");
        return { ...retained, closed: !host.firstElementChild };
    });
    expect(result).toEqual({
        dialog: true,
        backdrop: true,
        scroll: true,
        focus: true,
        closed: true
    });
});

test("Minecraft account link preserves its code across redraws and rejects stale cross-account responses", async ({
    page
}) => {
    await openApp(page);
    const account = "90000000-0000-4000-8000-000000000001";
    let linked = false,
        requests = 0;
    await page.route("**/network-stats/account/link**", async (route) => {
        requests++;
        const issue = route.request().method() === "POST";
        expect(route.request().headers().authorization).toBe("Bearer fixture-token");
        if (issue) expect(route.request().postDataJSON()).toEqual({});
        return route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({
                environment: "TEST",
                user_id: account,
                linked,
                player_uuid: linked ? account : null,
                ...(issue
                    ? {
                          code: "ABCDEF123456",
                          expires_at: new Date(Date.now() + 600000).toISOString()
                      }
                    : {})
            })
        });
    });
    await page.evaluate(async (accountId) => {
        window.COB_STATS_ENVIRONMENT = "TEST";
        window.COB_NETWORK_STATS_API_URL = location.origin + "/functions/v1/network-stats";
        const module = await import("/src/features/minecraft-account-link.js");
        const host = document.createElement("section");
        host.id = "link-test";
        document.querySelector("main").append(host);
        window.linkOptions = {
            accountId,
            client: {
                auth: {
                    getSession: async () => ({
                        data: { session: { access_token: "fixture-token" } }
                    })
                }
            },
            onLinked: () => {
                window.linkNotifications = (window.linkNotifications || 0) + 1;
            }
        };
        module.renderMinecraftAccountLink(host, window.linkOptions);
    }, account);
    const host = page.locator("#link-test");
    await expect(host.locator("[data-minecraft-link-code]")).toBeEnabled();
    await host.locator("[data-minecraft-link-code]").click();
    await expect(host).toContainText("/cob discord link ABCDEF123456");
    await page.evaluate(async () => {
        const module = await import("/src/features/minecraft-account-link.js");
        module.renderMinecraftAccountLink(document.getElementById("link-test"), window.linkOptions);
    });
    await expect(host).toContainText("ABCDEF123456");
    linked = true;
    await host.locator("[data-minecraft-link-refresh]").click();
    await expect(host).toContainText("Minecraft account connected.");
    await expect(host.locator("[data-minecraft-link-code]")).toHaveCount(0);
    expect(await page.evaluate(() => window.linkNotifications)).toBe(1);
    await page.evaluate(async () => {
        const module = await import("/src/features/minecraft-account-link.js");
        module.renderMinecraftAccountLink(document.getElementById("link-test"), {
            ...window.linkOptions,
            accountId: "90000000-0000-4000-8000-000000000002"
        });
    });
    await expect(host).toContainText("Account link response is unavailable.");
    await expect(host).not.toContainText("ABCDEF123456");
    expect(requests).toBe(4);
});

test("updated arena maps fit playback with aligned markers and crisp small-map pixels", async ({ page }, testInfo) => {
    const base = JSON.parse(
        readFileSync(new URL("../fixtures/match-telemetry/fixture-dm.json", import.meta.url), "utf8")
    );
    const maps = [
        ["raid", "Raid", "teamDeathmatch", 915, 1116, -232, 13, 200, 246],
        ["hijacked", "Hijacked", "freeForAll", -16, 159, 960, 1039, 192, 80],
        ["shoothouse", "Shoot House", "teamDeathmatch", 951, 1049, 903, 1064, 99, 162],
        ["A", "Map A", "duel", -1018, -988, 968, 1003, 31, 36],
        ["B", "Map B", "duel", 988, 1013, -1002, -957, 26, 46]
    ];
    for (const [id, label, mode, minX, maxX, minZ, maxZ] of maps) {
        const source = structuredClone(base);
        source.matchId = `fixture-map-${id}`;
        source.mode = mode;
        source.map = { mapId: id, label, mapVersion: "arena-2026-10" };
        for (const snapshot of source.snapshots) {
            snapshot.vehicles = [];
            for (const [index, player] of snapshot.players.entries()) {
                player.x = minX + ((maxX - minX) * (index + 1)) / 4;
                player.z = minZ + (maxZ - minZ) / 2;
            }
        }
        await page.route(`**/data/match-telemetry/${source.matchId}.json`, (route) =>
            route.fulfill({ contentType: "application/json", body: JSON.stringify(source) })
        );
    }
    await openApp(page, "#view=match&match=fixture-map-raid");
    for (const [id, label, , , , , , width, height] of maps) {
        await page.goto(`/#view=match&match=fixture-map-${id}`);
        await expect(page.locator(".match-detail-header h2")).toHaveText(label);
        const image = page.locator(".tactical-map-image");
        await expect(image).toBeVisible();
        await expect
            .poll(() => image.evaluate((element) => [element.naturalWidth, element.naturalHeight]))
            .toEqual([width, height]);
        const pixelArt = id === "A" || id === "B";
        if (pixelArt) await expect(image).toHaveCSS("image-rendering", "pixelated");
        const stage = page.locator(".tactical-map-stage");
        await expect
            .poll(() =>
                stage.evaluate((element) => {
                    const rect = element.getBoundingClientRect();
                    return (
                        rect.height <= innerHeight - 50 &&
                        Math.abs(
                            rect.width / rect.height -
                                Number(element.style.aspectRatio.split("/")[0]) /
                                    Number(element.style.aspectRatio.split("/")[1])
                        ) < 0.01
                    );
                })
            )
            .toBe(true);
        await expect(page.locator(".tactical-player-marker")).toHaveCount(3);
        expect(
            await page
                .locator(".tactical-player-marker")
                .evaluateAll((elements) =>
                    elements.map((element) => [
                        element.style.getPropertyValue("--map-x"),
                        element.style.getPropertyValue("--map-y"),
                        element.hidden
                    ])
                )
        ).toEqual([
            ["25%", "50%", false],
            ["50%", "50%", false],
            ["75%", "50%", false]
        ]);
        await page.locator("[data-match-play]").click();
        await expect(page.locator("[data-match-play]")).toContainText("Pause");
        await page.locator("[data-match-play]").click();
        await stage.scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath(`map-${id}.png`) });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
});

test("Shmar fits short and tall viewports including fullscreen without distorting overlays", async ({
    page
}, testInfo) => {
    await openApp(page, "#view=match&match=fixture-br");
    const stage = page.locator(".tactical-map-stage");
    await expect(page.locator(".tactical-map-image")).toBeVisible();
    for (const viewport of [
        { width: 1366, height: 650 },
        { width: 412, height: 740 },
        { width: 1920, height: 1080 }
    ]) {
        await page.setViewportSize(viewport);
        for (const fullscreen of [false, true]) {
            if (fullscreen) await page.locator("[data-match-fullscreen]").click();
            await expect
                .poll(async () =>
                    stage.evaluate((element) => element.getBoundingClientRect().height <= innerHeight - 50)
                )
                .toBe(true);
            // Read both boxes in the same frame while fullscreen/ResizeObserver changes settle.
            await expect
                .poll(() =>
                    stage.evaluate((element) => {
                        const bounds = element.getBoundingClientRect();
                        const image = element.querySelector(".tactical-map-image").getBoundingClientRect();
                        return (
                            Math.abs(bounds.width / bounds.height - 832 / 816) < 0.005 &&
                            Math.abs(image.width - (bounds.width - 2)) < 0.1 &&
                            Math.abs(image.height - (bounds.height - 2)) < 0.1
                        );
                    })
                )
                .toBe(true);
            await stage.scrollIntoViewIfNeeded();
            await page.screenshot({
                path: testInfo.outputPath(`shmar-${viewport.width}-${fullscreen ? "fullscreen" : "normal"}.png`)
            });
            if (fullscreen) await page.locator("[data-match-fullscreen]").click();
        }
    }
});

test("stale history metadata never suppresses an available Zombie tactical replay", async ({ page }) => {
    await openApp(page);
    await page.evaluate(async (fixture) => {
        const { createMatchDetailPage } = await import("/src/match/match-detail.js");
        const { normalizeMatchTelemetry } = await import("/src/match/match-telemetry-normalizer.js");
        const container = document.createElement("section");
        container.id = "stale-replay-test";
        document.querySelector("main").append(container);
        const view = createMatchDetailPage({
            container,
            getSummary: () => ({ matchId: fixture.matchId, mode: "zombieSurvival", hasTelemetry: false }),
            api: { load: async () => normalizeMatchTelemetry(fixture, fixture.matchId) },
            replayApi: { list: async () => ({ available: true, replays: [] }) }
        });
        await view.open(fixture.matchId);
    }, zombieTelemetryFixture);
    const view = page.locator("#stale-replay-test");
    await expect(view.locator(".tactical-map-image")).toBeVisible();
    await expect(view.locator("[data-match-play]")).toBeEnabled();
    await expect(view).not.toContainText("Tactical playback unavailable");
});

test("tactical playback opens every current mode with its own label", async ({ page }) => {
    const source = JSON.parse(
        readFileSync(new URL("../fixtures/match-telemetry/fixture-dm.json", import.meta.url), "utf8")
    );
    const modes = [
        ["battleRoyale", "Battle Royale"],
        ["zombieSurvival", "Zombie Survival"],
        ["teamDeathmatch", "Team Deathmatch"],
        ["freeForAll", "Free For All"],
        ["duel", "Duels"]
    ];
    for (const [mode] of modes) {
        const matchId = `fixture-current-${mode}`;
        await page.route(`**/data/match-telemetry/${matchId}.json`, (route) =>
            route.fulfill({
                contentType: "application/json",
                body: JSON.stringify({ ...source, mode, matchId })
            })
        );
    }
    await openApp(page, "#view=match&match=fixture-current-battleRoyale");
    for (const [mode, label] of modes) {
        await page.goto(`/#view=match&match=fixture-current-${mode}`);
        await expect(page.locator(".match-detail-header .panel-kicker")).toHaveText(label);
        await expect(page.locator(".tactical-map-image")).toBeVisible();
        await expect(page.locator(".tactical-player-marker")).toHaveCount(source.participants.length);
        await page.locator("[data-match-play]").click();
        await expect(page.locator("[data-match-play]")).toContainText("Pause");
    }
});

test("completed Battle Royale telemetry opens as interactive tactical playback", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await openApp(page, "#view=match&match=fixture-br");

    const matchView = page.locator("#match-view");
    await expect(matchView).toBeVisible();
    await expect(matchView.getByRole("heading", { level: 2, name: "Shmar" })).toBeVisible();
    await expect(matchView.getByText("Winner & MVP")).toBeVisible();
    await expect(matchView.locator(".tactical-map-image")).toBeVisible();
    const mapSize = await matchView.locator(".tactical-map-stage").boundingBox();
    expect(mapSize.width / mapSize.height).toBeCloseTo(832 / 816, 1);
    await expect(matchView.locator(".tactical-player-marker")).toHaveCount(4);
    await expect(matchView.locator(".tactical-vehicle-marker")).toBeVisible();
    await expect(matchView.locator(".tactical-vehicle-marker")).toHaveText("T");
    await expect(matchView.locator(".tactical-zone")).toBeVisible();
    await expect(matchView.locator(".tactical-marker-tooltip")).toBeHidden();
    await expect(matchView.locator("[data-match-marker-size]")).toHaveValue("2");
    await expect(matchView.locator("[data-match-player-icons]")).toBeChecked();
    await expect(matchView.locator("[data-match-player-names]")).toBeChecked();
    await expect(matchView.locator("[data-match-zombie-size]")).toHaveCount(0);
    await expect(matchView.locator(".tactical-zombie-layer")).toHaveCount(0);
    await expect(matchView.locator(".tactical-map-stage")).toHaveClass(/show-player-icons/);
    await expect(matchView.locator(".tactical-map-stage")).toHaveClass(/show-player-names/);

    await matchView.locator("[data-match-player-icons]").uncheck();
    await matchView.locator("[data-match-marker-size]").evaluate((element) => {
        element.value = "0";
        element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const minimumDotGeometry = await matchView.locator('[data-tactical-player="p_alpha"]').evaluate((marker) => {
        const markerBounds = marker.getBoundingClientRect();
        const iconBounds = marker.querySelector(".tactical-player-icon").getBoundingClientRect();
        return {
            centerOffsetX: Math.abs(
                markerBounds.left + markerBounds.width / 2 - (iconBounds.left + iconBounds.width / 2)
            ),
            centerOffsetY: Math.abs(
                markerBounds.top + markerBounds.height / 2 - (iconBounds.top + iconBounds.height / 2)
            ),
            dotSize: iconBounds.width,
            configuredSize: Number.parseFloat(
                getComputedStyle(marker.closest(".tactical-map-stage")).getPropertyValue("--tactical-player-dot-size")
            )
        };
    });
    const minimumVehicleSize = await matchView
        .locator(".tactical-vehicle-marker")
        .first()
        .evaluate((marker) => marker.getBoundingClientRect().width);
    await matchView.locator("[data-match-marker-size]").evaluate((element) => {
        element.value = "4";
        element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const maximumDotSize = await matchView.locator('[data-tactical-player="p_alpha"]').evaluate((marker) => ({
        dotSize: marker.querySelector(".tactical-player-icon").getBoundingClientRect().width,
        configuredSize: Number.parseFloat(
            getComputedStyle(marker.closest(".tactical-map-stage")).getPropertyValue("--tactical-player-dot-size")
        )
    }));
    const maximumVehicleSize = await matchView
        .locator(".tactical-vehicle-marker")
        .first()
        .evaluate((marker) => marker.getBoundingClientRect().width);
    expect(minimumDotGeometry.centerOffsetX).toBeLessThanOrEqual(0.5);
    expect(minimumDotGeometry.centerOffsetY).toBeLessThanOrEqual(0.5);
    expect(minimumDotGeometry.dotSize).toBeGreaterThan(0);
    expect(maximumDotSize.dotSize).toBeGreaterThan(minimumDotGeometry.dotSize);
    expect(maximumDotSize.configuredSize / minimumDotGeometry.configuredSize).toBeCloseTo(10, 1);
    expect(maximumVehicleSize).toBeGreaterThan(minimumVehicleSize);
    await matchView.locator("[data-match-player-icons]").check();
    await expect(matchView.locator("[data-match-skip-idle]")).not.toBeChecked();
    await expect(matchView.locator("[data-match-status]")).toContainText("Snapshot");
    await matchView.locator("[data-match-skip-idle]").check();
    await expect(matchView.locator("[data-match-status]")).toContainText("Engagement");
    const timelineFollowsMap = await matchView.evaluate((element) => {
        const map = element.querySelector("[data-match-map]");
        const timeline = element.querySelector(".match-timeline");
        return Boolean(map && timeline && map.compareDocumentPosition(timeline) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(timelineFollowsMap).toBe(true);

    const fullscreenLayout = matchView.locator(".match-playback-layout");
    const fullscreenButton = matchView.locator("[data-match-fullscreen]");
    await fullscreenLayout.evaluate((element) => {
        Object.defineProperty(element, "requestFullscreen", {
            configurable: true,
            value: undefined
        });
        Object.defineProperty(element, "webkitRequestFullscreen", {
            configurable: true,
            value: undefined
        });
    });
    await fullscreenButton.click();
    await expect(fullscreenLayout).toHaveClass(/is-replay-fullscreen/);
    await expect(fullscreenButton).toHaveAttribute("aria-label", "Exit fullscreen replay");
    await fullscreenButton.click();
    await expect(fullscreenLayout).not.toHaveClass(/is-replay-fullscreen/);
    await expect(fullscreenButton).toHaveAttribute("aria-label", "Enter fullscreen replay");

    await matchView.locator(".tactical-map-stage").evaluate((element) => {
        element.scrollIntoView({ block: "center" });
    });
    await matchView.locator(".tactical-vehicle-marker").first().click();
    await expect(matchView.locator(".tactical-marker-tooltip")).toContainText("M1A1 Abrams");
    await expect(matchView.locator(".tactical-marker-tooltip")).toContainText("HP");

    await matchView.locator('[data-match-event="elimination-1"]').first().click();
    await expect(matchView.locator("[data-match-play]")).toHaveText("Pause");
    await expect
        .poll(async () => Number(await matchView.locator("[data-match-timeline]").inputValue()))
        .toBeGreaterThanOrEqual(8_000);
    expect(Number(await matchView.locator("[data-match-timeline]").inputValue())).toBeLessThan(10_000);
    await matchView.locator("[data-match-play]").click();
    await matchView.locator("[data-match-timeline]").evaluate((element) => {
        element.value = "26900";
        element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect(matchView.locator(".tactical-event-lines .engagement-line")).toBeVisible();
    await expect(matchView.locator(".tactical-event-lines text")).toHaveText(/^\d+(?:\.\d+)? blocks$/);
    await matchView.locator("[data-match-timeline]").evaluate((element) => {
        element.value = "27000";
        element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect(matchView.locator(".tactical-event-lines line")).toHaveCount(0);
    await matchView.locator("[data-match-timeline]").evaluate((element) => {
        element.value = "28900";
        element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect(matchView.locator(".tactical-event-lines .kill-line")).toBeVisible();
    await expect(matchView.locator("[data-match-event-feed]")).toContainText("Headshot");
    await expect(matchView.locator("[data-match-event-feed]")).not.toContainText(/height advantage|below target/);
    await matchView.locator("[data-match-timeline]").evaluate((element) => {
        element.value = "29000";
        element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect(matchView.locator(".tactical-event-lines line")).toHaveCount(0);

    const alphaMarker = matchView.locator('[data-tactical-player="p_alpha"]');
    await alphaMarker.focus();
    await page.keyboard.press("Enter");
    await expect(matchView.locator(".tactical-marker-tooltip")).toContainText("Alpha");
    await expect(matchView.locator(".tactical-marker-tooltip")).toContainText("HP");
    await expect(matchView.locator(".tactical-marker-tooltip")).toContainText("Current K/D");
    await expect(matchView.locator(".tactical-marker-tooltip")).toContainText("Shot range");
    await expect(matchView.locator(".tactical-tooltip-avatar")).toBeVisible();

    await matchView.locator("[data-match-player-icons]").check();
    await matchView.locator("[data-match-player-names]").check();
    await matchView.locator("[data-match-marker-size]").evaluate((element) => {
        element.value = "4";
        element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect(matchView.locator("[data-match-marker-size-output]")).toHaveText("4/4");
    await expect(matchView.locator(".tactical-map-stage")).toHaveClass(/show-player-icons/);
    await expect(matchView.locator(".tactical-map-stage")).toHaveClass(/show-player-names/);
    const largeIconSize = await matchView
        .locator('[data-tactical-player="p_alpha"] .tactical-player-icon')
        .evaluate((icon) => icon.getBoundingClientRect().width);
    expect(largeIconSize).toBeGreaterThan(34);
    await expect(matchView.locator('[data-tactical-player="p_alpha"] .tactical-player-name')).toBeVisible();

    await matchView.locator("[data-match-skip-idle]").uncheck();
    await expect(matchView.locator("[data-match-status]")).toContainText("Snapshot");
    await matchView.locator("[data-match-timeline]").evaluate((element) => {
        element.value = "0";
        element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await matchView.locator("[data-match-play]").click();
    await page.waitForTimeout(300);
    const continuousTime = Number(await matchView.locator("[data-match-timeline]").inputValue());
    expect(continuousTime).toBeGreaterThan(0);
    expect(continuousTime).toBeLessThan(1000);
    await matchView.locator("[data-match-timeline]").evaluate((element) => {
        element.value = "10000";
        element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect(matchView.locator("[data-match-play]")).toHaveText("Pause");
    await expect
        .poll(async () => Number(await matchView.locator("[data-match-timeline]").inputValue()))
        .toBeGreaterThan(10_000);

    const timeline = matchView.locator("[data-match-timeline]");
    const timelineBox = await timeline.boundingBox();
    await page.mouse.move(timelineBox.x + timelineBox.width * 0.25, timelineBox.y + timelineBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(timelineBox.x + timelineBox.width * 0.7, timelineBox.y + timelineBox.height / 2, {
        steps: 5
    });
    await expect(matchView.locator("[data-match-play]")).toHaveText("Play");
    await page.mouse.up();
    await expect(matchView.locator("[data-match-play]")).toHaveText("Pause");
    await matchView.locator("[data-match-play]").click();

    await page.mouse.move(timelineBox.x + timelineBox.width * 0.7, timelineBox.y + timelineBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(timelineBox.x + timelineBox.width * 0.4, timelineBox.y + timelineBox.height / 2, {
        steps: 4
    });
    await page.mouse.up();
    await expect(matchView.locator("[data-match-play]")).toHaveText("Play");
    await matchView.locator('[name="match-speed"][value="2"]').check();
    await expect(matchView.locator('[name="match-speed"][value="2"]')).toBeChecked();

    await matchView.locator("[data-match-play]").click();
    await expect(matchView.locator("[data-match-play]")).toHaveText("Pause");
    await matchView.locator('[data-match-filter="vehicles"]').uncheck();
    await expect(matchView.locator("[data-match-play]")).toHaveText("Pause");
    await expect(matchView.locator('[data-event-type="vehicle_destroyed"]')).toBeHidden();
    await matchView.locator("[data-match-play]").click();
    await matchView.locator("[data-match-timeline]").evaluate((element) => {
        element.value = "50000";
        element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect(matchView.locator("[data-match-end-overlay]")).toContainText("Winner & MVP");

    await page.reload();
    await expect(matchView.locator("[data-match-skip-idle]")).not.toBeChecked();
    await expect(matchView.locator('[name="match-speed"][value="2"]')).toBeChecked();
    await expect(matchView.locator('[data-match-filter="vehicles"]')).not.toBeChecked();
    await expect(matchView.locator("[data-match-marker-size]")).toHaveValue("4");
    await expect(matchView.locator("[data-match-player-icons]")).toBeChecked();
    await expect(matchView.locator("[data-match-player-names]")).toBeChecked();

    const horizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(horizontalOverflow).toBeLessThanOrEqual(1);
    expect(pageErrors).toEqual([]);
});

test("Zombie Survival replay tracks an interpolated horde with independent controls and multi-hit lines", async ({
    page
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page, "#view=match&match=fixture-zombie");

    const matchView = page.locator("#match-view");
    const timeline = matchView.locator("[data-match-timeline]");
    const zombieSize = matchView.locator("[data-match-zombie-size]");
    await expect(matchView.getByRole("heading", { level: 2, name: "Shmar" })).toBeVisible();
    await expect(matchView.locator(".tactical-zombie-layer")).toBeVisible();
    await expect(zombieSize).toHaveValue("2.5");
    await expect(matchView.locator("[data-match-zombie-size-output]")).toHaveText("2.5 blocks");

    await timeline.evaluate((element) => {
        element.value = "1500";
        element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect(matchView.locator(".tactical-zombie-marker")).toHaveCount(2);
    await expect(matchView.locator(".tactical-event-lines .zombie-hit-line")).toHaveCount(2);
    await expect(matchView.locator(".tactical-event-lines text")).toHaveCount(0);

    const initialSizes = await matchView.locator(".tactical-map-stage").evaluate((stage) => ({
        player: stage.querySelector(".tactical-player-icon").getBoundingClientRect().width,
        zombie: stage.querySelector(".tactical-zombie-marker").getBoundingClientRect().width
    }));
    await matchView.locator('[data-tactical-zombie="z-1"]').evaluate((marker) => {
        marker.dataset.reuseProbe = "same-node";
    });
    await zombieSize.evaluate((element) => {
        element.value = "4";
        element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const resized = await matchView.locator(".tactical-map-stage").evaluate((stage) => ({
        player: stage.querySelector(".tactical-player-icon").getBoundingClientRect().width,
        zombie: stage.querySelector(".tactical-zombie-marker").getBoundingClientRect().width
    }));
    expect(resized.zombie).toBeGreaterThan(initialSizes.zombie);
    expect(resized.player).toBeCloseTo(initialSizes.player, 1);

    await timeline.evaluate((element) => {
        element.value = "1800";
        element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect(matchView.locator('[data-tactical-zombie="z-1"]')).toHaveAttribute("data-reuse-probe", "same-node");
    await timeline.evaluate((element) => {
        element.value = "2200";
        element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect(matchView.locator('[data-tactical-zombie="z-2"]')).toHaveCount(0);
    await timeline.evaluate((element) => {
        element.value = "3000";
        element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect(matchView.locator('[data-tactical-zombie="z-3"]')).toBeVisible();

    const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await page.reload();
    await expect(zombieSize).toHaveValue("4");
});

test("configured Zombie Survival horde sizes reuse lightweight markers responsively", async ({ page }) => {
    for (const count of [25, 50, 100]) {
        const fixture = zombieTelemetryWithCount(count);
        await page.route(`**/data/match-telemetry/fixture-zombie-${count}.json`, (route) =>
            route.fulfill({
                contentType: "application/json",
                body: JSON.stringify(fixture)
            })
        );
        await openApp(page, `#view=match&match=fixture-zombie-${count}`);

        const matchView = page.locator("#match-view");
        const timeline = matchView.locator("[data-match-timeline]");
        await expect(matchView.locator(".tactical-zombie-marker")).toHaveCount(count);
        const updateResult = await timeline.evaluate((element) => {
            const stage = element.closest("#match-view").querySelector(".tactical-map-stage");
            const firstMarker = stage.querySelector('[data-tactical-zombie="z-1"]');
            firstMarker.dataset.performanceProbe = "reused";
            const startedAt = performance.now();
            for (let index = 0; index < 120; index++) {
                element.value = String((index * 23) % 3000);
                element.dispatchEvent(new Event("input", { bubbles: true }));
            }
            return {
                elapsedMs: performance.now() - startedAt,
                markerCount: stage.querySelectorAll(".tactical-zombie-marker").length,
                reused: stage.querySelector('[data-tactical-zombie="z-1"]')?.dataset.performanceProbe === "reused"
            };
        });
        expect(updateResult.markerCount).toBe(count);
        expect(updateResult.reused).toBe(true);
        expect(updateResult.elapsedMs).toBeLessThan(2500);
    }
});

test("match routes support Back and Forward plus legacy, partial, and failure states", async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => {
        window.location.hash = "#view=match&match=fixture-dm";
    });
    await expect(page.locator("#match-view")).toBeVisible();
    await expect(page.locator("#match-view")).toContainText("Winning team");
    await expect(page.locator("#match-view")).toContainText("Match MVP");
    await expect(page.locator(".tactical-map-image")).toBeVisible();

    await page.goBack();
    await expect(page.locator("#home-view")).toBeVisible();
    await page.goForward();
    await expect(page.locator("#match-view")).toBeVisible();

    await page.goto("/#view=match&match=fixture-partial");
    await expect(page.locator("#match-view")).toContainText("Legacy Shmar");
    await expect(page.locator("#match-view")).toContainText("Unavailable");
    await expect(page.locator(".tactical-map-image")).toBeVisible();

    await page.goto("/#view=match&match=deathmatch-1777678266192");
    await expect(page.locator("#match-view")).toContainText("Tactical playback unavailable");
    await expect(page.locator("#match-view")).toContainText("Legacy match");

    await page.goto("/#view=match&match=missing-telemetry-fixture");
    await expect(page.locator("#match-view")).toContainText("Telemetry could not be loaded");
    await expect(page.locator("#match-view").getByRole("button", { name: "Retry" })).toBeVisible();
});

test("tactical controls work from the keyboard and reduced motion stays usable", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openApp(page, "#view=match&match=fixture-br");

    const controls = page.locator("[data-match-viewer-controls]");
    const timeline = page.locator("[data-match-timeline]");
    await timeline.evaluate((element) => {
        element.value = "10000";
        element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await controls.focus();
    await page.keyboard.press("ArrowRight");
    await expect(timeline).toHaveValue("15000");
    await page.keyboard.press("ArrowLeft");
    await expect(timeline).toHaveValue("10000");
    await page.keyboard.press(" ");
    await expect(page.locator("[data-match-play]")).toHaveText("Pause");
    await page.keyboard.press(" ");
    await expect(page.locator("[data-match-play]")).toHaveText("Play");

    await page.locator("[data-match-marker-size]").focus();
    const timeBeforeFormKey = await timeline.inputValue();
    await page.keyboard.press("ArrowRight");
    await expect(timeline).toHaveValue(timeBeforeFormKey);

    const transitionDuration = await page
        .locator(".tactical-player-marker")
        .first()
        .evaluate((element) => getComputedStyle(element).transitionDuration);
    expect(transitionDuration).toMatch(/0\.001s|1ms/);
});

test("normal match viewer never instantiates admin diagnostics or replay editors even for administrators", async ({
    page
}) => {
    await installPageStubs(
        page,
        adminSupabaseStub.replace(
            "rpc: async (name, args = {}) => {",
            `rpc: async (name, args = {}) => {
                if (name === "cob_list_match_replays") return { data: [{
                    replay_id: "123e4567-e89b-42d3-a456-426614174099",
                    label: "Public replay", visibility: "public", file_size: 2048
                }], error: null };`
        )
    );
    await page.goto("/#view=match&match=fixture-br");

    const matchView = page.locator("#match-view");
    await expect(matchView.locator(".match-diagnostics")).toHaveCount(0);
    await expect(matchView.getByRole("button", { name: "Download" })).toBeVisible();
    await expect(matchView.locator(".match-replay-manage")).toHaveCount(0);
    await expect(matchView.locator("[data-replay-edit-form], [data-replay-upload-form]")).toHaveCount(0);
});

test("TEST match administration previews without mutation and requires confirmation for VOID and RESTORE", async ({
    page
}) => {
    await installPageStubs(
        page,
        adminSupabaseStub.replace("session: {", 'session: { access_token: "fixture-admin-token",')
    );
    await page.route("**/api-config.js*", (route) =>
        route.fulfill({
            contentType: "text/javascript",
            body:
                configStub +
                '\nwindow.COB_STATS_ENVIRONMENT="TEST";window.COB_NETWORK_STATS_API_URL=location.origin+"/functions/v1/network-stats";'
        })
    );
    await page.route("**/network/**", (route) =>
        route.fulfill({
            status: 503,
            contentType: "application/json",
            body: '{"error":"Unlinked fixture account"}'
        })
    );
    const id = "123e4567-e89b-42d3-a456-426614174099",
        player = "123e4567-e89b-42d3-a456-426614174000";
    let state = "COMPLETED",
        previews = 0,
        commits = 0;
    const row = () => ({
        match_id: id,
        started_at: "2026-10-01T12:00:00Z",
        ended_at: "2026-10-01T12:05:00Z",
        server_id: "arena-01",
        mode: "freeForAll",
        map_id: "Raid",
        player_count: 1,
        state,
        replay_count: 0
    });
    await page.route("**/admin/matches**", async (route) => {
        const request = route.request(),
            url = new URL(request.url());
        if (request.headers().authorization !== "Bearer fixture-admin-token") return route.continue();
        let body;
        if (url.pathname.endsWith("/preview")) {
            previews++;
            const target = request.postDataJSON().target;
            body = {
                confirmation: "fixture-confirmation-" + target,
                impact: {
                    matchId: id,
                    targetState: target,
                    history: {
                        beforeVisible: state === "COMPLETED",
                        afterVisible: target === "COMPLETED"
                    },
                    replay: {
                        artifactCount: 0,
                        beforeVisible: state === "COMPLETED",
                        afterVisible: target === "COMPLETED"
                    },
                    players: [
                        {
                            name: "AdminMC",
                            playerUuid: player,
                            stats: [
                                {
                                    field: "kills",
                                    before: target === "VOIDED" ? 3 : 0,
                                    after: target === "VOIDED" ? 0 : 3,
                                    delta: target === "VOIDED" ? -3 : 3
                                }
                            ],
                            achievementIds: [],
                            progression: {
                                xp: {
                                    before: target === "VOIDED" ? 350 : 0,
                                    after: target === "VOIDED" ? 0 : 350,
                                    delta: target === "VOIDED" ? -350 : 350
                                },
                                level: { before: 1, after: 1 },
                                changedMissions: [{ id: "kills", before: 3, after: 0 }],
                                changedClaims: [],
                                changedBadges: [],
                                revokedEntitlements: target === "VOIDED" ? [{ type: "title", id: "earned-title" }] : [],
                                addedEntitlements: []
                            }
                        }
                    ]
                }
            };
        } else if (url.pathname.endsWith("/confirm")) {
            const submitted = request.postDataJSON();
            expect(submitted.confirmed).toBe(true);
            expect(submitted.reason).toBe("Private test cleanup");
            state = submitted.confirmation.endsWith("VOIDED") ? "VOIDED" : "COMPLETED";
            commits++;
            body = { state };
        } else if (url.pathname.endsWith("/" + id)) {
            body = {
                match: row(),
                players: [
                    {
                        name: "AdminMC",
                        playerUuid: player,
                        raw: { kills: 3 },
                        contribution: { kills: 3 }
                    }
                ],
                replays: [],
                recordings: [],
                incidents: [],
                finalization: { retries: 1 },
                operations: []
            };
        } else body = { matches: [row()] };
        return route.fulfill({
            contentType: "application/json",
            body: JSON.stringify(body)
        });
    });
    await page.goto("/admin/matches/");
    await page.locator("[data-match-open]").click();
    await expect(page.locator("[data-match-preview]")).toHaveText("Void Match");
    for (const operation of ["Void", "Restore"]) {
        await page.getByRole("button", { name: operation + " Match", exact: true }).click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toContainText("AdminMC");
        await expect(dialog).toContainText("350");
        expect(commits).toBe(operation === "Void" ? 0 : 1);
        await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
        expect(commits).toBe(operation === "Void" ? 0 : 1);
        await dialog.locator('textarea[name="reason"]').fill("Private test cleanup");
        await dialog.getByRole("checkbox").check();
        await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
        await expect(dialog).toHaveCount(0);
        await expect(page.locator("[data-match-preview]")).toHaveText(
            operation === "Void" ? "Restore Match" : "Void Match"
        );
    }
    expect(previews).toBe(2);
    expect(commits).toBe(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
