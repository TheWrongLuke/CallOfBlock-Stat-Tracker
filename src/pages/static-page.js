import { initializeSiteShell } from "../core/site-shell.js";

export async function initializeStaticPage() {
    await whenReady();
    await initializeSiteShell({ loadStatus: true });
}

function whenReady() {
    if (document.readyState !== "loading") return Promise.resolve();
    return new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
}
