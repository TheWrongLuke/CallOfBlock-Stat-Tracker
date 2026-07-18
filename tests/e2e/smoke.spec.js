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

const adminSupabaseStub = `
(() => {
    const profile = {
        id: "123e4567-e89b-42d3-a456-426614174000",
        discord_id: "discord-test-user",
        username: "test-admin",
        display_name: "Test Admin",
        avatar_url: null,
        is_admin: true,
        is_owner: true,
        selected_badges: [],
        unlocked_badges: [],
        unlocked_backgrounds: [],
        unlocked_pfp_borders: [],
        unlocked_icons: [],
        unlocked_titles: []
    };

    function resultFor(table, calls) {
        const single = calls.some(([method]) => method === "single" || method === "maybeSingle");
        if (table === "profiles") return { data: single ? profile : [profile], error: null };
        if (table === "public_profiles") return { data: [profile], error: null };
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
                rpc: async (name) => ({ data: name === "reconcile_cosmetic_ownership" ? { eligible: 0, added: 0, removed: 0 } : [], error: null }),
                storage: { from: () => ({}) }
            };
        }
    };
})();
`;

async function openApp(page, hash = "") {
    await page.route("https://cdn.jsdelivr.net/**", (route) =>
        route.fulfill({ contentType: "text/javascript", body: supabaseStub })
    );
    await page.route("**/api-config.js*", (route) =>
        route.fulfill({ contentType: "text/javascript", body: configStub })
    );
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
    await page.route("https://cdn.jsdelivr.net/**", (route) =>
        route.fulfill({ contentType: "text/javascript", body: authenticatedStub })
    );
    await page.route("**/api-config.js*", (route) =>
        route.fulfill({ contentType: "text/javascript", body: configStub })
    );
    await page.goto(`/${hash}`);
    await page.waitForLoadState("domcontentloaded");
}

async function openAdminApp(page, hash = "#admin-progression") {
    await page.route("https://cdn.jsdelivr.net/**", (route) =>
        route.fulfill({ contentType: "text/javascript", body: adminSupabaseStub })
    );
    await page.route("**/api-config.js*", (route) =>
        route.fulfill({ contentType: "text/javascript", body: configStub })
    );
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
    await page.goto("/#faq");
    await expect(page.locator("#faq")).toBeVisible();
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
    await openApp(page, "#admin-tickets");
    await expect(page).toHaveURL(/#feedback$/);
    await expect(page.locator("#admin-tickets-view")).toBeHidden();
    await page.goto("/#admin-help");
    await expect(page).not.toHaveURL(/#admin-help$/);
    await expect(page.locator("#admin-help-view")).toBeHidden();
    await page.goto("/#admin-progression");
    await expect(page).not.toHaveURL(/#admin-progression$/);
    await expect(page.locator("#admin-progression-view")).toBeHidden();
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
