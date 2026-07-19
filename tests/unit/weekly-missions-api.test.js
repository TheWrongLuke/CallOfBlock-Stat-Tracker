import { describe, expect, it, vi } from "vitest";
import { claimWeeklyMissionReward, ensureWeeklyMissions, swapWeeklyMission } from "../../src/api/weekly-missions.js";

describe("weekly mission API", () => {
    it("loads assignments from the server-owned mission RPC", async () => {
        const row = { user_id: "profile-1", cycle_key: "2026-07-13", missions: [] };
        const rpc = vi.fn().mockResolvedValue({ data: row, error: null });

        const result = await ensureWeeklyMissions({ rpc });

        expect(rpc).toHaveBeenCalledWith("ensure_weekly_missions_v2");
        expect(result.data).toEqual(row);
    });

    it("claims and swaps by mission ID without sending trusted mission data", async () => {
        const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });

        await claimWeeklyMissionReward({ rpc }, "mission-1");
        await swapWeeklyMission({ rpc }, "mission-2");

        expect(rpc).toHaveBeenNthCalledWith(1, "claim_weekly_mission_v2", {
            p_mission_id: "mission-1"
        });
        expect(rpc).toHaveBeenNthCalledWith(2, "swap_weekly_mission_v2", {
            p_mission_id: "mission-2"
        });
    });
});
