import { describe, expect, it } from "vitest";
import { renderWeeklyMissionPanel } from "../../src/core/weekly-mission-view.js";

const mission = {
    id: "kill-10",
    label: "Ten kills",
    description: "Play normally",
    difficulty: "easy",
    xp: 500,
    metric: "kills",
    serverProgress: { value: 3, target: 10, progress: 0.3, complete: false }
};
const row = { missions: [mission], claimed_ids: [], cycle_ends_at: "2026-10-05T00:00:00Z" };
describe("one mission display for every account panel", () => {
    it("uses identical visible content/progress regardless of event adapter", () => {
        const source = { row, statsProfile: {}, message: "Saved progress" };
        const stats = renderWeeklyMissionPanel(source);
        const home = renderWeeklyMissionPanel({ ...source, actionPrefix: "home-weekly" });
        expect(home.replaceAll("data-home-weekly-", "data-weekly-")).toBe(stats);
        expect(stats).toContain("width: 30%");
        expect(stats).toContain("3 / 10");
    });
    it("retains mission rows but never shows a fabricated zero when stats are unavailable", () => {
        const html = renderWeeklyMissionPanel({ row, statsProfile: null });
        expect(html).toContain("Ten kills");
        expect(html).toContain("Progress unavailable");
        expect(html).not.toContain('class="mission-progress"');
        expect(html).not.toContain("data-weekly-claim");
    });
    it("respects eligibility and claim state without changing account ownership", () => {
        const complete = {
            ...row,
            missions: [{ ...mission, serverProgress: { ...mission.serverProgress, complete: true } }]
        };
        const html = renderWeeklyMissionPanel({ row: complete, statsProfile: {}, actionsEnabled: false });
        expect(html).toMatch(/data-weekly-claim="kill-10" disabled/);
        expect(
            renderWeeklyMissionPanel({ row: { ...complete, claimed_ids: [mission.id] }, statsProfile: {} })
        ).toContain("Claimed</span>");
        expect(renderWeeklyMissionPanel({ row, loading: true, statsProfile: {} })).toContain("width: 30%");
    });
    it("escapes user-controlled definitions and restricts action attributes", () => {
        const html = renderWeeklyMissionPanel({
            row: { ...row, missions: [{ ...mission, label: '<img onerror="bad">' }] }
        });
        expect(html).toContain("&lt;img");
        expect(html).not.toContain('<img onerror="bad">');
        expect(() => renderWeeklyMissionPanel({ actionPrefix: 'onclick="bad"' })).toThrow("Unknown");
    });
});
