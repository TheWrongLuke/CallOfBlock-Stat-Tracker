import { describe, it, expect, vi, afterEach } from "vitest";
import { createProgressionAdminApi } from "../../src/api/progression.js";
import { renderPlayerManagerContent } from "../../src/views/player-manager.js";
const uuid = "10000000-0000-4000-8000-000000000001";
const item = { type: "title", id: "tester" };
const player = {
    player_uuid: uuid,
    account_id: null,
    display_name: "Minecraft Only",
    minecraft_player_name: "MinecraftOnly",
    xp: 500,
    level: 1,
    entitlements: [item],
    entitlement_sources: { [JSON.stringify([item.type, item.id])]: { sources: ["gift:event"] } },
    missions: { a: { value: 10, target: 10, complete: true } },
    mission_assignments: { a: { mission: { title: "Ten kills" } } },
    achievements: ["first_win"],
    revocations: []
};
afterEach(() => vi.unstubAllGlobals());
describe("UUID Player Manager", () => {
    it("merges Minecraft-only and linked directory rows without duplicate accounts", async () => {
        vi.stubGlobal("window", { COB_STATS_ENVIRONMENT: "TEST" });
        const linked = { ...player, player_uuid: "10000000-0000-4000-8000-000000000002", account_id: "account" };
        const client = {
            rpc: vi
                .fn()
                .mockResolvedValue({ data: [{ id: "account", display_name: "Website", is_owner: true }], error: null })
        };
        const network = { players: vi.fn().mockResolvedValue([player, linked]) };
        const api = createProgressionAdminApi(client, { network });
        const result = await api.listManagedPlayers();
        expect(result.error).toBeNull();
        expect(result.data).toHaveLength(2);
        expect(result.data.find((p) => p.id === uuid)).toMatchObject({ uuid_owned: true, account_id: null, xp: 500 });
        expect(result.data.find((p) => p.id === "account")).toMatchObject({
            is_owner: true,
            display_name: "Website",
            player_uuid: linked.player_uuid
        });
    });
    it("retains the same operation identity after a lost response and never falls back on a UUID error", async () => {
        vi.stubGlobal("window", { COB_STATS_ENVIRONMENT: "TEST" });
        const client = { rpc: vi.fn() };
        const network = {
            players: vi.fn().mockResolvedValue([player]),
            editPlayer: vi
                .fn()
                .mockRejectedValueOnce(new Error("lost response"))
                .mockResolvedValue({ result: "ALREADY_COMMITTED" })
        };
        const api = createProgressionAdminApi(client, { network });
        const grant = { profileId: uuid, cosmeticType: item.type, cosmeticId: item.id, source: "friend", note: "Gift" };
        expect((await api.sendCosmeticGift(grant)).error).toBeTruthy();
        expect((await api.sendCosmeticGift(grant)).uuidOwned).toBe(true);
        expect(network.editPlayer.mock.calls[0]).toEqual(network.editPlayer.mock.calls[1]);
        expect(network.editPlayer.mock.calls[0][1]).toMatchObject({ source: "gift", action: "GRANT" });
        expect(client.rpc).not.toHaveBeenCalled();
    });
    it("shows UUID, progression, badges and safe immediate grant/revocation wording", () => {
        const profile = {
            ...player,
            id: uuid,
            uuid_owned: true,
            player_uuid: uuid,
            mission_progress: player.missions,
            mission_assignments: player.mission_assignments,
            achievement_ids: player.achievements
        };
        const props = {
            ready: true,
            players: [profile],
            selectedId: uuid,
            catalog: [{ ...item, name: "Tester", active: true }],
            grantKey: "title:tester"
        };
        const html = renderPlayerManagerContent(props);
        expect(html).toContain(uuid);
        expect(html).toContain("500");
        expect(html).toContain("Ten kills");
        expect(html).toContain("granted immediately");
        expect(html).not.toContain("Ownership is added only when");
        const revoke = renderPlayerManagerContent({ ...props, grantKey: "", revokeKey: "title:tester" });
        expect(revoke).toContain("until an explicit new grant");
        expect(renderPlayerManagerContent({ ...props, filters: { search: uuid } })).not.toContain("No players match");
    });
});
