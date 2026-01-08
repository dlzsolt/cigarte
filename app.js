const STORAGE_KEY = 'smokeless_data';
const SUPABASE_CONFIG_KEY = 'smokeless_supabase_config';
const SPACING_MS = 2 * 60 * 60 * 1000; // 2 hours in ms

// Default Credentials (hardcoded for convenience)
const DEFAULT_SB_URL = 'https://lmsolgyrlsevapbimyad.supabase.co';
const DEFAULT_SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxtc29sZ3lybHNldmFwYmlteWFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4NjkyMTQsImV4cCI6MjA4MzQ0NTIxNH0.vu47GqcfPzf5cpHWvlzT9weDs1HlCSZK7fcyngieeNE';

const els = {
    smokeBtn: document.getElementById('smoke-btn'),
    // Timer Controls
    timerControls: document.getElementById('timer-controls'),
    reduceTimeBtn: document.getElementById('reduce-time-btn'),
    slipUpBtn: document.getElementById('slip-up-btn'),
    // Stats
    count: document.getElementById('count'),
    remaining: document.getElementById('remaining'),
    timerText: document.getElementById('timer-text'),
    countdown: document.getElementById('countdown'),
    resetBtn: document.getElementById('reset-btn'),
    restDayToggle: document.getElementById('rest-day-toggle'),
    packCount: document.getElementById('pack-count'),
    packCountDisplay: document.getElementById('pack-count-display'),
    buyPackBtn: document.getElementById('buy-pack-btn'),
    editPackBtn: document.getElementById('edit-pack-btn'),
    packPriceInput: document.getElementById('pack-price'),
    savingsDisplay: document.getElementById('savings-display'),
    // Health & Streak
    streakBadge: document.getElementById('streak-badge'),
    healthWidget: document.getElementById('health-widget'),
    healthStatus: document.querySelector('.health-status'),
    healthBar: document.getElementById('health-progress-bar'),
    healthDetail: document.getElementById('health-detail'),
    // Lifetime Stats
    totalSaved: document.getElementById('total-saved'),
    lifeRegained: document.getElementById('life-regained'),
    // Achievements
    achievementsGrid: document.getElementById('achievements-grid'),
    // SOS
    sosBtn: document.getElementById('sos-btn'),
    sosModal: document.getElementById('sos-modal'),
    closeSosBtn: document.getElementById('close-sos-btn'),
    closeSosX: document.getElementById('close-sos-x'),
    breathText: document.getElementById('breath-text'),
    distractionText: document.getElementById('distraction-text'),
    newDistractionBtn: document.getElementById('new-distraction-btn'),
    // Charts
    weeklyChart: document.getElementById('weekly-chart'),
    // Preferences
    prefPackSize: document.getElementById('pref-pack-size'),
    workStart: document.getElementById('work-start'),
    workEnd: document.getElementById('work-end'),
    workBreak: document.getElementById('work-break'),
    savePrefsBtn: document.getElementById('save-prefs-btn'),
    // Notifications
    enableNotifyBtn: document.getElementById('enable-notify-btn'),
    testNotifyBtn: document.getElementById('test-notify-btn'),
    notifyStatus: document.getElementById('notify-status'),
    // Sync UI
    sbUrl: document.getElementById('sb-url'),
    sbKey: document.getElementById('sb-key'),
    saveConfigBtn: document.getElementById('save-config-btn'),
    syncSetupForm: document.getElementById('sync-setup-form'),
    syncAuthForm: document.getElementById('sync-auth-form'),
    authEmail: document.getElementById('auth-email'),
    authPassword: document.getElementById('auth-password'),
    loginBtn: document.getElementById('login-btn'),
    signupBtn: document.getElementById('signup-btn'),
    authInputs: document.getElementById('auth-inputs'),
    userInfo: document.getElementById('user-info'),
    userEmailDisplay: document.getElementById('user-email-display'),
    logoutBtn: document.getElementById('logout-btn'),
    forceSyncBtn: document.getElementById('force-sync-btn'),
    testModeToggle: document.getElementById('test-mode-toggle')
    // Audio (Removed HTML element ref, using AudioContext)
};

