export function notificationKind(row) {
    const raw = String(row?.notification_type || "").trim();
    if (!["cosmetic_gift", "system"].includes(raw)) return "";
    const kind = String(row?.gift_source || "").trim();
    return raw === "system" && ["unlock", "achievement", "playtest"].includes(kind) ? kind : raw;
}

export function rewardPopupEligible(item, seen) {
    return (
        ["cosmetic_gift", "unlock", "achievement"].includes(item.type) &&
        !item.claimedAt &&
        !item.readAt &&
        !seen.has(item.id)
    );
}
