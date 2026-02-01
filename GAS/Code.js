/***********************
 * Surpresso Equipment — GAS Backend
 * Only SERVER can write/read (secret)
 * Drive folder per equipment + photos + PDF A4
 ***********************/

// === CONFIG ===
const SPREADSHEET_ID = '19GhF5uxmZ8NpnBXIavL1pjulALJhdKpKCCAt0IKc3OI';
const DRIVE_ROOT_FOLDER_ID = '1jbjJoxxoGN8L5YXGNpXKB1HJZ9Sk6JtD';

// 🔐 секрет сервера (одинаковый в Node env и в Script Properties)
const SERVER_KEY_PROP = 'SURPRESSO_SERVER_KEY';

// Sheets (sheetId / gid)
const SH_EQUIPMENT = 1840737062;
const SH_STATUS    = 925272215;
const SH_PHOTOS    = 1128395503;

// ===== Статусы =====
const CLIENT_STATUSES = [
  "Прийнято на ремонт",
  "В роботі",
  "Готово",
  "Видано клієнту"
];

const COMPANY_STATUSES = [
  "Бронь к продаже",
  "Бронь к аренде",
  "Готово к аренде",
  "Уехало на аренду",
  "Приехало после аренды",
  "Уехало на подмену",
  "Приехало с подмены",
  "Продано"
];

const DEFAULT_STATUS_CLIENT  = "Прийнято на ремонт";
const DEFAULT_STATUS_COMPANY = "Приехало после аренды";
const TEXT_COLS = ["clientPhone", "serial", "internalNumber", "id"];


// =========================
// 1) Setup (один раз)
// =========================
function setup() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // EQUIPMENT
  let sh = ss.getSheetByName("EQUIPMENT") || ss.insertSheet("EQUIPMENT");
  sh.clear();
  sh.appendRow([
    "id", "createdAt", "updatedAt",
    "type", "owner", "isContract",
    "clientName", "clientPhone", "clientLocation",
    "model", "serial",
    "companyLocation", "name", "internalNumber",
    "status", "lastComment",
    "folderId", "folderUrl",
    "passportPdfId", "passportPdfUrl", "specs"
  ]);

  // важные текстовые колонки
  ["id","serial","internalNumber","clientPhone"].forEach(name=>{
    const c = col_(sh, name);
    sh.getRange(2, c, sh.getMaxRows()-1, 1).setNumberFormat("@");
  });

  // STATUS_LOG
  sh = ss.getSheetByName("STATUS_LOG") || ss.insertSheet("STATUS_LOG");
  sh.clear();
  sh.appendRow(["ts", "equipmentId", "oldStatus", "newStatus", "comment", "actor"]);
  // ✅ equipmentId как текст
  sh.getRange(2, 2, sh.getMaxRows()-1, 1).setNumberFormat("@");

  // PHOTOS
  sh = ss.getSheetByName("PHOTOS") || ss.insertSheet("PHOTOS");
  sh.clear();
  sh.appendRow(["ts", "equipmentId", "fileId", "fileUrl", "imgUrl", "caption"]);
  // ✅ equipmentId как текст + fileId тоже лучше текстом
  sh.getRange(2, 2, sh.getMaxRows()-1, 1).setNumberFormat("@");
  sh.getRange(2, 3, sh.getMaxRows()-1, 1).setNumberFormat("@");

  SpreadsheetApp.flush();
}

function createOnly_(card) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = getSheetAny_(ss, SH_EQUIPMENT);

  const id = String(card.id || "").trim();
  if (!id) return { ok:false, error:"No id" };

  const found = findRowById_(sh, id);
  if (found) {
    return { ok:false, error:"ID_ALREADY_EXISTS", id: getStoredId_(id) };
  }

  // если нет — обычный insert
  return upsertEquipment_(card);
}

