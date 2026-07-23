const DEFAULT_BADGE_ICON = "./assets/badges/default.png";

export const ACE_STREAK_TIMING_SECONDS = Object.freeze([4, 4, 4, 3, 2.5, 2.5]);

function tier(rarity, name, target, options = {}) {
    return {
        rarity,
        name,
        target,
        iconKey: options.iconKey || "",
        description: options.description || "",
        requirement: options.requirement || null
    };
}

function tieredBadge({
    id,
    badgeType,
    metric,
    unit,
    description,
    tiers,
    personalBest = null,
    liveValueAtFinalTier = false
}) {
    return {
        id,
        badgeType,
        metric,
        unit,
        description,
        label: tiers[0].name,
        rarity: tiers[0].rarity,
        icon: DEFAULT_BADGE_ICON,
        tiers: tiers.map((entry) => ({
            ...entry,
            iconKey: entry.iconKey || `${id}_${entry.rarity}`,
            description: entry.description || `${entry.name}: ${description}`
        })),
        personalBest,
        liveValueAtFinalTier,
        progress: { type: "tiered" }
    };
}

function permanentBadge(id, label, rarity, description, personalBest = null) {
    return {
        id,
        badgeType: "permanent",
        label,
        rarity,
        description,
        icon: DEFAULT_BADGE_ICON,
        personalBest,
        progress: { type: "achievement" }
    };
}

function specialBadge(id, label, rarity, description, specialRule = "") {
    return {
        id,
        badgeType: "special",
        label,
        rarity,
        description,
        icon: DEFAULT_BADGE_ICON,
        specialRule,
        progress: { type: "special" }
    };
}

export function badgeTierLevel(tiers, currentIndex = -1) {
    const total = Array.isArray(tiers) ? tiers.length : 0;
    if (total < 2) return null;
    const resolvedIndex = Number.isInteger(currentIndex) ? currentIndex : -1;
    return {
        level: Math.min(total, Math.max(1, resolvedIndex + 1)),
        total
    };
}

