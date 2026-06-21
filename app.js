const STORAGE_KEY = "badminton-credit-manager.v1";
const AUTH_STORAGE_KEY = "badminton-credit-manager.auth.v1";
const CLOUD_CONFIG_KEY = "badminton-credit-manager.cloud.v1";
const HK_TIMEZONE = "Asia/Hong_Kong";
const HTML_APP_CONFIG = typeof window !== "undefined" ? (window.BFAHK_CONFIG || {}) : {};
const APP_VERSION = "BFAHK-20260621-sheet-password-auth-v16";
const DEFAULT_CLOUD_WEB_APP_URL = String(HTML_APP_CONFIG.cloudWebAppUrl || "https://script.google.com/macros/s/AKfycbyUn_A9OvSGxld8eyFKKfRwLOF39HPGnhJ_e3csQ4LTK0asJNO2UwTd-5-a41KyY40w/exec").trim();
console.log(`BFAHK app loaded: ${APP_VERSION}`);
console.log(`BFAHK backend URL: ${DEFAULT_CLOUD_WEB_APP_URL}`);
const PUBLIC_VIEWS = new Set(["attendance", "auth"]);

let state = loadState();
let cloudConfig = loadCloudConfig();
let authState = loadAuthState();
let currentView = "dashboard";
let pendingProtectedView = "dashboard";
let activeMessageStudentId = null;
let cloudSaveTimer = null;
let isApplyingRemoteState = false;

const titles = {
  dashboard: "今日成效",
  students: "學員收費",
  attendance: "小組點名",
  schedule: "新增課堂",
  revenue: "收入",
  renewals: "續費通知",
  auth: "帳戶登入",
};

const attendanceLabels = {
  pending: "未出席",
  present: "出席",
  absent: "缺席",
};

const creditActionLabels = {
  deduct: "扣 1 credit",
  charge: "缺席-1",
  keep: "保留-0",
  makeup: "補堂-0",
  waive: "保留-0",
};

const roleLabels = {
  founder: "創辦人",
  coach: "教練",
  frontdesk: "前台",
};

const metricStyles = ["green", "blue", "amber", "coral"];

document.addEventListener("DOMContentLoaded", init);

function init() {
  moveScheduleForm();
  wireBrandFallback();
  wireNavigation();
  wireAuth();
  wireCloudSync();
  wireForms();
  wireAttendance();
  wireRevenue();
  wireRenewals();
  setInitialDates();
  renderAll();
  updateAuthUI();
  renderCloudStatus();
  setView(isAuthenticated() ? defaultViewForCurrentUser() : "auth");
  syncFromCloud({ silent: true });
}

function wireBrandFallback() {
  const logo = document.querySelector(".brand-logo");
  const fallback = document.querySelector(".brand-fallback");
  if (!logo || !fallback) return;

  logo.addEventListener("error", () => {
    logo.hidden = true;
    fallback.hidden = false;
  }, { once: true });
}

function moveScheduleForm() {
  const form = document.getElementById("sessionForm");
  const mount = document.getElementById("scheduleFormMount");
  if (form && mount && !mount.contains(form)) mount.appendChild(form);
}

function defaultState() {
  const today = hkTodayISO();
  const yesterday = addDaysISO(today, -1);
  const nextWeek = addDaysISO(today, 7);

  return {
    club: {
      name: "Beyond Fitness Academy Hong Kong",
      seasonName: "2026 夏季班",
      nextSeasonName: "2026 秋季班",
      defaultOffer: "早鳥優惠減 HK$100，今個星期內確認可保留原班時段。",
    },
    users: [],
    students: [
      {
        id: "s1",
        name: "陳曉晴",
        phone: "85261234567",
        group: "U12 小組A",
        nextSeasonPrice: 1680,
        offer: "早鳥優惠減 HK$100，連報兩季可優先保留週三 18:00 名額。",
        openingUsedCredits: 5,
      },
      {
        id: "s2",
        name: "林浩然",
        phone: "85262345678",
        group: "U12 小組A",
        nextSeasonPrice: 1600,
        offer: "舊生價 HK$1,500，如本週完成付款可免行政費。",
        openingUsedCredits: 6,
      },
      {
        id: "s3",
        name: "黃凱彤",
        phone: "85263456789",
        group: "U12 小組A",
        nextSeasonPrice: 2100,
        offer: "技術提升班加購個人訓練可享 9 折。",
        openingUsedCredits: 6,
      },
      {
        id: "s4",
        name: "何卓謙",
        phone: "85264567890",
        group: "U12 小組A",
        nextSeasonPrice: 1500,
        offer: "兄弟姊妹同行報名，每位減 HK$80。",
        openingUsedCredits: 6,
      },
      {
        id: "s5",
        name: "李敏芝",
        phone: "85265678901",
        group: "成人初階B",
        nextSeasonPrice: 980,
        offer: "成人班 4 堂 package 續報可保留週三 19:30 時段。",
        openingUsedCredits: 3,
      },
      {
        id: "s6",
        name: "周俊朗",
        phone: "85266789012",
        group: "成人初階B",
        nextSeasonPrice: 1200,
        offer: "二人同行每位減 HK$60。",
        openingUsedCredits: 2,
      },
    ],
    payments: [
      {
        id: "p1",
        studentId: "s1",
        date: addDaysISO(today, -18),
        packageName: "小組班 8 堂",
        credits: 8,
        amount: 1600,
        method: "FPS",
        note: "夏季 package",
        createdAt: `${yesterday}T09:15:00+08:00`,
      },
      {
        id: "p2",
        studentId: "s2",
        date: addDaysISO(today, -20),
        packageName: "小組班 8 堂",
        credits: 8,
        amount: 1500,
        method: "PayMe",
        note: "舊生優惠",
        createdAt: `${yesterday}T09:18:00+08:00`,
      },
      {
        id: "p3",
        studentId: "s3",
        date: addDaysISO(today, -22),
        packageName: "進階小組 10 堂",
        credits: 10,
        amount: 2100,
        method: "FPS",
        note: "個別價錢",
        createdAt: `${yesterday}T09:21:00+08:00`,
      },
      {
        id: "p4",
        studentId: "s4",
        date: addDaysISO(today, -24),
        packageName: "小組班 8 堂",
        credits: 8,
        amount: 1440,
        method: "現金",
        note: "兄弟姊妹優惠",
        createdAt: `${yesterday}T09:25:00+08:00`,
      },
      {
        id: "p5",
        studentId: "s5",
        date: addDaysISO(today, -12),
        packageName: "成人班 4 堂",
        credits: 4,
        amount: 980,
        method: "FPS",
        note: "",
        createdAt: `${yesterday}T09:30:00+08:00`,
      },
      {
        id: "p6",
        studentId: "s6",
        date: addDaysISO(today, -10),
        packageName: "成人班 6 堂",
        credits: 6,
        amount: 1200,
        method: "銀行轉帳",
        note: "",
        createdAt: `${yesterday}T09:34:00+08:00`,
      },
    ],
    sessions: [
      {
        id: "c1",
        date: today,
        time: "18:00",
        groupName: "U12 小組A",
        coach: "Coach 梁",
        studentIds: ["s1", "s2", "s3", "s4"],
        status: "completed",
        completedAt: `${today}T19:07:00+08:00`,
        attendance: {
          s1: attendanceRecord("present", "deduct", 1, 200),
          s2: attendanceRecord("absent", "charge", 1, 187.5),
          s3: attendanceRecord("present", "deduct", 1, 210),
          s4: attendanceRecord("absent", "makeup", 0, 0),
        },
      },
      {
        id: "c2",
        date: today,
        time: "19:30",
        groupName: "成人初階B",
        coach: "Coach 梁",
        studentIds: ["s5", "s6"],
        status: "scheduled",
        attendance: {
          s5: attendanceRecord("pending", "deduct", 0, 0),
          s6: attendanceRecord("pending", "deduct", 0, 0),
        },
      },
      {
        id: "c3",
        date: nextWeek,
        time: "18:00",
        groupName: "U12 小組A",
        coach: "Coach 梁",
        studentIds: ["s1", "s2", "s3", "s4"],
        status: "scheduled",
        attendance: {
          s1: attendanceRecord("pending", "deduct", 0, 0),
          s2: attendanceRecord("pending", "deduct", 0, 0),
          s3: attendanceRecord("pending", "deduct", 0, 0),
          s4: attendanceRecord("pending", "deduct", 0, 0),
        },
      },
    ],
  };
}

