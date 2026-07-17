import { validateFeedbackAttachment } from "./feedback-attachments.js";
import {
    FEEDBACK_DRAFT_FIELD_NAMES,
    deleteFeedbackDraft,
    feedbackDraftHasContent,
    loadFeedbackDraft,
    normalizeFeedbackDraftFields,
    saveFeedbackDraft
} from "./feedback-drafts.js";

function emptyState(userId = "") {
    return {
        userId,
        loaded: false,
        loading: false,
        fields: normalizeFeedbackDraftFields(),
        attachment: null,
        optionalOpen: false,
        updatedAt: "",
        hasContent: false,
        status: "",
        revision: 0,
        attachmentDirty: false,
        attachmentVersion: 0
    };
}

function readFields(form) {
    const fields = {};
    for (const name of FEEDBACK_DRAFT_FIELD_NAMES) {
        const field = form.elements.namedItem(name);
        if (
            field instanceof HTMLInputElement ||
            field instanceof HTMLTextAreaElement ||
            field instanceof HTMLSelectElement
        ) {
            fields[name] = field.value;
        }
    }
    return normalizeFeedbackDraftFields(fields);
}

function attachmentLabel(file) {
    if (!file) return "";
    const megabytes = file.size / (1024 * 1024);
    const size = megabytes >= 0.1 ? `${megabytes.toFixed(1)} MB` : `${Math.max(1, Math.ceil(file.size / 1024))} KB`;
    return `Saved attachment: ${file.name} (${size})`;
}

function restoreAttachmentInput(input, file) {
    if (!(input instanceof HTMLInputElement) || !file) return false;
    const current = input.files?.[0];
    if (current?.name === file.name && current.size === file.size && current.lastModified === file.lastModified)
        return true;
    try {
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
        return Boolean(input.files?.length);
    } catch (_error) {
        return false;
    }
}

function clearFormErrors(form) {
    form.querySelectorAll("[data-feedback-field-error]").forEach((element) => {
        element.textContent = "";
    });
    form.querySelectorAll("[aria-invalid='true']").forEach((element) => element.removeAttribute("aria-invalid"));
}

