import { getDrawerController } from "./drawer-controller.js";
import { readPublicStatsCache, writePublicStatsCache } from "../utils/public-data-cache.js";
import { createRequestSignal } from "../utils/request-timeout.js";

const CONTACT_EMAIL_CODES = [
    108, 117, 107, 97, 115, 46, 102, 111, 115, 115, 97, 116, 105, 46, 100, 101, 118, 101, 108, 111, 112, 101, 114, 64,
    103, 109, 97, 105, 108, 46, 99, 111, 109
];

const statsSliceCache = new Map();
const statsSliceRequests = new Map();
const STATS_SLICE_UPDATED_EVENT = "cob:stats-slice-updated";
const STATS_FETCH_TIMEOUT_MS = 4_500;
const STATUS_FETCH_TIMEOUT_MS = 2_500;
let siteShellPromise = null;

export async function initializeSiteShell({ loadStatus = true } = {}) {
    if (!siteShellPromise) siteShellPromise = initializeSiteShellOnce();
    const shell = await siteShellPromise;
    if (loadStatus) await shell.loadHeroStatus();
    return shell;
}

async function initializeSiteShellOnce() {
    bindContactLinks();
    bindAvatarFallbacks();
    bindStaticHashNavigation();

    const client = createSupabaseClient();
    const drawer = getDrawerController();
    const shell = {
        client,
        drawer,
        session: null,
        profile: null,
        accountPanelAddon: null,
        heroStatusRequest: null,
        get accountPanelOpen() {
            return drawer.isActive("profile");
        },
        signIn() {
            return client ? signIn(client) : Promise.resolve();
        },
        signOut() {
            return client?.auth?.signOut ? client.auth.signOut() : Promise.resolve();
        },
        async loadStatsSlice(id, options = {}) {
            return loadStatsSlice(id, options);
        },
        async loadHeroStatus({ force = false } = {}) {
            if (shell.heroStatusRequest && !force) return shell.heroStatusRequest;
            const request = Promise.all([
                loadStatsSlice("home", { force }),
                loadStatsSlice("status", { force, fallback: false })
            ]).then(([home, status]) => {
                const data = mergeHomeStatus(home, status);
                renderHeroStatus(data);
                return data;
            });
            shell.heroStatusRequest = request;
            try {
                return await request;
            } finally {
                if (shell.heroStatusRequest === request) shell.heroStatusRequest = null;
            }
        },
        setProfile(profile) {
            shell.profile = profile || null;
            renderAccountWidget(shell);
            if (!shell.session?.user) drawer.close();
            else drawer.refresh("profile");
        },
        setAccountPanelAddon(renderer) {
            shell.accountPanelAddon = typeof renderer === "function" ? renderer : null;
            drawer.refresh("profile");
        },
        refreshAccountPanel() {
            renderAccountWidget(shell);
            drawer.refresh("profile");
        }
    };
    drawer.register("profile", ({ host }) => renderAccountPanel(shell, host));
    drawer.subscribe(() => renderAccountWidget(shell));

    renderAccountWidget(shell, false);
    await initializeAuth(shell);
    return shell;
}

export function renderHeroStatus(data) {
    const live = data?.liveStatus || {};
    setText("online-player-count", live.onlinePlayers > 0 ? String(live.onlinePlayers) : "Offline");
    setText("server-status", live.label || titleCase(live.state) || "Idle");
    setText(
        "server-status-detail",
        live.mapName || live.mode || (live.onlinePlayers > 0 ? "Server online" : "Waiting for live feed")
    );
    setText("hero-player-count", String(number(data?.totalTrackedPlayers)));

    const lastMatch = data?.latestMatch || null;
    const lastGame = document.getElementById("last-game-played");
    if (!lastGame) return;
    if (!lastMatch) {
        lastGame.textContent = "Waiting for games";
        return;
    }
    const dateValue = lastMatch.endedAt || lastMatch.completedAt || "";
    lastGame.innerHTML = `<span class="status-mode">${escapeHtml(compactMode(lastMatch.modeLabel || lastMatch.mode))}</span><time datetime="${escapeHtml(dateValue)}">${escapeHtml(formatDate(dateValue))}</time>`;
}

