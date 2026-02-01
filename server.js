import express from "express";
import path from "path";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import FormData from "form-data";
import fs from "fs/promises";
import crypto from "crypto";

// =======================
// APP
// =======================
const app = express();
const __dirname = path.resolve();

app.use(bodyParser.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname)));

// =======================
// ENV (секреты только тут)
// =======================
const PORT = process.env.PORT || 8080;

// PWA -> NODE
const PWA_KEY = process.env.PWA_KEY || "";

// NODE -> GAS
const GAS_WEBAPP_URL = process.env.GAS_WEBAPP_URL || ""; // https://script.google.com/macros/s/.../exec
const GAS_SECRET = process.env.GAS_SECRET || "";         // длинная строка

// Telegram
const TG_BOT = process.env.TG_BOT_TOKEN || "";
const TG_CHAT = process.env.TG_CHAT_ID || "";
const TG_NOTIFY_BOT = process.env.TG_NOTIFY_BOT_TOKEN || "";
const TG_NOTIFY_BOT_USERNAME = process.env.TG_NOTIFY_BOT_USERNAME || "";
const TG_NOTIFY_CHAT_ID =
  process.env.TG_NOTIFY_CHAT_ID ||
  process.env.ADMIN_CHAT_ID ||
  "";
const TG_WEBHOOK_SECRET = process.env.TG_WEBHOOK_SECRET || "";
const SUPPORT_PHONE = process.env.SUPPORT_PHONE || "073-123-18-18";
const MANAGER_LINK =
  process.env.MANAGER_LINK ||
  process.env.SUPPORT_GROUP_LINK ||
  "https://t.me/SurpressoService";
const PASSPORT_BASE_URL =
  process.env.PASSPORT_BASE_URL ||
  process.env.PUBLIC_APP_URL ||
  process.env.APP_URL ||
  "";

// Trello
const TRELLO_KEY = process.env.TRELLO_KEY || "";
const TRELLO_TOKEN = process.env.TRELLO_TOKEN || "";
const TRELLO_LIST_ID = process.env.TRELLO_LIST_ID || "";

// Labels
const LABEL_OUR = process.env.LABEL_OUR || "";
const LABEL_CLIENT = process.env.LABEL_CLIENT || "";
const LABEL_CONTRACT = process.env.LABEL_CONTRACT || "";

// Templates proxy
const TEMPLATE_SAVE_URL =
  process.env.TEMPLATE_SAVE_WEBHOOK ||
  "https://script.google.com/macros/s/AKfycbwO0gS3bMjbmY479TetXjt-_gZ8Ty3FjFYse0xSmS_81Plmd7ld50GvMZ9eH5Z8bunO/exec";

const TEMPLATES_STORE = path.join(__dirname, "warehouse-templates.json");

// =======================
// HELPERS: auth
// =======================
function requirePwaKey(req, res, next) {
  if (!PWA_KEY) return next(); // удобно для локалки

  const key = req.headers["x-surpresso-key"] || req.query.k;
  if (!key || String(key) !== String(PWA_KEY)) {
    return res.status(401).send({ ok: false, error: "unauthorized" });
  }
  next();
}

// =======================
// HELPERS: Trello label
// =======================
function pickLabel(card) {
  if (card.owner === "company") return LABEL_OUR;
  if (card.owner === "client" && card.isContract) return LABEL_CONTRACT;
  return LABEL_CLIENT;
}

// =======================
// HELPERS: GAS proxy
// =======================
async function gasPost(payload) {
  if (!GAS_WEBAPP_URL) throw new Error("GAS_WEBAPP_URL is not set");
  if (!GAS_SECRET) throw new Error("GAS_SECRET is not set");

  const body = {
    secret: GAS_SECRET,
    ...payload,
  };

  const resp = await fetch(GAS_WEBAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await resp.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("GAS returned non-JSON: " + text.slice(0, 200));
  }

  if (!json.ok) throw new Error(json.error || "GAS error");
  return json;
}

// =======================
// HELPERS: Telegram send
// =======================
function tgApiUrl(botToken, method) {
  return `https://api.telegram.org/bot${botToken}/${method}`;
}