export function createFeedbackDraftSession({ getUserId }) {
    let state = emptyState();
    let saveTimer = 0;
    let savePromise = Promise.resolve();

    function currentForm() {
        return document.querySelector("[data-feedback-create]");
    }

    function updateUi(form) {
        const status = form.querySelector("[data-feedback-draft-status]");
        const discard = form.querySelector("[data-feedback-draft-discard]");
        const attachment = form.querySelector("[data-feedback-draft-attachment]");
        if (status) status.textContent = state.status;
        if (discard) discard.hidden = !state.hasContent;
        if (attachment) {
            attachment.textContent = attachmentLabel(state.attachment);
            attachment.hidden = !state.attachment;
        }
    }

    function applyToForm(form) {
        const userId = getUserId();
        if (!state.loaded || state.userId !== userId) {
            updateUi(form);
            return;
        }

        if (state.hasContent) {
            for (const name of FEEDBACK_DRAFT_FIELD_NAMES) {
                const field = form.elements.namedItem(name);
                if (
                    field instanceof HTMLInputElement ||
                    field instanceof HTMLTextAreaElement ||
                    field instanceof HTMLSelectElement
                ) {
                    field.value = state.fields[name] || "";
                }
            }
            restoreAttachmentInput(form.elements.namedItem("attachment"), state.attachment);
            const optional = form.querySelector(".ticket-optional-fields");
            if (optional) optional.open = state.optionalOpen || Boolean(state.attachment);
        }
        updateUi(form);
    }

    async function ensureLoaded(userId) {
        if (state.userId !== userId) state = emptyState(userId);
        if (state.loaded || state.loading) return;

        state.loading = true;
        const startingRevision = state.revision;
        try {
            const stored = await loadFeedbackDraft(userId);
            if (getUserId() !== userId || state.userId !== userId) return;
            if (state.revision === startingRevision) {
                if (stored) {
                    state.fields = stored.fields;
                    state.attachment = stored.attachment;
                    state.optionalOpen = stored.optionalOpen;
                    state.updatedAt = stored.updatedAt;
                    state.hasContent = feedbackDraftHasContent(stored.fields, stored.attachment);
                    state.status = state.hasContent ? "Draft restored from this device." : "";
                }
                state.loaded = true;
                const form = currentForm();
                if (form) applyToForm(form);
            } else {
                state.loaded = true;
                queueSave();
            }
        } catch (error) {
            console.warn("Could not load the local feedback draft", error);
            if (state.userId === userId) {
                state.loaded = true;
                state.status = "Draft saving is unavailable in this browser.";
                const form = currentForm();
                if (form) updateUi(form);
            }
        } finally {
            if (state.userId === userId) state.loading = false;
        }
    }

    function setAttachmentError(form, message) {
        const input = form.elements.namedItem("attachment");
        const error = form.querySelector("[data-feedback-field-error='attachment']");
        if (input instanceof HTMLElement) input.toggleAttribute("aria-invalid", Boolean(message));
        if (error) error.textContent = message;
    }

    async function persist() {
        const userId = state.userId;
        if (!userId) return;
        const revision = state.revision;
        const attachmentVersion = state.attachmentVersion;
        const hasContent = state.hasContent;
        const attachmentChanged = state.attachmentDirty;
        const snapshot = {
            fields: { ...state.fields },
            attachment: state.attachment,
            optionalOpen: state.optionalOpen,
            updatedAt: state.updatedAt
        };

        const operation = savePromise
            .catch(() => undefined)
            .then(() =>
                hasContent ? saveFeedbackDraft(userId, snapshot, { attachmentChanged }) : deleteFeedbackDraft(userId)
            );
        savePromise = operation;
        try {
            await operation;
            if (state.userId !== userId) return;
            if (state.attachmentVersion === attachmentVersion) state.attachmentDirty = false;
            if (state.revision === revision) {
                state.status = hasContent ? "Draft saved on this device." : "";
                const form = currentForm();
                if (form) updateUi(form);
            }
        } catch (error) {
            console.warn("Could not save the local feedback draft", error);
            if (state.userId === userId && state.revision === revision) {
                state.status = "Draft could not be saved on this device.";
                const form = currentForm();
                if (form) updateUi(form);
            }
        }
    }

    function queueSave(delay = 400) {
        window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(() => {
            saveTimer = 0;
            void persist();
        }, delay);
    }

    async function clearStoredDraft(userId) {
        window.clearTimeout(saveTimer);
        saveTimer = 0;
        await savePromise.catch(() => undefined);
        await deleteFeedbackDraft(userId);
        state = { ...emptyState(userId), loaded: true };
    }

    return {
        reset() {
            window.clearTimeout(saveTimer);
            saveTimer = 0;
            state = emptyState();
        },

        attach(form) {
            const userId = getUserId();
            if (!form || !userId) return;
            applyToForm(form);
            void ensureLoaded(userId);
        },

        capture(form, { attachmentChanged = false } = {}) {
            const userId = getUserId();
            if (!userId) return;
            if (state.userId !== userId) state = emptyState(userId);
            state.fields = readFields(form);
            state.optionalOpen = Boolean(form.querySelector(".ticket-optional-fields")?.open);

            if (attachmentChanged) {
                const input = form.elements.namedItem("attachment");
                const selectedFile = input instanceof HTMLInputElement ? input.files?.[0] || null : null;
                const validation = validateFeedbackAttachment(selectedFile);
                if (!validation.valid) {
                    setAttachmentError(form, validation.error);
                    if (input instanceof HTMLInputElement) {
                        input.value = "";
                        restoreAttachmentInput(input, state.attachment);
                    }
                } else {
                    setAttachmentError(form, "");
                    state.attachment = selectedFile;
                    state.attachmentDirty = true;
                    state.attachmentVersion += 1;
                }
            }

            state.loaded = true;
            state.updatedAt = new Date().toISOString();
            state.hasContent = feedbackDraftHasContent(state.fields, state.attachment);
            state.status = state.hasContent ? "Saving draft..." : "";
            state.revision += 1;
            updateUi(form);
            queueSave(attachmentChanged ? 0 : 400);
        },

        flush() {
            if (!saveTimer) return;
            window.clearTimeout(saveTimer);
            saveTimer = 0;
            void persist();
        },

        attachment(userId) {
            return state.userId === userId ? state.attachment : null;
        },

        async clear(userId) {
            await clearStoredDraft(userId);
        },

        async discard(form = currentForm()) {
            const userId = getUserId();
            if (!userId) return false;
            try {
                await clearStoredDraft(userId);
                if (form) {
                    form.reset();
                    const optional = form.querySelector(".ticket-optional-fields");
                    if (optional) optional.open = false;
                    clearFormErrors(form);
                    updateUi(form);
                }
                return true;
            } catch (error) {
                console.warn("Could not discard the local feedback draft", error);
                state.status = "Draft could not be discarded on this device.";
                if (form) updateUi(form);
                return false;
            }
        }
    };
}
