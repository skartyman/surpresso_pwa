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
const SH_MANUALS   = "MANUALS";
const MANUALS_FOLDER_NAME = "manuals";
const MANUAL_INDEX_FOLDER_NAME = "manual-index";

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
const SUBSCRIPTIONS_TEXT_COLS = ["equipmentId", "chatId", "userId", "username", "firstName", "lastName"];

// ===== Telegram subscriptions =====
const SUBSCRIPTIONS_SHEET = "subscriptions";
const MANUALS_SHEET_COLUMNS = [
  "id", "title", "brand", "model", "originalName", "fileName",
  "mimeType", "size", "uploadedAt", "fileId", "fileUrl", "driveUrl",
  "indexFileId", "indexStatus", "indexUpdatedAt", "chunksCount", "pagesCount"
];


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

  // MANUALS
  sh = ss.getSheetByName(SH_MANUALS) || ss.insertSheet(SH_MANUALS);
  sh.clear();
  sh.appendRow(MANUALS_SHEET_COLUMNS);
  ["id", "size", "fileId", "indexFileId", "chunksCount", "pagesCount"].forEach(function(name) {
    const c = col_(sh, name);
    sh.getRange(2, c, sh.getMaxRows()-1, 1).setNumberFormat("@");
  });

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
    if (action === "search")  return json_(searchEquipment_(data.query, data.limit));
    if (action === "status")  return json_(setStatus_(data.id, data.newStatus, data.comment || "", data.actor || "", data.location || ""));
    if (action === "photo")   return json_(addPhoto_(data.id, data.base64, data.caption || ""));
    if (action === "deletePhoto") return json_(deletePhoto_(data.id, data.fileId));
    if (action === "pdf")     return json_(generatePassportPdfA4_(data.id));
    if (action === "specs")  return json_(setSpecs_(data.id, data.specs || ""));
    if (action === "statuses"){
      const owner = String(data.owner || "client");
      return json_({ ok: true, statuses: getStatusesForOwner_(owner) });
    }
    if (action === "subscribe") return json_(subscribeEquipment_(data));
    if (action === "unsubscribe") return json_(unsubscribeEquipment_(data));
    if (action === "subscribers") return json_(getEquipmentSubscribers_(data));
    if (action === "subscriptionByChat") return json_(getSubscriptionByChat_(data));
    if (action === "history") return json_(getStatusHistory_(data));
    if (action === "approvalRequest") return json_(recordApprovalRequest_(data));
    if (action === "approvalResponse") return json_(recordApprovalResponse_(data));
    if (action === "approvalLookup") return json_(getApprovalEquipmentId_(data));
    if (action === "manualsList") return json_(listManuals_());
    if (action === "manualUpload") return json_(uploadManual_(data.manual || {}));
    if (action === "manualGet") return json_(getManual_(data.id));
    if (action === "indexSave") return json_(indexSave_(data.manualId, data.index));
    if (action === "indexGet") return json_(indexGet_(data.manualId));
    if (action === "indexDelete") return json_(indexDelete_(data.manualId));
    if (action === "indexStatusUpdate") return json_(indexStatusUpdate_(data.manualId, data.metadata || {}));
    if (action === "manualDelete") return json_(deleteManual_(data.id));

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
function setStatus_(id, newStatus, comment, actor, location) {
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

  if (location) {
    const owner = String(found.values.owner || "");
    if (owner === "company") {
      setCell_(sh, found.row, "companyLocation", location);
    } else {
      setCell_(sh, found.row, "clientLocation", location);
    }
  }

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

function ensureManualsSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(SH_MANUALS);

  if (!sh) {
    sh = ss.insertSheet(SH_MANUALS);
    sh.appendRow(MANUALS_SHEET_COLUMNS);
  } else {
    ensureSheetColumns_(sh, MANUALS_SHEET_COLUMNS);
  }

  ["id", "fileId", "size", "indexFileId", "chunksCount", "pagesCount"].forEach(function(name) {
    try {
      const c = col_(sh, name);
      sh.getRange(2, c, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat("@");
    } catch (e) {}
  });

  return sh;
}

function manualsFolder_() {
  const root = DriveApp.getFolderById(DRIVE_ROOT_FOLDER_ID);
  const it = root.getFoldersByName(MANUALS_FOLDER_NAME);
  if (it.hasNext()) return it.next();
  return root.createFolder(MANUALS_FOLDER_NAME);
}

function manualIndexFolder_() {
  const root = DriveApp.getFolderById(DRIVE_ROOT_FOLDER_ID);
  const it = root.getFoldersByName(MANUAL_INDEX_FOLDER_NAME);
  if (it.hasNext()) return it.next();
  return root.createFolder(MANUAL_INDEX_FOLDER_NAME);
}

function ensureSheetColumns_(sheet, columns) {
  const head = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  const missing = (columns || []).filter(function(name) {
    return head.indexOf(name) < 0;
  });

  missing.forEach(function(name) {
    sheet.insertColumnAfter(sheet.getLastColumn() || 1);
    sheet.getRange(1, sheet.getLastColumn()).setValue(name);
  });
}

function manualPublicMeta_(item) {
  return {
    id: String(item.id || ""),
    title: String(item.title || ""),
    brand: String(item.brand || ""),
    model: String(item.model || ""),
    originalName: String(item.originalName || ""),
    fileName: String(item.fileName || ""),
    mimeType: String(item.mimeType || "application/pdf"),
    size: Number(item.size || 0),
    uploadedAt: item.uploadedAt || "",
    fileId: String(item.fileId || ""),
    fileUrl: String(item.fileUrl || ""),
    driveUrl: String(item.driveUrl || ""),
    indexFileId: String(item.indexFileId || ""),
    indexStatus: String(item.indexStatus || ""),
    indexUpdatedAt: item.indexUpdatedAt || "",
    chunksCount: Number(item.chunksCount || 0),
    pagesCount: Number(item.pagesCount || 0)
  };
}

function getManualRow_(id) {
  const sh = ensureManualsSheet_();
  const data = sh.getDataRange().getValues();
  const head = data.shift();
  const idx = head.indexOf("id");
  const key = String(id || "").trim();
  if (!key || idx < 0) return null;

  for (var i = 0; i < data.length; i++) {
    if (String(data[i][idx] || "").trim() === key) {
      return { row: i + 2, values: rowToObj_(head, data[i]), sheet: sh };
    }
  }

  return null;
}

function getManualIndexFileName_(manualId) {
  return String(manualId || "").trim() + ".json";
}

function getManualIndexMetadata_(values) {
  return {
    indexFileId: String(values && values.indexFileId || ""),
    indexStatus: String(values && values.indexStatus || ""),
    indexUpdatedAt: values && values.indexUpdatedAt || "",
    chunksCount: Number(values && values.chunksCount || 0),
    pagesCount: Number(values && values.pagesCount || 0)
  };
}

function buildIndexMetadataFromPayload_(index, indexFileId) {
  const payload = index || {};
  const chunks = Array.isArray(payload.chunks) ? payload.chunks.length : Number(payload.chunksCount || 0);
  const pages = Number(payload.pagesCount || (Array.isArray(payload.pages) ? payload.pages.length : 0));

  return {
    indexFileId: String(indexFileId || ""),
    indexStatus: String(payload.status || "indexed"),
    indexUpdatedAt: payload.updatedAt || new Date().toISOString(),
    chunksCount: chunks,
    pagesCount: pages
  };
}

function updateManualIndexMetadata_(found, metadata) {
  const next = metadata || {};
  setCell_(found.sheet, found.row, "indexFileId", String(next.indexFileId || ""));
  setCell_(found.sheet, found.row, "indexStatus", String(next.indexStatus || ""));
  setCell_(found.sheet, found.row, "indexUpdatedAt", next.indexUpdatedAt || "");
  setCell_(found.sheet, found.row, "chunksCount", String(next.chunksCount || 0));
  setCell_(found.sheet, found.row, "pagesCount", String(next.pagesCount || 0));
}

function findManualIndexFile_(found) {
  const folder = manualIndexFolder_();
  const fileId = String(found.values.indexFileId || "").trim();

  if (fileId) {
    try {
      return DriveApp.getFileById(fileId);
    } catch (e) {}
  }

  const it = folder.getFilesByName(getManualIndexFileName_(found.values.id));
  if (it.hasNext()) return it.next();
  return null;
}

function listManuals_() {
  const sh = ensureManualsSheet_();
  const data = sh.getDataRange().getValues();
  const head = data.shift();
  const items = data
    .filter(function(row) { return String(row[0] || "").trim(); })
    .map(function(row) { return manualPublicMeta_(rowToObj_(head, row)); })
    .sort(function(a, b) {
      return new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime();
    });

  return { ok: true, items: items };
}

function getManual_(id) {
  const found = getManualRow_(id);
  if (!found) return { ok: false, error: "manual_not_found" };

  return {
    ok: true,
    item: Object.assign(manualPublicMeta_(found.values), {
      fileId: String(found.values.fileId || ""),
      fileUrl: String(found.values.fileUrl || ""),
      driveUrl: String(found.values.driveUrl || "")
    })
  };
}

function indexStatusUpdate_(manualId, metadata) {
  const found = getManualRow_(manualId);
  if (!found) return { ok: false, error: "manual_not_found" };

  const merged = Object.assign({}, getManualIndexMetadata_(found.values), metadata || {});
  updateManualIndexMetadata_(found, merged);

  return {
    ok: true,
    manualId: String(manualId || "").trim(),
    metadata: getManualIndexMetadata_(merged)
  };
}

function indexSave_(manualId, index) {
  const found = getManualRow_(manualId);
  if (!found) return { ok: false, error: "manual_not_found" };
  if (!index) return { ok: false, error: "index_required" };

  const folder = manualIndexFolder_();
  const fileName = getManualIndexFileName_(manualId);
  const json = JSON.stringify(index, null, 2);
  const blob = Utilities.newBlob(json, "application/json", fileName);
  let file = findManualIndexFile_(found);

  if (file) {
    file.setContent(json);
    file.setName(fileName);
  } else {
    file = folder.createFile(blob);
    file.setName(fileName);
  }

  const metadata = buildIndexMetadataFromPayload_(index, file.getId());
  updateManualIndexMetadata_(found, metadata);

  return {
    ok: true,
    manualId: String(manualId || "").trim(),
    fileId: String(file.getId()),
    metadata: metadata
  };
}

function indexGet_(manualId) {
  const found = getManualRow_(manualId);
  if (!found) return { ok: false, error: "manual_not_found" };

  const metadata = getManualIndexMetadata_(found.values);
  const file = findManualIndexFile_(found);
  if (!file) {
    if (metadata.indexFileId || metadata.indexStatus || metadata.indexUpdatedAt || metadata.chunksCount || metadata.pagesCount) {
      updateManualIndexMetadata_(found, {});
    }
    return {
      ok: true,
      manualId: String(manualId || "").trim(),
      index: null,
      metadata: getManualIndexMetadata_({})
    };
  }

  let parsed = null;
  try {
    const raw = file.getBlob().getDataAsString("UTF-8");
    parsed = raw ? JSON.parse(raw) : null;
  } catch (e) {
    return { ok: false, error: "index_parse_failed" };
  }

  const nextMetadata = buildIndexMetadataFromPayload_(parsed || {}, file.getId());
  updateManualIndexMetadata_(found, nextMetadata);

  return {
    ok: true,
    manualId: String(manualId || "").trim(),
    index: parsed,
    metadata: nextMetadata
  };
}

function indexDelete_(manualId) {
  const found = getManualRow_(manualId);
  if (!found) return { ok: false, error: "manual_not_found" };

  const file = findManualIndexFile_(found);
  if (file) {
    try {
      file.setTrashed(true);
    } catch (e) {}
  }

  updateManualIndexMetadata_(found, {});
  return { ok: true, manualId: String(manualId || "").trim() };
}

function uploadManual_(manual) {
  const title = String(manual.title || manual.originalName || "Без названия").trim().slice(0, 160);
  const brand = String(manual.brand || "").trim().slice(0, 80);
  const model = String(manual.model || "").trim().slice(0, 80);
  const originalName = String(manual.originalName || (title || "manual") + ".pdf").trim().slice(0, 180);
  const mimeType = String(manual.mimeType || "application/pdf").trim();
  const dataUrl = String(manual.data || "").trim();

  if (mimeType !== "application/pdf") return { ok: false, error: "invalid_mime_type" };

  const match = dataUrl.match(/^data:application\/pdf;base64,(.+)$/);
  if (!match) return { ok: false, error: "invalid_payload" };

  const bytes = Utilities.base64Decode(match[1]);
  if (!bytes || !bytes.length || bytes.length > 20 * 1024 * 1024) {
    return { ok: false, error: "invalid_size" };
  }

  const signature = bytes.slice(0, 4).map(function(b) { return String.fromCharCode(b); }).join("");
  if (signature !== "%PDF") return { ok: false, error: "invalid_pdf" };

  const id = Utilities.getUuid();
  const cleanBase = safeId_(originalName.replace(/\.pdf$/i, "") || title || "manual");
  const fileName = id + "-" + cleanBase + ".pdf";
  const blob = Utilities.newBlob(bytes, "application/pdf", fileName);
  const folder = manualsFolder_();
  const file = folder.createFile(blob);
  file.setName(fileName);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const item = {
    id: id,
    title: title,
    brand: brand,
    model: model,
    originalName: originalName,
    fileName: fileName,
    mimeType: "application/pdf",
    size: String(bytes.length),
    uploadedAt: new Date().toISOString(),
    fileId: String(file.getId()),
    fileUrl: String(file.getUrl()),
    driveUrl: "https://drive.google.com/uc?export=download&id=" + encodeURIComponent(file.getId())
  };

  const sh = ensureManualsSheet_();
  sh.appendRow([
    item.id,
    item.title,
    item.brand,
    item.model,
    item.originalName,
    item.fileName,
    item.mimeType,
    item.size,
    item.uploadedAt,
    item.fileId,
    item.fileUrl,
    item.driveUrl,
    "",
    "",
    "",
    "0",
    "0"
  ]);

  return { ok: true, item: manualPublicMeta_(item) };
}

function deleteManual_(id) {
  const found = getManualRow_(id);
  if (!found) return { ok: false, error: "manual_not_found" };

  try {
    indexDelete_(id);
  } catch (e) {}

  const fileId = String(found.values.fileId || "").trim();
  if (fileId) {
    try {
      DriveApp.getFileById(fileId).setTrashed(true);
    } catch (e) {}
  }

  found.sheet.deleteRow(found.row);
  return { ok: true, id: String(id || "").trim() };
}

function deletePhoto_(id, fileId) {
  const equipId = String(id || "").trim();
  const targetFileId = String(fileId || "").trim();
  if (!equipId) return { ok: false, error: "No id" };
  if (!targetFileId) return { ok: false, error: "No fileId" };

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = getSheetAny_(ss, SH_PHOTOS);
  const data = sh.getDataRange().getValues();
  const head = data.shift();

  const idxId = head.indexOf("equipmentId");
  const idxFile = head.indexOf("fileId");
  if (idxId < 0 || idxFile < 0) return { ok: false, error: "PHOTOS_COLUMNS_MISSING" };

  const key = normKey_(equipId);
  let rowToDelete = -1;

  for (let i = data.length - 1; i >= 0; i--) {
    const row = data[i];
    if (normKey_(row[idxId]) === key && String(row[idxFile] || "").trim() === targetFileId) {
      rowToDelete = i + 2;
      break;
    }
  }

  if (rowToDelete < 2) return { ok: false, error: "photo_not_found" };

  try {
    DriveApp.getFileById(targetFileId).setTrashed(true);
  } catch (e) {}

  sh.deleteRow(rowToDelete);
  return { ok: true, id: equipId, fileId: targetFileId };
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

// =========================
// SEARCH
// =========================
function normalizeSearchText_(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^0-9a-zа-яёіїєґ]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function searchEquipment_(query, limit) {
  const normalizedQuery = normalizeSearchText_(query);
  if (!normalizedQuery) return { ok: true, results: [] };

  const safeLimit = Math.max(1, Math.min(Number(limit || 20), 100));
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = getSheetAny_(ss, SH_EQUIPMENT);
  const data = sh.getDataRange().getValues();
  const head = data.shift();
  const results = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    const eq = rowToObj_(head, row);
    const haystack = normalizeSearchText_([
      stripTextPrefix_(eq.id),
      stripTextPrefix_(eq.clientName),
      stripTextPrefix_(eq.clientLocation),
      stripTextPrefix_(eq.companyLocation),
      stripTextPrefix_(eq.name),
      stripTextPrefix_(eq.model),
      stripTextPrefix_(eq.serial),
      stripTextPrefix_(eq.internalNumber)
    ].join(" "));

    if (!haystack.includes(normalizedQuery)) continue;

    results.push({
      id: stripTextPrefix_(eq.id),
      owner: eq.owner || "",
      type: eq.type || "",
      status: eq.status || "",
      clientName: stripTextPrefix_(eq.clientName),
      clientLocation: stripTextPrefix_(eq.clientLocation),
      companyLocation: stripTextPrefix_(eq.companyLocation),
      name: stripTextPrefix_(eq.name),
      model: stripTextPrefix_(eq.model),
      serial: stripTextPrefix_(eq.serial),
      internalNumber: stripTextPrefix_(eq.internalNumber)
    });

    if (results.length >= safeLimit) break;
  }

  return { ok: true, results };
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
// =========================
// JSON response
// =========================
function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// =========================
// Telegram subscriptions (Google Sheets)
// =========================
function subscribeEquipment_(payload) {
  const equipmentId = String(payload.id || "").trim();
  const chatId = String(payload.chatId || "").trim();
  if (!equipmentId || !chatId) return { ok: false, error: "missing_fields" };

  const sheet = getOrCreateSubscriptionsSheet_();
  const data = sheet.getDataRange().getValues();
  const headers = data[0] || [];
  const idx = buildSubscriptionsIndex_(headers);
  setSubscriptionsTextFormat_(sheet);

  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[idx.equipmentId] || "") === equipmentId && String(row[idx.chatId] || "") === chatId) {
      rowIndex = i + 1;
      break;
    }
  }

  const user = payload.user || {};
  const values = [
    String(equipmentId),
    String(chatId),
    String(user.id || ""),
    String(user.username || ""),
    String(user.firstName || ""),
    String(user.lastName || ""),
    new Date(),
  ];

  const alreadySubscribed = rowIndex !== -1;

  if (!alreadySubscribed) {
    const nextRow = sheet.getLastRow() + 1;
    sheet.getRange(nextRow, 1, 1, values.length).setValues([values]);
  } else {
    sheet.getRange(rowIndex, 1, 1, values.length).setValues([values]);
  }

  return { ok: true, alreadySubscribed };
}

