import { describe, expect, it } from "vitest";
import {
    PLAYTEST_MODE_OPTIONS,
    labelToDbModePreference,
    dbModePreferenceToLabel
} from "../../src/core/playtest-modes.js";

describe("shared community mode preferences", () => {
    it("offers five current modes plus no preference, and round-trips each", () => {
        expect(PLAYTEST_MODE_OPTIONS).toEqual([
            "Battle Royale",
            "Zombie Survival",
            "Team Deathmatch",
            "Free For All",
            "Duels",
            "Either"
        ]);
        for (const label of PLAYTEST_MODE_OPTIONS)
            expect(dbModePreferenceToLabel(labelToDbModePreference(label))).toBe(label);
    });
    it("retains old deathmatch votes without offering an obsolete new choice", () => {
        expect(dbModePreferenceToLabel("deathmatch")).toBe("Deathmatch (Legacy)");
        expect(labelToDbModePreference("unknown")).toBe("either");
    });
});
