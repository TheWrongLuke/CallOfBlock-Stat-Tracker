import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const configDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(configDirectory, "..");

export default defineConfig({
    testDir: path.join(projectRoot, "tests", "e2e"),
    fullyParallel: true,
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI ? "github" : "list",
    use: {
        baseURL: "http://127.0.0.1:4175",
        trace: "retain-on-failure"
    },
    projects: [
        { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
        { name: "mobile-chromium", use: { ...devices["Pixel 7"] } }
    ],
    webServer: {
        command: "node scripts/static-server.mjs --root=dist --port=4175",
        cwd: projectRoot,
        url: "http://127.0.0.1:4175",
        reuseExistingServer: !process.env.CI,
        timeout: 30_000
    }
});
