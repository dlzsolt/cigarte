const STORAGE_KEY = 'smokeless_data';
const SPACING_MS = 2 * 60 * 60 * 1000; // 2 hours in ms

const els = {
    smokeBtn: document.getElementById('smoke-btn'),
    count: document.getElementById('count'),
    remaining: document.getElementById('remaining'),
    timerText: document.getElementById('timer-text'),
    countdown: document.getElementById('countdown'),
    resetBtn: document.getElementById('reset-btn'),
    restDayToggle: document.getElementById('rest-day-toggle')
};

let state = {
    lastSmoked: 0,
    count: 0,
    date: new Date().toDateString(),
    isRestDay: false
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
                date: new Date().toDateString(),
                isRestDay: false // Default to work day
            };
            saveState();
        } else {
            state = { ...state, ...parsed }; // Merge to ensure new fields exist
        }
    }
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function updateUI() {
    // Update Rest Day Toggle
    els.restDayToggle.checked = state.isRestDay;

    els.count.textContent = state.count;
    
    // Work Day (9-10h free) = ~5 cigs
    // Rest Day (15h free) = ~8 cigs
    const maxAllowed = state.isRestDay ? 8 : 5;
    
    els.remaining.textContent = Math.max(0, maxAllowed - state.count);

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

function toggleRestDay() {
    state.isRestDay = els.restDayToggle.checked;
    saveState();
    updateUI();
}

// Init
loadState();
updateUI();
setInterval(updateUI, 1000); // Update timer every second

els.smokeBtn.addEventListener('click', smoke);
els.resetBtn.addEventListener('click', reset);
els.restDayToggle.addEventListener('change', toggleRestDay);