const LIVE_COUNTER_BADGES = [
    tieredBadge({
        id: "br_kills_counter",
        badgeType: "live-counter",
        metric: { scope: "battleRoyale", stat: "kills" },
        unit: "BR kills",
        description: "Score Battle Royale eliminations.",
        liveValueAtFinalTier: true,
        tiers: [
            tier("common", "Drop Fighter", 50),
            tier("rare", "Zone Hunter", 250),
            tier("epic", "Island Stalker", 1000),
            tier("legendary", "Shmar Predator", 5000),
            tier("mythic", "Apex Reaper", 10000)
        ]
    }),
    tieredBadge({
        id: "dm_kills_counter",
        badgeType: "live-counter",
        metric: { scope: "deathmatch", stat: "kills" },
        unit: "DM kills",
        description: "Score Deathmatch eliminations.",
        liveValueAtFinalTier: true,
        tiers: [
            tier("common", "Arena Combatant", 100),
            tier("rare", "Frag Specialist", 500),
            tier("epic", "Match Enforcer", 2500),
            tier("legendary", "Arena Warlord", 5000),
            tier("mythic", "Deathmatch Reaper", 10000)
        ]
    }),
    tieredBadge({
        id: "br_wins_counter",
        badgeType: "live-counter",
        metric: { scope: "battleRoyale", stat: "wins" },
        unit: "BR wins",
        description: "Win Battle Royale matches.",
        liveValueAtFinalTier: true,
        tiers: [
            tier("common", "Survivor", 1),
            tier("rare", "Final Contender", 10),
            tier("epic", "Last One Standing", 25),
            tier("legendary", "Crowned Survivor", 50),
            tier("mythic", "Apex Champion", 100)
        ]
    }),
    tieredBadge({
        id: "dm_wins_counter",
        badgeType: "live-counter",
        metric: { scope: "deathmatch", stat: "wins" },
        unit: "DM wins",
        description: "Win Deathmatch matches.",
        liveValueAtFinalTier: true,
        tiers: [
            tier("common", "Team Victor", 1),
            tier("rare", "Score Leader", 10),
            tier("epic", "Match Dominator", 25),
            tier("legendary", "Arena Champion", 50),
            tier("mythic", "Deathmatch Legend", 100)
        ]
    }),
    tieredBadge({
        id: "br_mvp_counter",
        badgeType: "live-counter",
        metric: { scope: "battleRoyale", stat: "mvp" },
        unit: "BR MVPs",
        description: "Earn Battle Royale MVP awards.",
        liveValueAtFinalTier: true,
        tiers: [
            tier("common", "Standout Survivor", 1),
            tier("rare", "Drop Leader", 10),
            tier("epic", "Zone Commander", 25),
            tier("legendary", "Battle Icon", 50),
            tier("mythic", "Shmar's Finest", 100)
        ]
    }),
    tieredBadge({
        id: "dm_mvp_counter",
        badgeType: "live-counter",
        metric: { scope: "deathmatch", stat: "mvp" },
        unit: "DM MVPs",
        description: "Earn Deathmatch MVP awards.",
        liveValueAtFinalTier: true,
        tiers: [
            tier("common", "Standout Fighter", 1),
            tier("rare", "Squad Leader", 10),
            tier("epic", "Arena Commander", 25),
            tier("legendary", "Deathmatch Icon", 50),
            tier("mythic", "Arena's Finest", 100)
        ]
    }),
    tieredBadge({
        id: "headshot_kills_counter",
        badgeType: "live-counter",
        metric: { scope: "overall", stat: "headshotKills" },
        unit: "headshot kills",
        description: "Score headshot eliminations in tracked matches.",
        liveValueAtFinalTier: true,
        tiers: [
            tier("common", "Sharp Eye", 10),
            tier("rare", "Marksman", 50),
            tier("epic", "Deadeye", 250),
            tier("legendary", "Precision Executioner", 1000),
            tier("mythic", "Perfect Aim", 2500)
        ]
    }),
    tieredBadge({
        id: "br_playtime_counter",
        badgeType: "live-counter",
        metric: { scope: "battleRoyale", stat: "playtimeSeconds", transform: "hours" },
        unit: "BR hours",
        description: "Spend time in Battle Royale matches.",
        liveValueAtFinalTier: true,
        tiers: [
            tier("common", "New Arrival", 2),
            tier("rare", "Zone Regular", 10),
            tier("epic", "Battle-Hardened", 50),
            tier("legendary", "Shmar Veteran", 100),
            tier("mythic", "Eternal Survivor", 250)
        ]
    }),
    tieredBadge({
        id: "dm_playtime_counter",
        badgeType: "live-counter",
        metric: { scope: "deathmatch", stat: "playtimeSeconds", transform: "hours" },
        unit: "DM hours",
        description: "Spend time in Deathmatch matches.",
        liveValueAtFinalTier: true,
        tiers: [
            tier("common", "Recruit", 2),
            tier("rare", "Arena Regular", 10),
            tier("epic", "Match Veteran", 50),
            tier("legendary", "Arena Elite", 100),
            tier("mythic", "Eternal Combatant", 250)
        ]
    }),
    tieredBadge({
        id: "ace_counter",
        badgeType: "live-counter",
        metric: { scope: "overall", stat: "aces" },
        unit: "Aces",
        description: "Complete timed streaks of at least five uninterrupted kills.",
        liveValueAtFinalTier: true,
        personalBest: {
            metric: { scope: "overall", stat: "bestAceStreak" },
            label: "Personal best",
            unit: "kills in one Ace"
        },
        tiers: [tier("epic", "Ace", 1), tier("legendary", "Ace Specialist", 5), tier("mythic", "Ace of Aces", 10)]
    })
];

