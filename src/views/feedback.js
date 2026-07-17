import {
    TICKET_CATEGORIES,
    TICKET_CONTEXTS,
    TICKET_LIMITS,
    TICKET_SEVERITIES,
    TICKET_SORTS,
    TICKET_STATUSES,
    USER_CLOSABLE_TICKET_STATUSES,
    USER_REOPENABLE_TICKET_STATUSES,
    ticketCategoryLabel,
    ticketContextLabel,
    ticketSeverityLabel,
    ticketStatusLabel
} from "../config/feedback.js";
import { formatDateTime } from "../utils/dates.js";
import { escapeHtml } from "../utils/sanitization.js";
import { validateExternalUrl } from "../utils/feedback-validation.js";
import { FEEDBACK_ATTACHMENT_ACCEPT, feedbackAttachmentPathFromUrl } from "../services/feedback-attachments.js";

function renderOptions(options, selected, allLabel = "") {
    return [
        allLabel ? `<option value="all" ${selected === "all" ? "selected" : ""}>${escapeHtml(allLabel)}</option>` : "",
        ...options.map(
            (option) =>
                `<option value="${escapeHtml(option.value)}" ${selected === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`
        )
    ].join("");
}

function ticketShortId(ticketId) {
    return String(ticketId || "")
        .split("-")[0]
        .toUpperCase();
}

function renderFieldError(name) {
    return `<small class="field-error" id="feedback-${escapeHtml(name)}-error" data-feedback-field-error="${escapeHtml(name)}"></small>`;
}

function renderTicketBadge(kind, value, label) {
    return `<span class="ticket-badge ${escapeHtml(kind)}-${escapeHtml(value)}">${escapeHtml(label)}</span>`;
}

export function renderFeedbackContent({
    authConfigured,
    authReady,
    loggedIn,
    loading,
    tickets,
    statusFilter,
    categoryFilter,
    message,
    error
}) {
    if (!authConfigured) {
        return renderFeedbackAccessState("Discord login is not configured for this site yet.", false);
    }
    if (!authReady) return renderLoadingState("Checking your Discord account...");
    if (!loggedIn) {
        return `
            <section class="feedback-access">
                <div>
                    <p class="panel-kicker">Discord Account Required</p>
                    <h3>Sign in to create and track tickets.</h3>
                    <p>Your Discord account keeps reports private to you and lets staff reply without exposing another player's tickets.</p>
                </div>
                <button type="button" data-auth-login>Login with Discord</button>
            </section>
            ${renderFeedbackCategories()}
        `;
    }

    const filtered = tickets.filter((ticket) => {
        if (statusFilter !== "all" && ticket.status !== statusFilter) return false;
        if (categoryFilter !== "all" && ticket.category !== categoryFilter) return false;
        return true;
    });

    return `
        ${message ? `<p class="feedback-notice success" role="status">${escapeHtml(message)}</p>` : ""}
        ${error ? `<div class="feedback-notice error" role="alert"><span>${escapeHtml(error)}</span><button type="button" data-feedback-retry>Retry</button></div>` : ""}
        <div class="feedback-layout">
            ${renderTicketForm()}
            <section class="my-tickets" aria-labelledby="my-tickets-title">
                <header class="my-tickets-header">
                    <div>
                        <p class="panel-kicker">My Tickets</p>
                        <h3 id="my-tickets-title">${tickets.length} submitted</h3>
                    </div>
                    <div class="ticket-filter-row">
                        <label><span>Status</span><select data-feedback-filter="status">${renderOptions(TICKET_STATUSES, statusFilter, "All statuses")}</select></label>
                        <label><span>Category</span><select data-feedback-filter="category">${renderOptions(TICKET_CATEGORIES, categoryFilter, "All categories")}</select></label>
                    </div>
                </header>
                ${
                    loading
                        ? renderLoadingState("Loading your tickets...")
                        : filtered.length
                          ? `<div class="ticket-list">${filtered.map(renderTicketListItem).join("")}</div>`
                          : renderEmptyState(
                                tickets.length
                                    ? "No tickets match these filters."
                                    : "You have not submitted a ticket yet."
                            )
                }
            </section>
        </div>
    `;
}

