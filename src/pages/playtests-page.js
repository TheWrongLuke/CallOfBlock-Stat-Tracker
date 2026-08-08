import { syncDiscordProfile } from "../api/profile.js";
import { escapeHtml, formatDate, initializeSiteShell } from "../core/site-shell.js";

const PLAYTEST_COLUMNS =
    "id, title, description, main_slot_id, status, created_by, votes_frozen, archived_at, created_at, updated_at";
const SLOT_COLUMNS =
    "id, playtest_id, start_datetime, end_datetime, label, is_main, source, confirmed_at, confirmed_by, created_at";
const AVAILABILITY_COLUMNS =
    "id, playtest_id, slot_id, user_id, status, mode_preference, available_start_datetime, available_end_datetime, created_at, updated_at";
const SUBSCRIPTION_COLUMNS = "id, playtest_id, slot_id, user_id, notify_on_confirmation, created_at, updated_at";
const STATUS_OPTIONS = [
    { id: "available", label: "Available", score: 3 },
    { id: "maybe", label: "Maybe", score: 1 },
    { id: "unavailable", label: "Unavailable", score: 0 },
    { id: "preferred", label: "Preferred", score: 5 }
];
const STATUS_ORDER = ["available", "preferred", "maybe", "unavailable"];
const MODE_OPTIONS = ["Battle Royale", "Deathmatch", "Either"];
const ACTIVE_STATUSES = new Set(["available", "preferred", "maybe"]);
const STORAGE_KEY = "cob_playtest_page_state_v1";

export async function initializePlaytestsPage() {
    await whenReady();
    const shell = await initializeSiteShell();
    const state = createState(shell);
    restorePreferences(state);

    if (shell.session?.user && shell.client) {
        const profile = await syncDiscordProfile(shell.client);
        if (!profile.error) {
            state.profile = profile.data || null;
            shell.setProfile(state.profile);
        }
    }

    bindEvents(state);
    await loadPlaytests(state);
}

function createState(shell) {
    return {
        shell,
        profile: null,
        playtests: [],
        activeId: "",
        selectedDates: {},
        monthOffset: 0,
        modePreference: "Either",
        heatmapExpanded: false,
        loading: false,
        error: "",
        message: "",
        confirmation: null
    };
}

function bindEvents(state) {
    document.addEventListener("click", (event) => {
        const select = event.target.closest("[data-playtest-select]");
        if (select) {
            state.activeId = select.dataset.playtestSelect || "";
            state.monthOffset = 0;
            savePreferences(state);
            render(state);
            return;
        }
        const dateButton = event.target.closest("[data-calendar-date]");
        if (dateButton && !event.target.closest("[data-playtest-calendar-vote]")) {
            const playtest = activePlaytest(state);
            if (playtest) {
                state.selectedDates[playtest.id] = dateButton.dataset.calendarDate || "";
                savePreferences(state);
                render(state);
            }
            return;
        }
        const month = event.target.closest("[data-playtest-month]");
        if (month) {
            state.monthOffset = Number(month.dataset.playtestMonth) === 1 ? 1 : 0;
            savePreferences(state);
            render(state);
            return;
        }
        const vote = event.target.closest("[data-playtest-vote], [data-playtest-calendar-vote]");
        if (vote) {
            void saveVote(state, vote);
            return;
        }
        const more = event.target.closest("[data-heatmap-toggle]");
        if (more) {
            state.heatmapExpanded = !state.heatmapExpanded;
            render(state);
            return;
        }
        const reload = event.target.closest("[data-playtest-reload]");
        if (reload) {
            void loadPlaytests(state, true);
            return;
        }
        const login = event.target.closest("[data-auth-login]");
        if (login) {
            void state.shell.signIn();
            return;
        }
        const logout = event.target.closest("[data-auth-sign-out]");
        if (logout) {
            void state.shell.signOut().then(() => window.location.reload());
            return;
        }
        const adminAction = event.target.closest("[data-playtest-admin]");
        if (adminAction) {
            void updatePlaytest(state, adminAction.dataset.playtestAdmin || "");
            return;
        }
        const confirm = event.target.closest("[data-confirm-slot]");
        if (confirm) {
            openConfirmation(state, confirm.dataset.confirmSlot || "");
            return;
        }
        const unconfirm = event.target.closest("[data-unconfirm-slot]");
        if (unconfirm) {
            void unconfirmSlot(state, unconfirm.dataset.unconfirmSlot || "");
            return;
        }
        if (event.target.closest("[data-confirm-dialog-close]")) closeConfirmation(state);
    });
    document.addEventListener("change", (event) => {
        if (event.target.matches("input[name='playtest-mode']")) {
            state.modePreference = MODE_OPTIONS.includes(event.target.value) ? event.target.value : "Either";
            savePreferences(state);
            void syncModePreference(state);
            return;
        }
        if (event.target.matches("[data-notify-toggle]")) void toggleNotification(state, event.target);
    });
    document.addEventListener("submit", (event) => {
        if (event.target.id === "playtest-create-form") {
            event.preventDefault();
            void createPlaytest(state, event.target);
            return;
        }
        if (event.target.matches("[data-confirm-dialog-form]")) {
            event.preventDefault();
            void confirmSlot(state, event.target);
        }
    });
}

