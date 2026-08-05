import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { createMatchDetailApi } from "../../src/match/match-detail-api.js";
import {
    mapCoordinateToPercent,
    normalizeMatchTelemetry,
    validateMatchTelemetry
} from "../../src/match/match-telemetry-normalizer.js";
import { buildMeaningfulMoments, MatchPlaybackController } from "../../src/match/match-playback-controller.js";
import { createReplayApi, validateReplayFile } from "../../src/match/replay-downloads.js";

async function fixture(id) {
    const source = await readFile(new URL(`../../data/match-telemetry/${id}.json`, import.meta.url), "utf8");
    return JSON.parse(source);
}

describe("match telemetry normalization", () => {
    it("normalizes a complete match and preserves unavailable values", async () => {
        const telemetry = normalizeMatchTelemetry(await fixture("fixture-partial"), "fixture-partial");

        expect(telemetry.events.map((event) => event.eventId)).toEqual(["match-start-1", "match-end-1"]);
        expect(telemetry.snapshots[0].players[0].health).toBeNull();
        expect(telemetry.snapshots[0].players[0].armor).toBeNull();
        expect(telemetry.result.mvp).toBeNull();
        expect(telemetry.warnings).toContain("Skipped invalid event 2.");
        expect(validateMatchTelemetry(telemetry).valid).toBe(true);
    });

    it("rejects incomplete, unsupported, and mismatched documents", async () => {
        const source = await fixture("fixture-br");

        expect(() => normalizeMatchTelemetry({ ...source, status: "recording" }, "fixture-br")).toThrow(
            "has not published completed telemetry"
        );
        expect(() => normalizeMatchTelemetry({ ...source, telemetryVersion: 2 }, "fixture-br")).toThrow(
            "Unsupported telemetry version"
        );
        expect(() => normalizeMatchTelemetry(source, "another-match")).toThrow("does not match");
    });

    it("converts calibrated world coordinates and reports points outside bounds", async () => {
        const telemetry = normalizeMatchTelemetry(await fixture("fixture-br"), "fixture-br");
        const center = mapCoordinateToPercent(telemetry.map, -48.5, -40.5);
        const outside = mapCoordinateToPercent(telemetry.map, 500, -40.5);

        expect(center).toEqual({ x: 50, y: 50, outsideBounds: false });
        expect(outside).toEqual({ x: 100, y: 50, outsideBounds: true });
    });

    it("preserves lifecycle fields and discrete death-to-respawn snapshots", async () => {
        const source = await fixture("fixture-dm");
        source.events[0].phase = "active";
        const elimination = source.events.find((event) => event.type === "elimination");
        const respawn = source.events.find((event) => event.type === "respawn");
        respawn.remainingRespawns = 2;
        source.snapshots.push({
            ...source.snapshots.find((snapshot) => snapshot.snapshotId === elimination.snapshotId),
            snapshotId: "snapshot-dead-gap",
            timeMs: 7_000,
            reason: "periodic",
            players: source.snapshots
                .find((snapshot) => snapshot.snapshotId === elimination.snapshotId)
                .players.filter((player) => player.playerId !== "p_alpha")
        });
        source.result.participants[0] = {
            ...source.result.participants[0],
            alive: true,
            eliminated: false,
            eliminatedAtMs: null,
            finalPlacement: 1
        };

        const telemetry = normalizeMatchTelemetry(source, "fixture-dm");
        const deadGap = telemetry.snapshots.find((snapshot) => snapshot.snapshotId === "snapshot-dead-gap");
        const respawnSnapshot = telemetry.snapshots.find((snapshot) => snapshot.snapshotId === respawn.snapshotId);

        expect(telemetry.events[0].phase).toBe("active");
        expect(telemetry.events.find((event) => event.type === "respawn").remainingRespawns).toBe(2);
        expect(deadGap.players.some((player) => player.playerId === "p_alpha")).toBe(false);
        expect(respawnSnapshot.players.find((player) => player.playerId === "p_alpha")?.alive).toBe(true);
        expect(telemetry.result.participants[0]).toMatchObject({
            alive: true,
            eliminated: false,
            eliminatedAtMs: null,
            finalPlacement: 1
        });
    });

    it("removes transient vehicle-like entities from older recordings", async () => {
        const source = await fixture("fixture-br");
        source.snapshots[0].vehicles.push(
            {
                vehicleId: "tow-1",
                vehicleType: "superbwarfare:tow",
                x: 0,
                y: 64,
                z: 0
            },
            {
                vehicleId: "decoy-1",
                vehicleType: "superbwarfare:smoke_decoy",
                x: 0,
                y: 64,
                z: 0
            },
            {
                vehicleId: "flyby-1",
                vehicleType: "brcontrol:fly_by_carrier",
                x: 0,
                y: 64,
                z: 0
            }
        );

        const telemetry = normalizeMatchTelemetry(source, "fixture-br");
        expect(telemetry.snapshots[0].vehicles.map((vehicle) => vehicle.vehicleId)).toEqual(["vehicle-tank-1"]);
    });

    it("accepts Duel and Zombie Survival lifecycle telemetry without mixing their mode identifiers", async () => {
        const base = await fixture("fixture-partial");
        const duel = normalizeMatchTelemetry(
            {
                ...base,
                matchId: "fixture-duel",
                mode: "duel",
                events: [
                    { eventId: "duel-start", type: "duel_match_start", timeMs: 0 },
                    {
                        eventId: "round-start",
                        type: "round_start",
                        timeMs: 1_000,
                        roundNumber: 2,
                        teamAScore: 1,
                        teamBScore: 0
                    },
                    { eventId: "duel-end", type: "duel_match_end", timeMs: 2_000 }
                ]
            },
            "fixture-duel"
        );
        const zombie = normalizeMatchTelemetry(
            {
                ...base,
                matchId: "fixture-zombie",
                mode: "zombieSurvival",
                events: [
                    { eventId: "survival-start", type: "survival_timer_start", timeMs: 0 },
                    {
                        eventId: "population",
                        type: "population_pressure",
                        timeMs: 1_000,
                        activeZombieCount: 18,
                        dynamicZombieTarget: 24,
                        runtimePopulationCap: 100
                    },
                    { eventId: "survival-end", type: "zombie_survival_match_end", timeMs: 2_000 }
                ]
            },
            "fixture-zombie"
        );

        expect(duel.mode).toBe("duel");
        expect(duel.events[1]).toMatchObject({ roundNumber: 2, teamAScore: 1, teamBScore: 0 });
        expect(zombie.mode).toBe("zombieSurvival");
        expect(zombie.events[1]).toMatchObject({
            activeZombieCount: 18,
            dynamicZombieTarget: 24,
            runtimePopulationCap: 100
        });
    });
});

