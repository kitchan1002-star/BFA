const STORAGE_KEY = "badminton-credit-manager.v1";
const AUTH_STORAGE_KEY = "badminton-credit-manager.auth.v1";
const CLOUD_CONFIG_KEY = "badminton-credit-manager.cloud.v1";
const HK_TIMEZONE = "Asia/Hong_Kong";
const HTML_APP_CONFIG = typeof window !== "undefined" ? (window.BFAHK_CONFIG || {}) : {};
const APP_VERSION = "BFAHK-20260701-fast-login-v34";
const DEFAULT_CLOUD_WEB_APP_URL = String(HTML_APP_CONFIG.cloudWebAppUrl || "https://script.google.com/macros/s/AKfycbzwzkAMbktQ_RAfEn9Gx250eXVzIvK8Y6SGY169WuZr2dD29ks1kviz-X0qcdhPg_BtIg/exec").trim();
console.log(`BFAHK app loaded: ${APP_VERSION}`);
console.log(`BFAHK backend URL: ${DEFAULT_CLOUD_WEB_APP_URL}`);
const PUBLIC_VIEWS = new Set(["auth"]);

let state = loadState();
let cloudConfig = loadCloudConfig();
let authState = loadAuthState();
let currentView = "dashboard";
let pendingProtectedView = "dashboard";
let activeMessageStudentId = null;
let cloudSaveTimer = null;
let isApplyingRemoteState = false;
let scheduleReturnView = "attendance";
let scheduleViewScope = "all";
let pendingSessionDates = [];

