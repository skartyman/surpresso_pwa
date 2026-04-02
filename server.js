import express from "express";
import path from "path";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import FormData from "form-data";
import fs from "fs/promises";
import crypto from "crypto";
import {
  answerWithGemini,
  buildSources,
  createManualIndex,
  ensureIndexDir,
  getIndexStatus,
  loadManualIndex,
  removeManualIndex,
  scoreChunks,
  selectContentFallbackChunks,
  uniqueTopChunks,
} from "./manuals-ai.js";

// =======================
// APP
// =======================
const app = express();
const __dirname = path.resolve();
const PUBLIC_SVELTE_DIR = path.join(__dirname, "public", "public-svelte");
const LEGACY_PUBLIC_DIR = __dirname;
const TELEGRAM_MINIAPP_DIST_DIR = path.join(__dirname, "frontend", "dist");
const TELEGRAM_MINIAPP_FALLBACK_DIR = path.join(__dirname, "frontend");
const TELEGRAM_MINIAPP_UPLOADS_DIR = path.join(__dirname, "miniapp-telegram", "uploads");
const PUBLIC_ROUTE_PATHS = new Set([
  "/",
  "/events",
  "/booking",
  "/map",
  "/about",
  "/menu",
]);
const PUBLIC_ROUTE_PREFIXES = ["/events/"];
const PUBLIC_ROUTE_LOG_SAMPLE_RATE = Number(process.env.PUBLIC_ROUTE_LOG_SAMPLE_RATE || "1");
const DISABLE_SVELTE_PUBLIC = String(process.env.DISABLE_SVELTE_PUBLIC || "").toLowerCase() === "true";
let publicSvelteBuildAvailable = null;
let lastSvelteBuildCheckAt = 0;
let publicSvelteMissingLogged = false;

function shouldUseSveltePublic(reqPath = "") {
  if (PUBLIC_ROUTE_PATHS.has(reqPath)) return true;
  return PUBLIC_ROUTE_PREFIXES.some((prefix) => reqPath.startsWith(prefix));
}

function shouldSampleRouteLogs() {
  if (!Number.isFinite(PUBLIC_ROUTE_LOG_SAMPLE_RATE) || PUBLIC_ROUTE_LOG_SAMPLE_RATE <= 1) return true;
  return Math.random() * PUBLIC_ROUTE_LOG_SAMPLE_RATE < 1;
}

async function hasSveltePublicBuild() {
  const now = Date.now();
  if (publicSvelteBuildAvailable !== null && now - lastSvelteBuildCheckAt < 10_000) {
    return publicSvelteBuildAvailable;
  }

  try {
    await fs.access(path.join(PUBLIC_SVELTE_DIR, "index.html"));
    publicSvelteBuildAvailable = true;
  } catch {
    publicSvelteBuildAvailable = false;
  }

  lastSvelteBuildCheckAt = now;
  return publicSvelteBuildAvailable;
}

await ensureIndexDir();

app.use(bodyParser.json({ limit: "50mb" }));
app.use("/legacy", express.static(LEGACY_PUBLIC_DIR));

app.use(async (req, res, next) => {
  if (req.method !== "GET") return next();
  if (!shouldUseSveltePublic(req.path)) return next();

  const startedAt = Date.now();
  const logOutcome = (outcome, extra = {}) => {
    if (!shouldSampleRouteLogs()) return;
    console.info(
      JSON.stringify({
        level: "info",
        type: "public_route_resolution",
        route: req.path,
        method: req.method,
        outcome,
        durationMs: Date.now() - startedAt,
        ...extra,
      })
    );
  };

  if (DISABLE_SVELTE_PUBLIC) {
    logOutcome("legacy", { reason: "disabled_via_env" });
    return res.sendFile(path.join(LEGACY_PUBLIC_DIR, "index.html"));
  }

  const hasBuild = await hasSveltePublicBuild();
  if (hasBuild) {
    logOutcome("svelte");
    return res.sendFile(path.join(PUBLIC_SVELTE_DIR, "index.html"));
  }

  if (!publicSvelteMissingLogged) {
    publicSvelteMissingLogged = true;
    console.warn(
      JSON.stringify({
        level: "warn",
        type: "public_svelte_build_missing",
        dir: PUBLIC_SVELTE_DIR,
        fallback: "legacy_index",
      })
    );
  }

  logOutcome("legacy", { reason: "svelte_build_missing" });
  return res.sendFile(path.join(LEGACY_PUBLIC_DIR, "index.html"));
});

app.get("/tg", async (_req, res, next) => {
  try {
    await fs.access(path.join(TELEGRAM_MINIAPP_DIST_DIR, "index.html"));
    return res.sendFile(path.join(TELEGRAM_MINIAPP_DIST_DIR, "index.html"));
  } catch {
    try {
      await fs.access(path.join(TELEGRAM_MINIAPP_FALLBACK_DIR, "index.html"));
      return res.sendFile(path.join(TELEGRAM_MINIAPP_FALLBACK_DIR, "index.html"));
    } catch {
      return next();
    }
  }
});

app.use("/tg/assets", express.static(path.join(TELEGRAM_MINIAPP_DIST_DIR, "assets")));
app.use("/miniapp-telegram/uploads", express.static(TELEGRAM_MINIAPP_UPLOADS_DIR));

app.get("/tg/*", async (req, res, next) => {
  if (req.path.startsWith("/tg/api/")) return next();
  try {
    await fs.access(path.join(TELEGRAM_MINIAPP_DIST_DIR, "index.html"));
    return res.sendFile(path.join(TELEGRAM_MINIAPP_DIST_DIR, "index.html"));
  } catch {
    try {
      await fs.access(path.join(TELEGRAM_MINIAPP_FALLBACK_DIR, "index.html"));
      return res.sendFile(path.join(TELEGRAM_MINIAPP_FALLBACK_DIR, "index.html"));
    } catch {
      return next();
    }
  }
});

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
const MINIAPP_ENABLED = !["0", "false", "off"].includes(
  String(process.env.MINIAPP_ENABLED || "true").toLowerCase()
);
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

