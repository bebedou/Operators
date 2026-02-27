# Squad Leader: Protocol

A text-based tactical RPG where you command a SWAT/Spec-Ops squad through high-risk operations. Built with React 18, vanilla CSS, and zero build tools.

## Quick Start

**Requirement:** Node.js (for the static file server)

```bash
# From the project root
npx -y serve .
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

> **Note:** A web server is required because the game loads `data.json` via `fetch()`. Opening `index.html` directly from the filesystem will not work.

## Gameplay Overview

1. **Briefing** — Choose a mission from available operations (scaled by difficulty and reputation)
2. **Planning** — Assign 3 operators to squad slots (Point, Lead, Rear Guard) and select a tactical approach
3. **Execution** — Watch the mission unfold in real-time with stat checks, interventions, and combat. Control playback speed or pause
4. **Debrief** — Review results: XP gains, casualties, reputation changes
5. **Base** — Heal, rest, and recruit operators between missions

## Core Systems

- **Reputation** — 5 tiers (Unknown → Legendary) influence recruit quality, mission choices, and stat ranges
- **Traits** — Operators have unique traits (e.g., MEDIC, NERVOUS, IRONCLAD) that modify stats, damage, stress, and XP
- **Fatigue & Stress** — Accumulate over missions, penalizing performance. Manage at base via rest and therapy
- **Interventions** — Mid-mission decision points with a 10-second timer. Your choice affects the outcome
- **Procedural Map** — Visual phase tracker during execution (BREACH → CLEAR → CONTACT → BOSS)
- **Avatars** — Each operator gets a unique pixel-art avatar via DiceBear API

## Project Structure

```
Operators/
├── index.html          # Entry point — loads React, Babel, CSS, and all JS files
├── styles.css          # Complete styling (dark tactical theme, animations, map, avatars)
├── data.json           # Game data: missions, tactics, traits, economy, reputation, roster
├── README.md
└── js/
    ├── utils.js        # Utility functions (roll, clamp, pickRandom, generateId)
    ├── persistence.js  # localStorage save/load/clear
    ├── traits.js       # Trait system (stat mods, damage, XP, stress, team bonuses)
    ├── reputation.js   # Reputation tiers + DiceBear avatar URL helper
    ├── recruitment.js  # Procedural recruit generator (reputation-aware)
    ├── components.js   # React components (Avatar, MissionMap, SoldierCard, StatBar, etc.)
    ├── game.js         # Main Game component (state, logic, mission execution, rendering)
    └── app.js          # App wrapper (data loading) + ReactDOM mount
```

## Tech Stack

- **React 18** via CDN (no bundler required)
- **Babel Standalone** for JSX transformation in the browser
- **Vanilla CSS** with CSS custom properties
- **DiceBear API** for procedural pixel-art avatars
- **localStorage** for game persistence
