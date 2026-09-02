import { describe, expect, it, vi } from "vitest";
import {
    deleteOwnAccount,
    loadNotificationPreferences,
    saveNotificationPreferences,
    saveProfileCustomization,
    syncDiscordProfile
} from "../../src/api/profile.js";

describe("profile API", () => {
    it("synchronizes Discord identity through the protected RPC", async () => {
        const profile = { id: "profile-1", username: "Player" };
        const rpc = vi.fn().mockResolvedValue({ data: profile, error: null });

        const result = await syncDiscordProfile({ rpc });

        expect(rpc).toHaveBeenCalledWith("sync_discord_profile_v2");
        expect(result.data).toEqual(profile);
    });

    it("saves only the supported customization fields", async () => {
        const profile = { id: "profile-1", display_name: "Player" };
        const rpc = vi.fn().mockResolvedValue({ data: profile, error: null });

        await saveProfileCustomization(
            { rpc },
            {
                displayName: "Player",
                avatarSource: "minecraft",
                profileBackground: "default",
                pfpBorder: "none",
                profileTitle: "none",
                selectedBadges: ["first_win"]
            }
        );

        expect(rpc).toHaveBeenCalledWith("save_profile_customization_v2", {
            p_display_name: "Player",
            p_avatar_source: "minecraft",
            p_profile_background: "default",
            p_pfp_border: "none",
            p_profile_title: "none",
            p_selected_badges: ["first_win"]
        });
    });

    it("loads and saves private email preferences through protected RPCs", async () => {
        const rpc = vi.fn().mockResolvedValue({ data: { playtest_email: true }, error: null });

        await loadNotificationPreferences({ rpc });
        await saveNotificationPreferences(
            { rpc },
            {
                playtestEmail: true,
                ticketResponseEmail: true,
                adminTicketEmail: false,
                adminAccountCreatedEmail: true
            }
        );

        expect(rpc).toHaveBeenNthCalledWith(1, "get_my_notification_preferences");
        expect(rpc).toHaveBeenNthCalledWith(2, "save_my_notification_preferences", {
            p_playtest_email: true,
            p_ticket_response_email: true,
            p_admin_ticket_email: false,
            p_admin_account_created_email: true
        });
    });

    it("requires an explicit confirmation through the account deletion RPC", async () => {
        const invoke = vi.fn().mockResolvedValue({ data: { deleted: true }, error: null });

        await deleteOwnAccount({ functions: { invoke } }, "DELETE");

        expect(invoke).toHaveBeenCalledWith("delete-account", {
            body: { confirmation: "DELETE" }
        });
    });
});
