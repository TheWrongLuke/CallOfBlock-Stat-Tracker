import { formatDateTime } from "../utils/dates.js";
import { escapeHtml } from "../utils/sanitization.js";

const REQUIRED_FALLBACKS = new Set(["icon:minecraft", "background:default", "border:none", "title:none"]);
const COLLECTION_GROUPS = [
    { type: "background", label: "Backgrounds" },
    { type: "icon", label: "Profile icons" },
    { type: "border", label: "Icon borders" },
    { type: "title", label: "Titles" }
];

export function renderPlayerManagerContent({
    ready,
    players = [],
    catalog = [],
    grants = [],
    pendingGifts = [],
    revocations = [],
    selectedId = "",
    currentUserId = "",
    filters = {},
    grantKey = "",
    revokeKey = "",
    banOpen = false,
    message = "",
    error = "",
    saving = false
}) {
    if (!ready) {
        return `
            <section class="progression-state error" role="alert">
                <strong>Player Manager setup is required.</strong>
                <span>${escapeHtml(error || "Run the newest Player Manager Supabase script, then retry.")}</span>
                <button type="button" data-player-manager-retry>Retry</button>
            </section>
        `;
    }

    const visiblePlayers = filterPlayers(players, filters.search);
    const selected = players.find((profile) => profile.id === selectedId) || null;
    const bannedCount = players.filter((profile) => profile.banned_from_voting).length;
    const selectedGrants = selected ? grants.filter((grant) => grant.profile_id === selected.id) : [];
    const selectedPendingGifts = selected ? pendingGifts.filter((gift) => gift.profile_id === selected.id) : [];
    const selectedRevocations = selected ? revocations.filter((entry) => entry.profile_id === selected.id) : [];

    return `
        ${message ? `<p class="progression-notice">${escapeHtml(message)}</p>` : ""}
        ${error ? `<p class="progression-notice error" role="alert">${escapeHtml(error)}</p>` : ""}
        <section class="progression-metrics" aria-label="Player Manager overview">
            <div><span>Registered players</span><strong>${escapeHtml(players.length)}</strong></div>
            <div><span>Search results</span><strong>${escapeHtml(visiblePlayers.length)}</strong></div>
            <div><span>Community bans</span><strong>${escapeHtml(bannedCount)}</strong></div>
            <div><span>Selected collection</span><strong>${escapeHtml(selectedGrants.length)}</strong></div>
        </section>
        <section class="player-manager-layout">
            <div class="player-manager-directory">
                <label class="player-manager-search">
                    <span>Find player</span>
                    <input type="search" value="${escapeHtml(filters.search || "")}" data-player-manager-search placeholder="Display, Discord, or Minecraft name">
                </label>
                <div class="player-manager-list" aria-live="polite">
                    ${visiblePlayers.length ? visiblePlayers.map((profile) => renderPlayerRow(profile, selected?.id)).join("") : `<p class="progression-empty">No players match this search.</p>`}
                </div>
            </div>
            <div class="player-manager-detail">
                ${selected ? renderPlayerDetail(selected, catalog, selectedGrants, selectedPendingGifts, selectedRevocations, filters.collection, filters.sort, currentUserId) : renderNoPlayerSelected(players.length)}
            </div>
        </section>
        ${selected && grantKey ? renderGiftDialog(selected, catalog, selectedRevocations, grantKey, saving) : ""}
        ${selected && revokeKey ? renderRevokeDialog(selected, catalog, revokeKey, saving) : ""}
        ${selected && banOpen ? renderBanDialog(selected, currentUserId, saving) : ""}
    `;
}

function renderPlayerRow(profile, selectedId) {
    const name = playerName(profile);
    const secondary = [discordUsername(profile), profile.minecraft_player_name].filter(Boolean).join(" / ");
    return `
        <button class="player-manager-row ${profile.banned_from_voting ? "banned" : ""}" type="button" data-player-manager-select="${escapeHtml(profile.id)}" aria-current="${profile.id === selectedId ? "true" : "false"}">
            ${renderPlayerAvatar(profile, 42)}
            <span>
                <strong>${escapeHtml(name)}</strong>
                <small>${escapeHtml(secondary || "No linked game name")}</small>
            </span>
            ${profile.banned_from_voting ? `<em>Banned</em>` : ""}
        </button>
    `;
}

