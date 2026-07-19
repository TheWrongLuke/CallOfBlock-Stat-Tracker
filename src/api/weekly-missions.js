function rpcObject(data) {
    return Array.isArray(data) ? data[0] || null : data || null;
}

export async function ensureWeeklyMissions(client) {
    if (!client?.rpc) return { data: null, error: new Error("A Supabase client is required.") };
    const result = await client.rpc("ensure_weekly_missions_v2");
    return { ...result, data: rpcObject(result.data) };
}

export async function claimWeeklyMissionReward(client, missionId) {
    if (!client?.rpc) return { data: null, error: new Error("A Supabase client is required.") };
    const result = await client.rpc("claim_weekly_mission_v2", { p_mission_id: missionId });
    return { ...result, data: rpcObject(result.data) };
}

export async function swapWeeklyMission(client, missionId) {
    if (!client?.rpc) return { data: null, error: new Error("A Supabase client is required.") };
    const result = await client.rpc("swap_weekly_mission_v2", { p_mission_id: missionId });
    return { ...result, data: rpcObject(result.data) };
}
