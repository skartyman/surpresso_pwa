# Surpresso PWA + Telegram Mini App (single Express/Fly deploy)

Этот репозиторий теперь запускает **старый Surpresso PWA** и **новый Telegram Mini App** в одном Node/Express приложении (один Fly deploy).

## Маршруты

### Legacy PWA (без изменений)
- `/`
- `/check`
- `/warehouse.html`
- `/manuals`
- `/diagrams`
- `/grinder.html`
- все существующие legacy API и страницы

### Telegram Mini App frontend
- `/tg` — точка входа Mini App
- `/tg/*` — все внутренние client-side маршруты React (Router basename=`/tg`)

### Telegram Mini App API
- `GET /api/telegram/auth/me`
- `GET /api/telegram/equipment`
- `GET /api/telegram/equipment/:id`
- `GET /api/telegram/service-requests`
- `POST /api/telegram/service-requests`
- `GET /api/telegram/service-requests/:id/status`
- `POST /api/telegram/service-requests/:id/status`
- `POST /api/telegram/support/notify`

### Webhook
- основной: `POST /api/telegram/webhook`
- временный alias для совместимости: `POST /tg/webhook`

### Uploads
- отдельный namespace: `/miniapp-telegram/uploads/*`

### Healthcheck
- `GET /health`

---

## ENV

Минимально для запуска Mini App на Fly (пример для `https://wpa-surpresso.fly.dev/tg`):

```env
PORT=8080

# Mini App auth/bot
TELEGRAM_BOT_TOKEN=123456:replace_me
TELEGRAM_BOT_USERNAME=TG_NOTIFY_BOT
TELEGRAM_WEB_APP_URL=https://wpa-surpresso.fly.dev/tg
TELEGRAM_INIT_SECRET=

# Mini App uploads path (не /media)
MEDIA_UPLOAD_PATH=miniapp-telegram/uploads

# Neon Postgres (Mini App storage)
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require

# Legacy PWA auth (опционально, как и раньше)
PWA_KEY=
```

Дополнительные legacy переменные (GAS/Trello/TG notify) остаются рабочими как и раньше.

---

## Локальный запуск

```bash
# root server
npm i

# build mini app frontend
cd frontend
npm i
npm run build
cd ..

# run express (legacy + mini app)
npm start
```

После старта:
- Legacy PWA: `http://localhost:8080/`
- Telegram Mini App: `http://localhost:8080/tg`


## Prisma / Neon workflow

```bash
# generate prisma client
npm run prisma:generate

# apply migrations to Neon
npm run prisma:migrate

# for local development (creates migration)
npm run prisma:migrate:dev

# seed demo data: manager/service/seo users + test client/equipment/requests
npm run prisma:seed
```

Mini App backend автоматически использует Neon при наличии `DATABASE_URL`. Если `DATABASE_URL` не задан, включается fallback на in-memory репозитории для локальной разработки.

## Fly

Для production URL Mini App используйте:
- `https://wpa-surpresso.fly.dev/tg`

И убедитесь, что:
1. В BotFather для Web App кнопки прописан URL с `/tg`.
2. Webhook Telegram указывает на `/api/telegram/webhook`.
3. При необходимости обратной совместимости старый `/tg/webhook` можно оставить временно.
4. В `fly.toml` должен быть `release_command = "npm run prisma:migrate"`, чтобы миграции Prisma применялись к Neon автоматически при каждом deploy.
