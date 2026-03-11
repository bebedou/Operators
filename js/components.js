// ===== REUSABLE UI COMPONENTS =====
// Depends on: React (global), TRAITS, SQUAD_SLOTS (globals), getAvatarUrl (reputation.js)

const { useState, useEffect, useRef, useCallback } = React;

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

// --- MISSION MAP ---
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

// --- STAT BARS ---
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

// --- SOLDIER CARD ---
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

// --- LOG ENTRY ---
const LogEntry = ({ entry }) => {
    const typeClass = `log-type-${entry.type || 'info'}`;
    return (
        <div className={`log-entry ${typeClass}`}>
            <span className="log-time">[{entry.time}]</span>
            <span>{entry.text}</span>
        </div>
    );
};

// --- BUDGET ---
const BudgetDisplay = ({ budget }) => (
    <div className="budget-hud">
        <span className="budget-label">BUDGET</span>
        <span className={`budget-amount ${budget < 1000 ? 'low' : ''}`}>${budget.toLocaleString()}</span>
    </div>
);

// --- INTERVENTION OVERLAY ---
const InterventionOverlay = ({ intervention, squad, onChoice }) => {
    const [timeLeft, setTimeLeft] = useState(100);

    useEffect(() => {
        const interval = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 0) {
                    clearInterval(interval);
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
