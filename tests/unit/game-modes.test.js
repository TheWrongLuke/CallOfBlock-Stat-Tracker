import { describe, expect, it } from "vitest";
import { GAME_MODE_LABELS, gameModeLabel, matchGameMode, modernizeModeText } from "../../src/core/game-modes.js";

describe("current match modes", () => {
    it("labels all five canonical modes and accepts backend aliases", () => {
        expect(Object.keys(GAME_MODE_LABELS)).toHaveLength(5);
        for (const [mode, label] of Object.entries(GAME_MODE_LABELS)) {
            expect(matchGameMode({ mode })).toBe(mode);
            expect(gameModeLabel(mode)).toBe(label);
        }
        expect(matchGameMode({ mode: "zombie_survival" })).toBe("zombieSurvival");
        expect(matchGameMode({ mode: "tdm" })).toBe("teamDeathmatch");
        expect(matchGameMode({ mode: "ffa" })).toBe("freeForAll");
        expect(matchGameMode({ mode: "duels" })).toBe("duel");
    });

    it("resolves older shared telemetry from explicit format or recorded team IDs without mutating it", () => {
        expect(matchGameMode({ mode: "deathmatch", modeVariant: "ffa" })).toBe("freeForAll");
        const source = { mode: "deathmatch", participants: [{ teamId: "team-1" }, { teamId: "team-2" }] };
        expect(matchGameMode(source)).toBe("teamDeathmatch");
        expect(source.mode).toBe("deathmatch");
        expect(matchGameMode({ ...source, participants: [{ teamId: "red" }, { teamId: "blue" }] })).toBe(
            "teamDeathmatch"
        );
        expect(matchGameMode({ ...source, participants: [{ teamId: "solo-1" }, { teamId: "solo-2" }] })).toBe(
            "freeForAll"
        );
    });

    it("does not falsely assign an ambiguous legacy recording", () => {
        expect(gameModeLabel(matchGameMode({ mode: "deathmatch", participants: [] }))).toBe("TDM / FFA (legacy)");
        expect(matchGameMode({ mode: "not-a-mode" })).toBe("unknown");
    });

    it("updates old visible wording without changing Team Deathmatch", () => {
        expect(modernizeModeText("Deathmatch victory")).toBe("TDM / FFA victory");
        expect(modernizeModeText("Team Deathmatch and Free For All Deathmatch")).toBe(
            "Team Deathmatch and Free For All"
        );
    });
});
