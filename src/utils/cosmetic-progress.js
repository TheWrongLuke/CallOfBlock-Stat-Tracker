function finiteNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function headshotRatePercent(derivedRate) {
    return finiteNumber(derivedRate) * 100;
}

export function meetsSharpshooterRequirement(stats, derived, { rateTarget = 35, hitsTarget = 20 } = {}) {
    return finiteNumber(stats?.hits) >= hitsTarget && headshotRatePercent(derived?.headshotRate) >= rateTarget;
}
