// ===== SAVE / LOAD =====
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