function renderPlayerDetail(
    profile,
    catalog,
    grants,
    pendingGifts,
    revocations,
    collectionFilter,
    collectionSort,
    currentUserId
) {
    const inventory = new Map(grants.map((grant) => [cosmeticKey(grant), grant]));
    const pending = new Map(pendingGifts.map((gift) => [cosmeticKey(gift), gift]));
    const revocationHistory = new Map(revocations.map((entry) => [cosmeticKey(entry), entry]));
    const collectionGroups = groupCollection(catalog, inventory, collectionFilter, collectionSort);
    const canBan = profile.id !== currentUserId && !profile.is_owner;
    return `
        <header class="player-manager-identity">
            ${renderPlayerAvatar(profile, 64)}
            <div>
                <p class="panel-kicker">Player Account</p>
                <h3>${escapeHtml(playerName(profile))}</h3>
                <span>${escapeHtml([discordUsername(profile), profile.minecraft_player_name].filter(Boolean).join(" / ") || "No linked game name")}</span>
                <small>${escapeHtml(`Joined ${safeDate(profile.created_at)}`)}</small>
            </div>
            <div class="player-manager-status-actions">
                ${profile.is_owner ? `<span class="player-role owner">Owner</span>` : ""}
                ${profile.is_admin ? `<span class="player-role admin">Admin</span>` : ""}
                <span class="player-role ${profile.banned_from_voting ? "banned" : "active"}">${profile.banned_from_voting ? "Community banned" : "Active"}</span>
                <button type="button" data-player-ban-open ${canBan ? "" : "disabled"}>${profile.banned_from_voting ? "Review ban" : "Ban player"}</button>
            </div>
        </header>
        ${
            profile.banned_from_voting
                ? `
            <div class="player-ban-summary">
                <strong>Community actions blocked</strong>
                <span>${escapeHtml(profile.ban_reason || "No reason recorded.")}</span>
                <small>${escapeHtml(profile.banned_at ? `Banned ${safeDate(profile.banned_at)}${profile.banned_by_username ? ` by @${profile.banned_by_username.replace(/^@/, "")}` : ""}` : "Ban date unavailable")}</small>
            </div>
        `
                : ""
        }
        <div class="player-collection-toolbar">
            <div>
                <p class="panel-kicker">Complete Collection</p>
                <strong>${escapeHtml(`${inventory.size} owned / ${catalog.length} catalog items`)}</strong>
            </div>
            <div class="player-collection-controls">
                <div class="player-collection-filters" aria-label="Collection filter">
                    ${renderCollectionFilter("all", "All", collectionFilter)}
                    ${renderCollectionFilter("owned", "Owned", collectionFilter)}
                    ${renderCollectionFilter("unowned", "Unowned", collectionFilter)}
                </div>
                <label class="player-collection-sort">
                    <span>Sort every section</span>
                    <select data-player-collection-sort aria-label="Sort every cosmetic section">
                        <option value="ownership" ${collectionSort !== "alphabetical" ? "selected" : ""}>Owned first</option>
                        <option value="alphabetical" ${collectionSort === "alphabetical" ? "selected" : ""}>Alphabetical</option>
                    </select>
                </label>
            </div>
        </div>
        <div class="player-collection-groups">
            ${collectionGroups.map((group) => renderCollectionGroup(profile, group, inventory, pending, revocationHistory, collectionFilter)).join("")}
        </div>
    `;
}

function renderCollectionGroup(profile, group, inventory, pending, revocationHistory, collectionFilter) {
    const filterLabel =
        collectionFilter === "owned" ? "owned" : collectionFilter === "unowned" ? "unowned" : "matching";
    return `
        <section class="player-collection-group" data-player-collection-group="${escapeHtml(group.type)}">
            <header class="player-collection-group-header">
                <h4>${escapeHtml(group.label)}</h4>
                <span>${escapeHtml(`${group.ownedCount} owned / ${group.totalCount}`)}</span>
            </header>
            <div class="player-collection-grid">
                ${group.items.length ? group.items.map((item) => renderCollectionItem(profile, item, inventory.get(cosmeticKey(item)), pending.get(cosmeticKey(item)), revocationHistory.get(cosmeticKey(item)))).join("") : `<p class="progression-empty">No ${escapeHtml(filterLabel)} ${escapeHtml(group.label.toLowerCase())}.</p>`}
            </div>
        </section>
    `;
}

