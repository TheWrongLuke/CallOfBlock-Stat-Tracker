const MODE_LABELS = {
    battleRoyale: "Battle Royale",
    deathmatch: "Deathmatch"
};

const SORT_LABELS = {
    wins: "Wins",
    kills: "Kills",
    games: "Games"
};

const state = {
    data: null,
    preview: false,
    mode: "battleRoyale",
    sort: "wins",
    page: 1,
    pageSize: 20,
    query: "",
    selectedId: null
};

document.addEventListener("DOMContentLoaded", () => {
    bindStaticEvents();
    void loadData();
});

function bindStaticEvents() {
    const search = document.getElementById("player-search");
    search.addEventListener("input", (event) => {
        state.query = event.target.value.trim().toLowerCase();
        state.page = 1;
        render();
    });
}

async function loadData() {
    let data = await fetchJson("./data/stats.json");
    if (!hasTrackedPlayers(data)) {
        const sample = await fetchJson("./data/stats.sample.json");
        if (sample) {
            data = sample;
            state.preview = true;
        }
    }
    state.data = data || emptyExport();
    state.selectedId = state.data.profiles[0]?.playerId || null;
    render();
}

async function fetchJson(path) {
    try {
        const response = await fetch(path, { cache: "no-store" });
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        console.error("Failed to load", path, error);
        return null;
    }
}

function hasTrackedPlayers(data) {
    if (!data?.modes) return false;
    return Object.values(data.modes).some((mode) => Array.isArray(mode.players) && mode.players.length > 0);
}

function emptyExport() {
    return {
        generatedAt: null,
        sourceFile: "match_leaderboards_web.json",
        supportedSorts: ["wins", "kills", "games"],
        modes: {
            battleRoyale: { id: "battleRoyale", label: "Battle Royale", totalPlayers: 0, leaderboards: {}, players: [] },
            deathmatch: { id: "deathmatch", label: "Deathmatch", totalPlayers: 0, leaderboards: {}, players: [] }
        },
        profiles: []
    };
}

function render() {
    renderMeta();
    renderModeTabs();
    renderSortTabs();
    renderSummary();
    renderTable();
    renderProfile();
}

function renderMeta() {
    document.getElementById("data-source").textContent = state.data?.sourceFile || "stats.json";
    document.getElementById("generated-at").textContent = state.data?.generatedAt ? formatDateTime(state.data.generatedAt) : "No export yet";
    document.getElementById("preview-flag").textContent = state.preview ? "Yes" : "No";
}

function renderModeTabs() {
    const container = document.getElementById("mode-tabs");
    container.innerHTML = "";
    for (const modeId of Object.keys(MODE_LABELS)) {
        const button = createPill(MODE_LABELS[modeId], state.mode === modeId, () => {
            state.mode = modeId;
            state.page = 1;
            render();
        });
        button.classList.add("tab-pill");
        container.appendChild(button);
    }
    document.getElementById("leaderboard-title").textContent = `${MODE_LABELS[state.mode]} ranking`;
}

function renderSortTabs() {
    const container = document.getElementById("sort-tabs");
    container.innerHTML = "";
    for (const sortId of state.data?.supportedSorts || Object.keys(SORT_LABELS)) {
        const button = createPill(SORT_LABELS[sortId] || sortId, state.sort === sortId, () => {
            state.sort = sortId;
            state.page = 1;
            render();
        });
        button.classList.add("sort-pill");
        container.appendChild(button);
    }
}

function renderSummary() {
    const mode = currentMode();
    const players = mode.players || [];
    const summary = [
        { label: "Tracked Players", value: players.length, helper: `${MODE_LABELS[state.mode]} totals` },
        { label: "Leaders With Wins", value: players.filter((player) => player.stats.wins > 0).length, helper: "Players with at least one win" },
        { label: "Average Kills", value: formatNumber(average(players, (player) => player.derived.avgKills)), helper: "Kills per game across all tracked players" },
        { label: "Best KD", value: formatNumber(best(players, (player) => player.derived.kdRatio)), helper: "Highest KD in this mode" }
    ];

    const container = document.getElementById("summary-grid");
    container.innerHTML = "";
    for (const item of summary) {
        const card = document.createElement("article");
        card.className = "summary-card";
        card.innerHTML = `<span>${escapeHtml(item.label)}</span><strong>${escapeHtml(String(item.value))}</strong><span>${escapeHtml(item.helper)}</span>`;
        container.appendChild(card);
    }
}

function renderTable() {
    const rows = filteredPlayers();
    const body = document.getElementById("leaderboard-body");
    const empty = document.getElementById("empty-state");
    const wrap = document.querySelector(".table-wrap");

    body.innerHTML = "";

    if (rows.length === 0) {
        empty.classList.remove("hidden");
        wrap.classList.add("hidden");
        renderPagination(0, 0);
        return;
    }

    empty.classList.add("hidden");
    wrap.classList.remove("hidden");

    const start = (state.page - 1) * state.pageSize;
    const pageRows = rows.slice(start, start + state.pageSize);
    for (const player of pageRows) {
        const tr = document.createElement("tr");
        if (player.playerId === state.selectedId) tr.classList.add("selected");
        tr.addEventListener("click", () => {
            state.selectedId = player.playerId;
            render();
        });

        tr.innerHTML = `
            <td><span class="rank-badge rank-${Math.min(player.ranks[state.sort], 3)}">${player.ranks[state.sort] || "-"}</span></td>
            <td>
                <div class="player-name">
                    <strong>${escapeHtml(player.name)}</strong>
                    <small>${escapeHtml(player.playerId)}</small>
                </div>
            </td>
            <td>${player.stats.wins}</td>
            <td>${player.stats.kills}</td>
            <td>${player.stats.games}</td>
            <td>${player.stats.deaths}</td>
            <td>${formatPercent(player.derived.winRate)}</td>
            <td>${formatNumber(player.derived.avgKills)}</td>
            <td>${formatNumber(player.derived.kdRatio)}</td>
        `;
        body.appendChild(tr);
    }

    renderPagination(rows.length, Math.ceil(rows.length / state.pageSize));
}

