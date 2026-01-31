const SUBSCRIPTIONS_SHEET = "subscriptions";

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || "{}");
    const secret = body.secret || "";
    const expected = PropertiesService.getScriptProperties().getProperty("GAS_SECRET") || "";
    if (expected && String(secret) !== String(expected)) {
      return jsonResponse({ ok: false, error: "unauthorized" });
    }

    const action = String(body.action || "").trim();
    if (!action) return jsonResponse({ ok: false, error: "no_action" });

    switch (action) {
      case "subscribe":
        return jsonResponse(handleSubscribe(body));
      case "unsubscribe":
        return jsonResponse(handleUnsubscribe(body));
      case "subscribers":
        return jsonResponse(handleSubscribers(body));
      default:
        return jsonResponse({ ok: false, error: "unknown_action" });
    }
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function handleSubscribe(payload) {
  const equipmentId = String(payload.id || "").trim();
  const chatId = String(payload.chatId || "").trim();
  if (!equipmentId || !chatId) return { ok: false, error: "missing_fields" };

  const sheet = getOrCreateSheet_();
  const data = sheet.getDataRange().getValues();
  const headers = data[0] || [];
  const idx = buildIndex_(headers);

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
    equipmentId,
    chatId,
    user.id || "",
    user.username || "",
    user.firstName || "",
    user.lastName || "",
    new Date(),
  ];

  if (rowIndex === -1) {
    sheet.appendRow(values);
  } else {
    sheet.getRange(rowIndex, 1, 1, values.length).setValues([values]);
  }

  return { ok: true };
}

function handleUnsubscribe(payload) {
  const equipmentId = String(payload.id || "").trim();
  const chatId = String(payload.chatId || "").trim();
  if (!equipmentId || !chatId) return { ok: false, error: "missing_fields" };

  const sheet = getOrCreateSheet_();
  const data = sheet.getDataRange().getValues();
  const headers = data[0] || [];
  const idx = buildIndex_(headers);

  for (let i = data.length - 1; i >= 1; i--) {
    const row = data[i];
    if (String(row[idx.equipmentId] || "") === equipmentId && String(row[idx.chatId] || "") === chatId) {
      sheet.deleteRow(i + 1);
    }
  }

  return { ok: true };
}

function handleSubscribers(payload) {
  const equipmentId = String(payload.id || "").trim();
  if (!equipmentId) return { ok: false, error: "missing_fields" };

  const sheet = getOrCreateSheet_();
  const data = sheet.getDataRange().getValues();
  const headers = data[0] || [];
  const idx = buildIndex_(headers);

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

function getOrCreateSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
  return sheet;
}

function buildIndex_(headers) {
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

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
