import { expect, test } from "@playwright/test";
import { Buffer } from "node:buffer";

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
window.COB_STATS_POLL_MS = 10000;
`;

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
        selected_badges: [],
        unlocked_badges: [],
        unlocked_backgrounds: [],
        unlocked_pfp_borders: [],
        unlocked_icons: [],
        unlocked_titles: []
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

    function resultFor(table, calls) {
        const single = calls.some(([method]) => method === "single" || method === "maybeSingle");
        if (table === "profiles") return { data: single ? profile : [profile], error: null };
        if (table === "public_profiles") return { data: [profile], error: null };
        if (table === "cosmetic_catalog_items") return {
            data: [{
                cosmetic_type: "icon",
                cosmetic_id: "minecraft",
                name: "Minecraft skin",
                description: "Use the linked Minecraft skin.",
                category: "Default",
                rarity: "common",
                image_url: "./Icon.png",
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
                rpc: async (name) => {
                    if (name === "sync_discord_profile_v2" && window.__profileSyncDelayMs) {
                        await new Promise((resolve) => setTimeout(resolve, window.__profileSyncDelayMs));
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
    'rpc: async (name) => {\n                    if (name === "sync_discord_profile_v2"',
    `rpc: async (name, args) => {
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
    await page.route("https://test.supabase.co/rest/v1/**", (route) =>
        route.fulfill({ contentType: "application/json", body: "[]" })
    );
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
    await page.locator(".tracker-float").click();
    await expect(page.locator(".dashboard")).toBeVisible();
    expect(pageErrors).toEqual([]);
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
    await expect(page.locator(".dashboard")).toBeVisible();
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
