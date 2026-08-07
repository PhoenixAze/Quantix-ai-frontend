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
  currentConversationId: null, // Hazırda hansı söhbətdəyik (yeni söhbətdə null olur)
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
const micSendBtn = document.getElementById("mic-send-btn");

const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");

const clearChatBtn = document.getElementById("clear-chat-btn");
const accountEmailEl = document.getElementById("account-email");
const logoutBtn = document.getElementById("logout-btn");
const coinBadge = document.getElementById("coin-badge");
const profileCoinEl = document.getElementById("profile-coin");
const coinLockBanner = document.getElementById("coin-lock-banner");

// Yeni naviqasiya elementləri
const menuBtn = document.getElementById("menu-btn");
const trophyBtn = document.getElementById("trophy-btn");
const cameraBtn = document.getElementById("camera-btn");
const navTabs = document.querySelectorAll(".nav-tab");
const screens = document.querySelectorAll(".screen");
const toastEl = document.getElementById("toast");
const appEl = document.getElementById("app");

// Söhbət tarixçəsi paneli elementləri
const historyOverlay = document.getElementById("history-overlay");
const closeHistoryBtn = document.getElementById("close-history-btn");
const newChatBtn = document.getElementById("new-chat-btn");
const historyListEl = document.getElementById("history-list");

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
});

// Auth vəziyyətini izləyirik
auth.onAuthStateChanged(async (user) => {
  loadingScreen.style.display = "none";

  if (user) {
    currentUser = user;
    accountEmailEl.textContent = user.email;
    authScreen.classList.remove("visible");
    chatScreen.classList.add("visible");

    startNewConversation(); // hər girişdə təzə söhbətlə başlayırıq, köhnələr ☰-də qalır
    listenToCoinBalance();
    checkBackendHealth();
  } else {
    currentUser = null;
    chatScreen.classList.remove("visible");
    authScreen.classList.add("visible");
  }
});

/* =====================================================================
   FIRESTORE: söhbətlər və mesajlar

   Quruluş:
   users/{uid}/conversations/{conversationId}                → { title, createdAt, updatedAt }
   users/{uid}/conversations/{conversationId}/messages/{id}  → { role, content, timestamp }
===================================================================== */

// Ekranı təmizləyir və "hazırkı söhbət yoxdur" vəziyyətinə qaytarır.
// Növbəti mesaj göndəriləndə saveMessageToFirestore YENİ bir söhbət yaradacaq.
function startNewConversation() {
  state.currentConversationId = null;
  state.messages = [];
  chatEl.querySelectorAll(".row").forEach((el) => el.remove());
  emptyStateEl.style.display = "block";
}

