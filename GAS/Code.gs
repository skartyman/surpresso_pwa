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
const SH_PHOTOS    = "PHOTOS";
const SH_MANUALS   = "MANUALS";
const SH_WAREHOUSE_TEMPLATES = "WAREHOUSE_TEMPLATES";
const SH_SPARE_REQUESTS = "SPARE_REQUESTS";
const SH_SPARE_REQUEST_ITEMS = "SPARE_REQUEST_ITEMS";
const SH_SPARE_RETURNS = "SPARE_RETURNS";
const SH_SPARE_RETURN_ITEMS = "SPARE_RETURN_ITEMS";
const SH_MASTER_STOCK = "MASTER_STOCK";
const MASTER_STOCK_COLUMNS = ["id", "masterLogin", "masterName", "requestId", "partCode", "partName", "cell", "unit", "quantityIssued", "quantityAvailable", "issuedAt", "status"];
const PARTS_CATALOG_SHEET_ID = "1kHTj9-Hh5ZjR1iHKXEiAxKx6XSsd_RE2SDJq9eBqRZ8";
const PARTS_CATALOG_GID = 1099059228;
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
const EQUIPMENT_SHEET_COLUMNS = [
  "id", "createdAt", "updatedAt",
  "type", "owner", "isContract",
  "clientName", "clientPhone", "clientLocation",
  "model", "serial",
  "companyLocation", "name", "internalNumber",
  "status", "lastComment",
  "folderId", "folderUrl",
  "passportPdfId", "passportPdfUrl", "specs"
];

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
  sh.appendRow(EQUIPMENT_SHEET_COLUMNS);

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
    if (!action && isWarehouseTemplatePayload_(data)) {
      return json_(saveWarehouseTemplate_(data));
    }
    if (action === "templatesList") {
      return json_(listWarehouseTemplates_(data));
    }
    if (action === "update" && isWarehouseTemplatePayload_(data)) {
      return json_(saveWarehouseTemplate_(data));
    }
    if (action === "delete" && isWarehouseTemplateDeletePayload_(data)) {
      return json_(deleteWarehouseTemplate_(data));
    }

    if (action === "createOnly") return json_(createOnly_(data.card || {}));
    if (action === "create")  return json_(upsertEquipment_(data.card || {}));
    if (action === "get")     return json_(getBundle_(data.id));
    if (action === "search")  return json_(searchEquipment_(data.query, data.limit));
    if (action === "status")  return json_(setStatus_(data.id, data.newStatus, data.comment || "", data.actor || "", data.location || ""));
    if (action === "photo")   return json_(addPhoto_(data.id, data.base64, data.caption || ""));
    if (action === "serviceRequestMediaUpload") return json_(uploadServiceRequestMedia_(data));
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

    // ===== Spare requests =====
    if (action === "spareRequestCreate") return json_(spareRequestCreate_(data));
    if (action === "spareRequestAddItem") return json_(spareRequestAddItem_(data));
    if (action === "spareRequestList") return json_(spareRequestList_(data));
    if (action === "spareRequestGet") return json_(spareRequestGet_(data.id));
    if (action === "spareRequestIssue") return json_(spareRequestIssue_(data));
    if (action === "spareReturnCreate") return json_(spareReturnCreate_(data));
    if (action === "spareRequestReturn") return json_(spareRequestReturn_(data));
    if (action === "spareRequestCancelIssued") return json_(spareRequestCancelIssued_(data));

    // ===== Master stock =====
    if (action === "masterStockList") return json_(masterStockList_(data));
    if (action === "masterStockDeduct") return json_(masterStockDeduct_(data));
    if (action === "masterStockReturn") return json_(masterStockReturn_(data));

    return json_({ ok: false, error: "Unknown action" });

  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function isWarehouseTemplatePayload_(data) {
  if (!data || typeof data !== "object") return false;
  const hasTemplateFields =
    !!String(data.id || "").trim() ||
    !!String(data.name || "").trim() ||
    !!String(data.machine || "").trim() ||
    !!String(data.node || "").trim() ||
    Array.isArray(data.items);

  return hasTemplateFields;
}

function isWarehouseTemplateDeletePayload_(data) {
  if (!data || typeof data !== "object") return false;
  return !!String(data.id || "").trim();
}

function saveWarehouseTemplate_(payload) {
  const templateId = String(payload.id || "").trim();
  if (!templateId) return { ok: false, error: "TEMPLATE_ID_REQUIRED" };

  const sheet = getOrCreateWarehouseTemplatesSheet_();
  const found = findWarehouseTemplateRowById_(sheet, templateId);
  const existing = found ? found.values : null;
  const nowIso = new Date().toISOString();
  const items = Array.isArray(payload.items) ? payload.items : [];
  const rowValues = [[
    templateId,
    String(payload.name || "").trim(),
    String(payload.machine || "").trim(),
    String(payload.node || "").trim(),
    String(payload.createdBy || (existing && existing.createdBy) || "").trim(),
    String(payload.createdAt || (existing && existing.createdAt) || nowIso).trim(),
    JSON.stringify(items),
    nowIso
  ]];

  if (found) {
    sheet.getRange(found.row, 1, 1, 8).setValues(rowValues);
    return { ok: true, id: templateId, action: "updated" };
  }

  sheet.appendRow(rowValues[0]);
  return { ok: true, id: templateId, action: "created" };
}

function deleteWarehouseTemplate_(payload) {
  const templateId = String(payload.id || "").trim();
  if (!templateId) return { ok: false, error: "TEMPLATE_ID_REQUIRED" };

  const sheet = getOrCreateWarehouseTemplatesSheet_();
  const found = findWarehouseTemplateRowById_(sheet, templateId);
  if (found) {
    sheet.deleteRow(found.row);
  }
  return { ok: true, id: templateId, action: "deleted" };
}

function listWarehouseTemplates_(payload) {
  const sheet = getOrCreateWarehouseTemplatesSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { ok: true, items: [] };

  const rows = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  const items = rows
    .map(function(row) {
      let parsedItems = [];
      try {
        const parsed = JSON.parse(String(row[6] || "[]"));
        parsedItems = Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        parsedItems = [];
      }

      return {
        id: String(row[0] || "").trim(),
        name: String(row[1] || "").trim(),
        machine: String(row[2] || "").trim(),
        node: String(row[3] || "").trim(),
        createdBy: String(row[4] || "").trim(),
        createdAt: String(row[5] || "").trim(),
        items: parsedItems,
        updatedAt: String(row[7] || "").trim()
      };
    })
    .filter(function(item) { return !!item.id; })
    .sort(function(a, b) {
      const aUpdated = Date.parse(a.updatedAt || "") || 0;
      const bUpdated = Date.parse(b.updatedAt || "") || 0;
      if (bUpdated !== aUpdated) return bUpdated - aUpdated;
      const aCreated = Date.parse(a.createdAt || "") || 0;
      const bCreated = Date.parse(b.createdAt || "") || 0;
      return bCreated - aCreated;
    });

  return { ok: true, items: items };
}

function getOrCreateWarehouseTemplatesSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(SH_WAREHOUSE_TEMPLATES);
  if (!sh) {
    sh = ss.insertSheet(SH_WAREHOUSE_TEMPLATES);
    sh.appendRow(["id", "name", "machine", "node", "createdBy", "createdAt", "itemsJson", "updatedAt"]);
  } else if (sh.getLastRow() < 1) {
    sh.appendRow(["id", "name", "machine", "node", "createdBy", "createdAt", "itemsJson", "updatedAt"]);
  } else {
    ensureSheetColumns_(sh, ["id", "name", "machine", "node", "createdBy", "createdAt", "itemsJson", "updatedAt"]);
  }

  [ "id", "createdAt", "updatedAt" ].forEach(function(name) {
    const c = col_(sh, name);
    sh.getRange(2, c, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat("@");
  });
  return sh;
}

