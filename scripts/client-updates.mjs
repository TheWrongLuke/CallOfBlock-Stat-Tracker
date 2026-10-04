import { createHash, createPublicKey, verify } from "node:crypto";
import { readFile, lstat, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";

const KEY = "MCowBQYDK2VwAyEA8tE87h6HIqGqxdcc+Ni5uEqrV6+MW6a/tkZcCh+ufqA=";

export function verifyClientRelease(envelope, key = KEY) {
    const payload = Buffer.from(envelope.payload, "base64");
    const signature = Buffer.from(envelope.signature, "base64");
    const publicKey = createPublicKey({ key: Buffer.from(key, "base64"), type: "spki", format: "der" });
    if (payload.length > 8192 || !verify(null, payload, publicKey, signature)) {
        throw new Error("Invalid BRControl update signature");
    }
    const release = JSON.parse(payload.toString("utf8"));
    if (
        release.schemaVersion !== 1 ||
        release.minecraft !== "1.20.1" ||
        release.loader !== "forge" ||
        !/^[a-f0-9]{64}$/.test(release.sha256) ||
        !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(release.version) ||
        !Number.isSafeInteger(release.bytes) ||
        release.bytes < 1024 ||
        release.bytes > 32 * 1024 * 1024 ||
        !Number.isSafeInteger(release.release) ||
        release.release <= 0 ||
        release.url !== `https://callofblock.com/updates/brcontrol/${release.sha256}/brcontrol.jar`
    ) {
        throw new Error("Invalid BRControl release metadata");
    }
    return release;
}

export async function copyClientRelease(root, output) {
    const updates = path.join(root, "public", "updates", "brcontrol");
    const manifest = path.join(updates, "latest.json");
    const release = verifyClientRelease(JSON.parse(await readFile(manifest, "utf8")));
    const artifact = path.join(updates, release.sha256, "brcontrol.jar");
    for (const entry of [updates, manifest, path.dirname(artifact), artifact]) {
        if ((await lstat(entry)).isSymbolicLink()) throw new Error("Linked client release refused");
    }
    const bytes = await readFile(artifact);
    if (bytes.length !== release.bytes || createHash("sha256").update(bytes).digest("hex") !== release.sha256) {
        throw new Error("BRControl artifact checksum mismatch");
    }
    const destination = path.join(output, "updates", "brcontrol");
    await mkdir(path.join(destination, release.sha256), { recursive: true });
    await copyFile(manifest, path.join(destination, "latest.json"));
    await copyFile(artifact, path.join(destination, release.sha256, "brcontrol.jar"));
}