// Verilmiş id-li söhbəti açır: mesajlarını Firestore-dan çəkib ekrana yazır
async function openConversation(conversationId) {
  state.currentConversationId = conversationId;
  state.messages = [];
  chatEl.querySelectorAll(".row").forEach((el) => el.remove());
  closeHistoryDrawer();

  const snapshot = await db
    .collection("users").doc(currentUser.uid)
    .collection("conversations").doc(conversationId)
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

// Bir mesajı Firestore-a yazır. Bu, cari söhbətin İLK mesajıdırsa
// (currentConversationId hələ null-dursa), əvvəlcə yeni bir "söhbət"
// sənədi yaradır və başlığını mesajın özündən düzəldir.
async function saveMessageToFirestore(role, content) {
  if (!currentUser) return;
  try {
    if (!state.currentConversationId) {
      const title = content.length > 40 ? content.slice(0, 40) + "…" : content;
      const convRef = await db
        .collection("users").doc(currentUser.uid)
        .collection("conversations")
        .add({
          title: title,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
      state.currentConversationId = convRef.id;
    } else {
      // Söhbət artıq mövcuddur — sadəcə "son yenilənmə" vaxtını təzələyirik ki,
      // tarixçə siyahısında ən son yazışdığın söhbət başda görünsün
      await db
        .collection("users").doc(currentUser.uid)
        .collection("conversations").doc(state.currentConversationId)
        .update({ updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    }

    await db
      .collection("users").doc(currentUser.uid)
      .collection("conversations").doc(state.currentConversationId)
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

/* ---- ☰ Tarixçə paneli: açmaq/bağlamaq və siyahını doldurmaq ---- */

function openHistoryDrawer() {
  historyOverlay.classList.add("open");
  loadConversationList();
}
function closeHistoryDrawer() {
  historyOverlay.classList.remove("open");
}

// Söhbətin tarixini göstərir: bu gündürsə saat, deyilsə tarix+saat
function formatHistoryDate(date) {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString("az-AZ", { hour: "2-digit", minute: "2-digit" });
  if (isToday) return time;
  return date.toLocaleDateString("az-AZ", { day: "2-digit", month: "2-digit" }) + " " + time;
}

// Mətni innerHTML-ə yazmazdan əvvəl "təmizləyir" — istifadəçi mesajının
// içində < > kimi işarələr olsa belə, bu HTML kimi şərh olunmasın deyə
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Keçmiş söhbətlərin siyahısını Firestore-dan çəkib panelə yazır
async function loadConversationList() {
  historyListEl.innerHTML = `<div class="history-empty">yüklənir…</div>`;

  const snapshot = await db
    .collection("users").doc(currentUser.uid)
    .collection("conversations")
    .orderBy("updatedAt", "desc")
    .get();

  if (snapshot.empty) {
    historyListEl.innerHTML = `<div class="history-empty">Hələ söhbət tarixçəsi yoxdur</div>`;
    return;
  }

  historyListEl.innerHTML = "";
  snapshot.forEach((doc) => {
    const conv = doc.data();
    const btn = document.createElement("button");
    btn.className = "history-item" + (doc.id === state.currentConversationId ? " active" : "");
    btn.innerHTML = `
      <span class="title">${escapeHtml(conv.title || "Adsız söhbət")}</span>
      <span class="date">${conv.updatedAt ? formatHistoryDate(conv.updatedAt.toDate()) : ""}</span>
    `;
    btn.addEventListener("click", () => openConversation(doc.id));
    historyListEl.appendChild(btn);
  });
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
  // Bunu GÖZLƏYİRİK (await) — əgər bu, söhbətin ilk mesajıdırsa, yeni
  // söhbət sənədi məhz bu addımda yaranır. AI cavabını bir az aşağıda
  // eyni söhbətə yazacağıq, ona görə əvvəlcə bunun bitməsi lazımdır.
  await saveMessageToFirestore("user", userText);

  db.collection("users").doc(currentUser.uid).update({
    coin: firebase.firestore.FieldValue.increment(-1),
  });

  const typingRow = showTypingIndicator();
  state.isSending = true;
  micSendBtn.disabled = true;

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
    micSendBtn.disabled = false;
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
  micSendBtn.classList.remove("is-send"); // göndərdikdən sonra yenidən mikrofon ikonuna qayıt
  micSendBtn.setAttribute("aria-label", "Səslə yaz");
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

  // Mətn yazılıbsa mikrofon ikonu göndərmə oxuna çevrilir, boşdursa geri qayıdır
  const hasText = inputEl.value.trim().length > 0;
  micSendBtn.classList.toggle("is-send", hasText);
  micSendBtn.setAttribute("aria-label", hasText ? "Göndər" : "Səslə yaz");
});

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => sendMessageToBackend(chip.dataset.prompt));
});

clearChatBtn.addEventListener("click", () => {
  startNewConversation();
});

/* =====================================================================
   NAVİQASİYA: yuxarı zolaq (topbar) + aşağı tab paneli (bottom-nav) + toast
===================================================================== */

let toastTimer = null;

// Ekranın altında qısa müddətə görünüb yox olan kiçik bir bildiriş göstərir.
// "İşlər aparılır..." kimi hələ hazır olmayan bölmələr üçün istifadə olunur.
function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("visible"), 2000);
}

// Verilən ada uyğun ekranı göstərir, qalanlarını gizlədir, aşağı
// paneldə də uyğun ikonu "aktiv" (işıqlı) edir.
function switchScreen(name) {
  screens.forEach((s) => s.classList.toggle("active", s.dataset.screen === name));
  navTabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
}

// Aşağı paneldəki 5 ikon: Çat və Profil əsl ekranlara keçir,
// qalan 3-ü (Yazı/Taymer/Statistika) hələlik placeholder ekranını göstərir —
// funksionallıq əlavə olunana qədər hər ikisi eyni koddan keçir, sadəcə
// həmin ekranların içi "İşlər aparılır..." yazısıdır.
navTabs.forEach((tab) => {
  tab.addEventListener("click", () => switchScreen(tab.dataset.tab));
});

// Yuxarı zolaqdakı ☰ artıq söhbət tarixçəsi panelini açır (əvvəlcə toast idi).
// 🏆 kubok və composer-dəki kamera düyməsi hələ də placeholder-dir.
menuBtn.addEventListener("click", () => openHistoryDrawer());
trophyBtn.addEventListener("click", () => showToast("İşlər aparılır..."));
cameraBtn.addEventListener("click", () => showToast("İşlər aparılır..."));

// Tarixçə panelini bağlamaq: X düyməsi və ya qara fonun üstünə klik
closeHistoryBtn.addEventListener("click", () => closeHistoryDrawer());
historyOverlay.addEventListener("click", (e) => {
  if (e.target === historyOverlay) closeHistoryDrawer();
});

// "+ Yeni söhbət": ekranı təmizləyir, paneli bağlayır
newChatBtn.addEventListener("click", () => {
  startNewConversation();
  closeHistoryDrawer();
});

// Mikrofon/Göndər ikili düyməsi: yazı sahəsi boşdursa mikrofon funksiyası
// hələ hazır olmadığı üçün toast göstərir; mətn yazılıbsa (is-send aktivdirsə)
// eyni composer submit axınını işə salır (Enter düyməsi ilə eyni yol).
micSendBtn.addEventListener("click", () => {
  if (micSendBtn.classList.contains("is-send")) {
    composerEl.requestSubmit();
  } else {
    showToast("İşlər aparılır...");
  }
});

/* =====================================================================
   KLAVİATURA UYĞUNLAŞMASI
   Telefonda klaviatura açılanda mobil brauzerlər səhifənin görünən
   sahəsini ("visual viewport") kiçildir, amma #app-ın hündürlüyü
   avtomatik uyğunlaşmadıqda aşağıdakı yazı qutusu klaviaturanın
   altında "gizlənir". Bunun qarşısını #app-ın hündürlüyünü əl ilə
   görünən sahəyə bağlayaraq alırıq — nəticədə digər yazışma
   proqramlarında olduğu kimi ekran klaviaturaya uyğun "bölünür".
===================================================================== */

function adjustForKeyboard() {
  if (!window.visualViewport) return;
  const vv = window.visualViewport;
  appEl.style.height = vv.height + "px"; // görünən sahə nə qədərdirsə, #app da o qədər
  scrollToBottom(); // input yuxarı sürüşəndə son mesaj həmişə görünsün
}

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", adjustForKeyboard);
  window.visualViewport.addEventListener("scroll", adjustForKeyboard);
}

// Yazı sahəsinə toxunanda bir az gecikmə ilə yenidən yoxlayırıq —
// bəzi Android klaviaturalarında ilk açılış anında viewport hələ
// tam yenilənməmiş olur
inputEl.addEventListener("focus", () => {
  setTimeout(adjustForKeyboard, 300);
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
