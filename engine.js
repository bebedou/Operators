const { useState, useEffect, useRef, useCallback } = React;

// --- GAME DATA & CONSTANTS (Populated via fetch) ---
let TACTICS = {};
let SQUAD_SLOTS = [];
let INITIAL_ROSTER = [];
let MISSIONS = [];
let TRAITS = {};
let ECONOMY = {};
let REPUTATION = {};
let RECRUIT_NAMES = [];
let RECRUIT_CALLSIGNS = [];

// --- UTILITY FUNCTIONS ---
const roll = (max = 100) => Math.floor(Math.random() * max) + 1;
const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
const generateId = () => Date.now() + Math.floor(Math.random() * 10000);

// --- SAVE / LOAD ---
const SAVE_KEY = 'squad_leader_protocol_save';

const saveGame = (state) => {
    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch (e) { console.warn('Save failed', e); }
};

const loadGame = () => {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
};

const clearSave = () => localStorage.removeItem(SAVE_KEY);

// --- TRAIT HELPERS ---
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

// --- REPUTATION HELPERS ---
const getRepTier = (rep) => {
    if (!REPUTATION.tiers || REPUTATION.tiers.length === 0) return { name: 'Unknown', minStat: 30, maxStat: 50, maxTraits: 1, recruitCostMult: 1.0, missionChoices: 2 };
    let tier = REPUTATION.tiers[0];
    for (const t of REPUTATION.tiers) {
        if (rep >= t.threshold) tier = t;
    }
    return tier;
};

// --- RECRUIT GENERATOR ---
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

// --- COMPONENTS ---

const getAvatarUrl = (seed, size = 48) => {
    return `https://api.dicebear.com/9.x/pixel-art/svg?seed=${encodeURIComponent(seed)}&size=${size}`;
};

const Avatar = ({ seed, size = 36, className = '' }) => (
    <img
        src={getAvatarUrl(seed, size * 2)}
        width={size}
        height={size}
        className={`avatar ${className}`}
        alt={seed}
        loading="lazy"
    />
);

