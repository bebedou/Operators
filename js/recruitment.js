// ===== RECRUIT GENERATOR =====
// Depends on globals: RECRUIT_NAMES, RECRUIT_CALLSIGNS, TRAITS, ECONOMY
// Depends on: roll, pickRandom, generateId (utils.js), getRepTier (reputation.js)

const generateRookie = (existingNames, existingCallsigns, reputation = 0) => {
    const tier = getRepTier(reputation);
    const availNames = RECRUIT_NAMES.filter(n => !existingNames.includes(n));
    const availCallsigns = RECRUIT_CALLSIGNS.filter(c => !existingCallsigns.includes(c));
    const name = availNames.length > 0 ? pickRandom(availNames) : `Ofc. R-${roll(999)}`;
    const callsign = availCallsigns.length > 0 ? pickRandom(availCallsigns) : `X-${roll(99)}`;

    const statRange = tier.maxStat - tier.minStat;
    const aim = tier.minStat + roll(statRange);
    const reflexes = tier.minStat + roll(statRange);
    const discipline = tier.minStat + roll(statRange);
    const avgStat = (aim + reflexes + discipline) / 3;

    const allTraitKeys = Object.keys(TRAITS);
    const traitCount = Math.min(tier.maxTraits, Math.random() > 0.5 ? 2 : 1);
    const traits = [];
    while (traits.length < traitCount && traits.length < allTraitKeys.length) {
        const t = pickRandom(allTraitKeys);
        if (!traits.includes(t)) traits.push(t);
    }

    const baseCost = ECONOMY.recruitBaseCost + (avgStat - 45) * 30;
    const cost = Math.floor(baseCost * (tier.recruitCostMult || 1.0));

    return {
        id: generateId(),
        name, callsign, status: 'READY',
        stats: { aim, reflexes, discipline, health: 100, maxHealth: 100 },
        fatigue: 0, stress: 0,
        traits,
        level: 1, exp: 0, nextLevel: 500,
        mastery: { point: 0, lead: 0, rear: 0 },
        cost
    };
};
