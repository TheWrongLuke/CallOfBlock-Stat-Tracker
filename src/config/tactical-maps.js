const TACTICAL_MAPS = Object.freeze([
    mapDefinition({
        id: "shmar",
        aliases: ["shmar"],
        imageUrl: "./assets/maps/shmar.png",
        imageWidth: 832,
        imageHeight: 816,
        worldMinX: -464,
        worldMaxX: 367,
        worldMinZ: -448,
        worldMaxZ: 367
    }),
    mapDefinition({
        id: "shooting-house",
        aliases: ["2", "shooting house", "shootinghouse", "shoot house", "shoothouse"],
        imageUrl: "./assets/maps/shooting-house.png",
        imageWidth: 128,
        imageHeight: 176,
        worldMinX: -48,
        worldMaxX: 79,
        worldMinZ: -992,
        worldMaxZ: -818
    }),
    mapDefinition({
        id: "hijacked",
        aliases: ["3", "hijacked"],
        imageUrl: "./assets/maps/hijacked.png",
        imageWidth: 160,
        imageHeight: 80,
        worldMinX: -576,
        worldMaxX: -417,
        worldMinZ: -864,
        worldMaxZ: -785
    }),
    mapDefinition({
        id: "raid",
        aliases: ["4", "raid"],
        imageUrl: "./assets/maps/raid.png",
        imageWidth: 192,
        imageHeight: 240,
        worldMinX: -368,
        worldMaxX: -177,
        worldMinZ: -1232,
        worldMaxZ: -993
    })
]);

export function applyKnownTacticalMap(map, mode = "") {
    const definition = findTacticalMap(map, mode);
    if (!definition) return map;
    return {
        ...map,
        imageUrl: definition.imageUrl,
        imageWidth: definition.imageWidth,
        imageHeight: definition.imageHeight,
        worldMinX: definition.worldMinX,
        worldMaxX: definition.worldMaxX,
        worldMinZ: definition.worldMinZ,
        worldMaxZ: definition.worldMaxZ,
        rotationDegrees: 0,
        flipX: false,
        flipY: false,
        calibrated: true,
        calibrationSource: "provided_corner_bounds"
    };
}

export function findTacticalMap(map, mode = "") {
    const candidates = new Set([normalizeAlias(map?.mapId), normalizeAlias(map?.label)].filter(Boolean));
    if (mode === "battleRoyale") candidates.add("shmar");
    return (
        TACTICAL_MAPS.find((definition) => definition.aliases.some((alias) => candidates.has(normalizeAlias(alias)))) ||
        null
    );
}

function mapDefinition(value) {
    return Object.freeze({
        ...value,
        aliases: Object.freeze(value.aliases)
    });
}

function normalizeAlias(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ");
}