async function setupMiniAppLayer() {
  if (!MINIAPP_ENABLED) {
    console.warn("[miniapp] disabled by MINIAPP_ENABLED=false");
    return;
  }

  try {
    const [
      { createApiRouter },
      { createSupportController },
      {
        InMemoryClientRepository,
        InMemoryEquipmentRepository,
        InMemoryServiceRequestRepository,
      },
      { TelegramBotGateway },
    ] = await Promise.all([
      import("./backend/src/http/routes/apiRoutes.js"),
      import("./backend/src/http/controllers/supportController.js"),
      import("./backend/src/infrastructure/repositories/inMemoryRepositories.js"),
      import("./backend/src/infrastructure/telegram/botApi.js"),
    ]);

    const miniAppDeps = {
      clientRepository: new InMemoryClientRepository(),
      equipmentRepository: new InMemoryEquipmentRepository(),
      serviceRepository: new InMemoryServiceRequestRepository(),
    };
    const miniAppBotGateway = new TelegramBotGateway({ token: process.env.TELEGRAM_BOT_TOKEN || TG_NOTIFY_BOT });
    const miniAppSupportController = createSupportController(miniAppBotGateway);

    app.use("/api/telegram", createApiRouter(miniAppDeps));
    app.post("/api/telegram/support/notify", miniAppSupportController.notify);
  } catch (error) {
    const code = error?.code || "unknown_error";
    console.error(`[miniapp] disabled due to startup error (${code}): ${error?.message || error}`);
  }
}

app.get("/health", (_req, res) => {
  res.send({ ok: true });
});

function sanitizeManualText(value, max = 120) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, max);
}

function countQuestionIntents(value = "") {
  const original = String(value || "");
  const normalized = sanitizeManualText(original, 1000);
  if (!normalized) return 0;

  let count = (normalized.match(/\?/g) || []).length;
  count += (normalized.match(/(?:^|[.!]\s+)(?:\d+[.)]\s+|[-•]\s+)/g) || []).length;

  const lines = original
    .split(/\n+/)
    .map(part => part.trim())
    .filter(Boolean);
  if (lines.length > 1) count = Math.max(count, lines.length);

  const parts = normalized
    .split(/[!?]+|\.(?=\s+[A-ZА-ЯЁІЇЄ])/u)
    .map(part => part.trim())
    .filter(Boolean);
  if (parts.length > 1 && (normalized.includes('?') || normalized.includes(';'))) {
    count = Math.max(count, parts.length);
  }

  return Math.max(count, 1);
}

function hasMultipleQuestionIntents(value = "") {
  return countQuestionIntents(value) > 1;
}

