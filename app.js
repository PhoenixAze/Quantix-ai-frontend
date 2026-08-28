/* =====================================================================
   FIREBASE KONFİQURASİYASI
===================================================================== */
const firebaseConfig = {
  apiKey: "AIzaSyD1U2uxHN2TxQBdH1-LWG_iDn9z8_Y168g",
  authDomain: "qwen-project-1.firebaseapp.com",
  projectId: "qwen-project-1",
  storageBucket: "qwen-project-1.firebasestorage.app",
  messagingSenderId:  "1006283288360",
  appId: "1:1006283288360:web:2b1e5724ea6279d2ca2a1d",
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

/* =====================================================================
   SABİT KONFİQURASİYA (backend/API)
===================================================================== */
const API_URL = "https://qven-ai-app.onrender.com";
const DEFAULT_SYSTEM_PROMPT = `Sən Azərbaycan dilinin qrammatikasını, leksikasını və sintaksisini mükəmməl bilən peşəkar köməkçisən.`;
 
const state = {
  messages: [],    
  isSending: false,
  coin: 0,           
  coinResetAt: null, 
  currentConversationId: null, 
};

let unsubscribeCoinListener = null; 
let currentUser = null; 

/* ---- DOM elementlərinə istinadlar ---- */
const loadingScreen = document.getElementById("loading-screen");
const authScreen = document.getElementById("auth-screen");
const chatScreen = document.getElementById("chat-screen");

const authForm = document.getElementById("auth-form");
const authEmailInput = document.getElementById("auth-email");
const authPasswordInput = document.getElementById("auth-password");
const authSubmitBtn = document.getElementById("auth-submit");
const authErrorEl = document.getElementById("auth-error");
const tabLogin = document.getElementById("tab-login");
const tabRegister = document.getElementById("tab-register");

const fieldUsername = document.getElementById("field-username");
const authTitle = document.getElementById("auth-title");
const authSubtitle = document.getElementById("auth-subtitle");
const togglePasswordBtn = document.querySelector(".toggle-password");

const chatEl = document.getElementById("chat-messages");
const emptyStateEl = document.getElementById("empty-state");
const composerEl = document.getElementById("composer");
const inputEl = document.getElementById("msg-input");
const micSendBtn = document.getElementById("mic-send-btn");

const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");

const clearChatBtn = document.getElementById("clear-chat-btn");
const accountEmailEl = document.getElementById("account-email");
const logoutBtn = document.getElementById("logout-btn");
const coinBadge = document.getElementById("coin-badge");
const profileCoinEl = document.getElementById("profile-coin");
const coinLockBanner = document.getElementById("coin-lock-banner");

const menuBtn = document.getElementById("menu-btn");
const trophyBtn = document.getElementById("trophy-btn");
const cameraBtn = document.getElementById("camera-btn");
const navTabs = document.querySelectorAll(".nav-tab");
const screens = document.querySelectorAll(".screen");
const toastEl = document.getElementById("toast");
const appEl = document.getElementById("app");

const historyOverlay = document.getElementById("history-overlay");
const closeHistoryBtn = document.getElementById("close-history-btn");
const newChatBtn = document.getElementById("new-chat-btn");
const historyListEl = document.getElementById("history-list");

/* =====================================================================
   GİRİŞ / QEYDİYYAT MƏNTİQİ
===================================================================== */
let authMode = "register"; 

tabLogin.addEventListener("click", () => setAuthMode("login"));
tabRegister.addEventListener("click", () => setAuthMode("register"));

function setAuthMode(mode) {
  authMode = mode;
  tabLogin.classList.toggle("active", mode === "login");
  tabRegister.classList.toggle("active", mode === "register");
  authErrorEl.style.display = "none";

  if (mode === "login") {
    if(fieldUsername) fieldUsername.style.display = "none";
    if(authTitle) authTitle.textContent = "Xoş gəldiniz";
    if(authSubtitle) authSubtitle.textContent = "Davam etmək üçün hesabınıza daxil olun.";
    authSubmitBtn.textContent = "Giriş et";
  } else {
    if(fieldUsername) fieldUsername.style.display = "block";
    if(authTitle) authTitle.textContent = "Hesab Yarat";
    if(authSubtitle) authSubtitle.textContent = "Davam etmək üçün məlumatlarınızı daxil edin.";
    authSubmitBtn.textContent = "Başla";
  }
}

if (togglePasswordBtn && authPasswordInput) {
  togglePasswordBtn.addEventListener("click", () => {
    const type = authPasswordInput.getAttribute("type") === "password" ? "text" : "password";
    authPasswordInput.setAttribute("type", type);
  });
}

function friendlyAuthError(error) {
  const map = {
    "auth/email-already-in-use": "Bu email artıq qeydiyyatdan keçib.",
    "auth/invalid-email": "Email ünvanı düzgün formatda deyil.",
    "auth/weak-password": "Şifrə ən azı 6 simvol olmalıdır.",
    "auth/user-not-found": "Bu email ilə hesab tapılmadı.",
    "auth/wrong-password": "Şifrə səhvdir.",
    "auth/invalid-credential": "Email və ya şifrə səhvdir.",
  };
  return map[error.code] || error.message;
}

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;

  authSubmitBtn.disabled = true;
  authErrorEl.style.display = "none";

  try {
    if (authMode === "register") {
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      await db.collection("users").doc(cred.user.uid).set({
        email: email,
        coin: 10,
        coinResetAt: null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      await auth.signInWithEmailAndPassword(email, password);
    }
  } catch (err) {
    authErrorEl.textContent = friendlyAuthError(err);
    authErrorEl.style.display = "block";
  } finally {
    authSubmitBtn.disabled = false;
  }
});

logoutBtn.addEventListener("click", () => auth.signOut());

auth.onAuthStateChanged(async (user) => {
  loadingScreen.style.display = "none";
  if (user) {
    currentUser = user;
    accountEmailEl.textContent = user.email;
    authScreen.classList.remove("visible");
    chatScreen.classList.add("visible");

    startNewConversation(); 
    listenToCoinBalance();
    checkBackendHealth();
    loadLabels(); // Mövzuları yüklə
    loadStats();  // Statistikanı yüklə
  } else {
    currentUser = null;
    chatScreen.classList.remove("visible");
    authScreen.classList.add("visible");
  }
});

/* =====================================================================
   ÇAT VƏ FIRESTORE MƏNTİQİ (Qısaldılmış)
===================================================================== */
function startNewConversation() {
  state.currentConversationId = null;
  state.messages = [];
  chatEl.querySelectorAll(".row").forEach((el) => el.remove());
  emptyStateEl.style.display = "block";
}

async function saveMessageToFirestore(role, content) {
  if (!currentUser) return;
  try {
    if (!state.currentConversationId) {
      const title = content.length > 40 ? content.slice(0, 40) + "…" : content;
      const convRef = await db.collection("users").doc(currentUser.uid).collection("conversations").add({
        title: title, createdAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      state.currentConversationId = convRef.id;
    } else {
      await db.collection("users").doc(currentUser.uid).collection("conversations").doc(state.currentConversationId).update({ updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    }
    await db.collection("users").doc(currentUser.uid).collection("conversations").doc(state.currentConversationId).collection("messages").add({
      role: role, content: content, timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) { console.error(err); }
}

function listenToCoinBalance() {
  if (unsubscribeCoinListener) unsubscribeCoinListener();
  unsubscribeCoinListener = db.collection("users").doc(currentUser.uid).onSnapshot(async (docSnap) => {
    if (!docSnap.exists) return;
    const data = docSnap.data();
    state.coin = data.coin ?? 0;
    state.coinResetAt = data.coinResetAt ? data.coinResetAt.toDate() : null;
    if (state.coin <= 0 && !state.coinResetAt) {
      await db.collection("users").doc(currentUser.uid).update({ coinResetAt: firebase.firestore.FieldValue.serverTimestamp() });
      return;
    }
    renderCoinUI();
  });
}

function renderCoinUI() {
  coinBadge.textContent = "🪙 " + state.coin;
  profileCoinEl.textContent = "🪙 " + state.coin;
  const locked = isChatLocked();
  inputEl.disabled = locked;
  micSendBtn.disabled = locked;
  coinLockBanner.style.display = locked ? "block" : "none";
  if (locked) updateLockCountdownText();
}

function isChatLocked() {
  if (state.coin > 0) return false;
  if (!state.coinResetAt) return true;
  return Date.now() < (state.coinResetAt.getTime() + 60 * 60 * 1000);
}

function updateLockCountdownText() {
  if (!state.coinResetAt) return;
  const remainingMs = (state.coinResetAt.getTime() + 60 * 60 * 1000) - Date.now();
  if (remainingMs <= 0) { tryResetCoins(); return; }
  const mins = Math.floor(remainingMs / 60000);
  const secs = Math.floor((remainingMs % 60000) / 1000);
  coinLockBanner.textContent = `Koinləriniz bitib — ${mins} dəq ${secs} san sonra yenidən yaza bilərsiniz.`;
}

async function tryResetCoins() {
  if (!currentUser || !state.coinResetAt) return;
  if (Date.now() >= (state.coinResetAt.getTime() + 60 * 60 * 1000)) {
    await db.collection("users").doc(currentUser.uid).update({ coin: 10, coinResetAt: null });
  }
}

function scrollToBottom() { chatEl.scrollTop = chatEl.scrollHeight; }
function formatTime(date) { return date.toLocaleTimeString("az-AZ", { hour: "2-digit", minute: "2-digit" }); }

function appendBubble(kind, text) {
  emptyStateEl.style.display = "none";
  const row = document.createElement("div");
  row.className = "row " + kind;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  const time = document.createElement("div");
  time.className = "timestamp";
  time.textContent = formatTime(new Date());
  const wrapper = document.createElement("div");
  wrapper.appendChild(bubble); wrapper.appendChild(time);
  row.appendChild(wrapper);
  chatEl.appendChild(row);
  scrollToBottom();
  return row;
}

function showTypingIndicator() {
  const row = document.createElement("div");
  row.className = "row assistant";
  row.innerHTML = `<div class="bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
  chatEl.appendChild(row);
  scrollToBottom();
  return row;
}

async function checkBackendHealth() {
  statusDot.className = "status-dot checking"; statusText.textContent = "yoxlanılır…";
  try {
    const res = await fetch(API_URL + "/health", { method: "GET" });
    if (!res.ok) throw new Error();
    statusDot.className = "status-dot online"; statusText.textContent = "qoşulub";
  } catch (err) {
    statusDot.className = "status-dot offline"; statusText.textContent = "qoşulmayıb";
  }
}

async function sendMessageToBackend(userText) {
  if (isChatLocked()) return;
  appendBubble("user", userText);
  state.messages.push({ role: "user", content: userText });
  await saveMessageToFirestore("user", userText);
  db.collection("users").doc(currentUser.uid).update({ coin: firebase.firestore.FieldValue.increment(-1) });

  const typingRow = showTypingIndicator();
  state.isSending = true; micSendBtn.disabled = true;

  try {
    const res = await fetch(API_URL + "/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: state.messages, system_prompt: DEFAULT_SYSTEM_PROMPT }),
    });
    const data = await res.json();
    typingRow.remove();
    if (!res.ok) throw new Error(data.detail || "Xəta");
    appendBubble("assistant", data.response);
    state.messages.push({ role: "assistant", content: data.response });
    saveMessageToFirestore("assistant", data.response);
  } catch (err) {
    typingRow.remove();
    appendBubble("error", "Serverə qoşula bilmədim: " + err.message);
  } finally {
    state.isSending = false; micSendBtn.disabled = false;
  }
}

/* =====================================================================
   MÖVZU (LABEL) İDARƏETMƏSİ
===================================================================== */
let userLabels = [];
let activeLabel = null; // { id, name, color }

const openLabelsBtn = document.getElementById('open-labels-btn');
const activeLabelText = document.getElementById('active-label-text');
const labelsOverlay = document.getElementById('labels-overlay');
const labelChipsContainer = document.getElementById('label-chips-container');
const btnClearLabel = document.getElementById('btn-clear-label');
const btnNewLabel = document.getElementById('btn-new-label');
const btnCloseLabels = document.getElementById('btn-close-labels');

const createLabelOverlay = document.getElementById('create-label-overlay');
const newLabelName = document.getElementById('new-label-name');
const newLabelColor = document.getElementById('new-label-color');
const saveNewLabelBtn = document.getElementById('save-new-label-btn');
const cancelNewLabelBtn = document.getElementById('cancel-new-label-btn');

// Mövzuları Firestore-dan çək
async function loadLabels() {
  if (!currentUser) return;
  try {
    const snapshot = await db.collection("users").doc(currentUser.uid).collection("labels").get();
    userLabels = [];
    snapshot.forEach(doc => {
      userLabels.push({ id: doc.id, ...doc.data() });
    });
    renderLabelChips();
  } catch (err) { console.error("Mövzular yüklənmədi", err); }
}

// Mövzuları ekrana (modal) yazdır
function renderLabelChips() {
  labelChipsContainer.innerHTML = '';
  userLabels.forEach(label => {
    const chip = document.createElement('div');
    chip.className = 'label-chip' + (activeLabel && activeLabel.id === label.id ? ' active' : '');
    // Rəngi arxa fon kimi yox, skrinşotdakı kimi solğun fon + rəngli mətn edirik
    chip.style.backgroundColor = label.color + '20'; // 20 = 12% opacity hex
    chip.style.color = label.color;
    chip.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"></path></svg>
      ${label.name}
    `;
    chip.addEventListener('click', () => selectLabel(label));
    labelChipsContainer.appendChild(chip);
  });
}

function selectLabel(label) {
  activeLabel = label;
  activeLabelText.textContent = label.name;
  openLabelsBtn.style.color = label.color;
  openLabelsBtn.querySelector('svg').style.color = label.color;
  labelsOverlay.classList.remove('open');
  updateTimerUI(); // Taymerin rəngini yenilə
}

openLabelsBtn.addEventListener('click', () => {
  renderLabelChips();
  labelsOverlay.classList.add('open');
});
btnCloseLabels.addEventListener('click', () => labelsOverlay.classList.remove('open'));

btnClearLabel.addEventListener('click', () => {
  activeLabel = null;
  activeLabelText.textContent = "Mövzu seçin";
  openLabelsBtn.style.color = "var(--text)";
  labelsOverlay.classList.remove('open');
  updateTimerUI();
});

btnNewLabel.addEventListener('click', () => {
  labelsOverlay.classList.remove('open');
  createLabelOverlay.classList.add('open');
  newLabelName.value = '';
});
cancelNewLabelBtn.addEventListener('click', () => createLabelOverlay.classList.remove('open'));

saveNewLabelBtn.addEventListener('click', async () => {
  const name = newLabelName.value.trim();
  const color = newLabelColor.value;
  if (!name) return showToast("Ad daxil edin");
  
  try {
    const docRef = await db.collection("users").doc(currentUser.uid).collection("labels").add({ name, color });
    const newLabel = { id: docRef.id, name, color };
    userLabels.push(newLabel);
    createLabelOverlay.classList.remove('open');
    selectLabel(newLabel);
    showToast("Mövzu yaradıldı");
  } catch (err) { console.error(err); }
});


/* =====================================================================
   TAYMER MƏNTİQİ (DİNAMİK RƏNGLƏR İLƏ)
===================================================================== */
const timerDisplay = document.getElementById('timer-display');
const timerMainBtn = document.getElementById('timer-main-btn');
const timerStopBtn = document.getElementById('timer-stop-btn');
const gtModeLabel = document.getElementById('gt-mode-label');

const tabCountdown = document.getElementById('tab-countdown');
const tabCountup = document.getElementById('tab-countup');
const timerSettingsBtn = document.getElementById('timer-settings-btn');
const timerSettingsOverlay = document.getElementById('timer-settings-overlay');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const settingFocusInput = document.getElementById('setting-focus');
const settingBreakInput = document.getElementById('setting-break');

let timerMode = 'countdown'; 
let pomodoroState = 'WORK';  
let customFocusTime = 25 * 60; 
let customBreakTime = 5 * 60;  

let timeLeft = customFocusTime; 
let countupTime = 0;            
let timerInterval = null;
let isTimerRunning = false;

const playIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
const pauseIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;

tabCountdown.addEventListener('click', () => {
  if (isTimerRunning) return showToast("Əvvəlcə taymeri dayandırın");
  timerMode = 'countdown';
  tabCountdown.classList.add('active'); tabCountup.classList.remove('active');
  timerSettingsBtn.style.display = 'block'; 
  pomodoroState = 'WORK'; timeLeft = customFocusTime;
  updateTimerUI();
});

tabCountup.addEventListener('click', () => {
  if (isTimerRunning) return showToast("Əvvəlcə taymeri dayandırın");
  timerMode = 'countup';
  tabCountup.classList.add('active'); tabCountdown.classList.remove('active');
  timerSettingsBtn.style.display = 'none';
  countupTime = 0;
  updateTimerUI();
});

timerSettingsBtn.addEventListener('click', () => { if (!isTimerRunning) timerSettingsOverlay.classList.add('open'); });
closeSettingsBtn.addEventListener('click', () => timerSettingsOverlay.classList.remove('open'));
saveSettingsBtn.addEventListener('click', () => {
  const fVal = parseInt(settingFocusInput.value);
  const bVal = parseInt(settingBreakInput.value);
  if (fVal > 0 && bVal > 0) {
    customFocusTime = fVal * 60; customBreakTime = bVal * 60;
    timeLeft = customFocusTime; pomodoroState = 'WORK';
    updateTimerUI(); timerSettingsOverlay.classList.remove('open');
  }
});

function formatTimerTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

function updateTimerUI() {
  // Rəng təyini: Mövzu seçilibsə onun rəngi, yoxsa standart ağ
  const currentColor = activeLabel ? activeLabel.color : '#ececec';
  
  if (timerMode === 'countdown') {
    timerDisplay.textContent = formatTimerTime(timeLeft);
    if (pomodoroState === 'WORK') {
      gtModeLabel.innerHTML = `<span>Fokus</span>`;
      gtModeLabel.style.backgroundColor = currentColor + '20';
      gtModeLabel.style.color = currentColor;
      timerDisplay.style.color = currentColor;
      timerMainBtn.style.color = currentColor;
    } else {
      // Fasilə həmişə yaşıl qalır
      gtModeLabel.innerHTML = `<span>Fasilə</span>`;
      gtModeLabel.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';
      gtModeLabel.style.color = '#10b981';
      timerDisplay.style.color = '#10b981';
      timerMainBtn.style.color = '#10b981';
    }
  } else {
    // Countup
    timerDisplay.textContent = formatTimerTime(countupTime);
    gtModeLabel.innerHTML = `<span>Xronometr</span>`;
    gtModeLabel.style.backgroundColor = currentColor + '20';
    gtModeLabel.style.color = currentColor;
    timerDisplay.style.color = currentColor;
    timerMainBtn.style.color = currentColor;
  }

  if (isTimerRunning) {
    timerMainBtn.innerHTML = pauseIcon;
    timerStopBtn.style.display = 'flex';
  } else {
    timerMainBtn.innerHTML = playIcon;
    timerStopBtn.style.display = 'none';
  }
}

async function saveFocusSession(durationInSeconds) {
  if (!currentUser || durationInSeconds < 60) return; 
  try {
    await db.collection("users").doc(currentUser.uid).collection("focus_sessions").add({
      subject: activeLabel ? activeLabel.name : 'Ümumi',
      color: activeLabel ? activeLabel.color : '#ececec',
      duration: durationInSeconds,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    loadStats(); 
  } catch (err) { console.error(err); }
}

function handleCountdownComplete() {
  clearInterval(timerInterval); isTimerRunning = false;
  if (pomodoroState === 'WORK') {
    saveFocusSession(customFocusTime);
    showToast("Fokus bitdi! Fasilə vaxtıdır ☕");
    pomodoroState = 'BREAK'; timeLeft = customBreakTime;
  } else {
    showToast("Fasilə bitdi! Yenidən fokuslanın 🎯");
    pomodoroState = 'WORK'; timeLeft = customFocusTime;
  }
  updateTimerUI();
}

function toggleTimer() {
  if (isTimerRunning) {
    clearInterval(timerInterval); isTimerRunning = false; updateTimerUI();
  } else {
    isTimerRunning = true; updateTimerUI();
    timerInterval = setInterval(() => {
      if (timerMode === 'countdown') {
        if (timeLeft > 0) { timeLeft--; timerDisplay.textContent = formatTimerTime(timeLeft); } 
        else { handleCountdownComplete(); }
      } else {
        countupTime++; timerDisplay.textContent = formatTimerTime(countupTime);
      }
    }, 1000);
  }
}

function stopTimer() {
  clearInterval(timerInterval); isTimerRunning = false;
  if (timerMode === 'countup') {
    if (countupTime > 0) {
      saveFocusSession(countupTime);
      if (countupTime >= 60) showToast("Sessiya yadda saxlanıldı");
    }
    countupTime = 0;
  } else {
    pomodoroState = 'WORK'; timeLeft = customFocusTime;
  }
  updateTimerUI();
}

if (timerMainBtn) timerMainBtn.addEventListener('click', toggleTimer);
if (timerStopBtn) timerStopBtn.addEventListener('click', stopTimer);


/* =====================================================================
   STATİSTİKA VƏ CHART.JS
===================================================================== */
let historyChartInstance = null;

async function loadStats() {
  if (!currentUser) return;
  try {
    const snapshot = await db.collection("users").doc(currentUser.uid).collection("focus_sessions").get();
    
    let totalSecs = 0;
    let todaySecs = 0;
    let weekSecs = 0;
    
    const now = new Date();
    const todayStr = now.toDateString();
    const weekAgo = new Date();
    weekAgo.setDate(now.getDate() - 7);

    // Qrafik üçün son 7 günün tarixlərini hazırlayırıq (YYYY-MM-DD)
    const last7Days = [...Array(7)].map((_, i) => {
      const d = new Date(); d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();

    // Mövzulara görə qruplaşdırılmış data: { "Riyaziyyat": { color: "#...", data: { "2026-08-28": 3600 } } }
    const chartDataByLabel = {};

    snapshot.forEach(doc => {
      const data = doc.data();
      if (!data.timestamp) return;
      const dateObj = data.timestamp.toDate();
      const dateStr = dateObj.toISOString().split('T')[0];
      
      totalSecs += data.duration;
      if (dateObj.toDateString() === todayStr) todaySecs += data.duration;
      if (dateObj >= weekAgo) weekSecs += data.duration;

      // Qrafik məlumatlarını topla
      if (dateObj >= weekAgo) {
        const lbl = data.subject || 'Ümumi';
        if (!chartDataByLabel[lbl]) {
          chartDataByLabel[lbl] = { color: data.color || '#ececec', data: {} };
        }
        chartDataByLabel[lbl].data[dateStr] = (chartDataByLabel[lbl].data[dateStr] || 0) + data.duration;
      }
    });

    // Overview rəqəmlərini yenilə
    document.getElementById('stat-today').textContent = Math.floor(todaySecs / 60) + 'min';
    document.getElementById('stat-week').textContent = Math.floor(weekSecs / 60) + 'min';
    document.getElementById('stat-avg').textContent = Math.floor((weekSecs / 7) / 60) + 'min';
    document.getElementById('stat-total').textContent = `${Math.floor(totalSecs / 3600)}h ${Math.floor((totalSecs % 3600) / 60)}m`;

    // Chart.js Datasetlərini qur
    const datasets = Object.keys(chartDataByLabel).map(lbl => {
      const labelInfo = chartDataByLabel[lbl];
      return {
        label: lbl,
        backgroundColor: labelInfo.color,
        data: last7Days.map(date => (labelInfo.data[date] || 0) / 3600) // Saat cinsindən
      };
    });

    // Qrafiki çək
    const ctx = document.getElementById('historyChart').getContext('2d');
    if (historyChartInstance) historyChartInstance.destroy(); // Köhnəni sil
    
    // X oxu üçün qısa tarix formatı (məs: "28 Avq")
    const displayLabels = last7Days.map(d => {
      const date = new Date(d);
      return date.getDate() + ' ' + date.toLocaleString('az-AZ', { month: 'short' });
    });

    historyChartInstance = new Chart(ctx, {
      type: 'bar',
      data: { labels: displayLabels, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, grid: { color: '#2c2c2c' }, ticks: { color: '#9e9e9e', callback: (val) => val + ' h' } }
        },
        plugins: {
          legend: { display: false }, // Skrinşotda legend yoxdur
          tooltip: { mode: 'index', intersect: false }
        }
      }
    });

  } catch (err) { console.error("Statistika yüklənmədi:", err); }
}

document.getElementById('clear-stats-btn').addEventListener('click', async () => {
  if(confirm('Bütün statistikanı silmək istədiyinizə əminsiniz?')) {
    try {
      const snapshot = await db.collection("users").doc(currentUser.uid).collection("focus_sessions").get();
      const batch = db.batch();
      snapshot.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      loadStats();
      showToast('Statistika sıfırlandı');
    } catch (err) { console.error(err); }
  }
});

/* =====================================================================
   DİGƏR HADİSƏ DİNLƏYİCİLƏRİ
===================================================================== */
composerEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text || state.isSending) return;
  inputEl.value = ""; inputEl.style.height = "auto";
  micSendBtn.classList.remove("is-send"); 
  sendMessageToBackend(text);
});

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); composerEl.requestSubmit(); }
});

