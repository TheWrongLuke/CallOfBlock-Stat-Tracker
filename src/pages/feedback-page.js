import { createFeedbackApi } from "../api/feedback.js";
import { syncDiscordProfile } from "../api/profile.js";
import { USER_CLOSABLE_TICKET_STATUSES, USER_REOPENABLE_TICKET_STATUSES } from "../config/feedback.js";
import {
    createFeedbackAttachmentView,
    createFeedbackTicketId,
    feedbackAttachmentErrorMessage,
    removeFeedbackAttachment,
    uploadFeedbackAttachment,
    validateFeedbackAttachment
} from "../services/feedback-attachments.js";
import { createFeedbackDraftSession } from "../services/feedback-draft-session.js";
import { validateReplyInput, validateTicketInput } from "../utils/feedback-validation.js";
import { initializeSiteShell } from "../core/site-shell.js";
import { renderFeedbackContent, renderTicketDetailContent } from "../views/feedback.js";

const TICKET_SUBMIT_COOLDOWN_MS = 15_000;
const TICKET_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function initializeFeedbackPage() {
    await whenReady();
    const shell = await initializeSiteShell({ loadStatus: false });
    const state = createState(shell);
    const draft = createFeedbackDraftSession({ getUserId: () => state.shell.session?.user?.id || "" });

    if (state.shell.session?.user && state.shell.client) {
        const profile = await syncDiscordProfile(state.shell.client);
        if (!profile.error) {
            state.profile = profile.data || null;
            state.shell.setProfile(state.profile);
        }
    }

    bindEvents(state, draft);
    applyRoute(state);
    render(state, draft);
}

function createState(shell) {
    return {
        shell,
        api: shell.client ? createFeedbackApi(shell.client) : null,
        profile: null,
        view: "feedback",
        selectedTicketId: "",
        tickets: [],
        ticketsLoaded: false,
        ticketsLoading: false,
        selectedTicket: null,
        messages: [],
        detailLoadedId: "",
        detailLoading: false,
        attachment: emptyAttachment(),
        statusFilter: "all",
        categoryFilter: "all",
        submitting: false,
        replying: false,
        updating: false,
        cooldownUntil: 0,
        message: "",
        error: ""
    };
}

function bindEvents(state, draft) {
    window.addEventListener("hashchange", () => {
        applyRoute(state);
        render(state, draft);
    });
    document.addEventListener("click", (event) => {
        const login = event.target.closest("[data-auth-login]");
        if (login) {
            event.preventDefault();
            void state.shell.signIn();
            return;
        }
        const retry = event.target.closest("[data-feedback-retry]");
        if (retry) {
            state.ticketsLoaded = false;
            void loadOwnTickets(state, draft, true);
            return;
        }
        const detailRetry = event.target.closest("[data-ticket-retry]");
        if (detailRetry) {
            state.detailLoadedId = "";
            void loadTicket(state, draft, true);
            return;
        }
        const discard = event.target.closest("[data-feedback-draft-discard]");
        if (discard) {
            const form = discard.closest("form");
            if (window.confirm("Discard this saved ticket draft and its attachment?")) void draft.discard(form);
            return;
        }
        const status = event.target.closest("[data-ticket-user-status]");
        if (status) void updateTicketStatus(state, draft, status.dataset.ticketUserStatus || "");
    });
    document.addEventListener("submit", (event) => {
        if (event.target.matches("[data-feedback-create]")) {
            event.preventDefault();
            void submitTicket(state, draft, event.target);
            return;
        }
        if (event.target.matches("[data-ticket-reply]")) {
            event.preventDefault();
            void submitReply(state, draft, event.target);
        }
    });
    document.addEventListener("change", (event) => {
        const form = event.target.closest("[data-feedback-create]");
        if (form && event.target.matches("select[name], input[type='file'][name='attachment']")) {
            draft.capture(form, { attachmentChanged: event.target.matches("input[type='file']") });
            return;
        }
        if (!event.target.matches("[data-feedback-filter]")) return;
        if (event.target.dataset.feedbackFilter === "status") state.statusFilter = event.target.value;
        if (event.target.dataset.feedbackFilter === "category") state.categoryFilter = event.target.value;
        render(state, draft);
    });
    document.addEventListener("input", (event) => {
        const form = event.target.closest("[data-feedback-create]");
        if (form && event.target.matches("input:not([type='file']), textarea")) draft.capture(form);
    });
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") draft.flush();
    });
    window.addEventListener("pagehide", () => draft.flush());
}