function unsubscribeEquipment_(payload) {
  const equipmentId = String(payload.id || "").trim();
  const chatId = String(payload.chatId || "").trim();
  if (!equipmentId || !chatId) return { ok: false, error: "missing_fields" };

  const sheet = getOrCreateSubscriptionsSheet_();
  const data = sheet.getDataRange().getValues();
  const headers = data[0] || [];
  const idx = buildSubscriptionsIndex_(headers);

  for (let i = data.length - 1; i >= 1; i--) {
    const row = data[i];
    if (String(row[idx.equipmentId] || "") === equipmentId && String(row[idx.chatId] || "") === chatId) {
      sheet.deleteRow(i + 1);
    }
  }

  return { ok: true };
}

function getEquipmentSubscribers_(payload) {
  const equipmentId = String(payload.id || "").trim();
  if (!equipmentId) return { ok: false, error: "missing_fields" };

  const sheet = getOrCreateSubscriptionsSheet_();
  const data = sheet.getDataRange().getValues();
  const headers = data[0] || [];
  const idx = buildSubscriptionsIndex_(headers);

  const subscribers = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[idx.equipmentId] || "") === equipmentId) {
      const chatId = String(row[idx.chatId] || "").trim();
      if (chatId) subscribers.push(chatId);
    }
  }

  return { ok: true, subscribers };
}

