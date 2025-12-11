
// ======================
//  Surpresso Check PWA — обновлённая версия
//  Поддержка: Drag & Drop, inline qty, Excel в формате макета
// ======================

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

let USERS = [];   // загруженные пользователи
let CURRENT_USER = null;

// Глобальные массивы
let parts = [];
let services = [];
let items = []; // {code,name,qty,price,sum}
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

    console.log("Пользователи загружены:", USERS);

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

    const code  = pick(["артикул","код","art","article"]);
    const name  = pick(["наименование","найменування","название","описание","name"]);
    const price = cleanPrice(pick(["цена","ціна","стоимость","price","грн"]));

    const stock = pick(["залишок","налич","stock","остат"]);
    const cell  = pick(["комірка","ячейк","cell","shelf"]);

    // услуги могут быть без кода → но имя обязательно
    if (!code && !name) return;

    out.push({
      code: String(code || "").trim(),
      name: String(name || "").trim(),
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
// Обновление базы (кнопка ⟳)
// ======================
async function refreshDatabase() {
  localStorage.removeItem("surp_parts");
  localStorage.removeItem("surp_services");
  await loadPrices();
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

    if (inputId === "parts-input")
      document.getElementById("parts-info").innerHTML = "";

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
        <div class="code">${item.code || ""}</div>
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
            <span><span class="icon">🗄</span> ${item.cell  || "—"}</span>
          `;
        }
      });

      ul.appendChild(li);
    });

    suggest.appendChild(ul);
  });

  document.addEventListener("click", e => {
    if (!suggest.contains(e.target) && e.target !== input)
      suggest.innerHTML = "";
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


// ======================
// Инициализация
// ======================
window.addEventListener("DOMContentLoaded", async () => {
  await initLogin();     // ← авторизация

  // Если пользователь НЕ авторизован — дальше не запускаем
  if (!CURRENT_USER) return;

  await loadPrices();

  attachSuggest("parts-input", "parts-suggest", parts);
  attachSuggest("services-input", "services-suggest", services);

  renderTable();

  document.getElementById("add-part").onclick =
    () => addItemFromInput("parts-input","parts-qty",parts);

  document.getElementById("add-service").onclick =
    () => addItemFromInput("services-input","services-qty",services);

  document.getElementById("new-btn").onclick = newInvoice;
});