// --- AUDIO CONTEXT SETUP ---
 const AudioContext = window.AudioContext || window.webkitAudioContext;
 let audioCtx;
 let notificationBuffer;
 let silentOscillator; // Keep-alive oscillator
 
 function initAudio() {
     if (!audioCtx) {
         audioCtx = new AudioContext();
     }
     if (audioCtx.state === 'suspended') {
         audioCtx.resume();
     }
     
     // Start Silent Loop (Keep-Alive)
     if (!silentOscillator) {
         try {
             // Create a nearly silent oscillator to keep iOS audio thread active
             silentOscillator = audioCtx.createOscillator();
             const gainNode = audioCtx.createGain();
             
             silentOscillator.type = 'sine';
             silentOscillator.frequency.value = 60; // Low frequency
             
             // Extremely low volume (not 0, as iOS might optimize that away)
             gainNode.gain.value = 0.0001; 
             
             silentOscillator.connect(gainNode);
             gainNode.connect(audioCtx.destination);
             silentOscillator.start();
             console.log('Silent keep-alive audio started');
         } catch (e) {
             console.error('Keep-alive failed:', e);
         }
     }
     
     // Load Tri-tone style sound (replace old buffer)
     if (!notificationBuffer) {
         // Using a Tri-tone style sound URL
         fetch('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3') // Placeholder: We will use the same for now, but ensure it plays
             .then(response => response.arrayBuffer())
             .then(arrayBuffer => audioCtx.decodeAudioData(arrayBuffer))
             .then(audioBuffer => {
                 notificationBuffer = audioBuffer;
                 console.log('Notification sound loaded');
             })
             .catch(e => console.error('Audio load error:', e));
     }
 }
 
 function playSound() {
     if (!audioCtx || !notificationBuffer) {
         initAudio(); // Try to init if missing
         return; 
     }
     
     if (audioCtx.state === 'suspended') audioCtx.resume();
     
     // Create source
     const source = audioCtx.createBufferSource();
     source.buffer = notificationBuffer;
     source.connect(audioCtx.destination);
     source.start(0);
 }

let state = {
    lastSmoked: 0,
    count: 0,
    date: new Date().toDateString(),
    isRestDay: false,
    cigsInPack: 20,
    packPrice: 0,
    history: [], // { date: string, count: number }
    // New Preferences
    packSize: 20,
    workSchedule: {
        start: '',
        end: '',
        break: ''
    }
};

let supabaseClient = null;
let currentUser = null;
let notificationScheduled = false;
let isTestMode = false;
let titleInterval = null; // For title flashing

// --- STATE MANAGEMENT ---

function loadState() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        const parsed = JSON.parse(stored);
        const today = new Date().toDateString();

        // Check if day changed
        if (parsed.date !== today) {
            // Archive previous day if not already in history
            const history = Array.isArray(parsed.history) ? parsed.history : [];
            const lastEntry = history.length > 0 ? history[history.length - 1] : null;
            
            // Only push if the date is different from the last saved entry
            if (!lastEntry || lastEntry.date !== parsed.date) {
                history.push({ date: parsed.date, count: parsed.count });
            }
            
            // Limit history to last 30 days
            if (history.length > 30) history.shift();

            state = {
                lastSmoked: parsed.lastSmoked, // Keep timer info
                count: 0,
                date: today,
                isRestDay: false,
                cigsInPack: parsed.cigsInPack !== undefined ? parsed.cigsInPack : 20,
                packPrice: parsed.packPrice || 0,
                history: history,
                packSize: parsed.packSize || 20,
                workSchedule: parsed.workSchedule || { start: '', end: '', break: '' }
            };
            saveState();
        } else {
            // Same day, just load
            state = { ...state, ...parsed };
            if (!state.history) state.history = [];
            if (state.cigsInPack === undefined) state.cigsInPack = 20;
            if (state.packPrice === undefined) state.packPrice = 0;
            if (state.packSize === undefined) state.packSize = 20;
            if (!state.workSchedule) state.workSchedule = { start: '', end: '', break: '' };
        }
    }
}

