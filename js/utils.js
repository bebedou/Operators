// ===== UTILITY FUNCTIONS =====
const roll = (max = 100) => Math.floor(Math.random() * max) + 1;
const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
const generateId = () => Date.now() + Math.floor(Math.random() * 10000);
