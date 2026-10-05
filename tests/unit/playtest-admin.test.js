import { describe, expect, it } from "vitest";
import { validatePlaytestDraft, playtestRoster, rosterCsv } from "../../src/core/playtest-admin.js";

const draft = {
    title: "Private test",
    description: "TDM and BR",
    status: "voting",
    mainSlot: "2030-10-02T18:00",
    durationMinutes: 90
};

describe("playtest admin", () => {
    it("converts local dates to explicit UTC timestamps and retains duration", () => {
        const result = validatePlaytestDraft(draft, 0);
        expect(result.starts).toEqual([new Date(draft.mainSlot).toISOString()]);
        expect(result.durationMinutes).toBe(90);
        expect(result.notifyMembers).toBe(false);
    });
    it("member announcements are opt-in and survive checkbox drafts", () => {
        expect(validatePlaytestDraft({ ...draft, notifyMembers: "on" }, 0).notifyMembers).toBe(true);
        expect(validatePlaytestDraft({ ...draft, notifyMembers: true }, 0).notifyMembers).toBe(true);
        expect(validatePlaytestDraft({ ...draft, notifyMembers: "false" }, 0).notifyMembers).toBe(false);
    });
    it.each([
        [{ mainSlot: "2030-02-31T18:00" }, "not a valid"],
        [{ alternativeSlots: "bad date" }, "Date 2"],
        [{ alternativeSlots: draft.mainSlot }, "must not repeat"],
        [{ durationMinutes: "0" }, "Duration"],
        [{ durationMinutes: 30.5 }, "Duration"],
        [{ status: "unknown" }, "status"],
        [{ title: "  " }, "title"],
        [{ mainSlot: "2000-01-01T18:00" }, "future"]
    ])("rejects invalid draft %o", (override, message) => {
        expect(() => validatePlaytestDraft({ ...draft, ...override })).toThrow(message);
    });
    it("rejects too many dates and allows detail edits without rescheduling", () => {
        expect(() =>
            validatePlaytestDraft({ ...draft, alternativeSlots: Array(20).fill(draft.mainSlot).join("\n") }, 0)
        ).toThrow("20");
        expect(
            validatePlaytestDraft({ title: "Changed", description: "", status: "finished", editId: "event" })
        ).toEqual({ title: "Changed", description: "", status: "finished" });
    });
    it("keeps one roster row per date response, not one misleading attendance total", () => {
        const rows = playtestRoster([
            {
                slot: { id: "a", label: "First", startAt: "2030-10-02" },
                votes: [{ userId: "uuid", username: "Luke", status: "available", modePreference: "Either" }]
            },
            {
                slot: { id: "b", label: "Second", startAt: "2030-10-03" },
                votes: [{ userId: "uuid", username: "Luke", status: "unavailable", modePreference: "Battle Royale" }]
            }
        ]);
        expect(rows).toHaveLength(2);
        expect(rows[1].status).toBe("unavailable");
        expect(rosterCsv(rows)).toContain('"uuid","Luke"');
    });
    it("quotes CSV and neutralizes spreadsheet formulas without dropping names", () => {
        const csv = rosterCsv([{ username: ' =HYPERLINK("danger")\nName', userId: "id" }]);
        expect(csv).toContain('"\' =HYPERLINK(""danger"")\nName"');
    });
});
