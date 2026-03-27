const PARTS_SHEET_ID = "1kHTj9-Hh5ZjR1iHKXEiAxKx6XSsd_RE2SDJq9eBqRZ8";
const PARTS_GID = 1099059228;
const RECOUNT_STORAGE_KEY = "surp_recount_session_v2";

let parts = [];
let recountSession = null;

function warehouseAlert(msg, type = "success", timeout = 2200) {
  const el = document.getElementById("warehouse-alert");
  if (!el) return;
  el.className = `warehouse-alert ${type}`;
  el.textContent = msg;
  el.style.display = "block";
  setTimeout(() => {
    el.style.display = "none";
  }, timeout);
}

function cleanStock(raw) {
  const normalized = String(raw ?? "")
    .replace(/,/g, ".")
    .replace(/\s+/g, "")
    .replace(/[^0-9.-]/g, "");
  const num = Number.parseFloat(normalized);
  return Number.isFinite(num) ? num : 0;
}

function normalizeRows(rows) {
  const out = [];

  rows.forEach(row => {
    const lc = {};
    Object.entries(row || {}).forEach(([k, v]) => {
      if (!k) return;
      lc[k.trim().toLowerCase()] = v;
    });

    const pick = masks => {
      for (const mask of masks) {
        for (const [k, v] of Object.entries(lc)) {
          if (k.includes(mask) && v !== "" && v !== undefined) return v;
        }
      }
      return "";
    };

    const code = String(pick(["артикул", "код", "art", "article"]) || "").trim();
    const name = String(pick(["наименование", "найменування", "название", "описание", "name"]) || "").trim();
    const stock = cleanStock(pick(["залишок", "налич", "stock", "остат"]));
    const cell = String(pick(["комірка", "ячейк", "cell", "shelf"]) || "").trim();

    const hasName = Boolean(name);
    const hasCode = Boolean(code);

    if (!hasName) return;
    if (!hasCode && stock <= 0) return;

    out.push({ code, name, stock, cell });
  });

  return out;
}

async function loadParts() {
  const url = `https://docs.google.com/spreadsheets/d/${PARTS_SHEET_ID}/export?format=csv&gid=${PARTS_GID}&v=${Date.now()}`;
  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

  const text = await resp.text();
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  parts = normalizeRows(parsed.data);
}

function normalizeCellPath(raw) {
  const str = String(raw || "").trim().replace(/,/g, ".");
  if (!str) return [];
  return str
    .split(".")
    .map(x => Number.parseInt(x.trim(), 10))
    .filter(Number.isFinite);
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
  const point = normalizeCellPath(cell);
  const left = normalizeCellPath(from);
  if (!point.length || !left.length) return false;

  if (!to) {
    return compareCellPath(point, left) >= 0;
  }

  const right = normalizeCellPath(to);
  if (!right.length) return compareCellPath(point, left) >= 0;

  const min = compareCellPath(left, right) <= 0 ? left : right;
  const max = compareCellPath(left, right) <= 0 ? right : left;

  return compareCellPath(point, min) >= 0 && compareCellPath(point, max) <= 0;
}

function sortByCellThenCode(a, b) {
  const cmp = compareCellPath(normalizeCellPath(a.cell), normalizeCellPath(b.cell));
  if (cmp !== 0) return cmp;
  return String(a.code).localeCompare(String(b.code), "ru");
}

function buildRecountSession() {
  const from = document.getElementById("recount-range-from")?.value.trim();
  const to = document.getElementById("recount-range-to")?.value.trim();

  let scoped = [];
  let mode = "without-cell";

  if (from) {
    mode = "range";
    scoped = parts
      .filter(p => isCellInRange(p.cell, from, to))
      .filter(p => cleanStock(p.stock) > 0);
  } else {
    scoped = parts
      .filter(p => cleanStock(p.stock) > 0)
      .filter(p => !String(p.cell || "").trim());
  }

  scoped.sort(sortByCellThenCode);

  recountSession = {
    startedAt: new Date().toISOString(),
    mode,
    rangeFrom: from,
    rangeTo: to,
    status: "active",
    items: scoped.map(p => ({
      code: p.code,
      name: p.name,
      cell: p.cell || "",
      fact: 0,
      stock: Number(p.stock || 0)
    }))
  };

  renderRecountTable();
  updateSessionMeta();
  warehouseAlert(`Таблица сформирована: ${recountSession.items.length} позиций`, "success", 2000);
}

function updateSessionMeta() {
  const meta = document.getElementById("recount-session-meta");
  if (!meta || !recountSession) return;

  if (recountSession.mode === "range") {
    const right = recountSession.rangeTo ? recountSession.rangeTo : "до конца файла";
    meta.textContent = `Диапазон: ${recountSession.rangeFrom} — ${right}. Позиции: ${recountSession.items.length}`;
  } else {
    meta.textContent = `Режим без диапазона: позиции без ячейки с ненулевым остатком. Позиции: ${recountSession.items.length}`;
  }
}

function renderRecountTable() {
  const body = document.getElementById("recount-body");
  if (!body || !recountSession) return;

  if (!recountSession.items.length) {
    body.innerHTML = '<tr><td colspan="4" class="muted">Позиции не найдены.</td></tr>';
    return;
  }

  body.innerHTML = recountSession.items
    .map((row, idx) => `
      <tr>
        <td>${escapeHtml(row.cell || "—")}</td>
        <td>${renderPartCode(row.code)}</td>
        <td><input type="number" min="0" step="0.01" data-recount-idx="${idx}" value="${Number(row.fact || 0)}"></td>
        <td>${escapeHtml(row.name || "")}</td>
      </tr>
    `)
    .join("");
}