// =========================
// WebApp routes
// =========================
function doGet(e) {
  return ContentService
    .createTextOutput("Surpresso GAS OK ✅")
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) ? e.postData.contents : "{}";
    const data = JSON.parse(raw);

    // 🔐 авторизация: только сервер
    const incomingSecret = getIncomingSecret_(e, data);
    assertServerKey_(incomingSecret);

    const action = String(data.action || "").trim();
    if (action === "createOnly") return json_(createOnly_(data.card || {}));
    if (action === "create")  return json_(upsertEquipment_(data.card || {}));
    if (action === "get")     return json_(getBundle_(data.id));
    if (action === "status")  return json_(setStatus_(data.id, data.newStatus, data.comment || "", data.actor || ""));
    if (action === "photo")   return json_(addPhoto_(data.id, data.base64, data.caption || ""));
    if (action === "pdf")     return json_(generatePassportPdfA4_(data.id));
    if (action === "specs")  return json_(setSpecs_(data.id, data.specs || ""));
    if (action === "statuses"){
      const owner = String(data.owner || "client");
      return json_({ ok: true, statuses: getStatusesForOwner_(owner) });
    }
    if (action === "approvalRequest") return json_(recordApprovalRequest_(data));
    if (action === "approvalResponse") return json_(recordApprovalResponse_(data));
    if (action === "approvalLookup") return json_(getApprovalEquipmentId_(data));

    return json_({ ok: false, error: "Unknown action" });

  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// =========================
// AUTH
// =========================
function getIncomingSecret_(e, data) {
  // ✅ Node у тебя шлёт ?secret=... (query)
  const q = (e && e.parameter && e.parameter.secret) ? String(e.parameter.secret) : "";
  const b = (data && data.secret) ? String(data.secret) : "";
  return q || b || "";
}

function assertServerKey_(incomingSecret) {
  const props = PropertiesService.getScriptProperties();
  const SERVER_KEY = props.getProperty(SERVER_KEY_PROP) || "";

  if (!SERVER_KEY) throw new Error("SERVER_KEY_NOT_SET_IN_SCRIPT_PROPERTIES");
  if (!incomingSecret) throw new Error("NO_SECRET");
  if (String(incomingSecret) !== String(SERVER_KEY)) throw new Error("UNAUTHORIZED");
}

// =========================
// EQUIPMENT: create or update (upsert)
// =========================
function upsertEquipment_(card) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = getSheetAny_(ss, SH_EQUIPMENT);

  const id = String(card.id || "").trim();
  if (!id) return { ok: false, error: "No id" };

  const now = new Date();
  const owner = String(card.owner || "client");
  const status = String(card.status || getDefaultStatus_(owner));

  // папка в Drive
  const folder = ensureEquipmentFolder_(id);

  const found = findRowById_(sh, id);

  // ✅ поля которые должны ВСЕГДА быть текстом:
  const idText = asText_(id);
  const phoneText = asText_(card.clientPhone || "");
  const serialText = asText_(card.serial || "");
  const internalText = asText_(card.internalNumber || "");

  if (!found) {
    // ✅ INSERT (через asText_ чтобы не жрало нули/точки)
    const row = [
      idText, now, now,
      card.type || "", owner, !!card.isContract,

      card.clientName || "", phoneText, card.clientLocation || "",
      card.model || "", serialText,

      card.companyLocation || "", card.name || "", internalText,

      status, card.comment || "",
      folder.id, folder.url,
      "", ""
    ];

    sh.appendRow(row);

    // пишем лог статуса только при первом создании
    appendStatusLog_(id, "", status, card.comment || "", card.actor || "");
  } else {
    // ✅ UPDATE (у тебя уже нормально — через setCell_)
    setCell_(sh, found.row, "updatedAt", now);
    setCell_(sh, found.row, "type", card.type || found.values.type || "");
    setCell_(sh, found.row, "owner", owner);
    setCell_(sh, found.row, "isContract", !!card.isContract);

    // client fields
    setCell_(sh, found.row, "clientName", card.clientName ?? found.values.clientName ?? "");
    setCell_(sh, found.row, "clientPhone", card.clientPhone ?? found.values.clientPhone ?? "");
    setCell_(sh, found.row, "clientLocation", card.clientLocation ?? found.values.clientLocation ?? "");
    setCell_(sh, found.row, "model", card.model ?? found.values.model ?? "");
    setCell_(sh, found.row, "serial", card.serial ?? found.values.serial ?? "");

    // company fields
    setCell_(sh, found.row, "companyLocation", card.companyLocation ?? found.values.companyLocation ?? "");
    setCell_(sh, found.row, "name", card.name ?? found.values.name ?? "");
    setCell_(sh, found.row, "internalNumber", card.internalNumber ?? found.values.internalNumber ?? "");

    // folder info
    setCell_(sh, found.row, "folderId", folder.id);
    setCell_(sh, found.row, "folderUrl", folder.url);
  }

  return { ok: true, id: getStoredId_(id), folderUrl: folder.url, status };
}

