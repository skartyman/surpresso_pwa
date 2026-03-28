# Surpresso PWA

Внутреннее веб‑приложение (PWA) для сервисной команды **Surpresso Service**: учёт чеков и оборудования, склад, база PDF‑мануалов, каталог схем и вспомогательные сервисные экраны.

## Что умеет проект

- **Рабочая панель** с навигацией по основным модулям (`/`).
- **Сервисные чеки** и related-процессы (`/check`).
- **Склад** и переучёт (`/warehouse.html`, `/recount.html`).
- **Карточки оборудования** с серверными API для статусов, фото, PDF и задач Trello (`/api/equip/*`).
- **База мануалов (PDF)**: загрузка, просмотр, индексация и Q&A по содержимому (`/manuals`, `/api/manuals/*`).
- **Каталог схем** (`/diagrams`) и отдельный **помощник помола** (`/grinder.html`).
- Интеграции с **Google Apps Script**, **Telegram**, **Trello** и webhook‑точкой для шаблонов склада.

## Технологии

- **Backend:** Node.js + Express
- **Frontend:** Vanilla JS + HTML/CSS (многостраничный PWA)
- **AI/поиск по PDF:** `pdf-parse`, `pdfjs-dist`, индексатор в `manuals-ai.js`, опционально Gemini API
- **Интеграции:** Telegram Bot API, Trello API, Google Apps Script Web App

## Быстрый старт (локально)

### 1) Требования

- Node.js 18+
- npm

### 2) Установка

```bash
npm install
```

### 3) Запуск

```bash
npm start
```

Сервер по умолчанию поднимается на порту `8080`.

## Основные переменные окружения

> Приложение может стартовать и с неполной конфигурацией, но часть интеграций будет отключена.

### Базовые

- `PORT` — порт сервера (по умолчанию `8080`)
- `PWA_KEY` — ключ авторизации для защищённых API (передаётся как `x-surpresso-key`)

### Google Apps Script

- `GAS_WEBAPP_URL` — URL опубликованного GAS Web App
- `GAS_SECRET` — секрет для валидации запросов

### Telegram

- `TG_BOT_TOKEN`, `TG_CHAT_ID`
- `TG_NOTIFY_BOT_TOKEN`, `TG_NOTIFY_BOT_USERNAME`, `TG_NOTIFY_CHAT_ID`
- `TG_WEBHOOK_SECRET`
- `SUPPORT_PHONE`, `MANAGER_LINK`

### Trello

- `TRELLO_KEY`, `TRELLO_TOKEN`, `TRELLO_LIST_ID`
- `LABEL_OUR`, `LABEL_CLIENT`, `LABEL_CONTRACT`

### Мануалы / AI

- `GEMINI_API_KEY`
- `GEMINI_MODEL` (по умолчанию `gemini-2.5-flash`)

### Прочее

- `PASSPORT_BASE_URL` / `PUBLIC_APP_URL` / `APP_URL`
- `TEMPLATE_SAVE_WEBHOOK`
- `TEMPLATES_FILE_ID`

## Ключевые маршруты

### UI страницы

- `/` — дашборд
- `/check`
- `/warehouse.html`
- `/manuals`
- `/diagrams`
- `/grinder.html`

### Серверные API (основные группы)

- `/send-equipment`
- `/api/equip/*`
- `/api/manuals/*`
- `/warehouse-templates` (+ `PUT/DELETE` для записей)
- `/tg/webhook`
- `/proxy-drive/:fileId`

## Структура проекта (укрупнённо)

- `server.js` — основной Express сервер, маршруты, интеграции
- `manuals-ai.js` — индексация PDF и поиск релевантных фрагментов
- `index.html`, `check.html`, `warehouse.html`, `manuals.html`, `diagrams.html` — UI-страницы модулей
- `app.js`, `auth.js`, `manuals.js`, `diagrams*.js`, `grinder-*.js` — фронтенд‑логика
- `service-worker.js`, `manifest.json`, `icons/` — PWA-часть
- `GAS/Code.gs` — скрипт для интеграции с Google Apps Script
- `Dockerfile`, `fly.toml` — контейнеризация и деплой

## Docker

Сборка и запуск:

```bash
docker build -t surpresso-pwa .
docker run --rm -p 8080:8080 --env-file .env surpresso-pwa
```

## Деплой

В репозитории есть `fly.toml` для Fly.io. Перед деплоем проверьте, что все необходимые секреты заданы в окружении платформы.

## Безопасность

- Не храните секреты в коде и коммитах.
- Для production обязательно задайте `PWA_KEY` и секреты интеграций.
- Ограничьте доступ к webhook‑маршрутам (например, `TG_WEBHOOK_SECRET` и сетевые ограничения на уровне инфраструктуры).

---

Если нужно, могу следующим шагом добавить:
1) шаблон `.env.example`,
2) раздел «архитектура API» с примерами запросов,
3) инструкцию по релизу/обновлению PWA кеша.