export function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

export function formatDate(value, options = {}) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "Unknown date";
    return new Intl.DateTimeFormat(undefined, {
        day: "2-digit",
        month: options.month || "short",
        year: "numeric",
        ...(options.time ? { hour: "2-digit", minute: "2-digit" } : {})
    }).format(date);
}

export function skinHeadUrl(name, size = 96) {
    const safeName = String(name || "Steve").trim() || "Steve";
    const safeSize = Math.max(16, Math.min(256, Math.round(number(size) || 96)));
    return `https://mc-heads.net/avatar/${encodeURIComponent(safeName)}/${safeSize}`;
}

export function number(value) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function createSupabaseClient() {
    const url = String(window.COB_SUPABASE_URL || "").trim();
    const key = String(window.COB_SUPABASE_KEY || "").trim();
    if (!url || !key || !window.supabase?.createClient) return null;
    return window.supabase.createClient(url, key, {
        auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
        global: { headers: { "x-client-info": "call-of-block-public-shell" } }
    });
}

async function loadStatsSlice(id, { force = false, fallback = id !== "status" } = {}) {
    const baseUrl = String(window.COB_SUPABASE_URL || "").replace(/\/+$/, "");
    const key = String(window.COB_SUPABASE_KEY || "").trim();
    if (!baseUrl || !key) return null;
    const maxAge = id === "status" ? 15_000 : 300_000;
    let cached = statsSliceCache.get(id);
    if (!cached) {
        const persisted = readPublicStatsCache(id, { maxAgeMs: maxAge, allowStale: true });
        if (persisted) {
            cached = persisted;
            statsSliceCache.set(id, persisted);
        }
    }

    if (!force && cached) {
        if (Date.now() - cached.storedAt >= maxAge) void requestStatsSlice(id, { baseUrl, key, fallback });
        return cached.payload;
    }
    return requestStatsSlice(id, { baseUrl, key, fallback });
}

function requestStatsSlice(id, { baseUrl, key, fallback }) {
    if (statsSliceRequests.has(id)) return statsSliceRequests.get(id);

    const request = fetchStatsSlice(id, { baseUrl, key, fallback })
        .then((payload) => {
            if (!payload) return null;
            const storedAt = Date.now();
            statsSliceCache.set(id, { payload, storedAt });
            writePublicStatsCache(id, payload);
            window.dispatchEvent(new CustomEvent(STATS_SLICE_UPDATED_EVENT, { detail: { id, payload, storedAt } }));
            return payload;
        })
        .finally(() => {
            if (statsSliceRequests.get(id) === request) statsSliceRequests.delete(id);
        });
    statsSliceRequests.set(id, request);
    return request;
}

async function fetchStatsSlice(id, { baseUrl, key, fallback }) {
    const table = String(window.COB_SUPABASE_TABLE || "cob_stats_exports");
    const fallbackId = String(window.COB_SUPABASE_ROW_ID || "live");
    const rowIds = fallback ? [...new Set([id, fallbackId])] : [id];
    for (const rowId of rowIds) {
        const url = `${baseUrl}/rest/v1/${encodeURIComponent(table)}?id=eq.${encodeURIComponent(rowId)}&select=payload&limit=1`;
        const startedAt = performance.now();
        const request = createRequestSignal(
            null,
            rowId === "status" ? STATUS_FETCH_TIMEOUT_MS : STATS_FETCH_TIMEOUT_MS
        );
        try {
            const response = await fetch(url, {
                ...(rowId === "status" ? { cache: "no-store" } : {}),
                signal: request.signal,
                headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" }
            });
            const text = await response.text();
            recordPublicDataRequest(rowId, startedAt, response.status, text.length);
            if (!response.ok) continue;
            const rows = JSON.parse(text);
            if (rows?.[0]?.payload) return rows[0].payload;
        } catch (error) {
            recordPublicDataRequest(rowId, startedAt, 0, 0, error);
            if (request.timedOut) {
                console.warn(
                    `Timed out loading the ${rowId} statistics slice after ${rowId === "status" ? STATUS_FETCH_TIMEOUT_MS : STATS_FETCH_TIMEOUT_MS} ms.`
                );
                break;
            }
            console.warn(`Could not load the ${rowId} statistics slice`, error);
        } finally {
            request.cleanup();
        }
    }
    return null;
}