function attendanceRecord(status, creditAction, creditUsed, earned) {
  return {
    status,
    creditAction,
    creditUsed,
    earned,
    unitRate: creditUsed ? earned / creditUsed : 0,
    markedAt: new Date().toISOString(),
  };
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultState();

  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    return defaultState();
  }
}

function normalizeState(parsed = {}) {
  const base = defaultState();
  const normalized = {
    ...base,
    ...parsed,
    club: {
      ...base.club,
      ...(parsed.club || {}),
      name: "Beyond Fitness Academy Hong Kong",
    },
    users: Array.isArray(parsed.users) && parsed.users.length
      ? parsed.users
      : base.users,
    students: Array.isArray(parsed.students) ? parsed.students : [],
    payments: Array.isArray(parsed.payments) ? parsed.payments : [],
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
  };

  // Google Sheet / Apps Script 可能會把日期回傳成 Date 字串、ISO 字串、
  // dd/mm/yyyy 或 Google Sheet 日期序號。登入後會即時渲染畫面，
  // 如不先統一日期格式，Intl.DateTimeFormat 會拋出 Invalid time value。
  normalized.payments = normalized.payments.map((payment) => ({
    ...payment,
    date: normalizeIsoDate(payment.date, hkTodayISO()),
    createdAt: normalizeIsoDateTime(payment.createdAt),
  }));

  normalized.sessions = normalized.sessions.map((session) => {
    const attendance = {};
    Object.entries(session.attendance || {}).forEach(([studentId, record]) => {
      attendance[studentId] = {
        ...(record || {}),
        markedAt: normalizeIsoDateTime(record?.markedAt),
      };
    });

    return {
      ...session,
      date: normalizeIsoDate(session.date, hkTodayISO()),
      time: normalizeTime(session.time, "18:00"),
      completedAt: session.completedAt ? normalizeIsoDateTime(session.completedAt) : session.completedAt,
      attendance,
    };
  });

  return normalized;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  const status = document.getElementById("storageStatus");
  if (status) status.textContent = `已儲存 ${formatTime(new Date())}`;
  if (!isApplyingRemoteState) scheduleCloudSave();
}

