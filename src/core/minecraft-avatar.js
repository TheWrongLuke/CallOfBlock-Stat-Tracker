const UUID = /^[a-f0-9]{8}(?:-?[a-f0-9]{4}){3}-?[a-f0-9]{12}$/i;

export function minecraftSkinIdentity(account, player) {
    for (const value of [
        account?.minecraft_player_uuid,
        player?.minecraft_player_uuid,
        player?.playerUuid,
        player?.player_uuid
    ]) {
        if (typeof value === "string" && UUID.test(value)) return value.replaceAll("-", "").toLowerCase();
    }
    // A website/Discord display name is not a Minecraft skin identity.
    return (
        String(account?.minecraft_player_name || player?.minecraft_player_name || player?.name || "MHF_Steve").trim() ||
        "MHF_Steve"
    );
}

export function skinHeadUrl(identity, size = 96) {
    const safe = String(identity || "MHF_Steve").trim() || "MHF_Steve";
    return `https://mc-heads.net/avatar/${encodeURIComponent(safe)}/${imageSize(size)}`;
}

export function alternateSkinHeadUrl(identity, size = 96) {
    const safe = String(identity || "MHF_Steve").trim() || "MHF_Steve";
    return `https://api.mcheads.org/head/${encodeURIComponent(safe)}/${imageSize(size)}`;
}

function imageSize(value) {
    const size = Number(value);
    return Math.max(16, Math.min(256, Math.round(Number.isFinite(size) && size > 0 ? size : 96)));
}
