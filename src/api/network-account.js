import { networkApiUrl } from "./network-url.js";
export async function networkAccountRequest(client, action, missionId) {
    const baseUrl = globalThis.window?.COB_NETWORK_STATS_API_URL;
    if (!baseUrl)
        return globalThis.window?.COB_STATS_ENVIRONMENT === "TEST"
            ? {
                  data: null,
                  error: new Error("TEST account tracking is not configured.")
              }
            : null;
    if (globalThis.window?.COB_STATS_ENVIRONMENT !== "TEST")
        return {
            data: null,
            error: new Error("TEST account tracking configuration is required.")
        };
    try {
        const { data, error } = await client.auth.getSession();
        if (error || !data?.session?.access_token)
            return {
                data: null,
                error: error || new Error("Sign in to your account.")
            };
        const base = new URL(baseUrl);
        if (
            base.protocol !== "https:" &&
            !(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname))
        )
            throw new Error("Secure tracking URL required.");
        const read = action === "read" || action === "linkStatus";
        const url = networkApiUrl(
            action === "linkStatus" || action === "linkCode"
                ? `/account/link${action === "linkCode" ? "/code" : ""}`
                : action === "customize"
                  ? "/account/customization"
                  : `/account/missions${action === "read" ? "" : `/${action}`}`,
            base.href
        );
        const options = {
            method: read ? "GET" : "POST",
            cache: "no-store",
            headers: {
                Authorization: `Bearer ${data.session.access_token}`,
                "Content-Type": "application/json"
            },
            ...(read
                ? {}
                : {
                      body: JSON.stringify(
                          action === "linkCode"
                              ? {}
                              : action === "customize"
                                ? { preferences: missionId }
                                : { missionId }
                      )
                  })
        };
        let response, body;
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                response = await fetch(url, { ...options, signal: AbortSignal.timeout(20_000) });
                body = await response.json();
                if (action !== "claim" || attempt || ![409, 503].includes(response.status)) break;
            } catch (error) {
                if (action !== "claim" || attempt) throw error;
            }
            // UUID + assignment identity makes a lost-response retry safe even after commit.
            await new Promise((resolve) => setTimeout(resolve, 350));
        }
        return response.ok
            ? { data: body, error: null }
            : {
                  data: null,
                  error: new Error(body.error || "Account tracking unavailable.")
              };
    } catch (error) {
        return { data: null, error };
    }
}
