// ===== REPUTATION HELPERS =====
// Depends on global: REPUTATION

const getRepTier = (rep) => {
    if (!REPUTATION.tiers || REPUTATION.tiers.length === 0) return { name: 'Unknown', minStat: 30, maxStat: 50, maxTraits: 1, recruitCostMult: 1.0, missionChoices: 2 };
    let tier = REPUTATION.tiers[0];
    for (const t of REPUTATION.tiers) {
        if (rep >= t.threshold) tier = t;
    }
    return tier;
};

// ===== AVATAR =====
const getAvatarUrl = (seed, size = 48) => {
    return `https://api.dicebear.com/9.x/pixel-art/svg?seed=${encodeURIComponent(seed)}&size=${size}`;
};
