export function createNotificationApi(client) {
    if (!client) throw new Error("A Supabase client is required.");

    return {
        async listOwn(limit = 100) {
            return client.rpc("list_my_notifications", {
                p_limit: Math.min(200, Math.max(1, Math.floor(Number(limit) || 100)))
            });
        },

        async markRead(notificationId, read) {
            return client.rpc("set_my_notification_read", {
                p_notification_id: notificationId,
                p_read: Boolean(read)
            });
        },

        async delete(notificationId) {
            return client.rpc("delete_my_notification", {
                p_notification_id: notificationId
            });
        },

        async claimGift(notificationId) {
            return client.rpc("claim_my_cosmetic_gift", {
                p_notification_id: notificationId
            });
        }
    };
}
