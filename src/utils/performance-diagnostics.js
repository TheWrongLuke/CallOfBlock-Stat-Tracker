const MAX_RECORDS = 200;

export function createPerformanceDiagnostics({
    fetchImpl = globalThis.fetch,
    location = globalThis.location,
    logger = globalThis.console
} = {}) {
    const enabled = diagnosticsEnabled(location);
    const requests = [];
    const renders = [];
    const activeRequests = new Map();
    const requestCounts = new Map();

    const monitoredFetch = async (input, init = {}) => {
        if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable.");
        if (!enabled) return fetchImpl(input, init);

        const method = String(init.method || input?.method || "GET").toUpperCase();
        const url = String(input?.url || input);
        const key = `${method} ${url}`;
        const occurrence = (requestCounts.get(key) || 0) + 1;
        const active = activeRequests.get(key) || 0;
        const record = {
            method,
            url,
            occurrence,
            duplicate: occurrence > 1,
            concurrentDuplicate: active > 0,
            startedAt: new Date().toISOString(),
            durationMs: 0,
            payloadBytes: null,
            status: 0,
            failed: false
        };
        requestCounts.set(key, occurrence);
        activeRequests.set(key, active + 1);
        requests.push(record);
        trimRecords(requests);
        const started = now();

        try {
            const response = await fetchImpl(input, init);
            record.durationMs = round(now() - started);
            record.status = response.status;
            record.payloadBytes = contentLength(response);
            if (record.payloadBytes === null) void measureClonedResponse(response, record);
            logRequest(logger, record);
            return response;
        } catch (error) {
            record.durationMs = round(now() - started);
            record.failed = true;
            record.error = String(error?.message || error || "Request failed");
            logRequest(logger, record);
            throw error;
        } finally {
            const remaining = (activeRequests.get(key) || 1) - 1;
            if (remaining > 0) activeRequests.set(key, remaining);
            else activeRequests.delete(key);
        }
    };

    const startRender = (route) => {
        if (!enabled) return () => {};
        const started = now();
        return () => {
            const record = {
                route: String(route || "unknown"),
                durationMs: round(now() - started),
                recordedAt: new Date().toISOString()
            };
            renders.push(record);
            trimRecords(renders);
            logger?.debug?.(`[Call of Block performance] render ${record.route}: ${record.durationMs} ms`);
        };
    };

    return {
        enabled,
        fetch: monitoredFetch,
        startRender,
        snapshot() {
            return {
                enabled,
                requestCount: requests.length,
                duplicateRequestCount: requests.filter((record) => record.duplicate).length,
                concurrentDuplicateCount: requests.filter((record) => record.concurrentDuplicate).length,
                requests: requests.map((record) => ({ ...record })),
                renders: renders.map((record) => ({ ...record }))
            };
        },
        reset() {
            requests.length = 0;
            renders.length = 0;
            activeRequests.clear();
            requestCounts.clear();
        }
    };
}

function diagnosticsEnabled(location) {
    const hostname = String(location?.hostname || "").toLowerCase();
    if (["localhost", "127.0.0.1", "::1"].includes(hostname)) return true;
    try {
        return new URLSearchParams(location?.search || "").get("debugPerformance") === "1";
    } catch (_error) {
        return false;
    }
}

function contentLength(response) {
    const value = Number(response?.headers?.get?.("content-length"));
    return Number.isFinite(value) && value >= 0 ? value : null;
}

async function measureClonedResponse(response, record) {
    try {
        const buffer = await response.clone().arrayBuffer();
        record.payloadBytes = buffer.byteLength;
    } catch (_error) {
        // Opaque and streaming responses may not be measurable from the browser.
    }
}

function logRequest(logger, record) {
    const duplicate = record.concurrentDuplicate ? " concurrent duplicate" : record.duplicate ? " repeated" : "";
    const size = record.payloadBytes === null ? "unknown size" : `${record.payloadBytes} bytes`;
    const status = record.failed ? "failed" : `HTTP ${record.status}`;
    logger?.debug?.(
        `[Call of Block performance] ${record.method} ${record.url} - ${status}, ${record.durationMs} ms, ${size}${duplicate}`
    );
}

function trimRecords(records) {
    if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS);
}

function now() {
    return globalThis.performance?.now?.() ?? Date.now();
}

function round(value) {
    return Math.round(value * 100) / 100;
}