function findWarehouseTemplateRowById_(sheet, templateId) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return null;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const target = String(templateId || "").trim();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0] || "").trim() === target) {
      const rowValues = sheet.getRange(i + 2, 1, 1, 8).getValues()[0];
      return {
        row: i + 2,
        values: {
          id: String(rowValues[0] || "").trim(),
          name: String(rowValues[1] || "").trim(),
          machine: String(rowValues[2] || "").trim(),
          node: String(rowValues[3] || "").trim(),
          createdBy: String(rowValues[4] || "").trim(),
          createdAt: String(rowValues[5] || "").trim(),
          itemsJson: String(rowValues[6] || ""),
          updatedAt: String(rowValues[7] || "").trim()
        }
      };
    }
  }
  return null;
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
  ensureSheetColumns_(sh, EQUIPMENT_SHEET_COLUMNS);

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
      "", "", card.specs || ""
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

  const photosResult = getPhotosByIdDetailed_(id);

  return {
    ok: true,
    equipment: eq,
    photos: photosResult.items,
    photosDebug: photosResult.debug,
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

  // ✅ Пишем лог в PHOTOS
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = getSheetAny_(ss, SH_PHOTOS);
  if (!sh) return { ok: true, fileId, fileUrl, imgUrl, warning: "PHOTOS_SHEET_NOT_FOUND" };

  const head = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  const colEquip = head.findIndex(h => normHeader_(h) === "equipmentid") + 1;
  const colFile  = head.findIndex(h => normHeader_(h) === "fileid") + 1;

  // 1) добавили строку
  // Если мы знаем колонки, лучше писать точно в них. 
  // Но для простоты appendRow + setValue для ключевых полей тоже ок.
  sh.appendRow([new Date(), equipId, fileId, fileUrl, imgUrl, caption || ""]);
  const lastRow = sh.getLastRow();

  if (colEquip > 0) {
    const r = sh.getRange(lastRow, colEquip);
    r.setNumberFormat("@");
    r.setValue(equipId);
  }
  if (colFile > 0) {
    const r = sh.getRange(lastRow, colFile);
    r.setNumberFormat("@");
    r.setValue(fileId);
  }

  return { ok: true, fileId, fileUrl, imgUrl };
}

function normHeader_(h) {
  return String(h || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}


function parseBase64Payload_(rawBase64, fallbackMimeType) {
  const source = String(rawBase64 || '').trim();
  const dataUrlMatch = source.match(/^data:([^;]+);base64,(.+)$/i);

  if (dataUrlMatch) {
    return {
      mimeType: dataUrlMatch[1] || fallbackMimeType || 'application/octet-stream',
      base64: dataUrlMatch[2],
    };
  }

  return {
    mimeType: fallbackMimeType || 'application/octet-stream',
    base64: source,
  };
}

function detectServiceRequestMediaType_(mimeType) {
  return String(mimeType || '').toLowerCase().indexOf('video') === 0 ? 'video' : 'image';
}

function ensureServiceRequestFolder_(entityId) {
  const root = DriveApp.getFolderById(DRIVE_ROOT_FOLDER_ID);
  const serviceRootName = 'service_requests';

  let serviceRoot = null;
  const rootIt = root.getFoldersByName(serviceRootName);
  if (rootIt.hasNext()) {
    serviceRoot = rootIt.next();
  } else {
    serviceRoot = root.createFolder(serviceRootName);
  }

  const folderName = safeId_(String(entityId || 'unknown'));
  const folderIt = serviceRoot.getFoldersByName(folderName);
  if (folderIt.hasNext()) {
    return folderIt.next();
  }

  return serviceRoot.createFolder(folderName);
}

function uploadServiceRequestMedia_(payload) {
  const entityType = String(payload.entityType || '').trim();
  const entityId = String(payload.entityId || '').trim();
  const base64 = payload.base64;
  const originalName = String(payload.originalName || '').trim();

  if (entityType !== 'service_request') return { ok: false, error: 'invalid_entity_type' };
  if (!entityId) return { ok: false, error: 'entity_id_required' };
  if (!base64) return { ok: false, error: 'base64_required' };

  const parsed = parseBase64Payload_(base64, String(payload.mimeType || '').trim());
  if (!parsed.base64) return { ok: false, error: 'base64_required' };

  const bytes = Utilities.base64Decode(parsed.base64);
  const mimeType = parsed.mimeType || 'application/octet-stream';
  const ext = (mimeType.split('/')[1] || 'bin').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'bin';
  const safeName = safeId_(originalName || `service_request_${entityId}_${Date.now()}.${ext}`);

  const folder = ensureServiceRequestFolder_(entityId);
  const blob = Utilities.newBlob(bytes, mimeType, safeName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const fileId = String(file.getId());
  const fileUrl = String(file.getUrl());
  const mediaType = detectServiceRequestMediaType_(mimeType);
  const imgUrl = mediaType === 'image' ? driveImgUrl_(fileId) : '';

  return {
    ok: true,
    fileId,
    fileUrl,
    imgUrl,
  };
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

  const idxId = head.findIndex(h => normHeader_(h) === "equipmentid");
  const idxFile = head.findIndex(h => normHeader_(h) === "fileid");
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
  return getPhotosByIdDetailed_(id).items;
}

function getPhotosByIdDetailed_(id) {
  const fallback = getPhotosFromDriveFolder_(id);

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = resolvePhotosSheet_(ss);
  if (!sh) {
    return {
      items: fallback,
      debug: {
        sheetName: "",
        sheetId: null,
        totalRows: 0,
        matchedRows: 0,
        usedFallback: true,
        reason: "no_sheet"
      }
    };
  }

  const data = sh.getDataRange().getValues();
  if (data.length < 2) {
    return {
      items: fallback,
      debug: {
        sheetName: sh.getName(),
        sheetId: sh.getSheetId(),
        totalRows: Math.max(0, data.length - 1),
        matchedRows: 0,
        usedFallback: true,
        reason: "too_few_rows"
      }
    };
  }
  const head = data.shift();

  // Гибкий поиск колонок
  const colMap = {};
  head.forEach((h, i) => {
    colMap[normHeader_(h)] = i;
  });

  let idxId   = colMap["equipmentid"];
  let idxFile = colMap["fileid"];
  let idxUrl  = colMap["fileurl"];
  let idxImg  = colMap["imgurl"];
  let idxCap  = colMap["caption"];
  let idxTs   = colMap["ts"];
  let rows = data;

  // Legacy fallback: sheet without header row, fixed columns:
  // [ts, equipmentId, fileId, fileUrl, imgUrl, caption]
  let usedLegacyColumns = false;
  if (idxId === undefined) {
    idxTs = 0;
    idxId = 1;
    idxFile = 2;
    idxUrl = 3;
    idxImg = 4;
    idxCap = 5;
    rows = [head].concat(data);
    usedLegacyColumns = true;
  }

  const searchKey = normKey_(id);

  const fromSheet = rows
    .filter(row => {
      const val = row[idxId];
      if (val === undefined || val === null || val === "") return false;
      return normKey_(val) === searchKey;
    })
    .map(r => ({
      ts: idxTs !== undefined ? r[idxTs] : null,
      url: idxUrl !== undefined ? String(r[idxUrl] || "") : "",
      fileId: idxFile !== undefined ? String(r[idxFile] || "") : "",
      imgUrl: idxImg !== undefined ? String(r[idxImg] || "") : "",
      caption: idxCap !== undefined ? String(r[idxCap] || "") : ""
    }))
    .reverse();

  const usedFallback = fromSheet.length === 0;
  return {
    items: usedFallback ? fallback : fromSheet,
    debug: {
      sheetName: sh.getName(),
      sheetId: sh.getSheetId(),
      totalRows: rows.length,
      matchedRows: fromSheet.length,
      usedFallback: usedFallback,
      fallbackCount: fallback.length,
      usedLegacyColumns: usedLegacyColumns
    }
  };
}

function resolvePhotosSheet_(ss) {
  // 1) Prefer configured sheet name/id only if it actually looks like a photos sheet
  try {
    const preferred = getSheetAny_(ss, SH_PHOTOS);
    if (preferred && sheetLooksLikePhotos_(preferred)) return preferred;
  } catch (e) {}

  // 2) Fallback: detect by header columns on first row
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    const sh = sheets[i];
    if (sheetLooksLikePhotos_(sh)) return sh;
  }

  return null;
}

function sheetLooksLikePhotos_(sh) {
  if (!sh) return false;
  const lastCol = sh.getLastColumn();
  const lastRow = sh.getLastRow();
  if (lastCol < 2 || lastRow < 1) return false;

  const sampleRows = Math.min(lastRow, 6);
  const sampleCols = Math.min(lastCol, 12);
  const values = sh.getRange(1, 1, sampleRows, sampleCols).getValues();

  const headerLike = values[0].map(normHeader_);
  const hasHeaderColumns = headerLike.indexOf("equipmentid") >= 0
    && headerLike.indexOf("fileid") >= 0
    && (headerLike.indexOf("fileurl") >= 0 || headerLike.indexOf("imgurl") >= 0);
  if (hasHeaderColumns) return true;

  for (let r = 0; r < values.length; r++) {
    const row = values[r];
    const eq = String(row[1] || "").trim();
    const fileId = String(row[2] || "").trim();
    const fileUrl = String(row[3] || "").trim();
    const imgUrl = String(row[4] || "").trim();
    if (eq && fileId && (fileUrl || imgUrl)) return true;
  }

  return false;
}

function getPhotosFromDriveFolder_(id) {
  const eq = getEquipmentById_(id);
  if (!eq) return [];

  const folderId = String(eq.folderId || "").trim();
  let folder = null;
  if (folderId) {
    try {
      folder = DriveApp.getFolderById(folderId);
    } catch (e) {
      folder = null;
    }
  }

  let items = folder ? collectImageLikeFilesFromFolder_(folder) : [];
  if (items.length) return items;

  // fallback: folderId may be stale, search by folder name under the root
  try {
    const root = DriveApp.getFolderById(DRIVE_ROOT_FOLDER_ID);
    const it = root.getFoldersByName(safeId_(String(id || "").trim()));
    if (it.hasNext()) {
      const namedFolder = it.next();
      items = collectImageLikeFilesFromFolder_(namedFolder);
      if (items.length) return items;
    }
  } catch (e) {}

  return [];
}

function collectImageLikeFilesFromFolder_(folder) {
  const items = [];
  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    const mime = String(file.getMimeType() || "");
    const name = String(file.getName() || "");
    const ext = name.split(".").pop().toLowerCase();
    const byMime = mime.startsWith("image/");
    const byExt = ["jpg", "jpeg", "png", "webp", "heic", "heif"].indexOf(ext) >= 0;
    if (!byMime && !byExt) continue;

    const fileId = String(file.getId() || "");
    items.push({
      ts: file.getDateCreated(),
      url: String(file.getUrl() || ""),
      fileId: fileId,
      imgUrl: driveImgUrl_(fileId),
      caption: name
    });
  }

  items.sort((a, b) => {
    const aTs = a.ts ? new Date(a.ts).getTime() : 0;
    const bTs = b.ts ? new Date(b.ts).getTime() : 0;
    return bTs - aTs;
  });

  return items;
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
  Logger.log(`getPhotosById: searching for key="${key}" (original id="${id}")`);

  return data
    .filter(r => {
      const rowKey = normKey_(r[idxId]);
      return rowKey === key;
    })
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

function appendObjectRowByHeaders_(sheet, data) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const row = headers.map(function(name) {
    return Object.prototype.hasOwnProperty.call(data, name) ? data[name] : "";
  });
  sheet.appendRow(row);
  return sheet.getLastRow();
}

