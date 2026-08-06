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
const DEFAULT_SYSTEM_PROMPT = `Sən Azərbaycan dilinin qrammatikasını, leksikasını və sintaksisini mükəmməl bilən peşəkar köməkçisən. 

Mənimlə cavablaşarkən aşağıdakı qaydalara DƏQİQ riayət et:
1. YALNIZ təbii, axıcı və qrammatik cəhətdən düzgün Azərbaycan dilində cavab ver.
2. Başqa dillərdən (xüsusilə türk və ya rus dilindən) birbaşa və ya kalka (səhv) tərcümə cümlələri qurma.
3. Söz ehtiyatında rəsmi və ya səmimi tonu kontekstə uyğun seç, lakin hər zaman Azərbaycan dilinin imla qaydalarına sadiq qal.
4. Əgər bir texniki termini Azərbaycan dilinə tərcümə etmək süni alınırsa, termini orijinalda saxlayaraq cümləni düzgün Azərbaycan dilində qur.
5. Fikrinin aydın və anlaşıqlı olmasına diqqət et.`;
 
const state = {
  messages: [],    // { role: "user" | "assistant", content: string }
  isSending: false,
  coin: 0,           // İstifadəçinin qalan koin sayı (Firestore-dan gəlir)
  coinResetAt: null, // Koin nə vaxt bitib (Date obyekti və ya null)
};

let unsubscribeCoinListener = null; // Koin dinləyicisini sonra söndürmək üçün
let currentUser = null; // Firebase-dən gələn giriş etmiş istifadəçi obyekti

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

const chatEl = document.getElementById("chat-messages");
const emptyStateEl = document.getElementById("empty-state");
const composerEl = document.getElementById("composer");
const inputEl = document.getElementById("msg-input");
const sendBtn = document.getElementById("send-btn");

const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");

const settingsBtn = document.getElementById("settings-btn");
const settingsOverlay = document.getElementById("settings-overlay");
const closeSettingsBtn = document.getElementById("close-settings-btn");
const clearChatBtn = document.getElementById("clear-chat-btn");
const accountEmailEl = document.getElementById("account-email");
const logoutBtn = document.getElementById("logout-btn");
const coinBadge = document.getElementById("coin-badge");
const coinLockBanner = document.getElementById("coin-lock-banner");

/* =====================================================================
   GİRİŞ / QEYDİYYAT MƏNTİQİ
===================================================================== */

let authMode = "login"; // "login" | "register"

tabLogin.addEventListener("click", () => setAuthMode("login"));
tabRegister.addEventListener("click", () => setAuthMode("register"));

function setAuthMode(mode) {
  authMode = mode;
  tabLogin.classList.toggle("active", mode === "login");
  tabRegister.classList.toggle("active", mode === "register");
  authSubmitBtn.textContent = mode === "login" ? "Giriş et" : "Qeydiyyatdan keç";
  authErrorEl.style.display = "none";
}

