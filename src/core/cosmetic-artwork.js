const REVISION = "20261004";
const FILES = new Set([
    ...["green", "gold", "blue", "red", "private-playtester"].map((name) => `/assets/pfp-borders/${name}.png`),
    ...["default", "battle-royale", "deathmatch", "night-ops", "private-playtester"].map(
        (name) => `/assets/profile-backgrounds/${name}.png`
    )
]);

// Only bundled artwork is versioned; custom/admin image URLs remain untouched.
export function cosmeticArtworkUrl(value, origin = globalThis.location?.origin || "https://callofblock.com") {
    try {
        const url = new URL(value, `${origin}/`);
        if (url.origin !== origin || !FILES.has(url.pathname)) return value;
        url.searchParams.set("v", REVISION);
        return `${url.pathname}${url.search}${url.hash}`;
    } catch {
        return value;
    }
}

export function cosmeticBorderUrl(selection, item, base = globalThis.document?.baseURI || "https://callofblock.com/") {
    if (!selection || selection === "none" || !item?.image_url) return "";
    try {
        const url = new URL(cosmeticArtworkUrl(item.image_url, new URL(base).origin), base);
        return ["https:", "http:"].includes(url.protocol) ? url.href.replaceAll("'", "%27") : "";
    } catch {
        return "";
    }
}
