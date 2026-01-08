const STORAGE_KEY = 'smokeless_data';
const SUPABASE_CONFIG_KEY = 'smokeless_supabase_config';
const SPACING_MS = 2 * 60 * 60 * 1000; // 2 hours in ms

// Default Credentials (hardcoded for convenience)
const DEFAULT_SB_URL = 'https://lmsolgyrlsevapbimyad.supabase.co';
const DEFAULT_SB_KEY = 'sb_publishable_rU97_8A8SCP1Vr_wnfuOuA_IFhAgRF9';

const els = {
    smokeBtn: document.getElementById('smoke-btn'),
    count: document.getElementById('count'),
    remaining: document.getElementById('remaining'),
    timerText: document.getElementById('timer-text'),
    countdown: document.getElementById('countdown'),
    resetBtn: document.getElementById('reset-btn'),
    restDayToggle: document.getElementById('rest-day-toggle'),
    packCount: document.getElementById('pack-count'),
    packCountDisplay: document.getElementById('pack-count-display'),
    buyPackBtn: document.getElementById('buy-pack-btn'),
    packPriceInput: document.getElementById('pack-price'),
    savingsDisplay: document.getElementById('savings-display'),
    // Charts
    weeklyChart: document.getElementById('weekly-chart'),
    // Breathing
    breatheBtn: document.getElementById('breathe-btn'),
    breatheModal: document.getElementById('breathe-modal'),
    breatheInstruction: document.getElementById('breathe-instruction'),
    // Preferences
    prefPackSize: document.getElementById('pref-pack-size'),
    workStart: document.getElementById('work-start'),
    workEnd: document.getElementById('work-end'),
    workBreak: document.getElementById('work-break'),
    savePrefsBtn: document.getElementById('save-prefs-btn'),
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
    forceSyncBtn: document.getElementById('force-sync-btn')
};

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

let supabase = null;
let currentUser = null;

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

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    syncData(); // Trigger cloud sync if connected
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

    const now = Date.now();
    const nextAllowed = state.lastSmoked + SPACING_MS;
    
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

// --- BREATHING ---
function openBreathe() {
    els.breatheModal.classList.remove('hidden');
    startBreathingCycle();
}

function closeBreathe() {
    els.breatheModal.classList.add('hidden');
    // Stop cycle?
}

// Simple text update for breathing
function startBreathingCycle() {
    // CSS animation handles the circle, we just update text roughly
    // 4s in, 4s out = 8s cycle
    // We won't strictly sync text with JS interval to CSS, just a simple helper
    const text = els.breatheInstruction;
    text.textContent = "Breathe In...";
    
    // We rely on CSS animation mainly.
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
            // @ts-ignore
            supabase = window.supabase.createClient(url, key);
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
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    currentUser = user;
    updateAuthUI();
    if (user) {
        pullData(); // Fetch cloud data on login
        // Subscribe to changes
        supabase
            .channel('public:profiles')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` }, 
            (payload) => {
                console.log('Remote update received!', payload);
                if (payload.new && payload.new.data) {
                    const cloudState = payload.new.data;
                    // Only update if cloud state is different/newer (simple check)
                    if (JSON.stringify(cloudState) !== JSON.stringify(state)) {
                        state = cloudState;
                        saveState(); // Will trigger syncData but that's fine, it handles loops ideally or we can suppress
                        updateUI();
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
    if (!supabase || !email || !password) return;

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
    else checkUser();
}

async function handleSignup() {
    const email = els.authEmail.value;
    const password = els.authPassword.value;
    if (!supabase || !email || !password) return;

    const { error } = await supabase.auth.signUp({ email, password });
    if (error) alert(error.message);
    else {
        alert('Check your email for the confirmation link!');
    }
}

async function handleLogout() {
    if (!supabase) return;
    await supabase.auth.signOut();
    currentUser = null;
    updateAuthUI();
}

async function syncData() {
    if (!supabase || !currentUser) return;
    
    // Upsert state to 'profiles' table
    // Assumes table 'profiles' exists with columns: id (uuid, pk), data (jsonb), updated_at (timestamptz)
    const { error } = await supabase
        .from('profiles')
        .upsert({ 
            id: currentUser.id, 
            data: state, 
            updated_at: new Date().toISOString() 
        });

    if (error) console.error('Sync error:', error);
}

async function pullData() {
    if (!supabase || !currentUser) return;
    
    const { data, error } = await supabase
        .from('profiles')
        .select('data')
        .eq('id', currentUser.id)
        .single();

    if (data && data.data) {
        console.log('Pulled cloud data:', data.data);
        state = { ...state, ...data.data };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); // Save locally without triggering sync loop? 
        updateUI();
    }
}

// --- INIT ---

loadState();
updateUI();
setInterval(updateUI, 1000);
initSupabase();

els.smokeBtn.addEventListener('click', smoke);
els.resetBtn.addEventListener('click', reset);
els.restDayToggle.addEventListener('change', toggleRestDay);
els.buyPackBtn.addEventListener('click', buyPack);
els.packPriceInput.addEventListener('input', updatePrice);
els.breatheBtn.addEventListener('click', openBreathe);
els.savePrefsBtn.addEventListener('click', savePreferences);
// Global scope for HTML click handler
window.closeBreathe = closeBreathe;

// Sync Listeners
els.saveConfigBtn.addEventListener('click', saveSupabaseConfig);
els.loginBtn.addEventListener('click', handleLogin);
els.signupBtn.addEventListener('click', handleSignup);
els.logoutBtn.addEventListener('click', handleLogout);
els.forceSyncBtn.addEventListener('click', pullData);