function mergeHomeStatus(home, status) {
    const summary = home && typeof home === "object" ? home : {};
    const liveStatus = status?.liveStatus || summary.liveStatus || {};
    const generatedAt = status?.generatedAt || status?.updatedAt || summary.generatedAt || "";
    const age = Date.now() - Date.parse(generatedAt);
    const stale = generatedAt && Number.isFinite(age) && age > 45_000;
    return {
        ...summary,
        liveStatus: stale ? { ...liveStatus, onlinePlayers: 0, state: "offline", label: "Offline" } : liveStatus
    };
}

function recordPublicDataRequest(rowId, startedAt, status, responseSize, error = null) {
    const diagnostics = (globalThis.__cobPublicDataDiagnostics ||= { requests: [] });
    diagnostics.requests.push({
        timestamp: new Date().toISOString(),
        page: document.body?.dataset.publicRoute || "home",
        operation: "stats-slice",
        rowId,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        responseSize,
        status,
        error: error ? String(error?.message || error) : ""
    });
    if (diagnostics.requests.length > 200) diagnostics.requests.splice(0, diagnostics.requests.length - 200);
}

async function initializeAuth(shell) {
    if (!shell.client) {
        renderAccountWidget(shell, true);
        return;
    }
    try {
        const result = await shell.client.auth.getSession();
        if (result.error) throw result.error;
        shell.session = result.data?.session || null;
        renderAccountWidget(shell, true);
        shell.client.auth.onAuthStateChange((event, session) => {
            if (event === "TOKEN_REFRESHED") {
                shell.session = session || null;
                return;
            }
            shell.session = session || null;
            if (!shell.session?.user) shell.drawer.close();
            renderAccountWidget(shell, true);
        });
    } catch (error) {
        console.warn("Could not initialize the shared account widget", error);
        renderAccountWidget(shell, true);
    }
}

function renderAccountWidget(shell, ready = true) {
    const container = document.getElementById("account-widget");
    if (!container) return;
    if (!shell.client) {
        container.innerHTML = '<button type="button" disabled title="Discord login is not configured.">Login</button>';
        return;
    }
    if (!ready) {
        container.innerHTML = '<button type="button" disabled>Checking...</button>';
        return;
    }
    if (!shell.session?.user) {
        container.innerHTML = '<button type="button" data-shell-login>Login</button>';
        container.querySelector("[data-shell-login]")?.addEventListener("click", () => signIn(shell.client));
        return;
    }

    const metadata = shell.session.user.user_metadata || {};
    const profile = shell.profile || {};
    const name = String(
        profile.display_name ||
            profile.username ||
            metadata.full_name ||
            metadata.name ||
            metadata.user_name ||
            "Account"
    );
    const avatar = safeImageUrl(
        profile.resolved_avatar_url ||
            profile.custom_avatar_url ||
            profile.avatar_url ||
            metadata.avatar_url ||
            metadata.picture ||
            ""
    );
    container.innerHTML = `
        <button class="notification-bell-button" type="button" data-notification-panel-open aria-label="Open account notifications" aria-expanded="false">
            <svg class="notification-bell-symbol" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.268 21a2 2 0 0 0 3.464 0"></path>
                <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"></path>
            </svg>
        </button>
        <button class="account-pill" type="button" data-shell-account-open aria-label="Open profile panel for ${escapeHtml(name)}" aria-expanded="${shell.accountPanelOpen ? "true" : "false"}">
            ${renderShellAvatar(profile, avatar, name)}
            <span>${escapeHtml(name)}</span>
        </button>`;
    container.querySelector("[data-shell-account-open]")?.addEventListener("click", () => openAccountPanel(shell));
    updateAdminStoreLinks(profile);
}