function applyRoute(state) {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const ticketId = params.get("ticket") || "";
    state.view = ticketId ? "ticket" : "feedback";
    state.selectedTicketId = ticketId;
    toggleView("feedback-view", state.view === "feedback");
    toggleView("ticket-view", state.view === "ticket");
    document.body.classList.remove("home-route", "store-route", "progression-modal-open");
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
}

function render(state, draft) {
    if (state.view === "ticket") renderTicket(state, draft);
    else renderFeedback(state, draft);
}

function renderFeedback(state, draft) {
    const body = document.getElementById("feedback-body");
    if (!body) return;
    const loggedIn = Boolean(state.shell.session?.user);
    if (loggedIn && !state.ticketsLoaded && !state.ticketsLoading) void loadOwnTickets(state, draft);
    body.innerHTML = renderFeedbackContent({
        authConfigured: Boolean(state.api),
        authReady: true,
        loggedIn,
        loading: state.ticketsLoading,
        tickets: state.tickets,
        statusFilter: state.statusFilter,
        categoryFilter: state.categoryFilter,
        message: state.message,
        error: state.error
    });
    const form = body.querySelector("[data-feedback-create]");
    if (form && loggedIn) draft.attach(form);
}

async function loadOwnTickets(state, draft, force = false) {
    const userId = state.shell.session?.user?.id;
    if (!state.api || !userId || state.ticketsLoading || (state.ticketsLoaded && !force)) return;
    state.ticketsLoading = true;
    state.error = "";
    renderFeedback(state, draft);
    try {
        const result = await state.api.listOwnTickets(userId);
        if (result.error) throw result.error;
        state.tickets = Array.isArray(result.data) ? result.data : [];
    } catch (error) {
        console.error("Could not load feedback tickets", error);
        state.error = feedbackErrorMessage(error, "Could not load your tickets.");
    } finally {
        state.ticketsLoaded = true;
        state.ticketsLoading = false;
        if (state.view === "feedback") renderFeedback(state, draft);
    }
}

