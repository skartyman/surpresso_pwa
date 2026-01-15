// server.js — полный ESM-вариант с Google OAuth

import express from "express";
import path from "path";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import FormData from "form-data";
import fs from "fs/promises";
import crypto from "crypto";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import session from "express-session";
import jwt from "jsonwebtoken";
import 'dotenv/config';   

const app = express();
const __dirname = path.resolve();

app.use(bodyParser.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname)));

// ======== СЕССИИ И PASSPORT ========
app.use(
  session({
    secret: process.env.SESSION_SECRET || "surpresso-session-secret-very-long",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === "production" },
  })
);

app.use(passport.initialize());
app.use(passport.session());

// ======== GOOGLE OAUTH ========
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ||
        "http://localhost:8080/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      // Здесь можно добавить логику поиска/создания пользователя в БД
      const user = {
        id: profile.id,
        name: profile.displayName,
        email: profile.emails?.[0]?.value || "",
        role: "user", // ← можно сделать логику по email-домену
      };
      return done(null, user);
    }
  )
);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// ======== JWT ========
const JWT_SECRET = process.env.JWT_SECRET || "very-long-random-jwt-secret-change-me";

// ======== АВТОРИЗАЦИЯ GOOGLE ========
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

app.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/?auth=failed" }),
  (req, res) => {
    const token = jwt.sign(
      {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.redirect(`/?token=${token}`);
  }
);

// ======== Middleware проверки JWT ========
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token =
    req.query.token ||
    (authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null);

  if (!token) {
    return res.status(401).json({ error: "Unauthorized — no token" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }
    req.user = user;
    next();
  });
}

// ======== ТЕКУЩИЙ ПОЛЬЗОВАТЕЛЬ ========
app.get("/api/me", (req, res) => {
  const token =
    req.query.token ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.split(" ")[1]
      : null);

  if (!token) {
    return res.json({ user: null });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.json({ user: null });
    res.json({ user });
  });
});

// ======== TRELLO CONFIG ========
const TRELLO_KEY = "7100bce291a7e050e1e08d7375ddb49a";
const TRELLO_TOKEN =
  "ATTA44fcab24691acc78f7123515c0728b3a6df7fd2a807b8ed515a87a4dad54ddff0EA3F5E5";
const TRELLO_LIST_ID = "65895fe3788e6f790d29e806";

// CORRECT LABEL IDS
const LABEL_OUR = "65895fe3788e6f790d29e8b0"; // НАШЕ Майстерня
const LABEL_CLIENT = "65895fe3788e6f790d29e8ad"; // КЛ Майстерня
const LABEL_CONTRACT = "65a69d546560f1050990998d"; // ОБСЛ Майстерня

const TEMPLATE_SAVE_URL =
  process.env.TEMPLATE_SAVE_WEBHOOK ||
  "https://script.google.com/macros/s/AKfycbwK8g6vrhko8aXgSs46aJ_NJuSgxnLuhYX15i0Zqnj4Vo7iE43G4XHn5iD_s-3e5H_3/exec";

const TEMPLATES_STORE = path.join(__dirname, "warehouse-templates.json");

