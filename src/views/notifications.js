import { formatDateTime } from "../utils/dates.js";
import { escapeHtml } from "../utils/sanitization.js";

const RARITIES = new Set(["common", "rare", "epic", "legendary", "mythic"]);

export function renderNotificationInbox({
    items = [],
    loading = false,
    ready = true,
    filter = "all",
    expandedId = "",
    busyId = "",
    message = "",
    error = ""
} = {}) {
    const unread = items.filter((item) => !item.readAt).length;
    const visible = filter === "unread" ? items.filter((item) => !item.readAt) : items;

    return `
        <section class="notification-inbox" aria-label="Account notifications">
            <header class="notification-inbox-heading">
                <div>
                    <p class="panel-kicker">Notification Center</p>
                    <h3>Inbox</h3>
                </div>
                <strong>${escapeHtml(unread)} unread</strong>
            </header>
            <div class="notification-inbox-filters" aria-label="Notification filter">
                <button type="button" data-notification-filter="all" aria-pressed="${filter !== "unread"}">All</button>
                <button type="button" data-notification-filter="unread" aria-pressed="${filter === "unread"}">Unread</button>
                <button type="button" data-notification-refresh ${loading ? "disabled" : ""}>${loading ? "Refreshing..." : "Refresh"}</button>
            </div>
            ${message ? `<p class="notification-inbox-message">${escapeHtml(message)}</p>` : ""}
            ${error ? `<p class="notification-inbox-message error" role="alert">${escapeHtml(error)}</p>` : ""}
            ${renderNotificationState({ loading, ready, visible, expandedId, busyId, filter })}
        </section>
    `;
}

export function renderGiftNotificationPopup(notification, busy = false) {
    if (!notification || notification.type !== "cosmetic_gift" || notification.claimedAt) return "";
    return `
        <div class="notification-gift-backdrop" data-notification-gift-backdrop>
            <section class="notification-gift-dialog rarity-${rarity(notification)}" role="dialog" aria-modal="true" aria-labelledby="notification-gift-title">
                <button class="notification-gift-close" type="button" data-notification-gift-close aria-label="Close gift notification">X</button>
                <div class="notification-gift-preview">${renderCosmeticPreview(notification, true)}</div>
                <p class="panel-kicker">You Got A Gift</p>
                <h2 id="notification-gift-title">${escapeHtml(notification.cosmeticName || notification.title || "New cosmetic")}</h2>
                ${notification.message ? `<p class="notification-gift-message">${escapeHtml(notification.message)}</p>` : ""}
                <span class="notification-gift-sender">From ${escapeHtml(notification.senderName || "Call of Block")}</span>
                <div class="notification-gift-actions">
                    <button type="button" data-notification-gift-close ${busy ? "disabled" : ""}>Close</button>
                    <button class="primary" type="button" data-notification-claim="${escapeHtml(notification.id)}" ${busy ? "disabled" : ""}>${busy ? "Claiming..." : "Claim cosmetic"}</button>
                </div>
            </section>
        </div>
    `;
}

function renderNotificationState({ loading, ready, visible, expandedId, busyId, filter }) {
    if (loading && !visible.length) {
        return `<div class="notification-inbox-state"><strong>Loading notifications...</strong></div>`;
    }
    if (!ready) {
        return `
            <div class="notification-inbox-state error">
                <strong>Notification setup is required.</strong>
                <span>Run the new Supabase notification migration, then refresh this inbox.</span>
            </div>
        `;
    }
    if (!visible.length) {
        return `
            <div class="notification-inbox-state">
                <strong>${filter === "unread" ? "No unread notifications" : "Your inbox is empty"}</strong>
                <span>${filter === "unread" ? "Read notifications remain available under All." : "Gifts and account updates will appear here."}</span>
            </div>
        `;
    }
    return `<div class="notification-list">${visible.map((item) => renderNotificationItem(item, expandedId === item.id, busyId === item.id)).join("")}</div>`;
}

function renderNotificationItem(item, open, busy) {
    const pendingGift = item.type === "cosmetic_gift" && !item.claimedAt;
    const status = item.claimedAt ? "Claimed" : pendingGift ? "Gift waiting" : item.readAt ? "Read" : "Unread";
    return `
        <article class="notification-item ${item.readAt ? "read" : "unread"} ${open ? "open" : ""}">
            <button class="notification-item-summary" type="button" data-notification-toggle="${escapeHtml(item.id)}" aria-expanded="${open}">
                ${renderCosmeticPreview(item)}
                <span class="notification-item-copy">
                    <small>${escapeHtml(notificationKindLabel(item))} - ${escapeHtml(formatDateTime(item.createdAt))}</small>
                    <strong>${escapeHtml(item.title || item.cosmeticName || "Notification")}</strong>
                    <span>${escapeHtml(item.message || status)}</span>
                </span>
                ${item.readAt ? "" : `<span class="notification-unread-dot" aria-label="Unread"></span>`}
                <span class="notification-expand-icon" aria-hidden="true">${open ? "-" : "+"}</span>
            </button>
            ${
                open
                    ? `
                <div class="notification-item-detail">
                    ${item.message ? `<p>${escapeHtml(item.message)}</p>` : ""}
                    <div class="notification-item-meta">
                        <span>From ${escapeHtml(item.senderName || "Call of Block")}</span>
                        <strong>${escapeHtml(status)}</strong>
                    </div>
                    <div class="notification-item-actions">
                        ${pendingGift ? `<button class="primary" type="button" data-notification-claim="${escapeHtml(item.id)}" ${busy ? "disabled" : ""}>${busy ? "Claiming..." : "Claim cosmetic"}</button>` : ""}
                        <button type="button" data-notification-read="${escapeHtml(item.id)}" data-notification-read-value="${item.readAt ? "false" : "true"}" ${busy ? "disabled" : ""}>Mark ${item.readAt ? "unread" : "read"}</button>
                        <button class="danger" type="button" data-notification-delete="${escapeHtml(item.id)}" ${busy ? "disabled" : ""}>Delete</button>
                    </div>
                </div>
            `
                    : ""
            }
        </article>
    `;
}

function renderCosmeticPreview(notification, large = false) {
    const className = `notification-cosmetic-preview rarity-${rarity(notification)} ${large ? "large" : ""}`;
    if (notification.cosmeticType === "title") {
        return `<span class="${className}"><span>${escapeHtml(notification.cosmeticText || notification.cosmeticName || "Title")}</span></span>`;
    }
    const fallback =
        String(notification.cosmeticName || notification.title || "G")
            .trim()
            .charAt(0)
            .toUpperCase() || "G";
    return `
        <span class="${className}">
            <span class="notification-preview-fallback">${escapeHtml(fallback)}</span>
            ${notification.cosmeticImage ? `<img src="${escapeHtml(notification.cosmeticImage)}" alt="" loading="eager" decoding="async" data-notification-preview-image>` : ""}
        </span>
    `;
}

function notificationKindLabel(notification) {
    if (notification.type === "cosmetic_gift") return notification.claimedAt ? "Cosmetic claimed" : "Cosmetic gift";
    return "Account update";
}

function rarity(notification) {
    return RARITIES.has(notification.cosmeticRarity) ? notification.cosmeticRarity : "common";
}