function setTextColumnValue_(sheet, rowNumber, colName, value) {
  const c = col_(sheet, colName);
  sheet.getRange(rowNumber, c).setNumberFormat("@");
  sheet.getRange(rowNumber, c).setValue(String(value ?? "").trim());
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
  let s = String(v || "").trim();
  if (s.startsWith("'")) s = s.slice(1);

  return s.toUpperCase()
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

function debugPhotosFB5965_() {
  return getPhotosByIdDetailed_("FB5965");
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

// =========================
// SPARE REQUESTS
// =========================
const SPARE_REQUEST_COLUMNS = [
  "id", "masterLogin", "masterName", "equipmentId", "status",
  "createdAt", "processedAt", "adminName", "comment"
];
const SPARE_REQUEST_ITEMS_COLUMNS = [
  "id", "requestId", "partCode", "partName", "cell", "unit",
  "quantityRequested", "quantityIssued"
];
const SPARE_RETURN_COLUMNS = [
  "id", "sourceRequestId", "masterLogin", "masterName", "equipmentId",
  "status", "createdAt", "processedAt", "adminName", "comment", "mode"
];
const SPARE_RETURN_ITEMS_COLUMNS = [
  "id", "returnId", "sourceRequestId", "partCode", "partName", "cell", "unit",
  "quantityReturned"
];
const SPARE_REQUEST_STATUSES = ["pending", "processing", "issued", "returned", "cancelled"];

function getOrCreateMasterStockSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SH_MASTER_STOCK);
  if (!sheet) {
    sheet = ss.insertSheet(SH_MASTER_STOCK);
    sheet.appendRow(MASTER_STOCK_COLUMNS);
  }
  ["id", "masterLogin", "requestId", "partCode", "cell"].forEach(function(name) {
    try {
      const c = col_(sheet, name);
      sheet.getRange(2, c, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("@");
    } catch (e) {}
  });
  return sheet;
}

function masterStockList_(data) {
  const masterLogin = String(data.masterLogin || "").trim();
  if (!masterLogin) return { ok: false, error: "no_masterLogin" };

  const sheet = getOrCreateMasterStockSheet_();
  const range = sheet.getDataRange();
  const values = range.getValues();
  const displays = range.getDisplayValues();
  if (values.length < 2) return { ok: true, items: [] };

  const headers = values[0] || [];
  const idx = {};
  MASTER_STOCK_COLUMNS.forEach(function(col) {
    idx[col] = headers.indexOf(col);
  });

  // Build lookup for request equipmentId and comment
  const reqSheet = getOrCreateSpareRequestsSheet_();
  const reqData = reqSheet.getDataRange().getValues();
  const reqHeaders = reqData[0] || [];
  const ridx_id = reqHeaders.indexOf("id");
  const ridx_equip = reqHeaders.indexOf("equipmentId");
  const ridx_comment = reqHeaders.indexOf("comment");
  const reqLookup = {};
  for (let r = 1; r < reqData.length; r++) {
    const rId = String(reqData[r][ridx_id] || "").trim();
    if (rId) {
      reqLookup[rId] = {
        equipmentId: String(reqData[r][ridx_equip] || "").trim(),
        comment: String(reqData[r][ridx_comment] || "").trim()
      };
    }
  }

  const items = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const login = String(row[idx.masterLogin] || "").trim();
    const status = String(row[idx.status] || "").trim();
    if (login !== masterLogin) continue;
    if (status === "returned") continue;
    if (Number(row[idx.quantityAvailable] || 0) <= 0) continue;

    const rId = String(row[idx.requestId] || "").trim();
    const reqInfo = reqLookup[rId] || { equipmentId: "", comment: "" };

    items.push({
      id: String(row[idx.id] || "").trim(),
      masterLogin: login,
      masterName: String(row[idx.masterName] || "").trim(),
      requestId: rId,
      equipmentId: reqInfo.equipmentId,
      requestComment: reqInfo.comment,
      partCode: String(displays[i][idx.partCode] || row[idx.partCode] || "").trim(),
      partName: String(displays[i][idx.partName] || row[idx.partName] || "").trim(),
      cell: normalizeSpareCellDisplay_(row[idx.cell] || displays[i][idx.cell] || ""),
      unit: String(row[idx.unit] || "шт.").trim(),
      quantityIssued: Number(row[idx.quantityIssued] || 0),
      quantityAvailable: Number(row[idx.quantityAvailable] || 0),
      issuedAt: row[idx.issuedAt] || "",
      status: status || "active",
    });
  }

  return { ok: true, items };
}