// =========================
// GET bundle (equipment + photos + log)
// =========================
function getBundle_(id) {
  const eq = getEquipmentById_(id);
  if (!eq) return { ok: false, error: "Not found" };

  // чистим телефон от апострофа если вдруг вернулся
  if (eq.clientPhone) eq.clientPhone = stripTextPrefix_(eq.clientPhone);

  return {
    ok: true,
    equipment: eq,
    photos: getPhotosById_(id),
    log: getStatusLogById_(id),
    statuses: getStatusesForOwner_(eq.owner || "client")
  };
}

// =========================
// STATUS update
// =========================
function setStatus_(id, newStatus, comment, actor) {
  if (!id) return { ok: false, error: "No id" };
  if (!newStatus) return { ok: false, error: "No newStatus" };

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = getSheetAny_(ss, SH_EQUIPMENT);

  const found = findRowById_(sh, id);
  if (!found) return { ok: false, error: "Not found" };

  const oldStatus = String(found.values.status || "");
  const now = new Date();

  setCell_(sh, found.row, "status", String(newStatus));
  setCell_(sh, found.row, "updatedAt", now);
  setCell_(sh, found.row, "lastComment", comment || "");

  appendStatusLog_(id, oldStatus, String(newStatus), comment || "", actor || "");

  return { ok: true, id: getStoredId_(id), oldStatus, newStatus };
}
// =========================
// PHOTO upload
// =========================
function addPhoto_(id, base64, caption) {
  const equipId = String(id ?? "").trim();            // ВАЖНО: строка
  if (!equipId) return { ok: false, error: "No id" };
  if (!base64)  return { ok: false, error: "No base64" };

  const eq = getEquipmentById_(equipId);
  if (!eq) return { ok: false, error: "Not found" };

  const folder = safeGetEquipmentFolder_(eq);

  const clean = String(base64).replace(/^data:image\/\w+;base64,/, "");
  const bytes = Utilities.base64Decode(clean);
  const blob  = Utilities.newBlob(bytes, "image/jpeg", `photo_${safeId_(equipId)}_${Date.now()}.jpg`);

  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const fileId  = String(file.getId());
  const fileUrl = String(file.getUrl());
  const imgUrl  = driveImgUrl_(fileId);

  // ✅ Пишем лог в PHOTOS по ИМЕНИ листа (gid не важен)
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName("PHOTOS");
  if (!sh) return { ok: true, fileId, fileUrl, imgUrl, warning: "PHOTOS_SHEET_NOT_FOUND" };

  // 1) добавили строку
  sh.appendRow([new Date(), equipId, fileId, fileUrl, imgUrl, caption || ""]);

  // 2) принудительно делаем equipmentId и fileId ТЕКСТОМ (чтобы 000 не резало)
  const lastRow = sh.getLastRow();
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];

  const colEquip = head.indexOf("equipmentId") + 1;
  const colFile  = head.indexOf("fileId") + 1;

  if (colEquip > 0) {
    const r = sh.getRange(lastRow, colEquip);
    r.setNumberFormat("@");
    r.setValue(equipId); // строка, без потери 000
  }
  if (colFile > 0) {
    const r = sh.getRange(lastRow, colFile);
    r.setNumberFormat("@");
    r.setValue(fileId);
  }

  return { ok: true, fileId, fileUrl, imgUrl };
}