describe("match tactical playback", () => {
    it("starts in skip-idle mode and excludes isolated single-hit engagements", async () => {
        const telemetry = normalizeMatchTelemetry(await fixture("fixture-br"), "fixture-br");
        const moments = buildMeaningfulMoments(telemetry);
        const controller = new MatchPlaybackController(telemetry);

        expect(controller.state().skipIdle).toBe(true);
        expect(moments.some((moment) => moment.id === "engagement-1")).toBe(false);
        expect(moments.find((moment) => moment.id === "engagement-2")?.startMs).toBe(22_000);
        expect(moments.find((moment) => moment.id === "engagement-3")?.startMs).toBe(43_000);
        controller.destroy();
    });

    it("keeps playing while event filters and skip-idle mode are changed", async () => {
        vi.useFakeTimers();
        const telemetry = normalizeMatchTelemetry(await fixture("fixture-br"), "fixture-br");
        const controller = new MatchPlaybackController(telemetry);

        controller.play();
        controller.setFilter("vehicles", false);
        expect(controller.state().playing).toBe(true);
        controller.setSkipIdle(false);
        expect(controller.state().playing).toBe(true);

        controller.destroy();
        vi.useRealTimers();
    });

    it("supports full snapshots, speed, filters, timeline seeking, and event selection", async () => {
        const telemetry = normalizeMatchTelemetry(await fixture("fixture-br"), "fixture-br");
        const controller = new MatchPlaybackController(telemetry);

        controller.setSpeed(2);
        expect(controller.state().speed).toBe(2);

        controller.setFilter("vehicles", false);
        expect(controller.state().filters.vehicles).toBe(false);
        expect(controller.sequence.some((moment) => moment.id === "vehicle-destroyed-1")).toBe(false);

        controller.selectEvent("elimination-1");
        expect(controller.state().snapshot.timeMs).toBe(28_000);
        expect(controller.state().currentEventId).toBe("elimination-1");

        controller.setSkipIdle(false);
        expect(controller.sequence).toHaveLength(telemetry.snapshots.length);
        controller.seek(34_000);
        expect(controller.state().snapshot.snapshotId).toBe("snapshot-10");
        controller.destroy();
    });

    it("interpolates continuously between recorded snapshots", async () => {
        vi.useFakeTimers();
        const telemetry = normalizeMatchTelemetry(await fixture("fixture-br"), "fixture-br");
        const controller = new MatchPlaybackController(telemetry);
        const first = telemetry.snapshots[0].players.find((player) => player.playerId === "p_alpha");
        const second = telemetry.snapshots[1].players.find((player) => player.playerId === "p_alpha");

        controller.setSkipIdle(false);
        controller.seek(1000);
        const midpoint = controller.state().snapshot.players.find((player) => player.playerId === "p_alpha");
        expect(controller.state().snapshot.timeMs).toBe(1000);
        expect(midpoint.x).toBeCloseTo((first.x + second.x) / 2);
        expect(midpoint.z).toBeCloseTo((first.z + second.z) / 2);

        controller.seek(0);
        controller.play();
        await vi.advanceTimersByTimeAsync(512);
        expect(controller.state().snapshot.timeMs).toBeGreaterThan(400);
        expect(controller.state().snapshot.timeMs).toBeLessThan(650);

        controller.destroy();
        vi.useRealTimers();
    });

    it("shows a hit or elimination line for one second of replay time", async () => {
        const telemetry = normalizeMatchTelemetry(await fixture("fixture-br"), "fixture-br");
        const controller = new MatchPlaybackController(telemetry);

        controller.setSkipIdle(false);
        controller.seek(26_999);
        expect(controller.state().combatEvent?.eventId).toBe("damage-4");
        controller.seek(27_000);
        expect(controller.state().combatEvent).toBeNull();

        controller.seek(28_999);
        expect(controller.state().combatEvent?.eventId).toBe("elimination-1");
        controller.seek(29_000);
        expect(controller.state().combatEvent).toBeNull();

        controller.seek(28_500);
        controller.setFilter("eliminations", false);
        expect(controller.state().combatEvent).toBeNull();
        controller.destroy();
    });

    it("restores a Deathmatch player at the recorded respawn snapshot", async () => {
        const telemetry = normalizeMatchTelemetry(await fixture("fixture-dm"), "fixture-dm");
        const controller = new MatchPlaybackController(telemetry);

        controller.selectEvent("respawn-1");
        const alpha = controller.state().snapshot.players.find((player) => player.playerId === "p_alpha");
        expect(alpha.alive).toBe(true);
        expect(alpha.health).toBe(20);
        controller.destroy();
    });
});

