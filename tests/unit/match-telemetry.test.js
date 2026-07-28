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
        const center = mapCoordinateToPercent(telemetry.map, 50, 50);
        const outside = mapCoordinateToPercent(telemetry.map, 140, 50);

        expect(center).toEqual({ x: 50, y: 50, outsideBounds: false });
        expect(outside).toEqual({ x: 100, y: 50, outsideBounds: true });
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

    it("supports full snapshots, speed, filters, timeline seeking, and event selection", async () => {
        const telemetry = normalizeMatchTelemetry(await fixture("fixture-br"), "fixture-br");
        const controller = new MatchPlaybackController(telemetry);

        controller.setSpeed(2);
        expect(controller.state().speed).toBe(2);

        controller.setFilter("vehicles", false);
        expect(controller.state().filters.vehicles).toBe(false);
        expect(controller.sequence.some((moment) => moment.id === "vehicle-destroyed-1")).toBe(false);

        controller.selectEvent("elimination-1");
        expect(controller.state().snapshot.timeMs).toBe(22_000);
        expect(controller.state().currentEventId).toBe("elimination-1");

        controller.setSkipIdle(false);
        expect(controller.sequence).toHaveLength(telemetry.snapshots.length);
        controller.seek(34_000);
        expect(controller.state().snapshot.snapshotId).toBe("snapshot-10");
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
