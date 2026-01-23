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
async function tgSendText(text) {
  if (!TG_BOT || !TG_CHAT) return;
  await fetch(`https://api.telegram.org/bot${TG_BOT}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TG_CHAT,
      text,
      disable_web_page_preview: true,
    }),
  }).catch(() => {});
}

async function tgSendPhotos(photos, caption) {
  if (!TG_BOT || !TG_CHAT) return;

  if (!photos || photos.length === 0) {
    if (caption) await tgSendText(caption);
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

  tgForm.append("chat_id", TG_CHAT);
  tgForm.append("media", JSON.stringify(media));

  const tgResp = await fetch(`https://api.telegram.org/bot${TG_BOT}/sendMediaGroup`, {
    method: "POST",
    body: tgForm,
  });

  console.log("TG RESPONSE:", await tgResp.text());
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

function buildPassportLink(req, id) {
  return `${req.protocol}://${req.get("host")}/equip.html?id=${encodeURIComponent(id)}`;
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
  // "Уезжает на аренду"
  const s = normStatus(status);
  return (
    s === "уезжает на аренду" ||
    s.includes("уезжает") ||
    s.includes("виїжджає")
  );
}

function shouldNotifyStatus(eqOwner, newStatus) {
  if (eqOwner === "client") return isClientGiveAwayStatus(newStatus);
  if (eqOwner === "company") return isCompanyLeavingStatus(newStatus);
  return false;
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
app.get("/api/equip/:id", requirePwaKey, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const out = await gasPost({ action: "get", id });
    res.send(out);
  } catch (e) {
    res.status(500).send({ ok: false, error: String(e) });
  }
});

// ✅ изменить статус + Telegram (при нужных статусах)
app.post("/api/equip/:id/status", requirePwaKey, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const { newStatus, comment = "", actor = "", photos = [] } = req.body || {};
    if (!newStatus) return res.status(400).send({ ok: false, error: "no_newStatus" });

    // 1) Получим текущий equipment чтобы знать owner + старый статус
    const before = await gasPost({ action: "get", id });
    const eqBefore = before?.equipment || {};
    const oldStatus = String(eqBefore.status || "");

    // 2) Пишем новый статус в GAS
    const out = await gasPost({ action: "status", id, newStatus, comment, actor });

    // 3) Если это триггерный статус — шлем в TG (свежие фото с телефона если есть)
    const owner = String(eqBefore.owner || "");
    if (shouldNotifyStatus(owner, newStatus)) {
      const passportLink = buildPassportLink(req, id);

      const caption = buildStatusChangeCaption({
        eq: { ...eqBefore, id },
        oldStatus,
        newStatus,
        comment,
        actor,
        passportLink,
      });

      const safePhotos = Array.isArray(photos) ? photos.slice(0, 10) : [];
      await tgSendPhotos(safePhotos, caption);
    }

    res.send({ ok: true, ...out });
  } catch (e) {
    res.status(500).send({ ok: false, error: String(e) });
  }
});

// proxy drive preview (ORB fix)
app.get("/proxy-drive/:fileId", requirePwaKey, async (req, res) => {
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
    res.send(out);
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