async function loadPlaytests(state, force = false) {
    if (!state.shell.client || state.loading) return;
    state.loading = true;
    state.error = "";
    if (force) state.message = "Refreshing calendar...";
    render(state);
    try {
        const playtestsResult = await state.shell.client
            .from("playtests")
            .select(PLAYTEST_COLUMNS)
            .is("archived_at", null)
            .order("created_at", { ascending: false });
        if (playtestsResult.error) throw playtestsResult.error;
        const ids = (playtestsResult.data || []).map((row) => row.id).filter(Boolean);
        let slots = [];
        let availability = [];
        let subscriptions = [];
        if (ids.length) {
            const [slotResult, availabilityResult] = await Promise.all([
                state.shell.client
                    .from("playtest_slots")
                    .select(SLOT_COLUMNS)
                    .in("playtest_id", ids)
                    .order("start_datetime", { ascending: true }),
                state.shell.client.from("availability").select(AVAILABILITY_COLUMNS).in("playtest_id", ids)
            ]);
            if (slotResult.error) throw slotResult.error;
            if (availabilityResult.error) throw availabilityResult.error;
            slots = slotResult.data || [];
            availability = availabilityResult.data || [];
            if (state.shell.session?.user) {
                const subscriptionResult = await state.shell.client
                    .from("playtest_notification_subscriptions")
                    .select(SUBSCRIPTION_COLUMNS)
                    .in("playtest_id", ids);
                if (subscriptionResult.error) throw subscriptionResult.error;
                subscriptions = subscriptionResult.data || [];
            }
        }
        const names = await loadVoterNames(state, availability);
        state.playtests = mapPlaytests(playtestsResult.data || [], slots, availability, subscriptions, names);
        if (!state.playtests.some((playtest) => playtest.id === state.activeId)) {
            state.activeId = state.playtests[0]?.id || "";
        }
        state.message = force ? "Calendar refreshed." : "";
    } catch (error) {
        console.error("Could not load playtests", error);
        state.playtests = [];
        state.error = playtestError(error);
    } finally {
        state.loading = false;
        savePreferences(state);
        render(state);
    }
}

async function loadVoterNames(state, rows) {
    const ids = [...new Set(rows.map((row) => row.user_id).filter(Boolean))];
    if (!ids.length) return new Map();
    const result = await state.shell.client.from("public_profiles").select("id, username, display_name").in("id", ids);
    return new Map(
        (result.error ? [] : result.data || []).map((profile) => [profile.id, profile.display_name || profile.username])
    );
}

function mapPlaytests(playtestRows, slotRows, availabilityRows, subscriptionRows, names) {
    const slots = groupBy(slotRows, "playtest_id");
    const availability = groupBy(availabilityRows, "playtest_id");
    const subscriptions = groupBy(subscriptionRows, "playtest_id");
    return playtestRows.map((row) => ({
        id: String(row.id),
        title: String(row.title || "Community Playtest"),
        description: String(row.description || ""),
        status: String(row.status || "voting"),
        frozen: Boolean(row.votes_frozen),
        mainSlotId: row.main_slot_id || "",
        slots: (slots.get(row.id) || []).map(mapSlot).sort((a, b) => dateValue(a.startAt) - dateValue(b.startAt)),
        votes: (availability.get(row.id) || []).map((vote) => mapVote(vote, names)),
        subscriptions: subscriptions.get(row.id) || []
    }));
}

function mapSlot(row) {
    return {
        id: String(row.id),
        startAt: String(row.start_datetime),
        endAt: String(row.end_datetime || row.start_datetime),
        label: String(row.label || (row.source === "community" ? "Community date" : "Featured date")),
        source: row.source === "community" ? "community" : "featured",
        isMain: Boolean(row.is_main),
        confirmedAt: row.confirmed_at || "",
        confirmedBy: row.confirmed_by || ""
    };
}

function mapVote(row, names) {
    return {
        slotId: String(row.slot_id),
        userId: String(row.user_id),
        username: names.get(row.user_id) || "Community player",
        status: String(row.status),
        modePreference: dbModeLabel(row.mode_preference),
        startAt: row.available_start_datetime || "",
        endAt: row.available_end_datetime || "",
        updatedAt: row.updated_at || row.created_at || ""
    };
}

function render(state) {
    toggleView("playtests-view", true);
    renderList(state);
    renderIdentity(state);
    renderPreferences(state);
    renderAdmin(state);
    renderBoard(state);
    renderConfirmation(state);
}

function renderList(state) {
    const host = document.getElementById("playtest-list");
    if (!host) return;
    if (!state.playtests.length) {
        host.innerHTML = `<section class="playtest-side-block"><p class="mode-empty">${escapeHtml(state.loading ? "Loading public playtests..." : state.error || "No active playtests.")}</p></section>`;
        return;
    }
    host.innerHTML = `<section class="playtest-side-block"><p class="panel-kicker">Featured Plans</p><div class="playtest-list">${state.playtests
        .map((playtest) => {
            const best = rankSummaries(summarize(playtest))[0];
            return `<button class="playtest-list-item ${playtest.id === state.activeId ? "active" : ""}" type="button" data-playtest-select="${escapeHtml(playtest.id)}" aria-pressed="${playtest.id === state.activeId}"><span>${escapeHtml(statusLabel(playtest.status))}</span><strong>${escapeHtml(playtest.title)}</strong><small>${best ? `${escapeHtml(formatSlotShort(best.slot))} - Score ${best.score}` : "No dates"}</small></button>`;
        })
        .join("")}</div></section>`;
}

function renderIdentity(state) {
    const host = document.getElementById("playtest-identity");
    if (!host) return;
    const user = state.shell.session?.user;
    const metadata = user?.user_metadata || {};
    const name =
        state.profile?.display_name || state.profile?.username || metadata.global_name || metadata.username || "You";
    const avatar = state.profile?.avatar_url || metadata.avatar_url || "";
    host.innerHTML = `<section class="playtest-side-block identity-block"><p class="panel-kicker">Discord Identity</p><div class="identity-row">${avatar ? `<img class="identity-avatar" src="${escapeHtml(avatar)}" alt="" referrerpolicy="no-referrer">` : `<span class="identity-avatar">${escapeHtml(initials(name))}</span>`}<div><strong>${escapeHtml(name)}</strong><small>${user ? (state.profile?.is_admin ? "Discord connected - Admin" : "Discord connected") : "Not connected"}</small></div></div><div class="identity-actions">${user ? '<button type="button" data-auth-sign-out>Sign out</button>' : '<button type="button" data-auth-login>Login with Discord</button>'}<a href="https://discord.gg/y8JRduKyZA" target="_blank" rel="noopener noreferrer">Open Discord</a></div>${state.message ? `<p class="identity-status">${escapeHtml(state.message)}</p>` : ""}</section>`;
}