function renderTicketForm() {
    return `
        <section class="ticket-create" aria-labelledby="create-ticket-title">
            <header>
                <p class="panel-kicker">New Ticket</p>
                <h3 id="create-ticket-title">Tell us what happened.</h3>
            </header>
            <form data-feedback-create novalidate>
                <div class="feedback-form-grid">
                    <label>
                        <span>Category</span>
                        <select name="category" required aria-describedby="feedback-category-error">${renderOptions(TICKET_CATEGORIES, "bug_report")}</select>
                        ${renderFieldError("category")}
                    </label>
                    <label>
                        <span>Severity</span>
                        <select name="severity" required aria-describedby="feedback-severity-error">${renderOptions(TICKET_SEVERITIES, "medium")}</select>
                        ${renderFieldError("severity")}
                    </label>
                    <label class="wide">
                        <span>Short title</span>
                        <input name="title" required minlength="5" maxlength="${TICKET_LIMITS.title}" autocomplete="off" aria-describedby="feedback-title-error" placeholder="Briefly describe the issue">
                        ${renderFieldError("title")}
                    </label>
                    <label class="wide">
                        <span>Detailed description</span>
                        <textarea name="description" required minlength="20" maxlength="${TICKET_LIMITS.description}" rows="7" aria-describedby="feedback-description-error" placeholder="Include enough detail for someone else to understand and investigate it."></textarea>
                        ${renderFieldError("description")}
                    </label>
                    <label class="wide">
                        <span>Game mode or area</span>
                        <select name="contextArea" required aria-describedby="feedback-contextArea-error">${renderOptions(TICKET_CONTEXTS, "not_applicable")}</select>
                        ${renderFieldError("contextArea")}
                    </label>
                </div>
                <details class="ticket-optional-fields">
                    <summary>Additional details</summary>
                    <div class="feedback-form-grid">
                        <label><span>Map</span><input name="mapName" maxlength="${TICKET_LIMITS.mapName}" autocomplete="off">${renderFieldError("mapName")}</label>
                        <label><span>Weapon or item</span><input name="weaponOrItem" maxlength="${TICKET_LIMITS.weaponOrItem}" autocomplete="off">${renderFieldError("weaponOrItem")}</label>
                        <label class="wide"><span>Match ID</span><input name="matchId" maxlength="${TICKET_LIMITS.matchId}" autocomplete="off">${renderFieldError("matchId")}</label>
                        <label class="wide"><span>Steps to reproduce</span><textarea name="reproductionSteps" maxlength="${TICKET_LIMITS.reproductionSteps}" rows="5"></textarea>${renderFieldError("reproductionSteps")}</label>
                        <label class="wide"><span>Expected result</span><textarea name="expectedResult" maxlength="${TICKET_LIMITS.expectedResult}" rows="4"></textarea>${renderFieldError("expectedResult")}</label>
                        <label class="wide"><span>Actual result</span><textarea name="actualResult" maxlength="${TICKET_LIMITS.actualResult}" rows="4"></textarea>${renderFieldError("actualResult")}</label>
                        <label class="wide ticket-attachment-field">
                            <span>Attach screenshot or short clip</span>
                            <input name="attachment" type="file" accept="${escapeHtml(FEEDBACK_ATTACHMENT_ACCEPT)}" aria-describedby="feedback-attachment-help feedback-attachment-error">
                            <small class="ticket-attachment-help" id="feedback-attachment-help">PNG, JPEG, WebP, GIF, MP4, WebM, or MOV. Maximum 6 MB. Attachments are private to you and staff.</small>
                            ${renderFieldError("attachment")}
                        </label>
                        <div class="ticket-media-divider wide" aria-hidden="true"><span>or</span></div>
                        <label class="wide"><span>External screenshot or video URL</span><input name="externalMediaUrl" type="url" inputmode="url" maxlength="${TICKET_LIMITS.externalMediaUrl}" placeholder="https://">${renderFieldError("externalMediaUrl")}</label>
                    </div>
                </details>
                <p class="feedback-form-status" data-feedback-form-status role="status"></p>
                <button class="feedback-submit" type="submit">Submit ticket</button>
            </form>
        </section>
    `;
}

