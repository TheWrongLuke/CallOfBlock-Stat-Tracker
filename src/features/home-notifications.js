import { createNotificationApi } from "../api/notifications.js";
import { renderGiftNotificationPopup, renderNotificationInbox } from "../views/notifications.js";

const POPUP_SEEN_KEY = "cob_notification_popup_seen_v1";

export async function initializeHomeNotifications(client) {
    if (!client) return;
    const api = createNotificationApi(client);
    const state = {
        items: [],
        loading: false,
        open: false,
        filter: "all",
        expandedId: "",
        busyId: "",
        giftId: "",
        message: "",
        error: ""
    };

    document.addEventListener("click", (event) => handleClick(event, api, state));
    document.addEventListener("cob:account-panel-open", () => {
        if (!state.open) return;
        state.open = false;
        render(state);
    });
    await loadNotifications(api, state, true);
}

async function loadNotifications(api, state, showGift) {
    state.loading = true;
    render(state);
    const result = await api.listOwn();
    state.loading = false;
    if (result.error) {
        state.error = "Notifications could not be loaded right now.";
        render(state);
        return;
    }
    state.items = (Array.isArray(result.data) ? result.data : []).map(normalizeNotification).filter(Boolean);
    if (showGift) {
        const seen = popupSeenIds();
        state.giftId =
            state.items.find(
                (item) => item.type === "cosmetic_gift" && !item.claimedAt && !item.readAt && !seen.has(item.id)
            )?.id || "";
        if (state.giftId) markPopupSeen(state.giftId);
    }
    render(state);
}

async function handleClick(event, api, state) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest("[data-notification-panel-open]")) {
        document.dispatchEvent(new CustomEvent("cob:notification-panel-open"));
        state.open = true;
        state.message = "";
        render(state);
        await loadNotifications(api, state, false);
        return;
    }
    if (target.closest("[data-home-notification-close]")) {
        state.open = false;
        render(state);
        return;
    }
    if (target.closest("[data-notification-gift-close]")) {
        state.giftId = "";
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
    renderDrawer(state);
    renderGift(state);
}

function renderBell(state) {
    const button = document.querySelector("[data-notification-panel-open]");
    if (!(button instanceof HTMLButtonElement)) return;
    const unread = state.items.filter((item) => !item.readAt).length;
    button.classList.toggle("has-unread", unread > 0);
    button.setAttribute("aria-expanded", state.open ? "true" : "false");
    button.setAttribute("aria-label", `Open notifications${unread ? `, ${unread} unread` : ""}`);
    button.querySelector(":scope > strong")?.remove();
    if (unread) button.insertAdjacentHTML("beforeend", `<strong>${unread > 99 ? "99+" : unread}</strong>`);
}

function renderDrawer(state) {
    let host = document.getElementById("account-side-panel-host");
    if (!host) {
        host = document.createElement("div");
        host.id = "account-side-panel-host";
        document.body.appendChild(host);
    }
    document.body.classList.toggle("account-drawer-open", state.open);
    if (!state.open) {
        host.innerHTML = "";
        return;
    }
    host.innerHTML = `<div class="profile-drawer-backdrop">
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

function normalizeNotification(row) {
    const id = String(row?.id || "").trim();
    const type = String(row?.notification_type || "").trim();
    if (!id || !["cosmetic_gift", "system"].includes(type)) return null;
    const cosmeticId = String(row?.cosmetic_id || "").trim();
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
        cosmeticName: String(row?.cosmetic_name || cosmeticId || row?.title || "Gift").slice(0, 80),
        cosmeticImage: safeImageUrl(row?.cosmetic_image_url || row?.image_url),
        cosmeticText: String(row?.cosmetic_name || cosmeticId || "Gift").slice(0, 80),
        cosmeticRarity: String(row?.cosmetic_rarity || row?.rarity || "common").toLowerCase()
    };
}

function safeImageUrl(value) {
    const url = String(value || "").trim();
    return /^https:\/\//i.test(url) || /^\/?assets\//i.test(url) ? url : "";
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
    sessionStorage.setItem(POPUP_SEEN_KEY, JSON.stringify([...seen].slice(-100)));
}