function renderCollectionItem(profile, item, grant, pendingGift, revocation) {
    const owned = Boolean(grant);
    const requiredFallback = REQUIRED_FALLBACKS.has(cosmeticKey(item));
    const automaticProtected = grant?.source === "default" || grant?.source === "owner";
    const revocable = owned && !requiredFallback && !automaticProtected;
    const ownerRestricted = item.acquisitionType === "owner" && !profile.is_owner;
    const grantDisabled = item.active === false || ownerRestricted || Boolean(pendingGift);
    const key = cosmeticKey(item);
    return `
        <article class="player-collection-item rarity-${escapeHtml(item.rarity || "common")} ${owned ? "owned" : pendingGift ? "pending" : "unowned"} ${item.active === false ? "archived" : ""}" data-player-cosmetic-key="${escapeHtml(key)}">
            <div class="player-collection-preview">${renderCosmeticPreview(item)}</div>
            <div class="player-collection-copy">
                <small>${escapeHtml(`${cosmeticTypeLabel(item.type)} / ${item.rarity || "common"}`)}</small>
                <strong>${escapeHtml(item.name || item.label || item.id)}</strong>
                <span>${escapeHtml(owned ? ownershipLabel(grant) : pendingGift ? "Gift awaiting claim" : revocation ? "Revoked by admin" : item.active === false ? "Archived" : "Not owned")}</span>
                ${owned && grant.grant_note ? `<p>${escapeHtml(grant.grant_note)}</p>` : ""}
                ${!owned && pendingGift?.message ? `<p>${escapeHtml(pendingGift.message)}</p>` : ""}
                ${!owned && !pendingGift && revocation?.reason ? `<p>${escapeHtml(revocation.reason)}</p>` : ""}
            </div>
            <div class="player-collection-action">
                ${
                    owned && revocable
                        ? `
                    <button type="button" data-progression-grant-revoke data-profile-id="${escapeHtml(profile.id)}" data-cosmetic-type="${escapeHtml(item.type)}" data-cosmetic-id="${escapeHtml(item.id)}">Revoke</button>
                `
                        : owned
                          ? `<span>${requiredFallback ? "Required fallback" : escapeHtml(protectedOwnershipLabel(grant.source))}</span>`
                          : pendingGift
                            ? `<span>Awaiting claim</span>`
                            : `
                    <button type="button" data-player-grant-open="${escapeHtml(key)}" ${grantDisabled ? "disabled" : ""}>${ownerRestricted ? "Owner only" : item.active === false ? "Archived" : revocation ? "Restore" : "Give"}</button>
                `
                }
            </div>
        </article>
    `;
}

function renderGiftDialog(profile, catalog, revocations, grantKey, saving) {
    const item = catalog.find((entry) => cosmeticKey(entry) === grantKey);
    if (!item) return "";
    const restoring = revocations.some((entry) => cosmeticKey(entry) === grantKey);
    return `
        <div class="progression-modal-backdrop" data-player-grant-backdrop>
            <section class="progression-cosmetic-dialog player-action-dialog" role="dialog" aria-modal="true" aria-labelledby="player-gift-title">
                <header class="progression-dialog-header player-action-dialog-header">
                    <div class="player-action-dialog-preview">${renderCosmeticPreview(item)}</div>
                    <div>
                        <p class="panel-kicker">${restoring ? "Restore Cosmetic" : "Cosmetic Gift"}</p>
                        <h3 id="player-gift-title">${restoring ? "Restore" : "Give"} ${escapeHtml(item.name || item.id)}</h3>
                        <span>${escapeHtml(`Recipient: ${playerName(profile)}`)}</span>
                    </div>
                    <button class="progression-dialog-close" type="button" data-player-grant-close aria-label="Close gift dialog">X</button>
                </header>
                <form class="progression-cosmetic-form player-action-form" data-progression-grant-form>
                    <input type="hidden" name="profileId" value="${escapeHtml(profile.id)}">
                    <input type="hidden" name="cosmeticKey" value="${escapeHtml(grantKey)}">
                    <fieldset>
                        <legend>Gift details</legend>
                        <div class="progression-editor-fields">
                            <label><span>Grant type</span><select name="source"><option value="friend">Friend gift</option><option value="admin">Admin grant</option></select></label>
                            <label class="wide"><span>Gift note</span><textarea name="note" rows="4" maxlength="200" placeholder="Optional message stored with this gift"></textarea></label>
                        </div>
                    </fieldset>
                    <p class="progression-editor-status" role="status">The player receives a private notification. Ownership is added only when they claim the gift.${restoring ? " The earlier revocation note remains in private history." : ""}</p>
                    <footer class="progression-dialog-actions">
                        <button class="primary" type="submit" ${saving ? "disabled" : ""}>${saving ? "Sending..." : "Send gift"}</button>
                    </footer>
                </form>
            </section>
        </div>
    `;
}

