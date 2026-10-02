import { describe, expect, it } from "vitest";
import {
    accountProgress,
    renderAccountProgress,
    accountAccessIntent,
    renderAccountAccessLinks,
    renderAccountAccessChoices
} from "../../src/core/account-view.js";

describe("shared account progression", () => {
    it("shows the same existing level calculation and remaining XP", () => {
        expect(accountProgress(12500)).toMatchObject({
            level: 2,
            currentLevelXp: 2500,
            xpRemaining: 7500,
            levelProgress: 0.25
        });
        const html = renderAccountProgress(12500);
        expect(html).toContain('value="2500"');
        expect(html).toContain("7,500 to level 3");
        expect(html).toContain("12,500 XP total");
    });
    it("handles level boundaries and maximum level without overflowing", () => {
        expect(accountProgress(10000)).toMatchObject({ level: 2, currentLevelXp: 0 });
        expect(accountProgress(9990000)).toMatchObject({ level: 1000, maximum: true, xpRemaining: 0 });
        expect(renderAccountProgress(20000000)).toContain("Maximum level");
        expect(renderAccountProgress(20000000)).toContain("20,000,000 XP total");
    });
    it("rejects invalid XP and never invents zero for an unavailable projection", () => {
        for (const value of [undefined, NaN, Infinity, -100, "invalid"]) expect(accountProgress(value).level).toBe(1);
        const html = renderAccountProgress(0, { unavailable: true });
        expect(html).toContain("Progress unavailable");
        expect(html).not.toContain("<progress");
        expect(html).not.toContain("0 XP");
    });
});

describe("account access", () => {
    it("distinguishes registration without treating arbitrary input as markup", () => {
        expect(accountAccessIntent("?auth=register")).toBe("register");
        expect(accountAccessIntent("?auth=<script>")).toBe("login");
        expect(renderAccountAccessChoices("register")).toContain("Create your account");
        expect(renderAccountAccessChoices("login")).toContain("Welcome back");
        expect(renderAccountAccessLinks()).toContain("/account/?auth=register");
        expect(renderAccountAccessLinks({ disabled: true })).not.toContain("href");
    });
});
