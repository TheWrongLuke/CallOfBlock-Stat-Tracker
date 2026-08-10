import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "@playwright/test";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const argumentsMap = new Map(
    process.argv.slice(2).map((argument) => {
        const [key, value = ""] = argument.split("=", 2);
        return [key, value];
    })
);
const baseUrl = normalizedBaseUrl(argumentsMap.get("--base") || "http://127.0.0.1:4174/");
const label = safeFilePart(argumentsMap.get("--label") || "unlabelled");
const idleSeconds = boundedNumber(argumentsMap.get("--idle"), 60, 1, 600);
const settleSeconds = boundedNumber(argumentsMap.get("--settle"), 2, 0, 30);
const profileId = String(argumentsMap.get("--profile") || "").trim();
const matchId = String(argumentsMap.get("--match") || "").trim();
const browserName = String(argumentsMap.get("--browser") || "chromium")
    .trim()
    .toLowerCase();
const browserChannel = String(argumentsMap.get("--channel") || "").trim();
const disableGpu = argumentsMap.has("--disable-gpu");
const outputPath = path.resolve(
    projectRoot,
    argumentsMap.get("--output") || path.join("artifacts", "performance", `${timestampForFile()}-${label}.json`)
);

const routes = [
    { name: "Home", path: "/" },
    { name: "Stats overview", path: "/stats/" },
    { name: "Battle Royale leaderboard", path: "/stats/?mode=battleRoyale&view=players&sort=wins" },
    { name: "Deathmatch leaderboard", path: "/stats/?mode=deathmatch&view=players&sort=wins" },
    { name: "Playtests", path: "/playtests/" },
    { name: "Feedback", path: "/feedback/" },
    { name: "Help", path: "/help/" },
    { name: "About", path: "/about/" }
];
if (profileId) {
    const encodedProfileId = encodeURIComponent(profileId);
    routes.splice(4, 0, {
        name: "Player profile",
        path: `/stats/#player=${encodedProfileId}&tab=overview`
    });
    routes.splice(5, 0, {
        name: "Player history",
        path: `/stats/#player=${encodedProfileId}&tab=history`
    });
}
if (matchId) {
    routes.splice(profileId ? 6 : 4, 0, {
        name: "Match replay",
        path: `/stats/#view=match&match=${encodeURIComponent(matchId)}`
    });
}

