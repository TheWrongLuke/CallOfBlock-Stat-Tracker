import {
    escapeHtml,
    formatDate,
    initializeSiteShell,
    number,
    renderHeroStatus,
    skinHeadUrl
} from "../core/site-shell.js";
import { syncDiscordProfile } from "../api/profile.js";

const CHAMPION_ROTATE_MS = 5000;

export async function initializeHomePage() {
    if (redirectLegacyRoute()) return;
    window.addEventListener("hashchange", redirectLegacyRoute);
    await whenReady();

    const shell = await initializeSiteShell({ loadStatus: false });
    const data = await shell.loadStatsSlice("home");
    renderHeroStatus(data);

    const [profiles, catalog, ownProfileResult] = await Promise.all([
        loadPublicProfiles(shell.client),
        loadCosmeticCatalog(shell.client),
        shell.session?.user ? syncDiscordProfile(shell.client) : Promise.resolve({ data: null, error: null })
    ]);
    const publicViewerProfile = profiles.find((profile) => profile.id === shell.session?.user?.id) || null;
    const viewerProfile = ownProfileResult.error ? publicViewerProfile : ownProfileResult.data || publicViewerProfile;
    shell.setProfile(resolveShellProfile(viewerProfile, catalog));
    renderHome(data, profiles, catalog);
    if (shell.session?.user) {
        const { initializeHomeNotifications } = await import("../features/home-notifications.js");
        await initializeHomeNotifications(shell.client);
    }
    void renderUpcomingPlaytest(shell.client);
    startChampionCarousel();
}

function resolveShellProfile(profile, catalog) {
    if (!profile) return null;
    const border = catalog.get(`border:${String(profile.pfp_border || "none")}`);
    const titleId = String(profile.profile_title || "none");
    const title = catalog.get(`title:${titleId}`);
    return {
        ...profile,
        resolved_avatar_url: profileAvatar(profile, { name: profile.minecraft_player_name }, catalog, 96),
        resolved_border_url: border?.image_url || "",
        resolved_border_inset: border?.border_inset || 0,
        resolved_title_text: title?.title_text || (titleId === "none" ? "" : titleId.replaceAll("_", " ")),
        resolved_title_rarity: title?.rarity || "common"
    };
}

function renderHome(data, profiles, catalog) {
    renderFeaturedList("battleRoyale", data, profiles, catalog);
    renderFeaturedList("deathmatch", data, profiles, catalog);
    renderLatestMatch(data?.latestMatch || null);
    renderCreatorProfile(profiles, catalog);
}

function renderFeaturedList(mode, data, profiles, catalog) {
    const container = document.getElementById(`featured-${mode === "battleRoyale" ? "battle-royale" : "deathmatch"}`);
    if (!container) return;
    const players = Array.isArray(data?.modes?.[mode]?.players) ? data.modes[mode].players.slice(0, 5) : [];
    if (!players.length) {
        container.innerHTML = '<p class="mode-empty">No games have been played yet.</p>';
        return;
    }

    container.innerHTML = players
        .map((player, index) => {
            const profile = findAccountProfile(profiles, player);
            const name = String(profile?.display_name || player.name || "Unknown player");
            const avatar = profileAvatar(profile, player, catalog, 96);
            const title = profileTitle(profile, catalog);
            const stats = player.stats || {};
            const winRate = Number(
                player.derived?.winRate ?? (number(stats.games) ? number(stats.wins) / number(stats.games) : 0)
            );
            const tab = mode === "deathmatch" ? "deathmatch" : "battleRoyale";
            return `<a class="featured-player podium-rank-${index + 1}" href="/stats/#player=${encodeURIComponent(player.playerId)}&amp;tab=${tab}">
                <span class="player-avatar featured-avatar">${renderAvatarImage(avatar, name)}</span>
                <div class="featured-player-main">
                    <div><span class="rank-badge rank-${Math.min(index + 1, 3)}">${index + 1}</span><strong>${escapeHtml(name)}</strong></div>
                    ${title ? `<span class="profile-title rarity-${escapeHtml(title.rarity)}">${escapeHtml(title.text)}</span>` : ""}
                    <small>${number(stats.wins)} wins - ${number(stats.kills)} kills - ${number(stats.games)} games</small>
                </div>
                <div class="featured-player-stat"><strong>${Math.round(winRate * 100)}%</strong><span>WR</span></div>
            </a>`;
        })
        .join("");
}