function saveState(shouldSync = true) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (shouldSync) syncData(); // Trigger cloud sync if connected
}

// --- UI UPDATES ---

function updateUI() {
    els.restDayToggle.checked = state.isRestDay;
    els.count.textContent = state.count;
    els.packCount.textContent = state.cigsInPack;
    if(els.packCountDisplay) els.packCountDisplay.textContent = state.cigsInPack;
    
    // Preferences Inputs
    els.prefPackSize.value = state.packSize;
    els.workStart.value = state.workSchedule.start;
    els.workEnd.value = state.workSchedule.end;
    els.workBreak.value = state.workSchedule.break;

    const maxAllowed = state.isRestDay ? 8 : 5;
    els.remaining.textContent = Math.max(0, maxAllowed - state.count);

    els.packPriceInput.value = state.packPrice || '';
    updateSavingsDisplay();
    renderChart();
    updateStreak();
    updateHealthWidget();
    updateLifetimeStats();
    renderAchievements();

    const now = Date.now();
    const currentSpacing = isTestMode ? 10000 : SPACING_MS; // 10 seconds in test mode
    const nextAllowed = state.lastSmoked + currentSpacing;
    
    // Check for Break Time Override
    let isBreakTime = false;
    if (state.workSchedule.break && !state.isRestDay) {
        const breakDate = new Date();
        const [bH, bM] = state.workSchedule.break.split(':');
        breakDate.setHours(bH, bM, 0, 0);
        
        // Break window: +/- 15 mins from break time
        const diffBreak = Math.abs(now - breakDate.getTime());
        if (diffBreak < 15 * 60 * 1000) { // 15 min window
            isBreakTime = true;
        }
    }

    const diff = nextAllowed - now;

    if (diff <= 0 || isBreakTime) {
        els.smokeBtn.disabled = false;
        els.smokeBtn.textContent = isBreakTime ? '☕ Break Time (Allowed)' : '🚬 Smoke One';
        els.timerText.textContent = isBreakTime ? 'Enjoy your break.' : 'You are allowed to smoke now.';
        els.countdown.textContent = '00:00:00';
        els.countdown.style.color = 'var(--primary)';
        
        // Start Title Flashing & Badge
        startTitleFlashing();
        if ('setAppBadge' in navigator) {
            navigator.setAppBadge(1).catch(e => console.log('Badge error', e));
        }
        
        // Reset notification flag when timer is done
        if (notificationScheduled && diff <= 0) {
            notificationScheduled = false;
            sendNotification();
        }
    } else {
        els.smokeBtn.disabled = true;
        els.smokeBtn.textContent = 'Wait...';
        els.timerText.textContent = 'Next cigarette allowed in:';
        els.countdown.textContent = formatTime(diff);
        els.countdown.style.color = 'var(--danger)';
        
        // Stop Flashing & Clear Badge
        stopTitleFlashing();
        if ('clearAppBadge' in navigator) {
            navigator.clearAppBadge().catch(e => console.log('Badge clear error', e));
        }
        
        // Schedule notification logic (handled by polling in setInterval)
        notificationScheduled = true;
    }
}

// --- TITLE FLASHING ---
function startTitleFlashing() {
    if (titleInterval) return; // Already running
    let flashState = false;
    titleInterval = setInterval(() => {
        document.title = flashState ? "🔔 SMOKE NOW" : "Smoke Less";
        flashState = !flashState;
    }, 1000);
}

function stopTitleFlashing() {
    if (titleInterval) {
        clearInterval(titleInterval);
        titleInterval = null;
        document.title = "Smoke Less";
    }
}