function renderPreferences(state) {
    const host = document.getElementById("playtest-preferences");
    if (!host || !activePlaytest(state)) {
        if (host) host.innerHTML = "";
        return;
    }
    host.innerHTML = `<section class="playtest-side-block"><p class="panel-kicker">Session Preference</p><fieldset class="preference-field"><legend>Mode</legend>${MODE_OPTIONS.map((mode) => `<label><input type="radio" name="playtest-mode" value="${escapeHtml(mode)}" ${state.modePreference === mode ? "checked" : ""}><span>${escapeHtml(mode)}</span></label>`).join("")}</fieldset></section>`;
}

function renderAdmin(state) {
    const host = document.getElementById("playtest-admin");
    if (!host) return;
    const playtest = activePlaytest(state);
    if (!state.profile?.is_admin) {
        host.innerHTML = "";
        return;
    }
    host.innerHTML = `<section class="playtest-side-block admin-draft-block"><details><summary>Admin controls</summary><div class="admin-action-grid"><a class="button-link" href="/stats/#community-dates">Community calendar</a><button type="button" data-playtest-reload>Reload calendar</button><button type="button" data-playtest-admin="${playtest?.status === "closed" ? "reopen" : "close"}" ${playtest ? "" : "disabled"}>${playtest?.status === "closed" ? "Reopen" : "Close voting"}</button><button type="button" data-playtest-admin="${playtest?.frozen ? "unfreeze" : "freeze"}" ${playtest ? "" : "disabled"}>${playtest?.frozen ? "Unfreeze" : "Freeze votes"}</button></div><form class="playtest-create-form" id="playtest-create-form"><label><span>Title</span><input name="title" type="text" placeholder="Battle Royale Playtest" required></label><label><span>Description</span><textarea name="description" rows="3" placeholder="Focus for this test"></textarea></label><label><span>First featured date</span><input name="mainSlot" type="datetime-local" required></label><label><span>Other featured dates</span><textarea name="alternativeSlots" rows="4" placeholder="2026-09-17T20:00&#10;2026-09-19T20:00"></textarea></label><label><span>Status</span><select name="status"><option value="voting">Voting</option><option value="upcoming">Upcoming</option><option value="closed">Closed</option></select></label><button type="submit">Create playtest</button></form></details></section>`;
}

function renderBoard(state) {
    const host = document.getElementById("playtest-board");
    if (!host) return;
    const playtest = activePlaytest(state);
    if (!playtest) {
        host.innerHTML = `<section class="playtest-empty"><h3>No playtest selected</h3><p>${escapeHtml(state.loading ? "Loading the public playtest calendar..." : state.error || "No public playtest is available yet.")}</p></section>${renderEmptyCalendar()}`;
        return;
    }
    const summaries = summarize(playtest);
    const ranked = rankSummaries(summaries);
    const best = ranked[0] || null;
    const selected = selectedDate(state, playtest, summaries, best);
    const featured = summaries.filter((summary) => summary.slot.source === "featured");
    const confirmed = summaries
        .filter((summary) => summary.slot.confirmedAt && dateValue(summary.slot.endAt) >= Date.now())
        .sort((a, b) => dateValue(a.slot.startAt) - dateValue(b.slot.startAt))[0];
    host.innerHTML = `<section class="playtest-detail-head"><div><p class="panel-kicker">${escapeHtml(statusLabel(playtest.status))}</p><h3>${escapeHtml(playtest.title)}</h3><p>${escapeHtml(playtest.description || "Community playtest")}</p></div><div class="playtest-meta-strip"><span>${uniqueVoters(playtest)} voters</span><span>${featured.length} featured dates</span><span>${summaries.length - featured.length} community dates</span></div></section>${state.error ? `<div class="playtest-lock-note">${escapeHtml(state.error)}</div>` : ""}<section class="playtest-summary-grid">${confirmed ? renderNextEvent(confirmed) : ""}${best ? renderBestDate(best, ranked[1]) : ""}${best ? renderInterest(best) : ""}</section>${playtestLock(playtest) ? `<div class="playtest-lock-note">${escapeHtml(playtestLock(playtest))}</div>` : ""}<section class="featured-slot-section"><div class="featured-slot-head"><p class="panel-kicker">Featured Dates</p><span>Planned dates stay together here. Community dates remain in the calendar.</span></div><div class="playtest-slot-grid">${featured.map((summary) => renderSlot(state, playtest, summary)).join("")}</div></section><section class="calendar-vote-grid">${renderCalendar(state, playtest, summaries)}${renderSelectedDate(state, playtest, selected)}</section><section class="playtest-analytics-grid">${renderHeatmap(state, ranked)}${renderResults(best, ranked[1])}</section>`;
}

function renderNextEvent(summary) {
    return `<article class="main-date-card next-event-card"><div class="date-card-topline"><span class="main-date-label">Next event</span><span class="confirmation-badge confirmed">Confirmed</span></div><strong>${escapeHtml(weekday(summary.slot.startAt))}</strong><span>${escapeHtml(formatDate(summary.slot.startAt, { month: "long" }))}</span><time datetime="${escapeHtml(summary.slot.startAt)}">${escapeHtml(formatTimeRange(summary.slot))}</time><div class="main-date-counts"><span>${summary.availableTotal} available</span><span>${summary.counts.preferred} preferred</span></div></article>`;
}