const titles = {
  dashboard: "課堂時間表",
  students: "學員收費",
  attendance: "小組點名",
  individual: "個人班",
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
  scheduleViewScope = isAuthenticated() && isFounderRole() && normalizeCoachKey(currentAccount()?.coachName)
    ? "mine"
    : "all";
  moveScheduleForm();
  wireBrandFallback();
  wireNavigation();
  wireAuth();
  wireCloudSync();
  wireForms();
  wireAttendance();
  wireRevenue();
  wirePaymentHistory();
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
    locations: ["場地待定"],
    levels: ["U8", "U10", "U12", "U14", "U16", "成人"],
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
        location: "場地待定",
        studentIds: ["s1", "s2", "s3", "s4"],
        status: "completed",
        completedAt: `${today}T19:07:00+08:00`,
        attendance: {
          s1: attendanceRecord("present", "deduct", 1, 200),
          s2: attendanceRecord("absent", "charge", 1, 187.5),
          s3: attendanceRecord("present", "deduct", 1, 210),
          s4: attendanceRecord("absent", "makeup", 0, 0),
        },
        classType: "group",
      },
      {
        id: "c2",
        date: today,
        time: "19:30",
        groupName: "成人初階B",
        coach: "Coach 梁",
        location: "場地待定",
        studentIds: ["s5", "s6"],
        status: "scheduled",
        attendance: {
          s5: attendanceRecord("pending", "deduct", 0, 0),
          s6: attendanceRecord("pending", "deduct", 0, 0),
        },
        classType: "group",
      },
      {
        id: "c3",
        date: nextWeek,
        time: "18:00",
        groupName: "U12 小組A",
        coach: "Coach 梁",
        location: "場地待定",
        studentIds: ["s1", "s2", "s3", "s4"],
        status: "scheduled",
        attendance: {
          s1: attendanceRecord("pending", "deduct", 0, 0),
          s2: attendanceRecord("pending", "deduct", 0, 0),
          s3: attendanceRecord("pending", "deduct", 0, 0),
          s4: attendanceRecord("pending", "deduct", 0, 0),
        },
        classType: "group",
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
    locations: Array.isArray(parsed.locations) && parsed.locations.length
      ? parsed.locations.map((location) => String(location || "").trim()).filter(Boolean)
      : base.locations,
    levels: Array.isArray(parsed.levels) && parsed.levels.length
      ? parsed.levels.map((level) => String(level || "").trim()).filter(Boolean)
      : base.levels,
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
      studentIds: Array.isArray(session.studentIds) ? session.studentIds.map(String) : [],
      completedAt: session.completedAt ? normalizeIsoDateTime(session.completedAt) : session.completedAt,
      classType: getSessionClassType(session),
      location: String(session.location || "").trim(),
      durationMinutes: normalizeDurationMinutes(session.durationMinutes),
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
    return await cloudFormPostRequest(action, payload, authOverride, { timeoutMs: 12000 });
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

function loginJsonpRequest(accountId, password) {
  if (!hasCloudUrl()) return Promise.reject(new Error("未設定 Apps Script Web App URL"));

  return new Promise((resolve, reject) => {
    const callbackName = `__bfLogin_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("登入回應逾時，請確認 Apps Script 已重新部署"));
    }, 12000);

    function cleanup() {
      window.clearTimeout(timeoutId);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (data) => {
      cleanup();
      if (!data || !data.ok) {
        reject(new Error(data?.error || "登入失敗"));
        return;
      }
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("登入連線失敗，請確認 Apps Script URL 及部署權限"));
    };

    script.src = appendQueryParams(cloudConfig.webAppUrl, {
      action: "login",
      accountId,
      password,
      callback: callbackName,
    });
    document.body.appendChild(script);
  });
}

function loginRequest(accountId, password) {
  return loginJsonpRequest(accountId, password);
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
  const username = String(account.username || account.Username || account.login || account.Login || "").trim();
  const email = normalizeEmail(account.email || account.Email || account.userEmail || account.user_email || username);
  if (!email) return null;

  const role = account.role || account.Role || account.userRole || account.user_role || "user";
  const activeValue = account.active ?? account.Active ?? account.enabled ?? account.Enabled ?? true;
  const allowedGroups = account.allowedGroups || account.allowed_groups || account.AllowedGroups || account.Allowed_Groups || "all";
  const coachName = String(account.coachName || account.coach_name || account.CoachName || account.Coach_Name || "").trim();

  return {
    email,
    username,
    role: roleLabel(role),
    roleKey: normalizeRoleKey(role),
    active: isActiveUser(activeValue),
    allowedGroups,
    coachName,
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

function isFounderRole() {
  return currentRoleKey() === "founder";
}

function currentAccount() {
  return authState?.email ? (findAllowedAccount(authState.email) || authState) : authState;
}

function normalizeCoachKey(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function sessionCoachKeys(session) {
  return String(session?.coach || "")
    .split(/[,，、;\n|]+/)
    .map(normalizeCoachKey)
    .filter(Boolean);
}

function canAccessSession(session) {
  if (!isAuthenticated()) return false;
  if (!isCoachRole()) return true;
  const coachName = normalizeCoachKey(currentAccount()?.coachName || currentAccount()?.coach_name || "");
  return Boolean(coachName && sessionCoachKeys(session).includes(coachName));
}

function canAccessView(view) {
  if (view === "auth") return true;
  if (!isAuthenticated()) return !isProtectedView(view);
  if (isCoachRole()) return view === "dashboard" || view === "attendance" || view === "individual";
  return true;
}

function defaultViewForCurrentUser() {
  return "dashboard";
}

function isProtectedView(view) {
  return !PUBLIC_VIEWS.has(view);
}

function requireAuthenticatedAccess(view = "dashboard") {
  if (isAuthenticated()) {
    if (canAccessView(view)) return true;
    showToast("此帳戶只可使用課堂時間表及點名");
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
      scheduleViewScope = "all";
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
  const loginButton = document.getElementById("sheetLoginButton");
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
    if (loginButton) loginButton.disabled = true;

    const data = await loginRequest(accountId, password);
    applyCloudData(data);

    const user = normalizeUserAccount(data.authUser || {});
    if (!user) throw new Error("登入回應沒有有效帳戶資料");

    saveAuthState({
      ...user,
      sessionToken: data.sessionToken || "",
      expiresAt: data.expiresAt || (Date.now() + 6 * 60 * 60 * 1000),
      signedInAt: new Date().toISOString(),
    });
    scheduleViewScope = user.coachName ? "mine" : "all";

    if (passwordInput) passwordInput.value = "";
    if (status) status.textContent = `已登入：${authState.role}`;
    updateAuthUI();
    renderAll();
    setView(defaultViewForCurrentUser());
    showToast(`已登入：${authState.role}`);
    window.setTimeout(() => syncFromCloud({ silent: true }), 0);
  } catch (loginError) {
    saveAuthState(null);
    updateAuthUI();
    if (status) status.textContent = "請檢查帳戶及密碼";
    if (error) {
      error.textContent = `登入失敗：${friendlySheetAuthErrorMessage(loginError, accountId)}`;
      error.hidden = false;
    }
  } finally {
    if (loginButton) loginButton.disabled = false;
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
          <span>${escapeHtml(displayAccountName(account))}</span>
        </span>
        <span>${escapeHtml(account.note)}</span>
      </div>
    `).join("")
    : "";
}

function displayAccountName(account = {}) {
  return String(account.username || account.account || account.login || "帳戶").trim();
}

function updateAuthUI() {
  const signedIn = isAuthenticated();
  const status = document.getElementById("authStatus");
  const text = document.getElementById("authStatusText");
  const logoutButton = document.getElementById("logoutButton");
  const timetableActions = document.getElementById("timetableActions");
  const founderScheduleScope = document.getElementById("founderScheduleScope");

  if (status) status.classList.toggle("is-signed-in", signedIn);
  if (text) {
    text.textContent = signedIn
      ? `${authState.role} · ${displayAccountName(authState)}`
      : "未登入";
  }
  if (logoutButton) logoutButton.hidden = !signedIn && !authState?.pendingVerification;
  if (timetableActions) timetableActions.hidden = signedIn && isCoachRole();
  if (founderScheduleScope) founderScheduleScope.hidden = !(signedIn && isFounderRole());
  renderScheduleScopeControl();

  document.querySelectorAll("[data-view-target]").forEach((button) => {
    const target = button.dataset.viewTarget;
    const unavailableForRole = signedIn && !canAccessView(target);
    const locked = isProtectedView(target) && !signedIn;
    button.hidden = unavailableForRole;
    button.classList.toggle("is-locked", locked);
    button.title = locked ? "需要登入帳戶" : unavailableForRole ? "此帳戶沒有權限" : "";
  });
}

function renderScheduleScopeControl() {
  const hasCoachName = Boolean(normalizeCoachKey(currentAccount()?.coachName));
  document.querySelectorAll("[data-schedule-scope]").forEach((button) => {
    const scope = button.dataset.scheduleScope;
    button.classList.toggle("is-selected", scope === scheduleViewScope);
    button.disabled = scope === "mine" && !hasCoachName;
    button.title = button.disabled ? "請在 Users 的 coach_name 填寫教練名稱" : "";
  });

  document.getElementById("timetableDate")?.addEventListener("change", renderDashboard);
  document.getElementById("refreshScheduleButton")?.addEventListener("click", async () => {
    const button = document.getElementById("refreshScheduleButton");
    button.disabled = true;
    try {
      await syncFromCloud({ silent: false });
      renderDashboard();
    } finally {
      button.disabled = false;
    }
  });
}

function wireNavigation() {
  document.querySelectorAll("[data-view-target]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.viewTarget));
  });

  document.querySelectorAll("[data-jump-view]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.jumpView === "schedule") {
        configureScheduleForm(button.dataset.classType || "group");
      }
      setView(button.dataset.jumpView);
    });
  });

  document.querySelectorAll("[data-schedule-scope]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!isFounderRole()) return;
      const nextScope = button.dataset.scheduleScope === "mine" ? "mine" : "all";
      if (nextScope === "mine" && !normalizeCoachKey(currentAccount()?.coachName)) {
        showToast("請先在 Users 的 coach_name 填寫教練名稱");
        return;
      }
      scheduleViewScope = nextScope;
      renderScheduleScopeControl();
      renderDashboard();
    });
  });

  document.getElementById("scheduleReturnButton")?.addEventListener("click", () => setView(scheduleReturnView));
  document.getElementById("sessionClassType")?.addEventListener("change", (event) => {
    configureScheduleForm(event.target.value);
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

  document.getElementById("addSessionDateButton").addEventListener("click", () => {
    const date = document.querySelector("#sessionForm [name='date']").value;
    if (!date) {
      showToast("請先選擇日期");
      return;
    }
    pendingSessionDates = Array.from(new Set([...pendingSessionDates, date])).sort();
    document.querySelector("#sessionForm [name='date']").value = "";
    renderSessionDateList();
  });

  document.getElementById("sessionDateList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-session-date]");
    if (!button) return;
    pendingSessionDates = pendingSessionDates.filter((date) => date !== button.dataset.removeSessionDate);
    renderSessionDateList();
  });

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
      nextSeasonPrice: 0,
      offer: "",
      note: clean(data.get("note")),
      openingUsedCredits: 0,
    };

    state.students.push(student);
    saveState();
    form.reset();
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
    const coachNames = Array.from(form.elements.coaches.selectedOptions).map((option) => option.value);
    const classType = data.get("classType") === "individual" ? "individual" : "group";
    const durationMinutes = normalizeDurationMinutes(data.get("durationMinutes"));

    if (!coachNames.length) {
      showToast("請選擇最少一名教練");
      return;
    }

    if (classType === "individual" && studentIds.length !== 1) {
      showToast("Individual Class 請只選擇一名學員");
      return;
    }

    const selectedStudent = classType === "individual" ? getStudent(studentIds[0]) : null;
    const groupName = classType === "individual" ? String(selectedStudent?.name || "").trim() : clean(data.get("groupName"));
    if (!groupName) {
      showToast(classType === "individual" ? "請選擇學員" : "請輸入班名");
      return;
    }

    const currentDate = clean(data.get("date"));
    const dates = Array.from(new Set([
      ...pendingSessionDates,
      ...(currentDate ? [currentDate] : []),
    ])).sort();
    if (!dates.length) {
      showToast("請選擇最少一個日期");
      return;
    }
    const sessions = dates.map((date) => {
      const attendance = {};
      studentIds.forEach((studentId) => {
        attendance[studentId] = attendanceRecord("pending", "deduct", 0, 0);
      });
      return {
        id: createId("c"),
        date,
        time: data.get("time") || "18:00",
        groupName,
        coach: coachNames.join(", "),
        location: clean(data.get("location")),
        durationMinutes,
        studentIds: [...studentIds],
        status: "scheduled",
        classType,
        attendance,
      };
    });

    for (const session of sessions) {
      const conflict = findSessionConflict(session);
      if (conflict) {
        showToast(`${formatDisplayDate(session.date)}：${conflict}`);
        return;
      }
    }

    state.sessions.push(...sessions);
    saveState();
    const destinationView = classType === "individual" ? "individual" : "attendance";
    document.getElementById(classType === "individual" ? "individualAttendanceDate" : "attendanceDate").value = dates[0];
    form.reset();
    form.elements.date.value = dates[0];
    form.elements.time.value = "18:00";
    form.elements.durationMinutes.value = "60";
    form.elements.classType.value = classType;
    pendingSessionDates = [];
    renderSessionDateList();
    configureScheduleForm(classType);
    renderAll();
    setView(destinationView);
    showToast(sessions.length > 1 ? `已建立 ${sessions.length} 堂課堂` : "已建立課堂");
  });
}

