import { describe, expect, it, vi } from "vitest";
import { createNotificationApi } from "../../src/api/notifications.js";

describe("notification API", () => {
    it("uses private owner-scoped RPCs for inbox actions", async () => {
        const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
        const api = createNotificationApi({ rpc });

        await api.listOwn(500);
        await api.markRead("notification-1", true);
        await api.markRead("notification-1", false);
        await api.claimGift("notification-1");
        await api.delete("notification-1");

        expect(rpc).toHaveBeenNthCalledWith(1, "list_my_notifications", { p_limit: 200 });
        expect(rpc).toHaveBeenNthCalledWith(2, "set_my_notification_read", {
            p_notification_id: "notification-1",
            p_read: true
        });
        expect(rpc).toHaveBeenNthCalledWith(3, "set_my_notification_read", {
            p_notification_id: "notification-1",
            p_read: false
        });
        expect(rpc).toHaveBeenNthCalledWith(4, "claim_my_cosmetic_gift", {
            p_notification_id: "notification-1"
        });
        expect(rpc).toHaveBeenNthCalledWith(5, "delete_my_notification", {
            p_notification_id: "notification-1"
        });
    });
});