function masterStockDeduct_(data) {
  const masterLogin = String(data.masterLogin || "").trim();
  const items = Array.isArray(data.items) ? data.items : [];
  if (!masterLogin) return { ok: false, error: "no_masterLogin" };
  if (!items.length) return { ok: false, error: "no_items" };

  const sheet = getOrCreateMasterStockSheet_();
  const range = sheet.getDataRange();
  const values = range.getValues();
  if (values.length < 2) return { ok: false, error: "empty" };

  const headers = values[0] || [];
  const idx = {
    masterLogin: headers.indexOf("masterLogin"),
    requestId: headers.indexOf("requestId"),
    partCode: headers.indexOf("partCode"),
    quantityAvailable: headers.indexOf("quantityAvailable"),
    status: headers.indexOf("status"),
  };

  const deductions = [];
  items.forEach(function(ded) {
    const reqId = String(ded.requestId || "").trim();
    const code = String(ded.partCode || "").trim();
    const qty = Number(ded.quantity || 0);
    if (reqId && code && qty > 0) {
      deductions.push({ requestId: reqId, partCode: code, quantity: qty });
    }
  });

  if (!deductions.length) return { ok: false, error: "no_valid_items" };

  // Build lookup: requestId+partCode -> total deduction
  const dedMap = {};
  deductions.forEach(function(d) {
    const key = d.requestId + "|||" + d.partCode;
    dedMap[key] = (dedMap[key] || 0) + d.quantity;
  });

  // Apply deductions row by row
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const login = String(row[idx.masterLogin] || "").trim();
    if (login !== masterLogin) continue;
    const code = String(row[idx.partCode] || "").trim();
    const reqId = String(row[idx.requestId] || "").trim();
    const key = reqId + "|||" + code;
    if (!dedMap[key]) continue;

    const currentAvail = Number(row[idx.quantityAvailable] || 0);
    const toDeduct = Math.min(currentAvail, dedMap[key]);
    if (toDeduct <= 0) continue;

    const newAvail = currentAvail - toDeduct;
    sheet.getRange(i + 1, idx.quantityAvailable + 1).setValue(newAvail);
    sheet.getRange(i + 1, idx.status + 1).setValue(newAvail <= 0 ? "returned" : "partial");

    dedMap[key] -= toDeduct;
  }

  SpreadsheetApp.flush();
  return { ok: true };
}

function masterStockReturn_(data) {
  const masterLogin = String(data.masterLogin || "").trim();
  const masterName = String(data.masterName || "").trim();
  const items = Array.isArray(data.items) ? data.items : [];
  if (!masterLogin) return { ok: false, error: "no_masterLogin" };
  if (!items.length) return { ok: false, error: "no_items" };

  // Deduct from master stock
  const dedResult = masterStockDeduct_(data);
  if (!dedResult.ok) return dedResult;

  // Create a return record
  const returnId = generateSpareReturnId_();
  const returnsSheet = getOrCreateSpareReturnsSheet_();
  const returnItem = {
    id: returnId,
    sourceRequestId: items[0] ? String(items[0].requestId || "").trim() : "",
    masterLogin: masterLogin,
    masterName: masterName,
    equipmentId: String(data.equipmentId || "").trim(),
    status: "returned",
    createdAt: new Date(),
    processedAt: new Date(),
    adminName: String(data.adminName || "").trim(),
    comment: String(data.comment || "Возврат со склада мастера").trim(),
    mode: "master_stock_return",
  };
  appendObjectRowByHeaders_(returnsSheet, returnItem);

  // Write return items
  const retItemsSheet = getOrCreateSpareReturnItemsSheet_();
  const returnItems = [];
  items.forEach(function(item) {
    const qty = Number(item.quantity || 0);
    if (qty <= 0) return;
    const retItem = {
      id: returnId + "-" + String(retItemsSheet.getLastRow()),
      returnId: returnId,
      sourceRequestId: String(item.requestId || "").trim(),
      partCode: String(item.partCode || "").trim(),
      partName: String(item.partName || "").trim(),
      cell: String(item.cell || "").trim(),
      unit: String(item.unit || "шт.").trim(),
      quantityReturned: qty,
    };
    appendObjectRowByHeaders_(retItemsSheet, retItem);
    returnItems.push({
      partCode: retItem.partCode,
      partName: retItem.partName,
      cell: retItem.cell,
      unit: retItem.unit,
      quantityReturned: qty,
    });
  });

  SpreadsheetApp.flush();
  return {
    ok: true,
    id: returnId,
    return: {
      id: returnId,
      sourceRequestId: returnItem.sourceRequestId,
      masterLogin: masterLogin,
      masterName: masterName,
      equipmentId: returnItem.equipmentId,
      status: "returned",
      createdAt: returnItem.createdAt,
      processedAt: returnItem.processedAt,
      adminName: returnItem.adminName,
      comment: returnItem.comment,
      mode: returnItem.mode,
      items: returnItems,
    }
  };
}

function getOrCreateSpareRequestsSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SH_SPARE_REQUESTS);
  if (!sheet) {
    sheet = ss.insertSheet(SH_SPARE_REQUESTS);
    sheet.appendRow(SPARE_REQUEST_COLUMNS);
  }
  ["id", "masterLogin"].forEach(function(name) {
    try {
      const c = col_(sheet, name);
      sheet.getRange(2, c, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("@");
    } catch (e) {}
  });
  return sheet;
}

function getOrCreateSpareRequestItemsSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SH_SPARE_REQUEST_ITEMS);
  if (!sheet) {
    sheet = ss.insertSheet(SH_SPARE_REQUEST_ITEMS);
    sheet.appendRow(SPARE_REQUEST_ITEMS_COLUMNS);
  }
  try {
    const c = col_(sheet, "cell");
    sheet.getRange(2, c, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("@");
  } catch (e) {}
  return sheet;
}

function getOrCreateSpareReturnsSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SH_SPARE_RETURNS);
  if (!sheet) {
    sheet = ss.insertSheet(SH_SPARE_RETURNS);
    sheet.appendRow(SPARE_RETURN_COLUMNS);
  }
  ["id", "sourceRequestId", "masterLogin"].forEach(function(name) {
    try {
      const c = col_(sheet, name);
      sheet.getRange(2, c, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("@");
    } catch (e) {}
  });
  return sheet;
}

function getOrCreateSpareReturnItemsSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SH_SPARE_RETURN_ITEMS);
  if (!sheet) {
    sheet = ss.insertSheet(SH_SPARE_RETURN_ITEMS);
    sheet.appendRow(SPARE_RETURN_ITEMS_COLUMNS);
  }
  try {
    const c = col_(sheet, "cell");
    sheet.getRange(2, c, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("@");
  } catch (e) {}
  return sheet;
}

let sparePartsCatalogCache_ = null;

function loadSparePartsCatalog_() {
  if (sparePartsCatalogCache_) return sparePartsCatalogCache_;

  try {
    const url = `https://docs.google.com/spreadsheets/d/${PARTS_CATALOG_SHEET_ID}/export?format=csv&gid=${PARTS_CATALOG_GID}&v=${Date.now()}`;
    const csv = UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText();
    const rows = Utilities.parseCsv(csv);
    const headers = rows.shift() || [];

    const idx = {
      code: headers.indexOf("code"),
      name: headers.indexOf("name"),
      cell: headers.indexOf("cell"),
      codeUa: headers.indexOf("Код"),
      nameUa: headers.indexOf("Наименование"),
      nameUa2: headers.indexOf("Номенклатура"),
      cellUa: headers.indexOf("Ячейка"),
      cellUa2: headers.indexOf("Комірка"),
    };

    const byCode = {};
    const byName = {};

    rows.forEach(function(row) {
      const code = String(row[idx.code >= 0 ? idx.code : idx.codeUa] || "").trim();
      const name = String(row[idx.name >= 0 ? idx.name : (idx.nameUa >= 0 ? idx.nameUa : idx.nameUa2)] || "").trim();
      const cell = String(row[idx.cell >= 0 ? idx.cell : (idx.cellUa >= 0 ? idx.cellUa : idx.cellUa2)] || "").trim();
      if (!cell) return;
      if (code) byCode[normKey_(code)] = cell;
      if (name) byName[normKey_(name)] = cell;
    });

    sparePartsCatalogCache_ = { byCode: byCode, byName: byName };
  } catch (e) {
    sparePartsCatalogCache_ = { byCode: {}, byName: {} };
  }

  return sparePartsCatalogCache_;
}

function isLikelyDateCell_(value) {
  const s = String(value || "").trim();
  return /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s/.test(s) ||
    /\bGMT\b/.test(s) ||
    /^(\d{1,2}[./-]\d{1,2})[./-]\d{4}$/.test(s) ||
    /\b\d{4}\b/.test(s) && /[A-Z][a-z]{2}\s[A-Z][a-z]{2}\s\d{2}/.test(s);
}

function normalizeSpareCellDisplay_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    if (value.getFullYear() === 2006) {
      return value.getDate() + "." + (value.getMonth() + 1) + ".2";
    }
    return value.getDate() + "." + (value.getMonth() + 1) + "." + String(value.getFullYear()).slice(-1);
  }
  const s = String(value || "").trim();
  const dateArtifact = s.match(/^(\d{1,2})[./-](\d{1,2})[./-]2006$/);
  if (dateArtifact) return Number(dateArtifact[1]) + "." + Number(dateArtifact[2]) + ".2";
  const datedCell = s.match(/^(\d{1,2})[./-](\d{1,2})[./-]200([1-9])$/);
  if (datedCell) return Number(datedCell[1]) + "." + Number(datedCell[2]) + "." + Number(datedCell[3]);
  const jsDate = s.match(/^(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{4}/i);
  if (jsDate) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return d.getDate() + "." + (d.getMonth() + 1) + "." + String(d.getFullYear()).slice(-1);
    }
  }
  return s;
}

function resolveSpareRequestCell_(item) {
  const rawCurrent = item && item.cell ? item.cell : "";
  const current = String(rawCurrent).trim();

  if (current) return normalizeSpareCellDisplay_(rawCurrent);

  const catalog = loadSparePartsCatalog_();
  const codeKey = normKey_(item && item.partCode ? item.partCode : "");
  if (codeKey && catalog.byCode[codeKey]) return normalizeSpareCellDisplay_(catalog.byCode[codeKey]);

  const nameKey = normKey_(item && item.partName ? item.partName : "");
  if (nameKey && catalog.byName[nameKey]) return normalizeSpareCellDisplay_(catalog.byName[nameKey]);

  return "";
}

function spareRequestCreate_(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const reqSheet = getOrCreateSpareRequestsSheet_();
  const itemsSheet = getOrCreateSpareRequestItemsSheet_();

  const masterLogin = String(data.masterLogin || "").trim();
  const masterName = String(data.masterName || "").trim();
  const equipmentId = String(data.equipmentId || "").trim();
  const comment = String(data.comment || "").trim();
  const items = Array.isArray(data.items) ? data.items : [];

  if (!masterLogin || !masterName) return { ok: false, error: "no_master" };
  if (!items.length) return { ok: false, error: "no_items" };

  // generate request ID
  const existingData = reqSheet.getDataRange().getValues();
  const reqCount = existingData.length; // minus header = number of existing requests
  const reqId = "SR-" + String(reqCount).padStart(4, "0");
  const now = new Date();

  const reqRow = appendObjectRowByHeaders_(reqSheet, {
    id: reqId,
    masterLogin: masterLogin,
    masterName: masterName,
    equipmentId: equipmentId,
    status: "pending",
    createdAt: now,
    processedAt: "",
    adminName: "",
    comment: comment,
  });
  setTextColumnValue_(reqSheet, reqRow, "id", reqId);
  setTextColumnValue_(reqSheet, reqRow, "masterLogin", masterLogin);

  // write items
  items.forEach(function(item, idx) {
    const itemId = reqId + "-" + String(idx + 1).padStart(3, "0");
    const partCode = String(item.partCode || "").trim();
    const partName = String(item.partName || "").trim();
    const cell = resolveSpareRequestCell_({
      partCode: partCode,
      partName: partName,
      cell: item.cell || "",
    });
    const itemRow = appendObjectRowByHeaders_(itemsSheet, {
      id: itemId,
      requestId: reqId,
      partCode: partCode,
      partName: partName,
      cell: cell,
      unit: String(item.unit || "шт.").trim(),
      quantityRequested: Number(item.quantityRequested || 1),
      quantityIssued: 0,
    });
    setTextColumnValue_(itemsSheet, itemRow, "id", itemId);
    setTextColumnValue_(itemsSheet, itemRow, "requestId", reqId);
    setTextColumnValue_(itemsSheet, itemRow, "partCode", partCode);
    setTextColumnValue_(itemsSheet, itemRow, "cell", cell);
  });

  return { ok: true, id: reqId };
}

