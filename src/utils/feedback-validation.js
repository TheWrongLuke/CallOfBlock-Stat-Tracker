import {
    TICKET_CATEGORIES,
    TICKET_CONTEXTS,
    TICKET_LIMITS,
    TICKET_SEVERITIES,
    isKnownTicketOption
} from "../config/feedback.js";

const MEANINGFUL_TEXT = /[\p{L}\p{N}]/u;

export function normalizeSingleLine(value, maxLength) {
    return String(value ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength);
}

export function normalizeLongText(value, maxLength) {
    return String(value ?? "")
        .replace(/\r\n?/g, "\n")
        .trim()
        .slice(0, maxLength);
}

export function normalizeOptionalSingleLine(value, maxLength) {
    return normalizeSingleLine(value, maxLength) || null;
}

export function normalizeOptionalLongText(value, maxLength) {
    return normalizeLongText(value, maxLength) || null;
}

export function isMeaningfulText(value) {
    return MEANINGFUL_TEXT.test(String(value ?? ""));
}

export function validateExternalUrl(value) {
    const text = String(value ?? "").trim();
    if (!text) return { valid: true, value: null, error: "" };
    if (text.length > TICKET_LIMITS.externalMediaUrl) {
        return {
            valid: false,
            value: null,
            error: `External URL must be ${TICKET_LIMITS.externalMediaUrl} characters or fewer.`
        };
    }
    try {
        const url = new URL(text);
        if (url.protocol !== "https:") {
            return { valid: false, value: null, error: "External media links must use HTTPS." };
        }
        if (!url.hostname || url.username || url.password) {
            return { valid: false, value: null, error: "Enter a valid public screenshot or video URL." };
        }
        return { valid: true, value: url.toString(), error: "" };
    } catch (_error) {
        return { valid: false, value: null, error: "Enter a valid public screenshot or video URL." };
    }
}

function validateOptionalText(errors, field, label, value, maxLength) {
    const text = String(value ?? "").trim();
    if (!text) return;
    if (text.length > maxLength) errors[field] = `${label} must be ${maxLength} characters or fewer.`;
    else if (!isMeaningfulText(text)) errors[field] = `${label} must contain meaningful text.`;
}

export function validateTicketInput(input) {
    const errors = {};
    const titleRaw = String(input?.title ?? "").trim();
    const descriptionRaw = String(input?.description ?? "").trim();

    if (!isKnownTicketOption(TICKET_CATEGORIES, input?.category)) errors.category = "Choose a ticket category.";
    if (!isKnownTicketOption(TICKET_CONTEXTS, input?.contextArea))
        errors.contextArea = "Choose where the issue occurred.";
    if (!isKnownTicketOption(TICKET_SEVERITIES, input?.severity)) errors.severity = "Choose a severity.";

    if (titleRaw.length < 5 || !isMeaningfulText(titleRaw))
        errors.title = "Title must contain at least 5 meaningful characters.";
    else if (titleRaw.length > TICKET_LIMITS.title)
        errors.title = `Title must be ${TICKET_LIMITS.title} characters or fewer.`;

    if (descriptionRaw.length < 20 || !isMeaningfulText(descriptionRaw))
        errors.description = "Description must contain at least 20 meaningful characters.";
    else if (descriptionRaw.length > TICKET_LIMITS.description)
        errors.description = `Description must be ${TICKET_LIMITS.description} characters or fewer.`;

    validateOptionalText(errors, "mapName", "Map", input?.mapName, TICKET_LIMITS.mapName);
    validateOptionalText(errors, "weaponOrItem", "Weapon or item", input?.weaponOrItem, TICKET_LIMITS.weaponOrItem);
    validateOptionalText(errors, "matchId", "Match ID", input?.matchId, TICKET_LIMITS.matchId);
    validateOptionalText(
        errors,
        "reproductionSteps",
        "Steps to reproduce",
        input?.reproductionSteps,
        TICKET_LIMITS.reproductionSteps
    );
    validateOptionalText(
        errors,
        "expectedResult",
        "Expected result",
        input?.expectedResult,
        TICKET_LIMITS.expectedResult
    );
    validateOptionalText(errors, "actualResult", "Actual result", input?.actualResult, TICKET_LIMITS.actualResult);

    const externalUrl = validateExternalUrl(input?.externalMediaUrl);
    if (!externalUrl.valid) errors.externalMediaUrl = externalUrl.error;

    return {
        valid: Object.keys(errors).length === 0,
        errors,
        value: {
            category: String(input?.category ?? ""),
            title: normalizeSingleLine(titleRaw, TICKET_LIMITS.title),
            description: normalizeLongText(descriptionRaw, TICKET_LIMITS.description),
            contextArea: String(input?.contextArea ?? ""),
            mapName: normalizeOptionalSingleLine(input?.mapName, TICKET_LIMITS.mapName),
            weaponOrItem: normalizeOptionalSingleLine(input?.weaponOrItem, TICKET_LIMITS.weaponOrItem),
            matchId: normalizeOptionalSingleLine(input?.matchId, TICKET_LIMITS.matchId),
            reproductionSteps: normalizeOptionalLongText(input?.reproductionSteps, TICKET_LIMITS.reproductionSteps),
            expectedResult: normalizeOptionalLongText(input?.expectedResult, TICKET_LIMITS.expectedResult),
            actualResult: normalizeOptionalLongText(input?.actualResult, TICKET_LIMITS.actualResult),
            severity: String(input?.severity ?? ""),
            externalMediaUrl: externalUrl.value
        }
    };
}

export function validateReplyInput(value) {
    const message = normalizeLongText(value, TICKET_LIMITS.reply);
    const rawLength = String(value ?? "").trim().length;
    if (rawLength < 2 || !isMeaningfulText(value)) {
        return { valid: false, value: message, error: "Reply must contain at least 2 meaningful characters." };
    }
    if (rawLength > TICKET_LIMITS.reply) {
        return { valid: false, value: message, error: `Reply must be ${TICKET_LIMITS.reply} characters or fewer.` };
    }
    return { valid: true, value: message, error: "" };
}
