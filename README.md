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

---

## Service equipment refactor rollout (Neon + Prisma)

Новый сервисный контур добавлен поверх legacy-логики без удаления старых flow:

### Шаг 1 — схема и миграция
1. Сгенерировать Prisma client:
   ```bash
   npm run prisma:generate
   ```
2. Применить миграции:
   ```bash
   npm run prisma:migrate
   ```
3. Проверить health:
   ```bash
   curl http://localhost:8080/health
   ```
   Ожидаемо: `ok=true`, `adminServiceModuleOk=true` (если mini app boot успешен).

### Шаг 2 — импорт xlsx в новые таблицы
```bash
npm run import:equipment-xlsx -- "/absolute/path/Surpresso Equipment DB.xlsx"
```

Импорт:
- `EQUIPMENT -> Equipment`
- `STATUS_LOG -> ServiceStatusHistory`
- `PHOTOS -> ServiceCaseMedia` (только metadata, без blob)

Скрипт выводит summary:
- `importedEquipment`
- `importedHistory`
- `importedMedia`
- `migrationWarnings` (когда статус не удалось нормализовать однозначно)

### Шаг 3 — read-only и ops API
Новые admin endpoints:
- `GET /api/telegram/admin/service/dashboard`
- `GET /api/telegram/admin/service-cases`
- `GET /api/telegram/admin/service-cases/:id`
- `GET /api/telegram/admin/service-cases/:id/history`
- `GET /api/telegram/admin/equipment`
- `GET /api/telegram/admin/equipment/:id`
- `GET /api/telegram/admin/equipment/:id/service-cases`

### Шаг 4 — операционные действия
- `POST /api/telegram/admin/service-cases/:id/assign`
- `POST /api/telegram/admin/service-cases/:id/status`
- `POST /api/telegram/admin/service-cases/:id/note`
- `POST /api/telegram/admin/service-cases/:id/media`
- `POST /api/telegram/admin/equipment/:id/commercial-status`

### Rollback plan
1. Отключить mini app слой:
   ```env
   MINIAPP_ENABLED=false
   ```
2. Перезапустить приложение — legacy PWA продолжит работать.
3. При необходимости откатить схему через стандартный Prisma rollback процесс/ручной SQL в Neon.
4. Временный режим: только legacy equipment flow, новый admin/service слой выключен.
