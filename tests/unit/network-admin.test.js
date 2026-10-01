import { afterEach, expect, it, vi } from "vitest";
import { ADMIN_ROUTES, adminRedirect } from "../../src/core/admin-routes.js";
import { createNetworkAdminApi } from "../../src/api/network-admin.js";
import { renderVoidImpact, renderMatchDetail, renderMatchList } from "../../src/pages/admin-matches.js";
afterEach(() => vi.unstubAllGlobals());
it("legacy admin links redirect under Admin and never loop", () => {
    for (const [route, path] of Object.entries(ADMIN_ROUTES)) {
        expect(adminRedirect(route, "/stats/", `#${route}`)).toBe(path);
        expect(adminRedirect(route, "/stats/", `#view=${route}`)).toBe(path);
        expect(adminRedirect(route, path)).toBeNull();
    }
    expect(adminRedirect("account", "/stats/")).toBeNull();
    expect(adminRedirect("admin-tickets", "/stats/", "#view=admin-tickets&status=open")).toBe(
        "/admin/tickets/#view=admin-tickets&status=open"
    );
});
it("admin client uses verified token and explicit confirmation with no fallback", async () => {
    vi.stubGlobal("window", { COB_STATS_ENVIRONMENT: "TEST" });
    const client = { auth: { getSession: async () => ({ data: { session: { access_token: "token" } } }) } };
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: "COMMITTED" }) });
    const api = createNetworkAdminApi(client, { baseUrl: "https://tracking.example", fetcher });
    const id = "90000000-0000-4000-8000-000000000050";
    await api.preview(id, "VOIDED");
    await api.confirm(id, "signed", "reason");
    expect(fetcher.mock.calls[1][1].headers.Authorization).toBe("Bearer token");
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
        confirmation: "signed",
        confirmed: true,
        reason: "reason"
    });
    fetcher.mockResolvedValue({ ok: false, json: async () => ({ error: "Preview changed" }) });
    await expect(api.confirm(id, "signed", "reason")).rejects.toThrow("Preview changed");
    expect(() => api.detail("../../etc")).toThrow("UUID");
});
it("raw admin results and preview escape player data and show unavailable replay", () => {
    const frame = {
        match: { match_id: "id", server_id: "arena-01", mode: "freeForAll", map_id: "raid", state: "COMPLETED" },
        players: [{ name: "<script>", playerUuid: "uuid", raw: { kills: 5 }, contribution: { kills: 5 } }],
        replays: [],
        incidents: [],
        operations: [],
        finalization: {}
    };
    expect(renderMatchDetail(frame)).toContain("Replay unavailable");
    expect(renderMatchDetail(frame)).not.toContain("<script>");
    const impact = {
        matchId: "id",
        targetState: "VOIDED",
        history: { beforeVisible: true, afterVisible: false },
        replay: { beforeVisible: true, afterVisible: false, artifactCount: 0 },
        players: [
            {
                name: "<script>",
                playerUuid: "uuid",
                stats: [{ field: "freeForAll.kills", before: 5, after: 0, delta: -5 }],
                achievementIds: { removed: [], added: [] },
                progression: null
            }
        ]
    };
    expect(renderVoidImpact(impact)).toContain("-5");
    expect(renderVoidImpact(impact)).toContain("&lt;script&gt;");
    expect(
        renderMatchList({ matches: [{ ...frame.match, player_count: 1, retries: 1, reconnect_incidents: 2 }] })
    ).toContain("1 retries");
});
