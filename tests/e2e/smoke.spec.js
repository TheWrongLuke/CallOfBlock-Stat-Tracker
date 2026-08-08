import { expect, test } from "@playwright/test";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";

const statsExportFixture = JSON.parse(
    readFileSync(new URL("../../data/stats.sample.json", import.meta.url), "utf8").replace(/^\uFEFF/, "")
);
const liveStatsExportFixture = JSON.parse(
    readFileSync(new URL("../../data/stats.json", import.meta.url), "utf8").replace(/^\uFEFF/, "")
);

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
        missions: [],
        claimed_ids: [],
        swapped_ids: [],
        awaiting_link: false,
        created_at: "2026-07-01T12:00:00Z",
        updated_at: "2026-07-01T12:00:00Z"
    };
    const badgeOverrides = [];

    function resultFor(table, calls) {
        const single = calls.some(([method]) => method === "single" || method === "maybeSingle");
        if (table === "profiles") return { data: single ? profile : [profile], error: null };
        if (table === "public_profiles") return { data: [profile], error: null };
        if (table === "badge_catalog_overrides") return { data: badgeOverrides.map((entry) => ({ ...entry })), error: null };
        if (table === "cosmetic_catalog_items") return {
            data: [{
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
                rpc: async (name, args = {}) => {
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
                            : name === "ensure_weekly_missions_v2"
                                ? missionRow
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

const giftSupabaseStub = adminSupabaseStub.replace(
    'rpc: async (name, args = {}) => {\n                    if (name === "sync_discord_profile_v2"',
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
                    if (name === "sync_discord_profile_v2"`
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

async function installPageStubs(page, supabaseBody) {
    await page.route("https://cdn.jsdelivr.net/**", (route) =>
        route.fulfill({ contentType: "text/javascript", body: supabaseBody })
    );
    await page.route("https://test.supabase.co/rest/v1/**", (route) => {
        const requestedRow = new URL(route.request().url()).searchParams.get("id");
        return route.fulfill({
            contentType: "application/json",
            body: JSON.stringify([
                { payload: requestedRow === "eq.live" ? liveStatsExportFixture : statsExportFixture }
            ])
        });
    });
    await page.route("https://mc-heads.net/**", (route) =>
        route.fulfill({ status: 502, contentType: "application/json", body: '{"error":"unavailable"}' })
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

test("homepage and primary navigation load without fatal errors", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await openApp(page);
    await expect(page.getByRole("heading", { level: 1, name: "Call of Block" })).toBeVisible();
    await expect(page.locator(".video-card")).toBeVisible();
    await expect(page.locator("#leaderboard-view")).toBeHidden();
    await expect(page.locator("[data-stats-refresh-control]")).toBeHidden();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await page.locator(".tracker-float").click();
    await expect(page.locator("#leaderboard-view")).toBeVisible();
    await expect(page.locator("[data-stats-refresh-control]")).toBeVisible();
    await expect(page.locator("[data-stats-refresh-label]")).toHaveText(/^\d+[smh]$/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    expect(pageErrors).toEqual([]);
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
    expect(statsRequests).toBe(requestsAfterLoad + 1);
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(routeBeforeRefresh);
    await expect(page.locator("#leaderboard-view")).toBeVisible();
});

test("initial authentication data uses one request per public resource", async ({ page }) => {
    await installPageStubs(page, countingSupabaseStub);
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { level: 1, name: "Call of Block" })).toBeVisible();

    await expect.poll(() => page.evaluate(() => window.__supabaseTableRequests?.playtests || 0)).toBe(1);
    const counts = await page.evaluate(() => ({ ...window.__supabaseTableRequests }));
    expect(counts.public_profiles).toBe(1);
    expect(counts.public_profile_cosmetic_inventory).toBe(1);
    expect(counts.public_cosmetic_catalog).toBe(1);
    expect(counts.badge_catalog_overrides).toBe(1);
});

test("statistics payloads follow the active route instead of loading the full export", async ({ page }) => {
    const requestedRows = [];
    page.on("request", (request) => {
        if (!request.url().includes("/rest/v1/cob_stats_exports")) return;
        requestedRows.push(new URL(request.url()).searchParams.get("id"));
    });

    await openApp(page);
    await expect.poll(() => requestedRows.includes("eq.home")).toBe(true);
    expect(requestedRows).not.toContain("eq.live");

    await page.locator(".tracker-float").click();
    await expect.poll(() => requestedRows.includes("eq.mode:battleRoyale")).toBe(true);

    await page.getByRole("button", { name: "Weapons stat view" }).click();
    await expect.poll(() => requestedRows.includes("eq.weapons:battleRoyale")).toBe(true);

    await page.getByRole("button", { name: "Players stat view" }).click();
    await page.locator("#leaderboard-body .profile-link").first().click();
    await expect.poll(() => requestedRows.some((row) => row?.startsWith("eq.profile:"))).toBe(true);
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
    await expect(creatorSection.getByRole("heading", { name: "Who is behind Call of Block?" })).toBeVisible();
    await expect(creatorSection).toContainText("Lukas / TheWrongLuke");
    await expect(creatorSection.getByRole("link", { name: "Portfolio" })).toHaveAttribute("target", "_blank");
    await expect(creatorSection.getByRole("link", { name: "GitHub" })).toHaveAttribute("rel", /noopener/);

    const footer = page.locator(".site-footer");
    await expect(footer).toContainText("Explore");
    await expect(footer).toContainText("Community");
    await expect(footer).toContainText("About & Trust");
    await expect(footer.locator("[data-admin-store-link]")).toBeHidden();
    await expect(footer.getByRole("link", { name: "Website Safety" })).toBeVisible();
});

test("website safety footer link opens the targeted FAQ entry", async ({ page }) => {
    await openApp(page);

    await page.locator('.site-footer a[href="#view=faq&entry=faq-safety"]').click();
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe("#view=faq&entry=faq-safety");
    await expect(page.locator("#faq-safety")).toHaveJSProperty("open", true);
    await expect(page.locator("#faq-safety")).toContainText("Discord OAuth");
    await expect(page.locator("#faq-safety summary")).toBeFocused();

    await page.evaluate(() => {
        document.querySelector('.site-footer a[href="#view=faq&entry=faq-safety"]')?.click();
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
        ["#admin-tickets", "#admin-tickets-view", /#feedback$/],
        ["#admin-help", "#admin-help-view", /\/$/],
        ["#admin-progression", "#admin-progression-view", /\/$/],
        ["#store", "#store-view", /\/$/],
        ["#community-dates", "#community-admin-view", /#playtests$/],
        ["#community-admin", "#community-admin-view", /#community-admin$/]
    ];

    await openApp(page, routes[0][0]);
    for (const [route, selector, fallback] of routes) {
        await page.goto(`/${route}`);
        await expect(page).toHaveURL(fallback);
        await expect(page.locator(selector)).toBeHidden();
    }
    await expect(page.getByRole("button", { name: "Admin documentation" })).toHaveCount(0);
});

test("admin routes reject a signed-in non-admin on direct navigation and refresh", async ({ page }) => {
    await openMemberApp(page, "#admin-progression");
    await expect(page).not.toHaveURL(/#admin-progression$/);
    await expect(page.locator("#admin-progression-view")).toBeHidden();

    await page.evaluate(() => window.history.replaceState(null, document.title, "#admin-help"));
    await page.reload();
    await expect(page).not.toHaveURL(/#admin-help$/);
    await expect(page.locator("#admin-help-view")).toBeHidden();
    await expect(page.getByRole("button", { name: "Admin documentation" })).toHaveCount(0);
});

test("protected admin content waits for profile verification", async ({ page }) => {
    await openDelayedAdminApp(page);
    await expect(page.locator("#admin-help-view")).toBeHidden();
    await expect(page.locator("#home-view")).toBeVisible();
    expect(await page.evaluate(() => window.__queriedSupabaseTables || [])).not.toContain(
        "admin_documentation_sections"
    );

    await expect(page.locator("#admin-help-view")).toBeVisible();
    await expect
        .poll(() => page.evaluate(() => window.__queriedSupabaseTables || []))
        .toContain("admin_documentation_sections");
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
    await expect(preview.locator("[data-account-preview-img]")).toHaveAttribute("src", /assets\/branding\/icon\.png/);

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
        Object.defineProperty(element, "requestFullscreen", { configurable: true, value: undefined });
        Object.defineProperty(element, "webkitRequestFullscreen", { configurable: true, value: undefined });
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

test("administrators receive protected telemetry diagnostics and replay management", async ({ page }) => {
    await openAdminApp(page, "#view=match&match=fixture-br");

    const matchView = page.locator("#match-view");
    await expect(matchView.locator(".match-diagnostics")).toBeVisible();
    await matchView.locator(".match-diagnostics").getByText("Admin telemetry diagnostics").click();
    await expect(matchView.locator("[data-match-diagnostics]")).toContainText("No validation errors.");
    await expect(matchView.locator("[data-match-diagnostics]")).toContainText("Snapshots");

    await expect(matchView.getByRole("button", { name: "Download" })).toBeVisible();
    await matchView.locator(".match-replay-manage").getByText("Manage").click();
    await expect(matchView.locator("[data-replay-edit-form]")).toBeVisible();
    await expect(matchView.locator("[data-replay-edit-form]")).toContainText("Replace file");
    await expect(matchView.locator("[data-replay-upload-form]")).toBeVisible();
});
