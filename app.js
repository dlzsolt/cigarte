const STORAGE_KEY = 'smokeless_data';
const SPACING_MS = 2 * 60 * 60 * 1000; // 2 hours in ms

const els = {
    smokeBtn: document.getElementById('smoke-btn'),
    count: document.getElementById('count'),
    remaining: document.getElementById('remaining'),
    timerText: document.getElementById('timer-text'),
    countdown: document.getElementById('countdown'),
    resetBtn: document.getElementById('reset-btn'),
    restDayToggle: document.getElementById('rest-day-toggle'),
    packCount: document.getElementById('pack-count'),
    buyPackBtn: document.getElementById('buy-pack-btn'),
    packPriceInput: document.getElementById('pack-price'),
    savingsDisplay: document.getElementById('savings-display')
};

let state = {
    lastSmoked: 0,
    count: 0,
    date: new Date().toDateString(),
    isRestDay: false,
    cigsInPack: 20,
    packPrice: 0
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
                isRestDay: false, // Default to work day
                cigsInPack: parsed.cigsInPack !== undefined ? parsed.cigsInPack : 20,
                packPrice: parsed.packPrice || 0
            };
            saveState();
        } else {
            state = { ...state, ...parsed }; // Merge to ensure new fields exist
            if (state.cigsInPack === undefined) state.cigsInPack = 20;
            if (state.packPrice === undefined) state.packPrice = 0;
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
    els.packCount.textContent = state.cigsInPack;
    
    // Work Day (9-10h free) = ~5 cigs
    // Rest Day (15h free) = ~8 cigs
    const maxAllowed = state.isRestDay ? 8 : 5;
    
    els.remaining.textContent = Math.max(0, maxAllowed - state.count);

    // Update Price Input
    els.packPriceInput.value = state.packPrice || '';
    updateSavingsDisplay();

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

function updateSavingsDisplay() {
    const price = parseFloat(state.packPrice);
    if (!price || price <= 0) {
        els.savingsDisplay.innerHTML = '<p>Enter price to see savings.</p>';
        return;
    }

    // Assumptions:
    // Heavy smoker baseline: 20 cigs/day (1 pack)
    // Current plan: 5 cigs/day (work) or 8 cigs/day (rest). Avg ~6/day.
    // 6 cigs/day = 1 pack every ~3.3 days.
    
    const costPerDayBaseline = price; // 1 pack/day
    const costPerDay2Days = price / 2;
    const costPerDay3Days = price / 3;
    const costPerDayPlan = price / (20 / 5); // 1 pack every 4 days (using work day limit)

    const monthlyBaseline = costPerDayBaseline * 30;
    const monthly2Days = costPerDay2Days * 30;
    const monthly3Days = costPerDay3Days * 30;
    const monthlyPlan = costPerDayPlan * 30;

    els.savingsDisplay.innerHTML = `
        <ul style="margin-top: 10px;">
            <li><strong>1 pack/day:</strong> ${formatMoney(monthlyBaseline)} / mo</li>
            <li><strong>1 pack/2 days:</strong> ${formatMoney(monthly2Days)} / mo <span style="color:green">(-${formatMoney(monthlyBaseline - monthly2Days)})</span></li>
            <li><strong>1 pack/3 days:</strong> ${formatMoney(monthly3Days)} / mo <span style="color:green">(-${formatMoney(monthlyBaseline - monthly3Days)})</span></li>
            <li style="margin-top:5px; border-top:1px solid #ccc; padding-top:5px;">
                <strong>Your Plan (5/day):</strong> ${formatMoney(monthlyPlan)} / mo <br>
                <span style="color:var(--primary); font-weight:bold;">Potential Savings: ${formatMoney(monthlyBaseline - monthlyPlan)} / mo</span>
            </li>
        </ul>
    `;
}

function formatMoney(amount) {
    return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

    if (state.cigsInPack <= 0) {
        if(!confirm('Pack is empty! Still smoke? (Will count as negative/borrowed)')) return;
    }

    state.count++;
    state.cigsInPack--;
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

function buyPack() {
    if(confirm('Refill pack to 20 cigarettes?')) {
        state.cigsInPack = 20;
        saveState();
        updateUI();
    }
}

function updatePrice() {
    state.packPrice = els.packPriceInput.value;
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
els.buyPackBtn.addEventListener('click', buyPack);
els.packPriceInput.addEventListener('input', updatePrice);