function isAppsScriptExecUrl(value) {
  return /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec(?:[?#].*)?$/.test(String(value || "").trim());
}

function normalizeCloudWebAppUrl(value) {
  const url = String(value || "").trim();
  if (isAppsScriptExecUrl(url)) return url;
  if (isAppsScriptExecUrl(DEFAULT_CLOUD_WEB_APP_URL)) return DEFAULT_CLOUD_WEB_APP_URL;
  return url;
}

function loadCloudConfig() {
  try {
    const raw = localStorage.getItem(CLOUD_CONFIG_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return { webAppUrl: normalizeCloudWebAppUrl(DEFAULT_CLOUD_WEB_APP_URL || parsed.webAppUrl || "") };
  } catch {
    return { webAppUrl: normalizeCloudWebAppUrl(DEFAULT_CLOUD_WEB_APP_URL || "") };
  }
}

function saveCloudConfig(config = {}) {
  cloudConfig = { webAppUrl: normalizeCloudWebAppUrl(config.webAppUrl || DEFAULT_CLOUD_WEB_APP_URL || "") };
  localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(cloudConfig));
  renderCloudStatus();
}

function hasCloudUrl() {
  return isAppsScriptExecUrl(cloudConfig.webAppUrl);
}

function wireCloudSync() {
  const saveButton = document.getElementById("saveCloudConfigButton");
  const pullButton = document.getElementById("pullCloudButton");
  const pushButton = document.getElementById("pushCloudButton");

  if (saveButton) {
    saveButton.addEventListener("click", () => {
      const input = document.getElementById("cloudWebAppUrl");
      saveCloudConfig({ webAppUrl: input?.value || DEFAULT_CLOUD_WEB_APP_URL || "" });
      showToast(hasCloudUrl() ? "Google Sheet 連接已儲存" : "已清除 Google Sheet 連接");
    });
  }

  if (pullButton) {
    pullButton.addEventListener("click", () => {
      syncFromCloud({ silent: false });
    });
  }

  if (pushButton) {
    pushButton.addEventListener("click", () => {
      pushStateToCloud({ silent: false });
    });
  }

  window.setInterval(() => {
    if (document.hidden || !hasCloudUrl() || !isAuthenticated()) return;
    syncFromCloud({ silent: true });
  }, 30000);
}

function renderCloudStatus(message = "") {
  const input = document.getElementById("cloudWebAppUrl");
  const status = document.getElementById("cloudStatusText");

  if (input) input.value = cloudConfig.webAppUrl || DEFAULT_CLOUD_WEB_APP_URL || "";
  if (!status) return;

  status.textContent = message || (hasCloudUrl()
    ? "已連接 Google Sheet"
    : "未設定 Google Sheet 連接");
}

function scheduleCloudSave() {
  if (!hasCloudUrl() || !isAuthenticated()) return;
  window.clearTimeout(cloudSaveTimer);
  cloudSaveTimer = window.setTimeout(() => {
    pushStateToCloud({ silent: true });
  }, 900);
}

async function cloudRequest(action, payload = {}, authOverride = null) {
  if (action === "saveState") {
    return cloudFormPostRequest(action, payload, authOverride, { opaqueOnTimeout: true, timeoutMs: 2500 });
  }

  try {
    return await cloudFormPostRequest(action, payload, authOverride, { timeoutMs: 6500 });
  } catch (error) {
    return cloudJsonpRequest(action, payload, authOverride);
  }
}

function cloudRequestPayload(action, payload = {}, authOverride = null) {
  const authSource = authOverride || authState || {};
  return {
    action,
    userEmail: authSource.email || "",
    sessionToken: authSource.sessionToken || "",
    payload: JSON.stringify(payload || {}),
  };
}

function appendQueryParams(url, params) {
  const query = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  return `${url}${url.includes("?") ? "&" : "?"}${query}`;
}

function cloudJsonpRequest(action, payload = {}, authOverride = null) {
  if (!hasCloudUrl()) return Promise.reject(new Error("未設定 Apps Script Web App URL"));

  return new Promise((resolve, reject) => {
    const callbackName = `__bfCloud_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Google Sheet 回應逾時，請檢查 Web App URL 或部署權限"));
    }, 15000);

    function cleanup() {
      window.clearTimeout(timeoutId);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (data) => {
      cleanup();
      if (!data || !data.ok) {
        reject(new Error(data?.error || "Google Sheet API 發生錯誤"));
        return;
      }
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Google Sheet 連線失敗，請確認 URL 是 /exec 結尾、Apps Script 已重新部署，並允許 Web App 存取"));
    };

    script.src = appendQueryParams(cloudConfig.webAppUrl, {
      ...cloudRequestPayload(action, payload, authOverride),
      callback: callbackName,
    });
    document.body.appendChild(script);
  });
}

function cloudFormPostRequest(action, payload = {}, authOverride = null, options = {}) {
  if (!hasCloudUrl()) return Promise.reject(new Error("未設定 Apps Script Web App URL"));

  return new Promise((resolve, reject) => {
    const requestId = `bfCloud_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const frameName = `bfCloudFrame_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const iframe = document.createElement("iframe");
    const form = document.createElement("form");
    const timeoutMs = Number(options.timeoutMs || 30000);
    const cleanupId = window.setTimeout(() => {
      cleanup();
      if (options.opaqueOnTimeout) {
        resolve({ ok: true, opaque: true });
        return;
      }
      reject(new Error("Google Sheet 回應逾時，請確認 Apps Script 已重新部署"));
    }, timeoutMs);
    let cleaned = false;

    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      window.clearTimeout(cleanupId);
      window.removeEventListener("message", handleMessage);
      form.remove();
      iframe.remove();
    }

    function handleMessage(event) {
      const message = event.data || {};
      if (message.type !== "bfCloudResponse" || message.requestId !== requestId) return;

      cleanup();
      const data = message.data || {};
      if (!data.ok) {
        reject(new Error(data.error || "Google Sheet API 發生錯誤"));
        return;
      }
      resolve(data);
    }

    function addHiddenInput(name, value) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }

    iframe.name = frameName;
    iframe.hidden = true;
    form.method = "POST";
    form.action = cloudConfig.webAppUrl;
    form.target = frameName;
    form.hidden = true;

    const body = cloudRequestPayload(action, payload, authOverride);
    addHiddenInput("action", body.action);
    addHiddenInput("userEmail", body.userEmail);
    addHiddenInput("sessionToken", body.sessionToken);
    addHiddenInput("payload", body.payload);
    addHiddenInput("requestId", requestId);
    addHiddenInput("responseMode", "iframe");

    window.addEventListener("message", handleMessage);
    document.body.appendChild(iframe);
    document.body.appendChild(form);

    try {
      form.submit();
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

async function syncFromCloud({ silent } = { silent: false }) {
  if (!hasCloudUrl() || !isAuthenticated()) return;

  try {
    renderCloudStatus("正在從 Google Sheet 載入...");
    const data = await cloudRequest("getState");
    applyCloudData(data);
    renderCloudStatus(`已從 Google Sheet 載入 ${formatTime(new Date())}`);
    if (!silent) showToast("已從 Google Sheet 載入資料");
  } catch (error) {
    isApplyingRemoteState = false;
    renderCloudStatus(`Google Sheet 載入失敗：${error.message}`);
    if (authState?.pendingVerification) {
      saveAuthState(null);
      updateAuthUI();
      const authError = document.getElementById("authError");
      if (authError) {
        authError.textContent = `Google Sheet 未能驗證此帳戶：${error.message}`;
        authError.hidden = false;
      }
    }
    if (!silent) showToast(`Google Sheet 載入失敗：${error.message}`);
  }
}

async function pushStateToCloud({ silent } = { silent: false }) {
  if (!hasCloudUrl() || !isAuthenticated()) return;

  try {
    renderCloudStatus("正在上載到 Google Sheet...");
    const result = await cloudRequest("saveState", { state });
    const message = result.opaque
      ? `已送出到 Google Sheet ${formatTime(new Date())}`
      : `已上載到 Google Sheet ${formatTime(new Date())}`;
    renderCloudStatus(message);
    if (!silent) showToast(result.opaque ? "已送出到 Google Sheet" : "已上載到 Google Sheet");
  } catch (error) {
    renderCloudStatus(`Google Sheet 上載失敗：${error.message}`);
    if (!silent) showToast(`Google Sheet 上載失敗：${error.message}`);
  }
}

function loadAuthState() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed?.email || !parsed?.sessionToken) return null;
    if (!isSessionFresh(parsed)) return null;
    const user = findAllowedAccount(parsed.email);
    return user
      ? {
          ...user,
          sessionToken: parsed.sessionToken || "",
          expiresAt: parsed.expiresAt,
          signedInAt: parsed.signedInAt,
        }
      : null;
  } catch {
    return null;
  }
}

function saveAuthState(user) {
  authState = user;
  if (user) {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
}

function refreshAuthenticatedAccount() {
  if (!authState?.email) return;
  const account = currentAllowedAccounts().find((item) => item.email === normalizeEmail(authState.email));
  if (!account) return;
  saveAuthState({
    ...account,
    sessionToken: authState.sessionToken || "",
    expiresAt: authState.expiresAt,
    signedInAt: authState.signedInAt || new Date().toISOString(),
  });
}

function normalizeEmail(value) {
  return String(value || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .toLowerCase();
}

function isSessionFresh(auth = authState) {
  const expiresAt = Number(auth?.expiresAt || 0);
  return Boolean(expiresAt && expiresAt > Date.now() + 60000);
}

function roleLabel(role) {
  const normalized = String(role || "").trim().toLowerCase();
  return roleLabels[normalized] || String(role || "使用者");
}

function normalizeRoleKey(role) {
  const normalized = String(role || "").trim().toLowerCase();
  const compact = normalized.replace(/\s+/g, "");
  const aliases = {
    founder: "founder",
    owner: "founder",
    admin: "founder",
    "創辦人": "founder",
    coach: "coach",
    "教練": "coach",
    frontdesk: "frontdesk",
    "front desk": "frontdesk",
    reception: "frontdesk",
    "前台": "frontdesk",
  };
  return aliases[normalized] || aliases[compact] || normalized;
}

function isActiveUser(value) {
  if (value === false) return false;
  const normalized = String(value ?? true).trim().toLowerCase();
  return !["false", "0", "no", "inactive"].includes(normalized);
}

function normalizeUserAccount(account = {}) {
  const email = normalizeEmail(account.email || account.Email || account.userEmail || account.user_email);
  if (!email) return null;

  const role = account.role || account.Role || account.userRole || account.user_role || "user";
  const activeValue = account.active ?? account.Active ?? account.enabled ?? account.Enabled ?? true;
  const allowedGroups = account.allowedGroups || account.allowed_groups || account.AllowedGroups || account.Allowed_Groups || "all";
  const username = String(account.username || account.Username || account.login || account.Login || "").trim();

  return {
    email,
    username,
    role: roleLabel(role),
    roleKey: normalizeRoleKey(role),
    active: isActiveUser(activeValue),
    allowedGroups,
    note: account.note || account.Note || "由 Google Sheet Users 管理",
  };
}

function rowsToObjects(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  if (!Array.isArray(rows[0])) return rows;

  const headers = rows[0].map((header) => String(header || "").trim());
  return rows.slice(1).map((row) => {
    const item = {};
    headers.forEach((header, index) => {
      if (header) item[header] = row[index];
    });
    return item;
  });
}

function extractUsersFromCloudData(data = {}) {
  const candidates = [
    data.users,
    data.Users,
    data.state?.users,
    data.state?.Users,
    data.payload?.users,
    data.payload?.Users,
    data.sheets?.Users,
    data.sheets?.users,
    data.state?.sheets?.Users,
    data.state?.sheets?.users,
  ];

  for (const candidate of candidates) {
    const rows = rowsToObjects(candidate);
    const users = rows.map(normalizeUserAccount).filter(Boolean);
    if (users.length) return users;
  }

  return [];
}

function applyCloudData(data = {}) {
  const nextState = data.state ? normalizeState(data.state) : normalizeState(state);
  const users = extractUsersFromCloudData(data);

  if (users.length) {
    nextState.users = users;
  } else if (Array.isArray(nextState.users)) {
    nextState.users = nextState.users.map(normalizeUserAccount).filter(Boolean);
  } else {
    nextState.users = [];
  }

  isApplyingRemoteState = true;
  state = nextState;
  refreshAuthenticatedAccount();
  saveState();
  isApplyingRemoteState = false;
  renderAllowedAccounts();
  updateAuthUI();
  renderAll();
  return state;
}

function currentAllowedAccounts() {
  // 權限只以 Google Sheet 的 Users tab 為準；前端不再保留任何預設授權名單。
  return (state.users || [])
    .map(normalizeUserAccount)
    .filter((account) => account?.active);
}

function findAllowedAccount(email) {
  const normalized = normalizeEmail(email);
  return currentAllowedAccounts().find((item) => item.email === normalized) || null;
}

function isAuthenticated() {
  const account = authState?.email ? findAllowedAccount(authState.email) : null;
  return Boolean(authState?.sessionToken && isSessionFresh() && account);
}

function currentRoleKey() {
  const sheetAccount = authState?.email ? findAllowedAccount(authState.email) : null;
  return normalizeRoleKey(sheetAccount?.roleKey || sheetAccount?.role || authState?.roleKey || authState?.role);
}

function isCoachRole() {
  return currentRoleKey() === "coach";
}

function canAccessView(view) {
  if (view === "auth") return true;
  if (!isAuthenticated()) return !isProtectedView(view);
  if (isCoachRole()) return view === "attendance";
  return true;
}

function defaultViewForCurrentUser() {
  return isCoachRole() ? "attendance" : "dashboard";
}

function isProtectedView(view) {
  return !PUBLIC_VIEWS.has(view);
}

function requireAuthenticatedAccess(view = "dashboard") {
  if (isAuthenticated()) {
    if (canAccessView(view)) return true;
    showToast("此帳戶只可使用小組點名");
    setView(defaultViewForCurrentUser());
    return false;
  }

  pendingProtectedView = view;
  setView("auth");
  showToast("請先登入帳戶");
  return false;
}

function wireAuth() {
  const loginForm = document.getElementById("loginForm");
  const logoutButton = document.getElementById("logoutButton");

  if (loginForm) {
    loginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      handleSheetLogin();
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", () => {
      saveAuthState(null);
      updateAuthUI();
      renderAll();
      setView("attendance");
      showToast("已登出");
    });
  }

  renderAllowedAccounts();
}

async function handleSheetLogin() {
  const accountInput = document.getElementById("sheetLoginAccount");
  const passwordInput = document.getElementById("sheetLoginPassword");
  const status = document.getElementById("sheetAuthStatus");
  const error = document.getElementById("authError");
  const accountId = String(accountInput?.value || "").trim();
  const password = String(passwordInput?.value || "");

  if (!accountId || !password) {
    if (error) {
      error.textContent = "請輸入帳戶及密碼";
      error.hidden = false;
    }
    return;
  }

  try {
    if (error) error.hidden = true;
    if (status) status.textContent = "正在登入...";

    const data = await cloudFormPostRequest("login", { accountId, password }, null, { timeoutMs: 15000 });
    applyCloudData(data);

    const user = normalizeUserAccount(data.authUser || {});
    if (!user) throw new Error("登入回應沒有有效帳戶資料");

    saveAuthState({
      ...user,
      sessionToken: data.sessionToken || "",
      expiresAt: data.expiresAt || (Date.now() + 6 * 60 * 60 * 1000),
      signedInAt: new Date().toISOString(),
    });

    if (passwordInput) passwordInput.value = "";
    if (status) status.textContent = `已登入：${authState.role}`;
    updateAuthUI();
    renderAll();
    setView(defaultViewForCurrentUser());
    showToast(`已登入：${authState.role}`);
  } catch (loginError) {
    saveAuthState(null);
    updateAuthUI();
    if (status) status.textContent = "請檢查帳戶、密碼及 Users tab 權限";
    if (error) {
      error.textContent = `登入失敗：${friendlySheetAuthErrorMessage(loginError, accountId)}`;
      error.hidden = false;
    }
  }
}

function friendlySheetAuthErrorMessage(error, accountId = "") {
  const message = String(error?.message || error || "").trim();
  if (
    message.includes("沒有權限") ||
    message.toLowerCase().includes("not allowed") ||
    message.toLowerCase().includes("inactive")
  ) {
    return `此帳戶沒有權限：${accountId}`;
  }
  if (message.includes("密碼") || message.toLowerCase().includes("password")) {
    return "帳戶或密碼不正確";
  }
  return message || "未能登入";
}

function renderAllowedAccounts() {
  const list = document.getElementById("allowedAccountList");
  if (!list) return;

  const accounts = currentAllowedAccounts();
  list.innerHTML = accounts.length
    ? accounts.map((account) => `
      <div class="account-option">
        <span>
          <strong>${escapeHtml(account.role)}</strong>
          <span>${escapeHtml(account.email)}</span>
        </span>
        <span>${escapeHtml(account.note)}</span>
      </div>
    `).join("")
    : "";
}

function updateAuthUI() {
  const signedIn = isAuthenticated();
  const status = document.getElementById("authStatus");
  const text = document.getElementById("authStatusText");
  const logoutButton = document.getElementById("logoutButton");

  if (status) status.classList.toggle("is-signed-in", signedIn);
  if (text) {
    text.textContent = signedIn
      ? `${authState.role} · ${authState.email}`
      : authState?.pendingVerification
        ? `等待 Google Sheet 驗證 · ${authState.email}`
        : "未登入";
  }
  if (logoutButton) logoutButton.hidden = !signedIn && !authState?.pendingVerification;

  document.querySelectorAll("[data-view-target]").forEach((button) => {
    const target = button.dataset.viewTarget;
    const unavailableForRole = signedIn && !canAccessView(target);
    const locked = isProtectedView(target) && !signedIn;
    button.hidden = unavailableForRole;
    button.classList.toggle("is-locked", locked);
    button.title = locked ? "需要登入帳戶" : unavailableForRole ? "此帳戶沒有權限" : "";
  });
}

function wireNavigation() {
  document.querySelectorAll("[data-view-target]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.viewTarget));
  });

  document.querySelectorAll("[data-jump-view]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.jumpView));
  });

  const resetButton = document.getElementById("resetDemoButton");
  if (!resetButton) return;

  resetButton.addEventListener("click", () => {
    if (!isAuthenticated()) {
      pendingProtectedView = "dashboard";
      setView("auth");
      showToast("請先登入帳戶");
      return;
    }

    const confirmed = window.confirm("重設後會清除目前本機示範資料。是否繼續？");
    if (!confirmed) return;
    state = defaultState();
    saveState();
    setInitialDates();
    renderAll();
    showToast("已重設示範資料");
  });
}

function wireForms() {
  document.getElementById("studentSearch").addEventListener("input", renderStudents);

  document.getElementById("studentForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!requireAuthenticatedAccess("students")) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const student = {
      id: createId("s"),
      name: clean(data.get("name")),
      phone: normalizePhone(data.get("phone")),
      group: clean(data.get("group")),
      nextSeasonPrice: Number(data.get("nextSeasonPrice")) || 0,
      offer: clean(data.get("offer")) || state.club.defaultOffer,
      openingUsedCredits: 0,
    };

    state.students.push(student);
    saveState();
    form.reset();
    form.elements.nextSeasonPrice.value = "1680";
    renderAll();
    showToast(`已新增 ${student.name}`);
  });

  document.getElementById("paymentForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!requireAuthenticatedAccess("students")) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const payment = {
      id: createId("p"),
      studentId: data.get("studentId"),
      date: data.get("date") || hkTodayISO(),
      packageName: clean(data.get("packageName")),
      credits: Number(data.get("credits")) || 0,
      amount: Number(data.get("amount")) || 0,
      method: data.get("method"),
      note: clean(data.get("note")),
      createdAt: new Date().toISOString(),
    };

    state.payments.push(payment);
    saveState();
    form.elements.packageName.value = payment.packageName;
    form.elements.credits.value = String(payment.credits || 8);
    form.elements.amount.value = String(payment.amount || 1600);
    form.elements.note.value = "";
    renderAll();
    showToast("已記錄收費");
  });

  document.getElementById("sessionForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!requireAuthenticatedAccess("schedule")) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const studentIds = Array.from(form.elements.studentIds.selectedOptions).map((option) => option.value);

    if (!studentIds.length) {
      showToast("請選擇最少一名學員");
      return;
    }

    const attendance = {};
    studentIds.forEach((studentId) => {
      attendance[studentId] = attendanceRecord("pending", "deduct", 0, 0);
    });

    const session = {
      id: createId("c"),
      date: data.get("date") || hkTodayISO(),
      time: data.get("time") || "18:00",
      groupName: clean(data.get("groupName")),
      coach: clean(data.get("coach")),
      studentIds,
      status: "scheduled",
      attendance,
    };

    state.sessions.push(session);
    saveState();
    document.getElementById("attendanceDate").value = session.date;
    form.reset();
    form.elements.date.value = session.date;
    form.elements.time.value = "18:00";
    renderAll();
    setView("attendance");
    showToast("已建立課堂");
  });
}

function wireAttendance() {
  document.getElementById("attendanceDate").addEventListener("change", renderAttendance);

  document.getElementById("attendanceSessions").addEventListener("click", (event) => {
    const cycleCard = event.target.closest("[data-attendance-cycle]");
    if (cycleCard && !event.target.closest("[data-credit-action]")) {
      cycleAttendance(cycleCard.dataset.sessionId, cycleCard.dataset.studentId);
      return;
    }

    const statusButton = event.target.closest("[data-att-status]");
    if (statusButton) {
      markAttendance(
        statusButton.dataset.sessionId,
        statusButton.dataset.studentId,
        statusButton.dataset.attStatus,
      );
      return;
    }

    const completeButton = event.target.closest("[data-complete-session]");
    if (completeButton) {
      completeSession(completeButton.dataset.completeSession);
      return;
    }

    const reopenButton = event.target.closest("[data-reopen-session]");
    if (reopenButton) {
      reopenSession(reopenButton.dataset.reopenSession);
    }
  });

  document.getElementById("attendanceSessions").addEventListener("keydown", (event) => {
    const cycleCard = event.target.closest("[data-attendance-cycle]");
    if (!cycleCard || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    cycleAttendance(cycleCard.dataset.sessionId, cycleCard.dataset.studentId);
  });

  document.getElementById("attendanceSessions").addEventListener("change", (event) => {
    const select = event.target.closest("[data-credit-action]");
    if (!select) return;
    markAttendance(select.dataset.sessionId, select.dataset.studentId, "absent", select.value);
  });
}

function wireRevenue() {
  document.getElementById("revenueDate").addEventListener("change", (event) => {
    if (event.target.value) {
      document.getElementById("revenueMonth").value = event.target.value.slice(0, 7);
    }
    renderRevenue();
  });
  document.getElementById("revenueMonth").addEventListener("change", renderRevenue);
  document.getElementById("exportRevenueButton").addEventListener("click", exportRevenueCsv);
}

function wireRenewals() {
  document.getElementById("includeZeroCredits").addEventListener("change", renderRenewals);

  document.getElementById("renewalList").addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-message]");
    if (editButton) {
      openMessageModal(editButton.dataset.editMessage);
      return;
    }

    const notifyButton = event.target.closest("[data-notify-student]");
    if (notifyButton) {
      openWhatsappForStudent(notifyButton.dataset.notifyStudent);
    }
  });

  document.getElementById("dashboardRenewals").addEventListener("click", (event) => {
    const notifyButton = event.target.closest("[data-notify-student]");
    if (notifyButton) openMessageModal(notifyButton.dataset.notifyStudent);
  });

  document.getElementById("closeModalButton").addEventListener("click", closeMessageModal);
  document.getElementById("copyMessageButton").addEventListener("click", () => {
    copyText(document.getElementById("messageText").value);
  });
  document.getElementById("openWhatsappButton").addEventListener("click", () => {
    if (activeMessageStudentId) {
      openWhatsappForStudent(activeMessageStudentId, document.getElementById("messageText").value);
    }
  });
  document.getElementById("messageModal").addEventListener("click", (event) => {
    if (event.target.id === "messageModal") closeMessageModal();
  });
}

function setInitialDates() {
  const today = hkTodayISO();
  document.querySelector("#paymentForm [name='date']").value = today;
  document.querySelector("#sessionForm [name='date']").value = today;
  document.getElementById("attendanceDate").value = today;
  document.getElementById("revenueDate").value = today;
  document.getElementById("revenueMonth").value = today.slice(0, 7);
}

function setView(view) {
  if (isProtectedView(view) && !isAuthenticated()) {
    pendingProtectedView = view;
    view = "auth";
  }

  if (isAuthenticated() && !canAccessView(view)) {
    view = defaultViewForCurrentUser();
  }

  const previousView = currentView;
  currentView = view;
  const navView = view === "auth" ? pendingProtectedView : (view === "schedule" ? "attendance" : view);
  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("is-active", section.id === `view-${view}`);
  });
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.viewTarget === navView);
  });
  document.getElementById("viewTitle").textContent = titles[view] || "球會營運台";
  updateAuthUI();

  if (view === "attendance") renderAttendance();
  if (view === "revenue") renderRevenue();
  if (view === "renewals") renderRenewals();

  if (previousView !== view) {
    resetWindowScroll();
    requestAnimationFrame(resetWindowScroll);
    window.setTimeout(resetWindowScroll, 80);
  }
}

function resetWindowScroll() {
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  window.scrollTo(0, 0);
}

function renderAll() {
  renderDateLabels();
  renderSelects();
  renderAttendance();
  if (isAuthenticated()) {
    if (isCoachRole()) {
      clearProtectedViews("此帳戶只可使用小組點名");
    } else {
      renderDashboard();
      renderStudents();
      renderRevenue();
      renderRenewals();
    }
  } else {
    clearProtectedViews();
  }
}

function clearProtectedViews(message = "請先登入帳戶") {
  document.getElementById("dashboardMetrics").innerHTML = "";
  document.getElementById("todaySessionList").innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
  document.getElementById("dashboardRenewals").innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
  document.getElementById("studentTableBody").innerHTML = "";
  document.getElementById("revenueMetrics").innerHTML = "";
  document.getElementById("revenueTableBody").innerHTML = "";
  document.getElementById("monthlyRevenueMetrics").innerHTML = "";
  document.getElementById("monthlyRevenueBreakdown").innerHTML = "";
  document.getElementById("renewalList").innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function renderDateLabels() {
  const today = hkTodayISO();
  document.getElementById("hkDateLabel").textContent = formatDisplayDate(today);
  document.getElementById("todayRevenueMini").textContent = isAuthenticated() && !isCoachRole()
    ? formatMoney(getDailySummary(today).totalRevenue)
    : isCoachRole()
      ? "教練模式"
      : "登入後顯示";
  document.getElementById("dashboardSeason").textContent = state.club.seasonName;
}

function renderSelects() {
  const paymentSelect = document.getElementById("paymentStudentSelect");
  const selectedPaymentStudent = paymentSelect.value;
  paymentSelect.innerHTML = state.students
    .map((student) => `<option value="${student.id}">${escapeHtml(student.name)} · ${escapeHtml(student.group)}</option>`)
    .join("");
  if (state.students.some((student) => student.id === selectedPaymentStudent)) {
    paymentSelect.value = selectedPaymentStudent;
  }

  const sessionSelect = document.getElementById("sessionStudentSelect");
  const selectedSessionStudents = Array.from(sessionSelect.selectedOptions).map((option) => option.value);
  sessionSelect.innerHTML = state.students
    .map((student) => {
      const stats = getStudentStats(student.id);
      return `<option value="${student.id}">${escapeHtml(student.name)} · ${escapeHtml(student.group)} · ${stats.balance} credit</option>`;
    })
    .join("");
  selectedSessionStudents.forEach((studentId) => {
    const option = sessionSelect.querySelector(`option[value="${cssEscape(studentId)}"]`);
    if (option) option.selected = true;
  });
}

function renderDashboard() {
  const today = hkTodayISO();
  const summary = getDailySummary(today);
  const lowCreditStudents = getLowCreditStudents(false);
  const metrics = [
    {
      label: "今日賺得",
      value: formatMoney(summary.totalRevenue),
      detail: `${summary.chargedCredits} credit 已認列`,
    },
    {
      label: "完成課堂",
      value: `${summary.completedSessions}/${summary.totalSessions}`,
      detail: summary.pendingSessions ? `${summary.pendingSessions} 堂未完成` : "今日課堂已完成",
    },
    {
      label: "出席人次",
      value: String(summary.presentCount),
      detail: `${summary.absentCount} 人缺席`,
    },
    {
      label: "續費提醒",
      value: String(lowCreditStudents.length),
      detail: "剩餘 1 credit",
    },
  ];

  document.getElementById("dashboardMetrics").innerHTML = metrics
    .map((metric, index) => metricCard(metric, metricStyles[index]))
    .join("");

  const sessionsToday = state.sessions
    .filter((session) => session.date === today)
    .sort((a, b) => a.time.localeCompare(b.time));

  document.getElementById("todaySessionList").innerHTML = sessionsToday.length
    ? sessionsToday.map(todaySessionRow).join("")
    : `<div class="empty-state">今日未有課堂</div>`;

  document.getElementById("dashboardRenewals").innerHTML = lowCreditStudents.length
    ? lowCreditStudents.slice(0, 4).map(compactRenewalRow).join("")
    : `<div class="empty-state">暫時未有學員剩餘 1 credit</div>`;

  document.querySelectorAll("[data-session-jump]").forEach((button) => {
    button.addEventListener("click", () => {
      document.getElementById("attendanceDate").value = button.dataset.sessionDate;
      setView("attendance");
    });
  });
}

function renderStudents() {
  const search = document.getElementById("studentSearch").value.trim().toLowerCase();
  const rows = state.students
    .filter((student) => {
      const text = `${student.name} ${student.phone} ${student.group}`.toLowerCase();
      return !search || text.includes(search);
    })
    .map((student) => {
      const stats = getStudentStats(student.id);
      const latest = getLatestPayment(student.id);
      const lowClass = stats.balance <= 1 ? " low" : "";
      return `
        <tr>
          <td>
            <strong>${escapeHtml(student.name)}</strong>
            <div class="meta-line">${escapeHtml(student.phone)}</div>
          </td>
          <td>${escapeHtml(student.group)}</td>
          <td>${latest ? escapeHtml(latest.packageName) : "未有"}</td>
          <td class="number-cell">${stats.purchased}</td>
          <td class="number-cell">${stats.used}</td>
          <td class="number-cell balance-cell${lowClass}">${stats.balance}</td>
          <td class="number-cell">${formatMoney(stats.unitRate)}</td>
          <td>${latest ? `${formatDisplayDate(latest.date)} · ${formatMoney(latest.amount)}` : "未有紀錄"}</td>
        </tr>
      `;
    });

  document.getElementById("studentTableBody").innerHTML = rows.length
    ? rows.join("")
    : `<tr><td colspan="8">未找到學員</td></tr>`;
}

function renderAttendance() {
  const date = document.getElementById("attendanceDate").value || hkTodayISO();
  const sessions = state.sessions
    .filter((session) => session.date === date)
    .sort((a, b) => a.time.localeCompare(b.time));

  document.getElementById("attendanceSessions").innerHTML = sessions.length
    ? sessions.map(attendanceCard).join("")
    : `<div class="empty-state">此日期未有課堂</div>`;
}

function renderRevenue() {
  const date = document.getElementById("revenueDate").value || hkTodayISO();
  const summary = getDailySummary(date);
  const metrics = [
    {
      label: "當日賺得",
      value: formatMoney(summary.totalRevenue),
      detail: "完成課堂後認列",
    },
    {
      label: "扣除 credit",
      value: String(summary.chargedCredits),
      detail: "出席及缺席照扣",
    },
    {
      label: "完成課堂",
      value: String(summary.completedSessions),
      detail: `${summary.totalSessions} 堂已排`,
    },
    {
      label: "補堂 / 保留",
      value: String(summary.makeupOrKept),
      detail: "未認列收入",
    },
  ];

  document.getElementById("revenueMetrics").innerHTML = metrics
    .map((metric, index) => metricCard(metric, metricStyles[index]))
    .join("");

  const rows = getDailyRevenueRows(date).map((row) => `
    <tr>
      <td>${escapeHtml(row.sessionLabel)}</td>
      <td>${escapeHtml(row.studentName)}</td>
      <td>${escapeHtml(attendanceLabels[row.status] || row.status)}</td>
      <td>${escapeHtml(creditActionLabels[row.creditAction] || row.creditAction)}</td>
      <td class="number-cell">${row.creditUsed}</td>
      <td class="number-cell">${formatMoney(row.earned)}</td>
    </tr>
  `);

  document.getElementById("revenueTableBody").innerHTML = rows.length
    ? rows.join("")
    : `<tr><td colspan="6">此日期暫未有已完成課堂</td></tr>`;
  const month = document.getElementById("revenueMonth").value || date.slice(0, 7);
  const monthlySummary = getMonthlySummary(month);
  const monthlyMetrics = [
    {
      label: "當月收入",
      value: formatMoney(monthlySummary.totalRevenue),
      detail: `${monthlySummary.completedSessions} 堂已完成`,
    },
    {
      label: "Group Class",
      value: `${monthlySummary.byType.group.sessions} 堂`,
      detail: formatMoney(monthlySummary.byType.group.revenue),
    },
    {
      label: "Individual Class",
      value: `${monthlySummary.byType.individual.sessions} 堂`,
      detail: formatMoney(monthlySummary.byType.individual.revenue),
    },
    {
      label: "學員人次",
      value: String(monthlySummary.studentAttendances),
      detail: `${monthlySummary.chargedCredits} credit 已認列`,
    },
  ];

  document.getElementById("monthlyRevenueMetrics").innerHTML = monthlyMetrics
    .map((metric, index) => metricCard(metric, metricStyles[index]))
    .join("");

  document.getElementById("monthlyRevenueBreakdown").innerHTML = [
    ["Group Class", monthlySummary.byType.group],
    ["Individual Class", monthlySummary.byType.individual],
  ].map(([label, summary]) => `
    <article class="monthly-breakdown-card">
      <strong>${label}</strong>
      <span>${summary.sessions} 堂已完成</span>
      <span>${summary.studentAttendances} 學員人次</span>
      <span>${formatMoney(summary.revenue)}</span>
    </article>
  `).join("");
}

function renderRenewals() {
  const includeZero = document.getElementById("includeZeroCredits").checked;
  const students = getLowCreditStudents(includeZero);
  document.getElementById("renewalList").innerHTML = students.length
    ? students.map(renewalCard).join("")
    : `<div class="empty-state">暫時未有符合條件的學員</div>`;
}

function metricCard(metric, style) {
  return `
    <article class="metric-card ${style}">
      <span class="eyebrow">${escapeHtml(metric.label)}</span>
      <strong>${escapeHtml(metric.value)}</strong>
      <small>${escapeHtml(metric.detail)}</small>
    </article>
  `;
}

function todaySessionRow(session) {
  const revenue = getSessionRevenue(session);
  const statusClass = session.status === "completed" ? "completed" : "pending";
  const statusText = session.status === "completed" ? "已完成" : "未完成";
  const counts = getSessionCounts(session);

  return `
    <article class="session-row">
      <div class="session-main">
        <h4>${escapeHtml(session.time)} · ${escapeHtml(session.groupName)}</h4>
        <div class="meta-line">
          <span>${escapeHtml(session.coach)}</span>
          <span>${counts.present} 出席</span>
          <span>${counts.absent} 缺席</span>
          <span>${formatMoney(revenue)}</span>
        </div>
      </div>
      <button class="secondary-button" data-session-jump="${session.id}" data-session-date="${session.date}">
        <span class="status-pill ${statusClass}">${statusText}</span>
      </button>
    </article>
  `;
}

function compactRenewalRow(student) {
  const stats = getStudentStats(student.id);
  return `
    <article class="compact-row">
      <div class="session-main">
        <h4>${escapeHtml(student.name)}</h4>
        <div class="meta-line">
          <span>${escapeHtml(student.group)}</span>
          <span>${stats.balance} credit</span>
        </div>
      </div>
      <button class="secondary-button" data-notify-student="${student.id}">
        <svg><use href="#icon-message"></use></svg>
        <span>文案</span>
      </button>
    </article>
  `;
}

function attendanceCard(session) {
  ensureSessionAttendance(session);
  const counts = getSessionCounts(session);
  const pendingCount = getPendingCount(session);
  const statusClass = session.status === "completed" ? "completed" : "pending";
  const statusText = `未點名：${pendingCount} 人 | 出席：${counts.present} 人 | 缺席：${counts.absent} 人`;
  const actionButton = session.status === "completed"
    ? `<button class="secondary-button" data-reopen-session="${session.id}">重新開啟</button>`
    : `<button class="primary-button" data-complete-session="${session.id}" ${pendingCount ? "disabled" : ""}>完成課堂</button>`;

  return `
    <article class="attendance-card">
      <header class="attendance-card-header">
        <div class="attendance-title-block">
          <h4>${escapeHtml(session.time)} · ${escapeHtml(session.groupName)}</h4>
          <div class="meta-line">
            <span>${escapeHtml(formatDisplayDate(session.date))}</span>
            <span>${escapeHtml(session.coach)}</span>
            <span>${formatMoney(getSessionRevenue(session))}</span>
          </div>
        </div>
        <div class="attendance-card-action">
          ${actionButton}
        </div>
        <div class="attendance-summary-row">
          <span class="status-pill attendance-summary-pill ${statusClass}">${statusText}</span>
        </div>
      </header>
      <div class="roll-call">
        ${session.studentIds.map((studentId) => attendanceRow(session, studentId)).join("")}
      </div>
    </article>
  `;
}

function attendanceRow(session, studentId) {
  const student = getStudent(studentId);
  if (!student) return "";

  const record = session.attendance[studentId] || attendanceRecord("pending", "deduct", 0, 0);
  const stats = getStudentStats(studentId);
  const status = record.status || "pending";
  const creditSelect = status === "absent" ? `
    <select class="credit-select" data-credit-action data-session-id="${session.id}" data-student-id="${studentId}">
      ${["charge", "keep", "makeup"].map((action) => `
        <option value="${action}" ${record.creditAction === action ? "selected" : ""}>
          ${creditActionLabels[action]}
        </option>
      `).join("")}
    </select>
  ` : "";

  return `
    <div
      class="attendance-row attendance-person-card ${status}"
      data-attendance-cycle
      data-session-id="${session.id}"
      data-student-id="${studentId}"
      role="button"
      tabindex="0"
      aria-label="${escapeHtml(student.name)} ${attendanceLabels[status]}，點擊切換狀態">
      <div class="student-name">
        <strong>${escapeHtml(student.name)}</strong>
        <span class="credit-count" aria-label="剩餘 ${stats.balance} credit">${stats.balance}</span>
      </div>
      <div class="attendance-state">
        <span class="status-pill ${status}">${attendanceLabels[status]}</span>
      </div>
      ${creditSelect}
    </div>
  `;
}

function attendanceSegment(sessionId, studentId, status, currentStatus) {
  return `
    <button
      class="segment-button ${status} ${currentStatus === status ? "is-selected" : ""}"
      type="button"
      data-att-status="${status}"
      data-session-id="${sessionId}"
      data-student-id="${studentId}">
      ${attendanceLabels[status]}
    </button>
  `;
}

function cycleAttendance(sessionId, studentId) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) return;
  ensureSessionAttendance(session);

  const current = session.attendance[studentId]?.status || "pending";
  const nextStatus = current === "pending" ? "present" : current === "present" ? "absent" : "pending";
  const previousAction = session.attendance[studentId]?.creditAction || "charge";
  const absentAction = ["charge", "keep", "makeup", "waive"].includes(previousAction) ? previousAction : "charge";
  markAttendance(sessionId, studentId, nextStatus, nextStatus === "absent" ? absentAction : null);
}

function renewalCard(student) {
  const stats = getStudentStats(student.id);
  const latest = getLatestPayment(student.id);
  return `
    <article class="student-card">
      <div>
        <h4>${escapeHtml(student.name)}</h4>
        <div class="meta-line">
          <span>${escapeHtml(student.group)}</span>
          <span>${escapeHtml(student.phone)}</span>
          <span class="status-pill ${stats.balance <= 0 ? "absent" : "pending"}">${stats.balance} credit</span>
        </div>
      </div>
      <div class="meta-line">
        <span>來季 ${formatMoney(student.nextSeasonPrice)}</span>
        <span>${latest ? escapeHtml(latest.packageName) : "未有 package"}</span>
      </div>
      <div class="card-actions">
        <button class="secondary-button" data-edit-message="${student.id}">
          <svg><use href="#icon-message"></use></svg>
          <span>編輯文案</span>
        </button>
        <button class="primary-button" data-notify-student="${student.id}">
          <svg><use href="#icon-whatsapp"></use></svg>
          <span>通知</span>
        </button>
      </div>
    </article>
  `;
}

function markAttendance(sessionId, studentId, status, creditAction = null) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) return;

  ensureSessionAttendance(session);
  const previous = session.attendance[studentId] || attendanceRecord("pending", "deduct", 0, 0);
  const action = status === "absent" ? (creditAction || previous.creditAction || "charge") : "deduct";
  const unitRate = getStudentStats(studentId).unitRate;

  let creditUsed = 0;
  let earned = 0;

  if (status === "present") {
    creditUsed = 1;
    earned = unitRate;
  }

  if (status === "absent" && action === "charge") {
    creditUsed = 1;
    earned = unitRate;
  }

  session.attendance[studentId] = {
    status,
    creditAction: action,
    creditUsed,
    earned,
    unitRate,
    markedAt: new Date().toISOString(),
  };

  saveState();
  renderAll();
}

function completeSession(sessionId) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) return;

  const pendingCount = getPendingCount(session);
  if (pendingCount > 0) {
    showToast("仍有學員未點名");
    return;
  }

  session.status = "completed";
  session.completedAt = new Date().toISOString();
  saveState();
  renderAll();
  showToast("課堂已完成，收入已更新");
}

function reopenSession(sessionId) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) return;
  session.status = "scheduled";
  delete session.completedAt;
  saveState();
  renderAll();
  showToast("課堂已重新開啟");
}

function ensureSessionAttendance(session) {
  if (!session.attendance) session.attendance = {};
  session.studentIds.forEach((studentId) => {
    if (!session.attendance[studentId]) {
      session.attendance[studentId] = attendanceRecord("pending", "deduct", 0, 0);
    }
  });
}

function getStudent(studentId) {
  return state.students.find((student) => student.id === studentId);
}

function getStudentStats(studentId) {
  const student = getStudent(studentId);
  const payments = state.payments.filter((payment) => payment.studentId === studentId);
  const purchased = payments.reduce((sum, payment) => sum + Number(payment.credits || 0), 0);
  const paid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const sessionUsed = state.sessions.reduce((sum, session) => {
    const record = session.attendance?.[studentId];
    return sum + Number(record?.creditUsed || 0);
  }, 0);
  const openingUsed = Number(student?.openingUsedCredits || 0);
  const used = openingUsed + sessionUsed;
  const balance = purchased - used;
  const latest = getLatestPayment(studentId);
  const unitRate = latest && latest.credits ? Number(latest.amount) / Number(latest.credits) : 0;

  return {
    purchased,
    paid,
    used,
    balance,
    unitRate,
  };
}

function getLatestPayment(studentId) {
  return state.payments
    .filter((payment) => payment.studentId === studentId)
    .sort((a, b) => {
      const dateCompare = String(b.date).localeCompare(String(a.date));
      if (dateCompare) return dateCompare;
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    })[0];
}

function getSessionCounts(session) {
  const records = session.studentIds.map((studentId) => session.attendance?.[studentId]);
  return {
    present: records.filter((record) => record?.status === "present").length,
    absent: records.filter((record) => record?.status === "absent").length,
    pending: records.filter((record) => !record || record.status === "pending").length,
  };
}

function getPendingCount(session) {
  return getSessionCounts(session).pending;
}

function getSessionRevenue(session) {
  if (session.status !== "completed") return 0;
  return session.studentIds.reduce((sum, studentId) => {
    const record = session.attendance?.[studentId];
    return sum + Number(record?.earned || 0);
  }, 0);
}

function getSessionClassType(session) {
  const groupName = String(session.groupName || "").toLowerCase();
  const individualKeywords = ["individual", "private", "1:1", "1-on-1", "1對1", "單對單", "私人", "個人"];
  if (session.classType === "individual") return "individual";
  if ((session.studentIds || []).length <= 1) return "individual";
  return individualKeywords.some((keyword) => groupName.includes(keyword)) ? "individual" : "group";
}

function monthlyBucket() {
  return {
    sessions: 0,
    studentAttendances: 0,
    chargedCredits: 0,
    revenue: 0,
  };
}

function getMonthlySummary(month) {
  const monthKey = month || hkTodayISO().slice(0, 7);
  const completedSessions = state.sessions
    .filter((session) => session.status === "completed" && session.date.startsWith(`${monthKey}-`))
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

  const byType = {
    group: monthlyBucket(),
    individual: monthlyBucket(),
  };

  completedSessions.forEach((session) => {
    const type = getSessionClassType(session);
    const bucket = byType[type];
    const rows = session.studentIds
      .map((studentId) => session.attendance?.[studentId] || attendanceRecord("pending", "deduct", 0, 0))
      .filter((record) => record.status !== "pending");

    bucket.sessions += 1;
    bucket.studentAttendances += rows.length;
    bucket.chargedCredits += rows.reduce((sum, record) => sum + Number(record.creditUsed || 0), 0);
    bucket.revenue += getSessionRevenue(session);
  });

  return {
    month: monthKey,
    completedSessions: completedSessions.length,
    studentAttendances: byType.group.studentAttendances + byType.individual.studentAttendances,
    chargedCredits: byType.group.chargedCredits + byType.individual.chargedCredits,
    totalRevenue: byType.group.revenue + byType.individual.revenue,
    byType,
  };
}

function getDailyRevenueRows(date) {
  return state.sessions
    .filter((session) => session.date === date && session.status === "completed")
    .sort((a, b) => a.time.localeCompare(b.time))
    .flatMap((session) => session.studentIds.map((studentId) => {
      const record = session.attendance?.[studentId] || attendanceRecord("pending", "deduct", 0, 0);
      const student = getStudent(studentId);
      return {
        sessionLabel: `${session.time} ${session.groupName}`,
        studentName: student?.name || "未知學員",
        status: record.status,
        creditAction: record.creditAction,
        creditUsed: Number(record.creditUsed || 0),
        earned: Number(record.earned || 0),
      };
    }).filter((row) => row.status !== "pending"));
}

function getDailySummary(date) {
  const sessions = state.sessions.filter((session) => session.date === date);
  const rows = getDailyRevenueRows(date);
  const completedSessions = sessions.filter((session) => session.status === "completed").length;
  const totalRevenue = rows.reduce((sum, row) => sum + row.earned, 0);
  const chargedCredits = rows.reduce((sum, row) => sum + row.creditUsed, 0);
  const presentCount = rows.filter((row) => row.status === "present").length;
  const absentCount = rows.filter((row) => row.status === "absent").length;
  const makeupOrKept = rows.filter((row) => ["keep", "makeup", "waive"].includes(row.creditAction)).length;

  return {
    totalSessions: sessions.length,
    completedSessions,
    pendingSessions: sessions.length - completedSessions,
    totalRevenue,
    chargedCredits,
    presentCount,
    absentCount,
    makeupOrKept,
  };
}

function getLowCreditStudents(includeZero) {
  return state.students
    .map((student) => ({ ...student, stats: getStudentStats(student.id) }))
    .filter((student) => includeZero ? student.stats.balance <= 1 : student.stats.balance === 1)
    .sort((a, b) => a.stats.balance - b.stats.balance || a.name.localeCompare(b.name, "zh-Hant"));
}

function generateRenewalMessage(studentId) {
  const student = getStudent(studentId);
  if (!student) return "";

  const stats = getStudentStats(student.id);
  const latest = getLatestPayment(student.id);
  const packageName = latest?.packageName || "小組班 package";
  const offer = student.offer || state.club.defaultOffer;
  const balanceText = stats.balance <= 0 ? "已經用完" : `只剩 ${stats.balance} credit`;

  return [
    `${student.name} 家長你好，我哋見到 ${student.name} 目前 ${balanceText}。`,
    "",
    `來季 ${state.club.nextSeasonName} ${packageName} 建議學費為 ${formatMoney(student.nextSeasonPrice)}。${offer}`,
    "",
    "如想保留原有小組班時段，麻煩你方便時回覆確認，並以 FPS / PayMe 繳交學費。",
    "",
    "訊息送出前你仍可修改內容，謝謝！",
  ].join("\n");
}

function openMessageModal(studentId) {
  const student = getStudent(studentId);
  if (!student) return;
  activeMessageStudentId = studentId;
  document.getElementById("messageModalTitle").textContent = `${student.name} · WhatsApp 訊息`;
  document.getElementById("messageText").value = generateRenewalMessage(studentId);
  document.getElementById("messageModal").hidden = false;
}

function closeMessageModal() {
  document.getElementById("messageModal").hidden = true;
  activeMessageStudentId = null;
}

function openWhatsappForStudent(studentId, customMessage = null) {
  const student = getStudent(studentId);
  if (!student) return;
  const message = customMessage || generateRenewalMessage(studentId);
  const phone = normalizePhone(student.phone);
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank", "noopener,noreferrer");
  showToast("已開啟 WhatsApp，請在送出前確認內容");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("文案已複製");
    return;
  } catch {
    const textarea = document.getElementById("messageText");
    textarea.focus();
    textarea.select();
    document.execCommand("copy");
    showToast("文案已複製");
  }
}

function exportRevenueCsv() {
  if (!requireAuthenticatedAccess("revenue")) return;

  const date = document.getElementById("revenueDate").value || hkTodayISO();
  const rows = getDailyRevenueRows(date);
  if (!rows.length) {
    showToast("沒有可匯出的收入紀錄");
    return;
  }

  const header = ["日期", "課堂", "學員", "狀態", "Credit處理", "Credit", "收入HKD"];
  const body = rows.map((row) => [
    date,
    row.sessionLabel,
    row.studentName,
    attendanceLabels[row.status] || row.status,
    creditActionLabels[row.creditAction] || row.creditAction,
    row.creditUsed,
    row.earned,
  ]);
  const csv = [header, ...body]
    .map((line) => line.map(csvCell).join(","))
    .join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `badminton-revenue-${date}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("CSV 已匯出");
}

function createId(prefix) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function clean(value) {
  return String(value || "").trim();
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 8) return `852${digits}`;
  return digits;
}

function formatMoney(value) {
  const amount = Number(value || 0);
  const hasCents = Math.abs(amount % 1) > 0.001;
  return new Intl.NumberFormat("zh-HK", {
    style: "currency",
    currency: "HKD",
    minimumFractionDigits: hasCents ? 1 : 0,
    maximumFractionDigits: hasCents ? 1 : 0,
  }).format(amount);
}

function normalizeIsoDate(value, fallback = null) {
  const fallbackDate = fallback || safeHkTodayISO();

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? fallbackDate : formatDateInHongKong(value);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return normalizeDateNumber(value, fallbackDate);
  }

  const text = String(value ?? "").trim();
  if (!text) return fallbackDate;

  const looksLikeDateTime = /^\d{4}-\d{2}-\d{2}[T\s]\d{1,2}:\d{2}/.test(text);
  if (looksLikeDateTime) {
    const parsedDateTime = new Date(text);
    if (!isNaN(parsedDateTime.getTime())) return formatDateInHongKong(parsedDateTime);
  }

  const ymdCompact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (ymdCompact) return `${ymdCompact[1]}-${ymdCompact[2]}-${ymdCompact[3]}`;

  const ymd = text.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
  if (ymd) return buildIsoDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]), fallbackDate);

  const dmy = text.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/);
  if (dmy) return buildIsoDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]), fallbackDate);

  const numericText = text.match(/^\d+(?:\.\d+)?$/);
  if (numericText) return normalizeDateNumber(Number(text), fallbackDate);

  const parsed = new Date(text);
  if (!isNaN(parsed.getTime())) return formatDateInHongKong(parsed);

  return fallbackDate;
}

