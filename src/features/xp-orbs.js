import { accountProgress } from "../core/account-view.js";

let active = null;

export function xpOrbAmounts(reward, step = 100) {
    const total = Math.max(0, Math.floor(Number(reward) || 0));
    const unit = step === 50 ? 50 : 100;
    if (!Number.isFinite(total) || !total) return [];
    // Bound DOM work for unusually large rewards while preserving the exact total.
    const count = Math.min(80, Math.ceil(total / unit));
    return Array.from({ length: count }, (_, index) => (index === count - 1 ? total - unit * index : unit));
}

export function captureXpOrigin(element) {
    const rect = element?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
}

export function advanceXpOrb(body, target, seconds, attraction = 10) {
    const dt = Math.max(0, Math.min(0.05, seconds));
    const spring = Math.max(10, Math.min(24, Number(attraction) || 10));
    const decay = Math.exp(-spring * dt);
    for (const axis of ["x", "y"]) {
        const velocity = axis === "x" ? "vx" : "vy";
        const offset = body[axis] - target[axis];
        const impulse = body[velocity] + spring * offset;
        body[axis] = target[axis] + (offset + impulse * dt) * decay;
        body[velocity] = (body[velocity] - spring * impulse * dt) * decay;
    }
}

function accountMeters(accountId) {
    return [...document.querySelectorAll(".account-xp-progress[data-xp-total]")].filter(
        (element) => element.dataset.xpAccount === accountId
    );
}

function visibleMeters(accountId) {
    return accountMeters(accountId)
        .filter((element) => {
            const meter = element.querySelector(".account-xp-meter");
            if (!meter) return false;
            const rect = meter.getBoundingClientRect();
            let left = 0,
                top = 0,
                right = innerWidth,
                bottom = innerHeight;
            // Drawer scrolling can clip a bar even while its parent remains partly visible.
            for (let parent = meter.parentElement; parent; parent = parent.parentElement) {
                const style = getComputedStyle(parent);
                const bounds = parent.getBoundingClientRect();
                if (/auto|scroll|hidden|clip/.test(style.overflowX)) {
                    left = Math.max(left, bounds.left);
                    right = Math.min(right, bounds.right);
                }
                if (/auto|scroll|hidden|clip/.test(style.overflowY)) {
                    top = Math.max(top, bounds.top);
                    bottom = Math.min(bottom, bounds.bottom);
                }
            }
            return (
                rect.width > 0 &&
                rect.height > 0 &&
                rect.left >= left &&
                rect.right <= right &&
                rect.top >= top &&
                rect.bottom <= bottom
            );
        })
        .sort((a, b) => Number(Boolean(b.closest(".profile-drawer"))) - Number(Boolean(a.closest(".profile-drawer"))));
}

function paintXp(total, accountId) {
    const progress = accountProgress(total);
    const format = (value) => Math.round(value).toLocaleString();
    for (const element of accountMeters(accountId)) {
        element.querySelector(".account-xp-meter").value = progress.currentLevelXp;
        element.querySelector(".account-level-pill strong").textContent = `LVL ${progress.level}`;
        element.querySelector(".account-level-pill span").textContent = `${format(progress.storedXp)} XP total`;
        element.querySelector("small").textContent = progress.maximum
            ? "Maximum level"
            : `${format(progress.currentLevelXp)} / 10,000 XP · ${format(progress.xpRemaining)} to level ${progress.level + 1}`;
    }
}

export function cancelXpOrbs() {
    active?.cancel();
}

