const CONTACT_EMAIL_CODES = [
    108, 117, 107, 97, 115, 46, 102, 111, 115, 115, 97, 116, 105, 46, 100, 101, 118, 101, 108, 111, 112, 101, 114, 64,
    103, 109, 97, 105, 108, 46, 99, 111, 109
];

export async function initializeSiteShell({ loadStatus = true } = {}) {
    bindContactLinks();
    bindAvatarFallbacks();
    bindStaticHashNavigation();

    const client = createSupabaseClient();
    const shell = {
        client,
        session: null,
        profile: null,
        signIn() {
            return client ? signIn(client) : Promise.resolve();
        },
        signOut() {
            return client?.auth?.signOut ? client.auth.signOut() : Promise.resolve();
        },
        async loadStatsSlice(id) {
            return loadStatsSlice(id);
        },
        setProfile(profile) {
            shell.profile = profile || null;
            renderAccountWidget(shell);
        }
    };

    renderAccountWidget(shell, false);
    const tasks = [initializeAuth(shell)];
    if (loadStatus) {
        tasks.push(
            loadStatsSlice("home").then((data) => {
                renderHeroStatus(data);
                return data;
            })
        );
    }
    await Promise.allSettled(tasks);
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

async function loadStatsSlice(id) {
    const baseUrl = String(window.COB_SUPABASE_URL || "").replace(/\/+$/, "");
    const key = String(window.COB_SUPABASE_KEY || "").trim();
    if (!baseUrl || !key) return null;
    const table = String(window.COB_SUPABASE_TABLE || "cob_stats_exports");
    const fallbackId = String(window.COB_SUPABASE_ROW_ID || "live");
    for (const rowId of [...new Set([id, fallbackId])]) {
        const url = `${baseUrl}/rest/v1/${encodeURIComponent(table)}?id=eq.${encodeURIComponent(rowId)}&select=payload&limit=1`;
        try {
            const response = await fetch(url, {
                cache: "no-store",
                headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" }
            });
            if (!response.ok) continue;
            const rows = await response.json();
            if (rows?.[0]?.payload) return rows[0].payload;
        } catch (error) {
            console.warn(`Could not load the ${rowId} statistics slice`, error);
        }
    }
    return null;
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
    const avatar = safeImageUrl(profile.avatar_url || metadata.avatar_url || metadata.picture || "");
    container.innerHTML = `
        <button class="notification-bell-button" type="button" data-notification-panel-open aria-label="Open account notifications" aria-expanded="false">
            <svg class="notification-bell-symbol" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.268 21a2 2 0 0 0 3.464 0"></path>
                <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"></path>
            </svg>
        </button>
        <a class="account-pill" href="/stats/#view=account" aria-label="Open profile for ${escapeHtml(name)}">
            <span class="account-avatar-frame">${avatar ? `<img class="avatar-image" src="${escapeHtml(avatar)}" alt="" decoding="async" referrerpolicy="no-referrer">` : `<span class="avatar-image-fallback">${escapeHtml(initials(name))}</span>`}</span>
            <span>${escapeHtml(name)}</span>
        </a>`;
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