function spareRequestAddItem_(data) {
  const id = String(data.id || "").trim();
  const partCode = String(data.partCode || "").trim();
  const partName = String(data.partName || "").trim();
  const cell = String(data.cell || "").trim();
  const unit = String(data.unit || "шт.").trim();
  const quantity = Number(data.quantity || 1);
  if (quantity < 1) return { ok: false, error: "invalid_quantity" };
  if (!partCode && !partName) return { ok: false, error: "no_part" };

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const reqSheet = getOrCreateSpareRequestsSheet_();
  const itemsSheet = getOrCreateSpareRequestItemsSheet_();

  // verify request exists
  const reqData = reqSheet.getDataRange().getValues();
  const reqHeaders = reqData[0] || [];
  const ridx_id = reqHeaders.indexOf("id");
  let requestExists = false;
  for (let i = 1; i < reqData.length; i++) {
    if (String(reqData[i][ridx_id] || "").trim() === id) {
      requestExists = true;
      break;
    }
  }
  if (!requestExists) return { ok: false, error: "request_not_found" };

  // count existing items for this request
  const itemRange = itemsSheet.getDataRange();
  const itemData = itemRange.getValues();
  const itemHeaders = itemData[0] || [];
  const iidx_requestId = itemHeaders.indexOf("requestId");
  let itemCount = 0;
  for (let i = 1; i < itemData.length; i++) {
    if (String(itemData[i][iidx_requestId] || "").trim() === id) {
      itemCount++;
    }
  }

  // generate new item ID
  const newItemNum = itemCount + 1;
  const itemId = id + "-" + String(newItemNum).padStart(3, "0");

  const resolvedCell = resolveSpareRequestCell_({
    partCode: partCode,
    partName: partName,
    cell: cell,
  });

  const itemRow = appendObjectRowByHeaders_(itemsSheet, {
    id: itemId,
    requestId: id,
    partCode: partCode,
    partName: partName,
    cell: resolvedCell,
    unit: unit,
    quantityRequested: quantity,
    quantityIssued: 0,
  });
  setTextColumnValue_(itemsSheet, itemRow, "id", itemId);
  setTextColumnValue_(itemsSheet, itemRow, "requestId", id);
  setTextColumnValue_(itemsSheet, itemRow, "partCode", partCode);
  setTextColumnValue_(itemsSheet, itemRow, "cell", resolvedCell);

  return { ok: true, itemId: itemId };
}

function spareRequestList_(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const reqSheet = getOrCreateSpareRequestsSheet_();
  const reqData = reqSheet.getDataRange().getValues();
  const headers = reqData[0] || [];
  const idx = {
    id: headers.indexOf("id"),
    masterLogin: headers.indexOf("masterLogin"),
    masterName: headers.indexOf("masterName"),
    equipmentId: headers.indexOf("equipmentId"),
    status: headers.indexOf("status"),
    createdAt: headers.indexOf("createdAt"),
    processedAt: headers.indexOf("processedAt"),
    adminName: headers.indexOf("adminName"),
    comment: headers.indexOf("comment"),
  };

  const statusFilter = String(data.status || "").trim();
  const requests = [];

  for (let i = 1; i < reqData.length; i++) {
    const row = reqData[i];
    const status = String(row[idx.status] || "").trim();
    if (statusFilter && status !== statusFilter) continue;
    requests.push({
      id: String(row[idx.id] || "").trim(),
      masterLogin: String(row[idx.masterLogin] || "").trim(),
      masterName: String(row[idx.masterName] || "").trim(),
      equipmentId: String(row[idx.equipmentId] || "").trim(),
      status: status,
      createdAt: row[idx.createdAt] || "",
      processedAt: row[idx.processedAt] || "",
      adminName: String(row[idx.adminName] || "").trim(),
      comment: String(row[idx.comment] || "").trim(),
    });
  }

  return { ok: true, requests: requests.reverse() };
}

function spareRequestGet_(id) {
  if (!id) return { ok: false, error: "no_id" };

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const reqSheet = getOrCreateSpareRequestsSheet_();
  const itemsSheet = getOrCreateSpareRequestItemsSheet_();

  // find request
  const reqData = reqSheet.getDataRange().getValues();
  const reqHeaders = reqData[0] || [];
  const ridx = {
    id: reqHeaders.indexOf("id"),
    masterLogin: reqHeaders.indexOf("masterLogin"),
    masterName: reqHeaders.indexOf("masterName"),
    equipmentId: reqHeaders.indexOf("equipmentId"),
    status: reqHeaders.indexOf("status"),
    createdAt: reqHeaders.indexOf("createdAt"),
    processedAt: reqHeaders.indexOf("processedAt"),
    adminName: reqHeaders.indexOf("adminName"),
    comment: reqHeaders.indexOf("comment"),
  };

  let request = null;
  for (let i = 1; i < reqData.length; i++) {
    if (String(reqData[i][ridx.id] || "").trim() === id) {
      request = {
        id: String(reqData[i][ridx.id] || "").trim(),
        masterLogin: String(reqData[i][ridx.masterLogin] || "").trim(),
        masterName: String(reqData[i][ridx.masterName] || "").trim(),
        equipmentId: String(reqData[i][ridx.equipmentId] || "").trim(),
        status: String(reqData[i][ridx.status] || "").trim(),
        createdAt: reqData[i][ridx.createdAt] || "",
        processedAt: reqData[i][ridx.processedAt] || "",
        adminName: String(reqData[i][ridx.adminName] || "").trim(),
        comment: String(reqData[i][ridx.comment] || "").trim(),
      };
      break;
    }
  }

  if (!request) return { ok: false, error: "not_found" };

  // find items
  const itemRange = itemsSheet.getDataRange();
  const itemData = itemRange.getValues();
  const itemDisplayData = itemRange.getDisplayValues();
  const itemHeaders = itemData[0] || [];
  const iidx = {
    requestId: itemHeaders.indexOf("requestId"),
    partCode: itemHeaders.indexOf("partCode"),
    partName: itemHeaders.indexOf("partName"),
    cell: itemHeaders.indexOf("cell"),
    unit: itemHeaders.indexOf("unit"),
    quantityRequested: itemHeaders.indexOf("quantityRequested"),
    quantityIssued: itemHeaders.indexOf("quantityIssued"),
  };

  const items = [];
  for (let i = 1; i < itemData.length; i++) {
    if (String(itemData[i][iidx.requestId] || "").trim() === id) {
      items.push({
        partCode: String(itemDisplayData[i][iidx.partCode] || itemData[i][iidx.partCode] || "").trim(),
        partName: String(itemDisplayData[i][iidx.partName] || itemData[i][iidx.partName] || "").trim(),
        cell: resolveSpareRequestCell_({
          partCode: itemDisplayData[i][iidx.partCode] || itemData[i][iidx.partCode] || "",
          partName: itemDisplayData[i][iidx.partName] || itemData[i][iidx.partName] || "",
          cell: itemDisplayData[i][iidx.cell] || itemData[i][iidx.cell] || "",
        }),
        unit: String(itemDisplayData[i][iidx.unit] || itemData[i][iidx.unit] || "шт.").trim(),
        quantityRequested: Number(itemData[i][iidx.quantityRequested] || 0),
        quantityIssued: Number(itemData[i][iidx.quantityIssued] || 0),
      });
    }
  }

  request.items = items;
  return { ok: true, request };
}