// --- MISSION MAP COMPONENT ---
const MissionMap = ({ phases, currentPhaseIndex }) => {
    const phaseIcons = {
        'BREACH': '🚪',
        'CLEAR': '🔍',
        'CONTACT': '💥',
        'BOSS': '💀',
        'INTERVENTION': '⚠'
    };

    return (
        <div className="mission-map">
            <div className="map-track">
                {phases.map((phase, idx) => {
                    let status = 'pending';
                    if (idx < currentPhaseIndex) status = 'done';
                    if (idx === currentPhaseIndex) status = 'active';

                    return (
                        <React.Fragment key={idx}>
                            <div className={`map-node ${status}`}>
                                <div className="map-node-icon">{phaseIcons[phase.type] || '•'}</div>
                                <div className="map-node-label">{phase.type}</div>
                            </div>
                            {idx < phases.length - 1 && (
                                <div className={`map-connector ${idx < currentPhaseIndex ? 'done' : ''}`} />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
};

const StatBar = ({ label, value, max = 100, color = "bg-emerald-500" }) => (
    <div className="stat-bar-row">
        <span className="stat-label">{label}</span>
        <div className="stat-bar-bg">
            <div className={`stat-bar-fill ${color}`} style={{ width: `${Math.min((value / max) * 100, 100)}%` }}></div>
        </div>
        <span className="stat-value">{value}</span>
    </div>
);

const HumanTollBar = ({ label, value, max = 100, color }) => (
    <div className="stat-bar-row">
        <span className="stat-label">{label}</span>
        <div className="stat-bar-bg">
            <div className={`stat-bar-fill ${color}`} style={{ width: `${Math.min((value / max) * 100, 100)}%` }}></div>
        </div>
        <span className="stat-value" style={{ color: value > 70 ? '#ef4444' : value > 40 ? '#f59e0b' : '#6b7280' }}>{value}</span>
    </div>
);

const SoldierCard = ({ soldier, onSelect, isSelected, isDead, slotIndex, compact }) => {
    const statusColor = soldier.stats.health <= 0 ? 'text-red-600' : (soldier.stats.health < 50 ? 'text-orange-500' : 'text-emerald-500');
    const slotName = slotIndex !== undefined ? SQUAD_SLOTS[slotIndex]?.name : null;

    const fatigueWarning = soldier.fatigue > 60;
    const stressWarning = soldier.stress > 60;

    return (
        <div
            onClick={() => !isDead && onSelect && onSelect(soldier)}
            className={`soldier-card ${isSelected ? 'selected' : ''} ${isDead ? 'dead' : ''}`}
        >
            {slotName && <div className="slot-badge">{slotName}</div>}

            <div className="soldier-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Avatar seed={soldier.callsign} size={compact ? 28 : 36} />
                    <div>
                        <div className={`soldier-name ${statusColor}`}>
                            <span>{soldier.name}</span>
                            <span className="level-badge">LVL {soldier.level}</span>
                        </div>
                        <div className="soldier-meta">
                            '{soldier.callsign}' // {soldier.traits.map(t => TRAITS[t]?.name || t).join(", ")}
                        </div>
                    </div>
                </div>
                <div className="soldier-hp">
                    <span className={statusColor}>{soldier.stats.health <= 0 ? 'KIA' : `${soldier.stats.health}HP`}</span>
                </div>
            </div>

            {!compact && (
                <>
                    <StatBar label="RFLX" value={soldier.stats.reflexes} color="bar-blue" />
                    <StatBar label="DISC" value={soldier.stats.discipline} color="bar-purple" />
                    <StatBar label="AIM" value={soldier.stats.aim} color="bar-red" />

                    <div className="toll-bars">
                        <HumanTollBar label="FTG" value={soldier.fatigue} color="bar-fatigue" />
                        <HumanTollBar label="STR" value={soldier.stress} color="bar-stress" />
                    </div>

                    {(fatigueWarning || stressWarning) && (
                        <div className="warning-text">
                            {fatigueWarning && '⚠ HIGH FATIGUE '}
                            {stressWarning && '⚠ HIGH STRESS'}
                        </div>
                    )}

                    <div className="xp-bar-bg">
                        <div className="xp-bar-fill" style={{ width: `${(soldier.exp / soldier.nextLevel) * 100}%` }}></div>
                    </div>
                </>
            )}
        </div>
    );
};

const LogEntry = ({ entry }) => {
    const typeClass = `log-type-${entry.type || 'info'}`;
    return (
        <div className={`log-entry ${typeClass}`}>
            <span className="log-time">[{entry.time}]</span>
            <span>{entry.text}</span>
        </div>
    );
};

const BudgetDisplay = ({ budget }) => (
    <div className="budget-hud">
        <span className="budget-label">BUDGET</span>
        <span className={`budget-amount ${budget < 1000 ? 'low' : ''}`}>${budget.toLocaleString()}</span>
    </div>
);

// --- INTERVENTION COMPONENT ---
const InterventionOverlay = ({ intervention, squad, onChoice }) => {
    const [timeLeft, setTimeLeft] = useState(100);

    useEffect(() => {
        const interval = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 0) {
                    clearInterval(interval);
                    // Auto-pick worst option (last one)
                    onChoice(intervention.choices[intervention.choices.length - 1]);
                    return 0;
                }
                return prev - 1;
            });
        }, 100); // 10 seconds total
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="intervention-overlay">
            <div className="intervention-box">
                <div className="intervention-alert">⚠ COMMAND DECISION REQUIRED</div>
                <div className="intervention-prompt">{intervention.prompt}</div>
                <div className="intervention-timer">
                    <div className="intervention-timer-fill" style={{ width: `${timeLeft}%` }}></div>
                </div>
                <div className="intervention-choices">
                    {intervention.choices.map((choice, idx) => {
                        const soldier = squad[choice.slot];
                        const soldierName = soldier ? soldier.name : 'N/A';
                        return (
                            <button
                                key={idx}
                                onClick={() => onChoice(choice)}
                                className="intervention-btn"
                            >
                                <div className="intervention-btn-text">{choice.text}</div>
                                <div className="intervention-btn-who">{soldierName} [{choice.stat.toUpperCase()}]</div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

// --- MAIN GAME COMPONENT ---
const Game = () => {
    const [gameState, setGameState] = useState('TITLE');
    const [roster, setRoster] = useState([]);
    const [deadOperators, setDeadOperators] = useState([]);
    const [budget, setBudget] = useState(ECONOMY.startingBudget);
    const [reputation, setReputation] = useState(REPUTATION.startingRep || 0);
    const [missionCount, setMissionCount] = useState(0);
    const [selectedSquad, setSelectedSquad] = useState([null, null, null]);
    const [selectedTactic, setSelectedTactic] = useState(null);
    const [currentMission, setCurrentMission] = useState(null);
    const [missionChoices, setMissionChoices] = useState([]);
    const [logs, setLogs] = useState([]);
    const [simulationTime, setSimulationTime] = useState("22:00:00");
    const [missionResult, setMissionResult] = useState(null);
    const [missionReward, setMissionReward] = useState(0);
    const [baseTab, setBaseTab] = useState('barracks');
    const [recruitPool, setRecruitPool] = useState([]);
    const [intervention, setIntervention] = useState(null);
    const [interventionResolver, setInterventionResolver] = useState(null);
    const [currentPhaseIndex, setCurrentPhaseIndex] = useState(-1);

    const logsEndRef = useRef(null);

    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [logs]);

    // --- INIT: Load or New Game ---
    const startNewGame = () => {
        const startRep = REPUTATION.startingRep || 0;
        const newState = {
            roster: JSON.parse(JSON.stringify(INITIAL_ROSTER)),
            deadOperators: [],
            budget: ECONOMY.startingBudget,
            reputation: startRep,
            missionCount: 0
        };
        setRoster(newState.roster);
        setDeadOperators([]);
        setBudget(newState.budget);
        setReputation(startRep);
        setMissionCount(0);
        saveGame(newState);
        generateMissionChoices(0, startRep);
        setGameState('BRIEFING');
    };

    const continueGame = (save) => {
        setRoster(save.roster);
        setDeadOperators(save.deadOperators || []);
        setBudget(save.budget);
        setReputation(save.reputation || 0);
        setMissionCount(save.missionCount);
        generateMissionChoices(save.missionCount, save.reputation || 0);
        setGameState('BRIEFING');
    };

    const doSave = useCallback(() => {
        saveGame({ roster, deadOperators, budget, reputation, missionCount });
    }, [roster, deadOperators, budget, reputation, missionCount]);

    // --- MISSION GENERATION ---
    const generateMissionChoices = (count, rep) => {
        const repToUse = rep !== undefined ? rep : reputation;
        const tier = getRepTier(repToUse);
        const maxDifficulty = Math.min(1 + Math.floor(count / 2), 5);
        const eligible = MISSIONS.filter(m => m.difficulty <= maxDifficulty);
        const shuffled = [...eligible].sort(() => Math.random() - 0.5);
        const numChoices = Math.max(2, tier.missionChoices || 2);
        setMissionChoices(shuffled.slice(0, Math.min(numChoices, shuffled.length)));
    };

    // --- GAMEPLAY LOGIC ---
    const toggleSquadMember = (soldier) => {
        const newSquad = [...selectedSquad];
        const existingIndex = newSquad.findIndex(s => s && s.id === soldier.id);

        if (existingIndex !== -1) {
            newSquad[existingIndex] = null;
        } else {
            const emptyIndex = newSquad.findIndex(s => s === null);
            if (emptyIndex !== -1) {
                newSquad[emptyIndex] = soldier;
            }
        }
        setSelectedSquad(newSquad);
    };

    const timeRef = useRef("22:00:00");

    const addLog = (text, type = 'info') => {
        const [h, m, s] = timeRef.current.split(':').map(Number);
        const newDate = new Date();
        newDate.setHours(h, m, s + roll(5));
        const newTime = newDate.toTimeString().split(' ')[0];
        timeRef.current = newTime;
        setSimulationTime(newTime);
        setLogs(prev => [...prev, { time: newTime, text, type }]);
    };

    // --- MISSION EXECUTION ---
    const runMission = async () => {
        setGameState('EXECUTION');
        setLogs([]);
        setCurrentPhaseIndex(-1);
        timeRef.current = "22:00:00";
        setSimulationTime("22:00:00");
        addLog(`INITIATING OP: ${currentMission.title}`, 'command');
        addLog(`TACTIC: ${selectedTactic.name.toUpperCase()}`, 'tactic');
        if (currentMission.modifiers?.length) {
            addLog(`MODIFIERS: ${currentMission.modifiers.join(' / ')}`, 'tactic');
        }

        let activeSquad = selectedSquad.map(s => s ? JSON.parse(JSON.stringify(s)) : null);
        const teamBonus = getTeamBonus(activeSquad);

        await new Promise(r => setTimeout(r, 1000));

        let failed = false;
        const modifiers = selectedTactic.modifiers;

        for (let phaseIdx = 0; phaseIdx < currentMission.phases.length; phaseIdx++) {
            const phase = currentMission.phases[phaseIdx];
            if (failed) break;
            setCurrentPhaseIndex(phaseIdx);

            // --- INTERVENTION PHASE ---
            if (phase.type === 'INTERVENTION' && phase.intervention) {
                addLog(`>>> ${phase.text}`, 'command');
                await new Promise(r => setTimeout(r, 1000));
                addLog(`⚠ ${phase.intervention.prompt}`, 'critical');

                // Show intervention UI and wait for player choice
                const choice = await new Promise((resolve) => {
                    setIntervention(phase.intervention);
                    setInterventionResolver(() => resolve);
                });
                setIntervention(null);
                setInterventionResolver(null);

                // Resolve intervention check
                let actor = activeSquad[choice.slot];
                if (!actor || actor.stats.health <= 0) {
                    actor = activeSquad.find(s => s && s.stats.health > 0);
                }
                if (!actor) {
                    addLog("CRITICAL: ALL UNITS INCAPACITATED", "critical");
                    failed = true;
                    break;
                }

                addLog(`DECISION: ${choice.text} — ${actor.name} takes action.`, 'command');
                await new Promise(r => setTimeout(r, 800));

                const traitMods = applyTraitStatMods(actor);
                const baseStat = actor.stats[choice.stat];
                const tacticMod = modifiers[choice.stat] || 0;
                const fatiguePenalty = Math.floor(actor.fatigue / 2);
                const stressPenalty = choice.stat === 'discipline' ? Math.floor(actor.stress / 3) : 0;
                const finalSkill = baseStat + tacticMod + (traitMods[choice.stat] || 0) + teamBonus - fatiguePenalty - stressPenalty + (choice.bonus || 0);

                const difficulty = 50 + (currentMission.difficulty * 12);
                const rollVal = roll(100);
                const totalScore = finalSkill + rollVal;

                addLog(`CHECK: ${actor.name} [${choice.stat.toUpperCase()} ${finalSkill}] rolled ${rollVal}`, 'check');
                await new Promise(r => setTimeout(r, 1200));

                if (totalScore > difficulty + 40) {
                    addLog(`>> PERFECT EXECUTION. Crisis averted.`, 'success');
                } else if (totalScore > difficulty) {
                    addLog(`>> SUCCESS. Situation contained.`, 'success');
                } else {
                    addLog(`!! INTERVENTION FAILED.`, 'fail');
                    const dmg = roll(35) + currentMission.difficulty * 3;
                    const finalDmg = Math.floor(dmg * getDamageMultiplier(actor));
                    actor.stats.health -= finalDmg;
                    addLog(`${actor.name} takes ${finalDmg} DMG!`, 'critical');
                    if (actor.stats.health <= 0) {
                        addLog(`*** MAN DOWN! ${actor.name} KIA! ***`, 'critical');
                    }
                }
                await new Promise(r => setTimeout(r, 1500));
                continue;
            }

            // --- NORMAL PHASE ---
            addLog(`>>> PHASE: ${phase.text}`, 'command');
            await new Promise(r => setTimeout(r, 1500));

            let actingSoldier = activeSquad[phase.slot];
            let roleName = SQUAD_SLOTS[phase.slot].name;

            if (!actingSoldier || actingSoldier.stats.health <= 0) {
                const fallback = activeSquad.find(s => s && s.stats.health > 0);
                if (!fallback) {
                    addLog("CRITICAL: ALL UNITS INCAPACITATED", "critical");
                    failed = true;
                    break;
                }
                actingSoldier = fallback;
                addLog(`!! ${roleName} DOWN. ${actingSoldier.name} COVERS.`, 'critical');
            } else {
                addLog(`${roleName} (${actingSoldier.name}) takes lead.`, 'info');
            }

            await new Promise(r => setTimeout(r, 800));

            // THE CHECK — now with fatigue/stress/trait modifiers
            const statName = phase.check;
            const traitMods = applyTraitStatMods(actingSoldier);
            const baseStat = actingSoldier.stats[statName];
            const tacticMod = modifiers[statName] || 0;
            const fatiguePenalty = Math.floor(actingSoldier.fatigue / 2);
            const stressPenalty = statName === 'discipline' ? Math.floor(actingSoldier.stress / 3) : 0;
            const finalSkill = baseStat + tacticMod + (traitMods[statName] || 0) + teamBonus - fatiguePenalty - stressPenalty;

            const difficulty = 50 + (currentMission.difficulty * 12);
            const rollVal = roll(100);
            const totalScore = finalSkill + rollVal;

            // Show penalties in log if relevant
            const penalties = [];
            if (fatiguePenalty > 0) penalties.push(`-${fatiguePenalty} FTG`);
            if (stressPenalty > 0) penalties.push(`-${stressPenalty} STR`);
            const penaltyStr = penalties.length > 0 ? ` (${penalties.join(', ')})` : '';

            addLog(`CHECK: ${actingSoldier.name} [${statName.toUpperCase()} ${finalSkill}${penaltyStr}]...`, 'check');
            await new Promise(r => setTimeout(r, 1200));

            if (totalScore > difficulty + 40) {
                addLog(`>> PERFECT EXECUTION.`, 'success');
            } else if (totalScore > difficulty) {
                addLog(`>> SUCCESS. Proceeding.`, 'success');
            } else {
                addLog(`!! FAILURE. Hostile Action!`, 'fail');
                const dmg = roll(30) + currentMission.difficulty * 2;
                const finalDmg = Math.floor(dmg * getDamageMultiplier(actingSoldier));
                actingSoldier.stats.health -= finalDmg;
                addLog(`${actingSoldier.name} takes ${finalDmg} DMG!`, 'critical');

                // Stress spike for whole squad
                activeSquad.forEach(s => {
                    if (s && s.stats.health > 0) s.stress = clamp((s.stress || 0) + roll(5), 0, 100);
                });

                if (actingSoldier.stats.health <= 0) {
                    addLog(`*** MAN DOWN! ${actingSoldier.name} KIA! ***`, 'critical');
                    // Stress spike for KIA
                    activeSquad.forEach(s => {
                        if (s && s.stats.health > 0) s.stress = clamp((s.stress || 0) + 10 + roll(10), 0, 100);
                    });
                }

                // Panic check for NERVOUS operators
                activeSquad.forEach(s => {
                    if (s && s.stats.health > 0 && s.stress > 70 && !isTraitEffect(s, 'panicImmune') && hasTrait(s, 'NERVOUS')) {
                        addLog(`${s.name} PANICS! Freezing up!`, 'fail');
                    }
                });
            }

            await new Promise(r => setTimeout(r, 1500));
        }

        // Final status
        const survivors = activeSquad.filter(s => s && s.stats.health > 0).length;
        if (survivors === 0) failed = true;

        const reward = failed ? 0 : Math.floor(currentMission.reward * (1 + currentMission.difficulty * 0.1));
        setMissionReward(reward);

        addLog(failed ? "MISSION FAILED. RTB." : `MISSION ACCOMPLISHED. CODE 4. Reward: $${reward}`, failed ? 'critical' : 'success');
        setMissionResult(failed ? 'FAILURE' : 'SUCCESS');

        updateRosterAfterMission(activeSquad, failed, reward);

        setTimeout(() => setGameState('DEBRIEF'), 3000);
    };

    const handleInterventionChoice = (choice) => {
        if (interventionResolver) {
            interventionResolver(choice);
        }
    };

    const updateRosterAfterMission = (missionSquad, failed, reward) => {
        const newDead = [];

        const updatedRoster = roster.map(soldier => {
            const squadIndex = missionSquad.findIndex(ms => ms && ms.id === soldier.id);

            if (squadIndex !== -1) {
                const missionState = missionSquad[squadIndex];
                const survived = missionState.stats.health > 0;

                // Fatigue & Stress accumulation
                const baseFatigueGain = 15 + roll(10);
                const baseStressGain = (failed ? 10 : 5) + roll(10);
                const stressReduction = getStressReduction(soldier);

                const newFatigue = clamp(soldier.fatigue + baseFatigueGain, 0, 100);
                const newStress = clamp(
                    (missionState.stress || soldier.stress) + baseStressGain - stressReduction,
                    0, 100
                );

                // XP Logic
                let xpGain = failed ? 50 : 200;
                if (!survived) xpGain = 0;
                xpGain = Math.floor(xpGain * getXpMultiplier(soldier));

                // Mastery
                const newMastery = { ...soldier.mastery };
                if (survived) {
                    const masteryKey = SQUAD_SLOTS[squadIndex]?.masteryKey;
                    if (masteryKey && newMastery[masteryKey] !== undefined) {
                        newMastery[masteryKey] += 1;
                    }
                }

                // Level Up
                let newExp = soldier.exp + xpGain;
                let newLevel = soldier.level;
                let newNextLevel = soldier.nextLevel;
                let newStats = { ...soldier.stats, health: Math.max(0, missionState.stats.health) };

                if (newExp >= soldier.nextLevel && survived) {
                    newExp -= soldier.nextLevel;
                    newLevel += 1;
                    newNextLevel = Math.floor(newNextLevel * 1.5);
                    newStats.aim += roll(5);
                    newStats.discipline += roll(5);
                    newStats.reflexes += roll(5);
                    newStats.maxHealth = Math.min(newStats.maxHealth + 5, 150);
                }

                const updated = {
                    ...soldier,
                    stats: newStats,
                    fatigue: survived ? newFatigue : soldier.fatigue,
                    stress: survived ? newStress : soldier.stress,
                    exp: newExp,
                    level: newLevel,
                    nextLevel: newNextLevel,
                    mastery: newMastery,
                    status: survived ? 'READY' : 'KIA'
                };

                if (!survived) {
                    newDead.push({
                        ...updated,
                        diedOnMission: missionCount + 1,
                        causeOfDeath: currentMission.title
                    });
                }

                return updated;
            }
            return soldier;
        });

        // MEDIC trait: post-mission heal
        const medics = updatedRoster.filter(s => hasTrait(s, 'MEDIC') && s.stats.health > 0 && missionSquad.some(ms => ms && ms.id === s.id));
        medics.forEach(medic => {
            const healTarget = updatedRoster.find(s =>
                s.id !== medic.id && s.stats.health > 0 && s.stats.health < s.stats.maxHealth &&
                missionSquad.some(ms => ms && ms.id === s.id)
            );
            if (healTarget) {
                const healAmt = TRAITS.MEDIC?.healAmount || 10;
                healTarget.stats.health = Math.min(healTarget.stats.maxHealth, healTarget.stats.health + healAmt);
            }
        });

        // Separate alive from dead
        const aliveRoster = updatedRoster.filter(s => s.stats.health > 0 || !missionSquad.some(ms => ms && ms.id === s.id));
        const finalRoster = aliveRoster.filter(s => s.status !== 'KIA');

        setRoster(finalRoster);
        setDeadOperators(prev => [...prev, ...newDead]);
        setBudget(prev => prev + reward);
        setMissionCount(prev => prev + 1);

        // Reputation changes
        let repChange = 0;
        if (!failed) {
            repChange += newDead.length === 0 ? (REPUTATION.perfectGain || 25) : (REPUTATION.successGain || 15);
        } else {
            repChange += REPUTATION.failureLoss || -10;
        }
        repChange += newDead.length * (REPUTATION.kiaLoss || -5);
        setReputation(prev => Math.max(0, prev + repChange));
    };

    // --- BASE ACTIONS ---
    const healOperator = (soldierId) => {
        const soldier = roster.find(s => s.id === soldierId);
        if (!soldier || soldier.stats.health >= soldier.stats.maxHealth) return;
        const hpToHeal = soldier.stats.maxHealth - soldier.stats.health;
        const cost = hpToHeal * ECONOMY.healCostPerHP;
        if (budget < cost) return;

        setRoster(prev => prev.map(s =>
            s.id === soldierId ? { ...s, stats: { ...s.stats, health: s.stats.maxHealth } } : s
        ));
        setBudget(prev => prev - cost);
    };

    const restOperator = (soldierId) => {
        const soldier = roster.find(s => s.id === soldierId);
        if (!soldier || soldier.fatigue <= 0) return;
        const cost = soldier.fatigue * ECONOMY.restCostPerFatigue;
        if (budget < cost) return;

        setRoster(prev => prev.map(s =>
            s.id === soldierId ? { ...s, fatigue: 0 } : s
        ));
        setBudget(prev => prev - cost);
    };

    const therapyOperator = (soldierId) => {
        const soldier = roster.find(s => s.id === soldierId);
        if (!soldier || soldier.stress <= 0) return;
        const cost = soldier.stress * ECONOMY.therapyCostPerStress;
        if (budget < cost) return;

        setRoster(prev => prev.map(s =>
            s.id === soldierId ? { ...s, stress: 0 } : s
        ));
        setBudget(prev => prev - cost);
    };

    const recruitOperator = (rookie) => {
        if (budget < rookie.cost) return;
        const { cost, ...soldierData } = rookie;
        setRoster(prev => [...prev, soldierData]);
        setBudget(prev => prev - cost);
        setRecruitPool(prev => prev.filter(r => r.id !== rookie.id));
    };

    const refreshRecruitPool = () => {
        const existingNames = roster.map(s => s.name);
        const existingCallsigns = roster.map(s => s.callsign);
        const pool = [];
        for (let i = 0; i < 3; i++) {
            pool.push(generateRookie([...existingNames, ...pool.map(p => p.name)], [...existingCallsigns, ...pool.map(p => p.callsign)], reputation));
        }
        setRecruitPool(pool);
    };

    const goToBase = () => {
        doSave();
        setSelectedSquad([null, null, null]);
        setBaseTab('barracks');
        refreshRecruitPool();
        setGameState('BASE');
    };

    const goToNextMission = () => {
        doSave();
        generateMissionChoices(missionCount, reputation);
        if (roster.filter(s => s.stats.health > 0).length < 3) {
            // Force recruit if not enough alive
            setBaseTab('recruit');
            setGameState('BASE');
        } else {
            setGameState('BRIEFING');
        }
    };

    // ==================== RENDER ====================

    // --- TITLE SCREEN ---
    if (gameState === 'TITLE') {
        const save = loadGame();
        return (
            <div className="screen-center">
                <div className="title-screen">
                    <div className="title-badge">CLASSIFIED // EYES ONLY</div>
                    <h1 className="title-main">SQUAD LEADER</h1>
                    <div className="title-sub">PROTOCOL</div>
                    <div className="title-divider"></div>
                    <p className="title-desc">Tactical Operations Command System v2.1</p>

                    <div className="title-buttons">
                        <button onClick={startNewGame} className="btn-primary btn-lg">
                            NEW CAMPAIGN
                        </button>
                        {save && (
                            <button onClick={() => continueGame(save)} className="btn-secondary btn-lg">
                                CONTINUE
                                <span className="btn-sub">Mission #{save.missionCount} // ${save.budget} Budget // Rep: {save.reputation || 0}</span>
                            </button>
                        )}
                    </div>

                    {save && (
                        <button onClick={() => { clearSave(); window.location.reload(); }} className="btn-danger-sm">
                            DELETE SAVE DATA
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // --- BRIEFING ---
    if (gameState === 'BRIEFING') {
        return (
            <div className="screen-scroll">
                <BudgetDisplay budget={budget} />
                <div className="briefing-container">
                    <div className="section-header">
                        <div className="badge-top-secret">TOP SECRET</div>
                        <h1 className="page-title">INCOMING OPERATIONS</h1>
                        <p className="page-subtitle">Select a mission to begin tactical planning. Mission #{missionCount + 1}</p>
                        <div className="rep-strip">
                            <span className="rep-label">REPUTATION</span>
                            <span className="rep-value">{reputation}</span>
                            <span className="rep-tier">{getRepTier(reputation).name.toUpperCase()}</span>
                        </div>
                    </div>

                    <div className="mission-grid">
                        {missionChoices.map(mission => (
                            <div
                                key={mission.id}
                                onClick={() => { setCurrentMission(mission); setGameState('PLANNING'); setSelectedTactic(Object.values(TACTICS)[0]); }}
                                className="mission-card"
                            >
                                <div className="mission-difficulty">
                                    {'★'.repeat(mission.difficulty)}{'☆'.repeat(5 - mission.difficulty)}
                                </div>
                                <h2 className="mission-title">{mission.title}</h2>
                                <div className="mission-location">{mission.location}</div>
                                <p className="mission-brief">{mission.brief}</p>
                                {mission.modifiers?.length > 0 && (
                                    <div className="mission-modifiers">
                                        {mission.modifiers.map((m, i) => <span key={i} className="modifier-tag">{m}</span>)}
                                    </div>
                                )}
                                <div className="mission-reward">REWARD: ${mission.reward}</div>
                            </div>
                        ))}
                    </div>

                    <button onClick={() => setGameState('BASE')} className="btn-secondary btn-back">
                        ← RETURN TO BASE
                    </button>
                </div>
            </div>
        );
    }

    // --- PLANNING ---
    if (gameState === 'PLANNING') {
        const filledSlots = selectedSquad.filter(s => s !== null).length;
        const isReady = filledSlots === 3;
        const aliveRoster = roster.filter(s => s.stats.health > 0);

        return (
            <div className="planning-screen">
                <BudgetDisplay budget={budget} />

                {/* Roster */}
                <div className="planning-roster">
                    <h2 className="section-title">UNIT ROSTER</h2>
                    <div className="roster-scroll">
                        {aliveRoster.map(soldier => {
                            const slotIdx = selectedSquad.findIndex(s => s && s.id === soldier.id);
                            return (
                                <SoldierCard
                                    key={soldier.id}
                                    soldier={soldier}
                                    isSelected={slotIdx !== -1}
                                    slotIndex={slotIdx !== -1 ? slotIdx : undefined}
                                    onSelect={toggleSquadMember}
                                    isDead={soldier.stats.health <= 0}
                                />
                            );
                        })}
                    </div>
                </div>

                {/* Tactical Board */}
                <div className="planning-board">
                    <div className="board-header">
                        <h2 className="section-title accent">TACTICAL BOARD</h2>
                        <button onClick={() => setSelectedSquad([null, null, null])} className="btn-text">CLEAR SQUAD</button>
                    </div>

                    {/* Mission Info */}
                    <div className="mission-info-strip">
                        <span>{currentMission.title}</span>
                        <span className="difficulty-stars">{'★'.repeat(currentMission.difficulty)}</span>
                    </div>

                    {/* Tactic Selector */}
                    <div className="tactic-grid">
                        {Object.values(TACTICS).map(tactic => (
                            <div
                                key={tactic.id}
                                onClick={() => setSelectedTactic(tactic)}
                                className={`tactic-card ${selectedTactic?.id === tactic.id ? 'selected' : ''}`}
                            >
                                <div className="tactic-name">{tactic.name}</div>
                                <div className="tactic-desc">{tactic.desc}</div>
                                <div className="tactic-mods">
                                    {Object.entries(tactic.modifiers).map(([stat, val]) => (
                                        <span key={stat} className={val > 0 ? 'mod-positive' : 'mod-negative'}>
                                            {val > 0 ? '+' : ''}{val} {stat.toUpperCase()}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Squad Slots */}
                    <div className="squad-slots">
                        <h3 className="subsection-title">Squad Assignments</h3>
                        {SQUAD_SLOTS.map((slot, idx) => {
                            const assigned = selectedSquad[idx];
                            return (
                                <div key={slot.id} className="squad-slot">
                                    <div className="slot-number">{idx + 1}</div>
                                    <div className="slot-info">
                                        <div className="slot-name">{slot.name}</div>
                                        <div className="slot-role">{slot.role}</div>
                                    </div>
                                    <div className="slot-assigned">
                                        {assigned ? (
                                            <div className="slot-soldier">
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <Avatar seed={assigned.callsign} size={24} />
                                                    <span className="slot-soldier-name">{assigned.name}</span>
                                                </div>
                                                <span className="slot-stat-badge">
                                                    {assigned.stats[slot.stat.toLowerCase()]} {slot.stat.substring(0, 3).toUpperCase()}
                                                </span>
                                            </div>
                                        ) : (
                                            <div className="slot-empty">-- Empty Slot --</div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Execute Button */}
                    <div className="execute-section">
                        <button
                            disabled={!isReady}
                            onClick={runMission}
                            className={`btn-execute ${isReady ? 'ready' : 'disabled'}`}
                        >
                            {isReady ? ">>> EXECUTE MISSION <<<" : `ASSIGN FULL SQUAD (${filledSlots}/3)`}
                        </button>
                        {isReady && <div className="execute-hint">SYSTEMS GREEN. READY TO BREACH.</div>}
                    </div>
                </div>
            </div>
        );
    }

    // --- EXECUTION ---
    if (gameState === 'EXECUTION') {
        return (
            <div className="execution-screen">
                <div className="exec-header">
                    <div>
                        <h1 className="exec-title">LIVE FEED // {currentMission.title}</h1>
                        <div className="exec-tactic">PROTOCOL: {selectedTactic.name}</div>
                    </div>
                    <div className="exec-clock">{simulationTime}</div>
                </div>

                <div className="exec-log-container">
                    <div className="exec-grid-overlay"></div>
                    <div className="exec-log-inner">
                        {logs.map((log, i) => <LogEntry key={i} entry={log} />)}
                        <div ref={logsEndRef} />
                    </div>
                </div>

                {/* Mission Map */}
                <MissionMap phases={currentMission.phases} currentPhaseIndex={currentPhaseIndex} />

                <div className="exec-squad-strip">
                    {selectedSquad.map((s, idx) => (
                        <div key={idx} className="exec-squad-card">
                            {s && <Avatar seed={s.callsign} size={28} className="exec-avatar" />}
                            <div>
                                <div className="exec-squad-role">{SQUAD_SLOTS[idx].name}</div>
                                <div className="exec-squad-name">{s ? s.name : "EMPTY"}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Intervention Overlay */}
                {intervention && (
                    <InterventionOverlay
                        intervention={intervention}
                        squad={selectedSquad}
                        onChoice={handleInterventionChoice}
                    />
                )}
            </div>
        );
    }

    // --- DEBRIEF ---
    if (gameState === 'DEBRIEF') {
        const missionSquadMembers = roster.filter(r => selectedSquad.some(s => s && s.id === r.id));
        const recentlyKilled = deadOperators.filter(d => d.diedOnMission === missionCount);

        return (
            <div className="screen-scroll">
                <div className="debrief-container">
                    <div className="debrief-result">
                        <h1 className={`debrief-title ${missionResult === 'SUCCESS' ? 'success' : 'failure'}`}>
                            {missionResult}
                        </h1>
                        {missionResult === 'SUCCESS' && <div className="debrief-reward">+${missionReward}</div>}
                        <div className="title-divider"></div>
                    </div>

                    <div className="debrief-table">
                        <div className="debrief-table-header">
                            <span>Unit Performance</span>
                            <span>Status</span>
                        </div>
                        {missionSquadMembers.map(s => {
                            const slot = selectedSquad.findIndex(sq => sq && sq.id === s.id);
                            const role = SQUAD_SLOTS[slot];
                            const xpGain = missionResult === 'SUCCESS' ? Math.floor(200 * getXpMultiplier(s)) : 50;
                            return (
                                <div key={s.id} className="debrief-row">
                                    <div className="debrief-soldier">
                                        <div className="debrief-level">{s.level}</div>
                                        <div>
                                            <div className="debrief-name">{s.name}</div>
                                            <div className="debrief-meta">
                                                Role: {role.name} // FTG: {s.fatigue} // STR: {s.stress}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="debrief-status">
                                        <div className={s.stats.health <= 0 ? 'text-red-600 font-bold' : 'text-emerald-500'}>
                                            {s.stats.health <= 0 ? 'KIA' : `HP: ${s.stats.health}%`}
                                        </div>
                                        <div className="debrief-xp">+{s.stats.health > 0 ? xpGain : 0} XP</div>
                                    </div>
                                </div>
                            );
                        })}
                        {recentlyKilled.map(s => (
                            <div key={s.id} className="debrief-row kia">
                                <div className="debrief-soldier">
                                    <div className="debrief-level">†</div>
                                    <div>
                                        <div className="debrief-name">{s.name} '{s.callsign}'</div>
                                        <div className="debrief-meta">KILLED IN ACTION</div>
                                    </div>
                                </div>
                                <div className="debrief-status">
                                    <div className="text-red-600 font-bold">KIA</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="debrief-actions">
                        <button onClick={goToBase} className="btn-primary btn-lg">
                            RETURN TO BASE
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // --- BASE ---
    if (gameState === 'BASE') {
        const aliveRoster = roster.filter(s => s.stats.health > 0);
        const tooFewAlive = aliveRoster.length < 3;

        return (
            <div className="base-screen">
                <BudgetDisplay budget={budget} />

                <div className="base-header">
                    <h1 className="page-title">HEADQUARTERS</h1>
                    <p className="page-subtitle">Mission #{missionCount} Complete // {roster.length} Operators Active // {deadOperators.length} KIA</p>
                    <div className="rep-strip">
                        <span className="rep-label">REPUTATION</span>
                        <span className="rep-value">{reputation}</span>
                        <span className="rep-tier">{getRepTier(reputation).name.toUpperCase()}</span>
                    </div>
                </div>

                {tooFewAlive && (
                    <div className="alert-critical">
                        ⚠ CRITICAL: Less than 3 operators available. Recruit new members before deploying.
                    </div>
                )}

                {/* Tab Navigation */}
                <div className="base-tabs">
                    {['barracks', 'hospital', 'recruit', 'memorial'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => {
                                setBaseTab(tab);
                                if (tab === 'recruit' && recruitPool.length === 0) refreshRecruitPool();
                            }}
                            className={`base-tab ${baseTab === tab ? 'active' : ''}`}
                        >
                            {tab === 'barracks' && '🏠 '}
                            {tab === 'hospital' && '🏥 '}
                            {tab === 'recruit' && '👤 '}
                            {tab === 'memorial' && '✝ '}
                            {tab.toUpperCase()}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div className="base-content">
                    {/* BARRACKS */}
                    {baseTab === 'barracks' && (
                        <div className="base-grid">
                            {roster.map(s => {
                                const needsRest = s.fatigue > 0;
                                const restCost = s.fatigue * ECONOMY.restCostPerFatigue;
                                return (
                                    <div key={s.id} className="barracks-card">
                                        <SoldierCard soldier={s} compact={false} isDead={s.stats.health <= 0} />
                                        {needsRest && s.stats.health > 0 && (
                                            <button
                                                onClick={() => restOperator(s.id)}
                                                disabled={budget < restCost}
                                                className={`btn-action rest ${budget < restCost ? 'disabled' : ''}`}
                                            >
                                                REST -${restCost} (Remove Fatigue)
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* HOSPITAL */}
                    {baseTab === 'hospital' && (
                        <div className="base-grid">
                            {roster.filter(s => s.stats.health > 0).map(s => {
                                const needsHeal = s.stats.health < s.stats.maxHealth;
                                const healCost = needsHeal ? (s.stats.maxHealth - s.stats.health) * ECONOMY.healCostPerHP : 0;
                                const needsTherapy = s.stress > 0;
                                const therapyCost = s.stress * ECONOMY.therapyCostPerStress;

                                return (
                                    <div key={s.id} className="hospital-card">
                                        <div className="hospital-header">
                                            <div className="hospital-name">{s.name} '{s.callsign}'</div>
                                            <div className="hospital-level">LVL {s.level}</div>
                                        </div>

                                        <div className="hospital-stats">
                                            <StatBar label="HP" value={s.stats.health} max={s.stats.maxHealth} color={s.stats.health < 50 ? 'bar-red' : 'bar-green'} />
                                            <HumanTollBar label="STR" value={s.stress} color="bar-stress" />
                                        </div>

                                        <div className="hospital-actions">
                                            {needsHeal && (
                                                <button
                                                    onClick={() => healOperator(s.id)}
                                                    disabled={budget < healCost}
                                                    className={`btn-action heal ${budget < healCost ? 'disabled' : ''}`}
                                                >
                                                    HEAL -${healCost}
                                                </button>
                                            )}
                                            {needsTherapy && (
                                                <button
                                                    onClick={() => therapyOperator(s.id)}
                                                    disabled={budget < therapyCost}
                                                    className={`btn-action therapy ${budget < therapyCost ? 'disabled' : ''}`}
                                                >
                                                    THERAPY -${therapyCost}
                                                </button>
                                            )}
                                            {!needsHeal && !needsTherapy && (
                                                <div className="status-ok">✓ FIT FOR DUTY</div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* RECRUIT */}
                    {baseTab === 'recruit' && (
                        <div>
                            <div className="recruit-header">
                                <div>
                                    <h3 className="subsection-title">Available Recruits</h3>
                                    <p className="rep-recruit-info">
                                        Tier: {getRepTier(reputation).name} // Stats: {getRepTier(reputation).minStat}–{getRepTier(reputation).maxStat} // Max Traits: {getRepTier(reputation).maxTraits}
                                    </p>
                                </div>
                                <button onClick={refreshRecruitPool} className="btn-text">↻ REFRESH POOL</button>
                            </div>
                            <div className="base-grid">
                                {recruitPool.map(rookie => (
                                    <div key={rookie.id} className="recruit-card">
                                        <SoldierCard soldier={rookie} compact={false} />
                                        <button
                                            onClick={() => recruitOperator(rookie)}
                                            disabled={budget < rookie.cost}
                                            className={`btn-action recruit ${budget < rookie.cost ? 'disabled' : ''}`}
                                        >
                                            RECRUIT -${rookie.cost}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* MEMORIAL */}
                    {baseTab === 'memorial' && (
                        <div>
                            {deadOperators.length === 0 ? (
                                <div className="memorial-empty">No operators lost. Keep it that way.</div>
                            ) : (
                                <div className="base-grid">
                                    {deadOperators.map(s => (
                                        <div key={s.id} className="memorial-card">
                                            <div className="memorial-cross">✝</div>
                                            <div className="memorial-name">{s.name}</div>
                                            <div className="memorial-callsign">'{s.callsign}'</div>
                                            <div className="memorial-details">
                                                <div>Level {s.level} // Missions: {s.diedOnMission || '?'}</div>
                                                <div className="memorial-cause">{s.causeOfDeath || 'Killed in Action'}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Deploy Button */}
                <div className="base-deploy">
                    <button
                        onClick={goToNextMission}
                        disabled={tooFewAlive}
                        className={`btn-primary btn-lg ${tooFewAlive ? 'disabled' : ''}`}
                    >
                        {tooFewAlive ? 'NEED 3+ OPERATORS TO DEPLOY' : '>>> DEPLOY TO NEXT MISSION <<<'}
                    </button>
                </div>
            </div>
        );
    }

    return null;
};

// --- APP WRAPPER ---
const App = () => {
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetch('data.json')
            .then(r => {
                if (!r.ok) throw new Error("Failed to load core data.");
                return r.json();
            })
            .then(data => {
                TACTICS = data.TACTICS;
                SQUAD_SLOTS = data.SQUAD_SLOTS;
                INITIAL_ROSTER = data.INITIAL_ROSTER;
                MISSIONS = data.MISSIONS;
                TRAITS = data.TRAITS || {};
                ECONOMY = data.ECONOMY || {};
                REPUTATION = data.REPUTATION || {};
                RECRUIT_NAMES = data.RECRUIT_NAMES || [];
                RECRUIT_CALLSIGNS = data.RECRUIT_CALLSIGNS || [];
                setLoaded(true);
            })
            .catch(e => setError(e.message));
    }, []);

    if (error) return (
        <div className="fatal-error">
            FATAL ERROR: {error} <br />
            (Please ensure you are serving this file via a web server to support JSON fetching)
        </div>
    );

    if (!loaded) return (
        <div className="loading-screen">
            Pinging HQ... (Loading Assets)
        </div>
    );

    return <Game />;
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
