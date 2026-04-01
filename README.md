# Surpresso Telegram Mini App (MVP)

Масштабируемый каркас клиентского кабинета Surpresso внутри Telegram.

## Project structure

```txt
frontend/                # React + Vite mobile-first mini app
backend/                 # Node.js + Express API
shared/                  # Контракты и общие типы (точка расширения)
.env.example             # Пример переменных окружения
```

### Backend layers
- `domain/` — сущности и интерфейсы репозиториев.
- `application/` — use-cases и DTO (точка расширения).
- `infrastructure/` — in-memory repositories, Telegram gateway, media storage.
- `http/` — middleware, controllers, routes.

## Telegram launch flow
1. Пользователь нажимает кнопку в `TG_NOTIFY_BOT`.
2. Telegram открывает Mini App URL.
3. Frontend получает `window.Telegram.WebApp.initData`.
4. Frontend отправляет `initData` в backend (`x-telegram-init-data`).
5. Backend валидирует подпись `initData` через токен бота.
6. Backend находит `Client` по `telegramUserId`.
7. Возвращается профиль и данные кабинета.

## Backend routes (MVP)

### Public
- `GET /health`
- `POST /webhooks/telegram` — webhook bot route.

### Authenticated via Telegram init data
- `GET /api/v1/auth/me`
- `GET /api/v1/equipment`
- `GET /api/v1/equipment/:id`
- `GET /api/v1/service-requests`
- `POST /api/v1/service-requests` (`multipart/form-data`, поле `media[]`)
- `GET /api/v1/service-requests/:id/status`
- `POST /api/v1/support/notify` — отправка нотификации клиенту через Bot API.

## React pages
- Главная (`/`)
- Сервис (`/service`)
- Мое оборудование (`/equipment`)
- Карточка оборудования (`/equipment/:equipmentId`)
- Статус заявки (`/service/:requestId`)
- Поддержка (`/support`)
- Заглушки-модули: Аренда, Кофе, Расходники, Инструкции

## UX/navigation system
- Mobile-first layout.
- Нижний tab bar: Главная / Сервис / Оборуд. / Поддержка.
- Крупные карточки разделов на главной.
- Быстрые действия: создать заявку, связаться с менеджером.

## Entity model
- `Client`
- `Equipment`
- `ServiceRequest`
- `RentalContract`
- `ProductOrder`
- `SupportThread`

Типы: `backend/src/domain/entities/types.js`.

## Seed/mock data
- `backend/src/infrastructure/seed/mockData.js`.
- `frontend/src/api/mockApi.js`.

## Run MVP

```bash
# Backend
cd backend
npm i
npm run dev

# Frontend (new terminal)
cd frontend
npm i
npm run dev
```

## Scaling strategy
- Подключение постоянной БД через новые adapter-реализации репозиториев без изменения API-контроллеров.
- Вынос модулей аренды/кофе/расходников в отдельные bounded contexts в `application` + `domain`.
- Поддержка async workflow (очереди нотификаций и событий сервиса).