function sanitizeManualFileName(value) {
  return sanitizeManualText(value || "manual", 160)
    .replace(/[^a-zA-Z0-9._ -]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "manual";
}

function manualPublicMeta(item) {
  return {
    id: item.id,
    title: item.title,
    brand: item.brand,
    model: item.model,
    originalName: item.originalName,
    fileName: item.fileName,
    mimeType: item.mimeType,
    size: item.size,
    uploadedAt: item.uploadedAt,
  };
}


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

function requireWarehouseTemplateSecret(req, res, next) {
  if (!PWA_KEY) return next();

  const key =
    req.headers["x-surpresso-key"] ||
    req.headers["x-server-key"] ||
    req.headers["x-api-key"] ||
    req.query.k;

  if (!key) {
    console.warn(`[WAREHOUSE AUTH] denied: missing secret for ${req.method} ${req.originalUrl}`);
    return res.status(401).send({ ok: false, error: "missing_secret" });
  }
  if (String(key) !== String(PWA_KEY)) {
    console.warn(`[WAREHOUSE AUTH] denied: invalid secret for ${req.method} ${req.originalUrl}`);
    return res.status(403).send({ ok: false, error: "invalid_secret" });
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

  try {
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
  } catch (err) {
    console.error("TG PHOTOS ERROR:", err);
    return false;
  }
}

async function tgSendPhotoUrlsTo(botToken, chatId, photoUrls, caption) {
  if (!botToken || !chatId) return;

  if (!photoUrls || photoUrls.length === 0) {
    if (caption) await tgSendTextTo(botToken, chatId, caption);
    return;
  }

  try {
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
  } catch (err) {
    console.error("TG PHOTO URLS ERROR:", err);
    return false;
  }
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

function parseBase64File(dataUrl, fallbackExt, fallbackMime) {
  const raw = String(dataUrl || "");
  const match = raw.match(/^data:([^;]+);base64,(.+)$/);
  const mime = match ? match[1] : fallbackMime || "application/octet-stream";
  const data = match ? match[2] : raw;
  const extFromMime = mime.split("/")[1] || "";
  const ext = extFromMime || fallbackExt || "bin";
  return {
    buffer: Buffer.from(data, "base64"),
    filename: `file.${ext}`,
    mime,
  };
}

async function tgSendVideoTo(botToken, chatId, video, caption) {
  if (!botToken || !chatId || !video) return;

  try {
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
  } catch (err) {
    console.error("TG VIDEO ERROR:", err);
    return false;
  }
}

async function tgSendDocumentTo(botToken, chatId, fileDataUrl, caption) {
  if (!botToken || !chatId || !fileDataUrl) return false;
  try {
    const payload = parseBase64File(fileDataUrl, "pdf", "application/pdf");
    const tgForm = new FormData();

    tgForm.append("chat_id", chatId);
    tgForm.append("document", payload.buffer, {
      filename: payload.filename,
      contentType: payload.mime,
    });
    if (caption) tgForm.append("caption", caption);

    const tgResp = await fetch(tgApiUrl(botToken, "sendDocument"), {
      method: "POST",
      body: tgForm,
    });

    console.log("TG DOCUMENT RESPONSE:", await tgResp.text());
    return tgResp.ok;
  } catch (err) {
    console.error("TG DOCUMENT ERROR:", err);
    return false;
  }
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

async function tgNotifyDocumentTo(chatId, fileDataUrl, caption) {
  return tgSendDocumentTo(TG_NOTIFY_BOT, chatId, fileDataUrl, caption);
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

const MAIN_MENU_LABELS = ["паспорт", "статус", "історія", "зв'язатися"];
const CONTACT_MENU_LABELS = ["зателефонувати", "написати менеджеру", "написати в сервіс", "назад"];
const FINAL_MENU_LABELS = ["відписатися", "оцінити", "питання"];

function normalizeMenuText(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[’ʻ`´ʼ]/g, "'");
}

async function createTrelloCardWithPhotos({ name, desc, labelId = "", photos = [] }) {
  if (!(TRELLO_KEY && TRELLO_TOKEN && TRELLO_LIST_ID)) {
    throw new Error("Trello is not configured");
  }

  const createCard = await fetch(
    `https://api.trello.com/1/cards?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idList: TRELLO_LIST_ID,
        name,
        desc,
        idLabels: labelId ? [labelId] : [],
      }),
    }
  );

  const cardData = await createCard.json();
  if (!cardData?.id) throw new Error("Trello card was not created");

  const safePhotos = Array.isArray(photos) ? photos : [];
  for (let i = 0; i < safePhotos.length; i++) {
    const buffer = Buffer.from(
      String(safePhotos[i]).replace(/^data:image\/\w+;base64,/, ""),
      "base64"
    );

    const attachForm = new FormData();
    attachForm.append("key", TRELLO_KEY);
    attachForm.append("token", TRELLO_TOKEN);
    attachForm.append("file", buffer, `photo${i}.jpg`);

    await fetch(
      `https://api.trello.com/1/cards/${cardData.id}/attachments`,
      { method: "POST", body: attachForm }
    );
  }

  return cardData.id;
}

function buildMainMenuMarkup() {
  return {
    keyboard: [
      ["Паспорт", "Статус"],
      ["Історія", "Зв’язатися"],
      ["Фотоальбом", "Попередня вартість ремонту"],
    ],
    resize_keyboard: true,
  };
}

function buildContactMenuMarkup() {
  return {
    keyboard: [
      ["Зателефонувати", "Написати менеджеру"],
      ["Написати в сервіс"],
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
  const safeEquipmentId = String(equipmentId || "").trim();
  return {
    inline_keyboard: [
      [
        {
          text: "Так",
          callback_data: `approval:${safeRequestId}:${safeEquipmentId}:yes`,
        },
        {
          text: "Ні",
          callback_data: `approval:${safeRequestId}:${safeEquipmentId}:no`,
        },
      ],
      [
        {
          text: "Уточнення",
          callback_data: `approval:${safeRequestId}:${safeEquipmentId}:q`,
        },
      ],
    ],
  };
}

function buildReplyClientMarkup(clientChatId) {
  const safeChatId = String(clientChatId || "").trim();
  return {
    inline_keyboard: [
      [
        {
          text: "↩️ Ответить клиенту",
          callback_data: `reply_client:${safeChatId}`,
        },
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

function isReadyStatus(status) {
  const s = normStatus(status);
  return s === "готово" || s.includes("готово");
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
  return [
    "📸 Додано фото",
    `🆔 ID: ${eq.id || ""}`,
    passportLink ? `🔗 Паспорт: ${passportLink}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function parseTelegramCommand(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const [cmd, payload] = raw.split(/\s+/);
  return { cmd, payload };
}

const pendingServiceMessages = new Map();
const pendingAdminReplies = new Map();

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

function buildSubscriberStatusCaption({ oldStatus, newStatus, comment, passportLink }) {
  const lines = [
    `🔔 Змінено статус: ${oldStatus || "—"} → ${newStatus || "—"}`,
    comment ? `📝 ${comment}` : "",
  ].filter(Boolean);

  if (isReadyStatus(newStatus)) {
    lines.push("✅ Техніка готова.");
    lines.push("Запрошуємо забрати техніку.");
  }

  if (passportLink) lines.push(`🔗 Паспорт: ${passportLink}`);
  return lines.join("\n");
}

function buildSubscriptionCaption(eq, passportLink) {
  const isClient = eq.owner === "client";
  const head = isClient ? "🟢 Прийом від клієнта" : "🔴 Обладнання компанії";
  const lines = [
    head,
    `🆔 ID: ${eq.id || ""}`,
    `🔧 Статус: ${eq.status || "—"}`,
  ];

  if (isClient) {
    lines.push(`👤 ${eq.clientName || ""}`);
    lines.push(`📞 ${eq.clientPhone || ""}`);
    lines.push(`📍 ${eq.clientLocation || ""}`);
    lines.push(`⚙️ ${eq.model || ""}`);
    lines.push(`🔢 ${eq.serial || ""}`);
  } else {
    lines.push(`📍 ${eq.companyLocation || ""}`);
    lines.push(`🛠 ${eq.name || ""}`);
    lines.push(`🔢 № ${eq.internalNumber || ""}`);
  }

  if (eq.lastComment) lines.push(`📝 ${eq.lastComment}`);
  if (passportLink) lines.push(`🔗 Паспорт: ${passportLink}`);
  return lines.filter(Boolean).join("\n");
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

      trelloCardId = await createTrelloCardWithPhotos({
        name: trelloName,
        desc,
        labelId,
        photos,
      });
      }

    res.send({ ok: true, trelloCardId, registry });
  } catch (err) {
    console.error("SERVER ERROR:", err);
    res.status(500).send({ ok: false, error: String(err) });
  }
});

app.post("/api/equip/:id/trello-task", requirePwaKey, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const { task = "", photos = [], actor = "" } = req.body || {};
    const taskText = String(task || "").trim();

    if (!id) return res.status(400).send({ ok: false, error: "no_id" });
    if (!taskText) return res.status(400).send({ ok: false, error: "no_task" });

    const before = await gasPost({ action: "get", id });
    const eq = before?.equipment || {};
    const owner = String(eq.owner || "");
    const safePhotos = Array.isArray(photos) ? photos.slice(0, 10) : [];

    const newStatus = "В роботі";
    await gasPost({
      action: "status",
      id,
      newStatus,
      comment: taskText,
      actor: String(actor || "").trim(),
      photos: [],
    });

    const labelId = pickLabel(eq);
    const passportLink = buildPassportLink(req, id, { isPublic: owner === "client" });
    const title = owner === "company"
      ? `🧩 Нова задача: ${eq.name || "Обладнання"} | №:${eq.internalNumber || id}`
      : `🧩 Нова задача: ${eq.clientName || "Клієнт"} | ${eq.model || id}`;

    const descLines = [
      "🛠 Нова задача для готового обладнання",
      `🆔 ID: ${id}`,
      `📌 Статус: ${newStatus}`,
      `📝 Задача: ${taskText}`,
      actor ? `👷 Виконавець: ${String(actor).trim()}` : "",
      passportLink ? `🔗 Паспорт: ${passportLink}` : "",
    ].filter(Boolean);

    const trelloCardId = await createTrelloCardWithPhotos({
      name: title,
      desc: descLines.join("\n"),
      labelId,
      photos: safePhotos,
    });

    return res.send({ ok: true, trelloCardId, status: newStatus });
  } catch (err) {
    console.error("TRELLO TASK ERROR:", err);
    return res.status(500).send({ ok: false, error: String(err) });
  }
});

// =======================
// 2) GAS proxy endpoints (PWA -> NODE -> GAS)
// =======================

app.get("/api/equip/search", requirePwaKey, async (req, res) => {
  try {
    const query = String(req.query.q || "").trim();
    const limit = Number(req.query.limit || 20);
    if (!query) return res.send({ ok: true, results: [] });

    const out = await gasPost({ action: "search", query, limit });
    res.send(out);
  } catch (e) {
    res.status(500).send({ ok: false, error: String(e) });
  }
});

// получить паспорт (данные)
app.get("/api/equip/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const out = await gasPost({ action: "get", id });
    const subscriberChatIds = await getSubscriberChatIds(id);
    res.send({
      ...out,
      tgBotUsername: TG_NOTIFY_BOT_USERNAME,
      subscriberCount: subscriberChatIds.length
    });
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
    console.log("[CHECK]", {
      id,
      owner,
      oldStatus,
      newStatus,
      statusChanged,
      commentChanged,
      shouldNotify: shouldNotifyStatus(owner, newStatus),
      isGiveAway: isClientGiveAwayStatus(newStatus),
    });

    if ((statusChanged || commentChanged) && shouldNotifyStatus(owner, newStatus)) {
      const passportLink = buildPassportLink(req, id, { isPublic: owner === "client" });
      const mainMenuMarkup = buildMainMenuMarkup();

      const adminCaption = buildStatusChangeCaption({
        eq: { ...eqBefore, id, ...locationPayload },
        oldStatus,
        newStatus,
        comment,
        actor,
        passportLink,
      });
      const clientCaption = buildSubscriberStatusCaption({
        oldStatus,
        newStatus,
        comment,
        passportLink,
      });

      const clientVideoCaption = safePhotos.length ? "" : clientCaption;
      const adminVideoCaption = safePhotos.length ? "" : adminCaption;

      if (owner === "client") {
        console.log("[CLIENT_FLOW]", {
          toNotifyBot: true,
          toAdminBotOnGiveAway: statusChanged && isClientGiveAwayStatus(newStatus),
        });
        if (safePhotos.length) {
          await notifySubscribers({
            equipmentId: id,
            photos: safePhotos,
            caption: clientCaption,
            replyMarkup: mainMenuMarkup,
          });
        } else if (clientCaption) {
          await notifySubscribers({
            equipmentId: id,
            photos: [],
            caption: clientCaption,
            replyMarkup: mainMenuMarkup,
          });
        }
        if (safeVideos.length) {
          await notifySubscribersVideos({
            equipmentId: id,
            videos: safeVideos,
            caption: clientVideoCaption,
            replyMarkup: mainMenuMarkup,
          });
        }
        if (statusChanged && isClientGiveAwayStatus(newStatus)) {
          if (safePhotos.length) {
            await tgSendPhotos(safePhotos, adminCaption);
          } else if (adminCaption) {
            await tgSendText(adminCaption);
          }
          if (safeVideos.length) {
            await tgSendVideos(safeVideos, adminVideoCaption);
          }
        }

        if (statusChanged && isClientGiveAwayStatus(newStatus)) {
          const chatIds = await getSubscriberChatIds(id);
          await Promise.all(
            chatIds.map((chatId) => sendFinalMenu(chatId))
          );
        }
      } else {
        if (safePhotos.length) {
          await tgSendPhotos(safePhotos, adminCaption);
        } else if (adminCaption) {
          await tgSendText(adminCaption);
        }
        if (safeVideos.length) {
          await tgSendVideos(safeVideos, adminVideoCaption);
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
    const { text = "", actor = "", photos = [] } = req.body || {};
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
    const safePhotos = Array.isArray(photos) ? photos.slice(0, 2) : [];
    const message =
      `🛠 Потрібне погодження\n` +
      `🆔 ID: ${id}\n` +
      `📝 ${text}`;

    if (!chatIds.length) {
      return res.send({ ok: true, requestId, sent: 0, warning: "no_subscribers" });
    }

    const notifyResults = await Promise.all(
      chatIds.map(async (chatId) => {
        if (safePhotos.length) {
          await tgNotifyPhotosTo(chatId, safePhotos, message);
          return tgNotifyTextTo(chatId, "Підтвердіть, будь ласка:", buildApprovalMarkup({ requestId, equipmentId: id }));
        }
        return tgNotifyTextTo(chatId, message, buildApprovalMarkup({ requestId, equipmentId: id }));
      })
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
    const { base64, photos, caption = "", skipNotify = false } = req.body || {};
    const list = base64 ? [base64] : Array.isArray(photos) ? photos.filter(Boolean) : [];
    if (!list.length) return res.status(400).send({ ok: false, error: "no_photos" });

    const uploads = [];
    for (let i = 0; i < list.length; i++) {
      const result = await gasPost({ action: "photo", id, base64: list[i], caption });
      uploads.push(result);
    }
    const before = await gasPost({ action: "get", id });
    const eq = before?.equipment || {};

    if (eq.owner === "client" && !skipNotify) {
      const passportLink = buildPassportLink(req, id, { isPublic: true });
      const tgCaption = buildPhotoAddedCaption({
        eq: { ...eq, id },
        passportLink,
      });
      await notifySubscribers({
        equipmentId: id,
        photos: list,
        caption: tgCaption,
        replyMarkup: buildMainMenuMarkup(),
      });
    }
    res.send({ ok: true, items: uploads });
  } catch (e) {
    res.status(500).send({ ok: false, error: String(e) });
  }
});


app.post("/api/equip/:id/photo/delete", requirePwaKey, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const fileId = String(req.body?.fileId || "").trim();
    if (!id) return res.status(400).send({ ok: false, error: "no_id" });
    if (!fileId) return res.status(400).send({ ok: false, error: "no_fileId" });

    const out = await gasPost({ action: "deletePhoto", id, fileId });
    if (!out?.ok) {
      return res.status(400).send({ ok: false, error: out?.error || "delete_failed" });
    }

    res.send({ ok: true, fileId });
  } catch (e) {
    res.status(500).send({ ok: false, error: String(e) });
  }
});

app.post("/api/equip/:id/invoice", requirePwaKey, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const { text = "", file = "" } = req.body || {};
    if (!id || (!text && !file)) {
      return res.status(400).send({ ok: false, error: "missing_fields" });
    }

    const chatIds = await getSubscriberChatIds(id);
    if (!chatIds.length) return res.send({ ok: true, sent: 0, warning: "no_subscribers" });

    const passportLink = buildPassportLink(req, id, { isPublic: true });
    const caption = [
      "💳 Рахунок",
      `🆔 ID: ${id}`,
      text ? `📝 ${text}` : "",
      passportLink ? `🔗 Паспорт: ${passportLink}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const notifyResults = await Promise.all(
      chatIds.map(async (chatId) => {
        if (file) {
          await tgNotifyDocumentTo(chatId, file, caption);
          return tgNotifyTextTo(chatId, "Меню", buildMainMenuMarkup());
        }
        return tgNotifyTextTo(chatId, caption, buildMainMenuMarkup());
      })
    );

    const sent = notifyResults.filter(Boolean).length;
    res.send({ ok: true, sent });
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
const telegramWebhookHandler = async (req, res) => {
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
      if (chatId && data.startsWith("reply_client:")) {
        const clientChatId = data.split(":")[1] || "";
        if (clientChatId) {
          pendingAdminReplies.set(String(chatId), { clientChatId });
          await tgNotifyTextTo(
            chatId,
            "Ок, напишите ответ одним сообщением. Отмена: /cancel"
          );
        }
      }
      if (chatId && data.startsWith("approval:")) {
        const parts = data.split(":");
        const requestId = parts[1] || "";
        const rawAnswer = parts[3] ? parts[3] : parts[2];
        const normalizedAnswer =
          rawAnswer === "q" ? "question" : String(rawAnswer || "").trim();
        let equipmentId = parts[2] || "";

        if (parts.length === 3 && requestId) {
          const lookup = await gasPost({
            action: "approvalLookup",
            requestId,
          });
          equipmentId = String(lookup?.equipmentId || "").trim();
        }

        if (!equipmentId) {
          throw new Error("missing_equipment_id");
        }
        await gasPost({
          action: "approvalResponse",
          requestId,
          equipmentId,
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

        await tgNotifyAdminText(
          `✅ Відповідь клієнта\n🆔 ID: ${equipmentId}\n💬 ${answerLabel}\n👤 @${user.username || "—"}`
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
      const trimmedText = String(text || "").trim();
      if (pendingAdminReplies.has(String(chatId))) {
        if (trimmedText === "/cancel") {
          pendingAdminReplies.delete(String(chatId));
          await tgNotifyTextTo(chatId, "Відмінено.");
          return res.send({ ok: true });
        }
        if (trimmedText && !trimmedText.startsWith("/")) {
          const pending = pendingAdminReplies.get(String(chatId));
          pendingAdminReplies.delete(String(chatId));
          await tgNotifyTextTo(
            pending.clientChatId,
            `💬 Відповідь менеджера:\n${trimmedText}`,
            buildMainMenuMarkup()
          );
          await tgNotifyTextTo(chatId, "✅ Відправлено клієнту.");
          return res.send({ ok: true });
        }
      }
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
      await tgNotifyTextTo(
        TG_NOTIFY_CHAT_ID,
        adminMessage,
        buildReplyClientMarkup(chatId)
      );
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
        const data = await gasPost({ action: "get", id: equipmentId });
        const eq = data?.equipment || {};
        const passportLink = buildPassportLinkFromBase(PASSPORT_BASE_URL, equipmentId, { isPublic: true });
        const intro = subscription?.alreadySubscribed
          ? "Ви вже підписані на сповіщення про перебіг ремонту."
          : "Ви підписані на сповіщення про перебіг ремонту.";
        const caption = buildSubscriptionCaption(eq, passportLink);
        await tgNotifyTextTo(chatId, [intro, caption].filter(Boolean).join("\n\n"), buildMainMenuMarkup());

        if (!subscription?.alreadySubscribed && TG_NOTIFY_CHAT_ID) {
          const adminMessage = [
            "🔔 Нова підписка на бот сповіщень",
            `🆔 Equipment ID: ${equipmentId}`,
            `👤 ${user.first_name || ""} ${user.last_name || ""} (@${user.username || "—"})`,
            passportLink ? `🔗 Паспорт: ${passportLink}` : "",
            `Chat ID: ${chatId}`,
          ]
            .filter(Boolean)
            .join("\n");
          await tgNotifyTextTo(
            TG_NOTIFY_CHAT_ID,
            adminMessage,
            buildReplyClientMarkup(chatId)
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
        `Chat ID: ${chatId}`,
      ]
        .filter(Boolean)
        .join("\n");

      if (TG_NOTIFY_CHAT_ID) {
        await tgNotifyTextTo(
          TG_NOTIFY_CHAT_ID,
          lines,
          buildReplyClientMarkup(chatId)
        );
      }
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

    if (normalized === "история" || normalized === "історія") {
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

    if (normalized === "связаться" || normalized === "зв'язатися") {
      await sendContactMenu(chatId);
      return res.send({ ok: true });
    }

    if (normalized === "позвонить" || normalized === "зателефонувати") {
      await tgNotifyTextTo(chatId, `📞 Телефон: ${SUPPORT_PHONE}`, buildMainMenuMarkup());
      return res.send({ ok: true });
    }

    if (normalized === "написать менеджеру" || normalized === "написати менеджеру") {
      await tgNotifyTextTo(chatId, `💬 Менеджер: ${MANAGER_LINK}`, buildMainMenuMarkup());
      return res.send({ ok: true });
    }

    if (normalized === "написать в сервис" || normalized === "написати в сервіс") {
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
};

app.post("/api/telegram/webhook", telegramWebhookHandler);
app.post("/tg/webhook", telegramWebhookHandler);

// =======================
// 3) Templates proxy (как было)
// =======================
const generateTemplateId = () =>
  crypto.randomUUID ? crypto.randomUUID() : `tpl-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

function ensureTemplateId(tpl) {
  if (!tpl) return tpl;
  return { ...tpl, id: tpl.id || tpl.templateId || tpl.createdAt || generateTemplateId() };
}

async function listTemplatesFromGas(fileId) {
  const out = await gasPost({ action: "templatesList", file: fileId || "" });
  const items = Array.isArray(out?.items) ? out.items : [];
  return items.map(ensureTemplateId);
}

async function fetchManualsList() {
  const out = await gasPost({ action: "manualsList" });
  const items = Array.isArray(out.items) ? out.items : [];
  return items.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
}

async function fetchManualById(id) {
  const out = await gasPost({ action: "manualGet", id });
  if (!out?.item?.id) {
    const error = new Error("manual_not_found");
    error.code = "manual_not_found";
    throw error;
  }
  return out.item;
}

async function fetchManualPdfBuffer(manual) {
  if (!manual?.fileId) {
    const error = new Error("manual_not_found");
    error.code = "manual_not_found";
    throw error;
  }

  const response = await fetch(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(manual.fileId)}`);
  if (!response.ok) throw new Error(`Drive error ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function sendManualPdfInline(res, manual, buffer, { cacheControl = "private, max-age=300" } = {}) {
  const fileName = String(manual?.originalName || manual?.fileName || `${manual?.id || 'manual'}.pdf`)
    .replace(/["\r\n]+/g, "_");
  res.setHeader("Content-Type", manual?.mimeType || "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'self'; sandbox allow-same-origin allow-scripts;");
  res.setHeader("Cache-Control", cacheControl);
  res.send(buffer);
}

function sendManualsApiError(res, err, fallback = "manuals_failed") {
  const code = String(err?.code || "");
  const message = String(err?.message || "");

  if (code === "manual_not_found" || message.includes("manual_not_found")) {
    return res.status(404).send({ ok: false, error: "manual_not_found" });
  }

  if (code === "non_extractable_pdf" || message.includes("нельзя проиндексировать автоматически")) {
    return res.status(422).send({ ok: false, error: "non_extractable_pdf", message: "Этот PDF пока нельзя проиндексировать автоматически" });
  }

  if (code === "gemini_not_configured") {
    return res.status(503).send({ ok: false, error: "gemini_not_configured", message: "GEMINI_API_KEY не настроен на сервере" });
  }

  if (code === "gemini_failed") {
    return res.status(502).send({ ok: false, error: "gemini_failed", message: err.message || "AI service failed" });
  }

  return res.status(500).send({ ok: false, error: fallback });
}

async function ensureFreshManualIndex(manual) {
  const status = await getIndexStatus(manual);
  if (status.status === "indexed") {
    return loadManualIndex(manual.id);
  }

  console.log('[manuals] auto-index trigger', { manualId: manual?.id || null, previousStatus: status.status });
  const pdfBuffer = await fetchManualPdfBuffer(manual);
  return createManualIndex({ manual, pdfBuffer });
}

async function buildManualAnswer({ question, manuals, limit = 6, skipIndexFailures = false }) {
  const scored = [];
  const fallbackPool = [];

  for (const manual of manuals) {
    let index;
    try {
      index = await ensureFreshManualIndex(manual);
    } catch (indexError) {
      if (skipIndexFailures) continue;
      throw indexError;
    }

    if (!index || index.status !== "indexed" || !Array.isArray(index.chunks) || !index.chunks.length) continue;
    const manualScoped = {
      manualId: index.manualId,
      title: index.title,
      brand: index.brand,
      model: index.model,
    };
    const scoredChunks = scoreChunks({
      question,
      manual: manualScoped,
      chunks: index.chunks,
    });
    scored.push(...scoredChunks);
    const manualPositiveChunks = scoredChunks.filter(chunk => (chunk.score || 0) > 0);
    fallbackPool.push(...scoredChunks.filter(chunk => (chunk.weakScore || 0) > 0));
    if (!manualPositiveChunks.length) {
      fallbackPool.push(...selectContentFallbackChunks(scoredChunks.length ? scoredChunks : index.chunks, 3).map(chunk => ({
        ...chunk,
        weakScore: Math.max(Number(chunk.weakScore || 0), 0.25),
        fallbackReason: "content_preview",
      })));
    }
  }

  const ranked = scored.sort((a, b) => (b.score - a.score) || (b.weakScore - a.weakScore));
  let bestChunks = uniqueTopChunks(ranked.filter(chunk => (chunk.score || 0) > 0), limit);

  if (!bestChunks.length) {
    bestChunks = uniqueTopChunks(
      fallbackPool.sort((a, b) => (b.weakScore - a.weakScore) || (b.score - a.score)),
      Math.min(limit, 3),
    );
  }

  if (!bestChunks.length) {
    return {
      answer: "В найденных фрагментах нет достаточных данных для ответа на этот вопрос.",
      sources: [],
      chunks: [],
    };
  }

  const answer = await answerWithGemini({ question, chunks: bestChunks });
  return {
    answer: answer || "В найденных фрагментах нет достаточных данных для ответа на этот вопрос.",
    sources: buildSources(question, bestChunks),
    chunks: bestChunks,
  };
}

app.get("/check", (req, res) => {
  res.sendFile(path.join(__dirname, "check.html"));
});

app.get("/manuals", (req, res) => {
  res.sendFile(path.join(__dirname, "manuals.html"));
});

app.get("/manuals/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "manuals.html"));
});

app.get("/diagrams", (req, res) => {
  res.sendFile(path.join(__dirname, "diagrams.html"));
});

app.get("/api/manuals", async (req, res) => {
  try {
    const items = await fetchManualsList();
    res.send({ items: items.map(manualPublicMeta) });
  } catch (err) {
    console.error("MANUALS LIST ERROR", err);
    res.status(500).send({ error: "manuals_list_failed" });
  }
});

app.post("/api/manuals", async (req, res) => {
  try {
    const title = sanitizeManualText(req.body?.title || req.body?.originalName || "Без названия", 160);
    const brand = sanitizeManualText(req.body?.brand || "", 80);
    const model = sanitizeManualText(req.body?.model || "", 80);
    const originalName = sanitizeManualFileName(req.body?.originalName || `${title}.pdf`);
    const mimeType = String(req.body?.mimeType || "application/pdf");
    const dataUrl = String(req.body?.data || "");

    if (mimeType !== "application/pdf") {
      return res.status(400).send({ ok: false, error: "invalid_mime_type" });
    }

    const match = dataUrl.match(/^data:application\/pdf;base64,(.+)$/);
    if (!match) {
      return res.status(400).send({ ok: false, error: "invalid_payload" });
    }

    const buffer = Buffer.from(match[1], "base64");
    if (!buffer.length || buffer.length > 20 * 1024 * 1024) {
      return res.status(400).send({ ok: false, error: "invalid_size" });
    }

    if (buffer.subarray(0, 4).toString("utf8") !== "%PDF") {
      return res.status(400).send({ ok: false, error: "invalid_pdf" });
    }

    const out = await gasPost({
      action: "manualUpload",
      manual: {
        title,
        brand,
        model,
        originalName,
        mimeType: "application/pdf",
        data: dataUrl,
      },
    });

    const item = out.item || {};
    const index = await createManualIndex({ manual: item, pdfBuffer: buffer });
    const indexStatus = {
      status: index.status || "not_indexed",
      updatedAt: index.updatedAt || null,
      chunksCount: Array.isArray(index.chunks) ? index.chunks.length : 0,
      pagesCount: index.pagesCount || 0,
      sampleTextPreview: index.sampleTextPreview || "",
      extractionMethod: index.extractionMethod || index.extractor || null,
      qualityScore: index.qualityScore ?? null,
      error: index.error || null,
    };

    res.send({ ok: true, item: manualPublicMeta(item), indexStatus });
  } catch (err) {
    console.error("MANUALS SAVE ERROR", err);
    res.status(500).send({ ok: false, error: "manuals_save_failed" });
  }
});

app.post("/api/manuals/ask", async (req, res) => {
  try {
    const question = sanitizeManualText(req.body?.question || "", 1000);
    if (!question) return res.status(400).send({ ok: false, error: "question_required" });
    if (hasMultipleQuestionIntents(question)) return res.status(400).send({ ok: false, error: "single_question_only", message: "Отправьте один вопрос за один запрос." });

    const manuals = await fetchManualsList();
    if (!manuals.length) {
      return res.status(404).send({ ok: false, error: "manuals_empty", message: "В библиотеке пока нет мануалов" });
    }

    const result = await buildManualAnswer({ question, manuals, limit: 8, skipIndexFailures: true });
    res.send({ ok: true, answer: result.answer, sources: result.sources });
  } catch (err) {
    console.error("MANUALS ASK ALL ERROR", err);
    sendManualsApiError(res, err, "manuals_ask_failed");
  }
});

app.post("/api/manuals/reindex", async (req, res) => {
  try {
    const manuals = await fetchManualsList();
    const results = [];

    for (const manual of manuals) {
      try {
        const pdfBuffer = await fetchManualPdfBuffer(manual);
        const index = await createManualIndex({ manual, pdfBuffer });
        results.push({
          manualId: manual.id,
          title: manual.title,
          status: index.status,
          chunksCount: Array.isArray(index.chunks) ? index.chunks.length : 0,
          pagesCount: index.pagesCount || 0,
          sampleTextPreview: index.sampleTextPreview || "",
          extractionMethod: index.extractionMethod || index.extractor || null,
          qualityScore: index.qualityScore ?? null,
          updatedAt: index.updatedAt,
        });
      } catch (indexError) {
        const status = await getIndexStatus(manual);
        results.push({
          manualId: manual.id,
          title: manual.title,
          status: status.status,
          chunksCount: status.chunksCount,
          pagesCount: status.pagesCount || 0,
          sampleTextPreview: status.sampleTextPreview || "",
          extractionMethod: status.extractionMethod || null,
          qualityScore: status.qualityScore ?? null,
          updatedAt: status.updatedAt,
          error: status.error || indexError.message,
        });
      }
    }

    res.send({ ok: true, results });
  } catch (err) {
    console.error("MANUALS REINDEX ERROR", err);
    sendManualsApiError(res, err, "manuals_reindex_failed");
  }
});

app.get("/api/manuals/:id/preview", async (req, res) => {
  try {
    const manual = await fetchManualById(req.params.id);
    const buffer = await fetchManualPdfBuffer(manual);
    sendManualPdfInline(res, manual, buffer, { cacheControl: "no-store" });
  } catch (err) {
    console.error("MANUALS PREVIEW ERROR", err);
    if (String(err?.message || "").includes("manual_not_found") || String(err?.code || "") === "manual_not_found") {
      return res.status(404).send("manual_not_found");
    }
    res.status(500).send("manual_preview_failed");
  }
});

app.get("/api/manuals/:id/file", async (req, res) => {
  try {
    const manual = await fetchManualById(req.params.id);
    const buffer = await fetchManualPdfBuffer(manual);
    sendManualPdfInline(res, manual, buffer);
  } catch (err) {
    console.error("MANUALS FILE ERROR", err);
    if (String(err?.message || "").includes("manual_not_found") || String(err?.code || "") === "manual_not_found") {
      return res.status(404).send("manual_not_found");
    }
    res.status(500).send("manual_file_failed");
  }
});

app.get("/api/manuals/:id/index-status", async (req, res) => {
  try {
    const manual = await fetchManualById(req.params.id);
    const status = await getIndexStatus(manual);
    res.send({ ok: true, ...status });
  } catch (err) {
    console.error("MANUALS INDEX STATUS ERROR", err);
    sendManualsApiError(res, err, "manual_index_status_failed");
  }
});

app.post("/api/manuals/:id/index", async (req, res) => {
  try {
    const manual = await fetchManualById(req.params.id);
    const pdfBuffer = await fetchManualPdfBuffer(manual);
    const index = await createManualIndex({ manual, pdfBuffer });
    res.send({
      ok: true,
      status: index.status || "not_indexed",
      updatedAt: index.updatedAt || null,
      chunksCount: Array.isArray(index.chunks) ? index.chunks.length : 0,
      pagesCount: index.pagesCount || 0,
      sampleTextPreview: index.sampleTextPreview || "",
      extractionMethod: index.extractionMethod || index.extractor || null,
      qualityScore: index.qualityScore ?? null,
      error: index.error || null,
    });
  } catch (err) {
    console.error("MANUALS INDEX ERROR", err);
    sendManualsApiError(res, err, "manual_index_failed");
  }
});

app.post("/api/manuals/:id/ask", async (req, res) => {
  try {
    const question = sanitizeManualText(req.body?.question || "", 1000);
    if (!question) return res.status(400).send({ ok: false, error: "question_required" });
    if (hasMultipleQuestionIntents(question)) return res.status(400).send({ ok: false, error: "single_question_only", message: "Отправьте один вопрос за один запрос." });

    const manual = await fetchManualById(req.params.id);
    const result = await buildManualAnswer({ question, manuals: [manual], limit: 6 });
    res.send({ ok: true, answer: result.answer, sources: result.sources });
  } catch (err) {
    console.error("MANUALS ASK ONE ERROR", err);
    sendManualsApiError(res, err, "manual_ask_failed");
  }
});

app.delete("/api/manuals/:id", async (req, res) => {
  try {
    await removeManualIndex(req.params.id);
    await gasPost({ action: "manualDelete", id: req.params.id });
    res.send({ ok: true, id: req.params.id });
  } catch (err) {
    console.error("MANUALS DELETE ERROR", err);
    if (String(err?.message || "").includes("manual_not_found")) {
      return res.status(404).send({ ok: false, error: "manual_not_found" });
    }
    res.status(500).send({ ok: false, error: "manual_delete_failed" });
  }
});

async function handleWarehouseTemplatesList(req, res) {
  const fileId = req.query.file || process.env.TEMPLATES_FILE_ID || "";

  try {
    const items = await listTemplatesFromGas(fileId);
    res.send({ items, source: "gas" });
  } catch (err) {
    console.error("TEMPLATE LOAD ERROR", err);
    res.status(500).send({ ok: false, error: "templates_list_failed" });
  }
}

async function handleWarehouseTemplateCreate(req, res) {
  const fileId = req.body?.file || process.env.TEMPLATES_FILE_ID || "";

  const template = ensureTemplateId({
    ...req.body,
    // В GAS action="create" зарезервирован под карточки оборудования.
    // Для шаблонов складских наборов action можно не передавать вовсе.
    createdAt: req.body?.createdAt || new Date().toISOString(),
    file: fileId,
  });

  try {
    const out = await gasPost(template);
    if (out?.ok === false) throw new Error(out.error || "templates_save_failed");
    res.send({ ok: true, source: "gas", id: template.id });
  } catch (err) {
    const detail = String(err?.message || "save_failed");
    console.error("TEMPLATE SAVE ERROR", detail);
    res.status(500).send({ ok: false, error: "save_failed", detail });
  }
}

async function handleWarehouseTemplateUpdate(req, res) {
  const fileId = req.body?.file || process.env.TEMPLATES_FILE_ID || "";
  const id = req.params.id;

  const template = ensureTemplateId({ ...req.body, id, file: fileId, action: "update" });

  try {
    const out = await gasPost(template);
    if (out?.ok === false) throw new Error(out.error || "templates_update_failed");
    res.send({ ok: true, source: "gas", id });
  } catch (err) {
    const detail = String(err?.message || "update_failed");
    console.error("TEMPLATE UPDATE ERROR", detail);
    res.status(500).send({ ok: false, error: "update_failed", detail });
  }
}

async function handleWarehouseTemplateDelete(req, res) {
  const fileId = req.body?.file || process.env.TEMPLATES_FILE_ID || "";
  const id = req.params.id;

  try {
    const out = await gasPost({ action: "delete", id, file: fileId });
    if (out?.ok === false) throw new Error(out.error || "templates_delete_failed");
    res.send({ ok: true, source: "gas", id });
  } catch (err) {
    const detail = String(err?.message || "delete_failed");
    console.error("TEMPLATE DELETE ERROR", detail);
    res.status(500).send({ ok: false, error: "delete_failed", detail });
  }
}

app.get("/warehouse-templates", handleWarehouseTemplatesList);
app.post("/warehouse-templates", requireWarehouseTemplateSecret, handleWarehouseTemplateCreate);
app.put("/warehouse-templates/:id", requireWarehouseTemplateSecret, handleWarehouseTemplateUpdate);
app.delete("/warehouse-templates/:id", requireWarehouseTemplateSecret, handleWarehouseTemplateDelete);

app.get("/api/warehouse-templates", handleWarehouseTemplatesList);
app.post("/api/warehouse-templates", requireWarehouseTemplateSecret, handleWarehouseTemplateCreate);
app.put("/api/warehouse-templates/:id", requireWarehouseTemplateSecret, handleWarehouseTemplateUpdate);
app.delete("/api/warehouse-templates/:id", requireWarehouseTemplateSecret, handleWarehouseTemplateDelete);

// =======================
// START
// =======================
await setupMiniAppLayer();
app.listen(PORT, () => console.log("Server started on port " + PORT));
