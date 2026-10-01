import { expect, it, vi } from "vitest";
import { applyMissionAccountProfile } from "../../src/features/home-weekly-missions.js";
import { applyNetworkAccountProjection } from "../../src/core/network-profile.js";

it("shared panels adopt the same TEST UUID/XP/ownership without cancelling their in-flight mission load", () => {
    const state = { identity: "one::Old", generation: 4, loading: true };
    const shell = {
        profile: { id: "one", minecraft_player_name: "Old", xp: 0 },
        setProfile: vi.fn((profile) => {
            expect(state.identity).toBe("one:p_123456abcdef:Old");
            shell.profile = profile;
        })
    };
    applyMissionAccountProfile(shell, state, {
        environment: "TEST",
        user_id: "one",
        player_id: "p_123456abcdef",
        xp: 11000,
        entitlements: [{ type: "badge", id: "purchased" }],
        customization: { selected_badges: ["purchased"] }
    });
    expect(state.generation).toBe(4);
    expect(state.loading).toBe(true);
    expect(shell.profile.xp).toBe(11000);
    expect(shell.profile.unlocked_badges).toEqual(["purchased"]);
    expect(shell.profile.selected_badges).toEqual(["purchased"]);
    applyMissionAccountProfile(shell, state, { environment: "TEST", user_id: "another", xp: 999 });
    expect(shell.setProfile).toHaveBeenCalledTimes(1);
});
it("recalculated equipment cannot display cached visuals from a revoked cosmetic", () => {
    const profile = {
        id: "one",
        avatar_source: "earned-icon",
        pfp_border: "earned-border",
        profile_title: "earned-title",
        resolved_avatar_url: "old-icon",
        resolved_border_url: "old-border",
        resolved_title_text: "old-title"
    };
    const next = applyNetworkAccountProjection(profile, {
        environment: "TEST",
        user_id: "one",
        entitlements: [],
        customization: { avatar_source: "minecraft", pfp_border: "none", profile_title: "none", selected_badges: [] }
    });
    expect(next.resolved_avatar_url).toBeUndefined();
    expect(next.resolved_border_url).toBeUndefined();
    expect(next.resolved_title_text).toBeUndefined();
    expect(profile.resolved_avatar_url).toBe("old-icon");
});
