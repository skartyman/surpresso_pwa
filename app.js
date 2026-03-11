const APP_VERSION = "1.1.4"; // ← меняешь вручную при обновлениях
const SAVED_VERSION = localStorage.getItem("surp_version");

if (SAVED_VERSION && SAVED_VERSION !== APP_VERSION) {
  console.log("Версия изменилась:", SAVED_VERSION, "→", APP_VERSION);
  localStorage.setItem("surp_version", APP_VERSION);
  location.reload(true);
} else {
  localStorage.setItem("surp_version", APP_VERSION);
}
let TESSERACT_LOADING = false;

async function loadTesseract() {
  if (window.Tesseract) return;

  if (TESSERACT_LOADING) {
    // ждём пока догрузится
    return new Promise(resolve => {
      const i = setInterval(() => {
        if (window.Tesseract) {
          clearInterval(i);
          resolve();
        }
      }, 100);
    });
  }

  TESSERACT_LOADING = true;

  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    s.onload = () => {
      TESSERACT_LOADING = false;
      resolve();
    };
    s.onerror = reject;
    document.body.appendChild(s);
  });
}

// IDs Google Sheets
const PARTS_SHEET_ID = "1kHTj9-Hh5ZjR1iHKXEiAxKx6XSsd_RE2SDJq9eBqRZ8";
const PARTS_GID = 1099059228;

// Услуги — два файла
const SERVICE_SHEETS = [
  {
    id: "12OywbETHmNaNXDh4y4VvBrglrCeq42WIwusxQf65SOo",
    gid: 1600283227
  },
  {
    id: "1z4brNfkWfiQkqYc73EjpFiLW9mnOzJncvfnBB3ct3JM",
    gid: 1241500773
  }
];
const USER_SHEET_ID  = "1TcDW8xV_-wdkBdK0FNCVmK-ZiHahnnsB9JsXvEUBA1s";
const USER_SHEET_GID = 0;

// Шаблоны наборов
const TEMPLATES_FILE_ID = "1b7msmOoFsJpQzyXpt7vsNKdxOpN_2kn3"; // JSON на Google Drive (чтение)https://drive.google.com/file/d/1b7msmOoFsJpQzyXpt7vsNKdxOpN_2kn3/view?usp=sharing
const TEMPLATE_SAVE_WEBHOOK = "https://script.google.com/macros/s/AKfycbwtsXXhRM104adebpAl50eMULdaUlCpBitmQNeDdJA3SVfzyRR7R1ibRql0JKJKUC6aCQ/exec";

let USERS = [];   // загруженные пользователи
let CURRENT_USER = null;

function getUserDisplayName(user) {
  return (user?.name || user?.login || "").trim();
}

function getUniqueUserNames() {
  const seen = new Set();
  return USERS.map(getUserDisplayName)
    .filter(Boolean)
    .filter(name => {
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    });
}

function fillEngineerSelect(select, selectedValue = "") {
  if (!select) return;
  const names = getUniqueUserNames();
  const current = selectedValue || select.value || "";

  select.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Выберите инженера";
  select.appendChild(placeholder);

  names.forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    if (name === current) opt.selected = true;
    select.appendChild(opt);
  });

  if (current && !names.includes(current)) {
    const opt = document.createElement("option");
    opt.value = current;
    opt.textContent = current;
    opt.selected = true;
    select.appendChild(opt);
  }
}

function populateEngineerSelects(preferredName = "") {
  const selects = [...document.querySelectorAll(".engineer-input")];
  selects.forEach((sel, idx) => {
    const desired = idx === 0 ? preferredName : "";
    fillEngineerSelect(sel, desired);
  });
}

// Глобальные массивы
let parts = [];
let services = [];
let items = []; // {code,name,qty,price,sum}
let kit = []; // набор со склада
let warehouseTemplates = [];
let templatesPanelOpen = false;
let editingTemplateId = null;
let partsRequestSelected = new Map();
let partsRequestFilter = "";
// ===== Templates: ID + local cache =====
const TEMPLATES_CACHE_KEY = "surp_templates_cache_v1";

function genTemplateId() {
  // modern browsers
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  // fallback
  return "tpl-" + Date.now() + "-" + Math.random().toString(16).slice(2, 10);
}

function saveTemplatesCache(items) {
  try {
    localStorage.setItem(TEMPLATES_CACHE_KEY, JSON.stringify(items || []));
  } catch (e) {
    console.warn("saveTemplatesCache failed", e);
  }
}

function loadTemplatesCache() {
  try {
    return JSON.parse(localStorage.getItem(TEMPLATES_CACHE_KEY) || "[]");
  } catch {
    return [];
  }
}