function renderBestDate(best, second) {
    return `<article class="best-date-card"><div class="date-card-topline"><p class="panel-kicker">Best Date</p>${confirmationBadge(best.slot)}</div><strong>${escapeHtml(weekday(best.slot.startAt))}</strong><span>${escapeHtml(formatSlotShort(best.slot))}</span><div class="score-row"><div class="score-pill">Overlap ${best.rankScore}</div><span class="help-tip-wrap"><button class="help-tip-button" type="button" aria-label="How the Best Date score is calculated">?</button><span class="help-tip-popover" role="tooltip">Ranks the strongest shared time first. Preferred = 5, Available = 3, Maybe = 1, Unavailable = 0.</span></span></div>${renderBestTime(best)}<small>Date score ${best.score}</small>${second ? `<small>Second: ${escapeHtml(formatSlotShort(second.slot))}, overlap ${second.rankScore}</small>` : ""}</article>`;
}

function renderInterest(summary) {
    const counts = new Map();
    for (const vote of summary.activeVotes) counts.set(vote.modePreference, (counts.get(vote.modePreference) || 0) + 1);
    const entries = [...counts].sort((a, b) => b[1] - a[1]);
    const scale = Math.max(10, ...entries.map(([, count]) => count));
    return `<article class="preference-summary-card"><p class="panel-kicker">Session Interest</p><span class="interest-context">Best date - ${escapeHtml(formatSlotShort(summary.slot))}</span><strong>${summary.availableTotal} available</strong><div class="preference-bars">${entries.length ? entries.map(([label, count]) => `<div class="preference-bar-row"><span>${escapeHtml(label)}</span><div><i style="width:${Math.max(8, Math.round((count / scale) * 100))}%"></i></div><strong>${count}</strong></div>`).join("") : '<span class="muted-line">No mode votes yet</span>'}</div></article>`;
}

function renderSlot(state, playtest, summary) {
    return `<article class="playtest-slot-card featured-slot"><div class="slot-card-head"><div><div class="date-card-topline"><span>${escapeHtml(summary.slot.label)}</span>${confirmationBadge(summary.slot)}</div><strong>${escapeHtml(weekday(summary.slot.startAt))}</strong><time datetime="${escapeHtml(summary.slot.startAt)}">${escapeHtml(formatSlotShort(summary.slot))}</time></div></div><div class="vote-count-grid">${STATUS_ORDER.map((status) => `<span class="count-${status}"><strong>${status === "available" ? summary.availableTotal : summary.counts[status]}</strong>${escapeHtml(statusLabel(status))}</span>`).join("")}</div>${renderBestTime(summary)}${renderVoteTimes(state, playtest, summary.slot)}<div class="vote-row">${renderVoteButtons(state, playtest, summary.slot)}</div></article>`;
}

function renderCalendar(state, playtest, summaries) {
    const base = calendarBase(playtest);
    const month = new Date(base.getFullYear(), base.getMonth() + state.monthOffset, 1, 12);
    const firstBlank = (month.getDay() + 6) % 7;
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const selected = selectedDateKey(state, playtest, summaries);
    const byDate = new Map(summaries.map((summary) => [localDateKey(summary.slot.startAt), summary]));
    const maxScore = Math.max(1, ...summaries.map((summary) => summary.score));
    const cells = Array.from({ length: firstBlank }, () => '<span class="calendar-cell empty"></span>');
    for (let day = 1; day <= days; day += 1) {
        const date = new Date(month.getFullYear(), month.getMonth(), day, 12);
        const key = localDateKey(date);
        const summary = byDate.get(key);
        const ratio = summary ? summary.score / maxScore : 0;
        const level = ratio >= 0.74 ? "high" : ratio >= 0.44 ? "medium" : summary ? "low" : "none";
        cells.push(
            `<button class="calendar-cell level-${level} ${summary?.slot.source === "featured" ? "calendar-featured" : ""} ${summary?.slot.confirmedAt ? "calendar-confirmed" : ""} ${selected === key ? "calendar-selected" : ""}" type="button" data-calendar-date="${key}" aria-pressed="${selected === key}"><strong>${day}</strong>${summary ? `<small>${summary.slot.confirmedAt ? "OK" : summary.availableTotal}</small>` : ""}</button>`
        );
    }
    return `<article class="calendar-card"><div class="calendar-head"><div><p class="panel-kicker">Calendar</p><h4>${escapeHtml(monthLabel(month))}</h4></div><div class="calendar-nav"><button type="button" data-playtest-month="0" class="${state.monthOffset === 0 ? "active" : ""}">${escapeHtml(monthLabel(base).split(" ")[0])}</button><button type="button" data-playtest-month="1" class="${state.monthOffset === 1 ? "active" : ""}">Next</button></div></div><div class="calendar-grid">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => `<span class="calendar-weekday">${day}</span>`).join("")}${cells.join("")}</div></article>`;
}

