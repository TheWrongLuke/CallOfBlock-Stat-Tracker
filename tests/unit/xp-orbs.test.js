import { describe, expect, it } from "vitest";
import { advanceXpOrb, xpOrbAmounts } from "../../src/features/xp-orbs.js";

describe("XP orb reward amounts", () => {
    it("increases catch-up acceleration for longer flights without teleporting", () => {
        const early = { x: 0, y: 0, vx: 0, vy: 0 },
            late = { ...early };
        advanceXpOrb(early, { x: 300, y: 0 }, 1 / 60, 10);
        advanceXpOrb(late, { x: 300, y: 0 }, 1 / 60, 24);
        expect(late.vx).toBeGreaterThan(early.vx);
        expect(late.x).toBeGreaterThan(early.x);
        expect(late.x).toBeLessThan(30);
    });
    it("retargets a moving bar without dragging the orb", () => {
        const orb = { x: 20, y: 10, vx: 0, vy: 0 };
        advanceXpOrb(orb, { x: 300, y: 100 }, 0);
        expect(orb.x).toBe(20);
        expect(orb.y).toBe(10);
        advanceXpOrb(orb, { x: 300, y: 100 }, 1 / 60);
        expect(orb.x).toBeGreaterThan(20);
        expect(orb.x).toBeLessThan(30);
        const x = orb.x;
        advanceXpOrb(orb, { x: 340, y: 100 }, 0);
        expect(orb.x).toBeCloseTo(x);
        for (let i = 0; i < 180; i++) advanceXpOrb(orb, { x: 340, y: 100 }, 1 / 60);
        expect(orb.x).toBeCloseTo(340);
        expect(orb.y).toBeCloseTo(100);
    });
    it("splits 350 into three hundreds and the exact remainder", () => {
        expect(xpOrbAmounts(350)).toEqual([100, 100, 100, 50]);
        expect(xpOrbAmounts(350, 50)).toEqual(Array(7).fill(50));
        expect(xpOrbAmounts(50)).toEqual([50]);
        expect(xpOrbAmounts(400)).toEqual([100, 100, 100, 100]);
    });
    it("bounds visual work without losing XP and rejects invalid rewards", () => {
        const parts = xpOrbAmounts(20000, 50);
        expect(parts).toHaveLength(80);
        expect(parts.reduce((sum, amount) => sum + amount, 0)).toBe(20000);
        for (const reward of [0, -1, NaN, Infinity]) expect(xpOrbAmounts(reward)).toEqual([]);
    });
});
