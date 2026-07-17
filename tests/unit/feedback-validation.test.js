import { describe, expect, it } from "vitest";
import { validateExternalUrl, validateReplyInput, validateTicketInput } from "../../src/utils/feedback-validation.js";

const validTicket = {
    category: "bug_report",
    title: "Weapon reload stops unexpectedly",
    description: "Reloading immediately after switching weapons can leave the weapon unable to fire.",
    contextArea: "deathmatch",
    severity: "medium",
    mapName: "Warehouse",
    weaponOrItem: "Example rifle",
    matchId: "match-123",
    reproductionSteps: "Switch weapons and press reload immediately.",
    expectedResult: "The weapon reloads normally.",
    actualResult: "The reload animation stops and firing remains blocked.",
    externalMediaUrl: "https://example.com/report.png"
};

describe("validateTicketInput", () => {
    it("normalizes a complete valid report", () => {
        const result = validateTicketInput(validTicket);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual({});
        expect(result.value.mapName).toBe("Warehouse");
        expect(result.value.externalMediaUrl).toBe("https://example.com/report.png");
    });

    it("rejects empty or meaningless reports", () => {
        const result = validateTicketInput({
            ...validTicket,
            title: "----",
            description: "...................."
        });
        expect(result.valid).toBe(false);
        expect(result.errors.title).toMatch(/meaningful/i);
        expect(result.errors.description).toMatch(/meaningful/i);
    });

    it("rejects invalid option values and overlong fields", () => {
        const result = validateTicketInput({
            ...validTicket,
            category: "administrator",
            mapName: "x".repeat(101)
        });
        expect(result.errors.category).toMatch(/category/i);
        expect(result.errors.mapName).toMatch(/100/);
    });
});

describe("URL and reply validation", () => {
    it("accepts HTTPS external media and rejects other protocols", () => {
        expect(validateExternalUrl("https://example.com/video").valid).toBe(true);
        expect(validateExternalUrl("http://example.com/video").valid).toBe(false);
        expect(validateExternalUrl("javascript:alert(1)").valid).toBe(false);
    });

    it("requires a meaningful reply within the length limit", () => {
        expect(validateReplyInput("I can reproduce this.").valid).toBe(true);
        expect(validateReplyInput("--").valid).toBe(false);
        expect(validateReplyInput("x".repeat(3001)).valid).toBe(false);
    });
});
