const XP_PER_LEVEL = 10000;
const MAX_LEVEL = 1000;

export function accountProgress(value) {
    const numeric = Number(value);
    const storedXp = Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
    const totalXp = Math.min(MAX_LEVEL * XP_PER_LEVEL, storedXp);
    const level = Math.min(MAX_LEVEL, Math.floor(totalXp / XP_PER_LEVEL) + 1);
    const maximum = level === MAX_LEVEL;
    const currentLevelXp = maximum ? XP_PER_LEVEL : totalXp - (level - 1) * XP_PER_LEVEL;
    return {
        level,
        totalXp,
        storedXp,
        maximum,
        currentLevelXp,
        xpRemaining: maximum ? 0 : XP_PER_LEVEL - currentLevelXp,
        levelProgress: maximum ? 1 : currentLevelXp / XP_PER_LEVEL
    };
}

export function renderAccountProgress(value, { unavailable = false } = {}) {
    if (unavailable) {
        return '<div class="account-xp-progress"><div class="account-level-pill"><strong>LVL ?</strong><span>Progress unavailable</span></div></div>';
    }
    const progress = accountProgress(value);
    const format = (number) => number.toLocaleString();
    return `<div class="account-xp-progress">
        <div class="account-level-pill" title="${format(progress.storedXp)} total XP"><strong>LVL ${progress.level}</strong><span>${format(progress.storedXp)} XP total</span></div>
        <progress class="account-xp-meter" max="10000" value="${progress.currentLevelXp}" aria-label="Progress toward next account level"></progress>
        <small>${progress.maximum ? "Maximum level" : `${format(progress.currentLevelXp)} / 10,000 XP &middot; ${format(progress.xpRemaining)} to level ${progress.level + 1}`}</small>
    </div>`;
}

export function accountAccessIntent(search = "") {
    return new URLSearchParams(search).get("auth") === "register" ? "register" : "login";
}

export function renderAccountAccessLinks({ disabled = false } = {}) {
    if (disabled) return '<button type="button" disabled>Login</button>';
    return '<div class="account-access-links"><a href="/account/?auth=login" data-account-access="login">Login</a><a href="/account/?auth=register" data-account-access="register">Create account</a></div>';
}

export function renderAccountAccessChoices(intent) {
    const register = intent === "register";
    return `<nav class="account-access-tabs" aria-label="Account access">
        <a href="/account/?auth=login" ${!register ? 'aria-current="page"' : ""}>Login</a>
        <a href="/account/?auth=register" ${register ? 'aria-current="page"' : ""}>Create account</a>
    </nav><h2>${register ? "Create your account" : "Welcome back"}</h2>`;
}
