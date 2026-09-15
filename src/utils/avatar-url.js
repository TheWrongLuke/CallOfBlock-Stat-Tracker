const DISCORD_CDN_HOSTS = new Set(["cdn.discordapp.com", "media.discordapp.net"]);

export function normalizeDiscordAvatarUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    try {
        const url = new URL(raw);
        if (url.protocol !== "https:" || !DISCORD_CDN_HOSTS.has(url.hostname.toLowerCase())) return "";

        const avatar = url.pathname.match(/^\/avatars\/(\d{5,32})\/(a_[a-z0-9]+)\.(?:png|jpe?g|webp|gif)$/i);
        if (avatar) url.pathname = `/avatars/${avatar[1]}/${avatar[2]}.gif`;

        const supportedPath =
            /^\/avatars\/\d{5,32}\/[a-z0-9_]+\.(?:png|jpe?g|webp|gif)$/i.test(url.pathname) ||
            /^\/embed\/avatars\/[0-5]\.png$/i.test(url.pathname);
        return supportedPath ? url.toString() : "";
    } catch (_error) {
        return "";
    }
}

export function discordDefaultAvatarUrl(discordId) {
    const id = String(discordId || "").trim();
    if (!/^\d{5,32}$/.test(id)) return "https://cdn.discordapp.com/embed/avatars/0.png";

    try {
        const index = Number((BigInt(id) >> 22n) % 6n);
        return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
    } catch (_error) {
        return "https://cdn.discordapp.com/embed/avatars/0.png";
    }
}

export function discordAvatarCandidates(avatarUrl, discordId) {
    return uniqueImageUrls([normalizeDiscordAvatarUrl(avatarUrl), discordDefaultAvatarUrl(discordId)]);
}

export function uniqueImageUrls(values) {
    const seen = new Set();
    return (values || [])
        .map((value) => String(value || "").trim())
        .filter((value) => {
            if (!value || seen.has(value)) return false;
            seen.add(value);
            return true;
        });
}
