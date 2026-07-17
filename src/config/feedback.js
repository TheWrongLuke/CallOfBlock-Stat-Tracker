export const TICKET_CATEGORIES = Object.freeze([
    { value: "bug_report", label: "Bug Report" },
    { value: "balance_feedback", label: "Balance Feedback" },
    { value: "gameplay_suggestion", label: "Gameplay Suggestion" },
    { value: "website_issue", label: "Website Issue" },
    { value: "account_issue", label: "Account Issue" },
    { value: "playtest_feedback", label: "Playtest Feedback" },
    { value: "other", label: "Other" }
]);

export const TICKET_CONTEXTS = Object.freeze([
    { value: "battle_royale", label: "Battle Royale" },
    { value: "deathmatch", label: "Deathmatch" },
    { value: "lobby", label: "Lobby" },
    { value: "shooting_range", label: "Shooting Range" },
    { value: "parkour_room", label: "Parkour Room" },
    { value: "website", label: "Website" },
    { value: "not_applicable", label: "Not Applicable" }
]);

export const TICKET_SEVERITIES = Object.freeze([
    { value: "low", label: "Low", rank: 1 },
    { value: "medium", label: "Medium", rank: 2 },
    { value: "high", label: "High", rank: 3 },
    { value: "critical", label: "Critical", rank: 4 }
]);

export const TICKET_STATUSES = Object.freeze([
    { value: "open", label: "Open" },
    { value: "under_review", label: "Under Review" },
    { value: "need_more_information", label: "Need More Information" },
    { value: "confirmed", label: "Confirmed" },
    { value: "planned", label: "Planned" },
    { value: "resolved", label: "Resolved" },
    { value: "closed", label: "Closed" },
    { value: "rejected", label: "Rejected" }
]);

export const TICKET_SORTS = Object.freeze([
    { value: "updated", label: "Recently updated" },
    { value: "newest", label: "Newest" },
    { value: "oldest", label: "Oldest" },
    { value: "severity", label: "Severity" }
]);

export const TICKET_LIMITS = Object.freeze({
    title: 120,
    description: 5000,
    mapName: 100,
    weaponOrItem: 100,
    matchId: 100,
    reproductionSteps: 3000,
    expectedResult: 3000,
    actualResult: 3000,
    externalMediaUrl: 500,
    reply: 3000
});

export const TICKET_SUBMIT_COOLDOWN_MS = 30_000;
export const USER_REOPENABLE_TICKET_STATUSES = Object.freeze(["closed"]);
export const USER_CLOSABLE_TICKET_STATUSES = Object.freeze([
    "open",
    "under_review",
    "need_more_information",
    "confirmed",
    "planned",
    "resolved"
]);

export function optionLabel(options, value, fallback = "Unknown") {
    return options.find((option) => option.value === value)?.label || fallback;
}

export function ticketCategoryLabel(value) {
    return optionLabel(TICKET_CATEGORIES, value);
}

export function ticketContextLabel(value) {
    return optionLabel(TICKET_CONTEXTS, value);
}

export function ticketSeverityLabel(value) {
    return optionLabel(TICKET_SEVERITIES, value);
}

export function ticketStatusLabel(value) {
    return optionLabel(TICKET_STATUSES, value);
}

export function ticketSeverityRank(value) {
    return TICKET_SEVERITIES.find((severity) => severity.value === value)?.rank || 0;
}

export function isKnownTicketOption(options, value) {
    return options.some((option) => option.value === value);
}
