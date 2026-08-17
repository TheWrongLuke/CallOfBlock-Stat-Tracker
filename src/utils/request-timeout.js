export function createRequestSignal(parentSignal, timeoutMs) {
    const controller = new AbortController();
    let timedOut = false;
    let timer = 0;

    const abortFromParent = () => controller.abort(parentSignal?.reason);
    if (parentSignal?.aborted) abortFromParent();
    else parentSignal?.addEventListener("abort", abortFromParent, { once: true });

    if (!controller.signal.aborted && Number.isFinite(timeoutMs) && timeoutMs > 0) {
        timer = globalThis.setTimeout(() => {
            timedOut = true;
            const error = new Error(`Request timed out after ${timeoutMs} ms`);
            error.name = "TimeoutError";
            controller.abort(error);
        }, timeoutMs);
    }

    return {
        signal: controller.signal,
        get timedOut() {
            return timedOut;
        },
        cleanup() {
            if (timer) globalThis.clearTimeout(timer);
            parentSignal?.removeEventListener("abort", abortFromParent);
        }
    };
}