async function submitTicket(state, draft, form) {
    const userId = state.shell.session?.user?.id;
    if (!state.api || !userId || state.submitting) return;
    const status = form.querySelector("[data-feedback-form-status]");
    const submit = form.querySelector("button[type='submit']");
    clearFieldErrors(form);
    if (state.profile?.banned_from_voting) {
        if (status) status.textContent = "This account is community banned and cannot submit tickets.";
        return;
    }
    if (Date.now() < state.cooldownUntil) {
        const seconds = Math.max(1, Math.ceil((state.cooldownUntil - Date.now()) / 1000));
        if (status) status.textContent = `Please wait ${seconds} seconds before submitting another ticket.`;
        return;
    }

    const validation = validateTicketInput(Object.fromEntries(new FormData(form).entries()));
    const attachmentInput = form.elements.namedItem("attachment");
    const selected = attachmentInput instanceof HTMLInputElement ? attachmentInput.files?.[0] : null;
    const attachment = selected || draft.attachment(userId);
    const attachmentValidation = validateFeedbackAttachment(attachment);
    const errors = { ...validation.errors };
    if (!attachmentValidation.valid) errors.attachment = attachmentValidation.error;
    if (attachment && validation.value.externalMediaUrl) {
        errors.attachment = "Choose either a direct attachment or an external URL, not both.";
        errors.externalMediaUrl = "Remove this URL to upload the selected attachment.";
    }
    if (Object.keys(errors).length) {
        applyFieldErrors(form, errors);
        if (status) status.textContent = "Check the highlighted fields.";
        focusFirstError(form, errors);
        return;
    }

    state.submitting = true;
    if (submit) {
        submit.disabled = true;
        submit.textContent = "Submitting...";
    }
    let uploadedPath = "";
    try {
        const ticketId = createFeedbackTicketId();
        if (attachment) {
            if (status) status.textContent = "Uploading private attachment...";
            const upload = await uploadFeedbackAttachment(state.shell.client, { file: attachment, userId, ticketId });
            uploadedPath = upload.path;
            validation.value.externalMediaUrl = upload.storedUrl;
        }
        if (status) status.textContent = "Creating ticket...";
        const result = await state.api.createTicket(validation.value, userId, ticketId);
        if (result.error) throw result.error;
        await draft.clear(userId);
        state.cooldownUntil = Date.now() + TICKET_SUBMIT_COOLDOWN_MS;
        state.tickets = [result.data, ...state.tickets.filter((ticket) => ticket.id !== result.data.id)];
        state.ticketsLoaded = true;
        state.message = attachment ? "Ticket and private attachment submitted." : "Ticket submitted.";
        window.location.hash = `ticket=${encodeURIComponent(result.data.id)}`;
    } catch (error) {
        console.error("Could not create feedback ticket", error);
        if (uploadedPath) await removeFeedbackAttachment(state.shell.client, uploadedPath);
        if (status) {
            status.textContent =
                attachment && !uploadedPath
                    ? feedbackAttachmentErrorMessage(error)
                    : feedbackErrorMessage(error, "Could not submit the ticket.");
        }
    } finally {
        state.submitting = false;
        if (submit) {
            submit.disabled = false;
            submit.textContent = "Submit ticket";
        }
    }
}

function renderTicket(state, draft) {
    const body = document.getElementById("ticket-detail-body");
    if (!body) return;
    const loggedIn = Boolean(state.shell.session?.user);
    const validId = TICKET_ID_PATTERN.test(state.selectedTicketId);
    if (loggedIn && validId && state.detailLoadedId !== state.selectedTicketId && !state.detailLoading) {
        void loadTicket(state, draft);
    }
    body.innerHTML = renderTicketDetailContent({
        authConfigured: Boolean(state.api),
        authReady: true,
        loggedIn,
        admin: false,
        loading: state.detailLoading || (loggedIn && validId && state.detailLoadedId !== state.selectedTicketId),
        ticket: state.selectedTicket,
        messages: state.messages,
        history: [],
        reporter: null,
        admins: [],
        accountId: state.shell.session?.user?.id || "",
        error: validId ? state.error : "Invalid ticket ID.",
        message: state.message,
        authorNames: new Map([[state.shell.session?.user?.id || "", profileName(state)]]),
        attachment: state.attachment
    });
}

async function loadTicket(state, draft, force = false) {
    const id = state.selectedTicketId;
    if (!state.api || !state.shell.session?.user || state.detailLoading || (!force && state.detailLoadedId === id))
        return;
    state.detailLoading = true;
    state.error = "";
    state.selectedTicket = null;
    state.messages = [];
    state.attachment = emptyAttachment();
    renderTicket(state, draft);
    try {
        const ticketResult = await state.api.getTicket(id);
        if (ticketResult.error) throw ticketResult.error;
        state.selectedTicket = ticketResult.data || null;
        if (state.selectedTicket) {
            try {
                const attachment = await createFeedbackAttachmentView(
                    state.shell.client,
                    state.selectedTicket.external_media_url
                );
                state.attachment = { ...emptyAttachment(), ...attachment };
            } catch (error) {
                state.attachment = {
                    managed: true,
                    loading: false,
                    signedUrl: "",
                    kind: "file",
                    error: feedbackAttachmentErrorMessage(error)
                };
            }
            const messages = await state.api.listMessages(id);
            if (messages.error) throw messages.error;
            state.messages = Array.isArray(messages.data) ? messages.data : [];
        }
    } catch (error) {
        console.error("Could not load ticket detail", error);
        state.error = feedbackErrorMessage(error, "Could not load this ticket.");
    } finally {
        state.detailLoadedId = id;
        state.detailLoading = false;
        if (state.view === "ticket") renderTicket(state, draft);
    }
}