async function tgSendTextTo(botToken, chatId, text, replyMarkup) {
  if (!botToken || !chatId) return false;
  try {
    const resp = await fetch(tgApiUrl(botToken, "sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

async function tgSendPhotosTo(botToken, chatId, photos, caption) {
  if (!botToken || !chatId) return;

  if (!photos || photos.length === 0) {
    if (caption) await tgSendTextTo(botToken, chatId, caption);
    return;
  }

  const tgForm = new FormData();
  const media = [];

  photos.forEach((base64, i) => {
    const fileId = `file${i}.jpg`;
    const buffer = Buffer.from(
      String(base64).replace(/^data:image\/\w+;base64,/, ""),
      "base64"
    );

    tgForm.append(fileId, buffer, { filename: fileId });

    media.push({
      type: "photo",
      media: `attach://${fileId}`,
      caption: i === photos.length - 1 ? caption : "",
    });
  });

  tgForm.append("chat_id", chatId);
  tgForm.append("media", JSON.stringify(media));

  const tgResp = await fetch(tgApiUrl(botToken, "sendMediaGroup"), {
    method: "POST",
    body: tgForm,
  });

  console.log("TG RESPONSE:", await tgResp.text());
}

async function tgSendPhotoUrlsTo(botToken, chatId, photoUrls, caption) {
  if (!botToken || !chatId) return;

  if (!photoUrls || photoUrls.length === 0) {
    if (caption) await tgSendTextTo(botToken, chatId, caption);
    return;
  }

  const media = photoUrls.map((url, i) => ({
    type: "photo",
    media: url,
    caption: i === photoUrls.length - 1 ? caption : "",
  }));

  const tgResp = await fetch(tgApiUrl(botToken, "sendMediaGroup"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      media,
    }),
  });

  console.log("TG RESPONSE:", await tgResp.text());
}

function parseBase64Data(dataUrl, fallbackExt) {
  const raw = String(dataUrl || "");
  const match = raw.match(/^data:([^;]+);base64,(.+)$/);
  const mime = match ? match[1] : "";
  const data = match ? match[2] : raw.replace(/^data:video\/\w+;base64,/, "");
  const ext = mime.includes("webm") ? "webm" : mime.includes("mp4") ? "mp4" : fallbackExt;
  return {
    buffer: Buffer.from(data, "base64"),
    filename: `video.${ext}`,
    mime,
  };
}

async function tgSendVideoTo(botToken, chatId, video, caption) {
  if (!botToken || !chatId || !video) return;

  const tgForm = new FormData();
  const payload = parseBase64Data(video, "mp4");

  tgForm.append("chat_id", chatId);
  tgForm.append("video", payload.buffer, { filename: payload.filename });
  if (caption) tgForm.append("caption", caption);

  const tgResp = await fetch(tgApiUrl(botToken, "sendVideo"), {
    method: "POST",
    body: tgForm,
  });

  console.log("TG VIDEO RESPONSE:", await tgResp.text());
}

async function tgSendVideosTo(botToken, chatId, videos, caption) {
  if (!botToken || !chatId) return;
  const list = Array.isArray(videos) ? videos : [];
  for (let i = 0; i < list.length; i++) {
    const withCaption = i === 0 ? caption : "";
    await tgSendVideoTo(botToken, chatId, list[i], withCaption);
  }
}

async function tgSendText(text) {
  return tgSendTextTo(TG_BOT, TG_CHAT, text);
}

async function tgNotifyAdminText(text) {
  if (!TG_NOTIFY_CHAT_ID) return;
  return tgSendTextTo(TG_NOTIFY_BOT, TG_NOTIFY_CHAT_ID, text);
}

async function tgSendPhotos(photos, caption) {
  return tgSendPhotosTo(TG_BOT, TG_CHAT, photos, caption);
}

async function tgSendVideos(videos, caption) {
  return tgSendVideosTo(TG_BOT, TG_CHAT, videos, caption);
}

async function tgNotifyTextTo(chatId, text, replyMarkup) {
  return tgSendTextTo(TG_NOTIFY_BOT, chatId, text, replyMarkup);
}

async function tgNotifyPhotosTo(chatId, photos, caption) {
  return tgSendPhotosTo(TG_NOTIFY_BOT, chatId, photos, caption);
}

async function tgNotifyVideosTo(chatId, videos, caption) {
  return tgSendVideosTo(TG_NOTIFY_BOT, chatId, videos, caption);
}

// =======================
// HELPERS: caption
// =======================
function buildCaption(card) {
  let caption = "";

  if (card.owner === "client") {
    caption =
      `🟢 Прийом від клієнта\n` +
      `🆔 ID: ${card.id || ""}\n` +
      `👤 Ім’я: ${card.clientName || ""}\n` +
      `📞 Телефон: ${card.clientPhone || ""}\n` +
      `📍 Локація: ${card.clientLocation || ""}\n` +
      `⚙️ Модель: ${card.model || ""}\n` +
      `🔢 Серійний: ${card.serial || ""}\n` +
      `❗ Проблема: ${card.problem || ""}\n`;

    if (card.isContract) caption += `📄 Клієнт за договором (обслуговування)\n`;
  } else {
    caption =
      `🔴 Обладнання компанії\n` +
      `🆔 ID: ${card.id || ""}\n` +
      `📍 Локація: ${card.companyLocation || ""}\n` +
      `🛠 Назва: ${card.name || ""}\n` +
      `🔢 Внутрішній №: ${card.internalNumber || ""}\n` +
      `❗ Завдання: ${card.task || ""}\n` +
      `📝 Коментар: ${card.comment || ""}\n`;
  }

  return caption;
}

function buildPassportLink(req, id, { isPublic = false } = {}) {
  const page = isPublic ? "passport.html" : "equip.html";
  return `${req.protocol}://${req.get("host")}/${page}?id=${encodeURIComponent(id)}`;
}

function buildPassportLinkFromBase(baseUrl, id, { isPublic = false } = {}) {
  if (!baseUrl) return "";
  const trimmed = String(baseUrl).replace(/\/+$/, "");
  const page = isPublic ? "passport.html" : "equip.html";
  return `${trimmed}/${page}?id=${encodeURIComponent(id)}`;
}

function extractDriveFileId(driveUrl) {
  if (!driveUrl) return "";
  const s = String(driveUrl);
  if (s.includes("uc?export=view&id=")) {
    const m = s.match(/id=([^&]+)/i);
    return m ? m[1] : "";
  }
  if (s.includes("/file/d/")) {
    const m = s.match(/\/file\/d\/([^\/]+)\//i);
    return m ? m[1] : "";
  }
  if (s.includes("id=")) {
    const m = s.match(/[?&]id=([^&]+)/i);
    return m ? m[1] : "";
  }
  return "";
}

function buildProxyDriveUrl(req, driveUrl) {
  const fileId = extractDriveFileId(driveUrl);
  if (!fileId) return driveUrl;
  return `${req.protocol}://${req.get("host")}/proxy-drive/${encodeURIComponent(fileId)}`;
}

const MAIN_MENU_LABELS = ["паспорт", "статус", "история", "связаться", "отписка"];
const CONTACT_MENU_LABELS = ["позвонить", "написать менеджеру", "написать в сервис", "назад"];
const FINAL_MENU_LABELS = ["відписатися", "оцінити", "питання"];

function normalizeMenuText(text) {
  return String(text || "").trim().toLowerCase();
}

function buildMainMenuMarkup() {
  return {
    keyboard: [
      ["Паспорт", "Статус"],
      ["История", "Связаться"],
      ["Фотоальбом", "Попередня вартість ремонту"],
      ["Отписка"],
    ],
    resize_keyboard: true,
  };
}

function buildContactMenuMarkup() {
  return {
    keyboard: [
      ["Позвонить", "Написать менеджеру"],
      ["Написать в сервис"],
      ["Назад"],
    ],
    resize_keyboard: true,
  };
}

function buildFinalMenuMarkup() {
  return {
    keyboard: [["Відписатися", "Оцінити", "Питання"]],
    resize_keyboard: true,
  };
}

function buildApprovalMarkup({ requestId, equipmentId }) {
  const safeRequestId = String(requestId || "").trim();
  return {
    inline_keyboard: [
      [
        { text: "Так", callback_data: `approval:${safeRequestId}:yes` },
        { text: "Ні", callback_data: `approval:${safeRequestId}:no` },
      ],
      [
        { text: "Вартість", callback_data: `approval:${safeRequestId}:cost` },
        { text: "Уточнення", callback_data: `approval:${safeRequestId}:question` },
      ],
    ],
  };
}

async function sendMainMenu(chatId, text = "Головне меню") {
  return tgNotifyTextTo(chatId, text, buildMainMenuMarkup());
}

async function sendContactMenu(chatId, text = "Оберіть спосіб зв’язку") {
  return tgNotifyTextTo(chatId, text, buildContactMenuMarkup());
}

async function sendFinalMenu(chatId, text = "Ремонт завершён") {
  return tgNotifyTextTo(chatId, text, buildFinalMenuMarkup());
}

// =======================
// HELPERS: status notify rules
// =======================
function normStatus(s) {
  return String(s || "").trim().toLowerCase();
}

function isClientGiveAwayStatus(status) {
  // "Выдано клиенту" / "Видано клієнту"
  const s = normStatus(status);
  return (
    s === "выдано клиенту" ||
    s === "видано клієнту" ||
    s.includes("выдано") ||
    s.includes("видано")
  );
}

function isCompanyLeavingStatus(status) {
  // "Уехало на аренду"
  const s = normStatus(status);
  return (
    s === "уехало на аренду" ||
    s === "уехало на подмену" ||
    s.includes("уехало") ||
    s.includes("виїжджає")
  );
}

function isSoldStatus(status) {
  const s = normStatus(status);
  return s === "продано" || s.includes("продано");
}

function shouldNotifyStatus(eqOwner, newStatus) {
  if (isSoldStatus(newStatus)) return true;
  if (eqOwner === "client") return true;
  if (eqOwner === "company") return isCompanyLeavingStatus(newStatus);
  return false;
}

async function getSubscriberChatIds(equipmentId) {
  if (!equipmentId || !GAS_WEBAPP_URL || !GAS_SECRET) return [];
  try {
    const out = await gasPost({ action: "subscribers", id: equipmentId });
    const list = out?.subscribers || out?.items || [];
    return Array.isArray(list)
      ? list.map((entry) => String(entry.chatId || entry).trim()).filter(Boolean)
      : [];
  } catch (err) {
    console.error("SUBSCRIBERS LOAD ERROR:", err);
    return [];
  }
}

async function notifySubscribers({ equipmentId, photos, caption, replyMarkup }) {
  const chatIds = await getSubscriberChatIds(equipmentId);
  if (!chatIds.length) return;
  await Promise.all(
    chatIds.map(async (chatId) => {
      await tgNotifyPhotosTo(chatId, photos, caption);
      if (!photos?.length && caption && replyMarkup) {
        await tgNotifyTextTo(chatId, "Меню", replyMarkup);
      }
      if (photos?.length && replyMarkup) {
        await tgNotifyTextTo(chatId, "Меню", replyMarkup);
      }
    })
  );
}

async function notifySubscribersVideos({ equipmentId, videos, caption, replyMarkup }) {
  const chatIds = await getSubscriberChatIds(equipmentId);
  if (!chatIds.length) return;
  await Promise.all(
    chatIds.map(async (chatId) => {
      await tgNotifyVideosTo(chatId, videos, caption);
      if (replyMarkup) {
        await tgNotifyTextTo(chatId, "Меню", replyMarkup);
      }
    })
  );
}

function buildPhotoAddedCaption({ eq, passportLink }) {
  const who = eq.owner === "company" ? "🔴 Обладнання компанії" : "🟢 Обладнання клієнта";

  let body = `${who}\n🆔 ID: ${eq.id || ""}\n`;

  if (eq.owner === "client") {
    body +=
      `👤 ${eq.clientName || ""}\n` +
      `📞 ${eq.clientPhone || ""}\n` +
      `⚙️ ${eq.model || ""}\n` +
      `🔢 ${eq.serial || ""}\n`;
  } else {
    body +=
      `📍 ${eq.companyLocation || ""}\n` +
      `🛠 ${eq.name || ""}\n` +
      `🔢 № ${eq.internalNumber || ""}\n`;
  }

  body += `\n📸 Додано нове фото\n🔗 Паспорт: ${passportLink}`;
  return body;
}

function parseTelegramCommand(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const [cmd, payload] = raw.split(/\s+/);
  return { cmd, payload };
}

const pendingServiceMessages = new Map();

async function getLatestEquipmentIdForChat(chatId) {
  if (!chatId || !GAS_WEBAPP_URL || !GAS_SECRET) return "";
  try {
    const out = await gasPost({ action: "subscriptionByChat", chatId: String(chatId) });
    return String(out?.equipmentId || "").trim();
  } catch (err) {
    console.error("SUBSCRIPTION LOOKUP ERROR:", err);
    return "";
  }
}

function buildStatusChangeCaption({ eq, oldStatus, newStatus, comment, actor, passportLink }) {
  const who = eq.owner === "company" ? "🔴 Обладнання компанії" : "🟢 Обладнання клієнта";

  const head =
    `🔔 Зміна статусу\n` +
    `${who}\n` +
    `🆔 ID: ${eq.id || ""}\n` +
    `🔁 ${oldStatus || "—"} → ${newStatus || "—"}\n`;

  let body = "";

  if (eq.owner === "client") {
    body +=
      `👤 ${eq.clientName || ""}\n` +
      `📞 ${eq.clientPhone || ""}\n` +
      `⚙️ ${eq.model || ""}\n` +
      `🔢 ${eq.serial || ""}\n`;
  } else {
    body +=
      `📍 ${eq.companyLocation || ""}\n` +
      `🛠 ${eq.name || ""}\n` +
      `🔢 № ${eq.internalNumber || ""}\n`;
  }

  const extra =
    (comment ? `📝 ${comment}\n` : "") +
    (actor ? `👷 ${actor}\n` : "") +
    `\n🔗 Паспорт: ${passportLink}`;

  return head + body + extra;
}

// =======================
// 1) MAIN: первичный прием (TG + Trello + GAS)
// =======================
app.post("/send-equipment", requirePwaKey, async (req, res) => {
  try {
    const { card, photos = [] } = req.body || {};
    if (!card) return res.status(400).send({ ok: false, error: "no_card" });

    // ✅ статус задаем на первом приеме
    const payloadCard = { ...card };

    if (!payloadCard.status) {
      payloadCard.status = payloadCard.owner === "company"
        ? "Приехало после аренды"
        : "Прийнято на ремонт";
    }

    const caption = buildCaption(payloadCard);

    // -----------------------
    // 1) GAS create/upsert + photos
    // -----------------------
    let registry = null;

if (GAS_WEBAPP_URL && GAS_SECRET) {
  // ✅ 1) сначала пробуем "создать только если нет"
  try {
    registry = await gasPost({ action: "createOnly", card: payloadCard });
  } catch (e) {
    const msg = String(e || "");

    // ✅ если уже существует — это НЕ ошибка для повторного приема
    if (msg.includes("ID_ALREADY_EXISTS")) {
      registry = await gasPost({ action: "create", card: payloadCard }); // upsert
    } else {
      throw e; // все остальное — настоящая ошибка
    }
  }

  // ✅ 2) фото пишем всегда (они новые)
  for (let i = 0; i < photos.length; i++) {
    await gasPost({
      action: "photo",
      id: payloadCard.id,
      base64: photos[i],
      caption: `Фото ${i + 1}`,
    });
  }
}
    // -----------------------
    // 2) Telegram post (при первичном приеме)
    // -----------------------
    await tgSendPhotos(photos, caption);

    // -----------------------
    // 3) Trello create card + attach photos
    // -----------------------
    let trelloCardId = null;

    if (TRELLO_KEY && TRELLO_TOKEN && TRELLO_LIST_ID) {
      const labelId = pickLabel(payloadCard);

      const trelloName =
        payloadCard.owner === "company"
          ? `🛠Обладнання: ${payloadCard.name || ""} |📍${payloadCard.companyLocation || ""} | №:${payloadCard.internalNumber || ""}`
          : `👤Клієнт: ${payloadCard.clientName || ""} | ⚙️${payloadCard.model || ""} | ❗${payloadCard.problem || ""}`;

      const passportLink = buildPassportLink(req, payloadCard.id);

      const desc =
        caption +
        `\n\n🔗 Паспорт: ${passportLink}\n` +
        `\n📸 Фото прикріплені в Telegram.`;

      const createCard = await fetch(
        `https://api.trello.com/1/cards?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idList: TRELLO_LIST_ID,
            name: trelloName,
            desc,
            idLabels: labelId ? [labelId] : [],
          }),
        }
      );

      const cardData = await createCard.json();
      console.log("TRELLO CARD CREATED:", cardData);

      if (!cardData?.id) throw new Error("Trello card was not created");
      trelloCardId = cardData.id;

      for (let i = 0; i < photos.length; i++) {
        const buffer = Buffer.from(
          String(photos[i]).replace(/^data:image\/\w+;base64,/, ""),
          "base64"
        );

        const attachForm = new FormData();
        attachForm.append("key", TRELLO_KEY);
        attachForm.append("token", TRELLO_TOKEN);
        attachForm.append("file", buffer, `photo${i}.jpg`);

        const attachResp = await fetch(
          `https://api.trello.com/1/cards/${trelloCardId}/attachments`,
          { method: "POST", body: attachForm }
        );

        console.log("TRELLO PHOTO UPLOAD:", await attachResp.text());
      }
    }

    res.send({ ok: true, trelloCardId, registry });
  } catch (err) {
    console.error("SERVER ERROR:", err);
    res.status(500).send({ ok: false, error: String(err) });
  }
});

// =======================
// 2) GAS proxy endpoints (PWA -> NODE -> GAS)
// =======================

// получить паспорт (данные)
app.get("/api/equip/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const out = await gasPost({ action: "get", id });
    res.send({ ...out, tgBotUsername: TG_NOTIFY_BOT_USERNAME });
  } catch (e) {
    res.status(500).send({ ok: false, error: String(e) });
  }
});

