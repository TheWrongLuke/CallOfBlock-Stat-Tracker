import { networkApiUrl } from "./network-url.js";
export function networkTrackerConfigured() {
    return globalThis.window?.COB_STATS_ENVIRONMENT === "TEST" || Boolean(globalThis.window?.COB_NETWORK_STATS_API_URL);
}
export function networkTrackerUrl(slice = "live") {
    if (!networkTrackerConfigured()) return "";
    if (globalThis.window.COB_STATS_ENVIRONMENT !== "TEST") throw new Error("TEST tracker configuration is required.");
    if (!globalThis.window.COB_NETWORK_STATS_API_URL) throw new Error("TEST tracker API is not configured.");
    const base = new URL(globalThis.window.COB_NETWORK_STATS_API_URL);
    if (
        base.protocol !== "https:" &&
        !(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname))
    ) {
        throw new Error("Secure tracker URL required.");
    }
    const suffix =
        slice === "live"
            ? "stats"
            : slice === "home"
              ? "summary"
              : (() => {
                    const index = slice.indexOf(":"),
                        type = slice.slice(0, index),
                        id = slice.slice(index + 1);
                    if (index < 1 || !["mode", "profile", "weapons", "maps"].includes(type))
                        throw new Error("Invalid tracker slice.");
                    return `${type === "mode" ? "modes" : type === "profile" ? "profiles" : type}/${encodeURIComponent(id)}`;
                })();
    return networkApiUrl(`/network/${suffix}`, base.href).href;
}
export async function fetchNetworkTracker(slice, { signal, fetchImpl = globalThis.fetch } = {}) {
    const url = networkTrackerUrl(slice);
    if (!url) return null;
    const response = await fetchImpl(url, { cache: "no-store", signal, headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`TEST tracker returned HTTP ${response.status}.`);
    const payload = await response.json();
    if (payload?.environment !== "TEST" || !payload.modes || !Array.isArray(payload.profiles)) {
        throw new Error("Invalid TEST tracker response.");
    }
    return payload;
}
