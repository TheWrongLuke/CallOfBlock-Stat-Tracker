import { createNotificationApi } from "../api/notifications.js";
import { notificationKind, rewardPopupEligible } from "../core/notification-kinds.js";
import { BADGE_CATALOG, badgeArtworkUrl } from "../config/badges.js";
import { cosmeticArtworkUrl } from "../core/cosmetic-artwork.js";
import { renderGiftNotificationPopup, renderNotificationInbox } from "../views/notifications.js";

const POPUP_SEEN_KEY = "cob_notification_popup_seen_v1";
let initializationPromise = null;

export async function initializeHomeNotifications(client, drawer) {
    if (!client || !drawer) return;
    if (initializationPromise) return initializationPromise;
    initializationPromise = initialize(client, drawer);
    return initializationPromise;
}

async function initialize(client, drawer) {
    const api = createNotificationApi(client);
    const session = await client.auth.getSession();
    const state = {
        userId: session.data?.session?.user?.id || "",
        drawer,
        items: [],
        loading: false,
        loadVersion: 0,
        filter: "all",
        expandedId: "",
        busyId: "",
        giftId: "",
        message: "",
        error: ""
    };

    document.addEventListener("click", (event) => handleClick(event, api, state));
    drawer.register("notifications", ({ host }) => renderDrawer(state, host));
    drawer.subscribe(() => renderBell(state));
    const refresh = () => {
        if (state.userId && !document.hidden && !state.loading && !state.busyId)
            void loadNotifications(api, state, true);
    };
    window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    client.auth.onAuthStateChange((_event, nextSession) => {
        const nextId = nextSession?.user?.id || "";
        if (nextId === state.userId) return;
        state.userId = nextId;
        state.loadVersion++;
        state.items = [];
        state.giftId = "";
        state.loading = false;
        state.busyId = "";
        state.message = "";
        state.error = "";
        render(state);
        if (nextId) queueMicrotask(refresh);
    });
    if (state.userId) await loadNotifications(api, state, true);
}

async function loadNotifications(api, state, showGift) {
    if (!state.userId || state.loading) return;
    const userId = state.userId;
    const loadVersion = ++state.loadVersion;
    state.loading = true;
    render(state);
    let result;
    try {
        result = await api.listOwn();
    } catch (error) {
        result = { error };
    }
    if (loadVersion !== state.loadVersion || userId !== state.userId) return;
    state.loading = false;
    if (result.error) {
        state.error = "Notifications could not be loaded right now.";
        render(state);
        return;
    }
    state.items = (Array.isArray(result.data) ? result.data : []).map(normalizeNotification).filter(Boolean);
    state.error = "";
    if (!state.items.some((item) => item.id === state.giftId && !item.claimedAt)) state.giftId = "";
    if (showGift) openNextReward(api, state);
    render(state);
}

async function handleClick(event, api, state) {
    if (!state.userId) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest("[data-notification-panel-open]")) {
        state.drawer.open("notifications");
        state.message = "";
        render(state);
        window.requestAnimationFrame(() => document.querySelector("[data-home-notification-close]")?.focus());
        await loadNotifications(api, state, false);
        return;
    }
    if (target.closest("[data-home-notification-close]")) {
        state.drawer.close("notifications");
        render(state);
        window.requestAnimationFrame(() => document.querySelector("[data-notification-panel-open]")?.focus());
        return;
    }
    const backdrop = target.closest("[data-home-notification-backdrop]");
    if (backdrop && event.target === backdrop) {
        state.drawer.close("notifications");
        render(state);
        return;
    }
    if (target.closest("[data-notification-gift-close]")) {
        state.giftId = "";
        openNextReward(api, state);
        render(state);
        return;
    }
    const filter = target.closest("[data-notification-filter]");
    if (filter) {
        state.filter = filter.dataset.notificationFilter === "unread" ? "unread" : "all";
        render(state);
        return;
    }
    if (target.closest("[data-notification-refresh]")) {
        await loadNotifications(api, state, false);
        return;
    }

    const toggle = target.closest("[data-notification-toggle]");
    if (toggle) {
        const id = toggle.dataset.notificationToggle || "";
        state.expandedId = state.expandedId === id ? "" : id;
        const item = state.items.find((entry) => entry.id === id);
        if (item && !item.readAt) await setRead(api, state, item, true);
        render(state);
        return;
    }
    const read = target.closest("[data-notification-read]");
    if (read) {
        const item = state.items.find((entry) => entry.id === read.dataset.notificationRead);
        if (item) await setRead(api, state, item, read.dataset.notificationReadValue === "true");
        return;
    }
    const remove = target.closest("[data-notification-delete]");
    if (remove) {
        const id = remove.dataset.notificationDelete || "";
        await withBusy(state, id, async () => {
            const result = await api.delete(id);
            if (result.error) throw result.error;
            state.items = state.items.filter((item) => item.id !== id);
            state.expandedId = "";
        });
        return;
    }
    const claim = target.closest("[data-notification-claim]");
    if (claim) {
        const id = claim.dataset.notificationClaim || "";
        if (state.items.find((item) => item.id === id)?.type !== "cosmetic_gift") return;
        await withBusy(state, id, async () => {
            const result = await api.claimGift(id);
            if (result.error) throw result.error;
            const item = state.items.find((entry) => entry.id === id);
            if (item) {
                item.claimedAt = new Date().toISOString();
                item.readAt ||= item.claimedAt;
                state.message = `${item.cosmeticName || "Cosmetic"} was added to your collection.`;
            }
            state.giftId = "";
            openNextReward(api, state);
        });
    }
}