function renderSelectedDate(state, playtest, selected) {
    const summary = selected.summary;
    const key = selected.key;
    const slot = summary?.slot || null;
    const ownVote = slot ? findOwnVote(state, playtest, slot.id) : null;
    const range = ownVote
        ? { start: localTime(ownVote.startAt), end: localTime(ownVote.endAt) }
        : slot
          ? { start: localTime(slot.startAt), end: localTime(slot.endAt) }
          : { start: "20:00", end: "22:00" };
    const canVote = Boolean(
        state.shell.session?.user && !state.profile?.banned_from_voting && !playtestLock(playtest) && !isPastKey(key)
    );
    return `<article class="main-date-card selected-date-card"><div class="date-card-topline"><span class="main-date-label">${slot?.source === "featured" ? "Featured date" : slot ? "Community date" : "Selected date"}</span>${confirmationBadge(slot)}</div><strong>${escapeHtml(weekday(key))}</strong><span>${escapeHtml(formatDate(`${key}T12:00:00`, { month: "long" }))}</span>${slot ? `<time datetime="${escapeHtml(slot.startAt)}">${escapeHtml(formatTimeRange(slot))}</time><div class="main-date-counts"><span>${summary.availableTotal} available</span><span>${summary.counts.preferred} preferred</span></div>${renderBestTime(summary)}` : '<p class="selected-date-note">No one has started this date yet. Voting here creates a community date.</p>'}<div class="vote-time-fields"><span>Your time</span><label><small>Start</small><input type="text" value="${range.start}" maxlength="5" inputmode="numeric" data-vote-start ${canVote ? "" : "disabled"}></label><label><small>End</small><input type="text" value="${range.end}" maxlength="5" inputmode="numeric" data-vote-end ${canVote ? "" : "disabled"}></label></div><small class="selected-date-note">Times use ${escapeHtml(Intl.DateTimeFormat().resolvedOptions().timeZone || "your local timezone")}.</small>${renderNotification(state, playtest, slot, ownVote)}${state.profile?.is_admin && slot ? `<div class="date-admin-actions"><button type="button" data-confirm-slot="${escapeHtml(slot.id)}" ${slot.confirmedAt ? "disabled" : ""}>Confirm date</button><button type="button" data-unconfirm-slot="${escapeHtml(slot.id)}" ${slot.confirmedAt ? "" : "disabled"}>Unconfirm</button></div>` : ""}<div class="vote-row compact">${STATUS_OPTIONS.map((option) => `<button class="vote-button vote-${option.id} ${ownVote?.status === option.id ? "active" : ""}" type="button" ${slot ? `data-playtest-vote="${option.id}" data-slot-id="${escapeHtml(slot.id)}"` : `data-playtest-calendar-vote="${option.id}" data-calendar-date="${key}"`} aria-pressed="${ownVote?.status === option.id}" ${canVote ? "" : "disabled"}>${option.label}</button>`).join("")}</div></article>`;
}

function renderNotification(state, playtest, slot, ownVote) {
    const loggedIn = Boolean(state.shell.session?.user);
    const subscribed =
        slot &&
        playtest.subscriptions.some(
            (row) =>
                row.slot_id === slot.id &&
                row.user_id === state.shell.session?.user?.id &&
                row.notify_on_confirmation !== false
        );
    const disabled = !loggedIn || !slot || !ownVote;
    const helper = !loggedIn
        ? "Login with Discord required for notification to be toggled."
        : !ownVote
          ? "Set availability first to enable confirmation notifications."
          : "Discord confirmation notification";
    return `<div class="notify-row"><label class="notify-toggle ${subscribed ? "active" : ""}"><input type="checkbox" data-notify-toggle="${escapeHtml(slot?.id || "")}" ${subscribed ? "checked" : ""} ${disabled ? "disabled" : ""}><span>Notify me on confirmation</span></label><small class="${!loggedIn ? "notify-warning" : ""}">${escapeHtml(helper)}</small></div>`;
}

function renderVoteTimes(state, playtest, slot) {
    const own = findOwnVote(state, playtest, slot.id);
    const start = own ? localTime(own.startAt) : localTime(slot.startAt);
    const end = own ? localTime(own.endAt) : localTime(slot.endAt);
    return `<div class="vote-time-fields" data-vote-time-slot="${escapeHtml(slot.id)}"><span>Your time</span><label><small>Start</small><input type="text" value="${start}" data-vote-start></label><label><small>End</small><input type="text" value="${end}" data-vote-end></label></div>`;
}

function renderVoteButtons(state, playtest, slot) {
    const own = findOwnVote(state, playtest, slot.id);
    const disabled =
        !state.shell.session?.user || Boolean(playtestLock(playtest)) || isPastKey(localDateKey(slot.startAt));
    return STATUS_OPTIONS.map(
        (option) =>
            `<button class="vote-button vote-${option.id} ${own?.status === option.id ? "active" : ""}" type="button" data-playtest-vote="${option.id}" data-slot-id="${escapeHtml(slot.id)}" aria-pressed="${own?.status === option.id}" ${disabled ? "disabled" : ""}>${option.label}</button>`
    ).join("");
}

function renderHeatmap(state, ranked) {
    const visible = state.heatmapExpanded ? ranked : ranked.slice(0, 5);
    const max = Math.max(1, ...ranked.map((summary) => summary.rankScore));
    return `<article class="heatmap-card"><p class="panel-kicker">Heatmap</p><h4>Best availability</h4><div class="heatmap-list">${visible.map((summary) => `<div class="heatmap-row"><div><strong>${escapeHtml(weekday(summary.slot.startAt))}</strong><span>${escapeHtml(summary.bestTime ? formatOverlap(summary.bestTime) : formatTimeRange(summary.slot))} - ${summary.total} votes</span></div><div class="heatmap-bar"><i style="width:${Math.max(6, Math.round((summary.rankScore / max) * 100))}%"></i></div><small>${summary.rankScore}</small></div>`).join("")}</div>${ranked.length > 5 ? `<button class="heatmap-toggle" type="button" data-heatmap-toggle>${state.heatmapExpanded ? "LESS" : "MORE"}</button>` : ""}</article>`;
}

function renderResults(best, second) {
    if (!best) return "";
    return `<article class="results-card"><p class="panel-kicker">Best Date Detail</p><h4>${escapeHtml(weekday(best.slot.startAt))}</h4><dl><div><dt>Pool time</dt><dd>${escapeHtml(formatSlotShort(best.slot))}</dd></div><div><dt>Best time</dt><dd>${escapeHtml(best.bestTime ? formatOverlap(best.bestTime) : "No shared time yet")}</dd></div><div><dt>Overlap</dt><dd>${best.rankScore}</dd></div><div><dt>Participants</dt><dd>${best.availableTotal}</dd></div>${second ? `<div><dt>Second</dt><dd>${escapeHtml(formatSlotShort(second.slot))}</dd></div>` : ""}</dl></article>`;
}