export function animateXpReward({ origin, before, after, step = 100, accountId = "" } = {}) {
    cancelXpOrbs();
    const start = Math.max(0, Number(before) || 0);
    const end = Math.max(0, Number(after) || 0);
    const amounts = xpOrbAmounts(end - start, step);
    const meter = visibleMeters(accountId)[0]?.querySelector(".account-xp-meter");
    if (
        !origin ||
        !meter ||
        !amounts.length ||
        !globalThis.requestAnimationFrame ||
        matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
        paintXp(end, accountId);
        return Promise.resolve();
    }
    const layer = document.createElement("div");
    layer.className = "xp-orb-layer";
    layer.setAttribute("aria-hidden", "true");
    document.body.append(layer);
    let completed = false,
        arrived = 0,
        frame = 0,
        visualXp = start;
    let resolve;
    const result = new Promise((done) => {
        resolve = done;
    });
    const finish = () => {
        if (completed) return;
        completed = true;
        cancelAnimationFrame(frame);
        layer.remove();
        paintXp(end, accountId);
        if (active?.cancel === finish) active = null;
        document.removeEventListener("visibilitychange", hidden);
        resolve();
    };
    const hidden = () => {
        if (document.hidden) finish();
    };
    active = { cancel: finish };
    document.addEventListener("visibilitychange", hidden);
    paintXp(start, accountId);
    const began = performance.now();
    const xpPerSecond = Math.max(600, (end - start) / 2);
    let previous = began;
    const journeys = amounts.map((amount, index) => {
        const orb = document.createElement("span");
        orb.className = "xp-reward-orb";
        orb.style.left = `${origin.x}px`;
        orb.style.top = `${origin.y}px`;
        layer.append(orb);
        const angle = Math.random() * Math.PI * 2;
        const radius = 8 + Math.random() * 44;
        return {
            orb,
            amount,
            burstX: Math.cos(angle) * radius,
            burstY: Math.sin(angle) * radius,
            flightAt: 600 + index * Math.min(35, 600 / amounts.length),
            body: null,
            done: false
        };
    });
    const tick = (now) => {
        if (completed) return;
        const liveMeter = visibleMeters(accountId)[0]?.querySelector(".account-xp-meter");
        if (!liveMeter) return finish();
        const elapsed = now - began;
        const dt = (now - previous) / 1000;
        const targetXp = Math.min(end, start + arrived);
        // Arrivals add to a pending fill; additional arrivals do not restart or accelerate it.
        visualXp += Math.min(targetXp - visualXp, xpPerSecond * Math.max(0, Math.min(0.05, dt)));
        previous = now;
        paintXp(visualXp, accountId);
        const rect = liveMeter.getBoundingClientRect();
        const anchor = { x: rect.left + (rect.width * liveMeter.value) / liveMeter.max, y: rect.top + rect.height / 2 };
        for (const journey of journeys) {
            if (journey.done) continue;
            let x = origin.x + journey.burstX,
                y = origin.y + journey.burstY,
                scale = 1;
            if (elapsed < 300) {
                const burst = 1 - Math.pow(1 - elapsed / 300, 3);
                x = origin.x + journey.burstX * burst;
                y = origin.y + journey.burstY * burst;
                scale = 0.4 + 0.6 * burst;
            } else if (elapsed >= journey.flightAt) {
                // Retarget attraction without moving the orb when the bar itself moves.
                journey.body ||= { x, y, vx: 0, vy: 0 };
                const attraction = 10 + (elapsed - journey.flightAt) / 100;
                advanceXpOrb(journey.body, anchor, dt, attraction);
                x = journey.body.x;
                y = journey.body.y;
                const distance = Math.hypot(x - anchor.x, y - anchor.y);
                scale = 0.55 + 0.45 * Math.min(1, distance / 80);
                if (distance < 4 && elapsed - journey.flightAt > 120) {
                    journey.done = true;
                    arrived += journey.amount;
                    journey.orb.remove();
                    continue;
                }
            }
            journey.orb.style.transform = `translate(calc(-50% + ${x - origin.x}px), calc(-50% + ${y - origin.y}px)) scale(${scale})`;
        }
        if (elapsed > 8000 || (journeys.every((journey) => journey.done) && Math.abs(end - visualXp) < 0.5))
            return finish();
        frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return result;
}
