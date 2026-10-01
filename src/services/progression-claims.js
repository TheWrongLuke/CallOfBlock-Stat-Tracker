function missingRpc(error, functionName) {
    const code = String(error?.code || "");
    const message = String(error?.message || "");
    return ["42883", "PGRST202"].includes(code) || new RegExp(`could not find.*${functionName}`, "i").test(message);
}

export async function claimCanonicalProgressionCosmetics(client) {
    if (globalThis.window?.COB_NETWORK_STATS_API_URL) {
        const result = await networkAccountRequest(client, "read");
        // The private reducer earns reversible cosmetics automatically; no legacy claim RPC.
        return { data: result?.error ? null : [], error: result?.error || null, projection: result?.data || null };
    }
    if (!client?.rpc) return { data: [], error: new Error("A Supabase client is required.") };

    const canonical = await client.rpc("claim_progression_cosmetics_v2");
    if (!canonical.error || !missingRpc(canonical.error, "claim_progression_cosmetics_v2")) {
        return canonical;
    }
    return client.rpc("claim_progression_cosmetics");
}
import { networkAccountRequest } from "../api/network-account.js";