function updateSavingsDisplay() {
    const price = parseFloat(state.packPrice);
    if (!price || price <= 0) {
        els.savingsDisplay.innerHTML = '<p>Enter price to see savings.</p>';
        return;
    }
    const costPerDayBaseline = price;
    const costPerDay2Days = price / 2;
    const costPerDay3Days = price / 3;
    const costPerDayPlan = price / (state.packSize / 5); // Use custom pack size

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

function renderChart() {
    if (!els.weeklyChart) return;
    
    // Get last 7 entries from history + current day
    const historyData = [...state.history];
    // Add current day temp view
    historyData.push({ date: 'Today', count: state.count });
    
    // Slice last 7
    const data = historyData.slice(-7);

    if (data.length === 0) {
        els.weeklyChart.innerHTML = '<p style="text-align:center; color:#999; font-size:0.8rem; width:100%;">Start tracking today!</p>';
        return;
    }

    // Find max for scaling
    const maxVal = Math.max(...data.map(d => d.count), 10); // Min max is 10 for visuals

    let html = '';
    data.forEach(d => {
        const heightPct = Math.min((d.count / maxVal) * 100, 100);
        // Shorten date format: "Mon", "Tue" or "Today"
        let label = d.date === 'Today' ? 'Today' : new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' });
        
        // Color logic: Green if <= 5, Red if > 8, Yellow in between
        let color = 'var(--primary)';
        if (d.count > 8) color = 'var(--danger)';
        else if (d.count > 5) color = '#FFC107'; // Amber

        html += `
            <div class="chart-bar-group">
                <span class="chart-value">${d.count}</span>
                <div class="chart-bar" style="height: ${heightPct}%; background-color: ${color};"></div>
                <span class="chart-label">${label}</span>
            </div>
        `;
    });
    
    els.weeklyChart.innerHTML = html;
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

// --- LIFETIME STATS ---
function updateLifetimeStats() {
    if (!els.totalSaved || !els.lifeRegained) return;

    // Calculate total avoided (hypothetically, if user smoked 20/day before)
    // This is rough estimation: (Days using app * 20) - Total Smoked
    // We need total smoked count across all history
    let totalSmoked = state.history.reduce((acc, curr) => acc + curr.count, 0) + state.count;
    const daysActive = state.history.length + 1; // +1 for today
    
    // Assume baseline was 20 cigs/day (or user setting could be better, but we use 20 for now)
    const baselineDaily = 20;
    const totalAvoided = Math.max(0, (daysActive * baselineDaily) - totalSmoked);
    
    // Money Saved
    const pricePerCig = (parseFloat(state.packPrice) || 0) / (state.packSize || 20);
    const moneySaved = totalAvoided * pricePerCig;
    
    // Life Regained (11 mins per cig avoided)
    const minutesRegained = totalAvoided * 11;
    const hoursRegained = (minutesRegained / 60).toFixed(1);
    
    els.totalSaved.textContent = formatMoney(moneySaved);
    els.totalSaved.style.color = '#4CAF50';
    els.lifeRegained.textContent = `${hoursRegained}h`;
    els.lifeRegained.style.color = '#2196F3';
}

// --- ACHIEVEMENTS ---
const BADGES = [
    { id: 'start', name: 'First Step', icon: '🌱', condition: (s) => s.history.length >= 1 },
    { id: 'week', name: '1 Week', icon: '🗓️', condition: (s) => s.history.length >= 7 },
    { id: 'streak3', name: '3 Day Streak', icon: '🔥', condition: (s) => getStreak(s) >= 3 },
    { id: 'streak7', name: '7 Day Streak', icon: '🦁', condition: (s) => getStreak(s) >= 7 },
    { id: 'saved10', name: 'Saved $10', icon: '💰', condition: (s) => getMoneySaved(s) >= 10 },
    { id: 'saved50', name: 'Saved $50', icon: '💎', condition: (s) => getMoneySaved(s) >= 50 },
    { id: 'avoided100', name: 'Avoided 100', icon: '🛡️', condition: (s) => getAvoided(s) >= 100 }
];

function renderAchievements() {
    if (!els.achievementsGrid) return;
    
    let html = '';
    BADGES.forEach(badge => {
        const isUnlocked = badge.condition(state);
        html += `
            <div class="badge ${isUnlocked ? 'unlocked' : ''}">
                <div class="badge-icon">${badge.icon}</div>
                <div class="badge-name">${badge.name}</div>
            </div>
        `;
    });
    els.achievementsGrid.innerHTML = html;
}

// Helpers for achievements
function getStreak(s) {
    let streak = 0;
    const history = [...s.history].reverse();
    for (const day of history) {
        if (day.count <= 8) streak++;
        else break;
    }
    return streak;
}

function getAvoided(s) {
    let totalSmoked = s.history.reduce((acc, curr) => acc + curr.count, 0) + s.count;
    const daysActive = s.history.length + 1;
    return Math.max(0, (daysActive * 20) - totalSmoked);
}

function getMoneySaved(s) {
    const avoided = getAvoided(s);
    const pricePerCig = (parseFloat(s.packPrice) || 0) / (s.packSize || 20);
    return avoided * pricePerCig;
}

// --- SOS PANIC BUTTON ---
const DISTRACTIONS = [
    "Drink a large glass of water slowly.",
    "Do 10 pushups right now.",
    "Call a friend or family member.",
    "Chew a piece of gum.",
    "Go for a 5-minute walk.",
    "List 5 reasons why you want to quit.",
    "Brush your teeth.",
    "Eat a piece of fruit."
];

function openSos() {
    els.sosModal.classList.remove('hidden');
    showNewDistraction();
}

function closeSos() {
    els.sosModal.classList.add('hidden');
}

function showNewDistraction() {
    const random = DISTRACTIONS[Math.floor(Math.random() * DISTRACTIONS.length)];
    els.distractionText.textContent = random;
}

// --- GAMIFICATION & HEALTH ---

function updateStreak() {
    if (!els.streakBadge) return;
    
    // Calculate streak: consecutive days in history where count <= dailyLimit (e.g., 5 or 8)
    // Note: This logic assumes 'history' is ordered by date.
    let streak = 0;
    const history = [...state.history].reverse(); // Newest first
    
    // Check yesterday/today continuity is complex with simple dates.
    // Simplification: Just count how many "good days" are at the end of the history array.
    
    for (const day of history) {
        // Define limit based on Rest Day preference? Or strict 5?
        // Let's say strict 5 for "Smoke Less" streak, or 8 if rest day was logged (but we don't store isRestDay per history item yet).
        // Default to 8 to be encouraging.
        if (day.count <= 8) {
            streak++;
        } else {
            break; // Streak broken
        }
    }
    
    // Add today if valid so far
    if (state.count <= 8) {
        // Only count today if it's the end of the day? 
        // No, let's just show "Current Streak" including past days. 
        // If today isn't over, we don't increment streak yet unless we want to be optimistic.
        // Let's stick to completed days from history.
    }

    if (streak > 0) {
        els.streakBadge.textContent = `🔥 ${streak} Day Streak`;
        els.streakBadge.classList.remove('hidden');
    } else {
        els.streakBadge.classList.add('hidden');
    }
}

function updateHealthWidget() {
    if (!els.healthStatus) return;

    const now = Date.now();
    const elapsed = now - state.lastSmoked;
    const minutes = elapsed / 1000 / 60;
    
    let status = "";
    let detail = "";
    let progress = 0;
    
    if (minutes < 20) {
        status = "⚠️ Pulse Recovering";
        detail = "In 20 mins, your heart rate will drop to normal.";
        progress = (minutes / 20) * 100;
    } else if (minutes < 120) {
        status = "❤️ Heart Rate Normal";
        detail = "Blood pressure is returning to normal levels.";
        progress = ((minutes - 20) / 100) * 100;
    } else if (minutes < 480) { // 8 hours
        status = "🌬️ Oxygen Levels Rising";
        detail = "Carbon monoxide is leaving your blood.";
        progress = ((minutes - 120) / 360) * 100;
    } else {
        status = "✅ Lungs Clearing";
        detail = "Great job! Your risk of heart attack is beginning to drop.";
        progress = 100;
    }
    
    els.healthStatus.textContent = status;
    els.healthDetail.textContent = detail;
    els.healthBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
}

// --- ACTIONS ---

function smoke() {
    const now = Date.now();
    
    // Check break time
    let isBreakTime = false;
    if (state.workSchedule.break && !state.isRestDay) {
        const breakDate = new Date();
        const [bH, bM] = state.workSchedule.break.split(':');
        breakDate.setHours(bH, bM, 0, 0);
        const diffBreak = Math.abs(now - breakDate.getTime());
        if (diffBreak < 15 * 60 * 1000) {
            isBreakTime = true;
        }
    }

    if (!isBreakTime && now < state.lastSmoked + SPACING_MS) return;

    if (state.cigsInPack <= 0) {
        if(!confirm('Pack is empty! Still smoke?')) return;
    }

    state.count++;
    state.cigsInPack--;
    state.lastSmoked = now;
    state.date = new Date().toDateString();
    saveState();
    updateUI();
    
    // Schedule notification for 2 hours later
    scheduleNotification();
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
    if(confirm(`Refill pack to ${state.packSize} cigarettes?`)) {
        state.cigsInPack = state.packSize;
        saveState();
        updateUI();
    }
}

function editPack() {
    const current = state.cigsInPack;
    const input = prompt(`Manually set cigarettes in pack (0-${state.packSize}):`, current);
    
    if (input !== null) {
        const val = parseInt(input);
        if (!isNaN(val) && val >= 0 && val <= 100) {
            state.cigsInPack = val;
            saveState();
            updateUI();
        } else {
            alert('Please enter a valid number.');
        }
    }
}

function updatePrice() {
    state.packPrice = els.packPriceInput.value;
    saveState();
    updateUI();
}

function savePreferences() {
    state.packSize = parseInt(els.prefPackSize.value) || 20;
    state.workSchedule = {
        start: els.workStart.value,
        end: els.workEnd.value,
        break: els.workBreak.value
    };
    saveState();
    updateUI();
    alert('Preferences saved!');
}

// --- NOTIFICATIONS ---

const NOTIFICATION_MESSAGES = [
    "You are allowed to smoke now.",
    "Time for a break? Timer is up.",
    "You're doing great! +2 Hours added to your streak.",
    "Discipline is freedom. You are in control.",
    "Pocket Check: You are saving money by waiting!",
    "Health Tip: Your heart rate recovers in between smokes.",
    "Stay strong. You decide when to smoke, not the addiction.",
    "Level Up! Another session completed.",
    "Breathe in... You can smoke now if you choose.",
    "Remember your goal: Smoke Less, Live More."
];

function getDynamicMessage() {
    const randomIndex = Math.floor(Math.random() * NOTIFICATION_MESSAGES.length);
    return NOTIFICATION_MESSAGES[randomIndex];
}

function requestNotificationPermission() {
    if (!('Notification' in window)) {
        alert('This browser does not support notifications.');
        return;
    }
    
    Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
            els.notifyStatus.textContent = '✅ Notifications enabled';
            els.notifyStatus.style.color = 'var(--primary)';
            new Notification('Smoke Less', { body: 'Notifications enabled! We will tell you when you can smoke.' });
        } else {
            els.notifyStatus.textContent = '❌ Notifications denied';
            els.notifyStatus.style.color = 'var(--danger)';
        }
    });
}

