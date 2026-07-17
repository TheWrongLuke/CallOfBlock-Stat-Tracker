import { describe, expect, it } from "vitest";
import {
    ADMIN_TICKET_PREFERENCES_KEY,
    loadAdminTicketPreferences,
    saveAdminTicketPreferences
} from "../../src/services/admin-ticket-preferences.js";

function memoryStorage(initialValue = null) {
    const values = new Map();
    if (initialValue !== null) values.set(ADMIN_TICKET_PREFERENCES_KEY, initialValue);
    return {
        getItem(key) {
            return values.get(key) ?? null;
        },
        setItem(key, value) {
            values.set(key, value);
        }
    };
}

describe("admin ticket preferences", () => {
    it("hides closed tickets by default", () => {
        expect(loadAdminTicketPreferences(memoryStorage())).toEqual({ hideClosed: true });
    });

    it("remembers when closed tickets should remain visible", () => {
        const storage = memoryStorage();
        expect(saveAdminTicketPreferences({ hideClosed: false }, storage)).toBe(true);
        expect(loadAdminTicketPreferences(storage)).toEqual({ hideClosed: false });
    });

    it("recovers from invalid stored data", () => {
        expect(loadAdminTicketPreferences(memoryStorage("not-json"))).toEqual({ hideClosed: true });
    });
});