function normalizeTime(value, fallback = "18:00") {
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? fallback : formatClockInHongKong(value);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return timeFromSerialNumber(value, fallback);
  }

  const text = String(value ?? "").trim();
  if (!text) return fallback;

  const numericText = text.match(/^\d+(?:\.\d+)?$/);
  if (numericText) return timeFromSerialNumber(Number(text), fallback);

  const looksLikeDateTime = /^\d{4}-\d{2}-\d{2}[T\s]\d{1,2}:\d{2}/.test(text);
  if (looksLikeDateTime) {
    const parsed = new Date(text);
    if (!isNaN(parsed.getTime())) return formatClockInHongKong(parsed);
  }

  const hm = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (hm) {
    const hour = Number(hm[1]);
    const minute = Number(hm[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
  }

  return fallback;
}

function normalizeIsoDateTime(value, fallback = null) {
  const fallbackValue = fallback || new Date().toISOString();

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? fallbackValue : value.toISOString();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const date = numberToDate(value);
    return date && !isNaN(date.getTime()) ? date.toISOString() : fallbackValue;
  }

  const text = String(value ?? "").trim();
  if (!text) return fallbackValue;

  const numericText = text.match(/^\d+(?:\.\d+)?$/);
  if (numericText) {
    const date = numberToDate(Number(text));
    return date && !isNaN(date.getTime()) ? date.toISOString() : fallbackValue;
  }

  const dateOnly = normalizeIsoDate(text, "");
  if (dateOnly) return `${dateOnly}T12:00:00+08:00`;

  const parsed = new Date(text);
  return isNaN(parsed.getTime()) ? fallbackValue : parsed.toISOString();
}