const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType) throw new Error(`Unsupported browser '${browserName}'. Use chromium, firefox, or webkit.`);
if (browserChannel && browserName !== "chromium") {
    throw new Error("--channel is supported only with --browser=chromium.");
}
const browser = await browserType.launch({
    headless: !argumentsMap.has("--headed"),
    ...(browserChannel ? { channel: browserChannel } : {}),
    ...(disableGpu && browserName === "chromium" ? { args: ["--disable-gpu"] } : {})
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(installPagePerformanceObservers);

const report = {
    schemaVersion: 1,
    label,
    baseUrl,
    capturedAt: new Date().toISOString(),
    idleSeconds,
    settleSeconds,
    browser: {
        name: browserName,
        channel: browserChannel || "bundled",
        headed: argumentsMap.has("--headed"),
        disableGpu
    },
    pages: []
};

try {
    for (const route of routes) report.pages.push(await auditRoute(context, route));
} finally {
    await context.close();
    await browser.close();
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
printSummary(report, outputPath);

async function auditRoute(context, route) {
    const page = await context.newPage();
    const requests = [];
    const pendingResponses = new Set();
    const failures = [];
    const pageErrors = [];
    const requestStarts = new WeakMap();
    let phase = "initial";

    page.on("pageerror", (error) => pageErrors.push(String(error?.message || error)));
    page.on("request", (request) => requestStarts.set(request, { startedAt: Date.now(), phase }));
    page.on("requestfailed", (request) => {
        failures.push({
            url: request.url(),
            reason: request.failure()?.errorText || "Request failed",
            phase: requestStarts.get(request)?.phase || phase
        });
    });
    page.on("response", (response) => {
        const task = captureResponse(
            response,
            requestStarts.get(response.request()) || { startedAt: Date.now(), phase }
        ).then((entry) => requests.push(entry));
        pendingResponses.add(task);
        task.finally(() => pendingResponses.delete(task));
    });

    const startedAt = Date.now();
    const response = await page.goto(new URL(route.path, baseUrl).toString(), {
        waitUntil: "domcontentloaded",
        timeout: 45_000
    });
    await page.waitForLoadState("load", { timeout: 30_000 }).catch(() => {});
    if (settleSeconds) await page.waitForTimeout(settleSeconds * 1000);
    await page.evaluate(() => {
        const audit = globalThis.__cobPerformanceAudit;
        if (!audit) return;
        audit.frameDurations.length = 0;
        audit.longTasks.length = 0;
    });
    phase = "idle";
    if (idleSeconds) await page.waitForTimeout(idleSeconds * 1000);
    phase = "complete";
    await Promise.allSettled([...pendingResponses]);

    const browserMetrics = await page.evaluate(() => {
        const navigation = performance.getEntriesByType("navigation")[0];
        const resources = performance.getEntriesByType("resource");
        const audit = globalThis.__cobPerformanceAudit || { frameDurations: [], longTasks: [] };
        const frameDurations = audit.frameDurations.filter((duration) => Number.isFinite(duration));
        return {
            documentTitle: globalThis.document.title,
            route: globalThis.document.body?.dataset.publicRoute || "",
            domNodes: globalThis.document.getElementsByTagName("*").length,
            navigation: navigation
                ? {
                      domContentLoadedMs: round(navigation.domContentLoadedEventEnd),
                      loadMs: round(navigation.loadEventEnd),
                      responseBytes: navigation.transferSize || navigation.encodedBodySize || 0
                  }
                : null,
            resourceTransferBytes: resources.reduce(
                (total, entry) => total + (entry.transferSize || entry.encodedBodySize || 0),
                0
            ),
            longTaskCount: audit.longTasks.length,
            longTaskTotalMs: round(audit.longTasks.reduce((total, duration) => total + duration, 0)),
            longestTaskMs: round(Math.max(0, ...audit.longTasks)),
            frameSampleCount: frameDurations.length,
            framesOver20Ms: frameDurations.filter((duration) => duration > 20).length,
            framesOver50Ms: frameDurations.filter((duration) => duration > 50).length,
            p95FrameMs: percentile(frameDurations, 0.95),
            estimatedRefreshHz: frameDurations.length
                ? Math.round(1000 / Math.max(1, percentile(frameDurations, 0.5)))
                : 0,
            device: collectDeviceProfile(),
            rendering: collectRenderingProfile(),
            publicDataDiagnostics: globalThis.__cobPublicDataDiagnostics || null
        };

        function collectDeviceProfile() {
            const canvas = globalThis.document.createElement("canvas");
            const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
            const debugInfo = gl?.getExtension("WEBGL_debug_renderer_info");
            return {
                userAgent: navigator.userAgent,
                platform: navigator.userAgentData?.platform || navigator.platform || "",
                hardwareConcurrency: navigator.hardwareConcurrency || 0,
                deviceMemoryGb: navigator.deviceMemory || 0,
                devicePixelRatio: globalThis.devicePixelRatio || 1,
                viewport: `${globalThis.innerWidth}x${globalThis.innerHeight}`,
                screen: `${globalThis.screen?.width || 0}x${globalThis.screen?.height || 0}`,
                colorDepth: globalThis.screen?.colorDepth || 0,
                reducedMotion: globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || false,
                connectionType: navigator.connection?.effectiveType || "unknown",
                webglVendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : "unavailable",
                webglRenderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : "unavailable"
            };
        }

        function collectRenderingProfile() {
            const elements = [...globalThis.document.querySelectorAll("body *")];
            let fixedElements = 0;
            let backdropFilterElements = 0;
            let filterElements = 0;
            let largeShadowElements = 0;
            for (const element of elements) {
                const style = globalThis.getComputedStyle(element);
                if (style.position === "fixed") fixedElements += 1;
                if (style.backdropFilter && style.backdropFilter !== "none") backdropFilterElements += 1;
                if (style.filter && style.filter !== "none") filterElements += 1;
                if (style.boxShadow && style.boxShadow !== "none" && element.getBoundingClientRect().width > 500) {
                    largeShadowElements += 1;
                }
            }
            return {
                activeAnimations: globalThis.document
                    .getAnimations()
                    .filter((animation) => animation.playState === "running").length,
                fixedElements,
                backdropFilterElements,
                filterElements,
                largeShadowElements
            };
        }

        function percentile(values, fraction) {
            if (!values.length) return 0;
            const sorted = [...values].sort((left, right) => left - right);
            return round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]);
        }

        function round(value) {
            return Math.round(Number(value || 0) * 100) / 100;
        }
    });
    const apiRequests = requests.filter((entry) => entry.api);
    const result = {
        name: route.name,
        path: route.path,
        status: response?.status() || 0,
        elapsedMs: Date.now() - startedAt,
        requests: {
            total: requests.length,
            initial: requests.filter((entry) => entry.phase === "initial").length,
            idle: requests.filter((entry) => entry.phase === "idle").length,
            apiTotal: apiRequests.length,
            apiInitial: apiRequests.filter((entry) => entry.phase === "initial").length,
            apiIdle: apiRequests.filter((entry) => entry.phase === "idle").length,
            apiResponseBytes: apiRequests.reduce((total, entry) => total + entry.bytes, 0),
            apiMedianMs: percentile(
                apiRequests.map((entry) => entry.durationMs),
                0.5
            ),
            apiP95Ms: percentile(
                apiRequests.map((entry) => entry.durationMs),
                0.95
            ),
            repeatedIdle: repeatedRequests(apiRequests.filter((entry) => entry.phase === "idle"))
        },
        browser: browserMetrics,
        failures,
        pageErrors,
        apiOperations: apiRequests
    };
    await page.close();
    return result;
}

async function captureResponse(response, requestStart) {
    const request = response.request();
    await response.finished().catch(() => {});
    const headers = await response.allHeaders();
    const contentLength = Number(headers["content-length"] || 0);
    const api = isApiUrl(response.url());
    let bytes = Number.isFinite(contentLength) ? contentLength : 0;
    if (api && bytes <= 0) {
        bytes = await response
            .body()
            .then((body) => body.length)
            .catch(() => 0);
    }
    return {
        phase: requestStart.phase,
        api,
        method: request.method(),
        status: response.status(),
        url: redactedUrl(response.url()),
        identity: requestIdentity(request.method(), response.url()),
        durationMs: round(Math.max(0, Date.now() - requestStart.startedAt)),
        bytes
    };
}

function installPagePerformanceObservers() {
    const audit = (globalThis.__cobPerformanceAudit = { frameDurations: [], longTasks: [] });
    try {
        new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) audit.longTasks.push(entry.duration);
        }).observe({ type: "longtask", buffered: true });
    } catch (_error) {
        // Long Task API is not available in every browser engine.
    }
    let previousFrame = 0;
    const sampleFrame = (timestamp) => {
        if (previousFrame) audit.frameDurations.push(timestamp - previousFrame);
        previousFrame = timestamp;
        if (audit.frameDurations.length > 50_000) audit.frameDurations.splice(0, 10_000);
        globalThis.requestAnimationFrame(sampleFrame);
    };
    globalThis.requestAnimationFrame(sampleFrame);
}