function scheduleNotification() {
    if (Notification.permission !== 'granted') return;
    
    const currentSpacing = isTestMode ? 10000 : SPACING_MS;
    
    // Calculate next time
    const nextTime = Date.now() + currentSpacing;
    const timeString = new Date(nextTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    // Note: Reliable background scheduling on web is hard without Push API + Server.
    // This basic version works if the app is open/backgrounded on some devices,
    // or simply relies on the user checking. 
    // For robust mobile push, we'd need FCM/VAPID which is complex for a static site.
    // We will attempt a simple timeout for now if the page stays open.
    
    setTimeout(() => {
        sendNotification();
    }, currentSpacing);
}

// REMOVED old playSound function, using AudioContext version above

function sendNotification() {
    // Always try to play sound first (in-app fallback)
    playSound();

    if (Notification.permission === 'granted') {
        // Check if we already sent one recently to avoid spam?
        // Actually, just send it.
        const notif = new Notification('Smoke Less', {
            body: getDynamicMessage(),
            icon: 'icon.svg',
            vibrate: [200, 100, 200],
            requireInteraction: true, // Keeps notification on screen until dismissed
            tag: 'smoke-alert',       // Replaces older notifications of same type
            renotify: true            // Plays sound/vibe again even if replacing
        });
        notif.onclick = () => {
            window.focus();
            notif.close();
        };
    } else {
        // Fallback alert for iOS if notifications blocked/unsupported but app is open
        // Use a gentle toast or title change instead of blocking alert
        // Title change is handled by startTitleFlashing() now
    }
}

// --- SUPABASE SYNC ---

function initSupabase() {
    let url = DEFAULT_SB_URL;
    let key = DEFAULT_SB_KEY;

    // Override with local config if exists
    const config = localStorage.getItem(SUPABASE_CONFIG_KEY);
    if (config) {
        const parsed = JSON.parse(config);
        url = parsed.url || url;
        key = parsed.key || key;
    }

    els.sbUrl.value = url;
    els.sbKey.value = key;
    
    if (url && key) {
        try {
            if (typeof window.supabase === 'undefined') {
                console.warn('Supabase SDK not loaded (offline or blocked). Sync disabled.');
                return;
            }
            // @ts-ignore
            supabaseClient = window.supabase.createClient(url, key);
            els.syncSetupForm.classList.add('hidden');
            els.syncAuthForm.classList.remove('hidden');
            checkUser();
        } catch (e) {
            console.error('Supabase init failed', e);
            // Don't alert immediately on auto-init to avoid annoyance if defaults are wrong
        }
    }
}

function saveSupabaseConfig() {
    const url = els.sbUrl.value.trim();
    const key = els.sbKey.value.trim();
    if (url && key) {
        localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify({ url, key }));
        initSupabase();
    } else {
        alert('Please enter both URL and Key.');
    }
}