function spareRequestIssue_(data) {
  const id = String(data.id || "").trim();
  const adminName = String(data.adminName || "").trim();
  const items = Array.isArray(data.items) ? data.items : [];

  if (!id) return { ok: false, error: "no_id" };
  if (!adminName) return { ok: false, error: "no_admin" };

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const reqSheet = getOrCreateSpareRequestsSheet_();
  const itemsSheet = getOrCreateSpareRequestItemsSheet_();

  // update request status
  const reqData = reqSheet.getDataRange().getValues();
  const reqHeaders = reqData[0] || [];
  const ridx = {
    id: reqHeaders.indexOf("id"),
    status: reqHeaders.indexOf("status"),
    processedAt: reqHeaders.indexOf("processedAt"),
    adminName: reqHeaders.indexOf("adminName"),
    masterLogin: reqHeaders.indexOf("masterLogin"),
    masterName: reqHeaders.indexOf("masterName"),
  };

  let reqRow = -1;
  for (let i = 1; i < reqData.length; i++) {
    if (String(reqData[i][ridx.id] || "").trim() === id) {
      reqRow = i + 1;
      break;
    }
  }

  if (reqRow === -1) return { ok: false, error: "not_found" };

  reqSheet.getRange(reqRow, ridx.status + 1).setValue("issued");
  reqSheet.getRange(reqRow, ridx.processedAt + 1).setValue(new Date());
  reqSheet.getRange(reqRow, ridx.adminName + 1).setValue(adminName);

  // update item quantities
  const itemData = itemsSheet.getDataRange().getValues();
  const itemHeaders = itemData[0] || [];
  const iidx = {
    requestId: itemHeaders.indexOf("requestId"),
    partCode: itemHeaders.indexOf("partCode"),
    partName: itemHeaders.indexOf("partName"),
    cell: itemHeaders.indexOf("cell"),
    unit: itemHeaders.indexOf("unit"),
    quantityIssued: itemHeaders.indexOf("quantityIssued"),
  };

  // build map of issue updates by partCode
  const issueMap = {};
  items.forEach(function(item) {
    const code = String(item.partCode || "").trim();
    if (code) issueMap[code] = Number(item.quantityIssued || 0);
  });

  for (let i = 1; i < itemData.length; i++) {
    if (String(itemData[i][iidx.requestId] || "").trim() === id) {
      const code = String(itemData[i][iidx.partCode] || "").trim();
      const qty = (code && issueMap[code] !== undefined) ? issueMap[code] : 0;
      itemsSheet.getRange(i + 1, iidx.quantityIssued + 1).setValue(qty);
      itemData[i][iidx.quantityIssued] = qty; // Sync in-memory array for master stock write
    }
  }

  SpreadsheetApp.flush();

  // Write issued items to master stock
  const masterLogin = reqData[reqRow - 1][ridx.masterLogin];
  const masterName = reqData[reqRow - 1][ridx.masterName];
  if (masterLogin) {
    try {
      const stockSheet = getOrCreateMasterStockSheet_();
      const stockCount = Math.max(0, stockSheet.getLastRow() - 1);
      var stockIdx = 1;
      for (var si = 1; si < itemData.length; si++) {
        if (String(itemData[si][iidx.requestId] || "").trim() === id) {
          const code = String(itemData[si][iidx.partCode] || "").trim();
          const name = String(itemData[si][iidx.partName] || "").trim();
          const cellRaw = itemData[si][iidx.cell] || "";
          const unit = String(itemData[si][iidx.unit] || "шт.").trim();
          const qtyIssued = Number(itemData[si][iidx.quantityIssued] || 0);
          if (code && qtyIssued > 0) {
            const stockId = "MS-" + String(stockCount + stockIdx).padStart(4, "0");
            const normalizedCell = normalizeSpareCellDisplay_(cellRaw);
            const stockRow = appendObjectRowByHeaders_(stockSheet, {
              id: stockId,
              masterLogin: String(masterLogin || "").trim(),
              masterName: String(masterName || "").trim(),
              requestId: id,
              partCode: code,
              partName: name,
              cell: normalizedCell,
              unit: unit,
              quantityIssued: qtyIssued,
              quantityAvailable: qtyIssued,
              issuedAt: new Date(),
              status: "active",
            });
            setTextColumnValue_(stockSheet, stockRow, "id", stockId);
            setTextColumnValue_(stockSheet, stockRow, "masterLogin", masterLogin);
            setTextColumnValue_(stockSheet, stockRow, "requestId", id);
            setTextColumnValue_(stockSheet, stockRow, "partCode", code);
            setTextColumnValue_(stockSheet, stockRow, "cell", normalizedCell);
            stockIdx++;
          }
        }
      }
    } catch (e) {
      console.error("MASTER_STOCK write error: " + e);
    }
  }

  return { ok: true };
}

function generateSpareReturnId_() {
  const sheet = getOrCreateSpareReturnsSheet_();
  const count = Math.max(0, sheet.getLastRow() - 1);
  return "RR-" + String(count + 1).padStart(4, "0");
}

function getSpareRequestItemRows_(requestId) {
  const itemsSheet = getOrCreateSpareRequestItemsSheet_();
  const itemRange = itemsSheet.getDataRange();
  const values = itemRange.getValues();
  const displays = itemRange.getDisplayValues();
  const headers = values[0] || [];
  const idx = {
    requestId: headers.indexOf("requestId"),
    partCode: headers.indexOf("partCode"),
    partName: headers.indexOf("partName"),
    cell: headers.indexOf("cell"),
    unit: headers.indexOf("unit"),
    quantityRequested: headers.indexOf("quantityRequested"),
    quantityIssued: headers.indexOf("quantityIssued"),
  };

  const rows = [];
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idx.requestId] || "").trim() !== requestId) continue;
    rows.push({
      rowNumber: i + 1,
      partCode: String(displays[i][idx.partCode] || values[i][idx.partCode] || "").trim(),
      partName: String(displays[i][idx.partName] || values[i][idx.partName] || "").trim(),
      cell: resolveSpareRequestCell_({
        partCode: displays[i][idx.partCode] || values[i][idx.partCode] || "",
        partName: displays[i][idx.partName] || values[i][idx.partName] || "",
        cell: displays[i][idx.cell] || values[i][idx.cell] || "",
      }),
      unit: String(displays[i][idx.unit] || values[i][idx.unit] || "шт.").trim(),
      quantityRequested: Number(values[i][idx.quantityRequested] || 0),
      quantityIssued: Number(values[i][idx.quantityIssued] || 0),
      quantityIssuedCol: idx.quantityIssued + 1,
    });
  }
  return rows;
}

