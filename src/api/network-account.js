import { networkApiUrl } from "./network-url.js";
export async function networkAccountRequest(client, action, missionId) {
    const baseUrl = globalThis.window?.COB_NETWORK_STATS_API_URL;
    if (!baseUrl)
        return globalThis.window?.COB_STATS_ENVIRONMENT === "TEST"
            ? { data: null, error: new Error("TEST account tracking is not configured.") }
            : null;
    if (globalThis.window?.COB_STATS_ENVIRONMENT !== "TEST")
        return { data: null, error: new Error("TEST account tracking configuration is required.") };
    try {
        const { data, error } = await client.auth.getSession();
        if (error || !data?.session?.access_token)
            return { data: null, error: error || new Error("Sign in to your account.") };
        const base = new URL(baseUrl);
        if (
            base.protocol !== "https:" &&
            !(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname))
        )
            throw new Error("Secure tracking URL required.");
        const url = networkApiUrl(
            action === "customize"
                ? "/account/customization"
                : `/account/missions${action === "read" ? "" : `/${action}`}`,
            base.href
        );
        const response = await fetch(url, {
            method: action === "read" ? "GET" : "POST",
            cache: "no-store",
            headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
            ...(action === "read"
                ? {}
                : { body: JSON.stringify(action === "customize" ? { preferences: missionId } : { missionId }) })
        });
        const body = await response.json();
        return response.ok
            ? { data: body, error: null }
            : { data: null, error: new Error(body.error || "Account tracking unavailable.") };
    } catch (error) {
        return { data: null, error };
    }
}
