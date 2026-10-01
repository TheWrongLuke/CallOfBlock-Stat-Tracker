const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

// The caller supplies its existing stat normalizer; tier rules are shared by UI and server projections.
export function badgeTierState(badge, context, normalizeStats) {
    if (!badge?.tiers?.length) return null;
    let currentIndex = -1;
    let currentSnapshot = null;
    for (let index = 0; index < badge.tiers.length; index += 1) {
        const snapshot = badgeRequirementSnapshot(badge, badge.tiers[index], context, normalizeStats);
        if (snapshot.actual >= snapshot.target) {
            currentIndex = index;
            currentSnapshot = snapshot;
        }
    }
    const nextIndex = Math.min(badge.tiers.length - 1, currentIndex + 1);
    const nextTier = currentIndex >= badge.tiers.length - 1 ? null : badge.tiers[nextIndex];
    const nextSnapshot = nextTier
        ? badgeRequirementSnapshot(badge, nextTier, context, normalizeStats)
        : currentSnapshot;
    return {
        currentIndex,
        currentTier: currentIndex >= 0 ? badge.tiers[currentIndex] : null,
        currentSnapshot,
        nextTier,
        nextSnapshot
    };
}

export function badgeRequirementSnapshot(badge, tier, context, normalizeStats) {
    const requirement = tier?.requirement;
    if (requirement?.type === "dmMaps") {
        const maps = Array.isArray(context?.dm?.details?.deathmatchMaps) ? context.dm.details.deathmatchMaps : [];
        const qualifying = maps.filter((entry) => {
            const stats = normalizeStats(entry?.stats);
            return number(stats[requirement.stat]) >= number(requirement.targetPerMap);
        }).length;
        return { actual: qualifying, target: number(requirement.mapCount), unit: "DM maps" };
    }
    if (requirement?.type === "placement") {
        const placements = context?.br?.details?.battleRoyalePlacement || {};
        return { actual: number(placements[requirement.stat]), target: number(requirement.target), unit: "placements" };
    }
    if (requirement?.type === "flag") {
        return {
            actual: badgeMetricValue(requirement, context),
            target: number(requirement.target),
            unit: requirement.unit || badge.unit || ""
        };
    }
    return { actual: badgeMetricValue(badge.metric, context), target: number(tier?.target), unit: badge.unit || "" };
}

export function badgeMetricValue(metric, context) {
    if (!metric) return 0;
    const source =
        metric.scope === "battleRoyale"
            ? context?.br?.stats
            : metric.scope === "deathmatch"
              ? context?.dm?.stats
              : metric.scope === "account"
                ? context?.account
                : metric.scope === "profile"
                  ? context?.profile
                  : context?.stats;
    const camelStat = String(metric.stat || "").replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    let value = number(source?.[metric.stat] ?? source?.[camelStat]);
    if (metric.transform === "hours") value /= 3600;
    return value;
}
