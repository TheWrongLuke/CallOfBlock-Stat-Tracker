// TEST projection already includes protected legacy and independent ownership sources.
export function applyNetworkAccountProjection(profile, row) {
    if (!profile || row?.environment !== "TEST" || row.user_id !== profile.id) return profile;
    const fields = {
        badge: "unlocked_badges",
        title: "unlocked_titles",
        background: "unlocked_backgrounds",
        border: "unlocked_pfp_borders",
        icon: "unlocked_icons"
    };
    const next = {
        ...profile,
        network_stats_environment: "TEST",
        xp: row.xp,
        weekly_missions_completed: row.weekly_missions_completed,
        hard_missions_completed: row.hard_missions_completed
    };
    if (/^p_[a-f0-9]{12}$/.test(row.player_id || "")) next.minecraft_player_id = row.player_id;
    for (const [type, field] of Object.entries(fields))
        next[field] = [
            ...new Set((row.entitlements || []).filter((item) => item.type === type).map((item) => item.id))
        ];
    if (row.customization)
        for (const field of [
            "display_name",
            "avatar_source",
            "profile_background",
            "pfp_border",
            "profile_title",
            "selected_badges"
        ]) {
            if (Object.hasOwn(row.customization, field)) next[field] = row.customization[field];
        }
    next.selected_badges = (next.selected_badges || []).filter((id) => next.unlocked_badges.includes(id)).slice(0, 5);
    for (const [selection, cached] of [
        ["avatar_source", ["resolved_avatar_url"]],
        ["pfp_border", ["resolved_border_url", "resolved_border_inset"]],
        ["profile_title", ["resolved_title_text", "resolved_title_rarity"]]
    ]) {
        if (next[selection] !== profile[selection]) for (const field of cached) delete next[field];
    }
    return next;
}

export function mergeSavedAccountProfile(profile, saved) {
    if (!profile?.id || saved?.id !== profile.id) throw new Error("Saved profile account does not match.");
    if (saved.environment !== "TEST") return saved;
    if (saved.user_id !== profile.id || !saved.customization)
        throw new Error("Saved network customization is missing.");
    return applyNetworkAccountProjection(profile, saved);
}
