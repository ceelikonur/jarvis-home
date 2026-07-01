# J.A.R.V.I.S. — Ev Asistanı

## Project Overview
Local-first ev asistanı: Telegram Bot + Budget Manager + Web Dashboard + Express API + SQLite.
WiFi ağındaki herkes web dashboard'a erişebilir (PIN korumalı).
Runs on local network. Privacy-first — no cloud dependencies.
User's primary language is Turkish; bot addresses user as "sir/Boss".

## Architecture
Single process on port 3000 serves everything:
- **Express** handles `/api/*`, `/health`, `/login*`
- **Next.js** handles all other routes (dashboard pages, static assets)
- **http.createServer** routes requests to Express or Next.js based on URL
- Next.js is loaded from `web/node_modules/next` (must match the build)

```
src/
├── index.js                              # Entry — boots DB, memory, bot, Express
├── config/index.js                       # Env vars + validation
├── database/init.js                      # SQLite init, WAL, schema (13 tables)
├── bot/
│   ├── index.js                          # Telegraf assembly — registers all commands
│   ├── middleware/auth.js                # Silent reject for unauthorized users
│   ├── commands/
│   │   ├── start.js                      # /start — welcome + AI/memory status
│   │   ├── task.js                       # /task — AI due date extraction
│   │   ├── tasks.js                      # /tasks — inline keyboard to complete
│   │   ├── event.js                      # /event — NLP or strict regex fallback
│   │   ├── notes.js                      # /notes — recent notes
│   │   ├── list.js                       # /list, /shop, /watch, /read, /newlist, /clearlist
│   │   ├── recall.js                     # /recall — semantic memory search
│   │   ├── ask.js                        # /ask — RAG-powered conversation
│   │   ├── status.js                     # /status — daily briefing (now includes budget)
│   │   ├── budget.js                     # /harcama, /gelir, /bakiye — budget commands
│   │   └── help.js                       # /help — command reference
│   └── handlers/text.js                  # Free text → AI classifies → route accordingly
├── api/
│   ├── index.js                          # Express server + CORS + cookie auth
│   ├── middleware/webAuth.js             # PIN-based auth for web access
│   ├── routes/
│   │   ├── budget.js                     # Budget API (transactions, categories, upload)
│   │   ├── calendar.js                   # GET /api/calendar.ics
│   │   ├── dashboard.js                  # Dashboard data
│   │   └── ...                           # availability, anylist, msCalendar
│   ├── controllers/
│   │   └── calendarController.js         # iCal generation
│   └── public/                           # Static HTML (dashboard, login)
├── services/
│   ├── AIService.js                      # Ollama: NLP, classification, embeddings, RAG
│   ├── BudgetService.js                  # Budget transactions, categories, summaries
│   ├── ParserService.js                  # Excel/CSV bank statement parsers
│   ├── VectorStore.js                    # Cosine similarity search + keyword fallback
│   ├── MemoryService.js                  # Index, recall, context builder
│   ├── NoteService.js, TaskService.js    # CRUD services
│   ├── CalendarService.js, ListService.js
│   └── ...
└── utils/helpers.js                      # Date parsing, UID generation

web/                                      # Next.js Web Dashboard (budget-master integrated)
├── src/app/(dashboard)/                  # Dashboard pages (Turkish UI)
├── src/components/                       # React components (shadcn/ui)
├── src/lib/stores/                       # Zustand stores (budget, categories)
├── next.config.mjs                       # Next.js config (no rewrites needed — same port)
└── package.json                          # Separate deps (React, Next.js, Recharts)
```

## Development Commands
```bash
npm run setup       # Install all dependencies (backend + frontend + build)
npm start           # Start everything (single process, port 3000)
npm run dev         # Start in dev mode (Next.js hot reload enabled)
npm run web:build   # Rebuild Next.js frontend for production
```

## Database Schema (better-sqlite3, WAL mode, 13 tables)

### Core Tables
- **notes**: id, content, created_at
- **tasks**: id, title, status, due_date?, priority, created_at
- **events**: id, title, start_time, end_time, created_at
- **lists**: id, name (UNIQUE), icon, created_at
- **list_items**: id, list_id (FK→lists), content, checked, created_at
- **conversations**: id, role, content, created_at
- **memories**: id, type, source_id, content, embedding(JSON), created_at
- **calendar_sources**: id, name, url, color, owner, last_synced
- **imported_events**: id, source_id, uid, title, start_time, end_time, all_day

