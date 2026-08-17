import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequestSignal } from "../../src/utils/request-timeout.js";

afterEach(() => vi.useRealTimers());

describe("request timeout signal", () => {
    it("aborts after the configured timeout", () => {
        vi.useFakeTimers();
        const request = createRequestSignal(null, 2_000);

        vi.advanceTimersByTime(2_000);

        expect(request.signal.aborted).toBe(true);
        expect(request.timedOut).toBe(true);
        request.cleanup();
    });

    it("forwards an existing navigation abort without treating it as a timeout", () => {
        const parent = new AbortController();
        const request = createRequestSignal(parent.signal, 2_000);

        parent.abort();

        expect(request.signal.aborted).toBe(true);
        expect(request.timedOut).toBe(false);
        request.cleanup();
    });
});
