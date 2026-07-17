export function formatRatioPercent(value, { alreadyPercent = false, maximumFractionDigits = 0 } = {}) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "0%";
    const percent = alreadyPercent ? numeric : numeric * 100;
    return `${percent.toLocaleString(undefined, { maximumFractionDigits })}%`;
}
