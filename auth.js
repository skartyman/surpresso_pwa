const AUTH_STORAGE_KEY = "surp_user";
const USER_SHEET_ID = "1TcDW8xV_-wdkBdK0FNCVmK-ZiHahnnsB9JsXvEUBA1s";
const USER_SHEET_GID = 0;

(function initSurpAuthGlobal() {
  let users = [];
  let currentUser = null;
  let initPromise = null;
  let handlersBound = false;
  let resolveAuthWaiter = null;

  function ensureLoginScreen() {
    let screen = document.getElementById("login-screen");
    if (screen) return screen;

    screen = document.createElement("div");
    screen.id = "login-screen";
    screen.className = "login-screen";
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

  async function loadUsers() {
    const url = `https://docs.google.com/spreadsheets/d/${USER_SHEET_ID}/export?format=csv&gid=${USER_SHEET_GID}&v=${Date.now()}`;
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const text = await resp.text();
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    users = parsed.data.map(row => ({
      login: String(row.login || "").trim(),
      pass: String(row.pass || "").trim(),
      name: String(row.name || "").trim(),
      role: String(row.role || "").trim()
    })).filter(user => user.login && user.pass);
    return users;
  }

  function findValidUser(candidate) {
    if (!candidate) return null;
    const login = String(candidate.login || "").trim();
    const pass = String(candidate.pass || "").trim();
    if (!login || !pass) return null;
    return users.find(user => user.login === login && user.pass === pass) || null;
  }

  function setCurrentUser(user) {
    currentUser = user || null;
    window.CURRENT_USER = currentUser;
    window.USERS = users;
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

  function completeAuth(user) {
    setCurrentUser(user);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    hideLogin();
    document.dispatchEvent(new CustomEvent("surp-auth-ready", { detail: { user, users } }));
    if (resolveAuthWaiter) {
      resolveAuthWaiter(user);
      resolveAuthWaiter = null;
    }
    return user;
  }

  function bindHandlers() {
    if (handlersBound) return;
    handlersBound = true;

    const submit = () => {
      const { user, pass, error } = getInputs();
      const found = findValidUser({ login: user?.value, pass: pass?.value });
      if (!found) {
        if (error) error.textContent = "Неверный логин или пароль";
        return;
      }
      completeAuth(found);
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
      await loadUsers();

      const savedRaw = localStorage.getItem(AUTH_STORAGE_KEY);
      let savedUser = null;
      try {
        savedUser = savedRaw ? JSON.parse(savedRaw) : null;
      } catch (error) {
        savedUser = null;
      }
      const validSavedUser = findValidUser(savedUser);

      if (validSavedUser) {
        return completeAuth(validSavedUser);
      }

      localStorage.removeItem(AUTH_STORAGE_KEY);
      setCurrentUser(null);
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
