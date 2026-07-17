import { describe, expect, it } from "vitest";
import { isAdminProfile, canOpenAdminRoute } from "../../src/auth/permissions.js";
import { ticketCategoryLabel, ticketSeverityRank, ticketStatusLabel } from "../../src/config/feedback.js";
import { formatDate, formatDateTime } from "../../src/utils/dates.js";
import { formatRatioPercent } from "../../src/utils/formatting.js";
import { escapeHtml } from "../../src/utils/sanitization.js";

describe("date formatting", () => {
    it("formats valid values and handles invalid values", () => {
        expect(formatDate("2026-07-16T12:30:00Z", "en-GB", { timeZone: "UTC" })).toContain("16 Jul 2026");
        expect(formatDateTime("2026-07-16T12:30:00Z", "en-GB", { timeZone: "UTC" })).toContain("12:30");
        expect(formatDateTime("invalid", "en-GB")).toBe("Unknown time");
    });
});

describe("formatting and mappings", () => {
    it("formats ratios as percentages", () => {
        expect(formatRatioPercent(0.625)).toBe("63%");
        expect(formatRatioPercent(62.5, { alreadyPercent: true, maximumFractionDigits: 1 })).toBe("62.5%");
    });

    it("maps ticket values to labels and severity order", () => {
        expect(ticketCategoryLabel("bug_report")).toBe("Bug Report");
        expect(ticketCategoryLabel("cheat_report")).toBe("Cheat Report");
        expect(ticketStatusLabel("need_more_information")).toBe("Need More Information");
        expect(ticketSeverityRank("critical")).toBeGreaterThan(ticketSeverityRank("high"));
    });

    it("escapes user-controlled HTML", () => {
        expect(escapeHtml('<img src=x onerror="alert(1)">')).not.toContain("<img");
    });
});

describe("permissions", () => {
    it("requires both completed auth and a database admin profile", () => {
        expect(isAdminProfile({ is_admin: true })).toBe(true);
        expect(isAdminProfile({ is_admin: false })).toBe(false);
        expect(canOpenAdminRoute({ authReady: true, profile: { is_admin: true } })).toBe(true);
        expect(canOpenAdminRoute({ authReady: false, profile: { is_admin: true } })).toBe(false);
    });
});