// Firebase-in texniki xəta kodlarını anlaşılan mesajlara çeviririk
function friendlyAuthError(error) {
  const map = {
    "auth/email-already-in-use": "Bu email artıq qeydiyyatdan keçib — Giriş sekmesinə keç.",
    "auth/invalid-email": "Email ünvanı düzgün formatda deyil.",
    "auth/weak-password": "Şifrə ən azı 6 simvol olmalıdır.",
    "auth/user-not-found": "Bu email ilə hesab tapılmadı.",
    "auth/wrong-password": "Şifrə səhvdir.",
    "auth/invalid-credential": "Email və ya şifrə səhvdir.",
    "auth/too-many-requests": "Çox sayda cəhd oldu, bir az sonra yenidən yoxla.",
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

logoutBtn.addEventListener("click", () => {
  auth.signOut();
  settingsOverlay.classList.remove("open");
});

// Auth vəziyyətini izləyirik
auth.onAuthStateChanged(async (user) => {
  loadingScreen.style.display = "none";

  if (user) {
    currentUser = user;
    accountEmailEl.textContent = user.email;
    authScreen.classList.remove("visible");
    chatScreen.classList.add("visible");

    await loadMessageHistory();
    listenToCoinBalance();
    checkBackendHealth();
  } else {
    currentUser = null;
    chatScreen.classList.remove("visible");
    authScreen.classList.add("visible");
  }
});

/* =====================================================================
   FIRESTORE: mesaj tarixçəsini oxumaq/yazmaq
===================================================================== */

async function loadMessageHistory() {
  chatEl.querySelectorAll(".row").forEach((el) => el.remove());
  state.messages = [];

  const snapshot = await db
    .collection("users").doc(currentUser.uid)
    .collection("messages")
    .orderBy("timestamp", "asc")
    .get();

  if (snapshot.empty) {
    emptyStateEl.style.display = "block";
    return;
  }

  emptyStateEl.style.display = "none";
  snapshot.forEach((doc) => {
    const m = doc.data();
    state.messages.push({ role: m.role, content: m.content });
    appendBubble(m.role === "user" ? "user" : "assistant", m.content);
  });
}

async function saveMessageToFirestore(role, content) {
  if (!currentUser) return;
  try {
    await db
      .collection("users").doc(currentUser.uid)
      .collection("messages")
      .add({
        role: role,
        content: content,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      });
  } catch (err) {
    console.error("Firestore-a yazıla bilmədi:", err);
  }
}

/* =====================================================================
   KOİN SİSTEMİ
===================================================================== */

function listenToCoinBalance() {
  if (unsubscribeCoinListener) unsubscribeCoinListener();

  unsubscribeCoinListener = db.collection("users").doc(currentUser.uid)
    .onSnapshot(async (docSnap) => {
      if (!docSnap.exists) return;

      const data = docSnap.data();
      state.coin = data.coin ?? 0;
      state.coinResetAt = data.coinResetAt ? data.coinResetAt.toDate() : null;

      if (state.coin <= 0 && !state.coinResetAt) {
        await db.collection("users").doc(currentUser.uid).update({
          coinResetAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        return;
      }

      renderCoinUI();
    });
}

function renderCoinUI() {
  coinBadge.textContent = "🪙 " + state.coin;

  const locked = isChatLocked();
  inputEl.disabled = locked;
  sendBtn.disabled = locked;
  coinLockBanner.style.display = locked ? "block" : "none";

  if (locked) updateLockCountdownText();
}

function isChatLocked() {
  if (state.coin > 0) return false;
  if (!state.coinResetAt) return true;
  const reopensAt = state.coinResetAt.getTime() + 60 * 60 * 1000;
  return Date.now() < reopensAt;
}

function updateLockCountdownText() {
  if (!state.coinResetAt) {
    coinLockBanner.textContent = "Koinləriniz bitib.";
    return;
  }
  const reopensAt = state.coinResetAt.getTime() + 60 * 60 * 1000;
  const remainingMs = reopensAt - Date.now();

  if (remainingMs <= 0) {
    tryResetCoins();
    return;
  }
  const mins = Math.floor(remainingMs / 60000);
  const secs = Math.floor((remainingMs % 60000) / 1000);
  coinLockBanner.textContent =
    `Koinləriniz bitib — ${mins} dəq ${secs} san sonra yenidən yaza bilərsiniz.`;
}

async function tryResetCoins() {
  if (!currentUser || !state.coinResetAt) return;
  const reopensAt = state.coinResetAt.getTime() + 60 * 60 * 1000;
  if (Date.now() >= reopensAt) {
    await db.collection("users").doc(currentUser.uid).update({
      coin: 10,
      coinResetAt: null,
    });
  }
}

/* =====================================================================
   KÖMƏKÇİ FUNKSİYALAR
===================================================================== */

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
  wrapper.appendChild(bubble);
  wrapper.appendChild(time);
  row.appendChild(wrapper);

  chatEl.appendChild(row);
  scrollToBottom();
  return row;
}

function showTypingIndicator() {
  const row = document.createElement("div");
  row.className = "row assistant";
  row.id = "typing-row";
  row.innerHTML = `<div class="bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
  chatEl.appendChild(row);
  scrollToBottom();
  return row;
}

/* =====================================================================
   BACKEND İLƏ ƏLAQƏ (FastAPI)
===================================================================== */

async function checkBackendHealth() {
  statusDot.className = "status-dot checking";
  statusText.textContent = "yoxlanılır…";
  try {
    const res = await fetch(API_URL + "/health", { method: "GET" });
    if (!res.ok) throw new Error("health check failed");
    statusDot.className = "status-dot online";
    statusText.textContent = "qoşulub";
  } catch (err) {
    statusDot.className = "status-dot offline";
    statusText.textContent = "qoşulmayıb";
  }
}

async function sendMessageToBackend(userText) {
  if (isChatLocked()) return;

  appendBubble("user", userText);
  state.messages.push({ role: "user", content: userText });
  saveMessageToFirestore("user", userText);

  db.collection("users").doc(currentUser.uid).update({
    coin: firebase.firestore.FieldValue.increment(-1),
  });

  const typingRow = showTypingIndicator();
  state.isSending = true;
  sendBtn.disabled = true;

  try {
    const res = await fetch(API_URL + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: state.messages, system_prompt: DEFAULT_SYSTEM_PROMPT }),
    });

    const data = await res.json();
    typingRow.remove();

    if (!res.ok) throw new Error(data.detail || "Naməlum server xətası");

    appendBubble("assistant", data.response);
    state.messages.push({ role: "assistant", content: data.response });
    saveMessageToFirestore("assistant", data.response);

  } catch (err) {
    typingRow.remove();
    appendBubble("error", "Serverə qoşula bilmədim: " + err.message);
  } finally {
    state.isSending = false;
    sendBtn.disabled = false;
  }
}

/* =====================================================================
   HADİSƏ DİNLƏYİCİLƏRİ
===================================================================== */

composerEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text || state.isSending) return;
  inputEl.value = "";
  inputEl.style.height = "auto";
  sendMessageToBackend(text);
});

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    composerEl.requestSubmit();
  }
});

inputEl.addEventListener("input", () => {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
});

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => sendMessageToBackend(chip.dataset.prompt));
});

settingsBtn.addEventListener("click", () => {
  settingsOverlay.classList.add("open");
});
closeSettingsBtn.addEventListener("click", () => settingsOverlay.classList.remove("open"));
settingsOverlay.addEventListener("click", (e) => {
  if (e.target === settingsOverlay) settingsOverlay.classList.remove("open");
});

clearChatBtn.addEventListener("click", () => {
  state.messages = [];
  chatEl.querySelectorAll(".row").forEach((el) => el.remove());
  emptyStateEl.style.display = "block";
  settingsOverlay.classList.remove("open");
});

/* =====================================================================
   BAŞLANĞIC
===================================================================== */

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

setInterval(() => { if (currentUser) checkBackendHealth(); }, 30000);
setInterval(() => { if (currentUser && isChatLocked()) updateLockCountdownText(); }, 1000);