function renderPagination(totalRows, totalPages) {
    const container = document.getElementById("pagination");
    container.innerHTML = "";
    if (totalRows <= 0) return;

    const left = document.createElement("div");
    left.className = "page-status";
    const start = (state.page - 1) * state.pageSize + 1;
    const end = Math.min(totalRows, state.page * state.pageSize);
    left.textContent = `Showing ${start}-${end} of ${totalRows}`;

    const right = document.createElement("div");
    right.className = "tab-row";

    const prev = createPageButton("Prev", state.page > 1, () => {
        if (state.page <= 1) return;
        state.page -= 1;
        render();
    });
    right.appendChild(prev);

    const visiblePages = pageWindow(totalPages, state.page, 5);
    for (const page of visiblePages) {
        const button = createPageButton(String(page), true, () => {
            state.page = page;
            render();
        });
        if (page === state.page) button.classList.add("active");
        right.appendChild(button);
    }

    const next = createPageButton("Next", state.page < totalPages, () => {
        if (state.page >= totalPages) return;
        state.page += 1;
        render();
    });
    right.appendChild(next);

    container.appendChild(left);
    container.appendChild(right);
}

function renderProfile() {
    const container = document.getElementById("profile-body");
    const profile = state.data?.profiles?.find((entry) => entry.playerId === state.selectedId) || null;
    document.getElementById("profile-title").textContent = profile?.name || "Select a player";

    if (!profile) {
        container.innerHTML = `<div class="profile-placeholder"><p>Pick a player row to inspect their Battle Royale and Deathmatch stats side by side.</p></div>`;
        return;
    }

    container.innerHTML = [
        renderModeBlock("Battle Royale", profile.battleRoyale),
        renderModeBlock("Deathmatch", profile.deathmatch)
    ].join("");
}

function renderModeBlock(label, payload) {
    if (!payload) {
        return `
            <section class="mode-block">
                <h3>${escapeHtml(label)}</h3>
                <p class="mode-empty">No recorded matches in this mode yet.</p>
            </section>
        `;
    }

    return `
        <section class="mode-block">
            <h3>${escapeHtml(label)}</h3>
            <div class="profile-stats">
                ${renderProfileStat("Wins", payload.stats.wins)}
                ${renderProfileStat("Kills", payload.stats.kills)}
                ${renderProfileStat("Games", payload.stats.games)}
                ${renderProfileStat("Deaths", payload.stats.deaths)}
                ${renderProfileStat("Win Rate", formatPercent(payload.derived.winRate))}
                ${renderProfileStat("Avg Kills", formatNumber(payload.derived.avgKills))}
                ${renderProfileStat("Avg Deaths", formatNumber(payload.derived.avgDeaths))}
                ${renderProfileStat("KD Ratio", formatNumber(payload.derived.kdRatio))}
            </div>
            <ul class="profile-rank-list">
                <li>Rank by Wins: ${payload.ranks.wins || "-"}</li>
                <li>Rank by Kills: ${payload.ranks.kills || "-"}</li>
                <li>Rank by Games: ${payload.ranks.games || "-"}</li>
            </ul>
        </section>
    `;
}

function renderProfileStat(label, value) {
    return `<div class="profile-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function filteredPlayers() {
    const players = [...(currentMode().players || [])];
    players.sort(comparePlayers(state.sort));
    if (!state.query) return players;
    return players.filter((player) => player.name.toLowerCase().includes(state.query));
}

function currentMode() {
    return state.data?.modes?.[state.mode] || { players: [] };
}

function comparePlayers(sort) {
    return (a, b) => {
        const primary = sortValue(b, sort) - sortValue(a, sort);
        if (primary !== 0) return primary;
        const secondary = b.stats.wins - a.stats.wins;
        if (secondary !== 0) return secondary;
        const tertiary = b.stats.kills - a.stats.kills;
        if (tertiary !== 0) return tertiary;
        return a.name.localeCompare(b.name);
    };
}

function sortValue(player, sort) {
    switch (sort) {
        case "kills":
            return player.stats.kills;
        case "games":
            return player.stats.games;
        case "wins":
        default:
            return player.stats.wins;
    }
}

function createPill(label, active, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    if (active) button.classList.add("active");
    button.addEventListener("click", onClick);
    return button;
}

function createPageButton(label, enabled, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "page-button";
    button.textContent = label;
    button.disabled = !enabled;
    if (enabled) button.addEventListener("click", onClick);
    return button;
}

function pageWindow(totalPages, currentPage, radius) {
    const start = Math.max(1, currentPage - radius);
    const end = Math.min(totalPages, currentPage + radius);
    const pages = [];
    for (let page = start; page <= end; page++) pages.push(page);
    return pages;
}

function average(items, getter) {
    if (items.length === 0) return 0;
    return items.reduce((sum, item) => sum + getter(item), 0) / items.length;
}

function best(items, getter) {
    if (items.length === 0) return 0;
    return items.reduce((max, item) => Math.max(max, getter(item)), 0);
}

function formatPercent(value) {
    return `${Math.round((value || 0) * 100)}%`;
}

function formatNumber(value) {
    return Number(value || 0).toFixed(2).replace(/\.00$/, "");
}

function formatDateTime(value) {
    try {
        return new Date(value).toLocaleString();
    } catch (error) {
        return value;
    }
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#39;");
}
