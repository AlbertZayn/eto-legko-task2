# Adrobot — обёртка над Keitaro

FastAPI + SQLAlchemy + React: создаватор кампаний и редактор офферов.

Префикс: `test_zaynullin_`. В Keitaro ищите по `zaynullin` (группа FORTESTS) — в Notes и в именах потоков есть метка автора.

## Запуск

Нужны Python 3.9+, Node 18+, доступ к https://tlgk.host/admin.

UI: http://127.0.0.1:5173 · API: http://127.0.0.1:8000/docs · health: `/api/health`

`.env` лежит **в корне** репо (рядом с этим файлом).

### Первый запуск (пакеты ещё не установлены)

```bash
git clone <url>
cd eto-legko-task2
cp .env.example .env
```

1. В админке: **Профиль → API ключи → Создать** → вставить ключ в `.env` (`KEITARO_API_KEY=...`).
2. Backend (терминал 1):

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

3. Frontend (терминал 2):

```bash
cd frontend
npm install
npm run dev
```

### Повторный запуск (venv и node_modules уже есть)

Миграции и `pip` / `npm install` снова не нужны, если зависимости не менялись.

1. Backend (терминал 1):

```bash
cd backend
source .venv/bin/activate          # Windows: .venv\Scripts\activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

2. Frontend (терминал 2):

```bash
cd frontend
npm run dev
```

Если после `git pull` обновились зависимости:

```bash
# backend
source .venv/bin/activate && pip install -r requirements.txt && alembic upgrade head

# frontend
cd frontend && npm install
```

## Что проверить

1. Создать кампанию: название / гео (`AU` или `AU,MX`) / оффер из автокомплита.
2. В редакторе добавить и удалить оффер — сумма долей **100%**.
3. В Keitaro → FORTESTS → поиск `zaynullin`:
   - имя `test_zaynullin_...`
   - Notes: `Adrobot by Zaynullin | ...`
   - потоки `zaynullin · Geo → Google` и `zaynullin · Offers`
   - домен, группа FORTESTS, источник FORTESTS

## Настройки `.env`

| Переменная | Значение | Зачем |
|------------|----------|--------|
| `KEITARO_API_KEY` | ваш ключ | обязателен |
| `KEITARO_DOMAIN_ID` | `1813` | `kylovoa.com` — единственный домен в API тестового аккаунта |
| `KEITARO_GROUP_ID` | `10332` | FORTESTS (как на скрине ТЗ) |
| `KEITARO_SOURCE_ID` | `836` | FORTESTS (как на скрине ТЗ) |
| `CAMPAIGN_NAME_PREFIX` | `test_zaynullin_` | по ТЗ `test_фамилия_` |

## Если не работает

- нет ключа / backend не стартует → `.env` в корне, заполнен `KEITARO_API_KEY`
- UI пустой / proxy error → поднят ли backend на `:8000`
- оффер не находится → возьмите существующий id (например `4440`); числовой поиск бьёт в `/offers/{id}`

## Структура

```
backend/   # FastAPI, Alembic, клиент Keitaro
frontend/  # React (Vite)
.env.example
```

Секреты в git не коммитятся.
