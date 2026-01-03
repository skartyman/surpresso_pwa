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

// Глобальные массивы
let parts = [];
let services = [];
let items = []; // {code,name,qty,price,sum}
let kit = []; // набор со склада
let warehouseTemplates = [];
let templatesPanelOpen = false;
let editingTemplateId = null;
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
    inputs[0].value = name;
  }
}

// ======================
// Инициализация авторизации
// ======================
async function initLogin() {
  await loadUsers();

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

// ======================
// Фильтрация списка
// ======================
// ======================================
// ФУЗЗИ-АЛГОРИТМ (легкий и быстрый)
// ======================================
function fuzzyScore(pattern, text) {
  pattern = pattern.toLowerCase();
  text = text.toLowerCase();

  // Прямое включение — 100%
  if (text.includes(pattern)) return 100;

  let score = 0;
  let pIndex = 0;

  // последовательное совпадение букв → чем больше последовательность, тем выше score
  for (let i = 0; i < text.length; i++) {
    if (text[i] === pattern[pIndex]) {
      score += 5;
      pIndex++;
      if (pIndex === pattern.length) break;
    } else {
      score--;
    }
  }

  // штраф за расстояние по длине
  score -= Math.abs(text.length - pattern.length);

  return score;
}

// ======================================
// УМНЫЙ ФУЗЗИ ПОИСК
// ======================================
function filterList(list, query) {
  if (!query.trim()) return [];

  const words = query
    .toLowerCase()
    .split(/[\s,.;:]+/)
    .filter(w => w.length > 0);

  return list
    .map(item => {
      const haystack =
        `${item.code} ${item.name} ${item.stock || ""} ${item.cell || ""}`.toLowerCase();

      // Суммарный фуззи рейтинг по каждому слову
      let totalScore = 0;

      for (const w of words) {
        totalScore += fuzzyScore(w, haystack);
      }

      return { item, score: totalScore };
    })

    // выбрасываем нерелевантное
    .filter(res => res.score > 0)

    // сортируем по релевантности
    .sort((a, b) => b.score - a.score)

    // оставляем только объекты item
    .map(res => res.item)

    .slice(0, 50);
}

// ======================
// Подсказки
// ======================
function attachSuggest(inputId, suggestId, sourceList) {
  const input = document.getElementById(inputId);
  const suggest = document.getElementById(suggestId);

  input.addEventListener("input", () => {
    suggest.innerHTML = "";

    if (inputId === "parts-input") {
      document.getElementById("parts-info").innerHTML = "";
    }

    const text = input.value.trim().toLowerCase();
    if (!text) return;

    const results = filterList(sourceList, text);
    if (!results.length) return;

    const ul = document.createElement("ul");

    results.forEach(item => {
      const li = document.createElement("li");

      let extraHTML = "";
      if (inputId === "parts-input") {
        extraHTML = `
          <div class="extra">
            📦 ${item.stock || "—"} &nbsp; | &nbsp; 🗄 ${item.cell || "—"}
          </div>
        `;
      }

      li.innerHTML = `
        <div class="code">${item.code}</div>
        <div class="name">${item.name}</div>
        <div class="price">${item.price.toFixed(2)} грн</div>
        ${extraHTML}
      `;

      li.addEventListener("click", () => {
        input.value = item.code || item.name;
        suggest.innerHTML = "";

        if (inputId === "parts-input") {
          document.getElementById("parts-info").innerHTML = `
            <span><span class="icon">📦</span> ${item.stock || "—"}</span>
            <span><span class="icon">🗄</span> ${item.cell || "—"}</span>
          `;
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
items.push({
  code: found.code || "",
  name: found.name,
  qty,
  price: found.price,
  sum: qty * found.price,
  type: sourceList === parts ? "part" : "service"   // ← добавили тип
});


  inputEl.value = "";
  document.getElementById(qtyId).value = "1";

  if (inputId === "parts-input")
    document.getElementById("parts-info").innerHTML = "";

  renderTable();
}
// ======================
// 📦 СКЛАД — НАБОР ЗАПЧАСТЕЙ (QR + LIVE OCR)
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

let WAREHOUSE_MODE = "manual";
const QTY_STEP = 0.5;

function normalizeOCR(text) {
  return text
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[ОO]/g, "0")
    .replace(/[ІI]/g, "1")
    .replace(/[ЅS]/g, "5")
    .replace(/[ВB]/g, "8");
}

// ---- shared camera state (one camera for QR/OCR) ----
let CAM_STREAM = null;
let QR_RAF = null;

let OCR_TIMER = null;
let LAST_OCR_CODE = null;

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

    items.push({
      code: p.code,
      name: p.name,
      qty: k.qty,
      price: p.price,
      sum: p.price * k.qty,
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
function existsInPrice(code) {
  const raw = normalizeCode(code);
  if (!raw) return false;

  return parts.some(p =>
    normalizeCode(p.code) === raw
  );
}
function normalizeCode(str) {
  return String(str || "")
    .toUpperCase()
    .replace(/[\u00A0\u202F]/g, "") // невидимые пробелы
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

function addWarehouseItemByCode(code, qty = 1) {
  if (!code) return false;

  const raw = normalizeCode(code);
  if (!raw) return false;

  // 1️⃣ точное совпадение
  let found = parts.find(p =>
    normalizeCode(p.code) === raw
  );

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

  // ⛔ КЛЮЧЕВОЕ МЕСТО (ТО, ЧТО ТЫ ПРОПУСТИЛ)
  if (!found) {
    console.warn("❌ Не найдено в прайсе:", code);
    warehouseAlert(`❌ Не найдено в прайсе: ${code}`, "error", 4000);
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

    div.innerHTML = `
      <div class="top">
        <span>${it.code}</span>
        <span>🗄 ${it.cell || "—"}</span>
      </div>
      <div class="bottom">
        <div class="qty-controls">
          <button type="button" onclick="changeKitQty(${idx}, -1)">−</button>
          <span>${it.qty}</span>
          <button type="button" onclick="changeKitQty(${idx}, 1)">+</button>
        </div>
        <button type="button" onclick="removeKitItem(${idx})">❌</button>
      </div>
    `;
    box.appendChild(div);
  });

  updateWarehouseActions();
}

function applyTemplateToKit(tpl) {
  if (!tpl || !Array.isArray(tpl.items)) return;
  if (kit.length && !confirm("Заменить текущий набор на шаблон?")) return;

  kit = tpl.items.map(it => ({
    code: it.code,
    name: it.name,
    cell: it.cell || "",
    qty: +(+it.qty || 1).toFixed(2)
  }));

  saveKit();
  renderWarehouseList();
  updateWarehouseActions();
  warehouseAlert(`Шаблон \"${tpl.name}\" загружен`, "success", 2000);
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
    toKitBtn.onclick = () => applyTemplateToKit(tpl);

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
  // повторное нажатие по текущему режиму QR/OCR => выключить и уйти в manual
  if (!opts.silent && mode === WAREHOUSE_MODE && (mode === "qr" || mode === "ocr")) {
    stopLiveAll();
    WAREHOUSE_MODE = "manual";
    mode = "manual";
  } else {
    stopLiveAll(); // ✅ всегда стоп перед стартом нового режима
    WAREHOUSE_MODE = mode;
  }

  ["manual","qr","ocr"].forEach(m => {
    document.getElementById("wm-" + m)?.classList.toggle("active", m === mode);
  });

  const live = document.getElementById("ocr-live");
  if (live) live.style.display = (mode === "qr" || mode === "ocr") ? "block" : "none";

  if (mode === "qr") startQRScan();
  if (mode === "ocr") startLiveOCR();
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

function stopLiveOCR() {
  if (OCR_TIMER) {
    clearInterval(OCR_TIMER);
    OCR_TIMER = null;
  }
  LAST_OCR_CODE = null;

  const hint = document.getElementById("ocr-hint");
  if (hint) hint.textContent = "";

  stopCamera();

  const live = document.getElementById("ocr-live");
  if (live) live.style.display = "none";
}

function stopLiveAll() {
  stopLiveQR();
  stopLiveOCR();
}


// ======================
// 📷 QR / BARCODE SCAN — FINAL
// ======================

let QR_HITS = {};       // защита от галлюцинаций
let LAST_QR_CODE = null;

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

  if (!live || !video) return;

  live.style.display = "block";
  if (hint) hint.textContent = "Наведи камеру на QR или штрихкод";

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

  const scan = async () => {
    if (WAREHOUSE_MODE !== "qr") return;

    try {
      const codes = await detector.detect(video);
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

      // 🔁 защита от повторов
      if (candidate === LAST_QR_CODE) {
        QR_RAF = requestAnimationFrame(scan);
        return;
      }

      LAST_QR_CODE = candidate;

      // 🔢 антигаллюцинация: 2 одинаковых подряд
      QR_HITS[candidate] = (QR_HITS[candidate] || 0) + 1;

      if (QR_HITS[candidate] < 2) {
        warehouseAlert(`📷 Видим: ${candidate} (подтвердите)`, "info", 800);
        QR_RAF = requestAnimationFrame(scan);
        return;
      }

      QR_HITS = {}; // сброс

      // ⛔ НЕ ИЗ ПРАЙСА — СРАЗУ СТОП
      if (!existsInPrice(candidate)) {
        warehouseAlert(
          `❌ Нет в прайсе: ${candidate}`,
          "error",
          3000
        );
        QR_RAF = requestAnimationFrame(scan);
        return;
      }

      // вибрация
      if (navigator.vibrate) navigator.vibrate(60);

      warehouseAlert(`🔎 Найден код: ${candidate}`, "info", 3000);

      setTimeout(() => {
        if (confirm(`Добавить запчасть?\n\n${candidate}`)) {
          const ok = addWarehouseItemByCode(candidate, 1);

          if (ok) {
            warehouseAlert(
              `✅ Добавлено: ${candidate}`,
              "success",
              2500
            );
          } else {
            warehouseAlert(
              `❌ Ошибка добавления: ${candidate}`,
              "error",
              4000
            );
          }
        } else {
          warehouseAlert("⏭ Пропущено", "warn", 1200);
        }
      }, 200);

    } catch (e) {
      console.warn("QR detect error:", e);
    }

    QR_RAF = requestAnimationFrame(scan);
  };

  scan();
}

// ======================
// 👁 LIVE OCR (Tesseract)
// ===== OCR STATE =====
let OCR_HITS = {};
//let LAST_OCR_CODE = null;
//let OCR_TIMER = null;

async function startLiveOCR() {
  if (typeof loadTesseract !== "function") {
    alert("Tesseract не подключён");
    setWarehouseMode("manual", { silent: true });
    return;
  }

  await loadTesseract();
  if (!window.Tesseract) {
    alert("OCR недоступен");
    setWarehouseMode("manual", { silent: true });
    return;
  }

  const live  = document.getElementById("ocr-live");
  const video = document.getElementById("ocr-video");
  const hint  = document.getElementById("ocr-hint");

  live.style.display = "block";
  if (hint) hint.textContent = "Наведи камеру на артикул";

  CAM_STREAM = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" }
  });

  video.srcObject = CAM_STREAM;
  await video.play();

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  OCR_TIMER = setInterval(async () => {
    if (WAREHOUSE_MODE !== "ocr") return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;

    // 🔲 область считывания (ТОЧНО В РАМКЕ)
    const cropX = vw * 0.1;
    const cropY = vh * 0.35;
    const cropW = vw * 0.8;
    const cropH = vh * 0.18;

    canvas.width  = Math.floor(cropW);
    canvas.height = Math.floor(cropH);

    ctx.filter = "grayscale(1) contrast(1.8)";
    ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
    ctx.filter = "none";

    try {
      const { data } = await Tesseract.recognize(canvas, "eng", {
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
        preserve_interword_spaces: 0
      });

      const raw = data.text.toUpperCase().replace(/\s+/g, "");
      console.log("OCR RAW:", raw);

      const candidate = extractBestCode(raw);
      if (!candidate) {
        warehouseAlert("👁 Ищу артикул…", "info", 800);
        return;
      }

      // ===== стабилизация =====
      OCR_HITS[candidate] = (OCR_HITS[candidate] || 0) + 1;

      if (OCR_HITS[candidate] < 2) {
        warehouseAlert(`👁 Видим: ${candidate}`, "info", 800);
        return;
      }

      OCR_HITS = {}; // сброс

      if (candidate === LAST_OCR_CODE) return;
      LAST_OCR_CODE = candidate;

      if (navigator.vibrate) navigator.vibrate(80);

      warehouseAlert(`🔎 Найден код: ${candidate}`, "info", 3000);

      if (confirm(`Добавить запчасть?\n\n${candidate}`)) {
        const ok = addWarehouseItemByCode(candidate, 1);
        if (ok) {
          warehouseAlert(`✅ Добавлено: ${candidate}`, "success", 2000);
        } else {
          warehouseAlert(`❌ Нет в прайсе: ${candidate}`, "error", 3000);
        }
      } else {
        warehouseAlert("⏭ Пропущено", "warn", 1000);
      }

    } catch (e) {
      console.warn("OCR error:", e);
    }

  }, 1200);
}

// ======================
// 🔎 Extract best code
// ======================

function extractBestCode(text) {
  if (!text) return null;
  text = String(text).toUpperCase();

  // кандидаты 6–24 символа
  const matches = text.match(/[A-Z0-9]{3,20}/g);
  if (!matches) return null;

  // ищем точное совпадение с прайсом
  for (const m of matches) {
    if (parts.some(p => String(p.code || "").toUpperCase() === m)) {
      return m;
    }
  }

  // если точного нет — вернём самый "похожий" (первый длинный)
  matches.sort((a,b) => b.length - a.length);
  return matches[0] || null;
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
        <input type="text" class="engineer-input" placeholder="Фамилия инженера" />
        <button class="btn small" onclick="addEngineerField()">+</button>
      </div>
    </div>
  `;

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
      <input type="text" class="engineer-input" placeholder="Фамилия инженера" />
      <button class="btn primary" onclick="addEngineerField()">+</button>
    </div>
  `;
  cont.appendChild(div);
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
// ============================================
// 🎄 NEW YEAR SNOW EFFECT + CLICK BLAST
// ============================================

(function startSnow() {
  const canvas = document.getElementById("snow-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  let w, h;
  let flakes = [];

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }

  window.addEventListener("resize", resize);
  resize();

  const FLAKE_COUNT = Math.min(160, Math.floor(w / 7));

  function createFlake(x = Math.random() * w, y = Math.random() * h) {
    return {
      x,
      y,
      r: Math.random() * 3 + 1,
      vy: Math.random() * 0.8 + 0.4,
      vx: Math.random() * 0.6 - 0.3
    };
  }

  for (let i = 0; i < FLAKE_COUNT; i++) {
    flakes.push(createFlake());
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();

    flakes.forEach(f => {
      ctx.moveTo(f.x, f.y);
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    });

    ctx.fill();
    update();
  }

  function update() {
    flakes.forEach(f => {
      f.y += f.vy;
      f.x += f.vx;

      // лёгкое торможение после взрыва
      f.vx *= 0.98;
      f.vy = Math.min(f.vy + 0.01, 1.6);

      if (f.y > h) {
        f.y = -5;
        f.x = Math.random() * w;
        f.vx = Math.random() * 0.6 - 0.3;
        f.vy = Math.random() * 0.8 + 0.4;
      }
    });
  }

  function blast(x, y) {
    flakes.forEach(f => {
      const dx = f.x - x;
      const dy = f.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 120) {
        const force = (120 - dist) / 120;
        f.vx += dx * 0.04 * force;
        f.vy += dy * 0.04 * force;
      }
    });
  }

  canvas.addEventListener("click", e => blast(e.clientX, e.clientY));
  canvas.addEventListener("touchstart", e => {
    const t = e.touches[0];
    blast(t.clientX, t.clientY);
  });

  function loop() {
    draw();
    requestAnimationFrame(loop);
  }

  loop();
})();
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
  btn.textContent = isLight ? "☀️" : "🌙";
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

  document.getElementById("add-part").onclick =
    () => addItemFromInput("parts-input","parts-qty",parts);

  document.getElementById("add-service").onclick =
    () => addItemFromInput("services-input","services-qty",services);

  document.getElementById("new-btn").onclick = newInvoice;
});












