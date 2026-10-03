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
        imageWidth: 99,
        imageHeight: 162,
        worldMinX: 951,
        worldMaxX: 1049,
        worldMinZ: 903,
        worldMaxZ: 1064,
        legacy: { imageWidth: 128, imageHeight: 176, worldMinX: -48, worldMaxX: 79, worldMinZ: -992, worldMaxZ: -818 }
    }),
    mapDefinition({
        id: "hijacked",
        aliases: ["3", "hijacked"],
        imageUrl: "./assets/maps/hijacked.png",
        imageWidth: 192,
        imageHeight: 80,
        worldMinX: -16,
        worldMaxX: 159,
        worldMinZ: 960,
        worldMaxZ: 1039,
        legacy: { imageWidth: 160, imageHeight: 80, worldMinX: -576, worldMaxX: -417, worldMinZ: -864, worldMaxZ: -785 }
    }),
    mapDefinition({
        id: "raid",
        aliases: ["4", "raid"],
        imageUrl: "./assets/maps/raid.png",
        imageWidth: 200,
        imageHeight: 246,
        worldMinX: 915,
        worldMaxX: 1116,
        worldMinZ: -232,
        worldMaxZ: 13,
        legacy: {
            imageWidth: 192,
            imageHeight: 240,
            worldMinX: -368,
            worldMaxX: -177,
            worldMinZ: -1232,
            worldMaxZ: -993
        }
    }),
    mapDefinition({
        id: "a",
        aliases: ["a", "map a", "mapa"],
        imageUrl: "./assets/maps/a.png",
        imageWidth: 31,
        imageHeight: 36,
        worldMinX: -1018,
        worldMaxX: -988,
        worldMinZ: 968,
        worldMaxZ: 1003,
        pixelArt: true
    }),
    mapDefinition({
        id: "b",
        aliases: ["b", "map b", "mapb"],
        imageUrl: "./assets/maps/b.png",
        imageWidth: 26,
        imageHeight: 46,
        worldMinX: 988,
        worldMaxX: 1013,
        worldMinZ: -1002,
        worldMaxZ: -957,
        pixelArt: true
    })
]);

export function applyKnownTacticalMap(map, mode = "", referencePositions = []) {
    let definition = findTacticalMap(map, mode);
    if (!definition) return map;
    // Old recordings can contain stale hard-coded bounds. Prefer recorded player positions.
    if (definition.legacy && map?.mapVersion !== "arena-2026-10") {
        const legacy = { ...definition, ...definition.legacy, imageUrl: `./assets/maps/legacy/${definition.id}.png` };
        const currentHits = referencePositions.filter((position) =>
            contains(definition, position.x, position.z)
        ).length;
        const legacyHits = referencePositions.filter((position) => contains(legacy, position.x, position.z)).length;
        const centerX = midpoint(map?.worldMinX, map?.worldMaxX);
        const centerZ = midpoint(map?.worldMinZ, map?.worldMaxZ);
        if (legacyHits > currentHits || (!currentHits && !legacyHits && contains(legacy, centerX, centerZ))) {
            definition = legacy;
        }
    }
    return {
        ...map,
        imageUrl: definition.imageUrl,
        imageWidth: definition.imageWidth,
        imageHeight: definition.imageHeight,
        pixelArt: definition.pixelArt === true,
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
    // IDs can be reused when admins rebuild their maps; the configured name takes precedence.
    for (const candidate of [normalizeAlias(map?.label), normalizeAlias(map?.mapId)]) {
        if (!candidate) continue;
        const definition = TACTICAL_MAPS.find((entry) =>
            entry.aliases.some((alias) => candidate === normalizeAlias(alias))
        );
        if (definition) return definition;
    }
    return mode === "battleRoyale" ? TACTICAL_MAPS[0] : null;
}

function midpoint(min, max) {
    return Number.isFinite(min) && Number.isFinite(max) ? (min + max) / 2 : null;
}

function contains(bounds, x, z) {
    return (
        Number.isFinite(x) &&
        Number.isFinite(z) &&
        x >= bounds.worldMinX &&
        x <= bounds.worldMaxX &&
        z >= bounds.worldMinZ &&
        z <= bounds.worldMaxZ
    );
}

function mapDefinition(value) {
    return Object.freeze({
        ...value,
        legacy: value.legacy ? Object.freeze(value.legacy) : undefined,
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
