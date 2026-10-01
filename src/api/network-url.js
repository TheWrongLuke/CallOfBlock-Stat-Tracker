export function networkApiUrl(path, baseUrl = globalThis.window?.COB_NETWORK_STATS_API_URL) {
    const base = new URL(baseUrl);
    if (
        (base.protocol !== "https:" &&
            !(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname))) ||
        base.username ||
        base.password ||
        base.search ||
        base.hash
    )
        throw new Error("Secure credential-free tracking URL required.");
    if (!/^\/(?:network|account|admin)\//.test(path) || path.includes("\\") || /(?:^|\/)\.\.?(?:\/|$)/.test(path))
        throw new Error("Invalid tracking API path.");
    base.pathname = base.pathname.replace(/\/+$/, "") + "/";
    return new URL(path.slice(1), base);
}