function createSpareReturnRecord_(payload) {
  const returnsSheet = getOrCreateSpareReturnsSheet_();
  const returnItemsSheet = getOrCreateSpareReturnItemsSheet_();
  const sourceRequestId = String(payload.sourceRequestId || "").trim();
  const masterLogin = String(payload.masterLogin || "").trim();
  const masterName = String(payload.masterName || "").trim();
  const equipmentId = String(payload.equipmentId || "").trim();
  const adminName = String(payload.adminName || "").trim();
  const comment = String(payload.comment || "").trim();
  const mode = String(payload.mode || "manual").trim();
  const items = (Array.isArray(payload.items) ? payload.items : [])
    .map(function(item) {
      return {
        partCode: String(item.partCode || "").trim(),
        partName: String(item.partName || "").trim(),
        cell: normalizeSpareCellDisplay_(item.cell),
        unit: String(item.unit || "шт.").trim(),
        quantityReturned: Number(item.quantityReturned || 0),
      };
    })
    .filter(function(item) {
      return item.quantityReturned > 0 && (item.partCode || item.partName);
    });

  if (!masterLogin && !masterName) return { ok: false, error: "no_master" };
  if (!items.length) return { ok: false, error: "no_items" };

  const returnId = generateSpareReturnId_();
  const now = new Date();
  const returnRow = appendObjectRowByHeaders_(returnsSheet, {
    id: returnId,
    sourceRequestId: sourceRequestId,
    masterLogin: masterLogin,
    masterName: masterName,
    equipmentId: equipmentId,
    status: "returned",
    createdAt: now,
    processedAt: now,
    adminName: adminName,
    comment: comment,
    mode: mode,
  });
  setTextColumnValue_(returnsSheet, returnRow, "id", returnId);
  setTextColumnValue_(returnsSheet, returnRow, "sourceRequestId", sourceRequestId);
  setTextColumnValue_(returnsSheet, returnRow, "masterLogin", masterLogin);

  items.forEach(function(item, idx) {
    const itemId = returnId + "-" + String(idx + 1).padStart(3, "0");
    const itemRow = appendObjectRowByHeaders_(returnItemsSheet, {
      id: itemId,
      returnId: returnId,
      sourceRequestId: sourceRequestId,
      partCode: item.partCode,
      partName: item.partName,
      cell: item.cell,
      unit: item.unit,
      quantityReturned: item.quantityReturned,
    });
    setTextColumnValue_(returnItemsSheet, itemRow, "id", itemId);
    setTextColumnValue_(returnItemsSheet, itemRow, "returnId", returnId);
    setTextColumnValue_(returnItemsSheet, itemRow, "sourceRequestId", sourceRequestId);
    setTextColumnValue_(returnItemsSheet, itemRow, "partCode", item.partCode);
    setTextColumnValue_(returnItemsSheet, itemRow, "cell", item.cell);
  });

  SpreadsheetApp.flush();
  return {
    ok: true,
    id: returnId,
    return: {
      id: returnId,
      sourceRequestId: sourceRequestId,
      masterLogin: masterLogin,
      masterName: masterName,
      equipmentId: equipmentId,
      status: "returned",
      createdAt: now,
      processedAt: now,
      adminName: adminName,
      comment: comment,
      mode: mode,
      items: items,
    }
  };
}

function spareReturnCreate_(data) {
  return createSpareReturnRecord_({
    sourceRequestId: data.sourceRequestId || "",
    masterLogin: data.masterLogin || "",
    masterName: data.masterName || "",
    equipmentId: data.equipmentId || "",
    adminName: data.adminName || data.masterName || "",
    comment: data.comment || "",
    mode: data.mode || "manual",
    items: data.items || [],
  });
}

function spareRequestReturn_(data) {
  const id = String(data.id || "").trim();
  const adminName = String(data.adminName || "").trim();
  const selected = Array.isArray(data.items) ? data.items : [];
  if (!id) return { ok: false, error: "no_id" };

  const reqOut = spareRequestGet_(id);
  if (!reqOut.ok) return reqOut;
  const request = reqOut.request;
  if (request.status !== "issued" && request.status !== "returned") return { ok: false, error: "not_issued" };

  const byCode = {};
  selected.forEach(function(item) {
    const code = String(item.partCode || "").trim();
    if (code) byCode[code] = Number(item.quantityReturned || 0);
  });

  const itemRows = getSpareRequestItemRows_(id);
  const returnItems = [];
  const itemsSheet = getOrCreateSpareRequestItemsSheet_();
  itemRows.forEach(function(row) {
    const wanted = Number(byCode[row.partCode] || 0);
    if (wanted <= 0) return;
    const qty = Math.min(wanted, Math.max(0, row.quantityIssued || 0));
    if (qty <= 0) return;
    returnItems.push({
      partCode: row.partCode,
      partName: row.partName,
      cell: row.cell,
      unit: row.unit,
      quantityReturned: qty,
    });
    itemsSheet.getRange(row.rowNumber, row.quantityIssuedCol).setValue(Math.max(0, Number(row.quantityIssued || 0) - qty));
  });

  const out = createSpareReturnRecord_({
    sourceRequestId: id,
    masterLogin: request.masterLogin,
    masterName: request.masterName,
    equipmentId: request.equipmentId,
    adminName: adminName,
    comment: data.comment || "Возврат по заявке " + id,
    mode: "request_return",
    items: returnItems,
  });
  if (!out.ok) return out;

  const reqSheet = getOrCreateSpareRequestsSheet_();
  const reqData = reqSheet.getDataRange().getValues();
  const headers = reqData[0] || [];
  const ridx = {
    id: headers.indexOf("id"),
    status: headers.indexOf("status"),
    processedAt: headers.indexOf("processedAt"),
    adminName: headers.indexOf("adminName"),
  };
  for (let i = 1; i < reqData.length; i++) {
    if (String(reqData[i][ridx.id] || "").trim() === id) {
      reqSheet.getRange(i + 1, ridx.status + 1).setValue("returned");
      reqSheet.getRange(i + 1, ridx.processedAt + 1).setValue(new Date());
      reqSheet.getRange(i + 1, ridx.adminName + 1).setValue(adminName);
      break;
    }
  }
  SpreadsheetApp.flush();

  return out;
}

function spareRequestCancelIssued_(data) {
  const id = String(data.id || "").trim();
  const adminName = String(data.adminName || "").trim();
  if (!id) return { ok: false, error: "no_id" };

  const reqOut = spareRequestGet_(id);
  if (!reqOut.ok) return reqOut;
  const request = reqOut.request;
  if (request.status !== "issued" && request.status !== "returned") return { ok: false, error: "not_issued" };

  const itemRows = getSpareRequestItemRows_(id);
  const returnItems = itemRows
    .filter(function(row) { return Number(row.quantityIssued || 0) > 0; })
    .map(function(row) {
      return {
        partCode: row.partCode,
        partName: row.partName,
        cell: row.cell,
        unit: row.unit,
        quantityReturned: Number(row.quantityIssued || 0),
      };
    });

  const out = createSpareReturnRecord_({
    sourceRequestId: id,
    masterLogin: request.masterLogin,
    masterName: request.masterName,
    equipmentId: request.equipmentId,
    adminName: adminName,
    comment: data.comment || "Отмена выдачи " + id,
    mode: "cancel_issued",
    items: returnItems,
  });
  if (!out.ok) return out;

  const reqSheet = getOrCreateSpareRequestsSheet_();
  const reqData = reqSheet.getDataRange().getValues();
  const headers = reqData[0] || [];
  const ridx = {
    id: headers.indexOf("id"),
    status: headers.indexOf("status"),
    processedAt: headers.indexOf("processedAt"),
    adminName: headers.indexOf("adminName"),
  };
  for (let i = 1; i < reqData.length; i++) {
    if (String(reqData[i][ridx.id] || "").trim() === id) {
      reqSheet.getRange(i + 1, ridx.status + 1).setValue("cancelled");
      reqSheet.getRange(i + 1, ridx.processedAt + 1).setValue(new Date());
      reqSheet.getRange(i + 1, ridx.adminName + 1).setValue(adminName);
      break;
    }
  }

  const itemsSheet = getOrCreateSpareRequestItemsSheet_();
  itemRows.forEach(function(row) {
    itemsSheet.getRange(row.rowNumber, row.quantityIssuedCol).setValue(0);
  });

  SpreadsheetApp.flush();
  return out;
}