function openAccountPanel(shell) {
    if (!shell.session?.user) return;
    shell.drawer.open("profile");
    window.requestAnimationFrame(() => document.querySelector("[data-shell-account-close]")?.focus());
}

function closeAccountPanel(shell, restoreFocus = true) {
    if (!shell.drawer.close("profile")) return;
    if (restoreFocus) {
        window.requestAnimationFrame(() => document.querySelector("[data-shell-account-open]")?.focus());
    }
}

function renderAccountPanel(shell, host) {
    if (!shell.drawer.isActive("profile") || !shell.session?.user) {
        host.innerHTML = "";
        return;
    }

    const metadata = shell.session.user.user_metadata || {};
    const profile = shell.profile || {};
    const name = String(
        profile.display_name ||
            profile.username ||
            metadata.full_name ||
            metadata.name ||
            metadata.user_name ||
            "Account"
    );
    const avatar = safeImageUrl(
        profile.resolved_avatar_url ||
            profile.custom_avatar_url ||
            profile.avatar_url ||
            metadata.avatar_url ||
            metadata.picture ||
            ""
    );
    const admin = Boolean(profile.is_admin);
    const title = String(profile.resolved_title_text || "").trim();
    const rarity = cleanRarity(profile.resolved_title_rarity);
    const level = accountLevel(profile.xp);
    host.innerHTML = `<div class="profile-drawer-backdrop" data-shell-account-backdrop>
        <aside class="profile-drawer" role="dialog" aria-modal="true" aria-labelledby="shell-profile-drawer-title">
            <header class="profile-drawer-header">
                <h2 id="shell-profile-drawer-title">PROFILE</h2>
                <button class="profile-drawer-close" type="button" data-shell-account-close aria-label="Close profile panel">&times;</button>
            </header>
            <div class="profile-drawer-identity">
                ${renderShellAvatar(profile, avatar, name)}
                <div>
                    <strong>${escapeHtml(name)}</strong>
                    ${title ? `<span class="profile-title-cosmetic rarity-${rarity} compact">${escapeHtml(title)}</span>` : ""}
                    <div class="account-level-pill" title="${escapeHtml(`${number(profile.xp).toLocaleString()} total XP`)}"><strong>LVL ${level}</strong><span>${number(profile.xp).toLocaleString()} XP</span></div>
                </div>
            </div>
            <div class="profile-drawer-actions ${admin ? "admin" : ""}">
                <a class="profile-drawer-customize" href="/stats/#account">Customize profile</a>
                <a class="profile-drawer-support" href="/feedback/">Feedback &amp; support</a>
                ${
                    admin
                        ? `<a class="profile-drawer-tickets" href="/stats/#admin-tickets">Ticket dashboard</a>
                           <a class="profile-drawer-progression" href="/stats/#admin-progression">Progression &amp; missions</a>
                           <a class="profile-drawer-docs" href="/stats/#admin-help">Admin documentation</a>
                           <a class="profile-drawer-store" href="/stats/#store">Open store admin</a>`
                        : ""
                }
            </div>
            ${shell.accountPanelAddon?.() || ""}
        </aside>
    </div>`;
    host.querySelector("[data-shell-account-close]")?.addEventListener("click", () => closeAccountPanel(shell));
    host.querySelector("[data-shell-account-backdrop]")?.addEventListener("click", (event) => {
        if (event.target === event.currentTarget) closeAccountPanel(shell);
    });
}

