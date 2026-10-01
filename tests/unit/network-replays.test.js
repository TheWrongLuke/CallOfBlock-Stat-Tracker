import { afterEach, expect, it, vi } from "vitest";
import { replayFileIdentity, createNetworkReplayApi } from "../../src/api/network-replays.js";
import { createReplayApi } from "../../src/match/replay-downloads.js";
import { renderReplayUploadForm } from "../../src/match/replay-admin-form.js";
import { createHash } from "node:crypto";
const match = "50000000-0000-4000-8000-000000000001",
    player = "50000000-0000-4000-8000-000000000002";
afterEach(() => vi.unstubAllGlobals());
const client = { auth: { getSession: async () => ({ data: { session: { access_token: "token" } } }) } };
it("browser and API use the same full recording UUID identity", async () => {
    const sha = "a".repeat(64),
        bytes = createHash("sha256").update(`cob:replay-file:${match}:${player}:${sha}`).digest().subarray(0, 16);
    bytes[6] = (bytes[6] & 15) | 80;
    bytes[8] = (bytes[8] & 63) | 128;
    const h = bytes.toString("hex"),
        id = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    expect(await replayFileIdentity(match, player, sha)).toBe(id);
    expect(await replayFileIdentity(match, null, sha)).not.toBe(id);
});
it("TEST replay reads never use legacy production RPC or Edge functions", async () => {
    vi.stubGlobal("window", { COB_STATS_ENVIRONMENT: "TEST" });
    const rpc = vi.fn(),
        api = createReplayApi({ supabaseClient: { ...client, rpc } });
    await expect(api.list(match)).rejects.toThrow("TEST replay storage");
    expect(rpc).not.toHaveBeenCalled();
});
it("lost upload response and repeated upload use one immutable recording, with no deletion", async () => {
    vi.stubGlobal("window", { COB_STATS_ENVIRONMENT: "TEST" });
    const calls = [],
        file = new Blob(["fixture"]);
    Object.defineProperty(file, "name", { value: "friend.mcpr" });
    let completed = false;
    const fetcher = vi.fn(async (url, options) => {
        const body = JSON.parse(options.body);
        calls.push(body);
        if (body.action === "begin")
            return {
                ok: true,
                json: async () => ({
                    replayId: body.artifactId,
                    path: "fixture",
                    token: "signed",
                    alreadyCompleted: completed
                })
            };
        completed = true;
        return { ok: true, json: async () => ({ result: "COMMITTED" }) };
    });
    const upload = vi.fn(async () => {
        throw new Error("response lost");
    });
    const api = createNetworkReplayApi({
        client,
        baseUrl: "https://tracking.example",
        fetcher,
        validateFile: async () => true,
        uploadToSignedPath: upload
    });
    await api.upload(match, file, { recorderPlayerUuid: player });
    await api.upload(match, file, { recorderPlayerUuid: player });
    expect(calls[0].artifactId).toBe(calls[2].artifactId);
    expect(calls[1].action).toBe("finalize");
    expect(upload).toHaveBeenCalledTimes(1);
    expect(calls.some((c) => c.action === "delete" || c.action === "abort")).toBe(false);
    await expect(api.remove(calls[0].artifactId)).rejects.toThrow("VOID");
});
it("replay upload form is shared, escapes roster input and exposes UUID recorder selection", () => {
    const html = renderReplayUploadForm({ participants: [{ playerUuid: player, name: "<script>" }] });
    expect(html).toContain('name="recorderPlayerUuid"');
    expect(html).toContain(player);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
});