// ✅ update specs (Google Drive via GAS)
app.post("/api/equip/:id/specs", requirePwaKey, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const specs = String(req.body?.specs ?? "");
    const out = await gasPost({ action: "specs", id, specs });
    res.send({ ok: true, ...out });
  } catch (e) {
    res.status(500).send({ ok: false, error: String(e) });
  }
});

// ✅ изменить статус + Telegram (при нужных статусах)
app.post("/api/equip/:id/status", requirePwaKey, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const {
      newStatus,
      comment = "",
      actor = "",
      photos = [],
      videos = [],
      location = "",
    } = req.body || {};
    if (!newStatus) return res.status(400).send({ ok: false, error: "no_newStatus" });

    // 1) Получим текущий equipment чтобы знать owner + старый статус
    const before = await gasPost({ action: "get", id });
    const eqBefore = before?.equipment || {};
    const oldStatus = String(eqBefore.status || "");
    const oldComment = String(eqBefore.lastComment || "");

    const safePhotos = Array.isArray(photos) ? photos.slice(0, 10) : [];
    const safeVideos = Array.isArray(videos) ? videos.slice(0, 1) : [];
    const trimmedLocation = String(location || "").trim();
    const owner = String(eqBefore.owner || "");
    const locationPayload = trimmedLocation
      ? (owner === "company"
        ? { companyLocation: trimmedLocation }
        : { clientLocation: trimmedLocation })
      : {};

    // 2) Пишем новый статус в GAS
    const out = await gasPost({
      action: "status",
      id,
      newStatus,
      comment,
      actor,
      photos: safePhotos,
      location: trimmedLocation,
      ...locationPayload,
    });

    // 3) Если это триггерный статус — шлем в TG (свежие фото с телефона если есть)
    const statusChanged = normStatus(oldStatus) !== normStatus(newStatus);
    const trimmedComment = String(comment || "").trim();
    const commentChanged = trimmedComment && trimmedComment !== String(oldComment || "").trim();
    if ((statusChanged || commentChanged) && shouldNotifyStatus(owner, newStatus)) {
      const passportLink = buildPassportLink(req, id, { isPublic: owner === "client" });
      const mainMenuMarkup = buildMainMenuMarkup();

      const caption = buildStatusChangeCaption({
        eq: { ...eqBefore, id, ...locationPayload },
        oldStatus,
        newStatus,
        comment,
        actor,
        passportLink,
      });

      const videoCaption = safePhotos.length ? "" : caption;

      if (owner === "client") {
        if (safePhotos.length) {
          await notifySubscribers({
            equipmentId: id,
            photos: safePhotos,
            caption,
            replyMarkup: mainMenuMarkup,
          });
        } else if (caption) {
          await notifySubscribers({
            equipmentId: id,
            photos: [],
            caption,
            replyMarkup: mainMenuMarkup,
          });
        }
        if (safeVideos.length) {
          await notifySubscribersVideos({
            equipmentId: id,
            videos: safeVideos,
            caption: videoCaption,
            replyMarkup: mainMenuMarkup,
          });
        }

        if (statusChanged && isClientGiveAwayStatus(newStatus)) {
          const chatIds = await getSubscriberChatIds(id);
          await Promise.all(
            chatIds.map((chatId) => sendFinalMenu(chatId))
          );
        }
      } else {
        if (safePhotos.length) {
          await tgSendPhotos(safePhotos, caption);
        } else if (caption) {
          await tgSendText(caption);
        }
        if (safeVideos.length) {
          await tgSendVideos(safeVideos, videoCaption);
        }
      }
    }

    res.send({ ok: true, ...out });
  } catch (e) {
    res.status(500).send({ ok: false, error: String(e) });
  }
});

