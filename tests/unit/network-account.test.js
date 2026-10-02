import { afterEach, expect, it, vi } from "vitest";
import { ensureWeeklyMissions, claimWeeklyMissionReward, swapWeeklyMission } from "../../src/api/weekly-missions.js";
import { applyNetworkAccountProjection, mergeSavedAccountProfile } from "../../src/core/network-profile.js";
import { saveProfileCustomization } from "../../src/api/profile.js";
afterEach(() => vi.unstubAllGlobals());
it("TEST with no API configured cannot mutate production missions or customization", async () => {
    vi.stubGlobal("window", { COB_STATS_ENVIRONMENT: "TEST" });
    const rpc = vi.fn(),
        client = { rpc };
    for (const result of [
        await ensureWeeklyMissions(client),
        await claimWeeklyMissionReward(client, "mission"),
        await swapWeeklyMission(client, "mission"),
        await saveProfileCustomization(client, {})
    ]) {
        expect(result.error.message).toContain("not configured");
    }
    expect(rpc).not.toHaveBeenCalled();
});
it("configured TEST mission requests use authenticated network results without falling back to stale RPC", async () => {
    vi.stubGlobal("window", { COB_NETWORK_STATS_API_URL: "https://tracking.example", COB_STATS_ENVIRONMENT: "TEST" });
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ environment: "TEST", xp: 100 }) });
    vi.stubGlobal("fetch", fetcher);
    const client = {
        rpc: vi.fn(),
        auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "token" } } }) }
    };
    expect((await ensureWeeklyMissions(client)).data.xp).toBe(100);
    await claimWeeklyMissionReward(client, "mission");
    expect(fetcher.mock.calls[1][1].body).toBe(JSON.stringify({ missionId: "mission" }));
    expect(fetcher.mock.calls[1][1].headers.Authorization).toBe("Bearer token");
    expect(client.rpc).not.toHaveBeenCalled();
    fetcher.mockResolvedValue({ ok: false, json: async () => ({ error: "tracking unavailable" }) });
    expect((await ensureWeeklyMissions(client)).error.message).toBe("tracking unavailable");
    expect(client.rpc).not.toHaveBeenCalled();
});
it("TEST equipment uses private validated ownership and a failed save never writes production", async () => {
    vi.stubGlobal("window", { COB_NETWORK_STATS_API_URL: "https://tracking.example", COB_STATS_ENVIRONMENT: "TEST" });
    const client = {
        rpc: vi.fn(),
        auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "token" } } }) }
    };
    const fetcher = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Cosmetic not owned" }) });
    vi.stubGlobal("fetch", fetcher);
    const prefs = { displayName: "One", selectedBadges: ["perfect_week"] };
    expect((await saveProfileCustomization(client, prefs)).error.message).toBe("Cosmetic not owned");
    expect(fetcher.mock.calls[0][0].pathname).toBe("/account/customization");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ preferences: prefs });
    expect(client.rpc).not.toHaveBeenCalled();
    const next = applyNetworkAccountProjection(
        { id: "one", selected_badges: ["perfect_week", "purchased"] },
        {
            environment: "TEST",
            user_id: "one",
            entitlements: [{ type: "badge", id: "purchased" }],
            customization: { profile_title: "none", selected_badges: ["purchased"] }
        }
    );
    expect(next.selected_badges).toEqual(["purchased"]);
    expect(next.profile_title).toBe("none");
});
it("unconfigured environment fails closed and TEST reversal preserves server-protected independent ownership", async () => {
    vi.stubGlobal("window", {
        COB_NETWORK_STATS_API_URL: "https://tracking.example",
        COB_STATS_ENVIRONMENT: "PRODUCTION"
    });
    const client = { rpc: vi.fn() };
    expect((await ensureWeeklyMissions(client)).error.message).toContain("TEST");
    expect(client.rpc).not.toHaveBeenCalled();
    const profile = {
        id: "one",
        xp: 11000,
        unlocked_badges: ["perfect_week", "purchased"],
        selected_badges: ["purchased"]
    };
    const row = {
        environment: "TEST",
        user_id: "one",
        xp: 9000,
        weekly_missions_completed: 0,
        hard_missions_completed: 0,
        entitlements: [{ type: "badge", id: "purchased" }]
    };
    const projected = applyNetworkAccountProjection(profile, row);
    expect(projected.xp).toBe(9000);
    expect(projected.unlocked_badges).toEqual(["purchased"]);
    expect(projected.selected_badges).toEqual(["purchased"]);
    expect(profile.unlocked_badges).toContain("perfect_week");
    expect(applyNetworkAccountProjection(profile, { ...row, user_id: "two" })).toBe(profile);
});

it("saving TEST preferences preserves Discord, role and link metadata without retaining revoked badges", () => {
    const profile = {
        id: "one",
        is_admin: true,
        discord_id: "verified",
        avatar_url: "https://cdn.discordapp.com/avatar.gif",
        minecraft_player_name: "Player",
        selected_badges: ["old"],
        display_name: "Before"
    };
    const saved = {
        id: "one",
        user_id: "one",
        environment: "TEST",
        xp: 500,
        entitlements: [{ type: "badge", id: "kept" }],
        customization: { display_name: "After", selected_badges: ["kept"] }
    };
    const merged = mergeSavedAccountProfile(profile, saved);
    expect(merged).toMatchObject({
        is_admin: true,
        discord_id: "verified",
        avatar_url: profile.avatar_url,
        minecraft_player_name: "Player",
        display_name: "After",
        xp: 500,
        selected_badges: ["kept"],
        network_stats_environment: "TEST"
    });
    expect(profile.display_name).toBe("Before");
    expect(() => mergeSavedAccountProfile(profile, { ...saved, id: "other" })).toThrow("does not match");
    expect(() => mergeSavedAccountProfile(profile, { ...saved, user_id: "other" })).toThrow("missing");
});
