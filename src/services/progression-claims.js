function missingRpc(error, functionName) {
    const code = String(error?.code || "");
    const message = String(error?.message || "");
    return ["42883", "PGRST202"].includes(code) || new RegExp(`could not find.*${functionName}`, "i").test(message);
}

export async function claimCanonicalProgressionCosmetics(client) {
    if (!client?.rpc) return { data: [], error: new Error("A Supabase client is required.") };

    const canonical = await client.rpc("claim_progression_cosmetics_v2");
    if (!canonical.error || !missingRpc(canonical.error, "claim_progression_cosmetics_v2")) {
        return canonical;
    }
    return client.rpc("claim_progression_cosmetics");
}
