import { describe, expect, it } from "vitest";
import {
    COSMETIC_PICKER_PREFERENCES_KEY,
    loadCosmeticPickerPreferences,
    saveCosmeticPickerPreferences
} from "../../src/services/cosmetic-picker-preferences.js";

function memoryStorage(initialValue = null) {
    const values = new Map();
    if (initialValue !== null) values.set(COSMETIC_PICKER_PREFERENCES_KEY, initialValue);
    return {
        getItem(key) {
            return values.get(key) ?? null;
        },
        setItem(key, value) {
            values.set(key, value);
        }
    };
}

describe("cosmetic picker preferences", () => {
    it("hides unowned cosmetics by default", () => {
        expect(loadCosmeticPickerPreferences(memoryStorage())).toEqual({ showUnowned: false });
    });

    it("remembers that unowned cosmetics should be shown", () => {
        const storage = memoryStorage();
        expect(saveCosmeticPickerPreferences({ showUnowned: true }, storage)).toBe(true);
        expect(loadCosmeticPickerPreferences(storage)).toEqual({ showUnowned: true });
    });

    it("recovers from invalid stored data", () => {
        expect(loadCosmeticPickerPreferences(memoryStorage("not-json"))).toEqual({ showUnowned: false });
    });
});
