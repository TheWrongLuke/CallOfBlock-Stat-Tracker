import { describe, expect, it } from "vitest";
import { isPublicBuildFile } from "../../scripts/public-build-files.mjs";

describe("public build file allowlist", () => {
    it("keeps runtime modules, styles, images, fonts and tracker data", () => {
        expect(isPublicBuildFile("src", true)).toBe(true);
        expect(isPublicBuildFile("src/api", true)).toBe(true);
        for (const file of [
            "src/api/network-admin.js",
            "assets/maps/raid.png",
            "assets/css/styles.css",
            "assets/font.woff2",
            "data/stats.json"
        ]) {
            expect(isPublicBuildFile(file), file).toBe(true);
        }
    });

    it("excludes private files, caches, backups and developer fixtures", () => {
        for (const file of [
            "src/.env",
            "assets/secret.key",
            "assets/key.pem",
            "data/db.sql",
            "data/token.dpapi",
            "data/stats.backup.json",
            "data/.cache/state.json",
            "data/secrets/tokens.json",
            "src/node_modules/lib.js",
            "data/fixture-br.json",
            "data/match-telemetry/fixture-br.json",
            "data/match-telemetry/schema-v1.txt",
            "assets/original.psd",
            "src/notes.md",
            "data/token",
            "scripts/build.mjs"
        ]) {
            expect(isPublicBuildFile(file), file).toBe(false);
        }
        expect(isPublicBuildFile("data\\credentials\\tokens.json")).toBe(false);
        expect(isPublicBuildFile("src/secrets", true)).toBe(false);
    });
});
