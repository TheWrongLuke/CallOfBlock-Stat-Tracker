export const FEEDBACK_ATTACHMENT_BUCKET = "feedback-attachments";
export const FEEDBACK_ATTACHMENT_MAX_BYTES = 6 * 1024 * 1024;
export const FEEDBACK_ATTACHMENT_ACCEPT = [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "video/mp4",
    "video/webm",
    "video/quicktime"
].join(",");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MEDIA_TYPES = Object.freeze({
    "image/png": { extension: "png", kind: "image" },
    "image/jpeg": { extension: "jpg", kind: "image" },
    "image/webp": { extension: "webp", kind: "image" },
    "image/gif": { extension: "gif", kind: "image" },
    "video/mp4": { extension: "mp4", kind: "video" },
    "video/webm": { extension: "webm", kind: "video" },
    "video/quicktime": { extension: "mov", kind: "video" }
});
const EXTENSION_KINDS = new Map(Object.values(MEDIA_TYPES).map(({ extension, kind }) => [extension, kind]));

function randomUuid() {
    if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
    if (typeof globalThis.crypto?.getRandomValues !== "function") {
        throw new Error("Secure random identifiers are unavailable in this browser.");
    }
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function createFeedbackTicketId() {
    return randomUuid();
}

export function validateFeedbackAttachment(file) {
    if (!file || typeof file !== "object" || !file.name) {
        return { valid: true, error: "", details: null };
    }
    const details = MEDIA_TYPES[String(file.type || "").toLowerCase()];
    if (!details) {
        return {
            valid: false,
            error: "Use a PNG, JPEG, WebP, GIF, MP4, WebM, or MOV file.",
            details: null
        };
    }
    if (!Number.isFinite(file.size) || file.size <= 0) {
        return { valid: false, error: "Choose a non-empty screenshot or clip.", details: null };
    }
    if (file.size > FEEDBACK_ATTACHMENT_MAX_BYTES) {
        return { valid: false, error: "The attachment must be 6 MB or smaller.", details: null };
    }
    return { valid: true, error: "", details };
}

function feedbackAttachmentPath(userId, ticketId, extension) {
    if (!UUID_PATTERN.test(String(userId || "")) || !UUID_PATTERN.test(String(ticketId || ""))) {
        throw new Error("The attachment owner or ticket identifier is invalid.");
    }
    return `${userId}/${ticketId}/evidence-${randomUuid()}.${extension}`;
}

export async function uploadFeedbackAttachment(client, { file, userId, ticketId }) {
    const validation = validateFeedbackAttachment(file);
    if (!validation.valid || !validation.details) throw new Error(validation.error || "Choose an attachment.");

    const path = feedbackAttachmentPath(userId, ticketId, validation.details.extension);
    const bucket = client.storage.from(FEEDBACK_ATTACHMENT_BUCKET);
    const upload = await bucket.upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false
    });
    if (upload.error) throw upload.error;

    const publicUrl = bucket.getPublicUrl(path)?.data?.publicUrl;
    if (!publicUrl || !/^https:\/\//i.test(publicUrl)) {
        await bucket.remove([path]);
        throw new Error("Could not create the attachment reference.");
    }
    return {
        path,
        storedUrl: publicUrl,
        kind: validation.details.kind
    };
}

export async function removeFeedbackAttachment(client, path) {
    if (!path) return;
    const result = await client.storage.from(FEEDBACK_ATTACHMENT_BUCKET).remove([path]);
    if (result.error) console.warn("Could not clean up an unused feedback attachment", result.error);
}

export function feedbackAttachmentPathFromUrl(value) {
    let url;
    try {
        url = new URL(String(value || ""));
    } catch (_error) {
        return "";
    }
    if (url.protocol !== "https:") return "";

    const markers = ["public", "authenticated", "sign"].map(
        (access) => `/storage/v1/object/${access}/${FEEDBACK_ATTACHMENT_BUCKET}/`
    );
    const marker = markers.find((candidate) => url.pathname.includes(candidate));
    if (!marker) return "";
    const encodedPath = url.pathname.slice(url.pathname.indexOf(marker) + marker.length);
    let path;
    try {
        path = decodeURIComponent(encodedPath);
    } catch (_error) {
        return "";
    }
    if (path.includes("..") || path.startsWith("/") || path.endsWith("/")) return "";
    const [userId, ticketId, fileName, extra] = path.split("/");
    if (extra || !UUID_PATTERN.test(userId) || !UUID_PATTERN.test(ticketId)) return "";
    if (!/^evidence-[0-9a-f-]{36}\.(png|jpg|webp|gif|mp4|webm|mov)$/i.test(fileName || "")) return "";
    return path;
}

export function feedbackAttachmentKind(pathOrUrl) {
    const path = feedbackAttachmentPathFromUrl(pathOrUrl) || String(pathOrUrl || "");
    const extension = path.split(".").pop()?.toLowerCase() || "";
    return EXTENSION_KINDS.get(extension) || "file";
}

export async function createFeedbackAttachmentView(client, storedUrl, expiresIn = 3600) {
    const path = feedbackAttachmentPathFromUrl(storedUrl);
    if (!path) return { managed: false, path: "", signedUrl: "", kind: "file" };
    const result = await client.storage.from(FEEDBACK_ATTACHMENT_BUCKET).createSignedUrl(path, expiresIn);
    if (result.error) throw result.error;
    if (!result.data?.signedUrl) throw new Error("Could not create a private attachment link.");
    return {
        managed: true,
        path,
        signedUrl: result.data.signedUrl,
        kind: feedbackAttachmentKind(path)
    };
}

export function feedbackAttachmentErrorMessage(error) {
    const message = String(error?.message || error || "");
    if (/bucket.*not found|not found.*bucket/i.test(message)) {
        return "Direct attachments are not configured yet. Use an external HTTPS link for now.";
    }
    if (/row-level security|unauthorized|permission|jwt/i.test(message)) {
        return "This account does not have permission to access the private attachment.";
    }
    if (/too large|maximum|payload|413/i.test(message)) return "The attachment must be 6 MB or smaller.";
    return "Could not process the private attachment. Try again or use an external HTTPS link.";
}