function normalizeTemplate(tpl, idx = 0) {
  if (!tpl) return null;
  return {
    ...tpl,
    id: tpl.id || tpl.templateId || tpl.createdAt || `tpl-${idx}-${Date.now()}`
  };
}
// ======================
// Загрузка пользователей
// ======================
async function loadUsers() {
  const url = `https://docs.google.com/spreadsheets/d/${USER_SHEET_ID}/export?format=csv&gid=${USER_SHEET_GID}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("HTTP " + resp.status);

    const text = await resp.text();
    const rows = Papa.parse(text, { header: true, skipEmptyLines: true }).data;

    USERS = rows.map(r => ({
      login: (r.login || "").trim(),
      pass:  (r.pass  || "").trim(),
      name:  (r.name  || "").trim(),
      role:  (r.role  || "").trim()
    }));

   // console.log("Пользователи загружены:", USERS);

  } catch (e) {
    console.error("Ошибка загрузки пользователей:", e);
    alert("Не удалось загрузить пользователей!");
  }
}

// ======================
// Проверка логина
// ======================
function tryLogin() {
  const u = document.getElementById("login-user").value.trim();
  const p = document.getElementById("login-pass").value.trim();
  const err = document.getElementById("login-error");

  const user = USERS.find(x => x.login === u && x.pass === p);

  if (!user) {
    err.textContent = "Неверный логин или пароль";
    return;
  }

  // Успешный вход
  CURRENT_USER = user;
  localStorage.setItem("surp_user", JSON.stringify(user));

  // скрываем экран логина
  document.getElementById("login-screen").classList.add("hidden");

  // авто-подстановка инженера
  addEngineerIfNotExists(user.name);
}

// ======================
// Авто-добавление инженера
// ======================
function addEngineerIfNotExists(name) {
  const inputs = [...document.querySelectorAll(".engineer-input")];
  const exists = inputs.some(i => i.value.trim() === name);

  if (!exists) {
    fillEngineerSelect(inputs[0], name);
  }
}

// ======================
// Инициализация авторизации
// ======================
async function initLogin() {
  await loadUsers();
  populateEngineerSelects();

  // если пользователь уже входил — восстанавливаем
  const saved = localStorage.getItem("surp_user");
  if (saved) {
    CURRENT_USER = JSON.parse(saved);
    document.getElementById("login-screen").classList.add("hidden");
    addEngineerIfNotExists(CURRENT_USER.name);
    return;
  }

  // кнопка "Войти"
  document.getElementById("login-btn").addEventListener("click", tryLogin);

  // Enter key
  document.getElementById("login-pass").addEventListener("keydown", e => {
    if (e.key === "Enter") tryLogin();
  });
}
// ======================
// Чистка цены
// ======================
function cleanPrice(raw) {
  if (!raw) return 0;
  let v = String(raw)
    .replace(/"/g, "")
    .replace(/\u00A0|\u202F/g, "")
    .replace(/\s+/g, "")
    .replace(/грн|uah|₴/gi, "")
    .trim();
  v = v.replace(/[^0-9.,-]/g, "");
  if (v.includes(",") && !v.includes(".")) v = v.replace(",", ".");
  else if (v.includes(",") && v.includes(".")) v = v.replace(/,/g, "");
  const num = parseFloat(v);
  return isNaN(num) ? 0 : num;
}

// ======================
// Normalize (унификация колонок)
// ======================
function normalizeRows(rows) {
  const out = [];

  rows.forEach(row => {
    const lc = {};
    for (const [k, v] of Object.entries(row)) {
      if (!k) continue;
      lc[k.trim().toLowerCase()] = v;
    }

    const pick = masks => {
      for (const mask of masks) {
        for (const [k, v] of Object.entries(lc)) {
          if (k.includes(mask) && v !== "" && v !== undefined) return v;
        }
      }
      return "";
    };

    const rawCode  = pick(["артикул", "код", "art", "article"]);
    const rawName  = pick(["наименование", "найменування", "название", "описание", "name"]);
    const rawPrice = pick(["цена", "ціна", "стоимость", "price", "грн"]);

    const code  = String(rawCode || "").trim();
    const name  = String(rawName || "").trim();
    const price = cleanPrice(rawPrice);

    const stock = pick(["залишок", "налич", "stock", "остат"]);
    const cell  = pick(["комірка", "ячейк", "cell", "shelf"]);

    const hasCode  = code.length > 0;
    const hasName  = name.length > 0;
    const hasPrice = price > 0;

    // ❌ пустая строка
    if (!hasCode && !hasName) return;

    // ❌ заголовки разделов
    // 1) нет кода и нет цены
    // 2) ИЛИ заканчивается двоеточием
    // 3) ИЛИ ВСЕ ЗАГЛАВНЫЕ и цена 0
    if (
      (!hasCode && !hasPrice) ||
      name.endsWith(":") ||
      (name === name.toUpperCase() && !hasPrice)
    ) {
      return;
    }

    // ✅ валидная позиция
    out.push({
      code,
      name,
      price,
      stock: stock || "",
      cell:  cell  || ""
    });
  });

  return out;
}

// ======================
// CSV → массив (всегда свежий запрос)
// ======================
async function fetchSheetCSV(sheetId, gid) {

  // cache-buster чтобы обойти кеш SW и браузера
  const url = 
    `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}&v=${Date.now()}`;

  const resp = await fetch(url, { cache: "no-store" });  

  if (!resp.ok) throw new Error("HTTP " + resp.status);

  const text = await resp.text();

  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true
  });

  return parsed.data;
}

// ======================
// Загрузка всех прайсов
// ======================
async function loadPrices() {
  try {
    // === ЗАПЧАСТИ ===
    const pRows = await fetchSheetCSV(PARTS_SHEET_ID, PARTS_GID);
    parts = normalizeRows(pRows);

    // === УСЛУГИ (2 файла) ===
    let sRows = [];

    for (const sheet of SERVICE_SHEETS) {
      let rows = await fetchSheetCSV(sheet.id, sheet.gid);

      // убираем пустые строки
      rows = rows.filter(r =>
        Object.values(r).some(v => v && String(v).trim() !== "")
      );

      sRows.push(...rows);
    }

    services = normalizeRows(sRows);

    localStorage.setItem("surp_parts", JSON.stringify(parts));
    localStorage.setItem("surp_services", JSON.stringify(services));

  } catch (err) {
    console.error("Ошибка загрузки:", err);

    const cp = localStorage.getItem("surp_parts");
    const cs = localStorage.getItem("surp_services");

    if (cp && cs) {
      parts = JSON.parse(cp);
      services = JSON.parse(cs);
      alert("Прайс загружен из кэша.");
    } else {
      alert("Ошибка загрузки прайс-листов.");
    }
  }
}

// ======================================
// УМНЫЙ ФУЗЗИ ПОИСК + ПОИСК ПО ЯЧЕЙКЕ
// ======================================
// ===== helpers (search) =====
// ===== helpers =====
function isCodeLikeQuery(q) {
  return /\d/.test(String(q || ""));
}

// оставляем буквы (включая кириллицу) + цифры
function normalizeSearch(str) {
  let s = String(str || "").toLowerCase();

  // приводим составные символы к базовой форме:
  // "й" -> "и", "ё" -> "е" (и т.п.) чтобы запрос и данные сравнивались одинаково
  s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

  // синонимы микрофарад
  s = s.replace(/µf/g, "uf").replace(/мкф/g, "uf");

  // оставляем буквы/цифры (лат, кир, укр) — без Unicode \p{...} чтобы не ломалось
  s = s.replace(/[^a-z0-9а-яёіїєґ]+/gi, "");
  return s;
}

function tokenizeQuery(q) {
  return String(q || "")
    .toLowerCase()
    .replace(/µf/g, "uf")
    .replace(/мкф/g, "uf")
    .split(/[\s,.;:|/\\()+\-_]+/g)
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => normalizeSearch(t))
    .filter(Boolean);
}

// "0.4", "0,4", "0.40" -> "0.4"
function normalizeCell(cell) {
  let s = String(cell || "").trim().toLowerCase();
  s = s.replace(/\s+/g, "");
  s = s.replace(/,/g, ".");
  s = s.split(".").map(seg => (/^\d+$/.test(seg) ? String(parseInt(seg, 10)) : seg)).join(".");
  return s;
}

function looksLikeCellQuery(q) {
  const s = String(q || "").trim();
  if (!s) return false;

  // ЯЧЕЙКА = начинается с цифры и содержит разделитель (., -, /)
  // Примеры: "0.4", "2.4.7", "12-3", "1/2", "0,4"
  // А вот "DC1" сюда больше НЕ попадает.
  return /^\d+([.,\-\/]\d+)+$/.test(s);
}


function parseStockNum(stockRaw) {
  if (stockRaw === null || stockRaw === undefined) return NaN;
  const s = String(stockRaw).replace(/\s+/g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}
function inStock(item) {
  const n = parseStockNum(item?.stock);
  return Number.isFinite(n) && n > 0;
}

// ======================================
// ✅ filterList: ячейка строго, иначе адекватный поиск
// opts.preferStock = true только для parts/warehouse
// ======================================
function filterList(list, query, opts = {}) {
  if (!query || !String(query).trim()) return [];

  const preferStock = !!opts.preferStock;
  const qRaw = String(query).trim();
  const q = qRaw.toLowerCase();

  // 1) 🔎 Режим ячейки — строгое совпадение нормализованной ячейки
  if (looksLikeCellQuery(qRaw)) {
    const qCell = normalizeCell(qRaw);
    return list
      .filter(item => normalizeCell(item.cell) === qCell)
      .slice(0, 200);
  }

  const tokens = tokenizeQuery(qRaw);            // ["конденсатор","6"]
  const qNorm = normalizeSearch(qRaw);           // "конденсатор6"
  const codeMode = isCodeLikeQuery(qRaw);

  const hasLetters = /[a-zа-яё]/i.test(qRaw);
  const hasDigits  = /\d/.test(qRaw);
  const strictTokens = hasLetters && hasDigits;  // "конденсатор 6" / "dc1" / "8f404s" => строгий режим

  const scored = list.map(item => {
    const code = String(item.code || "");
    const name = String(item.name || "");
    const cell = String(item.cell || "");
    const stockRaw = item.stock;

    const codeN = normalizeSearch(code);
    const nameN = normalizeSearch(name);
    const cellN = normalizeSearch(cell);

    const hayN = codeN + nameN + cellN;

    // приоритеты по коду
    const exactCode = qNorm && (codeN === qNorm);
    const prefixCode = qNorm && codeN.startsWith(qNorm);
    const inclCode = qNorm && codeN.includes(qNorm);

    // сколько токенов реально нашли
    let hitCount = 0;
    for (const t of tokens) {
      if (t && hayN.includes(t)) hitCount++;
    }
    const allTokensHit = tokens.length ? (hitCount === tokens.length) : false;

    // --- фильтрация "мусора" ---
    // если запрос смешанный (буквы+цифры) — требуем, чтобы ВСЕ токены были найдены
    // это убирает резинки/наклейки при запросе "конденсатор 6"
    let passes = true;
    if (strictTokens && tokens.length >= 2) {
      passes = allTokensHit;
    } else if (codeMode) {
      // кодовый режим: пусть проходит если есть совпадение по коду
      // или есть хотя бы 1 токен в названии/коде
      passes = exactCode || prefixCode || inclCode || hitCount > 0;
    } else {
      // обычный текст: хотя бы 1 токен
      passes = hitCount > 0;
    }

    // --- скоринг ---
    let score = 0;

    if (exactCode) score += 5000;
    else if (prefixCode) score += 3000;
    else if (inclCode) score += 1600;

    // токены (именно name/code/cell)
    score += hitCount * 250;

    // небольшой бонус за совпадение в названии отдельно
    if (tokens.length) {
      let nameHits = 0;
      for (const t of tokens) if (t && nameN.includes(t)) nameHits++;
      score += nameHits * 120;
    }

    // наличие — только если включили preferStock (parts/warehouse)
    const stockOk = preferStock ? inStock(item) : false;
    if (stockOk) score += 900;

    return { item, score, passes, stockOk, exactCode, prefixCode };
  });

  return scored
    .filter(x => x.passes)
    .sort((a, b) => {
      // 1) точный код всегда №1 (даже если нет в наличии)
      if (a.exactCode !== b.exactCode) return a.exactCode ? -1 : 1;

      // 2) дальше префикс по коду
      if (a.prefixCode !== b.prefixCode) return a.prefixCode ? -1 : 1;

      // 3) затем наличие (только если preferStock включен)
      if (preferStock && a.stockOk !== b.stockOk) return a.stockOk ? -1 : 1;

      // 4) общий score
      return b.score - a.score;
    })
    .map(x => x.item)
    .slice(0, 50);
}
// ======================
// Подсказки
// ======================
function attachSuggest(inputId, suggestId, sourceList) {
  const input = document.getElementById(inputId);
  const suggest = document.getElementById(suggestId);
  if (!input || !suggest) return;

  input.addEventListener("input", () => {
    suggest.innerHTML = "";

    if (inputId === "parts-input") {
      const info = document.getElementById("parts-info");
      if (info) info.innerHTML = "";
    }

    const text = input.value.trim();
    if (!text) return;

    const preferStock = (inputId === "parts-input" || inputId === "warehouse-input");
    const results = filterList(sourceList, text, { preferStock });

    if (!results.length) return;

    const ul = document.createElement("ul");

    results.forEach(item => {
      const li = document.createElement("li");

      let extraHTML = "";
      if (inputId === "parts-input" || inputId === "warehouse-input") {
        extraHTML = `
          <div class="extra">
            📦 ${item.stock || "—"} &nbsp; | &nbsp; 🗄 ${item.cell || "—"}
          </div>
        `;
      }

      li.innerHTML = `
        <div class="code">${item.code || ""}</div>
        <div class="name">${item.name || ""}</div>
        <div class="price">${(item.price || 0).toFixed(2)} грн</div>
        ${extraHTML}
      `;

      li.addEventListener("click", () => {
        input.value = item.code || item.name || "";
        suggest.innerHTML = "";

        if (inputId === "parts-input") {
          const info = document.getElementById("parts-info");
          if (info) {
            info.innerHTML = `
              <span><span class="icon">📦</span> ${item.stock || "—"}</span>
              <span><span class="icon">🗄</span> ${item.cell || "—"}</span>
            `;
          }
        }
      });

      ul.appendChild(li);
    });

    suggest.appendChild(ul);
  });

  document.addEventListener("click", e => {
    if (!suggest.contains(e.target) && e.target !== input) {
      suggest.innerHTML = "";
    }
  });
}
function addOrMergeItem({ code, name, qty, price, type }) {
  const qtyAdd = +(+qty || 0).toFixed(2);
  if (qtyAdd <= 0) return;

  const ex = items.find(it =>
    it.type === type &&
    String(it.code) === String(code)
  );

  if (ex) {
    ex.qty = +(+ex.qty + qtyAdd).toFixed(2);
    ex.price = +price || 0;
    ex.sum = +(ex.qty * ex.price).toFixed(2);
  } else {
    items.push({
      code,
      name,
      qty: qtyAdd,
      price: +price || 0,
      sum: +(qtyAdd * (+price || 0)).toFixed(2),
      type
    });
  }
}

function addItemFromInput(inputId, qtyId, sourceList) {
  const inputEl = document.getElementById(inputId);
  const text = inputEl.value.trim().toLowerCase();
  const qtyText = document.getElementById(qtyId).value.trim() || "1";
  const qty = parseFloat(qtyText.replace(",", ".")) || 1;

  // 🔥 Если поле пустое → делаем shake
  if (!text) {
    inputEl.classList.remove("shake"); // сбрасываем эффект
    void inputEl.offsetWidth;          // перезапуск анимации
    inputEl.classList.add("shake");

    return; // без alert
  }

  // ===== Дальше идёт твой стандартный код поиска =====
  const exact = sourceList.find(it =>
    it.code.toLowerCase() === text
  );

  let found = exact;

  if (!found) {
    found = sourceList.find(it =>
      it.code.toLowerCase().startsWith(text)
    );
  }

  if (!found) {
    found = sourceList.find(it =>
      it.code.toLowerCase().includes(text) ||
      it.name.toLowerCase().includes(text)
    );
  }

  if (!found) {
    inputEl.classList.remove("shake");
    void inputEl.offsetWidth;
    inputEl.classList.add("shake");
    return;
  }

  // ===== Добавление позиции =====
addOrMergeItem({
  code: found.code || "",
  name: found.name,
  qty,
  price: found.price,
  type: sourceList === parts ? "part" : "service"
});



  inputEl.value = "";
  document.getElementById(qtyId).value = "1";

  if (inputId === "parts-input")
    document.getElementById("parts-info").innerHTML = "";

  renderTable();
}
let _kitChoiceTpl = null;

function openKitChoice(tpl) {
  _kitChoiceTpl = tpl;

  const modal = document.getElementById("kit-choice-modal");
  const title = document.getElementById("kit-choice-title");
  const text  = document.getElementById("kit-choice-text");

  const replaceBtn = document.getElementById("kit-choice-replace-btn");
  const addBtn     = document.getElementById("kit-choice-add-btn");

  if (!modal || !replaceBtn || !addBtn) return;

  title.textContent = tpl?.name ? `Шаблон: ${tpl.name}` : "Шаблон";
  text.textContent = kit.length
    ? "Заменить текущий набор или добавить позиции к нему?"
    : "Набор пуст. Добавить позиции из шаблона?";

  // handlers
  replaceBtn.onclick = () => {
    closeKitChoice();
    applyTemplateToKit(tpl, { mode: "replace" });
  };

  addBtn.onclick = () => {
    closeKitChoice();
    applyTemplateToKit(tpl, { mode: "add" });
  };

  modal.classList.remove("hidden");

  // ESC to close
  document.addEventListener("keydown", _kitChoiceEsc, { once: true });
}

function _kitChoiceEsc(e) {
  if (e.key === "Escape") closeKitChoice();
}

function closeKitChoice() {
  const modal = document.getElementById("kit-choice-modal");
  if (modal) modal.classList.add("hidden");
  _kitChoiceTpl = null;
}

// ======================
// 📦 СКЛАД — НАБОР ЗАПЧАСТЕЙ (QR)
// ======================
function warehouseAlert(text, type = "info", timeout = 2500) {
  const el = document.getElementById("warehouse-alert");
  if (!el) return;

  el.className = "warehouse-alert " + type;
  el.textContent = text;
  el.style.display = "block";

  if (timeout) {
    clearTimeout(el._t);
    el._t = setTimeout(() => {
      el.style.display = "none";
    }, timeout);
  }
}

function updateOcrResult(text, state = "info") {
  const el = document.getElementById("ocr-result");
  if (!el) return;

  el.textContent = text;
  el.className = `ocr-result ${state}`;
}

let WAREHOUSE_MODE = "manual";
const QTY_STEP = 0.5;

// ---- shared camera state ----
let CAM_STREAM = null;
let QR_RAF = null;

// ---------- UI helpers ----------
function updateWarehouseActions() {
  const applyBtn = document.getElementById("apply-kit-btn");
  const clearBtn = document.getElementById("clear-kit-btn");

  if (applyBtn) {
    applyBtn.disabled = kit.length === 0;
    applyBtn.classList.toggle("primary", kit.length > 0);
  }
  if (clearBtn) {
    clearBtn.disabled = kit.length === 0;
  }
  updateWarehouseToggle();
}

function updateWarehouseToggle() {
  const btn = document.querySelector(".warehouse-toggle");
  if (!btn) return;
  btn.classList.toggle("has-items", kit.length > 0);
}

function toggleWarehouse() {
  const panel = document.getElementById("warehouse-panel");
  if (!panel) return;

  const willOpen = (panel.style.display === "none" || !panel.style.display);
  panel.style.display = willOpen ? "block" : "none";

  // если закрываем панель — стопим камеру и уходим в manual
  if (!willOpen) {
    stopLiveAll();
    setWarehouseMode("manual", { silent: true });
  }
}
// ---------- storage ----------
function saveKit() {
  localStorage.setItem("surp_kit", JSON.stringify(kit));
}
function loadKit() {
  const s = localStorage.getItem("surp_kit");
  if (s) {
    try { kit = JSON.parse(s) || []; } catch(e) { kit = []; }
    renderWarehouseList();
  }
}
function clearWarehouseKit() {
  if (!kit.length) return;
  if (!confirm("Очистить набор со склада?")) return;
  kit = [];
  saveKit();
  renderWarehouseList();
}

// ---------- add/apply ----------
function applyKitToCheck() {
  kit.forEach(k => {
    const p = parts.find(x => x.code === k.code);
    if (!p) return;

    addOrMergeItem({
      code: p.code,
      name: p.name,
      qty: k.qty,
      price: p.price,
      type: "part"
    });
  });

  kit = [];
  saveKit();
  renderWarehouseList();
  renderTable();
  toggleWarehouse();
}


//Utilits for scanners
function normalizeCode(str) {
  return String(str || "")
    .toUpperCase()
    .replace(/[\u00A0\u202F]/g, "") // невидимые пробелы
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

function addWarehouseItemByCode(code, qty = 1, opts = {}) {
  if (!code) return false;

  const raw = normalizeCode(code);
  if (!raw) return false;

  const strictMatch = !!opts.strictMatch;

  // 1️⃣ точное совпадение
  let found = parts.find(p => normalizeCode(p.code) === raw);

  if (!strictMatch) {
    // 2️⃣ совпадение по хвосту
    if (!found) {
      found = parts.find(p =>
        normalizeCode(p.code).endsWith(raw) ||
        raw.endsWith(normalizeCode(p.code))
      );
    }

    // 3️⃣ совпадение по включению
    if (!found) {
      found = parts.find(p =>
        normalizeCode(p.code).includes(raw) ||
        raw.includes(normalizeCode(p.code))
      );
    }
  }

  // ⛔ КЛЮЧЕВОЕ МЕСТО (ТО, ЧТО ТЫ ПРОПУСТИЛ)
  if (!found) {
    console.warn("❌ Не найдено в прайсе:", code);
    if (!opts.silentNotFound) {
      warehouseAlert(`❌ Не найдено в прайсе: ${code}`, "error", 4000);
    }
    return false;
  }

  // ✅ добавление / увеличение
  const ex = kit.find(i => i.code === found.code);
  if (ex) {
    ex.qty = +(ex.qty + qty).toFixed(2);
  } else {
    kit.push({
      code: found.code,
      name: found.name,
      cell: found.cell || "",
      qty: +qty.toFixed(2)
    });
  }

  saveKit();
  renderWarehouseList();
  updateWarehouseActions();

  console.log("✅ Добавлено со склада:", found.code, qty);
  return true;
}


  
function addWarehouseItem() {
  const input = document.getElementById("warehouse-input");
  const qtyInput = document.getElementById("warehouse-qty");

  const text = (input?.value || "").trim().toLowerCase();
  const qty = parseFloat((qtyInput?.value || "1").replace(",", ".")) || 1;
  if (!text) return;

  const found =
    parts.find(p => String(p.code || "").toLowerCase() === text) ||
    parts.find(p => String(p.code || "").toLowerCase().includes(text)) ||
    parts.find(p => String(p.name || "").toLowerCase().includes(text));

  if (!found) return;

  addWarehouseItemByCode(found.code, qty);

  input.value = "";
  qtyInput.value = "1";
}

// ---------- list render ----------
function changeKitQty(i, delta) {
  if (!kit[i]) return;
  kit[i].qty = Math.max(0.01, +(kit[i].qty + delta * QTY_STEP).toFixed(2));
  saveKit();
  renderWarehouseList();
}

function removeKitItem(i) {
  kit.splice(i, 1);
  saveKit();
  renderWarehouseList();
}

function renderWarehouseList() {
  const box = document.getElementById("warehouse-list");
  if (!box) return;

  box.innerHTML = "";

  kit.forEach((it, idx) => {
    const div = document.createElement("div");
    div.className = "warehouse-item";

    // подтягиваем остаток из прайса по коду
    const priceItem = parts.find(p => p.code === it.code);

    const stockRaw = priceItem?.stock ?? "";
    const stockNum = parseFloat(String(stockRaw).replace(",", ".").replace(/[^\d.]+/g, ""));
    const hasStock = !isNaN(stockNum) && stockNum > 0;

    const stockHTML = hasStock
      ? `<span class="stock ok">📦 ${stockNum}</span>`
      : `<span class="stock empty">❌ закончилось</span>`;

    div.innerHTML = `
      <div class="top">
        <span class="code">${it.code}</span>

        <div class="meta">
          ${stockHTML}
          <span class="cell">🗄 ${it.cell || "—"}</span>
        </div>
      </div>

      <div class="bottom">
        <div class="qty-controls">
          <button type="button" onclick="changeKitQty(${idx}, -1)">−</button>
          <span>${it.qty}</span>
          <button type="button" onclick="changeKitQty(${idx}, 1)">+</button>
        </div>
      <button
  type="button"
  class="remove-btn"
  onclick="removeKitItem(${idx})"
  title="Удалить из набора"