function driveFileToDataUrl_(fileId) {
  if (!fileId) return "";
  
  try {
    const file = DriveApp.getFileById(fileId);
    let blob = file.getBlob();
    
    // Спроба конвертації в JPEG (найкращий формат для PDF)
    try {
      blob = blob.getAs(MimeType.JPEG);
    } catch (e) {
      Logger.log(`Не вдалося конвертувати в JPEG файл ${fileId}: ${e}`);
      // Якщо не вийшло — беремо оригінал
    }
    
    const bytes = blob.getBytes();
    const sizeKB = Math.round(bytes.length / 1024);
    
    if (sizeKB > 1200) {  // > ~1.2 MB — великий файл, PDF може "заглохнути"
      Logger.log(`Файл ${fileId} завеликий: ${sizeKB} KB → fallback thumbnail`);
      return `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`; // або повернути порожню строку
    }
    
    const b64 = Utilities.base64Encode(bytes);
    const mime = blob.getContentType() || MimeType.JPEG;
    
    Logger.log(`Base64 успішно створено для ${fileId}: ${sizeKB} KB`);
    return `data:${mime};base64,${b64}`;
  } catch (e) {
    Logger.log(`Помилка base64 для ${fileId}: ${e}`);
    return "";  // або thumbnail як запасний варіант
  }
}
// =========================
// PDF A4 (использует pdf_a4.html)
// =========================
function generatePassportPdfA4_(id) {
  const eq = getEquipmentById_(id);
  if (!eq) throw new Error("Not found");

  const html = HtmlService.createTemplateFromFile("pdf_a4");
  html.eq = eq;
  html.photos = getPhotosForPdf_(id, 6);  // вже є

// Додай це перед evaluate()
html.photos.forEach((photo, index) => {
  const len = photo.dataUrl ? photo.dataUrl.length : 0;
  Logger.log(`Фото ${index + 1}: dataUrl довжина = ${len}, починається з: ${photo.dataUrl ? photo.dataUrl.substring(0, 50) : 'порожньо'}`);
});
  
  // ← Добавь это (самая вероятная причина ошибки)
  html.statuses = getStatusLogById_(id);   // массив лога статусов

  // Опционально: если в шаблоне используется lastComment или другие поля — тоже передай
  // html.lastComment = eq.lastComment || "";
  
  const content = html.evaluate()
    .setWidth(794)   // A4 ~ 210mm при 96 dpi
    .setHeight(1123) // A4 ~ 297mm
    .getContent();

  const blob = Utilities.newBlob(content, MimeType.HTML, `passport_${safeId_(id)}.html`)
    .getAs(MimeType.PDF)
    .setName(`Surpresso_Passport_${safeId_(id)}.pdf`);

  const folder = safeGetEquipmentFolder_(eq); // ✅ ВОТ ТУТ

  if (eq.passportPdfId) {
    try { DriveApp.getFileById(eq.passportPdfId).setTrashed(true); } catch (e) {}
  }

  const pdfFile = folder.createFile(blob);
  pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = getSheetAny_(ss, SH_EQUIPMENT);
  const found = findRowById_(sh, id);

  if (found) {
    setCell_(sh, found.row, "passportPdfId", pdfFile.getId());
    setCell_(sh, found.row, "passportPdfUrl", pdfFile.getUrl());
    setCell_(sh, found.row, "updatedAt", new Date());
  }

  return { ok: true, id, fileId: pdfFile.getId(), url: pdfFile.getUrl() };
}

// =========================
// HELPERS: statuses
// =========================
function setSpecs_(id, specs) {
  const equipId = String(id || "").trim();
  if (!equipId) return { ok: false, error: "No id" };

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = getSheetAny_(ss, SH_EQUIPMENT);

  const found = findRowById_(sh, equipId);
  if (!found) return { ok: false, error: "Not found" };

  setCell_(sh, found.row, "specs", String(specs ?? ""));
  setCell_(sh, found.row, "updatedAt", new Date());

  return { ok: true, id: getStoredId_(equipId) };
}

function getDefaultStatus_(owner) {
  return String(owner) === "company" ? DEFAULT_STATUS_COMPANY : DEFAULT_STATUS_CLIENT;
}

function getStatusesForOwner_(owner) {
  return String(owner) === "company" ? COMPANY_STATUSES : CLIENT_STATUSES;
}

// =========================
// HELPERS: sheet access by name OR ID
// =========================
function getSheetAny_(ss, nameOrId) {
  const raw = String(nameOrId ?? "").trim();
  if (raw && /^\d+$/.test(raw)) {
    const asNum = Number(raw);
    if (Number.isSafeInteger(asNum)) {
      const shById = ss.getSheetById(asNum);
      if (shById) return shById;
    }
  }
  const sh = ss.getSheetByName(raw);
  if (!sh) throw new Error("Sheet not found by name: " + nameOrId);
  return sh;
}

