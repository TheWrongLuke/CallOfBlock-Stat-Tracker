import { describe, it, expect } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { verifyClientRelease } from "../../scripts/client-updates.mjs";

describe("signed BRControl releases", () => {
    const keys = generateKeyPairSync("ed25519");
    const key = keys.publicKey.export({ type: "spki", format: "der" }).toString("base64");
    const release = {
        schemaVersion: 1,
        minecraft: "1.20.1",
        loader: "forge",
        version: "0.4.1",
        release: 1791072000,
        bytes: 4096,
        sha256: "a".repeat(64),
        url: `https://callofblock.com/updates/brcontrol/${"a".repeat(64)}/brcontrol.jar`
    };
    const envelope = (data) => {
        const payload = Buffer.from(JSON.stringify(data));
        return {
            payload: payload.toString("base64"),
            signature: sign(null, payload, keys.privateKey).toString("base64")
        };
    };
    it("verifies the exact signed release and restricts its download", () => {
        expect(verifyClientRelease(envelope(release), key)).toEqual(release);
        expect(() => verifyClientRelease(envelope({ ...release, url: "https://evil.invalid/a.jar" }), key)).toThrow();
        expect(() => verifyClientRelease(envelope({ ...release, minecraft: "1.21.1" }), key)).toThrow();
    });
    it("rejects tampered data and unrelated signing keys", () => {
        const altered = envelope(release);
        altered.payload = Buffer.from(JSON.stringify({ ...release, bytes: 8192 })).toString("base64");
        expect(() => verifyClientRelease(altered, key)).toThrow();
        expect(() => verifyClientRelease(envelope(release))).toThrow();
    });
});