function renderBestTime(summary) {
    return summary.bestTime
        ? `<div class="best-time-line"><span>Best time</span><strong>${escapeHtml(formatOverlap(summary.bestTime))}</strong><small>${summary.bestTime.people} ${summary.bestTime.people === 1 ? "person" : "people"}</small></div>`
        : '<p class="best-time-line muted-line">No shared time yet</p>';
}

function renderEmptyCalendar() {
    return `<section class="calendar-vote-grid public-tools-empty"><article class="calendar-card"><div class="calendar-head"><div><p class="panel-kicker">Public Calendar</p><h4>${escapeHtml(monthLabel(new Date()))}</h4></div></div><div class="calendar-grid"><span class="calendar-empty-message">Community date voting opens after an administrator creates a public playtest.</span></div></article><article class="main-date-card selected-date-card"><span class="main-date-label">Community tools</span><strong>No public event yet</strong></article></section>`;
}

function confirmationBadge(slot) {
    return `<span class="confirmation-help-row"><span class="confirmation-badge ${slot?.confirmedAt ? "confirmed" : "unconfirmed"}">${slot?.confirmedAt ? "Confirmed" : "Unconfirmed"}</span>${slot?.confirmedAt ? "" : '<span class="help-tip-wrap"><button class="help-tip-button" type="button" aria-label="What unconfirmed means">?</button><span class="help-tip-popover" role="tooltip">The admin will confirm this event date if it is possible to run.</span></span>'}</span>`;
}

async function saveVote(state, button) {
    const playtest = activePlaytest(state);
    const userId = state.shell.session?.user?.id;
    if (!playtest || !userId || state.profile?.banned_from_voting) return;
    let slot = button.dataset.slotId ? playtest.slots.find((entry) => entry.id === button.dataset.slotId) : null;
    const dateKey = button.dataset.calendarDate || (slot ? localDateKey(slot.startAt) : "");
    const range = readTimeRange(button.closest("article") || document);
    if (!slot) slot = await createCommunitySlot(state, playtest, dateKey, range);
    if (!slot) return;
    try {
        const result = await state.shell.client.from("availability").upsert(
            {
                playtest_id: playtest.id,
                slot_id: slot.id,
                user_id: userId,
                status: button.dataset.playtestVote || button.dataset.playtestCalendarVote,
                mode_preference: dbModeValue(state.modePreference),
                available_start_datetime: localIso(localDateKey(slot.startAt), range.start),
                available_end_datetime: localIso(localDateKey(slot.startAt), range.end)
            },
            { onConflict: "playtest_id,slot_id,user_id" }
        );
        if (result.error) throw result.error;
        await loadPlaytests(state);
    } catch (error) {
        state.error = "Could not save your availability. Check that this date is still open.";
        console.error("Could not save playtest vote", error);
        render(state);
    }
}

async function createCommunitySlot(state, playtest, key, range) {
    if (!key || isPastKey(key)) return null;
    const existing = playtest.slots.find((slot) => localDateKey(slot.startAt) === key);
    if (existing) return existing;
    const result = await state.shell.client
        .from("playtest_slots")
        .insert({
            playtest_id: playtest.id,
            start_datetime: localIso(key, range.start),
            end_datetime: localIso(key, range.end),
            label: "Community date",
            is_main: false,
            source: "community"
        })
        .select(SLOT_COLUMNS)
        .single();
    if (result.error) {
        state.error = "Could not create that community date.";
        render(state);
        return null;
    }
    return mapSlot(result.data);
}

async function toggleNotification(state, input) {
    const playtest = activePlaytest(state);
    const userId = state.shell.session?.user?.id;
    const slotId = input.dataset.notifyToggle;
    if (!playtest || !slotId || !userId || !findOwnVote(state, playtest, slotId)) return;
    const existing = playtest.subscriptions.some((row) => row.slot_id === slotId && row.user_id === userId);
    const query = existing
        ? state.shell.client
              .from("playtest_notification_subscriptions")
              .delete()
              .eq("playtest_id", playtest.id)
              .eq("slot_id", slotId)
              .eq("user_id", userId)
        : state.shell.client
              .from("playtest_notification_subscriptions")
              .upsert(
                  { playtest_id: playtest.id, slot_id: slotId, user_id: userId, notify_on_confirmation: true },
                  { onConflict: "playtest_id,slot_id,user_id" }
              );
    const result = await query;
    if (result.error) state.error = "Could not update the notification toggle.";
    await loadPlaytests(state);
}

async function syncModePreference(state) {
    const playtest = activePlaytest(state);
    const userId = state.shell.session?.user?.id;
    if (!playtest || !userId) return;
    const result = await state.shell.client
        .from("availability")
        .update({ mode_preference: dbModeValue(state.modePreference) })
        .eq("playtest_id", playtest.id)
        .eq("user_id", userId);
    if (!result.error) await loadPlaytests(state);
}

async function createPlaytest(state, form) {
    if (!state.profile?.is_admin || !state.shell.client) return;
    const values = new FormData(form);
    const dates = [values.get("mainSlot"), ...String(values.get("alternativeSlots") || "").split(/\r?\n/)]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .map((value) => new Date(value))
        .filter((date) => Number.isFinite(date.getTime()));
    if (!dates.length) return;
    const playtest = await state.shell.client
        .from("playtests")
        .insert({
            title: String(values.get("title") || "Community Playtest").trim(),
            description: String(values.get("description") || "").trim(),
            status: String(values.get("status") || "voting"),
            created_by: state.shell.session.user.id
        })
        .select(PLAYTEST_COLUMNS)
        .single();
    if (playtest.error) {
        state.error = "Could not create the public event.";
        render(state);
        return;
    }
    const slots = await state.shell.client
        .from("playtest_slots")
        .insert(
            dates.map((date, index) => ({
                playtest_id: playtest.data.id,
                start_datetime: date.toISOString(),
                end_datetime: new Date(date.getTime() + 2 * 3_600_000).toISOString(),
                label: index ? `Featured date ${index + 1}` : "Featured date",
                is_main: index === 0,
                source: "featured"
            }))
        )
        .select(SLOT_COLUMNS);
    if (slots.error) {
        state.error = "The event was created, but its featured dates could not be saved.";
    } else if (slots.data?.[0]?.id) {
        await state.shell.client
            .from("playtests")
            .update({ main_slot_id: slots.data[0].id })
            .eq("id", playtest.data.id);
    }
    state.activeId = playtest.data.id;
    form.reset();
    await loadPlaytests(state);
}

