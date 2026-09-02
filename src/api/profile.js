function rpcObject(data) {
    return Array.isArray(data) ? data[0] || null : data || null;
}

export async function syncDiscordProfile(client) {
    if (!client?.rpc) return { data: null, error: new Error("A Supabase client is required.") };
    const result = await client.rpc("sync_discord_profile_v2");
    return { ...result, data: rpcObject(result.data) };
}

export async function saveProfileCustomization(client, profile) {
    if (!client?.rpc) return { data: null, error: new Error("A Supabase client is required.") };
    const result = await client.rpc("save_profile_customization_v2", {
        p_display_name: profile.displayName,
        p_avatar_source: profile.avatarSource,
        p_profile_background: profile.profileBackground,
        p_pfp_border: profile.pfpBorder,
        p_profile_title: profile.profileTitle,
        p_selected_badges: profile.selectedBadges
    });
    return { ...result, data: rpcObject(result.data) };
}

export async function loadNotificationPreferences(client) {
    if (!client?.rpc) return { data: null, error: new Error("A Supabase client is required.") };
    const result = await client.rpc("get_my_notification_preferences");
    return { ...result, data: rpcObject(result.data) };
}

export async function saveNotificationPreferences(client, preferences) {
    if (!client?.rpc) return { data: null, error: new Error("A Supabase client is required.") };
    const result = await client.rpc("save_my_notification_preferences", {
        p_playtest_email: Boolean(preferences.playtestEmail),
        p_ticket_response_email: Boolean(preferences.ticketResponseEmail),
        p_admin_ticket_email: Boolean(preferences.adminTicketEmail),
        p_admin_account_created_email: Boolean(preferences.adminAccountCreatedEmail)
    });
    return { ...result, data: rpcObject(result.data) };
}

export async function deleteOwnAccount(client, confirmation) {
    if (!client?.functions?.invoke) return { data: null, error: new Error("A Supabase client is required.") };
    const result = await client.functions.invoke("delete-account", {
        body: {
            confirmation: String(confirmation || "")
        }
    });
    return { ...result, data: rpcObject(result.data) };
}