function wireAttendance() {
  document.getElementById("attendanceDate").addEventListener("change", renderAttendance);
  document.getElementById("individualAttendanceDate").addEventListener("change", renderIndividualAttendance);
  wireAttendanceContainer("attendanceSessions");
  wireAttendanceContainer("individualSessions");
}

function wireAttendanceContainer(containerId) {
  const container = document.getElementById(containerId);
  container.addEventListener("click", (event) => {
    const addStudentButton = event.target.closest("[data-add-session-student]");
    if (addStudentButton) {
      const sessionId = addStudentButton.dataset.sessionId;
      const addControl = addStudentButton.closest(".attendance-add-student");
      const select = addControl?.querySelector("[data-session-student-select]");
      addStudentToSession(sessionId, select?.value || "");
      return;
    }

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

  container.addEventListener("keydown", (event) => {
    const cycleCard = event.target.closest("[data-attendance-cycle]");
    if (!cycleCard || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    cycleAttendance(cycleCard.dataset.sessionId, cycleCard.dataset.studentId);
  });

  container.addEventListener("change", (event) => {
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
  document.getElementById("exportRevenueButton").addEventListener("click", exportMonthlyRevenueCsv);
}

function wirePaymentHistory() {
  document.getElementById("studentTableBody").addEventListener("click", (event) => {
    const button = event.target.closest("[data-payment-history]");
    if (button) openPaymentHistory(button.dataset.paymentHistory);
  });
  document.getElementById("closePaymentHistoryButton").addEventListener("click", closePaymentHistory);
  document.getElementById("paymentHistoryModal").addEventListener("click", (event) => {
    if (event.target.id === "paymentHistoryModal") closePaymentHistory();
  });
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
  document.getElementById("individualAttendanceDate").value = today;
  document.getElementById("revenueDate").value = today;
  document.getElementById("revenueMonth").value = today.slice(0, 7);
  document.getElementById("timetableDate").value = today;
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
  const navView = view === "auth" ? pendingProtectedView : (view === "schedule" ? scheduleReturnView : view);
  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("is-active", section.id === `view-${view}`);
  });
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.viewTarget === navView);
  });
  document.getElementById("viewTitle").textContent = titles[view] || "球會營運台";
  renderDateLabels();
  updateAuthUI();

  if (view === "attendance") renderAttendance();
  if (view === "individual") renderIndividualAttendance();
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
  renderIndividualAttendance();
  if (isAuthenticated()) {
    if (isCoachRole()) {
      renderDashboard();
      clearManagementViews("此帳戶只可使用課堂時間表及點名");
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
  document.getElementById("scheduleOverview").innerHTML = "";
  document.getElementById("dailyScheduleList").innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
  document.getElementById("upcomingSessionList").innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
  clearManagementViews(message);
}

function clearManagementViews(message = "請先登入帳戶") {
  document.getElementById("studentTableBody").innerHTML = "";
  document.getElementById("revenueMetrics").innerHTML = "";
  document.getElementById("dailyRevenueSessions").innerHTML = "";
  document.getElementById("monthlyRevenueMetrics").innerHTML = "";
  document.getElementById("monthlyRevenueBreakdown").innerHTML = "";
  document.getElementById("renewalList").innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function renderDateLabels() {
  const today = hkTodayISO();
  document.getElementById("hkDateLabel").textContent = formatDisplayDate(today);
  document.getElementById("todayRevenueMini").textContent = isAuthenticated() && !isCoachRole()
    ? currentView === "revenue"
      ? formatMoney(getDailySummary(today).totalRevenue)
      : `${scheduleSessionsForCurrentView().filter((session) => session.date === today).length} 堂`
    : isCoachRole()
      ? "教練模式"
      : "登入後顯示";
}

function renderSelects() {
  const levelSelect = document.getElementById("studentLevelSelect");
  const selectedLevel = levelSelect.value;
  levelSelect.innerHTML = (state.levels || [])
    .map((level) => `<option value="${escapeHtml(level)}">${escapeHtml(level)}</option>`)
    .join("");
  if ((state.levels || []).includes(selectedLevel)) levelSelect.value = selectedLevel;

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

  const coachSelect = document.getElementById("sessionCoachSelect");
  const selectedCoaches = Array.from(coachSelect.selectedOptions).map((option) => option.value);
  const coachNames = Array.from(new Set(
    (state.users || [])
      .map(normalizeUserAccount)
      .filter((account) => account?.active && account.coachName)
      .map((account) => account.coachName),
  )).sort((a, b) => a.localeCompare(b, "zh-Hant"));
  coachSelect.innerHTML = coachNames
    .map((coachName) => `<option value="${escapeHtml(coachName)}">${escapeHtml(coachName)}</option>`)
    .join("");
  selectedCoaches.forEach((coachName) => {
    const option = Array.from(coachSelect.options).find((item) => item.value === coachName);
    if (option) option.selected = true;
  });

  const locationSelect = document.getElementById("sessionLocationSelect");
  const selectedLocation = locationSelect.value;
  locationSelect.innerHTML = (state.locations || [])
    .map((location) => `<option value="${escapeHtml(location)}">${escapeHtml(location)}</option>`)
    .join("");
  if ((state.locations || []).includes(selectedLocation)) locationSelect.value = selectedLocation;
}

function renderDashboard() {
  const today = hkTodayISO();
  const tomorrow = addDaysISO(today, 1);
  const nextWeek = addDaysISO(today, 7);
  const selectedDate = document.getElementById("timetableDate").value || today;
  const visibleSessions = scheduleSessionsForCurrentView();
  const sessionsToday = visibleSessions
    .filter((session) => session.date === today)
    .sort((a, b) => a.time.localeCompare(b.time));
  const selectedSessions = visibleSessions
    .filter((session) => session.date === selectedDate)
    .sort((a, b) => a.time.localeCompare(b.time));
  const upcomingSessions = visibleSessions
    .filter((session) => session.date > today && session.date <= nextWeek)
    .sort(compareSessionsAscending);
  const sessionsTomorrow = visibleSessions.filter((session) => session.date === tomorrow);

  document.getElementById("scheduleOverview").innerHTML = [
    ["今日", `${sessionsToday.length} 堂`],
    ["明日", `${sessionsTomorrow.length} 堂`],
    ["未來 7 日", `${upcomingSessions.length} 堂`],
  ].map(([label, value]) => `
    <div class="timetable-overview-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `).join("");

  document.getElementById("dailyScheduleHeading").textContent = `${formatDisplayDate(selectedDate)}時間表`;
  document.getElementById("dailyScheduleList").innerHTML = renderDailySchedule(selectedSessions);
  document.getElementById("upcomingSessionList").innerHTML = renderWeeklySchedule(visibleSessions, today);

  document.querySelectorAll("[data-session-jump]").forEach((button) => {
    button.addEventListener("click", () => {
      const targetView = button.dataset.classType === "individual" ? "individual" : "attendance";
      document.getElementById(targetView === "individual" ? "individualAttendanceDate" : "attendanceDate").value = button.dataset.sessionDate;
      setView(targetView);
    });
  });
}

function scheduleSessionsForCurrentView() {
  const sessions = (state.sessions || []).filter((session) => canAccessSession(session));
  if (!isFounderRole() || scheduleViewScope === "all") return sessions;
  const coachName = normalizeCoachKey(currentAccount()?.coachName);
  if (!coachName) return sessions;
  return sessions.filter((session) => sessionCoachKeys(session).includes(coachName));
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
            <div class="meta-line">${escapeHtml(student.phone)}${student.note ? ` · ${escapeHtml(student.note)}` : ""}</div>
          </td>
          <td>${escapeHtml(student.group)}</td>
          <td>${latest ? escapeHtml(latest.packageName) : "未有"}</td>
          <td class="number-cell">${stats.purchased}</td>
          <td class="number-cell">${stats.used}</td>
          <td class="number-cell balance-cell${lowClass}">${stats.balance}</td>
          <td class="number-cell">${formatMoney(stats.unitRate)}</td>
          <td>${latest
            ? `<button class="payment-history-button" type="button" data-payment-history="${student.id}">${escapeHtml(formatDisplayDate(latest.date))}<strong>${formatMoney(latest.amount)}</strong></button>`
            : "未有紀錄"}</td>
        </tr>
      `;
    });

  document.getElementById("studentTableBody").innerHTML = rows.length
    ? rows.join("")
    : `<tr><td colspan="8">未找到學員</td></tr>`;
}

function renderAttendance() {
  renderAttendanceModule("group", "attendanceDate", "attendanceSessions");
}

function renderIndividualAttendance() {
  renderAttendanceModule("individual", "individualAttendanceDate", "individualSessions");
}

function renderAttendanceModule(classType, dateInputId, containerId) {
  const date = document.getElementById(dateInputId).value || hkTodayISO();
  const sessions = state.sessions
    .filter((session) => session.date === date)
    .filter((session) => getSessionClassType(session) === classType)
    .filter((session) => canAccessSession(session))
    .sort((a, b) => a.time.localeCompare(b.time));

  document.getElementById(containerId).innerHTML = sessions.length
    ? sessions.map(attendanceCard).join("")
    : `<div class="empty-state">${isCoachRole() ? "此日期未有可點名課堂" : "此日期未有課堂"}</div>`;
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
      label: "完成課堂",
      value: String(summary.completedSessions),
      detail: `${summary.totalSessions} 堂已排`,
    },
  ];

  document.getElementById("revenueMetrics").innerHTML = metrics
    .map((metric, index) => metricCard(metric, metricStyles[index]))
    .join("");

  const completedSessions = state.sessions
    .filter((session) => session.date === date && session.status === "completed")
    .sort((a, b) => a.time.localeCompare(b.time));
  document.getElementById("dailyRevenueSessions").innerHTML = completedSessions.length
    ? completedSessions.map(dailyRevenueSessionCard).join("")
    : `<div class="empty-state">此日期暫未有已完成課堂</div>`;
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

function renderDailySchedule(sessions, options = {}) {
  const earliestStart = sessions.length ? Math.min(...sessions.map(sessionStartMinutes)) : 8 * 60;
  const latestEnd = sessions.length ? Math.max(...sessions.map(sessionEndMinutes)) : 21 * 60;
  const startHour = Number.isFinite(options.startHour) ? options.startHour : Math.min(8, Math.floor(earliestStart / 60));
  const endHour = Number.isFinite(options.endHour) ? options.endHour : Math.max(22, Math.ceil(latestEnd / 60));
  const dayStart = startHour * 60;
  const totalMinutes = (endHour - startHour) * 60;
  const pixelsPerMinute = options.compact ? 0.62 : 0.9;
  const hourHeight = 60 * pixelsPerMinute;
  const timelineHeight = totalMinutes * pixelsPerMinute;
  const hourLabels = Array.from({ length: endHour - startHour + 1 }, (_, index) => {
    const hour = startHour + index;
    const labelTop = Math.min(Math.max(index * hourHeight, 7), timelineHeight - 7);
    return `<span class="timeline-hour-label" style="top:${labelTop}px">${String(hour).padStart(2, "0")}:00</span>`;
  }).join("");
  const events = layoutTimelineSessions(sessions).map(({ session, column, columns }) => {
    const top = (sessionStartMinutes(session) - dayStart) * pixelsPerMinute;
    const height = Math.max(normalizeDurationMinutes(session.durationMinutes) * pixelsPerMinute, options.compact ? 28 : 42);
    const left = (column / columns) * 100;
    const width = 100 / columns;
    const classType = getSessionClassType(session);
    return `
      <button class="timeline-event ${classType}" type="button"
        style="top:${top}px;height:${height}px;left:calc(${left}% + 2px);width:calc(${width}% - 4px)"
        data-session-jump="${session.id}" data-session-date="${session.date}" data-class-type="${classType}">
        <strong>${escapeHtml(session.time)} · ${escapeHtml(session.groupName)}</strong>
        <span>${escapeHtml(session.coach)}</span>
        ${session.location ? `<span>${escapeHtml(session.location)}</span>` : ""}
      </button>
    `;
  }).join("");

  return `
    <div class="day-timeline${options.compact ? " is-compact" : ""}" style="--timeline-height:${timelineHeight}px;--timeline-hour-height:${hourHeight}px">
      <div class="timeline-hours">${hourLabels}</div>
      <div class="timeline-grid" aria-label="當日課堂時間軸">
        ${events || `<div class="timeline-empty">此日期未有課堂</div>`}
      </div>
    </div>
  `;
}

function renderWeeklySchedule(sessions, today) {
  const dates = Array.from({ length: 7 }, (_, index) => addDaysISO(today, index + 1));
  const weekSessions = sessions.filter((session) => dates.includes(session.date));
  const earliestStart = weekSessions.length ? Math.min(...weekSessions.map(sessionStartMinutes)) : 8 * 60;
  const latestEnd = weekSessions.length ? Math.max(...weekSessions.map(sessionEndMinutes)) : 21 * 60;
  const startHour = Math.min(8, Math.floor(earliestStart / 60));
  const endHour = Math.max(22, Math.ceil(latestEnd / 60));

  return `
    <div class="weekly-schedule-track">
      ${dates.map((date) => {
        const daySessions = sessions
          .filter((session) => session.date === date)
          .sort((a, b) => a.time.localeCompare(b.time));
        return `
          <section class="weekly-day-column">
            <header>
              <strong>${escapeHtml(formatDisplayDate(date))}</strong>
              <span>${daySessions.length} 堂</span>
            </header>
            ${renderDailySchedule(daySessions, { startHour, endHour, compact: true })}
          </section>
        `;
      }).join("")}
    </div>
  `;
}

function layoutTimelineSessions(sessions) {
  const sorted = [...sessions].sort((a, b) => sessionStartMinutes(a) - sessionStartMinutes(b));
  const result = [];
  let cluster = [];
  let clusterEnd = -1;

  const finishCluster = () => {
    if (!cluster.length) return;
    const columnEnds = [];
    cluster.forEach((session) => {
      const start = sessionStartMinutes(session);
      let column = columnEnds.findIndex((end) => end <= start);
      if (column < 0) column = columnEnds.length;
      columnEnds[column] = sessionEndMinutes(session);
      result.push({ session, column, cluster });
    });
    const columns = columnEnds.length || 1;
    result.filter((item) => item.cluster === cluster).forEach((item) => {
      item.columns = columns;
      delete item.cluster;
    });
    cluster = [];
    clusterEnd = -1;
  };

  sorted.forEach((session) => {
    const start = sessionStartMinutes(session);
    if (cluster.length && start >= clusterEnd) finishCluster();
    cluster.push(session);
    clusterEnd = Math.max(clusterEnd, sessionEndMinutes(session));
  });
  finishCluster();
  return result;
}

function dailyRevenueSessionCard(session) {
  const classType = getSessionClassType(session);
  const students = session.studentIds.map(getStudent).filter(Boolean);
  const studentNames = students.map((student) => student.name);
  const attendeeCount = session.studentIds.filter((studentId) => {
    const status = session.attendance?.[studentId]?.status;
    return status === "present" || status === "absent";
  }).length;
  const people = classType === "group"
    ? `<details class="revenue-students"><summary>${attendeeCount} 人</summary><div>${studentNames.map(escapeHtml).join("、") || "未有學員"}</div></details>`
    : `<span>${escapeHtml(studentNames[0] || session.groupName || "未有學員")}</span>`;

  return `
    <article class="daily-revenue-card ${classType}">
      <div class="daily-revenue-title">
        <div>
          <span class="class-type-pill ${classType}">${classType === "individual" ? "Individual" : "Group"}</span>
          <h4>${escapeHtml(session.groupName)}</h4>
        </div>
        <strong>${formatMoney(getSessionRevenue(session))}</strong>
      </div>
      <div class="daily-revenue-meta">
        <div>
          <span>${escapeHtml(session.time)}</span>
          <span>${escapeHtml(session.location || "地點未設定")}</span>
        </div>
        <div>${people}</div>
      </div>
    </article>
  `;
}

function timetableSessionRow(session, showDate = false) {
  const statusClass = session.status === "completed" ? "completed" : "pending";
  const statusText = session.status === "completed" ? "已完成" : "未完成";
  const classType = getSessionClassType(session);
  const classLabel = classType === "individual" ? "Individual" : "Group";
  const dateLabel = showDate ? `${formatDisplayDate(session.date)} · ` : "";

  return `
    <article class="session-row timetable-session-row ${classType}">
      <div class="session-main">
        <div class="timetable-session-title">
          <span class="class-type-pill ${classType}">${classLabel}</span>
          <h4>${escapeHtml(dateLabel)}${escapeHtml(session.time)} · ${escapeHtml(session.groupName)}</h4>
        </div>
        <div class="meta-line">
          <span>${escapeHtml(session.coach)}</span>
          ${session.location ? `<span>${escapeHtml(session.location)}</span>` : ""}
          <span>${session.studentIds.length} 位學員</span>
          <span>${statusText}</span>
        </div>
      </div>
      <button class="secondary-button" data-session-jump="${session.id}" data-session-date="${session.date}" data-class-type="${getSessionClassType(session)}">
        <span class="status-pill ${statusClass}">${session.status === "completed" ? "查看" : "點名"}</span>
      </button>
    </article>
  `;
}

function compareSessionsAscending(a, b) {
  return `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);
}

function compareSessionsDescending(a, b) {
  return `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`);
}

function attendanceCard(session) {
  ensureSessionAttendance(session);
  const counts = getSessionCounts(session);
  const pendingCount = getPendingCount(session);
  const statusClass = session.status === "completed" ? "completed" : "pending";
  const statusText = `未點名：${pendingCount} 人 | 出席：${counts.present} 人 | 缺席：${counts.absent} 人`;
  const actionButton = session.status === "completed"
    ? `<button class="secondary-button" data-reopen-session="${session.id}">重新開啟</button>`
    : `<button class="primary-button" data-complete-session="${session.id}" ${pendingCount || !session.studentIds.length ? "disabled" : ""}>完成課堂</button>`;
  const addStudentControl = getSessionClassType(session) === "group" && session.status !== "completed"
    ? attendanceAddStudentControl(session)
    : "";

  return `
    <article class="attendance-card">
      <header class="attendance-card-header">
        <div class="attendance-title-block">
          <h4>${escapeHtml(session.time)} · ${escapeHtml(session.groupName)}</h4>
          <div class="meta-line">
            <span>${escapeHtml(formatDisplayDate(session.date))}</span>
            <span>${escapeHtml(session.coach)}</span>
            ${session.location ? `<span>${escapeHtml(session.location)}</span>` : ""}
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
      ${addStudentControl}
      <div class="roll-call">
        ${session.studentIds.map((studentId) => attendanceRow(session, studentId)).join("")}
      </div>
    </article>
  `;
}

function attendanceAddStudentControl(session) {
  const availableStudents = state.students
    .filter((student) => !session.studentIds.includes(student.id))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
  if (!availableStudents.length) return "";

  return `
    <div class="attendance-add-student">
      <select data-session-student-select aria-label="選擇加入課堂的學員">
        ${availableStudents.map((student) => {
          const stats = getStudentStats(student.id);
          return `<option value="${escapeHtml(student.id)}">${escapeHtml(student.name)} · ${escapeHtml(student.group)} · ${stats.balance} credit</option>`;
        }).join("")}
      </select>
      <button class="secondary-button" type="button" data-add-session-student data-session-id="${session.id}">
        <svg><use href="#icon-plus"></use></svg>
        <span>加入學員</span>
      </button>
    </div>
  `;
}

function addStudentToSession(sessionId, studentId) {
  const session = state.sessions.find((item) => item.id === sessionId);
  const student = getStudent(studentId);
  if (!session || !student || session.status === "completed") return;
  if (!canAccessSession(session)) {
    showToast("此帳戶沒有此課堂權限");
    return;
  }
  if (!session.studentIds.includes(studentId)) session.studentIds.push(studentId);
  ensureSessionAttendance(session);
  saveState();
  renderAll();
  showToast(`已加入 ${student.name}`);
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
  if (!canAccessSession(session)) {
    showToast("此帳戶沒有此班點名權限");
    return;
  }

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
  if (!canAccessSession(session)) {
    showToast("此帳戶沒有此班點名權限");
    return;
  }

  if (!session.studentIds.length) {
    showToast("請先加入最少一名學員");
    return;
  }

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
  if (!canAccessSession(session)) {
    showToast("此帳戶沒有此班點名權限");
    return;
  }
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

function openPaymentHistory(studentId) {
  const student = getStudent(studentId);
  if (!student) return;
  const payments = state.payments
    .filter((payment) => payment.studentId === studentId)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  document.getElementById("paymentHistoryTitle").textContent = `${student.name} · 收費紀錄`;
  document.getElementById("paymentHistoryList").innerHTML = payments.length
    ? payments.map((payment) => `
        <article class="payment-history-row">
          <div class="payment-history-main">
            <strong>${escapeHtml(payment.packageName)}</strong>
            <strong>${formatMoney(payment.amount)}</strong>
          </div>
          <div class="payment-history-meta">
            <span>${escapeHtml(formatDisplayDate(payment.date))}</span>
            <span>${escapeHtml(payment.method || "未註明")}</span>
            <span>${Number(payment.credits || 0)} credit</span>
            ${payment.note ? `<span>${escapeHtml(payment.note)}</span>` : ""}
          </div>
        </article>
      `).join("")
    : `<div class="empty-state">未有收費紀錄</div>`;
  document.getElementById("paymentHistoryModal").hidden = false;
}

function closePaymentHistory() {
  document.getElementById("paymentHistoryModal").hidden = true;
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
  if (session.classType === "group") return "group";
  if ((session.studentIds || []).length <= 1) return "individual";
  return individualKeywords.some((keyword) => groupName.includes(keyword)) ? "individual" : "group";
}

function normalizeDurationMinutes(value) {
  const duration = Number(value || 60);
  return [60, 90, 120].includes(duration) ? duration : 60;
}

function sessionStartMinutes(session) {
  const [hour, minute] = normalizeTime(session.time, "00:00").split(":").map(Number);
  return hour * 60 + minute;
}

function sessionEndMinutes(session) {
  return sessionStartMinutes(session) + normalizeDurationMinutes(session.durationMinutes);
}

function formatMinutesAsTime(value) {
  const minutes = Math.max(0, Number(value || 0));
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatSessionTimeRange(session) {
  return `${normalizeTime(session.time, "00:00")}-${formatMinutesAsTime(sessionEndMinutes(session))}`;
}

function formatDurationShort(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder} 分鐘`;
  return remainder ? `${hours} 小時 ${remainder} 分鐘` : `${hours} 小時`;
}

function findSessionConflict(candidate) {
  const candidateCoaches = new Set(sessionCoachKeys(candidate));
  const candidateStudents = new Set((candidate.studentIds || []).map(String));
  const start = sessionStartMinutes(candidate);
  const end = sessionEndMinutes(candidate);
  const conflict = state.sessions.find((session) => {
    if (session.id === candidate.id || session.date !== candidate.date) return false;
    const overlaps = start < sessionEndMinutes(session) && end > sessionStartMinutes(session);
    if (!overlaps) return false;
    const coachOverlap = sessionCoachKeys(session).some((coach) => candidateCoaches.has(coach));
    const studentOverlap = (session.studentIds || []).some((studentId) => candidateStudents.has(String(studentId)));
    return coachOverlap || studentOverlap;
  });
  if (!conflict) return "";

  const coachNames = sessionCoachKeys(conflict).filter((coach) => candidateCoaches.has(coach));
  const studentNames = (conflict.studentIds || [])
    .filter((studentId) => candidateStudents.has(String(studentId)))
    .map((studentId) => getStudent(studentId)?.name)
    .filter(Boolean);
  const person = [...coachNames, ...studentNames].join("、") || "所選教練或學員";
  return `未能新增：${person} 在 ${formatSessionTimeRange(conflict)} 已有「${conflict.groupName}」`;
}

function configureScheduleForm(classType = "group") {
  scheduleReturnView = classType === "individual" ? "individual" : "attendance";
  const typeSelect = document.getElementById("sessionClassType");
  const groupName = document.getElementById("sessionGroupName");
  const groupNameField = document.getElementById("sessionGroupNameField");
  const studentsLabel = document.getElementById("sessionStudentsLabel");
  const returnLabel = document.getElementById("scheduleReturnLabel");
  const isIndividual = classType === "individual";
  if (typeSelect) typeSelect.value = isIndividual ? "individual" : "group";
  if (groupNameField) groupNameField.hidden = isIndividual;
  if (groupName) {
    groupName.required = !isIndividual;
    groupName.placeholder = "例：U12 小組A";
    if (isIndividual) groupName.value = "";
  }
  if (studentsLabel) studentsLabel.textContent = isIndividual ? "學員（只選一名）" : "預先加入學員（可選）";
  if (returnLabel) returnLabel.textContent = classType === "individual" ? "返回個人班" : "返回小組班";
}

function renderSessionDateList() {
  const container = document.getElementById("sessionDateList");
  if (!container) return;
  container.innerHTML = pendingSessionDates.map((date) => `
    <span class="session-date-chip">
      ${escapeHtml(formatDisplayDate(date))}
      <button type="button" data-remove-session-date="${date}" aria-label="移除 ${escapeHtml(date)}">×</button>
    </span>
  `).join("");
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
        sessionLabel: `${formatSessionTimeRange(session)} ${session.groupName}`,
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

function exportMonthlyRevenueCsv() {
  if (!requireAuthenticatedAccess("revenue")) return;

  const month = document.getElementById("revenueMonth").value || hkTodayISO().slice(0, 7);
  const sessions = state.sessions
    .filter((session) => session.status === "completed" && session.date.startsWith(`${month}-`))
    .sort(compareSessionsAscending);
  if (!sessions.length) {
    showToast("此月份沒有可匯出的收入紀錄");
    return;
  }

  const header = ["日期", "時間", "類別", "課堂", "地點", "教練", "人數", "學員", "收入HKD"];
  const body = sessions.map((session) => [
    session.date,
    session.time,
    getSessionClassType(session) === "individual" ? "Individual" : "Group",
    session.groupName,
    session.location || "",
    session.coach,
    session.studentIds.length,
    session.studentIds.map((studentId) => getStudent(studentId)?.name || "未知學員").join("、"),
    getSessionRevenue(session),
  ]);
  const csv = [header, ...body]
    .map((line) => line.map(csvCell).join(","))
    .join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `badminton-monthly-revenue-${month}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("每月收入 CSV 已匯出");
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