const generateTemplateId = () =>
  crypto.randomUUID
    ? crypto.randomUUID()
    : `tpl-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

function ensureTemplateId(tpl) {
  if (!tpl) return tpl;
  return {
    ...tpl,
    id:
      tpl.id ||
      tpl.templateId ||
      tpl.createdAt ||
      generateTemplateId(),
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

    // Формирование подписи
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

    // TELEGRAM: медиагруппа
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

    // TRELLO — создание карточки
    const labelId = pickLabel(card);
    const trelloName =
      card.owner === "company"
        ? `🛠Обладнання: ${card.name} |📍Локація: ${card.companyLocation} | 🔢Внутрішній №:${card.internalNumber} | 📝Коментар:${card.comment}`
        : `👤Клієнт: ${card.clientName} | ⚙️Модель:${card.model} | ❗Проблема:${card.problem}`;

    const desc = caption + "\n\n📸 Фото прикріплені в Telegram.";

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

    // Загрузка фото в Trello
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

    res.json({ ok: true });
  } catch (err) {
    console.error("SERVER ERROR:", err);
    res.status(500).json({ error: true, message: err.message });
  }
});

// === TEMPLATES PROXY ===

async function loadTemplatesFromDrive(fileId) {
  if (!fileId) return null;
  const url = `https://drive.google.com/uc?export=download&id=${fileId}`;
  const resp = await fetch(url, {
    headers: { Accept: "application/json,text/plain,*/*" },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const contentType = resp.headers.get("content-type")?.toLowerCase() || "";
  const text = await resp.text();

  if (contentType.includes("text/html") || text.trim().startsWith("<!DOCTYPE")) {
    throw new Error("Drive вернул HTML вместо JSON");
  }

  let items;
  try {
    items = JSON.parse(text);
  } catch {
    throw new Error("Не удалось распарсить JSON из Drive");
  }

  if (Array.isArray(items)) return items.map(ensureTemplateId);
  if (items?.items && Array.isArray(items.items))
    return items.items.map(ensureTemplateId);
  return [];
}

async function loadTemplatesLocal() {
  try {
    const raw = await fs.readFile(TEMPLATES_STORE, "utf8");
    const data = JSON.parse(raw);
    const items = Array.isArray(data) ? data : [];
    return items.map(ensureTemplateId);
  } catch {
    return [];
  }
}

async function saveTemplatesLocal(items) {
  await fs.writeFile(TEMPLATES_STORE, JSON.stringify(items, null, 2), "utf8");
}

// Защищённые эндпоинты шаблонов
app.get("/warehouse-templates", authenticateToken, async (req, res) => {
  const fileId = req.query.file || process.env.TEMPLATES_FILE_ID;
  try {
    if (fileId) {
      const items = await loadTemplatesFromDrive(fileId);
      if (items) {
        return res.json({ items: items.map(ensureTemplateId), source: "drive" });
      }
    }
    const fallback = await loadTemplatesLocal();
    res.json({ items: fallback, source: "local" });
  } catch (err) {
    console.error("TEMPLATE LOAD ERROR", err);
    const fallback = await loadTemplatesLocal();
    res.status(200).json({
      items: fallback,
      source: "local",
      warning: "drive_failed",
    });
  }
});

app.post("/warehouse-templates", authenticateToken, async (req, res) => {
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
      return res.json({ ok: true, source: "webhook", id: template.id, ...data });
    } catch (err) {
      console.error("TEMPLATE SAVE ERROR (webhook)", err);
    }
  }

  try {
    const current = await loadTemplatesLocal();
    const updated = [
      template,
      ...current.filter((t) => t.id !== template.id),
    ].slice(0, 200);
    await saveTemplatesLocal(updated);
    res.json({ ok: true, source: "local", id: template.id });
  } catch (err) {
    console.error("TEMPLATE SAVE ERROR (local)", err);
    res.status(500).json({ error: "save_failed" });
  }
});

app.put("/warehouse-templates/:id", authenticateToken, async (req, res) => {
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
      return res.json({ ok: true, source: "webhook", id });
    } catch (err) {
      console.error("TEMPLATE UPDATE ERROR (webhook)", err);
    }
  }

  try {
    const current = await loadTemplatesLocal();
    const idx = current.findIndex((t) => t.id === id);
    const next =
      idx === -1
        ? [template, ...current]
        : current.map((t) => (t.id === id ? { ...t, ...template } : t));
    await saveTemplatesLocal(next);
    res.json({ ok: true, source: idx === -1 ? "local_added" : "local_updated", id });
  } catch (err) {
    console.error("TEMPLATE UPDATE ERROR (local)", err);
    res.status(500).json({ error: "update_failed" });
  }
});

app.delete("/warehouse-templates/:id", authenticateToken, async (req, res) => {
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
      return res.json({ ok: true, source: "webhook", id });
    } catch (err) {
      console.error("TEMPLATE DELETE ERROR (webhook)", err);
    }
  }

  try {
    const current = await loadTemplatesLocal();
    const filtered = current.filter((t) => t.id !== id);
    await saveTemplatesLocal(filtered);
    res.json({ ok: true, source: "local", id });
  } catch (err) {
    console.error("TEMPLATE DELETE ERROR (local)", err);
    res.status(500).json({ error: "delete_failed" });
  }
});

// ======== ЗАПУСК СЕРВЕРА ========
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});