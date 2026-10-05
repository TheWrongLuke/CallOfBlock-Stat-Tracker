import { describe, expect, it } from "vitest";
import { notificationKind, rewardPopupEligible } from "../../src/core/notification-kinds.js";

describe("shared notification kinds", () => {
    it("maps system contexts without converting gifts or unknown events", () => {
        for (const kind of ["unlock", "achievement", "playtest"]) {
            expect(notificationKind({ notification_type: "system", gift_source: kind })).toBe(kind);
        }
        expect(notificationKind({ notification_type: "cosmetic_gift", gift_source: "unlock" })).toBe("cosmetic_gift");
        expect(notificationKind({ notification_type: "system", gift_source: "unknown" })).toBe("system");
        expect(notificationKind({ notification_type: "unknown" })).toBe("");
    });
    it("pops up only unseen unread unclaimed rewards", () => {
        for (const type of ["cosmetic_gift", "unlock", "achievement"]) {
            const item = { id: "one", type };
            expect(rewardPopupEligible(item, new Set())).toBe(true);
            expect(rewardPopupEligible(item, new Set(["one"]))).toBe(false);
            expect(rewardPopupEligible({ ...item, readAt: "now" }, new Set())).toBe(false);
            expect(rewardPopupEligible({ ...item, claimedAt: "now" }, new Set())).toBe(false);
        }
        expect(rewardPopupEligible({ id: "one", type: "playtest" }, new Set())).toBe(false);
    });
});