function getSubscriptionByChat_(payload) {
  const chatId = String(payload.chatId || "").trim();
  if (!chatId) return { ok: false, error: "missing_fields" };

  const sheet = getOrCreateSubscriptionsSheet_();
  const data = sheet.getDataRange().getValues();
  const headers = data[0] || [];
  const idx = buildSubscriptionsIndex_(headers);
  const idxSubscribedAt = headers.indexOf("subscribedAt");

  let latest = null;
  let latestTs = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[idx.chatId] || "") === chatId) {
      const ts = idxSubscribedAt > -1 ? new Date(row[idxSubscribedAt]).getTime() : 0;
      if (!latest || ts >= latestTs) {
        latest = row;
        latestTs = ts;
      }
    }
  }

  return { ok: true, equipmentId: latest ? String(latest[idx.equipmentId] || "").trim() : "" };
}

function getStatusHistory_(payload) {
  const equipmentId = String(payload.id || "").trim();
  const limit = Math.max(1, Number(payload.limit || 5));
  if (!equipmentId) return { ok: false, error: "missing_fields" };
  const items = getStatusLogById_(equipmentId).slice(0, limit);
  return { ok: true, items };
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

function getOrCreateSubscriptionsSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SUBSCRIPTIONS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SUBSCRIPTIONS_SHEET);
    sheet.appendRow([
      "equipmentId",
      "chatId",
      "userId",
      "username",
      "firstName",
      "lastName",
      "subscribedAt",
    ]);
  }
  setSubscriptionsTextFormat_(sheet);
  return sheet;
}

function buildSubscriptionsIndex_(headers) {
  const normalized = headers.map((h) => String(h || "").trim());
  const idx = {
    equipmentId: normalized.indexOf("equipmentId"),
    chatId: normalized.indexOf("chatId"),
  };
  if (idx.equipmentId === -1 || idx.chatId === -1) {
    throw new Error("subscriptions sheet has invalid headers");
  }
  return idx;
}

function setSubscriptionsTextFormat_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] || [];
  SUBSCRIPTIONS_TEXT_COLS.forEach((name) => {
    const colIndex = headers.indexOf(name);
    if (colIndex > -1) {
      sheet.getRange(2, colIndex + 1, sheet.getMaxRows() - 1, 1).setNumberFormat("@");
    }
  });
}
