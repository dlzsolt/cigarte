const STORAGE_KEY = 'smokeless_data';
const SPACING_MS = 2 * 60 * 60 * 1000; // 2 hours in ms

const els = {
    smokeBtn: document.getElementById('smoke-btn'),
    count: document.getElementById('count'),
    remaining: document.getElementById('remaining'),
    timerText: document.getElementById('timer-text'),
    countdown: document.getElementById('countdown'),
    resetBtn: document.getElementById('reset-btn')
};

let state = {
    lastSmoked: 0,
    count: 0,
    date: new Date().toDateString()
};

function loadState() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        const parsed = JSON.parse(stored);
        // Reset count if new day
        if (parsed.date !== new Date().toDateString()) {
            state = {
                lastSmoked: parsed.lastSmoked, // Keep last smoked time for spacing
                count: 0,
                date: new Date().toDateString()
            };
            saveState();
        } else {
            state = parsed;
        }
    }
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function updateUI() {
    els.count.textContent = state.count;
    // Assuming 5 is the target limit
    els.remaining.textContent = Math.max(0, 5 - state.count);

    const now = Date.now();
    const nextAllowed = state.lastSmoked + SPACING_MS;
    const diff = nextAllowed - now;

    if (diff <= 0) {
        els.smokeBtn.disabled = false;
        els.smokeBtn.textContent = '🚬 Smoke One';
        els.timerText.textContent = 'You are allowed to smoke now.';
        els.countdown.textContent = '00:00:00';
        els.countdown.style.color = 'var(--primary)';
    } else {
        els.smokeBtn.disabled = true;
        els.smokeBtn.textContent = 'Wait...';
        els.timerText.textContent = 'Next cigarette allowed in:';
        els.countdown.textContent = formatTime(diff);
        els.countdown.style.color = 'var(--danger)';
    }
}

function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function smoke() {
    const now = Date.now();
    // Double check constraints
    if (now < state.lastSmoked + SPACING_MS) return;

    state.count++;
    state.lastSmoked = now;
    state.date = new Date().toDateString(); // Ensure date is today
    saveState();
    updateUI();
}

function reset() {
    if(confirm('Reset daily count?')) {
        state.count = 0;
        state.date = new Date().toDateString();
        saveState();
        updateUI();
    }
}

// Init
loadState();
updateUI();
setInterval(updateUI, 1000); // Update timer every second

els.smokeBtn.addEventListener('click', smoke);
els.resetBtn.addEventListener('click', reset);