import { describe, expect, it } from "vitest";
import {
    FEEDBACK_DRAFT_FIELD_NAMES,
    feedbackDraftHasContent,
    normalizeFeedbackDraftFields
} from "../../src/services/feedback-drafts.js";

describe("feedback draft normalization", () => {
    it("keeps only known fields and enforces the ticket limits", () => {
        const fields = normalizeFeedbackDraftFields({
            category: "cheat_report",
            title: "x".repeat(200),
            description: "Detailed evidence",
            unexpected: "not stored"
        });

        expect(Object.keys(fields)).toEqual(FEEDBACK_DRAFT_FIELD_NAMES);
        expect(fields.category).toBe("cheat_report");
        expect(fields.title).toHaveLength(120);
        expect(fields).not.toHaveProperty("unexpected");
    });

    it("ignores untouched defaults but recognizes text, changed options, and attachments", () => {
        const defaults = {
            category: "bug_report",
            severity: "medium",
            contextArea: "not_applicable"
        };

        expect(feedbackDraftHasContent(defaults)).toBe(false);
        expect(feedbackDraftHasContent({ ...defaults, title: "Saved report" })).toBe(true);
        expect(feedbackDraftHasContent({ ...defaults, category: "cheat_report" })).toBe(true);
        expect(feedbackDraftHasContent(defaults, { name: "evidence.png" })).toBe(true);
    });
});