async function updatePlaytest(state, action) {
    const playtest = activePlaytest(state);
    if (!state.profile?.is_admin || !playtest) return;
    const patch =
        action === "close"
            ? { status: "closed" }
            : action === "reopen"
              ? { status: "voting" }
              : action === "freeze"
                ? { votes_frozen: true }
                : action === "unfreeze"
                  ? { votes_frozen: false }
                  : null;
    if (!patch) return;
    const result = await state.shell.client.from("playtests").update(patch).eq("id", playtest.id);
    if (result.error) state.error = "Could not update the event.";
    await loadPlaytests(state);
}

function openConfirmation(state, slotId) {
    const playtest = activePlaytest(state);
    const summary = summarize(playtest).find((entry) => entry.slot.id === slotId);
    if (!state.profile?.is_admin || !summary) return;
    const range = summary.bestTime
        ? { start: minutesToTime(summary.bestTime.start), end: minutesToTime(summary.bestTime.end) }
        : { start: localTime(summary.slot.startAt), end: localTime(summary.slot.endAt) };
    state.confirmation = { slotId, ...range };
    renderConfirmation(state);
}

function closeConfirmation(state) {
    state.confirmation = null;
    renderConfirmation(state);
}

function renderConfirmation(state) {
    let host = document.getElementById("playtest-confirmation-host");
    if (!host) {
        host = document.createElement("div");
        host.id = "playtest-confirmation-host";
        document.body.append(host);
    }
    if (!state.confirmation) {
        host.innerHTML = "";
        return;
    }
    const slot = activePlaytest(state)?.slots.find((entry) => entry.id === state.confirmation.slotId);
    if (!slot) return closeConfirmation(state);
    host.innerHTML = `<div class="playtest-modal-backdrop"><form class="playtest-confirm-dialog" data-confirm-dialog-form><div class="date-card-topline"><p class="panel-kicker">Confirm Event</p><button type="button" class="modal-icon-button" data-confirm-dialog-close aria-label="Close confirmation dialog">x</button></div><h3>${escapeHtml(weekday(slot.startAt))}</h3><p>${escapeHtml(formatDate(slot.startAt, { month: "long" }))}</p><div class="community-time-fields confirm-time-fields"><label><span>Start</span><input name="confirm-start" value="${state.confirmation.start}" required></label><label><span>End</span><input name="confirm-end" value="${state.confirmation.end}" required></label></div><small class="selected-date-note">Times use ${escapeHtml(Intl.DateTimeFormat().resolvedOptions().timeZone || "your local timezone")}.</small><div class="date-admin-actions modal-actions"><button type="button" data-confirm-dialog-close>Cancel</button><button type="submit">Confirm event</button></div></form></div>`;
}

async function confirmSlot(state, form) {
    const playtest = activePlaytest(state);
    const slot = playtest?.slots.find((entry) => entry.id === state.confirmation?.slotId);
    if (!state.profile?.is_admin || !slot) return;
    const range = normalizeRange(
        form.elements.namedItem("confirm-start")?.value,
        form.elements.namedItem("confirm-end")?.value
    );
    const key = localDateKey(slot.startAt);
    await state.shell.client
        .from("playtest_slots")
        .update({ confirmed_at: null, confirmed_by: null })
        .eq("playtest_id", playtest.id)
        .not("confirmed_at", "is", null);
    const result = await state.shell.client
        .from("playtest_slots")
        .update({
            confirmed_at: new Date().toISOString(),
            confirmed_by: state.shell.session.user.id,
            start_datetime: localIso(key, range.start),
            end_datetime: localIso(key, range.end)
        })
        .eq("id", slot.id)
        .eq("playtest_id", playtest.id);
    if (result.error) state.error = "Could not confirm that date.";
    closeConfirmation(state);
    await loadPlaytests(state);
}

async function unconfirmSlot(state, slotId) {
    const playtest = activePlaytest(state);
    if (!state.profile?.is_admin || !playtest) return;
    const result = await state.shell.client
        .from("playtest_slots")
        .update({ confirmed_at: null, confirmed_by: null })
        .eq("id", slotId)
        .eq("playtest_id", playtest.id);
    if (result.error) state.error = "Could not unconfirm that date.";
    await loadPlaytests(state);
}

function summarize(playtest) {
    return (playtest?.slots || []).map((slot) => {
        const votes = playtest.votes.filter((vote) => vote.slotId === slot.id);
        const counts = Object.fromEntries(
            STATUS_OPTIONS.map((option) => [option.id, votes.filter((vote) => vote.status === option.id).length])
        );
        const activeVotes = votes.filter((vote) => ACTIVE_STATUSES.has(vote.status));
        const bestTime = bestOverlap(activeVotes);
        return {
            slot,
            votes,
            activeVotes,
            counts,
            total: votes.length,
            availableTotal: activeVotes.length,
            score: votes.reduce((sum, vote) => sum + statusScore(vote.status), 0),
            bestTime,
            rankScore: bestTime?.score || 0
        };
    });
}

function rankSummaries(summaries) {
    return [...summaries].sort(
        (a, b) =>
            b.rankScore - a.rankScore || b.score - a.score || dateValue(a.slot.startAt) - dateValue(b.slot.startAt)
    );
}

