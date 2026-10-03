import { expect, it } from "vitest";
import { minecraftSkinIdentity, skinHeadUrl } from "../../src/core/minecraft-avatar.js";

it("uses the linked Minecraft UUID, never Discord display names or account UUIDs", () => {
    const account = {
        id: "123e4567-e89b-42d3-a456-426614174000",
        display_name: "kiraval",
        minecraft_player_uuid: "4d8a51b6-1cfd-4cbc-8527-97eda0c4202d"
    };
    expect(minecraftSkinIdentity(account)).toBe("4d8a51b61cfd4cbc852797eda0c4202d");
    expect(minecraftSkinIdentity({ display_name: "kiraval", minecraft_player_name: "Ryukai79" })).toBe("Ryukai79");
    expect(minecraftSkinIdentity({ id: account.id, display_name: "kiraval" })).toBe("MHF_Steve");
    expect(minecraftSkinIdentity({}, { name: "Ryukai79" })).toBe("Ryukai79");
    expect(skinHeadUrl(minecraftSkinIdentity(account), 96)).toBe(
        "https://mc-heads.net/avatar/4d8a51b61cfd4cbc852797eda0c4202d/96"
    );
});