function renderLatestMatch(match) {
    const container = document.getElementById("home-latest-match");
    if (!container) return;
    if (!match) {
        container.innerHTML =
            '<div class="latest-empty"><strong>No games have been played yet</strong><span>The latest match card will appear after the next completed round.</span></div>';
        return;
    }
    const endedAt = match.endedAt || match.completedAt || "";
    const mode = match.modeLabel || modeLabel(match.mode);
    const players = number(match.playerCount || match.participants?.length);
    container.innerHTML = `<div class="latest-match-card">
        <strong>${escapeHtml(mode)}</strong>
        <time datetime="${escapeHtml(endedAt)}" title="${escapeHtml(formatDate(endedAt, { month: "long", time: true }))}">${escapeHtml(formatDate(endedAt))}</time>
        <div class="latest-match-meta">${players ? `<span>${players} ${players === 1 ? "player" : "players"}</span>` : ""}</div>
    </div>`;
}

async function renderUpcomingPlaytest(client) {
    if (!client) return;
    const now = new Date().toISOString();
    const slots = await client
        .from("playtest_slots")
        .select("id, playtest_id, start_datetime, end_datetime, label, confirmed_at")
        .not("confirmed_at", "is", null)
        .gte("end_datetime", now)
        .order("start_datetime", { ascending: true })
        .limit(1);
    const slot = slots.data?.[0];
    if (slots.error || !slot) return;
    const playtest = await client.from("playtests").select("title").eq("id", slot.playtest_id).maybeSingle();
    const container = document.getElementById("home-playtest-promo");
    if (!container) return;
    const start = new Date(slot.start_datetime);
    const end = new Date(slot.end_datetime);
    const date = new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "long", year: "numeric" }).format(start);
    const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
    container.innerHTML = `<div class="upcoming-event-main">
        <p class="panel-kicker">Upcoming Playtest</p>
        <h2 class="upcoming-event-date">${escapeHtml(date)}</h2>
        <time class="upcoming-event-time" datetime="${escapeHtml(slot.start_datetime)}">${escapeHtml(`${time.format(start)} - ${time.format(end)}`)}</time>
        <p>${escapeHtml(playtest.data?.title || slot.label || "Call of Block playtest")} is confirmed. Open the scheduler for availability and notification options.</p>
    </div><div class="playtest-promo-actions upcoming-event-actions"><a href="/playtests/">Open playtest scheduler</a><span>Confirmed</span></div>`;
}

async function loadPublicProfiles(client) {
    if (!client) return [];
    const columns =
        "id, username, avatar_url, display_name, minecraft_player_name, minecraft_player_id, avatar_source, custom_avatar_url, pfp_border, profile_title, unlocked_titles";
    const result = await client.from("public_profiles").select(columns).limit(200);
    return result.error || !Array.isArray(result.data) ? [] : result.data;
}

async function loadCosmeticCatalog(client) {
    if (!client) return new Map();
    const result = await client
        .from("public_cosmetic_catalog")
        .select("cosmetic_type, cosmetic_id, rarity, image_url, title_text, border_inset")
        .order("sort_order", { ascending: true });
    if (result.error) return new Map();
    return new Map((result.data || []).map((item) => [`${item.cosmetic_type}:${item.cosmetic_id}`, item]));
}

function findAccountProfile(profiles, player) {
    const playerId = String(player?.playerId || "");
    const name = normalizeName(player?.name);
    return (
        profiles.find((profile) => String(profile.minecraft_player_id || "") === playerId) ||
        profiles.find((profile) => normalizeName(profile.minecraft_player_name) === name) ||
        null
    );
}

