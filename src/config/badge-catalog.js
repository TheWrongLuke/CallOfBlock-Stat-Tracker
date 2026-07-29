const BADGE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const MAX_BADGE_TEXT_LENGTH = 300;
const MAX_BADGE_NAME_LENGTH = 80;
const MAX_BADGE_ASSET_URL_LENGTH = 1000;

export function badgeTierEditableTarget(tier) {
    const requirement = tier?.requirement;
    if (requirement?.type === "dmMaps") return finiteThreshold(requirement.mapCount, tier?.target);
    if (requirement?.type === "placement" || requirement?.type === "flag") {
        return finiteThreshold(requirement.target, tier?.target);
    }
    return finiteThreshold(tier?.target, 0);
}

export function badgeTierPerMapTarget(tier) {
    if (tier?.requirement?.type !== "dmMaps") return null;
    return finiteThreshold(tier.requirement.targetPerMap, 0);
}

export function normalizeBadgeCatalogOverride(row) {
    const badgeId = String(row?.badge_id || row?.badgeId || "")
        .trim()
        .toLowerCase();
    if (!BADGE_ID_PATTERN.test(badgeId)) return null;

    const tiers = Array.isArray(row?.tiers)
        ? row.tiers
              .map((tier, fallbackIndex) => normalizeTierOverride(tier, fallbackIndex))
              .filter(Boolean)
              .sort((a, b) => a.index - b.index)
        : [];

    return {
        badgeId,
        label: cleanText(row?.label, MAX_BADGE_NAME_LENGTH),
        description: cleanText(row?.description, MAX_BADGE_TEXT_LENGTH, true),
        iconUrl: cleanBadgeAssetUrl(row?.icon_url ?? row?.iconUrl),
        tiers,
        createdAt: String(row?.created_at || row?.createdAt || ""),
        updatedAt: String(row?.updated_at || row?.updatedAt || "")
    };
}

export function mergeBadgeCatalog(baseCatalog, overrideRows) {
    const overrides = new Map(
        (Array.isArray(overrideRows) ? overrideRows : [])
            .map(normalizeBadgeCatalogOverride)
            .filter(Boolean)
            .map((override) => [override.badgeId, override])
    );

    return (Array.isArray(baseCatalog) ? baseCatalog : []).map((badge) => {
        const override = overrides.get(badge.id);
        if (!override) return badge;

        const tierOverrides = new Map(override.tiers.map((tier) => [tier.index, tier]));
        const tiers = Array.isArray(badge.tiers)
            ? badge.tiers.map((tier, index) => mergeBadgeTier(tier, tierOverrides.get(index)))
            : badge.tiers;
        const iconUrl = override.iconUrl || badge.icon;

        return {
            ...badge,
            label: override.label || badge.label,
            description: override.description,
            icon: iconUrl,
            iconUrl,
            ...(tiers ? { tiers } : {})
        };
    });
}

function normalizeTierOverride(tier, fallbackIndex) {
    const indexValue = Number(tier?.index);
    const index = Number.isInteger(indexValue) && indexValue >= 0 ? indexValue : fallbackIndex;
    if (!Number.isInteger(index) || index < 0 || index > 20) return null;

    const target = Number(tier?.target);
    const rawTargetPerMap = tier?.target_per_map ?? tier?.targetPerMap;
    const targetPerMap = rawTargetPerMap === null || rawTargetPerMap === undefined ? null : Number(rawTargetPerMap);
    return {
        index,
        name: cleanText(tier?.name, MAX_BADGE_NAME_LENGTH),
        description: cleanText(tier?.description, MAX_BADGE_TEXT_LENGTH, true),
        iconUrl: cleanBadgeAssetUrl(tier?.icon_url ?? tier?.iconUrl),
        target: Number.isFinite(target) && target >= 0 ? target : null,
        targetPerMap: targetPerMap !== null && Number.isFinite(targetPerMap) && targetPerMap >= 0 ? targetPerMap : null
    };
}

function mergeBadgeTier(tier, override) {
    if (!override) return tier;

    const target = override.target === null ? badgeTierEditableTarget(tier) : override.target;
    const requirement = tier.requirement ? { ...tier.requirement } : null;
    if (requirement?.type === "dmMaps") {
        requirement.mapCount = target;
        if (override.targetPerMap !== null) requirement.targetPerMap = override.targetPerMap;
    } else if (requirement?.type === "placement" || requirement?.type === "flag") {
        requirement.target = target;
    }

    const iconUrl = override.iconUrl || tier.iconUrl || tier.icon || "";
    return {
        ...tier,
        name: override.name || tier.name,
        description: override.description,
        target,
        ...(requirement ? { requirement } : {}),
        ...(iconUrl ? { icon: iconUrl, iconUrl } : {})
    };
}

function finiteThreshold(value, fallback) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0) return numeric;
    const fallbackNumeric = Number(fallback);
    return Number.isFinite(fallbackNumeric) && fallbackNumeric >= 0 ? fallbackNumeric : 0;
}

function cleanBadgeAssetUrl(value) {
    const url = String(value || "")
        .trim()
        .slice(0, MAX_BADGE_ASSET_URL_LENGTH);
    if (!url) return "";
    if (/^https:\/\//i.test(url) || /^\.\.?(?:\/|\\)/.test(url) || /^\/(?!\/)/.test(url)) return url;
    return "";
}

function cleanText(value, maxLength, allowEmpty = false) {
    const text = String(value || "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, maxLength);
    return text || (allowEmpty ? "" : "");
}
