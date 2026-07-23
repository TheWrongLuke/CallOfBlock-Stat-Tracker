import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const configDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(configDirectory, "..");

export default defineConfig({
    root: projectRoot,
    test: {
        environment: "node",
        include: ["tests/unit/**/*.test.js"]
    }
});
