import { describe, expect, it } from "vitest";
import { applyMapCalibration, fitMapCalibration } from "../../src/match/map-calibration.js";

describe("map calibration", () => {
    it("requires three non-collinear points", () => {
        expect(fitMapCalibration([]).valid).toBe(false);
        expect(
            fitMapCalibration([
                { worldX: 0, worldZ: 0, imageXPercent: 10, imageYPercent: 20 },
                { worldX: 10, worldZ: 10, imageXPercent: 30, imageYPercent: 40 },
                { worldX: 20, worldZ: 20, imageXPercent: 50, imageYPercent: 60 }
            ]).valid
        ).toBe(false);
    });

    it("fits translation, scale, rotation, and inversion through an affine transform", () => {
        const source = {
            imageX: [0.1, -0.04, 20],
            imageY: [0.03, 0.08, 15]
        };
        const points = [
            [0, 0],
            [200, 0],
            [0, 300],
            [200, 300],
            [100, 150]
        ].map(([worldX, worldZ], index) => ({
            label: `Point ${index + 1}`,
            worldX,
            worldZ,
            imageXPercent: applyMapCalibration(source, worldX, worldZ).x,
            imageYPercent: applyMapCalibration(source, worldX, worldZ).y
        }));

        const fit = fitMapCalibration(points);
        expect(fit.valid).toBe(true);
        expect(fit.rmsErrorPercent).toBeLessThan(1e-8);
        fit.transform.imageX.forEach((value, index) => expect(value).toBeCloseTo(source.imageX[index], 8));
        fit.transform.imageY.forEach((value, index) => expect(value).toBeCloseTo(source.imageY[index], 8));
        expect(applyMapCalibration(fit.transform, 40, 80)).toEqual({
            x: expect.closeTo(20.8),
            y: expect.closeTo(22.6)
        });
    });
});