function normalizeDateNumber(value, fallbackDate) {
  const date = numberToDate(value);
  return date && !isNaN(date.getTime()) ? formatDateInHongKong(date) : fallbackDate;
}

function numberToDate(value) {
  if (!Number.isFinite(value)) return null;

  // Google Sheet serial date: 1 = 1899-12-31 in many spreadsheet contexts;
  // Apps Script commonly uses 1899-12-30 as the serial epoch for Sheets values.
  if (value > 20000 && value < 100000) {
    return new Date(Date.UTC(1899, 11, 30) + value * 86400000);
  }

  // Unix timestamp in seconds.
  if (value > 1000000000 && value < 10000000000) {
    return new Date(value * 1000);
  }

  // Unix timestamp in milliseconds.
  if (value > 100000000000 && value < 10000000000000) {
    return new Date(value);
  }

  return null;
}

function timeFromSerialNumber(value, fallback) {
  if (!Number.isFinite(value)) return fallback;
  const fraction = ((value % 1) + 1) % 1;
  if (fraction === 0 && value >= 1) return fallback;
  const totalMinutes = Math.round(fraction * 1440) % 1440;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function buildIsoDate(year, month, day, fallbackDate) {
  if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) return fallbackDate;
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return fallbackDate;
  return date.toISOString().slice(0, 10);
}

function formatDateInHongKong(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: HK_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatClockInHongKong(date) {
  if (date.getUTCFullYear() < 1910) {
    const totalMinutes = (date.getUTCHours() * 60 + date.getUTCMinutes() + 480) % 1440;
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: HK_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = values.hour === "24" ? "00" : values.hour;
  return `${hour}:${values.minute}`;
}

function safeHkTodayISO() {
  try {
    return hkTodayISO();
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function formatDisplayDate(isoDate) {
  const cleanDate = normalizeIsoDate(isoDate, hkTodayISO());
  const [year, month, day] = cleanDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (isNaN(date.getTime())) return cleanDate;
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: HK_TIMEZONE,
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function formatTime(date) {
  const safeDate = date instanceof Date ? date : new Date(date);
  if (isNaN(safeDate.getTime())) return "--:--";
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: HK_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(safeDate);
}

function hkTodayISO() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: HK_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDaysISO(isoDate, days) {
  const cleanDate = normalizeIsoDate(isoDate, hkTodayISO());
  const [year, month, day] = cleanDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + Number(days || 0), 12, 0, 0));
  return isNaN(date.getTime()) ? hkTodayISO() : date.toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

let toastTimer = null;

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2600);
}
