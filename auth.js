const AUTH_STORAGE_KEY = "surp_user";
const AUTH_SESSION_KEY = "surp_auth_session";
const AUTH_TTL_MS = 24 * 60 * 60 * 1000;
const USER_SHEET_ID = "1TcDW8xV_-wdkBdK0FNCVmK-ZiHahnnsB9JsXvEUBA1s";
const USER_SHEET_GID = 0;

(function initSurpAuthGlobal() {
  let users = [];
  let currentUser = null;
  let initPromise = null;
  let handlersBound = false;
  let resolveAuthWaiter = null;
  let usersLoadPromise = null;

  function now() {
    return Date.now();
  }

  function ensureLoginScreen() {
    let screen = document.getElementById("login-screen");
    if (screen) {
      screen.classList.add("hidden");
      return screen;
    }

    screen = document.createElement("div");
    screen.id = "login-screen";
    screen.className = "login-screen hidden";
    screen.innerHTML = `
      <div class="login-box">
        <h2>Вход в систему</h2>
        <input id="login-user" type="text" placeholder="Логин" class="login-input">
        <input id="login-pass" type="password" placeholder="Пароль" class="login-input">
        <button id="login-btn" class="btn primary wide" type="button">Войти</button>
        <div id="login-error" class="login-error"></div>
      </div>
    `;
    document.body.appendChild(screen);
    return screen;
  }

  function getInputs() {
    ensureLoginScreen();
    return {
      screen: document.getElementById("login-screen"),
      user: document.getElementById("login-user"),
      pass: document.getElementById("login-pass"),
      error: document.getElementById("login-error"),
      button: document.getElementById("login-btn")
    };
  }

  function normalizeUserRow(row) {
    return {
      login: String(row.login || "").trim(),
      pass: String(row.pass || "").trim(),
      name: String(row.name || "").trim(),
      role: String(row.role || "").trim()
    };
  }

  function createSessionFromUser(user) {
    return {
      login: String(user?.login || "").trim(),
      name: String(user?.name || "").trim(),
      role: String(user?.role || "").trim(),
      token: user?.token || `surp-${Math.random().toString(36).slice(2)}-${now()}`,
      authenticatedAt: Number(user?.authenticatedAt) || now()
    };
  }

  function saveSession(user) {
    const session = createSessionFromUser(user);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
    sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function clearSession() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(AUTH_SESSION_KEY);
    sessionStorage.removeItem(AUTH_SESSION_KEY);
  }

  function safeParse(raw) {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function getSavedSessionRaw() {
    return (
      sessionStorage.getItem(AUTH_SESSION_KEY) ||
      localStorage.getItem(AUTH_SESSION_KEY) ||
      localStorage.getItem(AUTH_STORAGE_KEY)
    );
  }

  function hasFreshAuth(session) {
    if (!session || typeof session !== "object") return false;

    const authenticatedAt = Number(session.authenticatedAt || 0);
    if (!authenticatedAt || now() - authenticatedAt > AUTH_TTL_MS) return false;

    const login = String(session.login || "").trim();
    if (!login) return false;

    const token = String(session.token || "").trim();
    if (!token) return false;

    return true;
  }

  function getSavedSession() {
    const parsed = safeParse(getSavedSessionRaw());
    if (hasFreshAuth(parsed)) return parsed;
    return null;
  }

  function getPapaParser() {
    const parser = window.Papa;
    if (!parser || typeof parser.parse !== "function") {
      const message = "PapaParse не загружен: подключите https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js до auth.js";
      console.error(message);
      throw new Error(message);
    }
    return parser;
  }

  async function loadUsers() {
    if (usersLoadPromise) return usersLoadPromise;

    usersLoadPromise = (async () => {
      const url = `https://docs.google.com/spreadsheets/d/${USER_SHEET_ID}/export?format=csv&gid=${USER_SHEET_GID}&v=${Date.now()}`;
      const resp = await fetch(url, { cache: "no-store" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const text = await resp.text();
      const parsed = getPapaParser().parse(text, { header: true, skipEmptyLines: true });
      users = parsed.data
        .map(normalizeUserRow)
        .filter(user => user.login && user.pass);

      window.USERS = users;
      document.dispatchEvent(new CustomEvent("surp-auth-users-updated", { detail: { users: [...users] } }));
      return users;
    })().catch(error => {
      usersLoadPromise = null;
      throw error;
    });

    return usersLoadPromise;
  }

  function findValidUser(candidate) {
    if (!candidate) return null;
    const login = String(candidate.login || "").trim();
    const pass = String(candidate.pass || "").trim();
    if (!login || !pass) return null;
    return users.find(user => user.login === login && user.pass === pass) || null;
  }

  function findUserByLogin(login) {
    const normalizedLogin = String(login || "").trim();
    if (!normalizedLogin) return null;
    return users.find(user => user.login === normalizedLogin) || null;
  }

  function setCurrentUser(user) {
    currentUser = user || null;
    window.CURRENT_USER = currentUser;
    if (!window.USERS && users.length) {
      window.USERS = users;
    }
  }

  function hideLogin() {
    const { screen, error, pass } = getInputs();
    if (error) error.textContent = "";
    if (pass) pass.value = "";
    screen?.classList.add("hidden");
  }

  function showLogin(message = "") {
    const { screen, error, user, pass } = getInputs();
    screen?.classList.remove("hidden");
    if (error) error.textContent = message;
    setTimeout(() => {
      if (user?.value?.trim()) pass?.focus();
      else user?.focus();
    }, 0);
  }

  function emitAuthReady(user) {
    document.dispatchEvent(new CustomEvent("surp-auth-ready", { detail: { user, users } }));
  }

  function completeAuth(user, { resolveWaiter = true } = {}) {
    const session = saveSession(user);
    const safeUser = {
      login: session.login,
      name: session.name,
      role: session.role,
      token: session.token,
      authenticatedAt: session.authenticatedAt
    };

    setCurrentUser(safeUser);
    hideLogin();
    emitAuthReady(safeUser);

    if (resolveWaiter && resolveAuthWaiter) {
      resolveAuthWaiter(safeUser);
      resolveAuthWaiter = null;
    }

    return safeUser;
  }

  function clearCurrentAuth() {
    clearSession();
    setCurrentUser(null);
  }

  async function validateSessionInBackground(session) {
    try {
      await loadUsers();
      const serverUser = findUserByLogin(session.login);
      if (!serverUser) {
        clearCurrentAuth();
        showLogin("Сессия недействительна. Войдите снова.");
        return;
      }
      completeAuth({ ...serverUser, token: session.token }, { resolveWaiter: false });
    } catch (error) {
      console.warn("Фоновая проверка авторизации не удалась", error);
    }
  }

  function bindHandlers() {
    if (handlersBound) return;
    handlersBound = true;

    const submit = async () => {
      const { user, pass, error, button } = getInputs();
      if (button) button.disabled = true;

      try {
        await loadUsers();
        const found = findValidUser({ login: user?.value, pass: pass?.value });
        if (!found) {
          if (error) error.textContent = "Неверный логин или пароль";
          return;
        }
        completeAuth(found);
      } catch (loadError) {
        console.error(loadError);
        if (error) error.textContent = "Не удалось проверить авторизацию";
      } finally {
        if (button) button.disabled = false;
      }
    };

    getInputs().button?.addEventListener("click", submit);
    getInputs().pass?.addEventListener("keydown", event => {
      if (event.key === "Enter") submit();
    });
  }

  async function init() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
      ensureLoginScreen();
      bindHandlers();

      const savedSession = getSavedSession();
      if (savedSession) {
        const hydratedUser = {
          login: savedSession.login,
          name: savedSession.name,
          role: savedSession.role,
          token: savedSession.token,
          authenticatedAt: savedSession.authenticatedAt
        };

        setCurrentUser(hydratedUser);
        hideLogin();
        emitAuthReady(hydratedUser);
        validateSessionInBackground(savedSession);
        return hydratedUser;
      }

      clearCurrentAuth();
      showLogin();

      return new Promise(resolve => {
        resolveAuthWaiter = resolve;
      });
    })().catch(err => {
      console.error("Auth init failed", err);
      showLogin("Не удалось загрузить пользователей");
      initPromise = null;
      throw err;
    });

    return initPromise;
  }

  function getCurrentUser() {
    return currentUser;
  }

  function getUsers() {
    return [...users];
  }

  window.SurpAuth = {
    init,
    getCurrentUser,
    getUsers
  };
})();