function isApiUrl(value) {
    try {
        const url = new URL(value);
        return (
            url.hostname.endsWith(".supabase.co") ||
            url.pathname.startsWith("/rest/v1/") ||
            url.pathname.startsWith("/auth/v1/")
        );
    } catch (_error) {
        return false;
    }
}

function redactedUrl(value) {
    const url = new URL(value);
    for (const key of ["apikey", "token", "access_token", "refresh_token"]) {
        if (url.searchParams.has(key)) url.searchParams.set(key, "[redacted]");
    }
    return url.toString();
}

function requestIdentity(method, value) {
    const url = new URL(value);
    return `${method} ${url.hostname}${url.pathname}${url.search}`;
}

function repeatedRequests(requests) {
    const counts = new Map();
    for (const request of requests) counts.set(request.identity, (counts.get(request.identity) || 0) + 1);
    return [...counts.entries()].filter(([, count]) => count > 1).map(([identity, count]) => ({ identity, count }));
}

function percentile(values, fraction) {
    const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
    if (!sorted.length) return 0;
    return round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]);
}

function printSummary(result, targetPath) {
    console.table(
        result.pages.map((page) => ({
            page: page.name,
            requests: page.requests.total,
            api: page.requests.apiTotal,
            idleApi: page.requests.apiIdle,
            apiMedianMs: page.requests.apiMedianMs,
            apiP95Ms: page.requests.apiP95Ms,
            longTasks: page.browser.longTaskCount,
            p95FrameMs: page.browser.p95FrameMs,
            refreshHz: page.browser.estimatedRefreshHz,
            webgl: page.browser.device.webglRenderer,
            backdrop: page.browser.rendering.backdropFilterElements,
            animations: page.browser.rendering.activeAnimations,
            domNodes: page.browser.domNodes
        }))
    );
    console.log(`Performance report: ${targetPath}`);
}

function normalizedBaseUrl(value) {
    const url = new URL(value);
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    return url.toString();
}

function boundedNumber(value, fallback, minimum, maximum) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function safeFilePart(value) {
    return (
        String(value || "audit")
            .toLowerCase()
            .replace(/[^a-z0-9_-]+/g, "-")
            .replace(/^-+|-+$/g, "") || "audit"
    );
}

function timestampForFile() {
    return new Date().toISOString().replace(/[:.]/g, "-");
}

function round(value) {
    return Math.round(Number(value || 0) * 100) / 100;
}