async function setRead(api, state, item, read) {
    await withBusy(state, item.id, async () => {
        const result = await api.markRead(item.id, read);
        if (result.error) throw result.error;
        item.readAt = read ? new Date().toISOString() : "";
    });
}

async function withBusy(state, id, action) {
    if (!id || state.busyId) return;
    state.busyId = id;
    state.error = "";
    render(state);
    try {
        await action();
    } catch (error) {
        console.warn("Could not update the notification", error);
        state.error = "Could not update this notification.";
    } finally {
        state.busyId = "";
        render(state);
    }
}

function render(state) {
    renderBell(state);
    state.drawer.refresh("notifications");
    renderGift(state);
}

function renderBell(state) {
    const button = document.querySelector("[data-notification-panel-open]");
    if (!(button instanceof HTMLButtonElement)) return;
    const unread = state.items.filter((item) => !item.readAt).length;
    button.classList.toggle("has-unread", unread > 0);
    button.setAttribute("aria-expanded", state.drawer.isActive("notifications") ? "true" : "false");
    button.setAttribute("aria-label", `Open notifications${unread ? `, ${unread} unread` : ""}`);
    button.querySelector(":scope > strong")?.remove();
    if (unread) button.insertAdjacentHTML("beforeend", `<strong>${unread > 99 ? "99+" : unread}</strong>`);
}

function renderDrawer(state, host) {
    host.innerHTML = `<div class="profile-drawer-backdrop" data-home-notification-backdrop>
        <aside class="profile-drawer notification-drawer" role="dialog" aria-modal="true" aria-labelledby="home-notification-title">
            <header class="profile-drawer-header"><h2 id="home-notification-title">NOTIFICATIONS</h2><button class="profile-drawer-close" type="button" data-home-notification-close aria-label="Close notification panel">&times;</button></header>
            ${renderNotificationInbox({
                items: state.items,
                loading: state.loading,
                ready: true,
                filter: state.filter,
                expandedId: state.expandedId,
                busyId: state.busyId,
                message: state.message,
                error: state.error
            })}
        </aside>
    </div>`;
}

function renderGift(state) {
    let host = document.getElementById("notification-gift-host");
    if (!host) {
        host = document.createElement("div");
        host.id = "notification-gift-host";
        document.body.appendChild(host);
    }
    const gift = state.items.find((item) => item.id === state.giftId && !item.claimedAt);
    document.body.classList.toggle("notification-gift-open", Boolean(gift));
    host.innerHTML = gift ? renderGiftNotificationPopup(gift, state.busyId === gift.id) : "";
}

function openNextReward(api, state) {
    if (state.giftId) return;
    const seen = popupSeenIds();
    const item = state.items.find((entry) => rewardPopupEligible(entry, seen));
    if (!item) return;
    state.giftId = item.id;
    markPopupSeen(item.id);
    item.readAt = new Date().toISOString();
    void api.markRead(item.id, true).catch(() => {});
}

function normalizeNotification(row) {
    const id = String(row?.id || "").trim();
    const type = notificationKind(row);
    if (!id || !type) return null;
    const cosmeticId = String(row?.cosmetic_id || "").trim();
    const badge = row?.cosmetic_type === "badge" ? BADGE_CATALOG.find((item) => item.id === cosmeticId) : null;
    return {
        id,
        type,
        title: String(row?.title || "Notification").slice(0, 120),
        message: String(row?.message || "").slice(0, 500),
        cosmeticType: String(row?.cosmetic_type || ""),
        cosmeticId,
        senderName: String(row?.sender_name || "Call of Block").slice(0, 80),
        readAt: String(row?.read_at || ""),
        claimedAt: String(row?.claimed_at || ""),
        createdAt: String(row?.created_at || ""),
        cosmeticName: String(badge?.label || row?.cosmetic_name || cosmeticId || row?.title || "Gift").slice(0, 80),
        cosmeticImage: safeImageUrl(
            badge ? badgeArtworkUrl(badge.id) : cosmeticArtworkUrl(row?.cosmetic_image_url || row?.image_url)
        ),
        cosmeticText: String(badge?.label || row?.cosmetic_name || cosmeticId || "Gift").slice(0, 80),
        cosmeticRarity: String(row?.cosmetic_rarity || row?.rarity || "common").toLowerCase()
    };
}

function safeImageUrl(value) {
    const url = String(value || "").trim();
    return /^https:\/\//i.test(url) || /^(?:\.\/|\/)?assets\//i.test(url) ? url : "";
}

function popupSeenIds() {
    try {
        const values = JSON.parse(sessionStorage.getItem(POPUP_SEEN_KEY) || "[]");
        return new Set(Array.isArray(values) ? values : []);
    } catch (_error) {
        return new Set();
    }
}

function markPopupSeen(id) {
    const seen = popupSeenIds();
    seen.add(id);
    try {
        sessionStorage.setItem(POPUP_SEEN_KEY, JSON.stringify([...seen].slice(-100)));
    } catch {
        // Inbox read state still prevents repeats when browser storage is unavailable.
    }
}
