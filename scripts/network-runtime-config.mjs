export function publicNetworkRuntime(env = {}) {
    const environment = String(env.COB_STATS_ENVIRONMENT || "").trim();
    const endpoint = String(env.COB_NETWORK_STATS_API_URL || "").trim();
    if (!environment && !endpoint) return "";
    if (environment !== "TEST" || !endpoint)
        throw new Error("Explicit TEST environment and network API URL are required together.");
    let url;
    try {
        url = new URL(endpoint);
    } catch {
        throw new Error("Invalid public network API URL.");
    }
    const loopback = ["localhost", "127.0.0.1"].includes(url.hostname);
    if (
        (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
    ) {
        throw new Error("Secure credential-free public network API URL required.");
    }
    return `\nwindow.COB_STATS_ENVIRONMENT = "TEST";\nwindow.COB_NETWORK_STATS_API_URL = ${JSON.stringify(url.href.replace(/\/+$/, ""))};\n`;
}