// =========================
// HELPERS: read equipment/photos/log
// =========================
function getEquipmentById_(id) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = getSheetAny_(ss, SH_EQUIPMENT);
  const found = findRowById_(sh, id);
  return found ? found.values : null;
}

function getPhotosById_(id) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = getSheetAny_(ss, SH_PHOTOS);
  const data = sh.getDataRange().getValues();
  const head = data.shift();

  const idxId   = head.indexOf("equipmentId");
  const idxFile = head.indexOf("fileId");
  const idxUrl  = head.indexOf("fileUrl");
  const idxImg  = head.indexOf("imgUrl");
  const idxCap  = head.indexOf("caption");
  const idxTs   = head.indexOf("ts");

  const key = normKey_(id);

return data
  .filter(r => normKey_(r[idxId]) === key)
  .map(r => ({
    ts: r[idxTs],
    url: String(r[idxUrl] || ""),
    fileId: String(r[idxFile] || ""),     // ✅ ОБЯЗАТЕЛЬНО
    imgUrl: String(r[idxImg] || ""),
    caption: r[idxCap] || ""
  }))
  .reverse();
}


function getStatusLogById_(id) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = getSheetAny_(ss, SH_STATUS);
  const data = sh.getDataRange().getValues();
  const head = data.shift();

  const idxId  = head.indexOf("equipmentId");
  const idxTs  = head.indexOf("ts");
  const idxOld = head.indexOf("oldStatus");
  const idxNew = head.indexOf("newStatus");
  const idxCom = head.indexOf("comment");
  const idxAct = head.indexOf("actor");

  const key = normKey_(id);

  return data
    .filter(r => normKey_(r[idxId]) === key)
    .map(r => ({
      ts: r[idxTs],
      oldStatus: r[idxOld],
      newStatus: r[idxNew],
      comment: r[idxCom],
      actor: r[idxAct]
    }))
    .reverse();
}

function appendStatusLog_(id, oldStatus, newStatus, comment, actor) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = getSheetAny_(ss, SH_STATUS);

  const nextRow = sh.getLastRow() + 1;

  // 1) ставим формат TEXT на equipmentId ячейку
  sh.getRange(nextRow, 2).setNumberFormat("@");

  // 2) пишем значения
  sh.getRange(nextRow, 1, 1, 6).setValues([[
    new Date(),
    String(id ?? "").trim(),         // ВАЖНО: строка, нули сохранятся
    oldStatus || "",
    newStatus || "",
    comment || "",
    actor || ""
  ]]);
}


// =========================
// HELPERS: find row by "id"
// =========================
function findRowById_(sheet, id) {
  const data = sheet.getDataRange().getValues();
  const head = data.shift();
  const idx = head.indexOf("id");
  if (idx < 0) return null;

  const key = normKey_(id);

  for (let i = 0; i < data.length; i++) {
    // ✅ ищем по ключу: SP233 == SP.233 == sp-233
    if (normKey_(data[i][idx]) === key) {
      return { row: i + 2, values: rowToObj_(head, data[i]) };
    }
  }
  return null;
}

function rowToObj_(head, row) {
  const o = {};
  head.forEach((k, i) => o[k] = row[i]);
  return o;
}

function setCell_(sheet, rowIndex, colName, value) {
  const col = col_(sheet, colName);

  // ✅ эти поля всегда текстом (чтобы не терялись нули/точки)
  if (TEXT_COLS.includes(colName)) {
    sheet.getRange(rowIndex, col).setNumberFormat("@");
    sheet.getRange(rowIndex, col).setValue(String(value ?? "").trim());
    return;
  }

  sheet.getRange(rowIndex, col).setValue(value);
}


function col_(sheet, name) {
  const head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idx = head.indexOf(name);
  if (idx < 0) throw new Error("No column: " + name);
  return idx + 1;
}

