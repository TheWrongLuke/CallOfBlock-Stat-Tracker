import { describe, expect, it } from "vitest";
import {
    buildReplayEventDecorations,
    renderReplayEventIcon,
    replayKda,
    groupReplayTimelineEvents
} from "../../src/match/replay-event-icons.js";

const kill = { eventId: "kill", type: "elimination", timeMs: 1000, killerId: "a", victimId: "b", headshot: true };
const round = { eventId: "round", type: "round_end", timeMs: 1050, reason: "Team eliminated" };

describe("replay event presentation", () => {
    it("distinguishes kills, headshots, checkered endings and four inward zone arrows", () => {
        const events = [
            kill,
            { eventId: "end", type: "match_end", timeMs: 10000 },
            { eventId: "zone", type: "zone_phase_changed", timeMs: 500 }
        ];
        const decorations = buildReplayEventDecorations({ events });
        expect(renderReplayEventIcon(kill, decorations.get("kill"))).toContain('class="replay-headshot-dot"');
        expect(renderReplayEventIcon({ ...kill, headshot: false }, decorations.get("kill"))).not.toContain(
            'class="replay-headshot-dot"'
        );
        expect(decorations.get("end").kind).toBe("finish");
        expect(renderReplayEventIcon(events[2], decorations.get("zone"))).toContain('r="2.5"');
        expect(renderReplayEventIcon(events[2], decorations.get("zone"))).toContain("M21 12h-4");
    });
    it("combines a proven round final kill and subsequent Duels ending without mutating raw events", () => {
        const events = [kill, round, { eventId: "end", type: "duel_match_end", timeMs: 5000 }];
        const raw = structuredClone(events);
        const decorations = buildReplayEventDecorations({ events });
        expect(decorations.get("round").mergedInto).toBe("kill");
        expect(decorations.get("end").mergedInto).toBe("kill");
        expect(decorations.get("kill").label).toBe("Final headshot kill - Match complete");
        expect(renderReplayEventIcon(kill, decorations.get("kill"))).toContain("replay-final-flag");
        expect(events).toEqual(raw);
    });
    it("does not guess that timeout, disconnect, environmental or stale kills ended the round", () => {
        for (const reason of ["Timeout", "Disconnected", "", "Draw"]) {
            const decorations = buildReplayEventDecorations({ events: [kill, { ...round, reason }] });
            expect(decorations.get("round").mergedInto).toBeUndefined();
        }
        expect(
            buildReplayEventDecorations({ events: [{ ...kill, killerId: "" }, round] }).get("round").mergedInto
        ).toBeUndefined();
        expect(
            buildReplayEventDecorations({ events: [kill, { ...round, timeMs: 2000 }] }).get("round").mergedInto
        ).toBeUndefined();
    });
    it("does not carry a final-kill flag across the next round or a non-kill round result", () => {
        for (const boundary of [
            { eventId: "next", type: "round_start", timeMs: 2000 },
            { ...round, eventId: "later", timeMs: 2000, reason: "Timeout" }
        ]) {
            const decorations = buildReplayEventDecorations({
                events: [kill, round, boundary, { eventId: "end", type: "duel_match_end", timeMs: 3000 }]
            });
            expect(decorations.get("end").mergedInto).toBeUndefined();
        }
    });
    it("clears a preceding kill when an environmental death ends the round", () => {
        const environmentalDeath = { eventId: "death", type: "player_death", timeMs: 1025 };
        const decorations = buildReplayEventDecorations({ events: [kill, environmentalDeath, round] });
        expect(decorations.get("round").mergedInto).toBeUndefined();
        expect(decorations.get("death").label).toBe("Death");
    });
    it("uses an explicit causal elimination identity when an ending is delayed", () => {
        const decorations = buildReplayEventDecorations({
            events: [kill, { eventId: "end", type: "match_end", timeMs: 8000, eliminationEventId: "kill" }]
        });
        expect(decorations.get("end").mergedInto).toBe("kill");
    });
    it("shows unavailable KDA rather than inventing missing assist counts", () => {
        expect(replayKda({ kills: 5, deaths: 2, assists: 3 })).toBe(4);
        expect(replayKda({ kills: 5, deaths: 0, assists: 3 })).toBe(8);
        for (const assists of [null, undefined, -1, "3"])
            expect(replayKda({ kills: 5, deaths: 2, assists })).toBeNull();
    });
    it("groups nearby events into non-overlapping slots without losing event identities", () => {
        const events = [
            kill,
            { eventId: "hit", type: "damage", timeMs: 1001 },
            round,
            { eventId: "zone", type: "zone_phase_changed", timeMs: 5000 }
        ];
        const decorations = buildReplayEventDecorations({ events });
        const groups = groupReplayTimelineEvents(events, 10000, 320, decorations);
        expect(groups).toHaveLength(2);
        expect(groups[0].events.map((event) => event.eventId)).toEqual(["kill", "hit"]);
        expect(groups.flatMap((group) => group.events)).toHaveLength(3);
        expect(groupReplayTimelineEvents(events, 10000, 20, decorations)).toHaveLength(1);
    });
});
