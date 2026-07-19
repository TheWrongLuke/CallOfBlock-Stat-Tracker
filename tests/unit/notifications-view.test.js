import { describe, expect, it } from "vitest";
import { renderGiftNotificationPopup, renderNotificationInbox } from "../../src/views/notifications.js";

const gift = {
    id: "gift-1",
    type: "cosmetic_gift",
    title: "You received Founder",
    message: "Thanks for helping <script>",
    cosmeticType: "background",
    cosmeticId: "founder",
    cosmeticName: "Founder Background",
    cosmeticImage: "./assets/founder.png",
    cosmeticRarity: "legendary",
    senderName: "Owner <admin>",
    readAt: "",
    claimedAt: "",
    createdAt: "2026-07-19T12:00:00Z"
};

describe("notification views", () => {
    it("renders unread, expandable, claimable, and deletable notifications safely", () => {
        const html = renderNotificationInbox({ items: [gift], expandedId: gift.id });

        expect(html).toContain("1 unread");
        expect(html).toContain('data-notification-toggle="gift-1"');
        expect(html).toContain('data-notification-claim="gift-1"');
        expect(html).toContain('data-notification-read="gift-1"');
        expect(html).toContain('data-notification-delete="gift-1"');
        expect(html).toContain("Thanks for helping &lt;script&gt;");
        expect(html).toContain("Owner &lt;admin&gt;");
        expect(html).not.toContain("Owner <admin>");
    });

    it("filters read notifications and shows the empty unread state", () => {
        const html = renderNotificationInbox({
            items: [{ ...gift, readAt: "2026-07-19T12:01:00Z" }],
            filter: "unread"
        });

        expect(html).toContain("No unread notifications");
        expect(html).not.toContain('data-notification-toggle="gift-1"');
    });

    it("renders a fixed gift prompt until the cosmetic is claimed", () => {
        const html = renderGiftNotificationPopup(gift);

        expect(html).toContain("You Got A Gift");
        expect(html).toContain("Founder Background");
        expect(html).toContain("data-notification-gift-close");
        expect(html).toContain('data-notification-claim="gift-1"');
        expect(renderGiftNotificationPopup({ ...gift, claimedAt: "2026-07-19T12:02:00Z" })).toBe("");
    });
});