// =========================
// DRIVE: folder per equipment
// =========================
function driveFileToDataUrl_(fileId) {
  if (!fileId) return "";
  
  try {
    const file = DriveApp.getFileById(fileId);
    let blob = file.getBlob();
    
    // Пытаемся конвертировать в JPEG (самый надёжный формат для PDF)
    try {
      blob = blob.getAs(MimeType.JPEG);
    } catch (convErr) {
      Logger.log("Конвертация в JPEG не удалась для " + fileId + ": " + convErr);
      // fallback — оригинал (часто PNG/HEIC тоже работают)
    }
    
    const bytes = blob.getBytes();
    const sizeKB = bytes.length / 1024;
    
    if (sizeKB > 1500) {  // > ~1.5 MB — слишком большой, PDF может упасть или быть пустым
      Logger.log("Слишком большой файл " + fileId + ": " + sizeKB + " KB → используем thumbnail как fallback");
      return `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;  // fallback, но не основной
    }
    
    const b64 = Utilities.base64Encode(bytes);
    const mime = blob.getContentType() || "image/jpeg";
    return `data:${mime};base64,${b64}`;
  } catch (e) {
    Logger.log("Ошибка base64 для " + fileId + ": " + e);
    return "";  // или fallback thumbnail
  }
}
function getPhotosForPdf_(id, limit) {
  limit = Number(limit || 6);

  const photos = getPhotosById_(id); // тут должны быть fileId
  if (!photos || !photos.length) return [];

  // последние N (у тебя уже newest-first после reverse())
  const slice = photos.slice(0, limit);

  return slice.map((p, i) => {
    const dataUrl = driveFileToDataUrl_(p.fileId);
    return {
      caption: p.caption || `Фото ${i + 1}`,
      dataUrl: dataUrl || ""
    };
  });
}

function ensureEquipmentFolder_(id) {
  const root = DriveApp.getFolderById(DRIVE_ROOT_FOLDER_ID);

  // папка хранится по "безопасному имени", но точку сохраняем
  const folderName = safeId_(String(id));

  const it = root.getFoldersByName(folderName);
  if (it.hasNext()) {
    const f = it.next();
    return { id: f.getId(), url: f.getUrl() };
  }

  const f = root.createFolder(folderName);
  return { id: f.getId(), url: f.getUrl() };
}

// ✅ SAFE folder getter (фикс падения PDF/Photo)
function safeGetEquipmentFolder_(eq) {
  const id = String(eq.id || "").trim();
  if (!id) throw new Error("NO_EQUIPMENT_ID");

  const folderId = String(eq.folderId || "").trim();
  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (e) {
      // folderId битый — идём дальше
    }
  }

  // fallback: создать/найти папку
  const created = ensureEquipmentFolder_(id);

  // сохранить в EQUIPMENT
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sh = getSheetAny_(ss, SH_EQUIPMENT);
    const found = findRowById_(sh, id);
    if (found) {
      setCell_(sh, found.row, "folderId", created.id);
      setCell_(sh, found.row, "folderUrl", created.url);
      setCell_(sh, found.row, "updatedAt", new Date());
    }
  } catch (_) {}

  return DriveApp.getFolderById(created.id);
}

// =========================
// ID normalize: НЕ ломаем точку, но ищем и без нее
// =========================
function normKey_(v) {
  // ключ поиска:
  // SP.233 == SP233 == sp-233
  return String(v || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

// отдать в лог/таблицу то, что пришло (как есть)
function getStoredId_(id) {
  return String(id || "").trim();
}

function safeId_(id){
  // для имени файла/папки (точка разрешена)
  return String(id || '').replace(/[\\\/:*?"<>|]/g,'_');
}

// =========================
// Phone/text helpers
// =========================
function asText_(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";

  // ✅ сохраняем как текст если начинается с 0/+ или есть точка
  if (s.startsWith("0") || s.startsWith("+") || s.includes(".")) {
    return "'" + s;
  }
  return s;
}


function stripTextPrefix_(v) {
  const s = String(v ?? "");
  return s.startsWith("'") ? s.slice(1) : s;
}

// =========================
// URL для IMG превью (ВАЖНО)
// =========================
function driveImgUrl_(fileId) {
  // Старий спосіб (заблокований ORB):
  // return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`;

  // Новий робочий варіант — thumbnail (працює в більшості випадків зараз)
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1000`;
}

function getOrCreateApprovalsSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName("approvals");
  if (!sheet) {
    sheet = ss.insertSheet("approvals");
    sheet.appendRow([
      "requestId",
      "equipmentId",
      "message",
      "actor",
      "createdAt",
      "status",
      "response",
      "responseAt",
      "chatId",
      "userId",
      "username",
      "firstName",
      "lastName",
    ]);
  }
  return sheet;
}

function recordApprovalRequest_(payload) {
  const requestId = String(payload.requestId || "").trim();
  const equipmentId = String(payload.equipmentId || "").trim();
  if (!requestId || !equipmentId) return { ok: false, error: "missing_fields" };

  const sheet = getOrCreateApprovalsSheet_();
  sheet.appendRow([
    requestId,
    equipmentId,
    String(payload.message || ""),
    String(payload.actor || ""),
    new Date(),
    "pending",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ]);
  return { ok: true };
}

function recordApprovalResponse_(payload) {
  const requestId = String(payload.requestId || "").trim();
  const equipmentId = String(payload.equipmentId || "").trim();
  const answer = String(payload.answer || "").trim();
  const chatId = String(payload.chatId || "").trim();
  if (!requestId || !equipmentId || !answer || !chatId) return { ok: false, error: "missing_fields" };

  const sheet = getOrCreateApprovalsSheet_();
  const data = sheet.getDataRange().getValues();
  const headers = data[0] || [];
  const idx = {
    requestId: headers.indexOf("requestId"),
    equipmentId: headers.indexOf("equipmentId"),
    status: headers.indexOf("status"),
    response: headers.indexOf("response"),
    responseAt: headers.indexOf("responseAt"),
    chatId: headers.indexOf("chatId"),
    userId: headers.indexOf("userId"),
    username: headers.indexOf("username"),
    firstName: headers.indexOf("firstName"),
    lastName: headers.indexOf("lastName"),
  };

  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (
      String(row[idx.requestId] || "") === requestId &&
      String(row[idx.equipmentId] || "") === equipmentId
    ) {
      rowIndex = i + 1;
      break;
    }
  }

  const user = payload.user || {};
  if (rowIndex === -1) {
    sheet.appendRow([
      requestId,
      equipmentId,
      "",
      "",
      "",
      "answered",
      answer,
      new Date(),
      chatId,
      user.id || "",
      user.username || "",
      user.firstName || "",
      user.lastName || "",
    ]);
    return { ok: true };
  }

  const updates = [];
  updates[idx.status] = "answered";
  updates[idx.response] = answer;
  updates[idx.responseAt] = new Date();
  updates[idx.chatId] = chatId;
  updates[idx.userId] = user.id || "";
  updates[idx.username] = user.username || "";
  updates[idx.firstName] = user.firstName || "";
  updates[idx.lastName] = user.lastName || "";

  for (let i = 0; i < updates.length; i++) {
    if (updates[i] !== undefined) {
      sheet.getRange(rowIndex, i + 1).setValue(updates[i]);
    }
  }

  return { ok: true };
}

function getApprovalEquipmentId_(payload) {
  const requestId = String(payload.requestId || "").trim();
  if (!requestId) return { ok: false, error: "missing_fields" };

  const sheet = getOrCreateApprovalsSheet_();
  const data = sheet.getDataRange().getValues();
  const headers = data[0] || [];
  const idxRequestId = headers.indexOf("requestId");
  const idxEquipmentId = headers.indexOf("equipmentId");

  if (idxRequestId === -1 || idxEquipmentId === -1) {
    return { ok: false, error: "invalid_headers" };
  }

  for (let i = data.length - 1; i >= 1; i--) {
    const row = data[i];
    if (String(row[idxRequestId] || "") === requestId) {
      return { ok: true, equipmentId: String(row[idxEquipmentId] || "").trim() };
    }
  }

  return { ok: false, error: "not_found" };
}

// =========================
// JSON response
// =========================
function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function driveFileToDataUrl_(fileId) {
  if (!fileId) return "";
  try {
    const file = DriveApp.getFileById(fileId);
    
    // Пробуем как JPEG
    let blob;
    try {
      blob = file.getBlob().getAs(MimeType.JPEG);
    } catch (e) {
      // Если не получилось — берём оригинал
      blob = file.getBlob();
    }
    
    const bytes = blob.getBytes();
    if (bytes.length > 3 * 1024 * 1024) { // > 3MB → слишком большой
      return `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
    }
    
    const b64 = Utilities.base64Encode(bytes);
    const mime = blob.getContentType() || "image/jpeg";
    return `data:${mime};base64,${b64}`;
  } catch (e) {
    Logger.log("Base64 failed for " + fileId + ": " + e);
    // fallback на thumbnail
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
  }
}
