import express from "express";
import path from "path";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import FormData from "form-data";
import fs from "fs/promises";
import crypto from "crypto";

const app = express();
const __dirname = path.resolve();

app.use(bodyParser.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname)));

// ======== 🔧 TRELLO CONFIG ========
const TRELLO_KEY = "7100bce291a7e050e1e08d7375ddb49a";
const TRELLO_TOKEN = "ATTA44fcab24691acc78f7123515c0728b3a6df7fd2a807b8ed515a87a4dad54ddff0EA3F5E5";
const TRELLO_LIST_ID = "65895fe3788e6f790d29e806";

// ====== CORRECT LABEL IDS ======
const LABEL_OUR = "65895fe3788e6f790d29e8b0";       // НАШЕ Майстерня
const LABEL_CLIENT = "65895fe3788e6f790d29e8ad";     // КЛ Майстерня
const LABEL_CONTRACT = "65a69d546560f1050990998d";   // ОБСЛ Майстерня
const TEMPLATE_SAVE_URL = process.env.TEMPLATE_SAVE_WEBHOOK ||
  "https://script.google.com/macros/s/AKfycbzQjkfMUxYT2RRsnclIu8yWzdnW2dqIV-9Q8L5pGrfN9a8YvIPVTESM_JPo8pPHS10V/exec";
const TEMPLATES_STORE = path.join(__dirname, "warehouse-templates.json");

const generateTemplateId = () => crypto.randomUUID ? crypto.randomUUID() : `tpl-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

function ensureTemplateId(tpl) {
  if (!tpl) return tpl;
  return {
    ...tpl,
    id: tpl.id || tpl.templateId || tpl.createdAt || generateTemplateId()
  };
}

function pickLabel(card) {
    if (card.owner === "company") return LABEL_OUR;
    if (card.owner === "client" && card.isContract) return LABEL_CONTRACT;
    return LABEL_CLIENT;
}

// === SEND TO TELEGRAM + TRELLO ===
app.post("/send-equipment", async (req, res) => {
  try {
    const { card, photos } = req.body;

    const BOT = "8392764169:AAFhMqj6fxSbPHbrIB8EyYCqAqdOIdGt9Yg";
    const CHAT = "-1002171619772";

    // ===== Формирование подписи =====
    let caption = "";

    if (card.owner === "client") {
      caption =
        `🟢 Прийом від клієнта\n` +
        `👤 Ім’я: ${card.clientName}\n` +
        `📞 Телефон: ${card.clientPhone}\n` +
        `📍 Локація: ${card.clientLocation}\n` +
        `⚙️ Модель: ${card.model}\n` +
        `🔢 Серійний: ${card.serial}\n` +
        `❗ Проблема: ${card.problem}\n`;

      if (card.isContract)
        caption += `📄 Клієнт за договором (обслуговування)\n`;

    } else {
      caption =
        `🔴 Обладнання компанії\n` +
        `📍 Локація: ${card.companyLocation}\n` +
        `🛠 Назва: ${card.name}\n` +
        `🔢 Внутрішній №: ${card.internalNumber}\n` +
        `❗ Завдання: ${card.task}\n` +
        `📝 Коментар: ${card.comment}\n`;
    }

    // ======= TELEGRAM: отправка медиагруппы =======
    const tgForm = new FormData();
    const media = [];

    photos.forEach((base64, i) => {
      const fileId = `file${i}.jpg`;

      const buffer = Buffer.from(
        base64.replace(/^data:image\/\w+;base64,/, ""),
        "base64"
      );

      tgForm.append(fileId, buffer, { filename: fileId });

      media.push({
        type: "photo",
        media: `attach://${fileId}`,
        caption: i === photos.length - 1 ? caption : "",
      });
    });

    tgForm.append("chat_id", CHAT);
    tgForm.append("media", JSON.stringify(media));

    const tgResp = await fetch(
      `https://api.telegram.org/bot${BOT}/sendMediaGroup`,
      { method: "POST", body: tgForm }
    );

    console.log("TG RESPONSE:", await tgResp.text());


    // ======================================================
    // 📌 TRELLO — создаём карточку
    // ======================================================

    const labelId = pickLabel(card);

    const trelloName =
      card.owner === "company"
        ? `🛠Обладнання: ${card.name} |📍Локація: ${card.companyLocation} | 🔢Внутрішній №:${card.internalNumber} | 📝Коментар:${card.comment}`
        : `👤Клієнт: ${card.clientName} | ⚙️Модель:${card.model} | ❗Проблема:${card.problem}`;

    const desc = caption + "\n\n📸 Фото прикріплені в Telegram.";

    // === 1. Create Trello card ===
    const createCard = await fetch(
      `https://api.trello.com/1/cards?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idList: TRELLO_LIST_ID,
          name: trelloName,
          desc,
          idLabels: [labelId],
        }),
      }
    );

    const cardData = await createCard.json();
    console.log("TRELLO CARD CREATED:", cardData);

    if (!cardData.id) throw new Error("Card was not created!");

    // === 2. Upload each photo to Trello ===
    for (let i = 0; i < photos.length; i++) {
      const base64 = photos[i];
      const buffer = Buffer.from(
        base64.replace(/^data:image\/\w+;base64,/, ""),
        "base64"
      );

      const attachForm = new FormData();
      attachForm.append("key", TRELLO_KEY);
      attachForm.append("token", TRELLO_TOKEN);
      attachForm.append("file", buffer, `photo${i}.jpg`);

      const attachResp = await fetch(
        `https://api.trello.com/1/cards/${cardData.id}/attachments`,
        { method: "POST", body: attachForm }
      );

      console.log("PHOTO UPLOAD:", await attachResp.text());
    }

    res.send({ ok: true });

  } catch (err) {
    console.error("SERVER ERROR:", err);
    res.status(500).send({ error: true });
  }
});

