# Adrobot — обёртка над Keitaro (тестовое №2)

Локальное веб-приложение: **создаватор кампаний** и **редактор офферов** поверх Keitaro Admin API.

Стек: **FastAPI + SQLAlchemy (Alembic) + React (Vite)**.

## Что реализовано (по ТЗ)

1. **Создаватор** — форма «Название / Гео / Оффер» (автокомплит):
   - создаёт кампанию с префиксом имени `test_zaynullin_` (настраивается в `.env`);
   - **поток 1** (`Geo -> Google`): фильтр стран → редирект на `https://google.com/`;
   - **поток 2** (`Offers`): трафик на выбранный оффер;
   - выставляет **домен**, **группу FORTESTS**, **источник FORTESTS** через API.
2. **Редактор** — страница кампании: список офферов с долей трафика (%), добавление и удаление; сумма долей = 100%.

## Быстрый старт

Нужны: **Python 3.9+**, **Node.js 18+**, доступ в Keitaro из ТЗ (`https://tlgk.host/admin`).

### 1. Клонировать и окружение

```bash
git clone <url-этого-репозитория>
cd eto-legko-task2
cp .env.example .env
```

Файл `.env` лежит **в корне репозитория** (рядом с `README.md`). Backend подхватывает его при запуске из `backend/`.

### 2. API-ключ Keitaro

Логин и пароль из ТЗ открывают админку, но приложению нужен **API-ключ**:

1. Войти: https://tlgk.host/admin  
2. Иконка профиля (сверху справа) → **Профиль**  
3. Вкладка **API ключи** → **Создать новый ключ**  
4. Скопировать ключ в `.env`:

```env
KEITARO_API_KEY=вставьте_ключ_сюда
```

Остальные значения из `.env.example` для тестового аккаунта уже подходят:

| Переменная | Смысл | Значение по умолчанию |
|------------|--------|------------------------|
| `KEITARO_BASE_URL` | Admin API | `https://tlgk.host/admin_api/v1` |
| `KEITARO_DOMAIN_ID` | домен кампании | `1813` (`kylovoa.com`) |
| `KEITARO_GROUP_ID` | группа | `10332` (`FORTESTS`) |
| `KEITARO_SOURCE_ID` | источник | `836` (`FORTESTS`) |
| `CAMPAIGN_NAME_PREFIX` | префикс имён | `test_zaynullin_` |
| `DATABASE_URL` | локальная БД | `sqlite:///./adrobot.db` |

> В скрине полного ТЗ был домен `in.posdk.xyz`. У тестового пользователя в API доступен **`kylovoa.com`** (`1813`) — его и используют другие тестовые кампании в группе FORTESTS.

Документация API / Swagger: в той же вкладке **API ключи** → кнопка **Документация**.

### 3. Миграции (backend)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
```

Появится SQLite-файл `backend/adrobot.db` (локальный журнал созданных кампаний). В git он не коммитится.

### 4. Запуск (два терминала)

**Терминал A — API:**

```bash
cd backend
source .venv/bin/activate          # Windows: .venv\Scripts\activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Проверка: http://127.0.0.1:8000/api/health → `{"status":"ok"}`  
Swagger: http://127.0.0.1:8000/docs

**Терминал B — интерфейс:**

```bash
cd frontend
npm install
npm run dev
```

Открыть: **http://127.0.0.1:5173**  
Vite проксирует `/api` → `http://127.0.0.1:8000`.

## Как проверить, что всё работает

1. Интерфейс → название (`campaign1`), гео (`AU` или `AU,MX`), оффер — выбрать из автокомплита (например id `4440` / `10114`) → **Создать**.
2. Откроется редактор; в блоке «Мои кампании» на главной появится запись.
3. В Keitaro: **Кампании** → группа **FORTESTS** → `test_zaynullin_...`:
   - домен / группа / источник заполнены;
   - два потока: гео→Google и Offers.
4. В редакторе добавить/удалить оффер — доли (%) пересчитаются, сумма **100%**.

Имена в Keitaro задавайте со своим префиксом, если меняли `CAMPAIGN_NAME_PREFIX` (по ТЗ: `test_фамилия_...`).

## Типичные проблемы

| Симптом | Что проверить |
|---------|----------------|
| Backend не стартует: `KEITARO_API_KEY не задан` | Есть ли `.env` **в корне** репо, не пустой ли `KEITARO_API_KEY` |
| Интерфейс: пустой список / ошибки proxy | Запущен ли backend на `:8000` |
| Автокомплит офферов «ничего не найдено» | Оффер должен существовать в Keitaro; числовой ID резолвится через `GET /offers/{id}` |
| Кампания не в FORTESTS / без домена | `KEITARO_*_ID` в `.env` (см. таблицу выше) |

## Структура репозитория

```
.env.example          # шаблон конфига (скопировать в .env)
backend/
  app/                # FastAPI, модели SQLAlchemy, клиент Keitaro
  alembic/            # миграции
  requirements.txt
frontend/             # React + Vite
README.md
```

`.env` и `*.db` в git не попадают — ключ и пароль Keitaro в репозиторий не кладите.