// ✅ approval request (service -> client bot)
app.post("/api/equip/:id/approval", requirePwaKey, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const { text = "", actor = "" } = req.body || {};
    if (!id || !text) return res.status(400).send({ ok: false, error: "missing_fields" });
    if (!TG_NOTIFY_BOT) return res.status(500).send({ ok: false, error: "tg_notify_bot_missing" });

    const requestId = crypto.randomUUID();
    await gasPost({
      action: "approvalRequest",
      requestId,
      equipmentId: id,
      message: String(text || ""),
      actor: String(actor || ""),
    });

    const chatIds = await getSubscriberChatIds(id);
    const message =
      `🛠 Потрібне погодження\n` +
      `🆔 ID: ${id}\n` +
      `📝 ${text}`;

    if (!chatIds.length) {
      return res.send({ ok: true, requestId, sent: 0, warning: "no_subscribers" });
    }

    const notifyResults = await Promise.all(
      chatIds.map((chatId) =>
        tgNotifyTextTo(chatId, message, buildApprovalMarkup({ requestId, equipmentId: id }))
      )
    );

    const sent = notifyResults.filter(Boolean).length;
    res.send({ ok: true, requestId, sent });
  } catch (e) {
    res.status(500).send({ ok: false, error: String(e) });
  }
});

