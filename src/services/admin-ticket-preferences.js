export const ADMIN_TICKET_PREFERENCES_KEY = "cob_admin_ticket_preferences_v1";

export function defaultAdminTicketPreferences() {
    return { hideClosed: true };
}

export function loadAdminTicketPreferences(storage = globalThis.localStorage) {
    const fallback = defaultAdminTicketPreferences();
    if (!storage?.getItem) return fallback;

    try {
        const saved = JSON.parse(storage.getItem(ADMIN_TICKET_PREFERENCES_KEY) || "null");
        return {
            hideClosed: typeof saved?.hideClosed === "boolean" ? saved.hideClosed : fallback.hideClosed
        };
    } catch (_error) {
        return fallback;
    }
}

export function saveAdminTicketPreferences(preferences, storage = globalThis.localStorage) {
    if (!storage?.setItem) return false;

    try {
        storage.setItem(
            ADMIN_TICKET_PREFERENCES_KEY,
            JSON.stringify({ hideClosed: preferences?.hideClosed !== false })
        );
        return true;
    } catch (_error) {
        return false;
    }
}