function renderTicketListItem(ticket) {
    return `
        <a class="ticket-list-item severity-${escapeHtml(ticket.severity)}" href="#ticket=${encodeURIComponent(ticket.id)}">
            <div class="ticket-list-item-main">
                <span class="ticket-id">#${escapeHtml(ticketShortId(ticket.id))}</span>
                <strong>${escapeHtml(ticket.title)}</strong>
                <small>${escapeHtml(ticketCategoryLabel(ticket.category))} / Updated ${escapeHtml(formatDateTime(ticket.updated_at))}</small>
            </div>
            <div class="ticket-list-item-state">
                ${renderTicketBadge("status", ticket.status, ticketStatusLabel(ticket.status))}
                ${renderTicketBadge("severity", ticket.severity, ticketSeverityLabel(ticket.severity))}
            </div>
        </a>
    `;
}

export function renderTicketDetailContent({
    authConfigured,
    authReady,
    loggedIn,
    admin,
    loading,
    ticket,
    messages,
    history,
    reporter,
    admins,
    accountId,
    error,
    message,
    authorNames,
    attachment = null
}) {
    if (!authConfigured) return renderFeedbackAccessState("Discord login is not configured for this site yet.", false);
    if (!authReady || loading) return renderLoadingState("Loading ticket...");
    if (!loggedIn) return renderFeedbackAccessState("Login with Discord to open this ticket.", true);
    if (error)
        return `<div class="feedback-notice error" role="alert"><span>${escapeHtml(error)}</span><button type="button" data-ticket-retry>Retry</button></div>`;
    if (!ticket) return renderEmptyState("Ticket not found, or this account does not have permission to view it.");

    const canClose = !admin && USER_CLOSABLE_TICKET_STATUSES.includes(ticket.status);
    const canReopen = !admin && USER_REOPENABLE_TICKET_STATUSES.includes(ticket.status);
    return `
        <section class="ticket-detail-header">
            <div>
                <a href="${admin ? "#admin-tickets" : "#feedback"}">${admin ? "Ticket dashboard" : "My tickets"}</a>
                <p class="panel-kicker">Ticket #${escapeHtml(ticketShortId(ticket.id))}</p>
                <h2>${escapeHtml(ticket.title)}</h2>
                <div class="ticket-badge-row">
                    ${renderTicketBadge("status", ticket.status, ticketStatusLabel(ticket.status))}
                    ${renderTicketBadge("severity", ticket.severity, ticketSeverityLabel(ticket.severity))}
                    ${renderTicketBadge("category", ticket.category, ticketCategoryLabel(ticket.category))}
                </div>
            </div>
            <div class="ticket-detail-actions">
                <button type="button" data-ticket-copy-id="${escapeHtml(ticket.id)}">Copy ID</button>
                ${admin ? `<button type="button" data-ticket-copy-summary>Copy summary</button>` : ""}
                ${canClose ? `<button type="button" data-ticket-user-status="closed">Close ticket</button>` : ""}
                ${canReopen ? `<button type="button" data-ticket-user-status="open">Reopen ticket</button>` : ""}
            </div>
        </section>
        ${message ? `<p class="feedback-notice success" role="status">${escapeHtml(message)}</p>` : ""}
        <div class="ticket-detail-layout">
            <div class="ticket-detail-main">
                ${renderTicketReport(ticket, attachment)}
                ${renderTicketConversation(ticket, messages, admin, accountId, authorNames)}
            </div>
            <aside class="ticket-detail-sidebar">
                ${admin ? renderAdminTicketControls(ticket, admins) : renderTicketTimeline(ticket)}
                ${admin ? renderReporterPanel(reporter) : ""}
                ${admin ? renderTicketHistory(history, authorNames) : ""}
            </aside>
        </div>
    `;
}

