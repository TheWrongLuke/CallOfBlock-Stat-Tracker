import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { gzipSync } from "node:zlib";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { normalizeMatchTelemetry } from "../src/match/match-telemetry-normalizer.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const fixtureUrl = new URL("../data/match-telemetry/fixture-zombie.json", import.meta.url);
const baseFixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
const statsFixture = JSON.parse(
    (await readFile(new URL("../data/stats.sample.json", import.meta.url), "utf8")).replace(/^\uFEFF/, "")
);
const scenarios = [
    { label: "1 player / 25 zombies / 10 min", players: 1, zombies: 25, durationSeconds: 600 },
    { label: "1 player / 100 zombies / 10 min", players: 1, zombies: 100, durationSeconds: 600 },
    { label: "4 players / 100 zombies / 10 min", players: 4, zombies: 100, durationSeconds: 600 },
    { label: "4 players / 100 zombies / 30 min", players: 4, zombies: 100, durationSeconds: 1800 }
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const results = [];
let renderResults;

try {
    for (const scenario of scenarios) {
        const document = buildTelemetry(scenario);
        const json = JSON.stringify(document);
        const rawBytes = Buffer.byteLength(json);
        const gzipBytes = gzipSync(json, { level: 9 }).byteLength;
        const normalizeStartedAt = performance.now();
        const normalized = normalizeMatchTelemetry(document, document.matchId);
        const normalizeMs = performance.now() - normalizeStartedAt;
        const parseSamples = await page.evaluate((value) => {
            const samples = [];
            for (let index = 0; index < 3; index++) {
                const startedAt = performance.now();
                const parsed = JSON.parse(value);
                samples.push(performance.now() - startedAt);
                if (!parsed.zombieSnapshots?.length) throw new Error("Zombie snapshots were not parsed");
            }
            return samples;
        }, json);
        parseSamples.sort((left, right) => left - right);
        results.push({
            scenario: scenario.label,
            snapshots: document.zombieSnapshots.length,
            zombieStates: document.zombieSnapshots.length * scenario.zombies,
            rawMiB: bytesToMiB(rawBytes),
            gzipMiB: bytesToMiB(gzipBytes),
            compressionRatio: `${Math.round((gzipBytes / rawBytes) * 1000) / 10}%`,
            browserParseMs: round(parseSamples[1]),
            normalizeMs: round(normalizeMs),
            normalizedZombieStates: normalized.zombieSnapshots.reduce(
                (total, snapshot) => total + snapshot.zombies.length,
                0
            )
        });
    }
    renderResults = await measureReplayRendering(browser);
} finally {
    await page.close();
    await browser.close();
}

console.table(results);
console.table(renderResults);

async function measureReplayRendering(activeBrowser) {
    const port = 4195;
    const baseUrl = `http://127.0.0.1:${port}`;
    const server = spawn(process.execPath, ["scripts/static-server.mjs", "--root=dist", `--port=${port}`], {
        cwd: projectRoot,
        stdio: "ignore",
        windowsHide: true
    });
    try {
        await waitForServer(baseUrl);
        const measurements = [];
        for (const count of [25, 50, 100]) {
            const renderPage = await activeBrowser.newPage({ viewport: { width: 1440, height: 900 } });
            const document = buildTelemetry({ players: 1, zombies: count, durationSeconds: 3 });
            document.matchId = `benchmark-render-${count}`;
            await installPageStubs(renderPage, statsFixture);
            await renderPage.route(`**/data/match-telemetry/${document.matchId}.json`, (route) =>
                route.fulfill({ contentType: "application/json", body: JSON.stringify(document) })
            );
            await renderPage.goto(`${baseUrl}/#view=match&match=${document.matchId}`, {
                waitUntil: "domcontentloaded"
            });
            await renderPage.waitForFunction(
                (expected) => document.querySelectorAll(".tactical-zombie-marker").length === expected,
                count
            );
            const measurement = await renderPage.locator("[data-match-timeline]").evaluate((timeline) => {
                const stage = timeline.closest("#match-view").querySelector(".tactical-map-stage");
                const firstMarker = stage.querySelector('[data-tactical-zombie="z-1"]');
                firstMarker.dataset.benchmarkProbe = "reused";
                const startedAt = performance.now();
                for (let index = 0; index < 120; index++) {
                    timeline.value = String((index * 23) % 3000);
                    timeline.dispatchEvent(new Event("input", { bubbles: true }));
                }
                return {
                    markerCount: stage.querySelectorAll(".tactical-zombie-marker").length,
                    markerReused:
                        stage.querySelector('[data-tactical-zombie="z-1"]')?.dataset.benchmarkProbe === "reused",
                    seekUpdates: 120,
                    totalUpdateMs: performance.now() - startedAt
                };
            });
            measurements.push({
                zombies: count,
                markerCount: measurement.markerCount,
                markerReused: measurement.markerReused,
                seekUpdates: measurement.seekUpdates,
                totalUpdateMs: round(measurement.totalUpdateMs),
                averageUpdateMs: round(measurement.totalUpdateMs / measurement.seekUpdates)
            });
            await renderPage.close();
        }
        return measurements;
    } finally {
        server.kill();
    }
}

async function installPageStubs(page, statsPayload) {
    await page.route("https://cdn.jsdelivr.net/**", (route) =>
        route.fulfill({
            contentType: "text/javascript",
            body: `window.supabase={createClient(){const builder=()=>{let proxy;proxy=new Proxy({}, {get(_target,key){if(key==='then')return resolve=>resolve({data:[],error:null});return()=>proxy;}});return proxy;};return{auth:{getSession:async()=>({data:{session:null},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:builder,rpc:async()=>({data:null,error:null})};}};`
        })
    );
    await page.route("**/api-config.js*", (route) =>
        route.fulfill({
            contentType: "text/javascript",
            body: `window.COB_SUPABASE_URL='https://test.supabase.co';window.COB_SUPABASE_KEY='test';window.COB_SUPABASE_TABLE='cob_stats_exports';window.COB_SUPABASE_ROW_ID='live';window.COB_STATS_API_URL='';`
        })
    );
    await page.route("https://test.supabase.co/rest/v1/**", (route) =>
        route.fulfill({ contentType: "application/json", body: JSON.stringify([{ payload: statsPayload }]) })
    );
    await page.route("https://fonts.googleapis.com/**", (route) =>
        route.fulfill({ contentType: "text/css", body: "" })
    );
    await page.route("https://mc-heads.net/**", (route) => route.fulfill({ status: 404, body: "" }));
    await page.route("https://api.mcheads.org/**", (route) => route.fulfill({ status: 404, body: "" }));
}

async function waitForServer(baseUrl) {
    for (let attempt = 0; attempt < 50; attempt++) {
        try {
            const response = await fetch(baseUrl);
            if (response.ok) return;
        } catch {
            // The child process may still be binding the port.
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for benchmark server at ${baseUrl}`);
}

function buildTelemetry({ players, zombies, durationSeconds }) {
    const document = structuredClone(baseFixture);
    document.matchId = `benchmark-zombie-${players}-${zombies}-${durationSeconds}`;
    document.durationMs = durationSeconds * 1000;
    document.endedAt = new Date(Date.parse(document.startedAt) + document.durationMs).toISOString();
    document.events = [];
    document.engagements = [];
    document.participants = Array.from({ length: players }, (_value, index) => ({
        playerId: `p-${index + 1}`,
        name: `Player ${index + 1}`,
        teamId: `team-${index + 1}`
    }));
    document.snapshots = Array.from({ length: durationSeconds + 1 }, (_value, snapshotIndex) => ({
        snapshotId: `snapshot-${snapshotIndex + 1}`,
        timeMs: snapshotIndex * 1000,
        reason: snapshotIndex === 0 ? "match_start" : "periodic",
        players: document.participants.map((participant, playerIndex) => ({
            playerId: participant.playerId,
            teamId: participant.teamId,
            x: coordinate(-160 + playerIndex * 8 + snapshotIndex * 0.04),
            y: 72,
            z: coordinate(-100 + playerIndex * 7 + snapshotIndex * 0.03),
            health: 20,
            maxHealth: 20,
            armor: 4,
            alive: true,
            connected: true,
            vehicleId: null
        })),
        vehicles: []
    }));
    document.zombieSnapshots = Array.from({ length: durationSeconds + 1 }, (_value, snapshotIndex) => ({
        timeMs: snapshotIndex * 1000,
        zombies: Array.from({ length: zombies }, (_entry, zombieIndex) => ({
            zombieId: `z-${zombieIndex + 1}`,
            type: zombieIndex % 10 === 0 ? "runner" : "normal",
            x: coordinate(-420 + ((zombieIndex * 31 + snapshotIndex * 0.7) % 740)),
            y: 70 + (zombieIndex % 4),
            z: coordinate(-410 + ((zombieIndex * 47 + snapshotIndex * 0.5) % 720))
        }))
    }));
    return document;
}

function coordinate(value) {
    return Math.round(value * 10) / 10;
}

function bytesToMiB(value) {
    return Math.round((value / 1024 / 1024) * 1000) / 1000;
}

function round(value) {
    return Math.round(value * 100) / 100;
}