function renderShellAvatar(profile, avatar, name) {
    const border = safeCssUrl(profile.resolved_border_url);
    const inset = Math.max(0, Math.min(25, number(profile.resolved_border_inset)));
    const frameClass = border ? " avatar-frame-image" : "";
    const frameStyle = border
        ? ` style="--avatar-frame-image: url('${escapeHtml(border)}'); --avatar-frame-inset: ${inset}%"`
        : "";
    return `<span class="account-avatar-frame${frameClass}"${frameStyle}><span class="avatar-image-fallback" aria-hidden="true">${escapeHtml(initials(name))}</span>${avatar ? `<img class="avatar-image" src="${escapeHtml(avatar)}" alt="" decoding="async" referrerpolicy="no-referrer">` : ""}</span>`;
}

function updateAdminStoreLinks(profile) {
    const visible = Boolean(profile?.is_admin);
    document.querySelectorAll("[data-admin-store-link]").forEach((link) => {
        link.hidden = !visible;
        link.classList.toggle("hidden", !visible);
        link.setAttribute("aria-hidden", visible ? "false" : "true");
    });
}

function accountLevel(value) {
    return Math.min(1000, Math.floor(Math.max(0, number(value)) / 10000) + 1);
}

async function signIn(client) {
    const redirectTo = new URL(window.location.pathname + window.location.search, window.location.origin).toString();
    const result = await client.auth.signInWithOAuth({ provider: "discord", options: { redirectTo } });
    if (result.error) console.error("Discord login failed", result.error);
}

function bindContactLinks() {
    document.querySelectorAll("[data-contact-email]").forEach((button) => {
        button.addEventListener("click", () => {
            const email = String.fromCharCode(...CONTACT_EMAIL_CODES);
            window.location.href = `mailto:${email}?subject=${encodeURIComponent("Call of Block")}`;
        });
    });
}

function bindStaticHashNavigation() {
    const scrollToHash = () => {
        const hash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
        if (!hash) return;
        const params = new URLSearchParams(hash);
        const route = params.get("view");
        const id = route === "faq" ? params.get("entry") || "faq" : hash.includes("=") ? "" : hash;
        if (!id) return;
        window.requestAnimationFrame(() => {
            const target = document.getElementById(id);
            if (target instanceof HTMLDetailsElement) {
                target.open = true;
                target.querySelector("summary")?.focus({ preventScroll: true });
            }
            target?.scrollIntoView({ block: "start" });
        });
    };
    window.addEventListener("hashchange", scrollToHash);
    scrollToHash();
}

function bindAvatarFallbacks() {
    document.addEventListener(
        "error",
        (event) => {
            const image = event.target;
            if (!(image instanceof HTMLImageElement) || !image.classList.contains("avatar-image")) return;
            image.hidden = true;
            const fallback = image.previousElementSibling;
            if (fallback?.classList.contains("avatar-image-fallback")) fallback.hidden = false;
        },
        true
    );
}

function safeImageUrl(value) {
    const url = String(value || "").trim();
    if (!url) return "";
    if (/^https:\/\//i.test(url) || /^\.\/?assets\//i.test(url) || /^\/assets\//i.test(url)) return url;
    return "";
}

function safeCssUrl(value) {
    return safeImageUrl(value).replace(/['"\\<>]/g, "");
}

function cleanRarity(value) {
    const rarity = String(value || "common").toLowerCase();
    return ["common", "rare", "epic", "legendary", "mythic"].includes(rarity) ? rarity : "common";
}

function initials(value) {
    return (
        String(value || "COB")
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase() || "")
            .join("") || "COB"
    );
}

function compactMode(value) {
    const mode = String(value || "Match").toLowerCase();
    if (mode.includes("battle")) return "BR";
    if (mode.includes("death")) return "DM";
    if (mode.includes("zombie")) return "Survival";
    if (mode.includes("duel")) return "Duel";
    return titleCase(value) || "Match";
}

function titleCase(value) {
    return String(value || "")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/^./, (character) => character.toUpperCase());
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}