function renderTicketReport(ticket, attachment) {
    const fields = [
        ["Game mode or area", ticketContextLabel(ticket.context_area)],
        ["Map", ticket.map_name],
        ["Weapon or item", ticket.weapon_or_item],
        ["Match ID", ticket.match_id],
        ["Steps to reproduce", ticket.reproduction_steps],
        ["Expected result", ticket.expected_result],
        ["Actual result", ticket.actual_result]
    ].filter(([, value]) => value);
    return `
        <section class="ticket-report">
            <header>
                <div><p class="panel-kicker">Report</p><h3>Submitted ${escapeHtml(formatDateTime(ticket.created_at))}</h3></div>
                <small>Updated ${escapeHtml(formatDateTime(ticket.updated_at))}</small>
            </header>
            <div class="ticket-description">${escapeHtml(ticket.description)}</div>
            ${fields.length ? `<dl class="ticket-context-list">${fields.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>` : ""}
            ${renderTicketMedia(ticket.external_media_url, attachment)}
        </section>
    `;
}

function renderTicketMedia(storedUrl, attachment) {
    const managed = Boolean(feedbackAttachmentPathFromUrl(storedUrl));
    if (managed) {
        if (attachment?.loading) return `<p class="ticket-attachment-state">Loading private attachment...</p>`;
        if (attachment?.error) {
            return `<p class="ticket-attachment-state error">${escapeHtml(attachment.error)}</p>`;
        }
        const signed = validateExternalUrl(attachment?.signedUrl);
        if (!signed.valid || !signed.value) {
            return `<p class="ticket-attachment-state error">Private attachment is unavailable.</p>`;
        }
        if (attachment.kind === "image") {
            return `<figure class="ticket-attachment-preview"><a href="${escapeHtml(signed.value)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(signed.value)}" alt="Attached screenshot evidence" loading="lazy" referrerpolicy="no-referrer"></a><figcaption>Private screenshot attachment</figcaption></figure>`;
        }
        if (attachment.kind === "video") {
            return `<figure class="ticket-attachment-preview"><video src="${escapeHtml(signed.value)}" controls preload="metadata" playsinline></video><figcaption><a href="${escapeHtml(signed.value)}" target="_blank" rel="noopener noreferrer">Open private clip</a></figcaption></figure>`;
        }
        return `<a class="ticket-media-link" href="${escapeHtml(signed.value)}" target="_blank" rel="noopener noreferrer">Open private attachment</a>`;
    }

    const media = validateExternalUrl(storedUrl);
    return media.valid && media.value
        ? `<a class="ticket-media-link" href="${escapeHtml(media.value)}" target="_blank" rel="noopener noreferrer">Open external media</a>`
        : "";
}

function renderTicketConversation(ticket, messages, admin, accountId, authorNames) {
    const locked = !admin && ["closed", "rejected"].includes(ticket.status);
    return `
        <section class="ticket-conversation">
            <header><p class="panel-kicker">Conversation</p><h3>${messages.length} ${messages.length === 1 ? "reply" : "replies"}</h3></header>
            ${
                messages.length
                    ? `<div class="ticket-message-list">${messages.map((entry) => renderTicketMessage(entry, accountId, authorNames)).join("")}</div>`
                    : renderEmptyState("No replies yet.")
            }
            ${
                locked
                    ? `<p class="ticket-locked-note">Reopen this ticket before adding another reply.</p>`
                    : `<form class="ticket-reply-form" data-ticket-reply novalidate>
                    <label><span>${admin ? "Staff message" : "Reply"}</span><textarea name="message" required minlength="2" maxlength="${TICKET_LIMITS.reply}" rows="5" aria-describedby="ticket-reply-error"></textarea></label>
                    ${admin ? `<label class="ticket-private-toggle"><input type="checkbox" name="privateNote"><span>Private staff note</span></label>` : ""}
                    <small class="field-error" id="ticket-reply-error" data-ticket-reply-error></small>
                    <p class="feedback-form-status" data-ticket-reply-status role="status"></p>
                    <button type="submit">${admin ? "Add staff message" : "Send reply"}</button>
                </form>`
            }
        </section>
    `;
}

function renderTicketMessage(entry, accountId, authorNames) {
    const author =
        authorNames?.get(entry.author_id) ||
        (entry.author_id === accountId ? "You" : entry.is_staff_reply ? "Call of Block Staff" : "Player");
    const type = entry.is_private_staff_note ? "private" : entry.is_staff_reply ? "staff" : "player";
    return `
        <article class="ticket-message ${type}">
            <header><strong>${escapeHtml(author)}</strong><span>${entry.is_private_staff_note ? "Private note" : entry.is_staff_reply ? "Staff reply" : "Player reply"}</span><time>${escapeHtml(formatDateTime(entry.created_at))}</time></header>
            <p>${escapeHtml(entry.message)}</p>
        </article>
    `;
}

function renderTicketTimeline(ticket) {
    return `
        <section class="ticket-timeline">
            <p class="panel-kicker">Current State</p>
            <h3>${escapeHtml(ticketStatusLabel(ticket.status))}</h3>
            <dl>
                <div><dt>Severity</dt><dd>${escapeHtml(ticketSeverityLabel(ticket.severity))}</dd></div>
                <div><dt>Category</dt><dd>${escapeHtml(ticketCategoryLabel(ticket.category))}</dd></div>
                <div><dt>Created</dt><dd>${escapeHtml(formatDateTime(ticket.created_at))}</dd></div>
                <div><dt>Updated</dt><dd>${escapeHtml(formatDateTime(ticket.updated_at))}</dd></div>
            </dl>
        </section>
    `;
}

function renderAdminTicketControls(ticket, admins) {
    return `
        <section class="admin-ticket-controls">
            <p class="panel-kicker">Admin Actions</p>
            <h3>Manage ticket</h3>
            <form data-admin-ticket-update>
                <label><span>Status</span><select name="status">${renderOptions(TICKET_STATUSES, ticket.status)}</select></label>
                <label><span>Severity</span><select name="severity">${renderOptions(TICKET_SEVERITIES, ticket.severity)}</select></label>
                <label><span>Assigned administrator</span><select name="assignedAdmin"><option value="">Unassigned</option>${admins.map((profile) => `<option value="${escapeHtml(profile.id)}" ${ticket.assigned_admin === profile.id ? "selected" : ""}>${escapeHtml(profile.display_name || profile.username || profile.id)}</option>`).join("")}</select></label>
                <p class="feedback-form-status" data-admin-ticket-status role="status"></p>
                <button type="submit">Save admin changes</button>
            </form>
        </section>
    `;
}

function renderReporterPanel(reporter) {
    if (!reporter)
        return `<section class="ticket-reporter"><p class="panel-kicker">Reporter</p><p>Profile details unavailable.</p></section>`;
    return `
        <section class="ticket-reporter">
            <p class="panel-kicker">Reporter</p>
            <h3>${escapeHtml(reporter.display_name || reporter.username || "Unknown player")}</h3>
            <dl>
                <div><dt>Discord ID</dt><dd>${escapeHtml(reporter.discord_id || "Unavailable")}</dd></div>
                <div><dt>Minecraft</dt><dd>${escapeHtml(reporter.minecraft_player_name || "Not linked")}</dd></div>
                <div><dt>Signed up</dt><dd>${escapeHtml(formatDateTime(reporter.created_at))}</dd></div>
            </dl>
        </section>
    `;
}

function renderTicketHistory(history, authorNames) {
    return `
        <section class="ticket-history">
            <p class="panel-kicker">Audit History</p>
            <h3>${history.length} events</h3>
            ${history.length ? `<ol>${history.map((entry) => `<li><strong>${escapeHtml(historyActionLabel(entry.action))}</strong><span>${escapeHtml(authorNames?.get(entry.changed_by) || "System")} / ${escapeHtml(formatDateTime(entry.created_at))}</span>${renderHistoryChange(entry)}</li>`).join("")}</ol>` : renderEmptyState("No history entries available.")}
        </section>
    `;
}

function renderHistoryChange(entry) {
    const oldValue = Object.values(entry.old_value || {})[0];
    const newValue = Object.values(entry.new_value || {})[0];
    if (oldValue === undefined && newValue === undefined) return "";
    return `<small>${escapeHtml(oldValue ?? "None")} -> ${escapeHtml(newValue ?? "None")}</small>`;
}

function historyActionLabel(action) {
    return (
        {
            created: "Ticket created",
            status_changed: "Status changed",
            severity_changed: "Severity changed",
            assignment_changed: "Assignment changed",
            private_staff_note_added: "Private note added",
            staff_reply_added: "Staff reply added",
            user_reply_added: "Player reply added"
        }[action] || action
    );
}

export function renderAdminTicketsContent({ loading, tickets, filters, counts, error }) {
    return `
        ${error ? `<div class="feedback-notice error" role="alert"><span>${escapeHtml(error)}</span><button type="button" data-admin-tickets-retry>Retry</button></div>` : ""}
        <section class="admin-ticket-metrics" aria-label="Ticket overview">
            ${[
                ["Open", counts.open],
                ["Need info", counts.needInfo],
                ["Confirmed", counts.confirmed],
                ["Planned", counts.planned],
                ["Resolved", counts.resolved],
                ["High priority", counts.highPriority]
            ]
                .map(
                    ([label, value]) =>
                        `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
                )
                .join("")}
        </section>
        <section class="admin-ticket-workspace">
            <div class="admin-ticket-toolbar">
                <label class="wide"><span>Search tickets</span><input type="search" value="${escapeHtml(filters.search)}" data-admin-ticket-filter="search" placeholder="Title, player, ticket ID, map, weapon, match ID"></label>
                <label><span>Category</span><select data-admin-ticket-filter="category">${renderOptions(TICKET_CATEGORIES, filters.category, "All categories")}</select></label>
                <label><span>Status</span><select data-admin-ticket-filter="status">${renderOptions(TICKET_STATUSES, filters.status, "All statuses")}</select></label>
                <label><span>Severity</span><select data-admin-ticket-filter="severity">${renderOptions(TICKET_SEVERITIES, filters.severity, "All severities")}</select></label>
                <label><span>Sort</span><select data-admin-ticket-filter="sort">${renderOptions(TICKET_SORTS, filters.sort)}</select></label>
            </div>
            ${
                loading
                    ? renderLoadingState("Loading support tickets...")
                    : tickets.length
                      ? `<div class="admin-ticket-list">${tickets.map(renderAdminTicketRow).join("")}</div>`
                      : renderEmptyState("No tickets match the current filters.")
            }
        </section>
    `;
}

function renderAdminTicketRow(ticket) {
    return `
        <a class="admin-ticket-row severity-${escapeHtml(ticket.severity)}" href="#ticket=${encodeURIComponent(ticket.id)}">
            <span class="ticket-id">#${escapeHtml(ticketShortId(ticket.id))}</span>
            <div><strong>${escapeHtml(ticket.title)}</strong><small>${escapeHtml(ticket.reporterLabel || "Unknown player")} / ${escapeHtml(ticketCategoryLabel(ticket.category))}</small></div>
            <span>${escapeHtml(ticket.map_name || ticket.weapon_or_item || ticket.match_id || ticketContextLabel(ticket.context_area))}</span>
            ${renderTicketBadge("severity", ticket.severity, ticketSeverityLabel(ticket.severity))}
            ${renderTicketBadge("status", ticket.status, ticketStatusLabel(ticket.status))}
            <time>${escapeHtml(formatDateTime(ticket.updated_at))}</time>
        </a>
    `;
}

export function renderAdminDocumentationContent({ loading, sections, error }) {
    if (loading) return renderLoadingState("Loading protected documentation...");
    if (error)
        return `<div class="feedback-notice error" role="alert"><span>${escapeHtml(error)}</span><button type="button" data-admin-docs-retry>Retry</button></div>`;
    if (!sections.length) return renderEmptyState("No protected documentation sections have been installed yet.");
    return `<section class="admin-command-grid">${sections
        .map(
            (section) => `
        <article class="admin-command-group">
            <h3>${escapeHtml(section.title)}</h3>
            ${section.summary ? `<p>${escapeHtml(section.summary)}</p>` : ""}
            <ul class="command-list">${(Array.isArray(section.entries) ? section.entries : []).map((entry) => `<li><code>${escapeHtml(entry.command || "")}</code><em>${escapeHtml(entry.description || "")}</em></li>`).join("")}</ul>
        </article>
    `
        )
        .join("")}</section>`;
}

function renderFeedbackCategories() {
    return `<section class="feedback-category-overview"><p class="panel-kicker">Accepted Reports</p><div>${TICKET_CATEGORIES.map((category) => `<span>${escapeHtml(category.label)}</span>`).join("")}</div></section>`;
}

function renderFeedbackAccessState(message, login) {
    return `<section class="feedback-access"><div><p class="panel-kicker">Feedback &amp; Support</p><h3>${escapeHtml(message)}</h3></div>${login ? `<button type="button" data-auth-login>Login with Discord</button>` : ""}</section>`;
}

function renderLoadingState(message) {
    return `<section class="feedback-state loading" aria-busy="true"><span class="feedback-spinner" aria-hidden="true"></span><strong>${escapeHtml(message)}</strong></section>`;
}

function renderEmptyState(message) {
    return `<div class="feedback-state empty"><p>${escapeHtml(message)}</p></div>`;
}
