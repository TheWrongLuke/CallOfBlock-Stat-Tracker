export const PLAYTEST_ADMIN_STATUSES = Object.freeze(["voting", "upcoming", "closed", "finished"]);

export function validatePlaytestDraft(draft, now = Date.now()) {
    const title = String(draft.title || "").trim();
    const description = String(draft.description || "").trim();
    if (!title || title.length > 120) throw new Error("Enter a title of 1 to 120 characters.");
    if (description.length > 2000) throw new Error("Description must be 2000 characters or fewer.");
    if (!PLAYTEST_ADMIN_STATUSES.includes(draft.status)) throw new Error("Choose a valid playtest status.");
    const details = { title, description, status: draft.status };
    if (draft.editId) return details;
    const durationMinutes = Number(draft.durationMinutes || 120);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 720)
        throw new Error("Duration must be a whole number between 15 and 720 minutes.");
    const dates = [
        draft.mainSlot,
        ...String(draft.alternativeSlots || "")
            .split(/\r?\n/)
            .filter((s) => s.trim())
    ];
    if (dates.length > 20) throw new Error("Use at most 20 featured dates.");
    const starts = dates.map((value, index) => {
        const input = String(value || "").trim();
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input))
            throw new Error(`Date ${index + 1} must include a valid local date and time.`);
        const date = new Date(input);
        const parts = input.match(/\d+/g).map(Number);
        if (
            !Number.isFinite(date.getTime()) ||
            date.getFullYear() !== parts[0] ||
            date.getMonth() + 1 !== parts[1] ||
            date.getDate() !== parts[2] ||
            date.getHours() !== parts[3] ||
            date.getMinutes() !== parts[4]
        )
            throw new Error(`Date ${index + 1} is not a valid local date and time.`);
        if (date.getTime() <= now) throw new Error(`Date ${index + 1} must be in the future.`);
        return date.toISOString();
    });
    if (new Set(starts).size !== starts.length) throw new Error("Featured dates must not repeat.");
    return { ...details, starts, durationMinutes };
}

export function playtestRoster(summaries) {
    return summaries
        .flatMap(({ slot, votes = [] }) =>
            votes.map((vote) => ({
                userId: vote.userId,
                username: vote.username,
                slotId: slot.id,
                slotLabel: slot.label,
                startAt: slot.startAt,
                status: vote.status,
                modePreference: vote.modePreference,
                availableStartAt: vote.availableStartAt || "",
                availableEndAt: vote.availableEndAt || ""
            }))
        )
        .sort((a, b) => a.username.localeCompare(b.username) || a.startAt.localeCompare(b.startAt));
}

export function rosterCsv(rows) {
    // Neutralize spreadsheet formulas, including formulas preceded by whitespace.
    const cell = (value) => {
        const text = String(value ?? "");
        return `"${(/^[\s]*[=+@-]/.test(text) ? "'" + text : text).replace(/"/g, '""')}"`;
    };
    const columns = [
        "userId",
        "username",
        "slotId",
        "slotLabel",
        "startAt",
        "status",
        "modePreference",
        "availableStartAt",
        "availableEndAt"
    ];
    return [columns, ...rows.map((row) => columns.map((key) => row[key]))]
        .map((row) => row.map(cell).join(","))
        .join("\r\n");
}
