import { describe, expect, it, vi } from "vitest";
import { createPerformanceDiagnostics } from "../../src/utils/performance-diagnostics.js";

describe("performance diagnostics", () => {
    it("stays dormant on the public site", async () => {
        const fetchImpl = vi.fn().mockResolvedValue(new Response("ok"));
        const diagnostics = createPerformanceDiagnostics({
            fetchImpl,
            location: { hostname: "callofblock.com", search: "" }
        });

        await diagnostics.fetch("https://example.test/data");

        expect(diagnostics.enabled).toBe(false);
        expect(diagnostics.snapshot().requestCount).toBe(0);
    });

    it("records request count, duplicates, payload size, and render duration in development", async () => {
        const logger = { debug: vi.fn() };
        const fetchImpl = vi.fn().mockResolvedValue(
            new Response("data", {
                status: 200,
                headers: { "content-length": "4" }
            })
        );
        const diagnostics = createPerformanceDiagnostics({
            fetchImpl,
            location: { hostname: "localhost", search: "" },
            logger
        });

        await diagnostics.fetch("https://example.test/data");
        await diagnostics.fetch("https://example.test/data");
        const finishRender = diagnostics.startRender("stats");
        finishRender();
        const snapshot = diagnostics.snapshot();

        expect(snapshot.requestCount).toBe(2);
        expect(snapshot.duplicateRequestCount).toBe(1);
        expect(snapshot.requests[0]).toMatchObject({ status: 200, payloadBytes: 4, duplicate: false });
        expect(snapshot.requests[1].duplicate).toBe(true);
        expect(snapshot.renders[0].route).toBe("stats");
        expect(logger.debug).toHaveBeenCalled();
    });
});