>
  🗑
</button>
      </div>
    `;

    box.appendChild(div);
  });

  updateWarehouseActions();
}
function mergeTemplateIntoKit(tpl) {
  // добавляем позиции шаблона в текущий kit
  tpl.items.forEach(src => {
    const code = src.code;
    if (!code) return;

    const qty = +(+src.qty || 1).toFixed(2);

    const ex = kit.find(k => k.code === code);
    if (ex) {
      ex.qty = +(ex.qty + qty).toFixed(2);
      // можно обновлять имя/ячейку если пустые
      if (!ex.name && src.name) ex.name = src.name;
      if (!ex.cell && src.cell) ex.cell = src.cell;
    } else {
      kit.push({
        code,
        name: src.name || "",
        cell: src.cell || "",
        qty
      });
    }
  });
}
function chooseTemplateApplyMode(hasKit) {
  // Если набор пуст — просто "заменить" (по сути одно и то же)
  if (!hasKit) return "replace";

  // 3 варианта: replace / add / cancel
  // confirm = заменить, cancel = спросим добавить
  if (confirm("Применить шаблон?\n\nОК — Заменить текущий набор\nОтмена — Добавить к текущему")) {
    return "replace";
  }

  // Второй шаг: добавить или отмена
  if (confirm("Добавить шаблон к текущему набору?\n\nОК — Добавить\nОтмена — Ничего не делать")) {
    return "add";
  }

  return "cancel";
}

function applyTemplateToKit(tpl, opts = { mode: "replace" }) {
  if (!tpl || !Array.isArray(tpl.items)) return;

  const mode = opts.mode || "replace";

  if (mode === "replace") {
    kit = tpl.items.map(it => ({
      code: it.code,
      name: it.name,
      cell: it.cell || "",
      qty: +(+it.qty || 1).toFixed(2)
    }));
  } else {
    // mode === "add"
    tpl.items.forEach(it => {
      const code = it.code;
      if (!code) return;

      const qtyAdd = +(+it.qty || 1).toFixed(2);

      const ex = kit.find(x => x.code === code);
      if (ex) {
        ex.qty = +(+ex.qty + qtyAdd).toFixed(2);
        // обновим ячейку/имя если вдруг пустые
        if (!ex.cell && it.cell) ex.cell = it.cell;
        if (!ex.name && it.name) ex.name = it.name;
      } else {
        kit.push({
          code,
          name: it.name,
          cell: it.cell || "",
          qty: qtyAdd
        });
      }
    });
  }

  saveKit();
  renderWarehouseList();
  updateWarehouseActions();
  warehouseAlert(
    mode === "replace"
      ? `Шаблон "${tpl.name}" заменил набор`
      : `Шаблон "${tpl.name}" добавлен в набор`,
    "success",
    2200
  );
}

// ---------- шаблоны ----------

function renderWarehouseTemplates(filter = "") {
  const box = document.getElementById("warehouse-templates");
  const empty = document.getElementById("warehouse-templates-empty");
  if (!box || !empty) return;

  box.innerHTML = "";

  const norm = filter.trim().toLowerCase();
  const list = warehouseTemplates.filter(t => {
    if (!norm) return true;
    return [t.name, t.machine, t.node]
      .filter(Boolean)
      .some(v => v.toLowerCase().includes(norm));
  });

  empty.style.display = list.length ? "none" : "block";

  list.forEach((tpl, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "template-row";

    const meta = document.createElement("div");
    meta.className = "template-meta";
    meta.innerHTML = `
      <div class="template-title">${tpl.name || "Без названия"}</div>
      <div class="template-sub">${tpl.machine || "—"} • ${tpl.node || "—"}</div>
      <div class="template-sub">${tpl.createdBy || "неизвестно"} • ${tpl.createdAt || ""}</div>
    `;

    const actions = document.createElement("div");
    actions.className = "template-actions";

    const toKitBtn = document.createElement("button");
    toKitBtn.type = "button";
    toKitBtn.className = "btn ghost";
    toKitBtn.textContent = "📦 В набор";
    toKitBtn.onclick = () => openKitChoice(tpl);

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn ghost";
    editBtn.textContent = "✏️ Редактировать";
    editBtn.onclick = () => startTemplateEdit(tpl);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn ghost danger";
    deleteBtn.textContent = "🗑 Удалить";
    deleteBtn.onclick = () => deleteWarehouseTemplate(tpl);

    actions.appendChild(toKitBtn);
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    wrap.appendChild(meta);
    wrap.appendChild(actions);
    box.appendChild(wrap);
  });
}
function resetTemplateForm() {
  const name = document.getElementById("template-name");
  const machine = document.getElementById("template-machine");
  const node = document.getElementById("template-node");
  const saveBtn = document.getElementById("save-template-btn");

  [name, machine, node].forEach(i => { if (i) i.value = ""; });
  editingTemplateId = null;
  if (saveBtn) saveBtn.textContent = "💾 Сохранить";
}

function startTemplateEdit(tpl) {
  if (!tpl) return;
  const name = document.getElementById("template-name");
  const machine = document.getElementById("template-machine");
  const node = document.getElementById("template-node");
  const saveBtn = document.getElementById("save-template-btn");

  if (name) name.value = tpl.name || "";
  if (machine) machine.value = tpl.machine || "";
  if (node) node.value = tpl.node || "";
  if (saveBtn) saveBtn.textContent = "✏️ Обновить";

  editingTemplateId = tpl.id;
  toggleTemplatesVisibility(true);
  applyTemplateToKit(tpl);
}

async function deleteWarehouseTemplate(tpl) {
  if (!tpl?.id) {
    warehouseAlert("Не удалось определить шаблон", "error", 2000);
    return;
  }

  if (!confirm(`Удалить шаблон \"${tpl.name || tpl.id}\"?`)) return;

  try {
    const resp = await fetch(`/warehouse-templates/${encodeURIComponent(tpl.id)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: TEMPLATES_FILE_ID })
    });

    if (!resp.ok) throw new Error("HTTP " + resp.status);
    await loadWarehouseTemplates();
    if (editingTemplateId === tpl.id) resetTemplateForm();
    warehouseAlert("Шаблон удалён", "success", 2000);
  } catch (e) {
    console.error("Ошибка удаления шаблона", e);
    warehouseAlert("Не удалось удалить шаблон", "error", 2500);
  }
}

function toggleTemplatesVisibility(force) {
  if (typeof force === "boolean") {
    templatesPanelOpen = force;
  } else {
    templatesPanelOpen = !templatesPanelOpen;
  }

  const panel = document.getElementById("templates-panel");
  const toggleBtn = document.getElementById("toggle-templates-btn");
  if (panel) {
    panel.style.display = templatesPanelOpen ? "block" : "none";
    panel.classList.toggle("collapsed", !templatesPanelOpen);
  }
  if (toggleBtn) {
    toggleBtn.textContent = templatesPanelOpen ? "Скрыть шаблоны ▲" : "Все шаблоны ▾";
  }
}

async function loadWarehouseTemplates() {
  const filterVal = document.getElementById("template-filter")?.value || "";

  try {
    const url = `/warehouse-templates?file=${encodeURIComponent(TEMPLATES_FILE_ID)}`;
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) throw new Error("HTTP " + resp.status);

    const data = await resp.json();

    warehouseTemplates = Array.isArray(data.items)
      ? data.items.map((tpl, idx) => normalizeTemplate(tpl, idx)).filter(Boolean)
      : [];

    // ✅ сохраняем кэш в браузере
    saveTemplatesCache(warehouseTemplates);

    if (data.warning === "drive_failed") {
      warehouseAlert("Google недоступен — показаны шаблоны с сервера/кэша", "warning", 4000);
    }

    renderWarehouseTemplates(filterVal);
  } catch (e) {
    console.error("Ошибка загрузки шаблонов", e);

    // ✅ фолбэк на локальный кэш в браузере
    warehouseTemplates = loadTemplatesCache().map((tpl, idx) => normalizeTemplate(tpl, idx)).filter(Boolean);

    if (warehouseTemplates.length) {
      warehouseAlert("Сервер недоступен — показаны шаблоны из кэша (localStorage)", "warning", 4500);
    } else {
      warehouseAlert("Не удалось загрузить шаблоны (нет кэша)", "error", 3500);
    }

    renderWarehouseTemplates(filterVal);
  }
}

async function saveWarehouseTemplate() {
  const name = (document.getElementById("template-name")?.value || "").trim();
  const machine = (document.getElementById("template-machine")?.value || "").trim();
  const node = (document.getElementById("template-node")?.value || "").trim();

  if (!kit.length) {
    warehouseAlert("Набор пустой", "error", 2000);
    return;
  }
  if (!name) {
    warehouseAlert("Название шаблона обязательно", "error", 2000);
    return;
  }

  const isEdit = Boolean(editingTemplateId);
  const existingTpl = isEdit ? (warehouseTemplates.find(t => t.id === editingTemplateId) || {}) : {};

  // ✅ ВАЖНО: id всегда есть
  const id = editingTemplateId || genTemplateId();

  const payload = {
    id,
    name,
    machine,
    node,
    createdBy: existingTpl.createdBy || CURRENT_USER?.name || CURRENT_USER?.login || "неизвестно",
    createdAt: existingTpl.createdAt || new Date().toISOString(),
    file: TEMPLATES_FILE_ID,
    items: kit.map(i => ({
      code: i.code,
      name: i.name,
      cell: i.cell || "",
      qty: i.qty
    }))
  };

  try {
    const endpoint = isEdit
      ? `/warehouse-templates/${encodeURIComponent(id)}`
      : "/warehouse-templates";

    const resp = await fetch(endpoint, {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const data = await resp.json().catch(() => ({}));
    if (data.error) throw new Error(data.error);

    warehouseAlert(isEdit ? "Шаблон обновлён" : "Шаблон добавлен", "success", 2000);

    // ✅ сброс формы и режима редактирования
    resetTemplateForm();
    editingTemplateId = null;

    // ✅ перезагрузим список
    await loadWarehouseTemplates();
  } catch (e) {
    console.error("Ошибка сохранения шаблона", e);
    warehouseAlert("Не удалось сохранить шаблон", "error", 3500);

    // ✅ локальный фолбэк: добавим/обновим в кэше браузера
    try {
      const cached = loadTemplatesCache();
      const idx = cached.findIndex(t => t.id === id);
      const next = idx === -1
        ? [payload, ...cached]
        : cached.map(t => (t.id === id ? { ...t, ...payload } : t));

      saveTemplatesCache(next);

      warehouseTemplates = next.map((tpl, i) => normalizeTemplate(tpl, i)).filter(Boolean);
      renderWarehouseTemplates(document.getElementById("template-filter")?.value || "");

      warehouseAlert("Сохранил в кэш (localStorage). Позже синхронизируем с сервером.", "warning", 4500);
    } catch {}
  }
}


// ======================
// 🎛 MODE SWITCH (с корректной остановкой камеры)
// ======================

function setWarehouseMode(mode, opts = {}) {
  // повторное нажатие по текущему режиму QR => выключить и уйти в manual
  if (!opts.silent && mode === WAREHOUSE_MODE && mode === "qr") {
    stopLiveAll();
    WAREHOUSE_MODE = "manual";
    mode = "manual";
  } else {
    stopLiveAll(); // ✅ всегда стоп перед стартом нового режима
    WAREHOUSE_MODE = mode;
  }

  ["manual","qr"].forEach(m => {
    document.getElementById("wm-" + m)?.classList.toggle("active", m === mode);
  });

  const live = document.getElementById("ocr-live");
  if (live) live.style.display = mode === "qr" ? "block" : "none";

  if (mode === "qr") startQRScan();
}

// ======================
// 🎥 Camera stop helpers
// ======================

function stopCamera() {
  const video = document.getElementById("ocr-video");
  if (video) {
    try { video.pause(); } catch(e) {}
    video.srcObject = null;
  }

  if (CAM_STREAM) {
    CAM_STREAM.getTracks().forEach(t => t.stop());
    CAM_STREAM = null;
  }
}

function stopLiveQR() {
  if (QR_RAF) {
    cancelAnimationFrame(QR_RAF);
    QR_RAF = null;
  }
  stopCamera();
}

function stopLiveAll() {
  stopLiveQR();
}


// ======================
// 📷 QR / BARCODE SCAN (simple)
// ======================

let LAST_QR_CODE = null;
let LAST_QR_TS = 0;

function getQRScanRegion(video, frame) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;

  const videoRect = video.getBoundingClientRect();
  const frameRect = frame.getBoundingClientRect();

  const rectW = videoRect.width;
  const rectH = videoRect.height;
  if (!rectW || !rectH) return null;

  const scale = Math.max(rectW / vw, rectH / vh);
  const displayW = vw * scale;
  const displayH = vh * scale;
  const offsetX = (rectW - displayW) / 2;
  const offsetY = (rectH - displayH) / 2;

  const fx = frameRect.left - videoRect.left;
  const fy = frameRect.top - videoRect.top;
  const fw = frameRect.width;
  const fh = frameRect.height;

  let sx = (fx - offsetX) / scale;
  let sy = (fy - offsetY) / scale;
  let sw = fw / scale;
  let sh = fh / scale;

  sx = Math.max(0, sx);
  sy = Math.max(0, sy);
  sw = Math.min(vw - sx, sw);
  sh = Math.min(vh - sy, sh);

  if (sw <= 0 || sh <= 0) return null;

  return { sx, sy, sw, sh };
}

async function startQRScan() {
  if (!("BarcodeDetector" in window)) {
    warehouseAlert(
      "❌ Сканер QR/штрихкодов не поддерживается этим браузером",
      "error",
      4000
    );
    setWarehouseMode("manual", { silent: true });
    return;
  }

  const live = document.getElementById("ocr-live");
  const video = document.getElementById("ocr-video");
  const hint  = document.getElementById("ocr-hint");
  const frame = document.getElementById("ocr-frame");

  if (!live || !video || !frame) return;

  live.style.display = "block";
  if (hint) hint.textContent = "Наведи камеру на QR или штрихкод";
  updateOcrResult("Ожидание сканирования…", "info");

  CAM_STREAM = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" }
  });

  video.srcObject = CAM_STREAM;
  await video.play();

  const detector = new BarcodeDetector({
    formats: [
      "qr_code",
      "code_128",
      "code_39",
      "ean_13",
      "ean_8"
    ]
  });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const scan = async () => {
    if (WAREHOUSE_MODE !== "qr") return;

    try {
      const region = getQRScanRegion(video, frame);
      if (!region || !ctx) {
        QR_RAF = requestAnimationFrame(scan);
        return;
      }

      canvas.width = Math.floor(region.sw);
      canvas.height = Math.floor(region.sh);

      ctx.drawImage(
        video,
        region.sx,
        region.sy,
        region.sw,
        region.sh,
        0,
        0,
        canvas.width,
        canvas.height
      );

      const codes = await detector.detect(canvas);
      if (!codes || !codes.length) {
        QR_RAF = requestAnimationFrame(scan);
        return;
      }

      const raw = String(codes[0].rawValue || "");
      const candidate = normalizeCode(raw);

      if (!candidate) {
        QR_RAF = requestAnimationFrame(scan);
        return;
      }

      const now = Date.now();
      if (candidate === LAST_QR_CODE && now - LAST_QR_TS < 1500) {
        QR_RAF = requestAnimationFrame(scan);
        return;
      }

      LAST_QR_CODE = candidate;
      LAST_QR_TS = now;

      // вибрация
      if (navigator.vibrate) navigator.vibrate(60);

      const ok = addWarehouseItemByCode(candidate, 1, {
        silentNotFound: true,
        strictMatch: true
      });
      if (ok) {
        warehouseAlert(`✅ Добавлено: ${candidate}`, "success", 2000);
        updateOcrResult(`✅ ${candidate}`, "success");
      } else {
        warehouseAlert(`⚠️ Не найдено: ${candidate}`, "warn", 2500);
        updateOcrResult(`⚠️ Не найдено: ${candidate}`, "warn");
      }

    } catch (e) {
      console.warn("QR detect error:", e);
    }

    QR_RAF = requestAnimationFrame(scan);
  };

  scan();
}

// ======================
// Рендер таблицы + поддержка Drag&Drop + inline edit
// ======================
function renderTable() {
  const tbody = document.querySelector("#items-table tbody");
  const totalEl = document.getElementById("total");

  tbody.innerHTML = "";
  let total = 0;

  items.forEach((it, index) => {
    total += it.sum;

    const tr = document.createElement("tr");
    tr.setAttribute("draggable", "true");
    tr.dataset.index = index;

    tr.innerHTML = `
      <td class="drag-handle">☰</td>
      <td>${it.code}</td>
      <td>${it.name}</td>

      <td class="editable-qty" data-index="${index}">
        <span class="qty-value">${it.qty}</span>
        <input class="qty-input" type="number" value="${it.qty}" />
      </td>

      <td>${it.price.toFixed(2)}</td>
      <td>${it.sum.toFixed(2)}</td>

      <td><button class="btn small danger" onclick="removeItem(${index})">×</button></td>
    `;

    tbody.appendChild(tr);
  });

  totalEl.innerText = total.toFixed(2);

  enableDragAndDrop();
  enableInlineQtyEdit();
}

// ======================
// Inline редактирование количества
// ======================
function enableInlineQtyEdit() {
  document.querySelectorAll(".editable-qty").forEach(cell => {
    const span = cell.querySelector(".qty-value");
    const input = cell.querySelector(".qty-input");
    const index = Number(cell.dataset.index);

    span.onclick = () => {
      span.style.display = "none";
      input.style.display = "inline-block";
      input.focus();
    };

    input.onblur = input.onchange = () => {
      const newQty = parseFloat(input.value) || 1;

      items[index].qty = newQty;
      items[index].sum = newQty * items[index].price;

      renderTable();
    };

    input.onkeydown = e => {
      if (e.key === "Enter") input.blur();
    };
  });
}

// ======================
// Drag & Drop сортировка
// ======================
function enableDragAndDrop() {
  const table = document.querySelector("#items-table tbody");
  let draggingRow = null;

  table.querySelectorAll("tr").forEach(row => {
    row.addEventListener("dragstart", () => {
      draggingRow = row;
      row.classList.add("dragging");
    });

    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");

      const newOrder = [];
      table.querySelectorAll("tr").forEach(r => {
        newOrder.push(items[Number(r.dataset.index)]);
      });
      items = newOrder;

      renderTable();
    });

    row.addEventListener("dragover", e => {
      e.preventDefault();
      const target = e.target.closest("tr");
      if (!target || target === draggingRow) return;

      const rect = target.getBoundingClientRect();
      const offset = e.clientY - rect.top;

      if (offset > rect.height / 2) target.after(draggingRow);
      else target.before(draggingRow);
    });
  });
}

// ======================
// Удаление позиции
// ======================
function removeItem(index) {
  items.splice(index, 1);
  renderTable();
}
// ======================
// Новый чек
// ======================
function newInvoice() {
  if (!confirm("Очистить чек?")) return;

  items = [];
  document.getElementById("client-input").value = "";
  document.getElementById("equip-input").value = "";
  document.getElementById("parts-info").innerHTML = "";
  document.getElementById("comment-input").value = "";


  // Сброс списка инженеров (оставляем одно поле)
  document.getElementById("engineers-container").innerHTML = `
    <div class="field engineer-row">
      <div class="row">
        <div class="select-ios">
          <select class="engineer-input"></select>
        </div>
        <button type="button" class="btn primary add-btn engineer-add" onclick="addEngineerField()">+</button>
      </div>
    </div>
  `;
  populateEngineerSelects();

  renderTable();
}

// ======================
// Добавление нового поля инженера
// ======================
function addEngineerField() {
  const cont = document.getElementById("engineers-container");
  const div = document.createElement("div");
  div.className = "field engineer-row";
  div.innerHTML = `
    <div class="row">
      <div class="select-ios">
        <select class="engineer-input"></select>
      </div>
      <button type="button" class="btn danger add-btn engineer-remove" onclick="removeEngineerField(this)">−</button>
    </div>
  `;
  cont.appendChild(div);
  const select = div.querySelector(".engineer-input");
  fillEngineerSelect(select);
}

function removeEngineerField(button) {
  const rows = [...document.querySelectorAll(".engineer-row")];
  if (rows.length <= 1) return;
  const row = button.closest(".engineer-row");
  if (!row) return;
  row.remove();
}

// ======================
// Открытие Excel
// ======================
document.getElementById("open-btn").onclick = () =>
  document.getElementById("open-file").click();

document.getElementById("open-file").addEventListener("change", e => {
  if (e.target.files.length) openExcelCheck(e.target.files[0]);
});

// ======================
// Чтение Excel-файла
// ======================
async function openExcelCheck(file) {
  const reader = new FileReader();

  reader.onload = async () => {
    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(reader.result);

      const ws = wb.getWorksheet("Чек");
      if (!ws) return alert("Лист 'Чек' не найден");

      const header = ws.getCell("A2").value.toString();

      const clientMatch = header.match(/Клиент:([^|]+)/);
      const equipMatch  = header.match(/Оборудование:([^|]+)/);

      document.getElementById("client-input").value =
        clientMatch ? clientMatch[1].trim() : "";

      document.getElementById("equip-input").value =
        equipMatch ? equipMatch[1].trim() : "";

      items = [];

	let row = 4;

	while (true) {
	const rawCode  = ws.getCell(`A${row}`).value;
	const rawName  = ws.getCell(`B${row}`).value;
	const rawQty   = ws.getCell(`C${row}`).value;
	const rawPrice = ws.getCell(`D${row}`).value;

	const code  = rawCode ? String(rawCode).trim() : "";
	const name  = rawName ? String(rawName).trim() : "";

  // === ОСТАНОВ — строка ИТОГО ===
	if (code.toLowerCase().includes("итого") ||
		name.toLowerCase().includes("итого")) break;

  // === ОСТАНОВ — пустая строка ===
	if (!code && !name) break;

  // === Игнорировать заголовки ===
	if (code === "Артикул" || name === "Название") {
		row++;
		continue;
	}

	// === Игнорировать инженеров ===
	if (code.toLowerCase().includes("инжен") ||
		name.toLowerCase().includes("инжен")) {
		row++;
		continue;
	}

	// === Добавление позиции ===
	const qty   = Number(rawQty) || 1;
	const price = Number(rawPrice) || 0;

	items.push({
		code,
		name,
		qty,
		price,
		sum: qty * price
	});

	row++;
	}


      renderTable();
    } catch (err) {
      console.error(err);
      alert("Ошибка чтения Excel-файла");
    }
  };

  reader.readAsArrayBuffer(file);
}
      //ПОДЕЛИТЬСЯ
document.getElementById("share-text-btn").addEventListener("click", async () => {
  if (items.length === 0) {
    alert("Чек пустой — нечего отправлять.");
    return;
  }

  const text = generateShareText();

  // 1) Если браузер поддерживает Web Share → системное меню
  if (navigator.share) {
    try {
      await navigator.share({
        title: "Чек Surpresso Service",
        text: text
      });
      return;
    } catch (e) {
      console.log("Share error:", e);
      // продолжаем к clipboard
    }
  }

  // 2) Если share недоступен → копируем в буфер
  try {
    await navigator.clipboard.writeText(text);
    alert("Текст скопирован! Теперь можете вставить куда нужно.");
  } catch (err) {
    alert("Не удалось скопировать. Вот текст:\n\n" + text);
  }
});

// ======================
// Сохранение в Excel
// ======================
document.getElementById("save-btn").addEventListener("click", async () => {

  if (items.length === 0) {
    return alert("Нельзя сохранить пустой чек — добавьте хотя бы одну позицию.");
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Чек");

  // ============================
  // СТИЛИ
  // ============================
  const center = { vertical: "middle", horizontal: "center", wrapText: true };
  const leftWrap = { vertical: "middle", horizontal: "left", wrapText: true };

  const headerStyle = {
    font: { bold: true },
    alignment: center,
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE082" } },
    border: {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" }
    }
  };

  const cellBorder = {
    border: {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" }
    }
  };

  // ============================
  // ШАПКА
  // ============================
  ws.mergeCells("A1:E1");
  ws.getCell("A1").value = "Surpresso Service — ЧЕК";
  ws.getCell("A1").font = { size: 16, bold: true };
  ws.getCell("A1").alignment = center;

  ws.mergeCells("A2:E2");
  ws.getCell("A2").value =
    `Клиент: ${document.getElementById("client-input").value}  |  ` +
    `Оборудование: ${document.getElementById("equip-input").value}  |  ` +
    `Дата: ${new Date().toLocaleString()}`;
  ws.getCell("A2").alignment = center;

  ws.addRow([]);

  // ============================
  // ШАПКА ТАБЛИЦЫ
  // ============================
  const headerRow = ws.addRow(["Код", "Название", "Кол-во", "Цена", "Сумма"]);
  headerRow.eachCell(cell => {
    Object.assign(cell, headerStyle);
  });

  // ============================
  // ПОЗИЦИИ
  // ============================
  items.forEach(it => {
    const row = ws.addRow([
      it.code,
      it.name,
      it.qty,
      it.price,
      it.sum
    ]);

    row.eachCell((cell, col) => {
      Object.assign(cell, cellBorder);

      if (col === 2) {
        cell.alignment = leftWrap;   // название — слева
      } else {
        cell.alignment = center;     // остальные — центр
      }
    });
  });

  ws.addRow([]);

  // ============================
  // ИТОГО
  // ============================
  const totalRow = ws.addRow(["", "", "", "Итого:", document.getElementById("total").innerText]);

  totalRow.eachCell((cell, col) => {
    cell.alignment = center;
    cell.font = { bold: true };
    Object.assign(cell, cellBorder);
  });
  
  //Комментарий
  const comment = document.getElementById("comment-input").value.trim();

  if (comment) {
    ws.addRow([]);
    const commentRow = ws.addRow([`Комментарий: ${comment}`]);
    ws.mergeCells(`A${commentRow.number}:E${commentRow.number}`);
    ws.getCell(`A${commentRow.number}`).alignment = leftWrap;
}

  // ============================
  // ИНЖЕНЕРЫ
  // ============================
  const engineers = [...document.querySelectorAll(".engineer-input")]
    .map(el => el.value.trim())
    .filter(v => v !== "");

  if (engineers.length > 0) {
    ws.addRow([]);
    const engRow = ws.addRow([`Инженеры: ${engineers.join(", ")}`]);
    ws.mergeCells(`A${engRow.number}:E${engRow.number}`);
    ws.getCell(`A${engRow.number}`).alignment = leftWrap;
  }

  // ============================
  // ШИРИНА КОЛОНОК
  // ============================
  ws.columns = [
    { width: 16 },  // код
    { width: 50 },  // название
    { width: 12 },  // qty
    { width: 14 },  // цена
    { width: 16 }   // сумма
  ];

  // ============================
  // Имя файла
  // ============================
  const clean = s => s.replace(/[^a-z0-9а-яіїє _-]/gi, "_");

  const fileName =
    `${clean(document.getElementById("client-input").value || "client")}_` +
    `${clean(document.getElementById("equip-input").value || "equip")}_` +
    new Date().toISOString().slice(0, 16).replace(/:/g, "-") +
    `.xlsx`;

  // ============================
  // СОХРАНЕНИЕ
  // ============================
  const buffer = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), fileName);
});



// ======================
// Переучет склада
// ======================
let recountSession = null;

function normalizeCellPath(raw) {
  const str = String(raw || "").trim().replace(/,/g, ".");
  if (!str) return [];
  return str.split('.').map(x => x.trim()).filter(Boolean).map(x => Number.parseInt(x, 10)).filter(Number.isFinite);
}

function compareCellPath(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

function isCellInRange(cell, from, to) {
  const path = normalizeCellPath(cell);
  const left = normalizeCellPath(from);
  const right = normalizeCellPath(to);
  if (!path.length || !left.length || !right.length) return false;

  const min = compareCellPath(left, right) <= 0 ? left : right;
  const max = compareCellPath(left, right) <= 0 ? right : left;

  return compareCellPath(path, min) >= 0 && compareCellPath(path, max) <= 0;
}

function toggleRecountPanel() {
  const panel = document.getElementById('warehouse-recount');
  if (!panel) return;
  const open = panel.style.display === 'none' || !panel.style.display;
  panel.style.display = open ? 'block' : 'none';
}

function renderRecountTable() {
  const body = document.getElementById('recount-body');
  if (!body || !recountSession) return;

  if (!recountSession.items.length) {
    body.innerHTML = '<tr><td colspan="5" class="muted">Товары не найдены по диапазону.</td></tr>';
    return;
  }

  body.innerHTML = recountSession.items.map((row, idx) => `
    <tr>
      <td>${escapeHtml(row.code)}</td>
      <td>${escapeHtml(row.cell || '—')}</td>
      <td>${escapeHtml(row.name || '')}</td>
      <td>${escapeHtml(row.unit || 'шт')}</td>
      <td><input type="number" min="0" step="0.01" data-recount-idx="${idx}" value="${Number(row.fact || 0)}"></td>
    </tr>
  `).join('');
}

function startRecountSession() {
  const warehouse = document.getElementById('recount-warehouse')?.value.trim();
  const from = document.getElementById('recount-range-from')?.value.trim();
  const to = document.getElementById('recount-range-to')?.value.trim();

  if (!warehouse || !from || !to) {
    warehouseAlert('Заполните склад и диапазон', 'warn', 2500);
    return;
  }

  const scoped = parts.filter(p => isCellInRange(p.cell, from, to));

  recountSession = {
    warehouse,
    rangeFrom: from,
    rangeTo: to,
    startedAt: new Date().toISOString(),
    status: 'active',
    items: scoped.map(p => ({
      code: p.code,
      cell: p.cell || '',
      name: p.name || '',
      unit: p.unit || 'шт',
      fact: 0,
      systemStock: p.stock || '',
      priceInternal: Number(p.price || 0)
    }))
  };

  const sessionBox = document.getElementById('recount-session');
  const meta = document.getElementById('recount-session-meta');
  if (sessionBox) sessionBox.style.display = 'block';
  if (meta) meta.textContent = `Склад: ${warehouse} • Диапазон: ${from}–${to} • Строк: ${recountSession.items.length}`;

  renderRecountTable();
  warehouseAlert('Сессия переучета запущена', 'success', 2200);
}

function addFoundRecountItem() {
  if (!recountSession) return;

  const code = document.getElementById('recount-found-code')?.value.trim();
  const cell = document.getElementById('recount-found-cell')?.value.trim();
  const fact = Math.max(0, Number(document.getElementById('recount-found-fact')?.value || 0));

  if (!code) {
    warehouseAlert('Укажите артикул', 'warn', 2200);
    return;
  }

  const catalog = parts.find(p => String(p.code || '').trim() === code);
  if (!catalog) {
    warehouseAlert('Можно добавить только существующий артикул', 'error', 2800);
    return;
  }

  const existing = recountSession.items.find(x => x.code === code && (cell ? x.cell === cell : true));
  if (existing) {
    existing.fact = +(Number(existing.fact || 0) + fact).toFixed(2);
  } else {
    recountSession.items.push({
      code: catalog.code,
      cell: cell || catalog.cell || '',
      name: catalog.name || '',
      unit: catalog.unit || 'шт',
      fact: +fact.toFixed(2),
      systemStock: catalog.stock || '',
      priceInternal: Number(catalog.price || 0)
    });
  }

  renderRecountTable();
  warehouseAlert('Найденный товар добавлен', 'success', 2000);
}

function saveRecountSession() {
  if (!recountSession) return;
  localStorage.setItem('surp_recount_session', JSON.stringify(recountSession));
  warehouseAlert('Сессия сохранена', 'success', 1800);
}

function finishRecountSession() {
  if (!recountSession) return;
  recountSession.status = 'completed';
  recountSession.finishedAt = new Date().toISOString();
  saveRecountSession();
  warehouseAlert('Участок завершен', 'success', 2200);
}

async function exportRecountExcel() {
  if (!recountSession) {
    warehouseAlert('Нет активной сессии', 'warn', 2000);
    return;
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Переучет');

  ws.addRow(['Склад', recountSession.warehouse]);
  ws.addRow(['Диапазон', `${recountSession.rangeFrom} - ${recountSession.rangeTo}`]);
  ws.addRow(['Статус', recountSession.status]);
  ws.addRow([]);
  ws.addRow(['Артикул', 'Комірка', 'Найменування', 'Од. вим', 'Факт', 'Сист. залишок', 'Внутр. ціна']);

  recountSession.items.forEach(it => {
    ws.addRow([
      it.code,
      it.cell || '',
      it.name || '',
      it.unit || 'шт',
      Number(it.fact || 0),
      it.systemStock || '',
      Number(it.priceInternal || 0)
    ]);
  });

  ws.columns = [{width:16},{width:12},{width:48},{width:10},{width:10},{width:14},{width:14}];
  const fileName = `recount_${Date.now()}.xlsx`;
  const buffer = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), fileName);
}
function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getFilteredPartsForRequest() {
  const q = partsRequestFilter.trim().toLowerCase();
  if (!q) return parts;

  return parts.filter(p =>
    String(p.code || "").toLowerCase().includes(q) ||
    String(p.name || "").toLowerCase().includes(q)
  );
}

function renderPartsRequestTable() {
  const body = document.getElementById("parts-request-body");
  if (!body) return;

  const filtered = getFilteredPartsForRequest();
  if (!filtered.length) {
    body.innerHTML = '<tr><td colspan="6" class="muted">Ничего не найдено.</td></tr>';
    return;
  }

  body.innerHTML = filtered.map(p => {
    const code = String(p.code || "").trim();
    const key = code || String(p.name || "").trim();
    const selectedQty = Number(partsRequestSelected.get(key) || 1);
    const isChecked = partsRequestSelected.has(key);

    return `
      <tr>
        <td><input type="checkbox" data-pr-code="${escapeHtml(key)}" ${isChecked ? "checked" : ""}></td>
        <td>${escapeHtml(code)}</td>
        <td>${escapeHtml(p.name || "")}</td>
        <td>${Number(p.price || 0).toFixed(2)}</td>
        <td>${escapeHtml(p.stock || "—")}</td>
        <td>
          <input
            type="number"
            min="1"
            step="1"
            class="parts-request-qty"
            data-pr-code="${escapeHtml(key)}"
            value="${Math.max(1, selectedQty)}"
          />
        </td>
      </tr>
    `;
  }).join("");
}

function openPartsRequestModal() {
  partsRequestFilter = "";
  const searchEl = document.getElementById("parts-request-search");
  if (searchEl) searchEl.value = "";

  const modal = document.getElementById("parts-request-modal");
  if (!modal) return;

  renderPartsRequestTable();
  modal.classList.remove("hidden");
}

function closePartsRequestModal() {
  const modal = document.getElementById("parts-request-modal");
  if (!modal) return;
  modal.classList.add("hidden");
}

async function sharePartsRequestText() {
  if (partsRequestSelected.size === 0) {
    alert("Выберите хотя бы одну запчасть для заявки.");
    return;
  }

  const lines = [];
  for (const [code, qty] of partsRequestSelected.entries()) {
    lines.push(`${code} x ${qty}`);
  }

  const text = lines.join("\n");

  if (navigator.share) {
    try {
      await navigator.share({
        title: "Заявка на запчасти",
        text
      });
      return;
    } catch (e) {
      console.log("Share parts request error:", e);
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    alert("Текст заявки скопирован.");
  } catch (err) {
    alert("Не удалось скопировать. Вот текст:\n\n" + text);
  }
}

function generateShareText() {
  let txt = "📄 Surpresso Service — Чек\n\n";

  const client = document.getElementById("client-input").value || "—";
  const equip  = document.getElementById("equip-input").value || "—";
  const comment = document.getElementById("comment-input").value.trim();

  // ==== Инженеры ====
  const engineers = [...document.querySelectorAll(".engineer-input")]
    .map(el => el.value.trim())
    .filter(v => v !== "");

  let engineerLine = engineers.length ? engineers.join(", ") : "—";

  // ==== Верх ====
  txt += `👤 Клиент: ${client}\n`;
  txt += `☕ Оборудование: ${equip}\n`;
  txt += `🛠 Инженер: ${engineerLine}\n`;
  txt += `📅 Дата: ${new Date().toLocaleString()}\n\n`;

  if (comment) {
    txt += `📝 Комментарий: ${comment}\n`;
  }

  txt += "____________________________\n";

  // ==== Позиции (компактный вид) ====
items.forEach(it => {
  const sum = (it.qty * it.price).toFixed(2);

  const icon = it.type === "part" ? "📦" : "🛠";

  txt += `${icon} ${it.qty} | ${it.code} | ${it.name}: ${sum} грн\n`;
});

  txt += "____________________________\n";
  txt += `ИТОГО: ${document.getElementById("total").innerText} грн\n`;

  return txt;
}
function openEquipmentPage() {
  window.location.href = "equipment.html";
}

async function hardRefreshApp() {
  if (!confirm("Обновить приложение?\nБудет загружена новая версия.")) return;

  try {
    // 1. Очистка Cache Storage
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }

    // 2. Удаление Service Worker
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        await reg.unregister();
      }
    }

    // 3. Перезагрузка
    location.reload();

  } catch (e) {
    alert("Ошибка обновления приложения");
    console.error(e);
  }
}
function updateFooterTicker() {
  const el = document.getElementById("footer-ticker");
  if (!el) return;

  el.textContent =
    `Surpresso Service • офлайн PWA • версия ${APP_VERSION} • ` +
    `обновлено ${new Date().toLocaleDateString()} • `;
}

function setTheme(mode) {
  // mode: "dark" | "light" | "auto"
  document.body.classList.remove("theme-light", "theme-dark");

  if (mode === "light") document.body.classList.add("theme-light");
  if (mode === "dark")  document.body.classList.add("theme-dark");

  localStorage.setItem("surp_theme", mode);
  updateThemeButton();
}

function getEffectiveTheme() {
  const saved = localStorage.getItem("surp_theme") || "dark"; // default dark
  if (saved !== "auto") return saved;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function applyThemeFromStorage() {
  const saved = localStorage.getItem("surp_theme") || "dark";
  const eff = (saved === "auto") ? getEffectiveTheme() : saved;
  document.body.classList.toggle("theme-light", eff === "light");
  document.body.classList.toggle("theme-dark",  eff === "dark");
  updateThemeButton();
}

function updateThemeButton() {
  const btn = document.getElementById("theme-btn");
  if (!btn) return;
  const isLight = document.body.classList.contains("theme-light");
  btn.textContent = isLight ? "🌙" : "☀️";
}

document.addEventListener("DOMContentLoaded", () => {
  applyThemeFromStorage();

  const btn = document.getElementById("theme-btn");
  if (btn) {
    btn.addEventListener("click", () => {
      const isLight = document.body.classList.contains("theme-light");
      setTheme(isLight ? "dark" : "light");
    });
  }

  // если когда-то включишь "auto", тема будет меняться при смене системной
  const mq = window.matchMedia?.("(prefers-color-scheme: light)");
  mq?.addEventListener?.("change", () => {
    const saved = localStorage.getItem("surp_theme") || "dark";
    if (saved === "auto") applyThemeFromStorage();
  });
});

// ======================
// Инициализация
// ======================
window.addEventListener("DOMContentLoaded", async () => {

  // версия (если используешь отдельный span)
  const v = document.getElementById("app-version");
  if (v) v.textContent = APP_VERSION;

  // бегущая строка
  updateFooterTicker();

  await initLogin();     // ← авторизация

  // Если пользователь НЕ авторизован — дальше не запускаем
  if (!CURRENT_USER) return;

  await loadPrices();
  loadKit();
  loadWarehouseTemplates();

  try {
    recountSession = JSON.parse(localStorage.getItem("surp_recount_session") || "null");
    if (recountSession?.items?.length) {
      const sessionBox = document.getElementById("recount-session");
      const meta = document.getElementById("recount-session-meta");
      if (sessionBox) sessionBox.style.display = "block";
      if (meta) meta.textContent = `Склад: ${recountSession.warehouse} • Диапазон: ${recountSession.rangeFrom}–${recountSession.rangeTo} • Строк: ${recountSession.items.length}`;
      renderRecountTable();
    }
  } catch (e) {
    recountSession = null;
  }


  attachSuggest("parts-input", "parts-suggest", parts);
  attachSuggest("services-input", "services-suggest", services);
  // === склад: ручной ввод ===
attachSuggest(
  "warehouse-input",
  "warehouse-suggest",
  parts
);
  
  renderTable();
  
  const clearBtn = document.getElementById("clear-kit-btn");
  if (clearBtn) {
    clearBtn.onclick = clearWarehouseKit;
  }

  const saveTplBtn = document.getElementById("save-template-btn");
  if (saveTplBtn) {
    saveTplBtn.onclick = saveWarehouseTemplate;
  }

  const tplFilter = document.getElementById("template-filter");
  if (tplFilter) {
    tplFilter.addEventListener("input", e => {
      renderWarehouseTemplates(e.target.value);
    });
  }

  const toggleTplBtn = document.getElementById("toggle-templates-btn");
  if (toggleTplBtn) {
    toggleTplBtn.addEventListener("click", () => {
      toggleTemplatesVisibility();
    });
    toggleTemplatesVisibility(false);
  }

  const refreshBtn = document.getElementById("hard-refresh-btn");
  if (refreshBtn) {
    refreshBtn.onclick = hardRefreshApp;
  }

  const startRecountBtn = document.getElementById("start-recount-btn");
  if (startRecountBtn) {
    startRecountBtn.addEventListener("click", startRecountSession);
  }

  const recountBody = document.getElementById("recount-body");
  if (recountBody) {
    recountBody.addEventListener("input", e => {
      const idx = Number(e.target?.dataset?.recountIdx);
      if (!Number.isFinite(idx) || !recountSession?.items[idx]) return;
      recountSession.items[idx].fact = Math.max(0, Number(e.target.value || 0));
    });
  }

  const saveRecountBtn = document.getElementById("save-recount-btn");
  if (saveRecountBtn) saveRecountBtn.addEventListener("click", saveRecountSession);

  const finishRecountBtn = document.getElementById("finish-recount-btn");
  if (finishRecountBtn) finishRecountBtn.addEventListener("click", finishRecountSession);

  const exportRecountBtn = document.getElementById("export-recount-btn");
  if (exportRecountBtn) exportRecountBtn.addEventListener("click", exportRecountExcel);

  const addFoundBtn = document.getElementById("add-found-btn");
  if (addFoundBtn) {
    addFoundBtn.addEventListener("click", () => {
      const form = document.getElementById("recount-found-form");
      if (!form) return;
      form.style.display = form.style.display === "none" ? "grid" : "none";
    });
  }

  const recountFoundApply = document.getElementById("recount-found-apply");
  if (recountFoundApply) recountFoundApply.addEventListener("click", addFoundRecountItem);

  const openPartsRequestBtn = document.getElementById("open-parts-request-btn");
  if (openPartsRequestBtn) {
    openPartsRequestBtn.addEventListener("click", openPartsRequestModal);
  }

  const partsRequestSearch = document.getElementById("parts-request-search");
  if (partsRequestSearch) {
    partsRequestSearch.addEventListener("input", e => {
      partsRequestFilter = e.target.value || "";
      renderPartsRequestTable();
    });
  }

  const partsRequestBody = document.getElementById("parts-request-body");
  if (partsRequestBody) {
    partsRequestBody.addEventListener("change", e => {
      const target = e.target;
      const code = target?.dataset?.prCode;
      if (!code) return;

      if (target.matches('input[type="checkbox"]')) {
        if (target.checked) {
          const qtyInput = partsRequestBody.querySelector(`input.parts-request-qty[data-pr-code="${CSS.escape(code)}"]`);
          const qty = Math.max(1, Number(qtyInput?.value || 1));
          partsRequestSelected.set(code, qty);
        } else {
          partsRequestSelected.delete(code);
        }
      }

      if (target.matches(".parts-request-qty")) {
        const qty = Math.max(1, Number(target.value || 1));
        target.value = qty;
        if (partsRequestSelected.has(code)) {
          partsRequestSelected.set(code, qty);
        }
      }
    });
  }

  const sharePartsRequestBtn = document.getElementById("share-parts-request-btn");
  if (sharePartsRequestBtn) {
    sharePartsRequestBtn.addEventListener("click", sharePartsRequestText);
  }

  document.getElementById("add-part").onclick =
    () => addItemFromInput("parts-input","parts-qty",parts);

  document.getElementById("add-service").onclick =
    () => addItemFromInput("services-input","services-qty",services);

  document.getElementById("new-btn").onclick = newInvoice;
});








