function bestOverlap(votes) {
    const intervals = votes
        .map((vote) => ({
            start: timeMinutes(vote.startAt),
            end: timeMinutes(vote.endAt),
            weight: statusScore(vote.status)
        }))
        .filter((entry) => entry.end > entry.start);
    let best = null;
    for (let minute = 0; minute < 24 * 60; minute += 15) {
        const active = intervals.filter((entry) => entry.start <= minute && entry.end >= minute + 15);
        const score = active.reduce((sum, entry) => sum + entry.weight, 0);
        if (!active.length) continue;
        if (!best || active.length > best.people || (active.length === best.people && score > best.score)) {
            best = { start: minute, end: minute + 15, people: active.length, score };
        } else if (best.people === active.length && best.score === score && best.end === minute) {
            best.end = minute + 15;
        }
    }
    return best;
}

function selectedDate(state, playtest, summaries, fallback) {
    const key = selectedDateKey(state, playtest, summaries, fallback);
    return { key, summary: summaries.find((summary) => localDateKey(summary.slot.startAt) === key) || null };
}

function selectedDateKey(state, playtest, summaries, fallback = null) {
    return state.selectedDates[playtest.id] || localDateKey((fallback || summaries[0])?.slot?.startAt || new Date());
}

function activePlaytest(state) {
    return state.playtests.find((playtest) => playtest.id === state.activeId) || state.playtests[0] || null;
}

function findOwnVote(state, playtest, slotId) {
    return (
        playtest.votes.find((vote) => vote.slotId === slotId && vote.userId === state.shell.session?.user?.id) || null
    );
}

function uniqueVoters(playtest) {
    return new Set(playtest.votes.map((vote) => vote.userId)).size;
}

function playtestLock(playtest) {
    if (["closed", "finished"].includes(playtest.status)) return "Voting is closed for this event.";
    if (playtest.frozen) return "Voting is temporarily frozen by an administrator.";
    return "";
}

function calendarBase(playtest) {
    const future = playtest.slots.find((slot) => dateValue(slot.endAt) >= Date.now());
    const date = future ? new Date(future.startAt) : new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

function readTimeRange(root) {
    return normalizeRange(root.querySelector("[data-vote-start]")?.value, root.querySelector("[data-vote-end]")?.value);
}

function normalizeRange(start, end) {
    const clean = (value, fallback) =>
        /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value || "")) ? String(value) : fallback;
    const startValue = clean(start, "20:00");
    let endValue = clean(end, "22:00");
    if (clockMinutes(endValue) <= clockMinutes(startValue))
        endValue = minutesToTime(Math.min(1439, clockMinutes(startValue) + 120));
    return { start: startValue, end: endValue };
}

function localIso(key, time) {
    return new Date(`${key}T${time}:00`).toISOString();
}

function localDateKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
}

function localTime(value) {
    const date = new Date(value);
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function timeMinutes(value) {
    return clockMinutes(localTime(value));
}

function clockMinutes(value) {
    const [hours, minutes] = String(value || "0:0")
        .split(":")
        .map(Number);
    return hours * 60 + minutes;
}

function minutesToTime(value) {
    return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function formatOverlap(overlap) {
    return `${minutesToTime(overlap.start)} - ${minutesToTime(overlap.end)}`;
}

function formatTimeRange(slot) {
    return `${new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(slot.startAt))} - ${new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(slot.endAt))}`;
}

function formatSlotShort(slot) {
    return `${formatDate(slot.startAt)} - ${formatTimeRange(slot)}`;
}

function weekday(value) {
    return new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(new Date(value));
}

function monthLabel(value) {
    return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(new Date(value));
}

function isPastKey(key) {
    return new Date(`${key}T23:59:59`).getTime() < Date.now();
}

function dateValue(value) {
    const result = new Date(value).getTime();
    return Number.isFinite(result) ? result : 0;
}

function statusScore(status) {
    return STATUS_OPTIONS.find((option) => option.id === status)?.score || 0;
}

function statusLabel(value) {
    if (value === "voting") return "Voting";
    if (value === "upcoming") return "Upcoming";
    if (value === "closed") return "Closed";
    if (value === "finished") return "Finished";
    return STATUS_OPTIONS.find((option) => option.id === value)?.label || String(value || "");
}

function dbModeValue(value) {
    return value === "Battle Royale" ? "battle_royale" : value === "Deathmatch" ? "deathmatch" : "either";
}

function dbModeLabel(value) {
    return value === "battle_royale" ? "Battle Royale" : value === "deathmatch" ? "Deathmatch" : "Either";
}

function groupBy(rows, key) {
    const groups = new Map();
    for (const row of rows) {
        if (!groups.has(row[key])) groups.set(row[key], []);
        groups.get(row[key]).push(row);
    }
    return groups;
}

function playtestError(error) {
    const message = String(error?.message || error || "");
    return /playtests|schema cache/i.test(message)
        ? "The public playtest calendar is not configured in Supabase."
        : "Could not load the public playtest calendar.";
}

function initials(value) {
    return String(value || "You")
        .slice(0, 3)
        .toUpperCase();
}

function restorePreferences(state) {
    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        state.activeId = String(stored.activeId || "");
        state.selectedDates =
            stored.selectedDates && typeof stored.selectedDates === "object" ? stored.selectedDates : {};
        state.monthOffset = stored.monthOffset === 1 ? 1 : 0;
        state.modePreference = MODE_OPTIONS.includes(stored.modePreference) ? stored.modePreference : "Either";
    } catch (_error) {
        // Invalid local preferences are ignored.
    }
}

function savePreferences(state) {
    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
            activeId: state.activeId,
            selectedDates: state.selectedDates,
            monthOffset: state.monthOffset,
            modePreference: state.modePreference
        })
    );
}

function toggleView(id, visible) {
    const view = document.getElementById(id);
    if (!view) return;
    view.hidden = !visible;
    view.classList.toggle("hidden", !visible);
}

function whenReady() {
    if (document.readyState !== "loading") return Promise.resolve();
    return new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
}
