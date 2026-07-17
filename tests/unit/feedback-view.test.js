import { describe, expect, it } from "vitest";
import {
    renderAdminTicketsContent,
    renderFeedbackContent,
    renderTicketDetailContent
} from "../../src/views/feedback.js";

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

    it("renders local draft status and discard controls for a signed-in reporter", () => {
        const html = renderFeedbackContent({
            authConfigured: true,
            authReady: true,
            loggedIn: true,
            loading: false,
            tickets: [],
            statusFilter: "all",
            categoryFilter: "all",
            message: "",
            error: ""
        });
        expect(html).toContain("data-feedback-draft-status");
        expect(html).toContain("data-feedback-draft-attachment");
        expect(html).toContain("data-feedback-draft-discard");
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

    it("uses Discord usernames instead of numeric Discord IDs in admin identity details", () => {
        const html = renderTicketDetailContent({
            authConfigured: true,
            authReady: true,
            loggedIn: true,
            admin: true,
            loading: false,
            ticket,
            messages: [],
            history: [],
            reporter: {
                id: "user-1",
                username: "reporter_name",
                display_name: "Reporter",
                discord_id: "123456789012345678",
                minecraft_player_name: "ReporterMC",
                created_at: "2026-07-01T12:00:00Z"
            },
            admins: [],
            accountId: "admin-1",
            error: "",
            message: "",
            authorNames: new Map()
        });

        expect(html).toContain("Discord username");
        expect(html).toContain("@reporter_name");
        expect(html).not.toContain("123456789012345678");
        expect(html).not.toContain("Discord ID");
    });

    it("renders the remembered closed-ticket filter", () => {
        const html = renderAdminTicketsContent({
            loading: false,
            tickets: [],
            filters: {
                search: "",
                category: "all",
                status: "all",
                severity: "all",
                sort: "updated",
                hideClosed: true
            },
            counts: { open: 0, needInfo: 0, confirmed: 0, planned: 0, resolved: 0, highPriority: 0 },
            error: ""
        });

        expect(html).toContain("data-admin-ticket-hide-closed");
        expect(html).toContain("Hide closed tickets");
        expect(html).toMatch(/data-admin-ticket-hide-closed checked/);
    });
});