const LIMITED_UPGRADABLE_BADGES = [
    tieredBadge({
        id: "br_single_match_kills",
        badgeType: "limited",
        metric: { scope: "battleRoyale", stat: "topMatchKills" },
        unit: "BR kills",
        description: "Set a Battle Royale single-match kill record.",
        personalBest: {
            metric: { scope: "battleRoyale", stat: "topMatchKills" },
            label: "Personal best",
            unit: "BR kills"
        },
        tiers: [
            tier("common", "Skirmisher", 2),
            tier("rare", "Drop Raider", 4),
            tier("epic", "Final-Circle Threat", 6),
            tier("legendary", "Lobby Reaper", 8)
        ]
    }),
    tieredBadge({
        id: "dm_single_match_kills",
        badgeType: "limited",
        metric: { scope: "deathmatch", stat: "topMatchKills" },
        unit: "DM kills",
        description: "Set a Deathmatch single-match kill record.",
        personalBest: {
            metric: { scope: "deathmatch", stat: "topMatchKills" },
            label: "Personal best",
            unit: "DM kills"
        },
        tiers: [
            tier("common", "Fragger", 5),
            tier("rare", "Rampager", 10),
            tier("epic", "Arena Menace", 15),
            tier("legendary", "One-Person Army", 20)
        ]
    }),
    tieredBadge({
        id: "flawless_deathmatch",
        badgeType: "limited",
        metric: { scope: "deathmatch", stat: "bestFlawlessWinKills" },
        unit: "kills in a flawless DM win",
        description: "Win Deathmatch without dying.",
        personalBest: {
            metric: { scope: "deathmatch", stat: "bestFlawlessWinKills" },
            label: "Best flawless win",
            unit: "kills, 0 deaths"
        },
        tiers: [
            tier("rare", "Untouched", 0, {
                requirement: { type: "flag", scope: "deathmatch", stat: "flawlessWins", target: 1 }
            }),
            tier("epic", "Untouchable", 5),
            tier("legendary", "Perfect Match", 10)
        ]
    }),
    tieredBadge({
        id: "dm_win_streak",
        badgeType: "limited",
        metric: { scope: "deathmatch", stat: "longestWinStreak" },
        unit: "consecutive DM wins",
        description: "Build a Deathmatch-only winning streak.",
        personalBest: {
            metric: { scope: "deathmatch", stat: "longestWinStreak" },
            label: "Longest DM win streak",
            unit: ""
        },
        tiers: [
            tier("common", "Back-to-Back", 2),
            tier("rare", "On a Roll", 3),
            tier("epic", "Unstoppable", 5),
            tier("legendary", "Arena Dynasty", 10)
        ]
    }),
    tieredBadge({
        id: "weekly_missions_progress",
        badgeType: "limited",
        metric: { scope: "account", stat: "weekly_missions_completed" },
        unit: "weekly missions",
        description: "Complete renewable weekly missions.",
        tiers: [
            tier("common", "Assignment Accepted", 1),
            tier("rare", "Contract Runner", 25),
            tier("epic", "Mission Specialist", 100),
            tier("legendary", "Bounty Hunter", 300)
        ]
    }),
    tieredBadge({
        id: "hard_missions_progress",
        badgeType: "limited",
        metric: { scope: "account", stat: "hard_missions_completed" },
        unit: "Hard missions",
        description: "Complete Hard weekly missions.",
        tiers: [
            tier("rare", "Challenge Accepted", 5),
            tier("epic", "High-Risk Operative", 25),
            tier("legendary", "Impossible Orders", 75)
        ]
    }),
    tieredBadge({
        id: "dm_map_mastery",
        badgeType: "limited",
        metric: { scope: "deathmatchMaps" },
        unit: "DM maps",
        description: "Build results across four different Deathmatch maps.",
        tiers: [
            tier("common", "Map Tourist", 4, {
                requirement: { type: "dmMaps", stat: "games", targetPerMap: 1, mapCount: 4 }
            }),
            tier("rare", "Arena Challenger", 4, {
                requirement: { type: "dmMaps", stat: "wins", targetPerMap: 1, mapCount: 4 }
            }),
            tier("epic", "Map Specialist", 4, {
                requirement: { type: "dmMaps", stat: "wins", targetPerMap: 10, mapCount: 4 }
            }),
            tier("legendary", "Arena Native", 4, {
                requirement: { type: "dmMaps", stat: "wins", targetPerMap: 25, mapCount: 4 }
            })
        ]
    }),
    tieredBadge({
        id: "br_placement_progress",
        badgeType: "limited",
        metric: { scope: "battleRoyalePlacement", stat: "top10" },
        unit: "placements",
        description: "Consistently place near the top in Battle Royale.",
        tiers: [
            tier("common", "Contender", 5, { requirement: { type: "placement", stat: "top10", target: 5 } }),
            tier("rare", "Finalist", 10, { requirement: { type: "placement", stat: "top5", target: 10 } }),
            tier("epic", "Podium Regular", 25, { requirement: { type: "placement", stat: "top3", target: 25 } }),
            tier("legendary", "Consistent Survivor", 100, {
                requirement: { type: "placement", stat: "top3", target: 100 }
            })
        ]
    }),
    tieredBadge({
        id: "rapid_eliminations",
        badgeType: "limited",
        metric: { scope: "overall", stat: "bestRapidStreak" },
        unit: "kills in one rapid streak",
        description: "Chain quick eliminations using the Ace timing rules.",
        personalBest: {
            metric: { scope: "overall", stat: "bestRapidStreak" },
            label: "Best rapid streak",
            unit: "kills"
        },
        tiers: [tier("common", "Quick Pair", 2), tier("rare", "Triple Threat", 3), tier("epic", "Chain Reaction", 4)]
    }),
    tieredBadge({
        id: "long_range_elimination",
        badgeType: "limited",
        metric: { scope: "overall", stat: "longestKillDistance" },
        unit: "blocks",
        description: "Score eliminations from increasing distances.",
        personalBest: {
            metric: { scope: "overall", stat: "longestKillDistance" },
            label: "Longest elimination",
            unit: "blocks",
            decimals: 1
        },
        tiers: [
            tier("common", "Range Tested", 50),
            tier("rare", "Long Shot", 100),
            tier("epic", "Distant Executioner", 175),
            tier("legendary", "Beyond Reach", 250)
        ]
    })
];

