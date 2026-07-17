import { describe, expect, it } from "vitest";
import {
    FEEDBACK_ATTACHMENT_BUCKET,
    FEEDBACK_ATTACHMENT_MAX_BYTES,
    createFeedbackAttachmentView,
    createFeedbackTicketId,
    feedbackAttachmentKind,
    feedbackAttachmentPathFromUrl,
    uploadFeedbackAttachment,
    validateFeedbackAttachment
} from "../../src/services/feedback-attachments.js";

const userId = "123e4567-e89b-42d3-a456-426614174000";
const ticketId = "223e4567-e89b-42d3-a456-426614174000";
const evidenceId = "323e4567-e89b-42d3-a456-426614174000";
const evidencePath = `${userId}/${ticketId}/evidence-${evidenceId}.mp4`;
const storedUrl = `https://project.supabase.co/storage/v1/object/public/${FEEDBACK_ATTACHMENT_BUCKET}/${evidencePath}`;

describe("feedback attachment validation", () => {
    it("accepts supported evidence and rejects unsafe or oversized files", () => {
        expect(validateFeedbackAttachment({ name: "shot.png", type: "image/png", size: 2048 }).valid).toBe(true);
        expect(validateFeedbackAttachment({ name: "payload.svg", type: "image/svg+xml", size: 2048 }).valid).toBe(
            false
        );
        expect(
            validateFeedbackAttachment({
                name: "large.mp4",
                type: "video/mp4",
                size: FEEDBACK_ATTACHMENT_MAX_BYTES + 1
            }).valid
        ).toBe(false);
    });

    it("recognizes only generated private attachment paths", () => {
        expect(feedbackAttachmentPathFromUrl(storedUrl)).toBe(evidencePath);
        expect(feedbackAttachmentKind(storedUrl)).toBe("video");
        expect(
            feedbackAttachmentPathFromUrl(
                `https://project.supabase.co/storage/v1/object/public/${FEEDBACK_ATTACHMENT_BUCKET}/${userId}/../secret.mp4`
            )
        ).toBe("");
    });

    it("creates UUID ticket identifiers", () => {
        expect(createFeedbackTicketId()).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        );
    });
});

describe("feedback attachment storage", () => {
    it("uploads with a generated path and no overwrite", async () => {
        let uploadedPath = "";
        const bucket = {
            async upload(path, _file, options) {
                uploadedPath = path;
                expect(options.upsert).toBe(false);
                expect(options.contentType).toBe("image/png");
                return { data: { path }, error: null };
            },
            getPublicUrl(path) {
                return {
                    data: {
                        publicUrl: `https://project.supabase.co/storage/v1/object/public/${FEEDBACK_ATTACHMENT_BUCKET}/${path}`
                    }
                };
            },
            async remove() {
                return { data: [], error: null };
            }
        };
        const client = { storage: { from: (name) => (expect(name).toBe(FEEDBACK_ATTACHMENT_BUCKET), bucket) } };
        const result = await uploadFeedbackAttachment(client, {
            file: { name: "shot.png", type: "image/png", size: 2048 },
            userId,
            ticketId
        });
        expect(result.path).toBe(uploadedPath);
        expect(result.path).toMatch(new RegExp(`^${userId}/${ticketId}/evidence-[0-9a-f-]{36}\\.png$`, "i"));
    });

    it("creates a temporary signed view for private evidence", async () => {
        const client = {
            storage: {
                from(name) {
                    expect(name).toBe(FEEDBACK_ATTACHMENT_BUCKET);
                    return {
                        async createSignedUrl(path, expiresIn) {
                            expect(path).toBe(evidencePath);
                            expect(expiresIn).toBe(3600);
                            return {
                                data: { signedUrl: "https://project.supabase.co/signed/evidence.mp4" },
                                error: null
                            };
                        }
                    };
                }
            }
        };
        const result = await createFeedbackAttachmentView(client, storedUrl);
        expect(result.managed).toBe(true);
        expect(result.kind).toBe("video");
        expect(result.signedUrl).toMatch(/^https:/);
    });
});
