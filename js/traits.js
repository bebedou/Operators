// ===== TRAIT HELPERS =====
// Depends on global: TRAITS

const getTraitData = (traitId) => TRAITS[traitId] || null;

const applyTraitStatMods = (soldier) => {
    let mods = { aim: 0, reflexes: 0, discipline: 0 };
    soldier.traits.forEach(tId => {
        const t = getTraitData(tId);
        if (!t) return;
        if (t.statBonus) Object.entries(t.statBonus).forEach(([k, v]) => mods[k] = (mods[k] || 0) + v);
        if (t.statPenalty) Object.entries(t.statPenalty).forEach(([k, v]) => mods[k] = (mods[k] || 0) + v);
        // Stress-based trait penalty (NERVOUS)
        if (t.effect === 'stressPenalty' && soldier.stress > (t.stressThreshold || 50)) {
            if (t.statPenalty) Object.entries(t.statPenalty).forEach(([k, v]) => mods[k] = (mods[k] || 0) + v);
        }
        // Stress-based trait bonus (VETERAN under stress)
        if (t.stressThreshold === true && soldier.stress > 50) {
            if (t.statBonus) Object.entries(t.statBonus).forEach(([k, v]) => mods[k] = (mods[k] || 0) + v);
        }
    });
    return mods;
};

const hasTrait = (soldier, traitId) => soldier.traits.includes(traitId);
const isTraitEffect = (soldier, effect) => soldier.traits.some(tId => { const t = getTraitData(tId); return t && t.effect === effect; });

const getDamageMultiplier = (soldier) => {
    let mult = 1;
    soldier.traits.forEach(tId => {
        const t = getTraitData(tId);
        if (!t) return;
        if (t.damageReduction) mult -= t.damageReduction;
        if (t.damageIncrease) mult += t.damageIncrease;
    });
    return Math.max(0.1, mult);
};

const getXpMultiplier = (soldier) => {
    let mult = 1;
    soldier.traits.forEach(tId => {
        const t = getTraitData(tId);
        if (t && t.xpMultiplier) mult *= t.xpMultiplier;
    });
    return mult;
};

const getStressReduction = (soldier) => {
    let red = 0;
    soldier.traits.forEach(tId => {
        const t = getTraitData(tId);
        if (t && t.stressReduction) red += t.stressReduction;
    });
    return red;
};

const getTeamBonus = (squad) => {
    let bonus = 0;
    squad.forEach(s => {
        if (!s) return;
        s.traits.forEach(tId => {
            const t = getTraitData(tId);
            if (t && t.teamBonus) bonus += t.teamBonus;
        });
    });
    return bonus;
};