// proxy drive preview (ORB fix)
app.get("/proxy-drive/:fileId", async (req, res) => {
  const { fileId } = req.params;
  try {
    const url = `https://drive.google.com/uc?export=view&id=${fileId}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Drive error");

    const buffer = await response.buffer();
    res.set("Content-Type", response.headers.get("content-type") || "image/jpeg");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(buffer);
  } catch (err) {
    res.status(500).send("Proxy error");
  }
});

// добавить фото
app.post("/api/equip/:id/photo", requirePwaKey, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const { base64, caption = "" } = req.body || {};
    const out = await gasPost({ action: "photo", id, base64, caption });
    const before = await gasPost({ action: "get", id });
    const eq = before?.equipment || {};

    if (eq.owner === "client") {
      const passportLink = buildPassportLink(req, id, { isPublic: true });
      const tgCaption = buildPhotoAddedCaption({
        eq: { ...eq, id },
        passportLink,
      });
      await notifySubscribers({
        equipmentId: id,
        photos: base64 ? [base64] : [],
        caption: tgCaption,
      });
    }
    res.send(out);
  } catch (e) {
    res.status(500).send({ ok: false, error: String(e) });
  }
});

app.post("/api/equip/:id/photo-album", requirePwaKey, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const limit = Number(req.body?.limit || 10);
    const out = await gasPost({ action: "get", id });
    const photos = Array.isArray(out?.photos) ? out.photos : [];
    const trimmed = photos.filter(Boolean);

    if (!trimmed.length) {
      return res.status(400).send({ ok: false, error: "no_photos" });
    }

    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 10) : 10;
    const selected = trimmed.slice(-safeLimit);
    const photoUrls = selected
      .map((p) => String(p.imgUrl || "").trim() || buildProxyDriveUrl(req, p.url))
      .filter(Boolean);

    if (!photoUrls.length) {
      return res.status(400).send({ ok: false, error: "no_photo_urls" });
    }

    const passportLink = buildPassportLink(req, id, { isPublic: true });
    const caption =
      `📸 Фотоальбом\n` +
      `🆔 ID: ${id}\n` +
      (passportLink ? `🔗 Паспорт: ${passportLink}` : "");

    await tgSendPhotoUrlsTo(TG_BOT, TG_CHAT, photoUrls, caption);

    res.send({ ok: true, sent: photoUrls.length });
  } catch (e) {
    res.status(500).send({ ok: false, error: String(e) });
  }
});

// PDF (редирект на Drive URL)
app.get("/api/equip/:id/pdf", requirePwaKey, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const pdf = await gasPost({ action: "pdf", id });
    if (pdf?.url) return res.redirect(pdf.url);
    res.status(500).send({ ok: false, error: "no_pdf_url" });
  } catch (e) {
    res.status(500).send({ ok: false, error: String(e) });
  }
});

// =======================
// 2.5) Create ONLY in GAS (без TG / Trello)
// =======================
app.post("/api/equip/create", requirePwaKey, async (req, res) => {
  try {
    const { card, photos = [] } = req.body || {};
    if (!card?.id) return res.status(400).send({ ok: false, error: "no_id" });

    if (!card.status) {
      card.status = card.owner === "company" ? "Приехало после аренды" : "Прийнято на ремонт";
    }

    const out = await gasPost({ action: "create", card });

    // ✅ ДОБАВИЛИ загрузку фоток в Drive
    for (let i = 0; i < photos.length; i++) {
      await gasPost({
        action: "photo",
        id: card.id,
        base64: photos[i],
        caption: `Фото ${i + 1}`,
      });
    }

    res.send({ ok: true, registry: out, photosUploaded: photos.length });
  } catch (e) {
    res.status(500).send({ ok: false, error: String(e) });
  }
});

// =======================
// 2.6) Telegram webhook
// =======================
app.post("/tg/webhook", async (req, res) => {
  try {
    if (TG_WEBHOOK_SECRET) {
      const secret = req.headers["x-telegram-bot-api-secret-token"];
      if (String(secret || "") !== String(TG_WEBHOOK_SECRET)) {
        return res.status(401).send({ ok: false });
      }
    }

    const update = req.body || {};
    if (update.callback_query) {
      const callback = update.callback_query;
      const data = String(callback.data || "");
      const chatId = callback.message?.chat?.id;
      const user = callback.from || {};
      if (chatId && data.startsWith("approval:")) {
        const parts = data.split(":");
        const requestId = parts[1] || "";
        const rawAnswer = parts[3] ? parts[3] : parts[2];
        const normalizedAnswer = String(rawAnswer || "").trim();
        let equipmentId = parts.length >= 4 ? (parts[2] || "") : "";
        let lookupEquipmentId = "";

        if (parts.length === 3 && requestId) {
          const lookup = await gasPost({
            action: "approvalLookup",
            requestId,
          });
          lookupEquipmentId = String(lookup?.equipmentId || "").trim();
        }
        await gasPost({
          action: "approvalResponse",
          requestId,
          equipmentId: equipmentId || lookupEquipmentId,
          answer: normalizedAnswer,
          chatId: String(chatId),
          user: {
            id: user.id,
            username: user.username,
            firstName: user.first_name,
            lastName: user.last_name,
          },
        });

        const answerLabel = {
          yes: "Так",
          no: "Ні",
          cost: "Вартість",
          question: "Уточнення",
        }[normalizedAnswer] || normalizedAnswer;

        const resolvedId = equipmentId || lookupEquipmentId || requestId;
        const idLabel = equipmentId || lookupEquipmentId ? `🆔 ID: ${resolvedId}` : `🧾 Запит: ${resolvedId}`;
        await tgNotifyAdminText(
          `✅ Відповідь клієнта\n${idLabel}\n💬 ${answerLabel}\n👤 @${user.username || "—"}`
        );
        await tgNotifyTextTo(chatId, "Прийнято ✅", buildMainMenuMarkup());
      }

      if (callback.id) {
        await fetch(tgApiUrl(TG_NOTIFY_BOT, "answerCallbackQuery"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callback_query_id: callback.id }),
        }).catch(() => {});
      }
      return res.send({ ok: true });
    }

    const message = update.message || update.edited_message || {};
    const text = message.text || "";
    const chatId = message.chat?.id;
    const user = message.from || {};

    if (!chatId) return res.send({ ok: true });

    if (TG_NOTIFY_CHAT_ID && String(chatId) === String(TG_NOTIFY_CHAT_ID)) {
      const replyText = message.reply_to_message?.text || "";
      const matchChat = replyText.match(/Chat ID:\s*(\d+)/i);
      const clientChatId = matchChat ? matchChat[1] : "";
      if (clientChatId && text) {
        await tgNotifyTextTo(
          clientChatId,
          `💬 Відповідь менеджера:\n${text}`,
          buildMainMenuMarkup()
        );
      }
      return res.send({ ok: true });
    }

    const normalized = normalizeMenuText(text);

    if (
      pendingServiceMessages.has(chatId) &&
      text &&
      !text.startsWith("/") &&
      !MAIN_MENU_LABELS.includes(normalized) &&
      !CONTACT_MENU_LABELS.includes(normalized) &&
      !FINAL_MENU_LABELS.includes(normalized)
    ) {
      const pending = pendingServiceMessages.get(chatId) || {};
      pendingServiceMessages.delete(chatId);
      const equipmentId = pending.equipmentId || (await getLatestEquipmentIdForChat(chatId));
      const passportLink = buildPassportLinkFromBase(PASSPORT_BASE_URL, equipmentId, { isPublic: false });
      const adminMessage = [
        "📩 Повідомлення від клієнта",
        `🆔 Equipment ID: ${equipmentId || "—"}`,
        `👤 ${user.first_name || ""} ${user.last_name || ""} (@${user.username || "—"})`,
        `💬 ${text}`,
        passportLink ? `🔗 Паспорт: ${passportLink}` : "",
        `Chat ID: ${chatId}`,
      ]
        .filter(Boolean)
        .join("\n");
      await tgNotifyAdminText(adminMessage);
      await tgNotifyTextTo(chatId, "Прийнято ✅", buildMainMenuMarkup());
      return res.send({ ok: true });
    }

    const parsed = parseTelegramCommand(text);
    if (parsed?.cmd) {
      const { cmd, payload } = parsed;
      const token = String(payload || "").trim();
      const match = token.match(/^eq_(.+)$/i);
      const equipmentId = match ? match[1] : "";

      if (cmd === "/start" && equipmentId) {
        if (!GAS_WEBAPP_URL || !GAS_SECRET) {
          await tgNotifyTextTo(chatId, "Підписка тимчасово недоступна.");
          return res.send({ ok: true });
        }

        const subscription = await gasPost({
          action: "subscribe",
          id: equipmentId,
          chatId: String(chatId),
          user: {
            id: user.id,
            username: user.username,
            firstName: user.first_name,
            lastName: user.last_name,
          },
        });

        if (subscription?.alreadySubscribed) {
          await tgNotifyTextTo(
            chatId,
            "Ви вже підписані на сповіщення про перебіг ремонту.",
            buildMainMenuMarkup()
          );
        } else {
          await tgNotifyTextTo(
            chatId,
            "Ваше обладнання прийнято на ремонт до Surpresso Service. Ви підписані на сповіщення про перебіг ремонту.",
            buildMainMenuMarkup()
          );
        }

        return res.send({ ok: true });
      }

      if (cmd === "/stop" || cmd === "/unsubscribe") {
        const idToUnsub = equipmentId || (await getLatestEquipmentIdForChat(chatId));
        if (!idToUnsub) {
          await tgNotifyTextTo(chatId, "Не знайшли активну підписку.", buildMainMenuMarkup());
          return res.send({ ok: true });
        }

        if (!GAS_WEBAPP_URL || !GAS_SECRET) {
          await tgNotifyTextTo(chatId, "Підписка тимчасово недоступна.");
          return res.send({ ok: true });
        }

        await gasPost({
          action: "unsubscribe",
          id: idToUnsub,
          chatId: String(chatId),
        });

        await tgNotifyTextTo(
          chatId,
          `❌ Ви відписались від обладнання ${idToUnsub}.`,
          buildMainMenuMarkup()
        );
        return res.send({ ok: true });
      }

      if (cmd === "/start") {
        await tgNotifyTextTo(
          chatId,
          "Щоб підписатися, відкрийте паспорт обладнання та натисніть кнопку Telegram.",
          buildMainMenuMarkup()
        );
        return res.send({ ok: true });
      }
    }

    if (!text) return res.send({ ok: true });

    if (normalized === "паспорт") {
      const equipmentId = await getLatestEquipmentIdForChat(chatId);
      if (!equipmentId) {
        await tgNotifyTextTo(chatId, "Не знайшли активну підписку.", buildMainMenuMarkup());
        return res.send({ ok: true });
      }
      const passportLink = buildPassportLinkFromBase(PASSPORT_BASE_URL, equipmentId, { isPublic: true });
      if (!passportLink) {
        await tgNotifyTextTo(chatId, "Паспорт тимчасово недоступний.", buildMainMenuMarkup());
        return res.send({ ok: true });
      }
      await tgNotifyTextTo(chatId, `🔗 Паспорт: ${passportLink}`, buildMainMenuMarkup());
      return res.send({ ok: true });
    }

    if (normalized === "фотоальбом") {
      const equipmentId = await getLatestEquipmentIdForChat(chatId);
      if (!equipmentId) {
        await tgNotifyTextTo(chatId, "Не знайшли активну підписку.", buildMainMenuMarkup());
        return res.send({ ok: true });
      }
      const out = await gasPost({ action: "get", id: equipmentId });
      const eq = out?.equipment || {};
      if (!eq.folderUrl) {
        await tgNotifyTextTo(chatId, "Фотоальбом поки недоступний.", buildMainMenuMarkup());
        return res.send({ ok: true });
      }
      await tgNotifyTextTo(chatId, `📸 Фотоальбом: ${eq.folderUrl}`, buildMainMenuMarkup());
      return res.send({ ok: true });
    }

    if (normalized === "попередня вартість ремонту" || normalized === "попередня вартість") {
      const equipmentId = await getLatestEquipmentIdForChat(chatId);
      if (!equipmentId) {
        await tgNotifyTextTo(chatId, "Не знайшли активну підписку.", buildMainMenuMarkup());
        return res.send({ ok: true });
      }
      const out = await gasPost({ action: "get", id: equipmentId });
      const eq = out?.equipment || {};
      const passportLink = buildPassportLinkFromBase(PASSPORT_BASE_URL, equipmentId, { isPublic: true });
      const lines = [
        "💰 Запит попередньої вартості ремонту",
        `🆔 ID: ${equipmentId}`,
        eq.clientName ? `👤 ${eq.clientName}` : "",
        eq.clientPhone ? `📞 ${eq.clientPhone}` : "",
        passportLink ? `🔗 Паспорт: ${passportLink}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      await tgNotifyAdminText(lines);
      await tgNotifyTextTo(chatId, "✅ Запит передано в сервіс. Ми зв’яжемося з вами.", buildMainMenuMarkup());
      return res.send({ ok: true });
    }

    if (normalized === "статус") {
      const equipmentId = await getLatestEquipmentIdForChat(chatId);
      if (!equipmentId) {
        await tgNotifyTextTo(chatId, "Не знайшли активну підписку.", buildMainMenuMarkup());
        return res.send({ ok: true });
      }
      const out = await gasPost({ action: "get", id: equipmentId });
      const eq = out?.equipment || {};
      const statusText = [
        "🔎 Поточний статус",
        `🆔 ID: ${equipmentId}`,
        `🔧 ${eq.status || "—"}`,
        eq.lastComment ? `📝 ${eq.lastComment}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      await tgNotifyTextTo(chatId, statusText, buildMainMenuMarkup());
      return res.send({ ok: true });
    }

    if (normalized === "история") {
      const equipmentId = await getLatestEquipmentIdForChat(chatId);
      if (!equipmentId) {
        await tgNotifyTextTo(chatId, "Не знайшли активну підписку.", buildMainMenuMarkup());
        return res.send({ ok: true });
      }
      const history = await gasPost({ action: "history", id: equipmentId, limit: 5 });
      const rows = Array.isArray(history?.items) ? history.items : [];
      const lines = rows.map((entry) => {
        const ts = entry.ts ? `📅 ${entry.ts}` : "";
        const status = `🔁 ${entry.oldStatus || "—"} → ${entry.newStatus || "—"}`;
        const comment = entry.comment ? `📝 ${entry.comment}` : "";
        const actor = entry.actor ? `👷 ${entry.actor}` : "";
        return [ts, status, comment, actor].filter(Boolean).join("\n");
      });
      const historyText =
        lines.length > 0
          ? `📜 Історія\n${lines.join("\n\n")}`
          : "Історія поки порожня.";
      await tgNotifyTextTo(chatId, historyText, buildMainMenuMarkup());
      return res.send({ ok: true });
    }

    if (normalized === "связаться") {
      await sendContactMenu(chatId);
      return res.send({ ok: true });
    }

    if (normalized === "позвонить") {
      await tgNotifyTextTo(chatId, `📞 Телефон: ${SUPPORT_PHONE}`, buildMainMenuMarkup());
      return res.send({ ok: true });
    }

    if (normalized === "написать менеджеру") {
      await tgNotifyTextTo(chatId, `💬 Менеджер: ${MANAGER_LINK}`, buildMainMenuMarkup());
      return res.send({ ok: true });
    }

    if (normalized === "написать в сервис") {
      const equipmentId = await getLatestEquipmentIdForChat(chatId);
      pendingServiceMessages.set(chatId, { equipmentId });
      await tgNotifyTextTo(
        chatId,
        "Напишіть ваше повідомлення — передамо в сервіс.",
        buildMainMenuMarkup()
      );
      return res.send({ ok: true });
    }

    if (normalized === "назад") {
      await sendMainMenu(chatId);
      return res.send({ ok: true });
    }

    if (normalized === "отписка" || normalized === "відписатися") {
      const equipmentId = await getLatestEquipmentIdForChat(chatId);
      if (!equipmentId) {
        await tgNotifyTextTo(chatId, "Не знайшли активну підписку.", buildMainMenuMarkup());
        return res.send({ ok: true });
      }
      await gasPost({
        action: "unsubscribe",
        id: equipmentId,
        chatId: String(chatId),
      });
      await tgNotifyTextTo(
        chatId,
        `❌ Ви відписались від обладнання ${equipmentId}.`,
        buildMainMenuMarkup()
      );
      return res.send({ ok: true });
    }

    if (normalized === "оцінити") {
      await tgNotifyTextTo(chatId, "Дякуємо за оцінку! ⭐️", buildMainMenuMarkup());
      return res.send({ ok: true });
    }

    if (normalized === "питання") {
      await sendContactMenu(chatId, "Маєте питання? Оберіть спосіб зв’язку.");
      return res.send({ ok: true });
    }

    return res.send({ ok: true });
  } catch (err) {
    console.error("TG WEBHOOK ERROR:", err);
    return res.status(500).send({ ok: false });
  }
});

// =======================
// 3) Templates proxy (как было)
// =======================
const generateTemplateId = () =>
  crypto.randomUUID ? crypto.randomUUID() : `tpl-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

function ensureTemplateId(tpl) {
  if (!tpl) return tpl;
  return { ...tpl, id: tpl.id || tpl.templateId || tpl.createdAt || generateTemplateId() };
}

async function loadTemplatesFromDrive(fileId) {
  if (!fileId) return null;

  const url = `https://drive.google.com/uc?export=download&id=${fileId}`;
  const resp = await fetch(url, { headers: { Accept: "application/json,text/plain,*/*" } });

  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

  const contentType = (resp.headers.get("content-type") || "").toLowerCase();
  const text = await resp.text();

  if (
    contentType.includes("text/html") ||
    text.trim().startsWith("<!DOCTYPE html") ||
    text.includes("<html")
  ) {
    throw new Error("Drive returned HTML вместо JSON (файл не публичный или требует подтверждения)");
  }

  let items;
  try {
    items = JSON.parse(text);
  } catch {
    throw new Error("Не удалось распарсить JSON из Drive");
  }

  if (Array.isArray(items)) return items.map(ensureTemplateId);
  if (items && Array.isArray(items.items)) return items.items.map(ensureTemplateId);
  return [];
}

async function loadTemplatesLocal() {
  try {
    const raw = await fs.readFile(TEMPLATES_STORE, "utf8");
    const data = JSON.parse(raw);
    const items = Array.isArray(data) ? data : [];
    const normalized = items.map(ensureTemplateId);
    const missing = normalized.some((tpl, i) => tpl.id !== items[i]?.id);
    if (missing) await saveTemplatesLocal(normalized);
    return normalized;
  } catch {
    return [];
  }
}

async function saveTemplatesLocal(items) {
  await fs.writeFile(TEMPLATES_STORE, JSON.stringify(items, null, 2), "utf8");
}

app.get("/warehouse-templates", async (req, res) => {
  const fileId = req.query.file || process.env.TEMPLATES_FILE_ID;

  try {
    if (fileId) {
      const items = await loadTemplatesFromDrive(fileId);
      if (items) return res.send({ items: items.map(ensureTemplateId), source: "drive" });
    }
    const fallback = await loadTemplatesLocal();
    res.send({ items: fallback, source: "local" });
  } catch (err) {
    console.error("TEMPLATE LOAD ERROR", err);
    const fallback = await loadTemplatesLocal();
    res.status(200).send({ items: fallback, source: "local", warning: "drive_failed" });
  }
});

app.post("/warehouse-templates", async (req, res) => {
  const fileId = req.body?.file || process.env.TEMPLATES_FILE_ID;

  const template = ensureTemplateId({
    ...req.body,
    createdAt: req.body?.createdAt || new Date().toISOString(),
  });

  if (TEMPLATE_SAVE_URL) {
    try {
      const forward = await fetch(TEMPLATE_SAVE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...template, file: fileId }),
      });

      const data = await forward.json().catch(() => ({}));
      if (!forward.ok) throw new Error(data.error || `HTTP ${forward.status}`);

      return res.send({ ok: true, source: "webhook", id: template.id, ...data });
    } catch (err) {
      console.error("TEMPLATE SAVE ERROR (webhook)", err);
    }
  }

  try {
    const current = await loadTemplatesLocal();
    const updated = [template, ...current.filter((t) => t.id !== template.id)].slice(0, 200);
    await saveTemplatesLocal(updated);
    res.send({ ok: true, source: "local", id: template.id });
  } catch (err) {
    console.error("TEMPLATE SAVE ERROR (local)", err);
    res.status(500).send({ error: "save_failed" });
  }
});

app.put("/warehouse-templates/:id", async (req, res) => {
  const fileId = req.body?.file || process.env.TEMPLATES_FILE_ID;
  const id = req.params.id;

  const template = ensureTemplateId({ ...req.body, id, file: fileId });

  if (TEMPLATE_SAVE_URL) {
    try {
      const forward = await fetch(TEMPLATE_SAVE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...template, action: "update" }),
      });

      const data = await forward.json().catch(() => ({}));
      if (!forward.ok) throw new Error(data.error || `HTTP ${forward.status}`);

      return res.send({ ok: true, source: "webhook", id });
    } catch (err) {
      console.error("TEMPLATE UPDATE ERROR (webhook)", err);
    }
  }

  try {
    const current = await loadTemplatesLocal();
    const idx = current.findIndex((t) => t.id === id);
    const next =
      idx === -1 ? [template, ...current] : current.map((t) => (t.id === id ? { ...t, ...template } : t));
    await saveTemplatesLocal(next);

    res.send({ ok: true, source: idx === -1 ? "local_added" : "local_updated", id });
  } catch (err) {
    console.error("TEMPLATE UPDATE ERROR (local)", err);
    res.status(500).send({ error: "update_failed" });
  }
});

app.delete("/warehouse-templates/:id", async (req, res) => {
  const fileId = req.body?.file || process.env.TEMPLATES_FILE_ID;
  const id = req.params.id;

  if (TEMPLATE_SAVE_URL) {
    try {
      const forward = await fetch(TEMPLATE_SAVE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id, file: fileId }),
      });

      const data = await forward.json().catch(() => ({}));
      if (!forward.ok) throw new Error(data.error || `HTTP ${forward.status}`);

      return res.send({ ok: true, source: "webhook", id });
    } catch (err) {
      console.error("TEMPLATE DELETE ERROR (webhook)", err);
    }
  }

  try {
    const current = await loadTemplatesLocal();
    const filtered = current.filter((t) => t.id !== id);
    await saveTemplatesLocal(filtered);
    res.send({ ok: true, source: "local", id });
  } catch (err) {
    console.error("TEMPLATE DELETE ERROR (local)", err);
    res.status(500).send({ error: "delete_failed" });
  }
});

// =======================
// START
// =======================
app.listen(PORT, () => console.log("Server started on port " + PORT));