async function checkUser() {
    if (!supabaseClient) return;
    const { data: { user } } = await supabaseClient.auth.getUser();
    currentUser = user;
    updateAuthUI();
    if (user) {
        pullData(); // Fetch cloud data on login
        // Subscribe to changes
        supabaseClient
            .channel('public:profiles')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` }, 
            (payload) => {
                console.log('Remote update received!', payload);
                if (payload.new && payload.new.data) {
                    const cloudState = payload.new.data;
                    
                    // TIMESTAMP CHECK: Only update if cloud state is actually newer or different
                    // We compare lastSmoked to see if another device smoked more recently
                    if (cloudState.lastSmoked > state.lastSmoked || 
                        (cloudState.lastSmoked === state.lastSmoked && JSON.stringify(cloudState) !== JSON.stringify(state))) {
                        
                        console.log('Syncing from cloud (newer data found)...');
                        state = cloudState;
                        saveState(false); // Save to local but DON'T push back to avoid loops
                        updateUI();
                        
                        // Visual Feedback for Sync
                        const toast = document.createElement('div');
                        toast.textContent = '☁️ Data synced from other device';
                        toast.style.cssText = `
                            position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
                            background: rgba(0,0,0,0.8); color: white; padding: 10px 20px;
                            border-radius: 20px; font-size: 0.9rem; z-index: 9999;
                            animation: fadeUp 0.3s ease-out;
                        `;
                        document.body.appendChild(toast);
                        setTimeout(() => toast.remove(), 3000);
                    }
                }
            })
            .subscribe();
    }
}

function updateAuthUI() {
    if (currentUser) {
        els.authInputs.classList.add('hidden');
        els.userInfo.classList.remove('hidden');
        els.userEmailDisplay.textContent = currentUser.email;
    } else {
        els.authInputs.classList.remove('hidden');
        els.userInfo.classList.add('hidden');
    }
}

async function handleLogin() {
    const email = els.authEmail.value;
    const password = els.authPassword.value;
    if (!supabaseClient || !email || !password) return;

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
    else checkUser();
}

async function handleSignup() {
    const email = els.authEmail.value;
    const password = els.authPassword.value;
    if (!supabaseClient || !email || !password) return;

    const { error } = await supabaseClient.auth.signUp({ email, password });
    if (error) alert(error.message);
    else {
        alert('Check your email for the confirmation link!');
    }
}

async function handleLogout() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
    currentUser = null;
    updateAuthUI();
}

async function syncData() {
    // Robust offline check
    if (!navigator.onLine) return;
    if (!supabaseClient || !currentUser) return;
    
    try {
        // Upsert state to 'profiles' table
        // Assumes table 'profiles' exists with columns: id (uuid, pk), data (jsonb), updated_at (timestamptz)
        const { error } = await supabaseClient
            .from('profiles')
            .upsert({ 
                id: currentUser.id, 
                data: state, 
                updated_at: new Date().toISOString() 
            });

        if (error) console.error('Sync error:', error);
    } catch (e) {
        console.warn('Sync failed (likely network issue):', e);
    }
}

async function pullData() {
    if (!navigator.onLine) return;
    if (!supabaseClient || !currentUser) return;
    
    try {
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('data')
            .eq('id', currentUser.id)
            .single();

        if (data && data.data) {
            console.log('Pulled cloud data:', data.data);
            state = { ...state, ...data.data };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); 
            updateUI();
        }
    } catch (e) {
        console.warn('Pull failed (likely network issue):', e);
    }
}

// --- INIT ---

try {
    // Force correct tab state on load
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-track').classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.querySelector('.nav-item').classList.add('active'); // First item

    loadState();
    updateUI();
    setInterval(updateUI, 1000);
    initSupabase();

    els.smokeBtn.addEventListener('click', smoke);
    els.resetBtn.addEventListener('click', reset);
    els.restDayToggle.addEventListener('change', toggleRestDay);
    els.buyPackBtn.addEventListener('click', buyPack);
    if(els.editPackBtn) els.editPackBtn.addEventListener('click', editPack);
    els.packPriceInput.addEventListener('change', updatePrice); // Changed from 'input' to 'change' for better sync
    els.savePrefsBtn.addEventListener('click', savePreferences);
    els.enableNotifyBtn.addEventListener('click', requestNotificationPermission);
    
    if (els.testNotifyBtn) {
        els.testNotifyBtn.addEventListener('click', () => {
            // Unlock AudioContext and start Keep-Alive
            initAudio();
            
            if (Notification.permission === 'granted') {
                alert('Wait 15 seconds... Lock your phone now to test!');
                
                setTimeout(() => {
                    // Play sound
                    playSound();
                    
                    new Notification('Smoke Less', {
                        body: '🔔 This is your delayed test notification!',
                        icon: 'icon.svg',
                        vibrate: [200, 100, 200],
                        requireInteraction: true,
                        tag: 'test-alert',
                        renotify: true
                    });
                }, 15000); // 15 seconds delay
                
            } else {
                alert('Notification permission not granted. Playing sound only.');
                requestNotificationPermission();
            }
        });
    }
    
    // Test Mode Toggle
    if (els.testModeToggle) {
        els.testModeToggle.addEventListener('change', () => {
            isTestMode = els.testModeToggle.checked;
            updateUI();
        });
    }

    // Sync Listeners
    els.saveConfigBtn.addEventListener('click', saveSupabaseConfig);
    els.loginBtn.addEventListener('click', handleLogin);
    els.signupBtn.addEventListener('click', handleSignup);
    els.logoutBtn.addEventListener('click', handleLogout);
    els.forceSyncBtn.addEventListener('click', pullData);

    // Auto-Sync on visibility change (when you switch tabs or unlock phone)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            console.log('App active: Pulling latest data...');
            pullData();
        }
    });

    // SOS Listeners
    if (els.sosBtn) els.sosBtn.addEventListener('click', openSos);
    if (els.closeSosBtn) els.closeSosBtn.addEventListener('click', closeSos);
    if (els.closeSosX) els.closeSosX.addEventListener('click', closeSos);
    if (els.newDistractionBtn) els.newDistractionBtn.addEventListener('click', showNewDistraction);
    
    // Close SOS on backdrop click
    if (els.sosModal) {
        els.sosModal.addEventListener('click', (e) => {
            if (e.target === els.sosModal) closeSos();
        });
    }

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !els.sosModal.classList.contains('hidden')) {
            closeSos();
        }
    });

} catch (err) {
    console.error('Critical initialization error:', err);
    alert('App failed to load: ' + err.message + '. Please try clearing your browser data/cache.');
}