function saveRecountSession() {
  if (!recountSession) return;
  localStorage.setItem(RECOUNT_STORAGE_KEY, JSON.stringify(recountSession));
  warehouseAlert("Сессия сохранена", "success", 1800);
}

function addFoundRecountItem() {
  if (!recountSession) {
    warehouseAlert("Сначала сформируйте таблицу", "warn", 2200);
    return;
  }

  const code = document.getElementById("recount-found-code")?.value.trim();
  const cell = document.getElementById("recount-found-cell")?.value.trim();
  const fact = Math.max(0, Number(document.getElementById("recount-found-fact")?.value || 0));

  if (!code) {
    warehouseAlert("Укажите артикул", "warn", 2200);
    return;
  }

  const catalog = parts.find(p => p.code === code);
  if (!catalog) {
    warehouseAlert("Артикул не найден в прайсе", "error", 2600);
    return;
  }

  const existing = recountSession.items.find(it => it.code === code && (cell ? it.cell === cell : true));
  if (existing) {
    existing.fact = +(Number(existing.fact || 0) + fact).toFixed(2);
  } else {
    recountSession.items.push({
      code: catalog.code,
      name: catalog.name,
      cell: cell || catalog.cell || "",
      fact: +fact.toFixed(2),
      stock: Number(catalog.stock || 0)
    });
    recountSession.items.sort(sortByCellThenCode);
  }

  renderRecountTable();
  warehouseAlert("Найденный товар добавлен", "success", 1800);
}

async function exportRecountExcel() {
  if (!recountSession) {
    warehouseAlert("Нет активной сессии", "warn", 2200);
    return;
  }

  recountSession.status = "completed";
  recountSession.finishedAt = new Date().toISOString();

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Переучет");

  ws.addRow(["Статус", recountSession.status]);
  ws.addRow(["Начало", recountSession.startedAt]);
  ws.addRow(["Завершение", recountSession.finishedAt]);
  ws.addRow([
    "Диапазон",
    recountSession.mode === "range"
      ? `${recountSession.rangeFrom} - ${recountSession.rangeTo || "до конца файла"}`
      : "без ячейки"
  ]);
  ws.addRow([]);
  ws.addRow(["Ячейка", "Артикул", "Наименование", "Системный остаток", "Факт", "Разница"]);

  recountSession.items.forEach(it => {
    const stock = Number(it.stock || 0);
    const fact = Number(it.fact || 0);

    ws.addRow([
      it.cell || "",
      it.code,
      it.name || "",
      stock,
      fact,
      Number((fact - stock).toFixed(2))
    ]);
  });

  ws.columns = [{ width: 14 }, { width: 18 }, { width: 54 }, { width: 18 }, { width: 12 }, { width: 12 }];

  const fileName = `recount_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.xlsx`;
  const buffer = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), fileName);

  saveRecountSession();
  warehouseAlert("Экспорт выполнен. Переучет завершен", "success", 2600);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getDvgUrl(code) {
  return `https://devecchigiuseppesrl.com/e-commerce/welcome/ordini/dettagli.asp?codice-articolo=${encodeURIComponent(String(code || "").trim())}`;
}

function renderPartCode(code) {
  const normalizedCode = String(code || "").trim();
  if (!normalizedCode) return "";

  const url = getDvgUrl(normalizedCode);
  return `
    <a
      href="${url}"
      target="_blank"
      rel="noopener noreferrer"
      class="dvg-link"
      title="Открыть в DVG"
    >
      ${escapeHtml(normalizedCode)}
    </a>
  `;
}

window.addEventListener("DOMContentLoaded", async () => {
  await window.SurpAuth?.init?.();
  if (!window.SurpAuth?.getCurrentUser?.()) return;

  try {
    await loadParts();
    recountSession = JSON.parse(localStorage.getItem(RECOUNT_STORAGE_KEY) || "null");
    if (recountSession?.items) {
      renderRecountTable();
      updateSessionMeta();
    }
  } catch (e) {
    console.error(e);
    warehouseAlert("Не удалось загрузить прайс", "error", 3000);
  }

  document.getElementById("build-recount-btn")?.addEventListener("click", buildRecountSession);
  document.getElementById("save-recount-btn")?.addEventListener("click", saveRecountSession);
  document.getElementById("export-recount-btn")?.addEventListener("click", exportRecountExcel);
  document.getElementById("recount-found-apply")?.addEventListener("click", addFoundRecountItem);

  document.getElementById("add-found-btn")?.addEventListener("click", () => {
    const form = document.getElementById("recount-found-form");
    if (!form) return;
    form.style.display = form.style.display === "none" ? "grid" : "none";
  });

  document.getElementById("recount-body")?.addEventListener("input", e => {
    const idx = Number(e.target?.dataset?.recountIdx);
    if (!Number.isFinite(idx) || !recountSession?.items[idx]) return;
    recountSession.items[idx].fact = Math.max(0, Number(e.target.value || 0));
  });

  document.getElementById("recount-body")?.addEventListener("focusin", e => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || input.type !== "number") return;
    if (input.value === "0") {
      input.value = "";
      return;
    }
    input.select();
  });

  document.getElementById("recount-body")?.addEventListener("focusout", e => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || input.type !== "number") return;
    if (input.value === "") input.value = "0";
  });
});