function renderRevokeDialog(profile, catalog, revokeKey, saving) {
    const item = catalog.find((entry) => cosmeticKey(entry) === revokeKey);
    if (!item || REQUIRED_FALLBACKS.has(revokeKey)) return "";
    return `
        <div class="progression-modal-backdrop" data-player-revoke-backdrop>
            <section class="progression-cosmetic-dialog player-action-dialog" role="dialog" aria-modal="true" aria-labelledby="player-revoke-title">
                <header class="progression-dialog-header player-action-dialog-header">
                    <div class="player-action-dialog-preview">${renderCosmeticPreview(item)}</div>
                    <div>
                        <p class="panel-kicker">Revoke Cosmetic</p>
                        <h3 id="player-revoke-title">Revoke ${escapeHtml(item.name || item.id)}</h3>
                        <span>${escapeHtml(`Player: ${playerName(profile)}`)}</span>
                    </div>
                    <button class="progression-dialog-close" type="button" data-player-revoke-close aria-label="Close revoke dialog">X</button>
                </header>
                <form class="progression-cosmetic-form player-action-form" data-player-revoke-form>
                    <input type="hidden" name="profileId" value="${escapeHtml(profile.id)}">
                    <input type="hidden" name="cosmeticKey" value="${escapeHtml(revokeKey)}">
                    <label>
                        <span>Revocation note</span>
                        <textarea name="note" rows="4" minlength="3" maxlength="300" required placeholder="Why this cosmetic is being revoked"></textarea>
                    </label>
                    <p class="progression-editor-status" role="status">The note is kept in the revocation history. Progression rewards remain earnable and may return immediately when their requirement is already met.</p>
                    <footer class="progression-dialog-actions">
                        <button class="danger" type="submit" ${saving ? "disabled" : ""}>${saving ? "Saving..." : "Confirm revocation"}</button>
                    </footer>
                </form>
            </section>
        </div>
    `;
}

function renderBanDialog(profile, currentUserId, saving) {
    const banned = profile.banned_from_voting;
    const protectedProfile = profile.id === currentUserId || profile.is_owner;
    if (protectedProfile) return "";
    return `
        <div class="progression-modal-backdrop" data-player-ban-backdrop>
            <section class="progression-cosmetic-dialog player-action-dialog" role="dialog" aria-modal="true" aria-labelledby="player-ban-title">
                <header class="progression-dialog-header player-action-dialog-header">
                    ${renderPlayerAvatar(profile, 52)}
                    <div>
                        <p class="panel-kicker">Community Access</p>
                        <h3 id="player-ban-title">${banned ? "Unban" : "Ban"} ${escapeHtml(playerName(profile))}</h3>
                        <span>${banned ? "Restore protected community actions." : "Block votes, notifications, tickets, and weekly mission writes."}</span>
                    </div>
                    <button class="progression-dialog-close" type="button" data-player-ban-close aria-label="Close ban dialog">X</button>
                </header>
                <form class="progression-cosmetic-form player-action-form" data-player-ban-form>
                    <input type="hidden" name="profileId" value="${escapeHtml(profile.id)}">
                    <input type="hidden" name="banned" value="${banned ? "false" : "true"}">
                    ${
                        banned
                            ? `<p class="player-ban-dialog-copy">Current reason: ${escapeHtml(profile.ban_reason || "No reason recorded.")}</p>`
                            : `
                        <label><span>Ban reason</span><textarea name="reason" rows="4" maxlength="300" placeholder="Reason visible to administrators"></textarea></label>
                    `
                    }
                    <footer class="progression-dialog-actions">
                        <button class="${banned ? "primary" : "danger"}" type="submit" ${saving ? "disabled" : ""}>${saving ? "Saving..." : banned ? "Unban player" : "Confirm ban"}</button>
                    </footer>
                </form>
            </section>
        </div>
    `;
}

function renderNoPlayerSelected(playerCount) {
    return `<div class="player-manager-empty"><strong>${playerCount ? "Select a player" : "No registered players"}</strong><span>${playerCount ? "Choose an account from the directory." : "Accounts will appear after their first Discord login."}</span></div>`;
}

function renderCollectionFilter(value, label, selected) {
    return `<button type="button" data-player-collection-filter="${value}" aria-pressed="${selected === value ? "true" : "false"}">${label}</button>`;
}

