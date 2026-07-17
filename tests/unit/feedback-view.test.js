import { describe, expect, it } from "vitest";
import { renderFeedbackContent, renderTicketDetailContent } from "../../src/views/feedback.js";

const ticket = {
    id: "123e4567-e89b-42d3-a456-426614174000",
    created_by: "user-1",
    category: "bug_report",
    title: "<img src=x onerror=alert(1)>",
    description: "<script>alert('ticket')</script> A detailed report that remains readable.",
    context_area: "website",
    map_name: null,
    weapon_or_item: null,
    match_id: null,
    reproduction_steps: null,
    expected_result: null,
    actual_result: null,
    severity: "high",
    status: "under_review",
    external_media_url: "javascript:alert(1)",
    assigned_admin: null,
    created_at: "2026-07-16T12:00:00Z",
    updated_at: "2026-07-16T12:30:00Z"
};

describe("feedback views", () => {
    it("renders the logged-out Discord requirement", () => {
        const html = renderFeedbackContent({
            authConfigured: true,
            authReady: true,
            loggedIn: false,
            loading: false,
            tickets: [],
            statusFilter: "all",
            categoryFilter: "all",
            message: "",
            error: ""
        });
        expect(html).toContain("Login with Discord");
    });

    it("escapes submitted content and rejects unsafe media links", () => {
        const html = renderTicketDetailContent({
            authConfigured: true,
            authReady: true,
            loggedIn: true,
            admin: false,
            loading: false,
            ticket,
            messages: [
                {
                    id: "message-1",
                    author_id: "user-1",
                    message: "<svg onload=alert(1)>",
                    is_staff_reply: false,
                    is_private_staff_note: false,
                    created_at: "2026-07-16T12:10:00Z"
                }
            ],
            history: [],
            reporter: null,
            admins: [],
            accountId: "user-1",
            error: "",
            message: "",
            authorNames: new Map([["user-1", "Reporter"]])
        });

        expect(html).not.toContain("<script>");
        expect(html).not.toContain("<svg onload");
        expect(html).not.toContain('href="javascript:');
        expect(html).toContain("&lt;script&gt;");
        expect(html).toContain("&lt;svg onload=alert(1)&gt;");
    });

    it("renders signed private screenshot evidence without exposing the stored bucket URL", () => {
        const privateTicket = {
            ...ticket,
            external_media_url:
                "https://project.supabase.co/storage/v1/object/public/feedback-attachments/123e4567-e89b-42d3-a456-426614174000/223e4567-e89b-42d3-a456-426614174000/evidence-323e4567-e89b-42d3-a456-426614174000.png"
        };
        const html = renderTicketDetailContent({
            authConfigured: true,
            authReady: true,
            loggedIn: true,
            admin: false,
            loading: false,
            ticket: privateTicket,
            messages: [],
            history: [],
            reporter: null,
            admins: [],
            accountId: "user-1",
            error: "",
            message: "",
            authorNames: new Map(),
            attachment: {
                managed: true,
                loading: false,
                signedUrl:
                    "https://project.supabase.co/storage/v1/object/sign/feedback-attachments/evidence.png?token=test",
                kind: "image",
                error: ""
            }
        });

        expect(html).toContain("Attached screenshot evidence");
        expect(html).toContain("token=test");
        expect(html).not.toContain(privateTicket.external_media_url);
    });
});