inputEl.addEventListener("input", () => {
  inputEl.style.height = "auto"; inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
  micSendBtn.classList.toggle("is-send", inputEl.value.trim().length > 0);
});

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => sendMessageToBackend(chip.dataset.prompt));
});

clearChatBtn.addEventListener("click", () => startNewConversation());

let toastTimer = null;
function showToast(message) {
  toastEl.textContent = message; toastEl.classList.add("visible");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove("visible"), 2000);
}

function switchScreen(name) {
  screens.forEach((s) => s.classList.toggle("active", s.dataset.screen === name));
  navTabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  if (name === 'stats') loadStats(); // Statistika ekranı açılanda qrafiki yenilə
}

navTabs.forEach((tab) => tab.addEventListener("click", () => switchScreen(tab.dataset.tab)));
menuBtn.addEventListener("click", () => openHistoryDrawer());
closeHistoryBtn.addEventListener("click", () => closeHistoryDrawer());
historyOverlay.addEventListener("click", (e) => { if (e.target === historyOverlay) closeHistoryDrawer(); });
newChatBtn.addEventListener("click", () => { startNewConversation(); closeHistoryDrawer(); });

function adjustForKeyboard() {
  if (!window.visualViewport) return;
  appEl.style.height = window.visualViewport.height + "px"; 
  scrollToBottom(); 
}
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", adjustForKeyboard);
}
inputEl.addEventListener("focus", () => setTimeout(adjustForKeyboard, 300));

updateTimerUI();
setInterval(() => { if (currentUser) checkBackendHealth(); }, 30000);
setInterval(() => { if (currentUser && isChatLocked()) updateLockCountdownText(); }, 1000);