function profileAvatar(profile, player, catalog, size) {
    const source = String(profile?.avatar_source || "minecraft");
    if (source === "discord" && profile?.avatar_url) return profile.avatar_url;
    if (source === "custom" && profile?.custom_avatar_url) return profile.custom_avatar_url;
    if (source !== "minecraft" && source !== "default") {
        const item = catalog.get(`icon:${source}`);
        if (item?.image_url) return item.image_url;
    }
    if (source === "default") return "/assets/branding/icon.png";
    return skinHeadUrl(profile?.minecraft_player_name || player?.name || "Steve", size);
}

function profileTitle(profile, catalog) {
    const id = String(profile?.profile_title || "none");
    if (!id || id === "none") return null;
    const item = catalog.get(`title:${id}`);
    return { text: item?.title_text || id.replaceAll("_", " "), rarity: item?.rarity || "common" };
}

function renderCreatorProfile(profiles, catalog) {
    const profile =
        profiles.find((entry) => String(entry.profile_title || "") === "owner") ||
        profiles.find((entry) => normalizeName(entry.minecraft_player_name) === "rtxluke") ||
        profiles.find((entry) => normalizeName(entry.username) === "thewrongluke");
    const image = document.querySelector("[data-creator-avatar]");
    if (!(image instanceof HTMLImageElement) || !profile) return;
    image.src = profileAvatar(profile, { name: "RTXLuke" }, catalog, 160);
    image.alt = `${profile.display_name || profile.username || "TheWrongLuke"} profile icon`;
}

function renderAvatarImage(url, name) {
    const initials = String(name || "COB")
        .slice(0, 2)
        .toUpperCase();
    return `<span class="avatar-image-fallback" aria-hidden="true">${escapeHtml(initials)}</span><img class="avatar-image" src="${escapeHtml(url)}" alt="" loading="eager" decoding="async" referrerpolicy="no-referrer">`;
}

function startChampionCarousel() {
    const carousel = document.getElementById("champion-carousel");
    if (!carousel) return;
    let mode = "battleRoyale";
    let timer = 0;
    const restart = () => {
        window.clearInterval(timer);
        timer = window.setInterval(() => {
            mode = mode === "battleRoyale" ? "deathmatch" : "battleRoyale";
            const panel = carousel.querySelector(`[data-champion-panel="${mode}"]`);
            if (panel) carousel.scrollTo({ left: panel.offsetLeft - carousel.offsetLeft, behavior: "smooth" });
        }, CHAMPION_ROTATE_MS);
    };
    let scrollTimer = 0;
    carousel.addEventListener("scroll", () => {
        window.clearTimeout(scrollTimer);
        scrollTimer = window.setTimeout(() => {
            mode = carousel.scrollLeft > carousel.clientWidth * 0.5 ? "deathmatch" : "battleRoyale";
            restart();
        }, 120);
    });
    restart();
    window.addEventListener("pagehide", () => window.clearInterval(timer), { once: true });
}

function redirectLegacyRoute() {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return false;
    const params = new URLSearchParams(hash);
    const route = params.get("view") || hash;
    if (
        params.has("player") ||
        params.has("match") ||
        [
            "leaderboard",
            "leaderboards",
            "weapons",
            "maps",
            "account",
            "store",
            "admin-progression",
            "admin-help",
            "admin-tickets",
            "community-dates"
        ].includes(route)
    ) {
        window.location.replace(`/stats/${window.location.search}#${hash}`);
        return true;
    }
    if (route === "playtests") {
        window.location.replace(`/playtests/${window.location.search}`);
        return true;
    }
    if (route === "feedback") {
        window.location.replace(`/feedback/${window.location.search}`);
        return true;
    }
    if (["help", "how-to-play", "faq"].includes(route)) {
        window.location.replace(`/help/${route === "help" ? "" : `#${route}`}`);
        return true;
    }
    return false;
}

function normalizeName(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "");
}

function modeLabel(value) {
    const text = String(value || "Match").replace(/([a-z])([A-Z])/g, "$1 $2");
    return text.replace(/^./, (character) => character.toUpperCase());
}

function whenReady() {
    if (document.readyState !== "loading") return Promise.resolve();
    return new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
}
