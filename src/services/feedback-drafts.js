import { TICKET_LIMITS } from "../config/feedback.js";
import { FEEDBACK_ATTACHMENT_MAX_BYTES } from "./feedback-attachments.js";

const DATABASE_NAME = "call-of-block-local";
const DATABASE_VERSION = 1;
const DRAFT_STORE = "feedback-ticket-drafts";
const ATTACHMENT_STORE = "feedback-ticket-draft-files";
const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const FEEDBACK_DRAFT_FIELD_NAMES = Object.freeze([
    "category",
    "severity",
    "title",
    "description",
    "contextArea",
    "mapName",
    "weaponOrItem",
    "matchId",
    "reproductionSteps",
    "expectedResult",
    "actualResult",
    "externalMediaUrl"
]);

const FIELD_LIMITS = Object.freeze({
    category: 64,
    severity: 32,
    title: TICKET_LIMITS.title,
    description: TICKET_LIMITS.description,
    contextArea: 64,
    mapName: TICKET_LIMITS.mapName,
    weaponOrItem: TICKET_LIMITS.weaponOrItem,
    matchId: TICKET_LIMITS.matchId,
    reproductionSteps: TICKET_LIMITS.reproductionSteps,
    expectedResult: TICKET_LIMITS.expectedResult,
    actualResult: TICKET_LIMITS.actualResult,
    externalMediaUrl: TICKET_LIMITS.externalMediaUrl
});

export function normalizeFeedbackDraftFields(value = {}) {
    return Object.fromEntries(
        FEEDBACK_DRAFT_FIELD_NAMES.map((name) => [name, String(value?.[name] || "").slice(0, FIELD_LIMITS[name])])
    );
}

export function feedbackDraftHasContent(fields, attachmentFile = null) {
    if (attachmentFile) return true;
    const normalized = normalizeFeedbackDraftFields(fields);
    return FEEDBACK_DRAFT_FIELD_NAMES.some((name) => {
        const value = normalized[name].trim();
        if (name === "category") return Boolean(value && value !== "bug_report");
        if (name === "severity") return Boolean(value && value !== "medium");
        if (name === "contextArea") return Boolean(value && value !== "not_applicable");
        return Boolean(value);
    });
}

function validateUserId(userId) {
    const value = String(userId || "");
    if (!USER_ID_PATTERN.test(value)) throw new Error("The feedback draft owner is invalid.");
    return value;
}

function openDatabase() {
    if (!globalThis.indexedDB) return Promise.reject(new Error("IndexedDB is unavailable."));
    return new Promise((resolve, reject) => {
        const request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(DRAFT_STORE)) {
                database.createObjectStore(DRAFT_STORE, { keyPath: "userId" });
            }
            if (!database.objectStoreNames.contains(ATTACHMENT_STORE)) {
                database.createObjectStore(ATTACHMENT_STORE, { keyPath: "userId" });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("Could not open feedback draft storage."));
        request.onblocked = () => reject(new Error("Feedback draft storage is blocked."));
    });
}

function transactionComplete(transaction) {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error("Feedback draft storage failed."));
        transaction.onabort = () => reject(transaction.error || new Error("Feedback draft storage was cancelled."));
    });
}

function requestResult(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("Could not read the feedback draft."));
    });
}

function attachmentMetadata(file) {
    if (!file) return null;
    return {
        name: String(file.name || "evidence").slice(0, 200),
        type: String(file.type || "").slice(0, 100),
        size: Number(file.size) || 0,
        lastModified: Number(file.lastModified) || Date.now()
    };
}

function restoreAttachment(record) {
    if (!record?.file || !(record.file instanceof Blob) || typeof File !== "function") return null;
    if (record.file.size <= 0 || record.file.size > FEEDBACK_ATTACHMENT_MAX_BYTES) return null;
    return new File([record.file], String(record.name || "evidence").slice(0, 200), {
        type: String(record.type || record.file.type || ""),
        lastModified: Number(record.lastModified) || Date.now()
    });
}

export async function loadFeedbackDraft(userId) {
    const ownerId = validateUserId(userId);
    const database = await openDatabase();
    try {
        const transaction = database.transaction([DRAFT_STORE, ATTACHMENT_STORE], "readonly");
        const completed = transactionComplete(transaction);
        const draftRequest = requestResult(transaction.objectStore(DRAFT_STORE).get(ownerId));
        const attachmentRequest = requestResult(transaction.objectStore(ATTACHMENT_STORE).get(ownerId));
        const [record, storedAttachment] = await Promise.all([draftRequest, attachmentRequest]);
        await completed;
        if (!record) return null;
        return {
            fields: normalizeFeedbackDraftFields(record.fields),
            optionalOpen: Boolean(record.optionalOpen),
            updatedAt: String(record.updatedAt || ""),
            attachment: record.attachment ? restoreAttachment(storedAttachment) : null
        };
    } finally {
        database.close();
    }
}

export async function saveFeedbackDraft(userId, draft, { attachmentChanged = false } = {}) {
    const ownerId = validateUserId(userId);
    const attachment = draft?.attachment || null;
    if (attachment && (!(attachment instanceof Blob) || attachment.size > FEEDBACK_ATTACHMENT_MAX_BYTES)) {
        throw new Error("The feedback draft attachment is invalid.");
    }

    const database = await openDatabase();
    try {
        const transaction = database.transaction([DRAFT_STORE, ATTACHMENT_STORE], "readwrite");
        const completed = transactionComplete(transaction);
        transaction.objectStore(DRAFT_STORE).put({
            userId: ownerId,
            fields: normalizeFeedbackDraftFields(draft?.fields),
            optionalOpen: Boolean(draft?.optionalOpen),
            updatedAt: String(draft?.updatedAt || new Date().toISOString()),
            attachment: attachmentMetadata(attachment)
        });
        if (attachmentChanged) {
            const attachmentStore = transaction.objectStore(ATTACHMENT_STORE);
            if (attachment) {
                attachmentStore.put({ userId: ownerId, ...attachmentMetadata(attachment), file: attachment });
            } else {
                attachmentStore.delete(ownerId);
            }
        }
        await completed;
    } finally {
        database.close();
    }
}

export async function deleteFeedbackDraft(userId) {
    const ownerId = validateUserId(userId);
    const database = await openDatabase();
    try {
        const transaction = database.transaction([DRAFT_STORE, ATTACHMENT_STORE], "readwrite");
        const completed = transactionComplete(transaction);
        transaction.objectStore(DRAFT_STORE).delete(ownerId);
        transaction.objectStore(ATTACHMENT_STORE).delete(ownerId);
        await completed;
    } finally {
        database.close();
    }
}