function filterPlayers(players, searchValue) {
    const search = String(searchValue || "")
        .trim()
        .toLowerCase();
    return [...players]
        .filter(
            (profile) =>
                !search ||
                [profile.display_name, profile.username, profile.minecraft_player_name].some((value) =>
                    String(value || "")
                        .toLowerCase()
                        .includes(search)
                )
        )
        .sort(
            (a, b) =>
                Number(b.banned_from_voting) - Number(a.banned_from_voting) ||
                playerName(a).localeCompare(playerName(b))
        );
}

function groupCollection(catalog, inventory, filter, sort) {
    return COLLECTION_GROUPS.map((group) => {
        const groupCatalog = catalog.filter((item) => item.type === group.type);
        const items = groupCatalog
            .filter(
                (item) =>
                    filter === "all" ||
                    (filter === "owned" ? inventory.has(cosmeticKey(item)) : !inventory.has(cosmeticKey(item)))
            )
            .sort((a, b) => compareCollectionItems(a, b, inventory, sort));
        return {
            ...group,
            items,
            ownedCount: groupCatalog.filter((item) => inventory.has(cosmeticKey(item))).length,
            totalCount: groupCatalog.length
        };
    });
}

function compareCollectionItems(a, b, inventory, sort) {
    const nameOrder = String(a.name || a.label || a.id).localeCompare(String(b.name || b.label || b.id));
    if (sort === "alphabetical") return nameOrder;
    return Number(inventory.has(cosmeticKey(b))) - Number(inventory.has(cosmeticKey(a))) || nameOrder;
}

function renderPlayerAvatar(profile, size) {
    const url = safeImageUrl(profile.avatar_url);
    const initials = playerInitials(playerName(profile));
    return `
        <span class="player-manager-avatar" style="--player-avatar-size: ${escapeHtml(size)}px">
            <span>${escapeHtml(initials)}</span>
            ${url ? `<img src="${escapeHtml(url)}" alt="" loading="lazy" data-player-manager-avatar>` : ""}
        </span>
    `;
}

function renderCosmeticPreview(item) {
    if (item.type === "title") {
        return `<span class="profile-title-cosmetic rarity-${escapeHtml(item.rarity || "common")}">${escapeHtml(item.text || item.name || "Title")}</span>`;
    }
    const image = safeImageUrl(item.image);
    return image
        ? `<img src="${escapeHtml(image)}" alt="" loading="lazy">`
        : `<span class="progression-preview-placeholder">${escapeHtml(cosmeticTypeLabel(item.type))}</span>`;
}

function safeImageUrl(value) {
    const url = String(value || "").trim();
    if (/^https:\/\//i.test(url) || /^\.\.?(?:\/|\\)/.test(url) || /^\/(?!\/)/.test(url)) return url;
    return "";
}

function cosmeticKey(value) {
    if (value?.cosmetic_type) return `${value.cosmetic_type}:${value?.cosmetic_id || ""}`;
    return `${value?.type || ""}:${value?.id || ""}`;
}

function cosmeticTypeLabel(value) {
    return (
        {
            background: "Background",
            border: "Icon border",
            icon: "Profile icon",
            title: "Title"
        }[value] || "Cosmetic"
    );
}

function ownershipLabel(grant) {
    const label =
        {
            friend: "Friend gift",
            admin: "Admin grant",
            legacy: "Legacy grant",
            default: "Default unlock",
            progression: "Progression reward",
            owner: "Owner exclusive",
            purchase: "Purchased"
        }[grant?.source] || "Owned";
    return grant?.acquired_at ? `${label} / ${safeDate(grant.acquired_at)}` : label;
}

function protectedOwnershipLabel(source) {
    return (
        {
            default: "Default item",
            progression: "Earned item",
            owner: "Owner item",
            purchase: "Purchased item"
        }[source] || "Protected item"
    );
}

function playerName(profile) {
    return String(
        profile?.display_name || profile?.username || profile?.minecraft_player_name || "Unknown player"
    ).trim();
}

function discordUsername(profile) {
    const value = String(profile?.username || "")
        .trim()
        .replace(/^@/, "");
    return value ? `@${value}` : "";
}

function playerInitials(value) {
    const words = String(value || "?")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    return (
        words
            .slice(0, 2)
            .map((word) => word[0]?.toUpperCase() || "")
            .join("") || "?"
    );
}

function safeDate(value) {
    return value ? formatDateTime(value) : "Unknown";
}
