import { networkAccountRequest } from "../api/network-account.js";
import { escapeHtml } from "../utils/sanitization.js";

let current;
export function renderMinecraftAccountLink(host, { client, accountId, onLinked }) {
    if (!host || !accountId) return;
    if (current?.accountId !== accountId)
        current = {
            accountId,
            loaded: false,
            busy: false,
            data: null,
            message: ""
        };
    const state = current;
    state.host = host;
    state.client = client;
    state.onLinked = onLinked;
    host.onclick = (event) => {
        if (event.target.closest("[data-minecraft-link-code]")) void request(state, "linkCode");
        if (event.target.closest("[data-minecraft-link-refresh]")) void request(state, "linkStatus", true);
    };
    draw(state);
    if (!state.loaded && !state.busy) void request(state, "linkStatus");
}

function draw(state) {
    if (current !== state || !state.host?.isConnected) return;
    const linked = state.data?.linked;
    const code = state.data?.code;
    const expires = Date.parse(state.data?.expires_at || "");
    const valid = code && Number.isFinite(expires) && expires > Date.now();
    state.host.innerHTML = `<h3>${linked ? "Connected" : "Connect Minecraft"}</h3>
        ${
            linked
                ? `<p class="mode-empty">${escapeHtml(state.data.player_uuid)}</p>`
                : valid
                  ? `<p>Run <code>/cob discord link ${escapeHtml(code)}</code> in Minecraft. The code expires at ${escapeHtml(new Date(expires).toLocaleTimeString())}.</p>`
                  : '<p class="mode-empty">Connect the Minecraft account you use to play Call of Block.</p>'
        }
        <div class="account-actions">${linked ? "" : `<button type="button" data-minecraft-link-code ${state.busy ? "disabled" : ""}>${state.busy ? "Loading..." : valid ? "New link code" : "Get link code"}</button>`}
        <button type="button" data-minecraft-link-refresh ${state.busy ? "disabled" : ""}>Refresh link</button></div>
        ${state.message ? `<p class="identity-status" role="status">${escapeHtml(state.message)}</p>` : ""}`;
}

async function request(state, action, notify = false) {
    if (current !== state || state.busy) return;
    state.busy = true;
    state.message = "";
    draw(state);
    try {
        const { data, error } = await networkAccountRequest(state.client, action);
        if (current !== state || !state.host?.isConnected) return;
        if (error) throw error;
        if (data?.environment !== "TEST" || data.user_id !== state.accountId || typeof data.linked !== "boolean")
            throw new Error("Account link response is unavailable.");
        if (data.code && !/^[A-F0-9]{12}$/.test(data.code)) throw new Error("Account link code is unavailable.");
        const wasLinked = state.data?.linked;
        state.data = data.linked || action === "linkCode" ? data : { ...state.data, ...data };
        state.loaded = true;
        state.message = data.linked
            ? "Minecraft account connected."
            : action === "linkStatus" && notify
              ? "Not connected yet. Enter the code in Minecraft, then refresh."
              : "";
        if (data.linked && (!wasLinked || notify)) await state.onLinked?.();
    } catch (error) {
        if (current === state) {
            state.loaded = true;
            state.message = error?.message || "Account linking unavailable. Retry.";
        }
    } finally {
        state.busy = false;
        draw(state);
    }
}