// === 📦 Templates proxy ===
async function loadTemplatesFromDrive(fileId) {
  if (!fileId) return null;

  const url = `https://drive.google.com/uc?export=download&id=${fileId}`;
  const resp = await fetch(url, {
    headers: { "Accept": "application/json,text/plain,*/*" }
  });

  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

  const contentType = (resp.headers.get("content-type") || "").toLowerCase();
  const text = await resp.text();

  // Если Drive вернул HTML (страница доступа/подтверждения) — это НЕ наш JSON
  if (contentType.includes("text/html") || text.trim().startsWith("<!DOCTYPE html") || text.includes("<html")) {
    throw new Error("Drive returned HTML вместо JSON (файл не публичный или требует подтверждения)");
  }

  let items;
  try {
    items = JSON.parse(text);
  } catch (e) {
    throw new Error("Не удалось распарсить JSON из Drive");
  }

  // Поддержим 2 формата: либо массив, либо объект {items:[...]}
  if (Array.isArray(items)) {
    return items.map(ensureTemplateId);
  }
  if (items && Array.isArray(items.items)) {
    return items.items.map(ensureTemplateId);
  }

  return [];
}


async function loadTemplatesLocal() {
  try {
    const raw = await fs.readFile(TEMPLATES_STORE, "utf8");
    const data = JSON.parse(raw);
    const items = Array.isArray(data) ? data : [];
    const normalized = items.map(ensureTemplateId);
    const missing = normalized.some((tpl, i) => tpl.id !== items[i]?.id);
    if (missing) {
      await saveTemplatesLocal(normalized);
    }
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
    // 1. Пытаемся прочитать с Google Drive (если доступен)
    if (fileId) {
      const items = await loadTemplatesFromDrive(fileId);
      if (items) {
        res.send({ items: items.map(ensureTemplateId), source: "drive" });
        return;
      }
    }

    // 2. Фолбэк на локальный файл, чтобы шаблоны работали даже без интернета
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
    createdAt: req.body?.createdAt || new Date().toISOString()
  });

  // 1. Основной путь — Apps Script webhook (Google Sheets/Drive)
  if (TEMPLATE_SAVE_URL) {
    try {
      const forward = await fetch(TEMPLATE_SAVE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...template, file: fileId })
      });

      const data = await forward.json().catch(() => ({}));
      if (!forward.ok) throw new Error(data.error || `HTTP ${forward.status}`);

      res.send({ ok: true, source: "webhook", id: template.id, ...data });
      return;
    } catch (err) {
      console.error("TEMPLATE SAVE ERROR (webhook)", err);
    }
  }

  // 2. Фолбэк — локальный json на сервере (общий для всех пользователей сервера)
  try {
    const current = await loadTemplatesLocal();
    const updated = [template, ...current.filter(t => t.id !== template.id)].slice(0, 200); // ограничение по объему
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
        body: JSON.stringify({ ...template, action: "update" })
      });

      const data = await forward.json().catch(() => ({}));
      if (!forward.ok) throw new Error(data.error || `HTTP ${forward.status}`);

      res.send({ ok: true, source: "webhook", id });
      return;
    } catch (err) {
      console.error("TEMPLATE UPDATE ERROR (webhook)", err);
    }
  }

  try {
    const current = await loadTemplatesLocal();
    const idx = current.findIndex(t => t.id === id);
    const next = idx === -1
      ? [template, ...current]
      : current.map(t => (t.id === id ? { ...t, ...template } : t));
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
        body: JSON.stringify({ action: "delete", id, file: fileId })
      });

      const data = await forward.json().catch(() => ({}));
      if (!forward.ok) throw new Error(data.error || `HTTP ${forward.status}`);

      res.send({ ok: true, source: "webhook", id });
      return;
    } catch (err) {
      console.error("TEMPLATE DELETE ERROR (webhook)", err);
    }
  }

  try {
    const current = await loadTemplatesLocal();
    const filtered = current.filter(t => t.id !== id);
    await saveTemplatesLocal(filtered);
    res.send({ ok: true, source: "local", id });
  } catch (err) {
    console.error("TEMPLATE DELETE ERROR (local)", err);
    res.status(500).send({ error: "delete_failed" });
  }
});

// === START SERVER ===
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("Server started on port " + PORT));