const PERMANENT_GAMEPLAY_BADGES = [
    permanentBadge(
        "everything_is_a_weapon",
        "Everything Is a Weapon",
        "mythic",
        "Get at least one kill with every tracked weapon and damaging item."
    ),
    permanentBadge("pacifist_victory", "Pacifist Victory", "legendary", "Win a Battle Royale match with zero kills."),
    permanentBadge(
        "against_the_odds",
        "Against the Odds",
        "mythic",
        "Win a one-versus-team final engagement against at least three living enemies."
    ),
    permanentBadge("first_blood", "First Blood", "common", "Score the first player elimination of a tracked match."),
    permanentBadge("final_say", "Final Say", "rare", "Score the elimination that ends a tracked match."),
    permanentBadge(
        "from_the_grave",
        "From the Grave",
        "epic",
        "Eliminate an enemy after your death using a delayed credited effect."
    ),
    permanentBadge(
        "last_round",
        "Last Round",
        "epic",
        "Eliminate an enemy with the final round in the current magazine."
    ),
    permanentBadge("no_scope", "No Scope", "epic", "Get a sniper-rifle elimination without aiming through the scope."),
    permanentBadge("point_blank", "Point Blank", "rare", "Eliminate an enemy from within three blocks.", {
        metric: { scope: "overall", stat: "closestKillDistance", zeroIsValue: true },
        label: "Closest elimination",
        unit: "blocks",
        decimals: 1
    }),
    permanentBadge(
        "skyfall",
        "Skyfall",
        "rare",
        "Get an elimination within 20 seconds of landing from the Battle Royale fly-by."
    ),
    permanentBadge("high_ground", "High Ground", "rare", "Eliminate an enemy while at least 15 blocks above them.", {
        metric: { scope: "overall", stat: "greatestHeightAdvantage" },
        label: "Greatest height advantage",
        unit: "blocks"
    }),
    permanentBadge(
        "parkour_shot",
        "Parkour Shot",
        "epic",
        "Get an elimination within three seconds of a reliably tracked parkour action."
    ),
    permanentBadge(
        "one_magazine",
        "One Magazine",
        "epic",
        "Get three eliminations without reloading or switching weapons.",
        {
            metric: { scope: "overall", stat: "bestOneMagazineKills" },
            label: "Personal best",
            unit: "kills with one magazine"
        }
    ),
    permanentBadge(
        "hot_swap",
        "Hot Swap",
        "rare",
        "Damage with one weapon and eliminate with another within five seconds."
    ),
    permanentBadge(
        "counter_sniper",
        "Counter-Sniper",
        "epic",
        "Eliminate the sniper who hit you before either player dies."
    ),
    permanentBadge("grenadier", "Grenadier", "rare", "Get an elimination using a thrown grenade."),
    permanentBadge("claymore_specialist", "Claymore Specialist", "rare", "Get an elimination using a claymore."),
    permanentBadge("road_rage", "Road Rage", "epic", "Directly run over an enemy with a moving vehicle."),
    permanentBadge(
        "tank_buster",
        "Tank Buster",
        "epic",
        "Destroy an occupied enemy tank with a handheld anti-tank launcher."
    ),
    permanentBadge(
        "grounded",
        "Grounded",
        "epic",
        "Destroy an occupied enemy helicopter while attacking from the ground."
    ),
    permanentBadge(
        "air_superiority",
        "Air Superiority",
        "legendary",
        "Destroy an occupied enemy aircraft while operating another aircraft."
    ),
    permanentBadge(
        "combined_arms",
        "Combined Arms",
        "legendary",
        "In one match, get firearm, utility or explosive, and vehicle eliminations."
    ),
    permanentBadge(
        "squad_wipe",
        "Squad Wipe",
        "epic",
        "Personally eliminate every member of one enemy Battle Royale squad."
    ),
    permanentBadge("comeback", "Comeback", "epic", "Win Deathmatch after your team trailed by at least 10 points.", {
        metric: { scope: "deathmatch", stat: "largestComebackDeficit" },
        label: "Largest recovered deficit",
        unit: "points"
    }),
    permanentBadge(
        "photo_finish",
        "Photo Finish",
        "epic",
        "Score the match-winning Deathmatch elimination in the final five seconds."
    ),
    permanentBadge("barely_standing", "Barely Standing", "legendary", "Win Battle Royale at or below 2 HP.", {
        metric: { scope: "battleRoyale", stat: "lowestWinningHealth", zeroIsValue: true },
        label: "Lowest winning health",
        unit: "HP",
        decimals: 1
    }),
    permanentBadge(
        "no_meds_needed",
        "No Meds Needed",
        "legendary",
        "Win Battle Royale without consuming a healing item."
    ),
    permanentBadge(
        "fully_loaded",
        "Fully Loaded",
        "rare",
        "Fill every attachment slot on one weapon during Battle Royale."
    ),
    permanentBadge(
        "scavenger",
        "Scavenger",
        "epic",
        "Get three eliminations with three different weapons collected that match."
    ),
    permanentBadge(
        "perfect_week",
        "Perfect Week",
        "epic",
        "Complete all seven assigned missions in one weekly rotation."
    ),
    permanentBadge(
        "minimalist",
        "Minimalist",
        "legendary",
        "Win Battle Royale while carrying and using only one firearm."
    ),
    permanentBadge("zone_walker", "Zone Walker", "epic", "Win after taking at least 10 HP of zone damage.", {
        metric: { scope: "battleRoyale", stat: "maxZoneDamageInWin" },
        label: "Most zone damage survived in a win",
        unit: "HP",
        decimals: 1
    }),
    permanentBadge(
        "anti_armor_ace",
        "Anti-Armor Ace",
        "legendary",
        "Destroy an occupied tank and helicopter in the same match."
    ),
    permanentBadge(
        "improvised_finish",
        "Improvised Finish",
        "rare",
        "Eliminate an enemy with a weapon taken from a player you eliminated."
    ),
    permanentBadge("hat_trick", "Hat Trick", "epic", "Get three consecutive headshot eliminations."),
    permanentBadge(
        "survival_instinct",
        "Survival Instinct",
        "legendary",
        "Recover after falling to 2 HP or lower, then win Battle Royale."
    ),
    permanentBadge(
        "clean_hands",
        "Clean Hands",
        "epic",
        "Win Battle Royale without dealing explosive or vehicle damage."
    ),
    permanentBadge(
        "close_air_support",
        "Close Air Support",
        "epic",
        "From a helicopter, eliminate an enemy fighting a teammate on the ground."
    ),
    permanentBadge(
        "hunter_becomes_hunted",
        "Hunter Becomes Hunted",
        "epic",
        "Eliminate the opponent who reduced you to 4 HP or lower before healing."
    ),
    permanentBadge(
        "fully_committed",
        "Fully Committed",
        "rare",
        "Finish Battle Royale after landing in the first valid drop window."
    )
];

const SPECIAL_BADGES = [
    specialBadge("admin", "Admin", "legendary", "Granted to active administrators.", "admin"),
    specialBadge("owner", "Owner", "mythic", "Reserved for the Call of Block owner.", "owner"),
    specialBadge("playtester", "Playtester", "rare", "Granted for verified official playtest participation."),
    specialBadge("supporter", "Supporter", "epic", "Cosmetic recognition for eligible supporters.")
];

export const BADGE_CATALOG = Object.freeze([
    ...LIVE_COUNTER_BADGES,
    ...LIMITED_UPGRADABLE_BADGES,
    ...PERMANENT_GAMEPLAY_BADGES,
    ...SPECIAL_BADGES
]);

export const BADGE_TYPE_COUNTS = Object.freeze({
    "live-counter": LIVE_COUNTER_BADGES.length,
    limited: LIMITED_UPGRADABLE_BADGES.length,
    permanent: PERMANENT_GAMEPLAY_BADGES.length,
    special: SPECIAL_BADGES.length
});
