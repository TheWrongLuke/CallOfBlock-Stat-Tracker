import { createReplayApi } from "../match/replay-downloads.js";
import { networkApiUrl } from "./network-url.js";
export function createNetworkAdminApi(
    client,
    { baseUrl = globalThis.window?.COB_NETWORK_STATS_API_URL, fetcher = fetch } = {}
) {
    async function request(path, body) {
        if (!baseUrl || globalThis.window?.COB_STATS_ENVIRONMENT !== "TEST")
            throw new Error("TEST match administration is not configured.");
        const base = new URL(baseUrl);
        if (
            base.protocol !== "https:" &&
            !(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname))
        )
            throw new Error("Secure API URL required.");
        const { data, error } = await client.auth.getSession();
        if (error || !data?.session?.access_token) throw new Error("Sign in to your administrator account.");
        const response = await fetcher(networkApiUrl(`/admin/matches${path}`, base.href), {
            method: body ? "POST" : "GET",
            cache: "no-store",
            headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
            ...(body ? { body: JSON.stringify(body) } : {}),
            signal: AbortSignal.timeout(30000)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Match administration unavailable.");
        return result;
    }
    const matchPath = (id) => {
        if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)) throw new Error("Full match UUID required.");
        return `/${id}`;
    };
    return {
        list: ({ limit = 50, before = null, search = "" } = {}) =>
            request(
                `?${new URLSearchParams({ limit: String(limit), search, ...(before ? { before: JSON.stringify(before) } : {}) })}`
            ),
        detail: (id) => request(matchPath(id)),
        accountLinks: () => request("/accounts"),
        linkAccount: (accountId, playerUuid) => request("/accounts/link", { accountId, playerUuid, confirmed: true }),
        replay: (id, artifactId) => request(`${matchPath(id)}/replay${artifactId ? matchPath(artifactId) : ""}`),
        uploadRecording: (id, file, metadata) =>
            createReplayApi({ supabaseClient: client, adminMatchId: id }).upload(id, file, metadata),
        downloadRecording: (id, artifactId) =>
            createReplayApi({ supabaseClient: client, adminMatchId: id }).requestDownload(artifactId),
        preview: (id, target) => request(`${matchPath(id)}/preview`, { target }),
        confirm: (id, confirmation, reason) =>
            request(`${matchPath(id)}/confirm`, { confirmation, confirmed: true, reason })
    };
}