async function submitReply(state, draft, form) {
    const ticket = state.selectedTicket;
    const userId = state.shell.session?.user?.id;
    if (!state.api || !ticket || !userId || state.replying) return;
    const textarea = form.elements.namedItem("message");
    const errorHost = form.querySelector("[data-ticket-reply-error]");
    const validation = validateReplyInput(textarea?.value);
    if (errorHost) errorHost.textContent = validation.error;
    if (!validation.valid) {
        textarea?.focus();
        return;
    }
    state.replying = true;
    try {
        const result = await state.api.addMessage(ticket.id, userId, validation.value);
        if (result.error) throw result.error;
        state.message = "Reply sent.";
        await loadTicket(state, draft, true);
    } catch (error) {
        state.error = feedbackErrorMessage(error, "Could not send the reply.");
        renderTicket(state, draft);
    } finally {
        state.replying = false;
    }
}

async function updateTicketStatus(state, draft, status) {
    const ticket = state.selectedTicket;
    if (!state.api || !ticket || state.updating) return;
    const allowed =
        status === "closed"
            ? USER_CLOSABLE_TICKET_STATUSES.includes(ticket.status)
            : status === "open" && USER_REOPENABLE_TICKET_STATUSES.includes(ticket.status);
    if (!allowed || (status === "closed" && !window.confirm("Close this ticket? You can reopen it later."))) return;
    state.updating = true;
    try {
        const result = await state.api.updateTicket(ticket.id, { status });
        if (result.error) throw result.error;
        state.selectedTicket = result.data;
        state.message = status === "closed" ? "Ticket closed." : "Ticket reopened.";
        state.ticketsLoaded = false;
    } catch (error) {
        state.error = feedbackErrorMessage(error, "Could not update the ticket.");
    } finally {
        state.updating = false;
        renderTicket(state, draft);
    }
}

function clearFieldErrors(form) {
    form.querySelectorAll("[data-feedback-field-error]").forEach((element) => (element.textContent = ""));
    form.querySelectorAll("[aria-invalid='true']").forEach((element) => element.removeAttribute("aria-invalid"));
}

function applyFieldErrors(form, errors) {
    for (const [name, message] of Object.entries(errors)) {
        const field = form.elements.namedItem(name);
        if (field instanceof HTMLElement) field.setAttribute("aria-invalid", "true");
        const host = form.querySelector(`[data-feedback-field-error='${CSS.escape(name)}']`);
        if (host) host.textContent = message;
    }
}

function focusFirstError(form, errors) {
    const field = form.elements.namedItem(Object.keys(errors)[0]);
    if (field instanceof HTMLElement) field.focus();
}

function feedbackErrorMessage(error, fallback) {
    const code = String(error?.code || "");
    const message = String(error?.message || "");
    if (["42P01", "PGRST205"].includes(code))
        return "Feedback is temporarily unavailable because its database setup is incomplete.";
    if (code === "42501" || /permission|row-level security|not authorized/i.test(message)) {
        return "This account does not have permission to perform that ticket action.";
    }
    if (/jwt|session|token/i.test(message)) return "Your Discord session expired. Sign in again.";
    return fallback;
}

function profileName(state) {
    return String(state.profile?.display_name || state.profile?.username || "Player");
}

function emptyAttachment() {
    return { managed: false, loading: false, signedUrl: "", kind: "file", error: "" };
}

function toggleView(id, visible) {
    const view = document.getElementById(id);
    if (!view) return;
    view.hidden = !visible;
    view.classList.toggle("hidden", !visible);
}

function whenReady() {
    if (document.readyState !== "loading") return Promise.resolve();
    return new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
}