describe("match detail loading", () => {
    it("loads from the public telemetry view and caches immutable completed data", async () => {
        const payload = await fixture("fixture-br");
        const maybeSingle = vi.fn().mockResolvedValue({ data: { payload }, error: null });
        const eq = vi.fn(() => ({ maybeSingle }));
        const select = vi.fn(() => ({ eq }));
        const from = vi.fn(() => ({ select }));
        const api = createMatchDetailApi({ supabaseClient: { from }, fetchImpl: vi.fn() });

        const first = await api.load("fixture-br");
        const second = await api.load("fixture-br");

        expect(first).toBe(second);
        expect(from).toHaveBeenCalledTimes(1);
        expect(eq).toHaveBeenCalledWith("match_id", "fixture-br");
    });

    it("falls back to the static deterministic fixture without refetching stats", async () => {
        const payload = await fixture("fixture-dm");
        const fetchImpl = vi.fn(async (url) => ({
            ok: String(url).endsWith("/data/match-telemetry/fixture-dm.json"),
            status: 200,
            json: async () => payload
        }));
        const api = createMatchDetailApi({ fetchImpl });

        const result = await api.load("fixture-dm");

        expect(result.matchId).toBe("fixture-dm");
        expect(fetchImpl).toHaveBeenCalledOnce();
        expect(String(fetchImpl.mock.calls[0][0])).toContain("data/match-telemetry/fixture-dm.json");
    });
});

describe("Replay Mod client validation", () => {
    it("accepts an .mcpr ZIP signature and rejects invalid files", async () => {
        const valid = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x01])], "match.mcpr");
        const wrongExtension = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], "match.zip");
        const wrongSignature = new File([new Uint8Array([0x00, 0x01, 0x02, 0x03])], "match.mcpr");

        await expect(validateReplayFile(valid, 100)).resolves.toBe(true);
        await expect(validateReplayFile(wrongExtension, 100)).rejects.toThrow(".mcpr extension");
        await expect(validateReplayFile(wrongSignature, 100)).rejects.toThrow("valid ZIP container");
        await expect(validateReplayFile(valid, 2)).rejects.toThrow("upload limit");
    });

    it("uploads through a short-lived private signed target before trusted finalization", async () => {
        const uploadToSignedUrl = vi.fn().mockResolvedValue({ data: { path: "pending/test.mcpr" }, error: null });
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    replayId: "replay-1",
                    bucket: "match-replays",
                    path: "pending/test.mcpr",
                    token: "short-lived-upload-token"
                })
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ replayId: "replay-1", sha256: "abc" })
            });
        vi.stubGlobal("fetch", fetchMock);
        const client = {
            auth: {
                getSession: vi.fn().mockResolvedValue({
                    data: { session: { access_token: "user-jwt" } }
                })
            },
            storage: {
                from: vi.fn(() => ({ uploadToSignedUrl }))
            }
        };
        const api = createReplayApi({
            supabaseClient: client,
            supabaseUrl: "https://test.supabase.co",
            supabaseKey: "publishable-key"
        });
        const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x01])], "match.mcpr");

        const result = await api.upload("fixture-br", file, {
            label: "Admin perspective",
            visibility: "participants"
        });

        expect(result.sha256).toBe("abc");
        expect(client.storage.from).toHaveBeenCalledWith("match-replays");
        expect(uploadToSignedUrl).toHaveBeenCalledWith("pending/test.mcpr", "short-lived-upload-token", file, {
            contentType: "application/octet-stream"
        });
        const beginBody = JSON.parse(fetchMock.mock.calls[0][1].body);
        const finalizeBody = JSON.parse(fetchMock.mock.calls[1][1].body);
        expect(beginBody.action).toBe("begin_upload");
        expect(beginBody.fileSize).toBe(file.size);
        expect(finalizeBody).toEqual({ action: "finalize_upload", replayId: "replay-1" });
        vi.unstubAllGlobals();
    });
});