### Budget Tables
- **budget_transactions**: id, date, source, amount, type, category, sub_category, month, person, bank, account, tags(JSON), UNIQUE(date,source,amount)
- **budget_categories**: id, name (UNIQUE), color, is_fixed — seeded with 11 Turkish categories
- **budget_monthly**: id, month, data(JSON)
- **budget_wishlist**: id, product, price, status, checked
- **budget_installments**: id, name, total, installment_count, paid_count, final_date, monthly_amount, remaining

### Auth Table
- **web_sessions**: id, created_at, expires_at — PIN-based session tokens

## Bot Commands
| Command | Description |
|---------|-------------|
| `/start` | Welcome message + AI/memory status |
| `/status` | Full briefing — tasks, events, shopping, **budget summary**, memory |
| `/ask [text]` | RAG-powered conversation |
| `/recall [text]` | Semantic search across all memories |
| `/task [text]` | Create task — AI extracts due dates |
| `/tasks` | Pending tasks with ✅ inline buttons |
| `/event [text]` | Create event — NLP or regex fallback |
| `/notes` | View 10 most recent notes |
| `/shop [items]` | Add to alışveriş list |
| `/watch [title]` | Add to izleme list |
| `/read [title]` | Add to okuma list |
| `/list` | View all lists |
| `/harcama [tutar] [açıklama]` | Quick expense entry |
| `/gelir [tutar] [açıklama]` | Income entry |
| `/bakiye [ay]` | Monthly budget summary |
| `/help` | Command reference |

## Budget API Endpoints
- `GET /api/budget/transactions` — All transactions
- `POST /api/budget/transactions` — Upsert transactions
- `PATCH /api/budget/transactions/:key` — Update category/tags
- `DELETE /api/budget/transactions` — Clear all
- `GET /api/budget/categories` — All categories
- `POST /api/budget/categories` — Create category
- `PUT /api/budget/categories/:id` — Update category
- `DELETE /api/budget/categories/:id` — Delete category
- `POST /api/budget/upload` — Upload & parse Excel/CSV (auto-saves to DB)
- `GET /api/budget/summary?month=X` — Monthly summary
- `GET /api/budget/monthly` — Monthly budget plans
- `GET /api/budget/wishlist` — Wishlist items
- `GET /api/budget/installments` — Installment tracking

## Web Auth Endpoints
- `POST /api/auth/login` — PIN login (sets cookie)
- `GET /api/auth/check` — Check session validity
- `POST /api/auth/logout` — Clear session

## Supported Bank Formats (ParserService)
- **Turkish Banks**: Garanti, Yapı Kredi, İş Bankası, Akbank, QNB, Ziraat, Halkbank, Vakıfbank, Denizbank, TEB, ING, HSBC, Enpara
- **German Banks**: Haspa (Hamburger Sparkasse) — semicolon CSV
- **International**: Wise — standard Excel export
- **Generic**: Any CSV with date/description/amount columns

## Environment Variables
- `TELEGRAM_BOT_TOKEN` — from @BotFather
- `ALLOWED_USER_ID` — single authorized Telegram user ID
- `PORT` — Express server port (default 3000)
- `DB_PATH` — SQLite file path (default ./data/jarvis.db)
- `OLLAMA_BASE_URL` — Ollama API (default http://localhost:11434/v1)
- `OLLAMA_MODEL` — chat/NLP model (default llama3.2)
- `OLLAMA_EMBED_MODEL` — embedding model (default nomic-embed-text)
- `WEB_PIN` — 4-digit PIN for web dashboard access (empty = no PIN)

## Code Conventions
- CommonJS modules (require/module.exports) for backend
- TypeScript + Next.js for web frontend
- Services are plain objects with methods, not classes
- All database operations synchronous (better-sqlite3)
- Single port (3000) serves Express API + Next.js on 0.0.0.0 (WiFi accessible)
- Next.js must be loaded from web/node_modules/next to match the build

## Key Decisions & Gotchas
- Never suggest cloud-hosted AI or databases — intentionally local-first
- Budget-Master merged into Jarvis — single DB, single project
- Web dashboard accessible to anyone on WiFi (PIN protected)
- Telegram bot remains single-user (ALLOWED_USER_ID)
- Parser logic ported from TypeScript to JavaScript in ParserService.js
- Frontend (web/) has its own package.json and node_modules
- Upload now auto-saves to DB (no separate save step needed)

## Dependencies
Backend: express, telegraf, better-sqlite3, dotenv, ics, uuid, openai, multer, xlsx, papaparse
Frontend: next, react, zustand, recharts, shadcn/ui, tailwindcss, date-fns
