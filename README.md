# J.A.R.V.I.S. — Self-Hosted Home Assistant

A privacy-first, local-first home assistant: a **Telegram bot**, a **budget manager**,
and a **web dashboard** in a single Node.js process backed by SQLite. It runs entirely
on your own machine / home network — **no cloud services, no third-party data sharing**.

> Everyone on your WiFi can open the dashboard (PIN-protected). The Telegram bot only
> talks to the user ID(s) you authorize. Your data never leaves your hardware.

---

## Features

- 🤖 **Telegram bot** — tasks, notes, events, lists, reminders, and natural-language input
- 💰 **Budget manager** — import bank statements (Excel/CSV), auto-categorize, track
  spending, savings, installments, and monthly budgets
- 📊 **Web dashboard** — a Next.js UI (transactions, analysis, calendar, lists) on your network
- 🧠 **Optional local AI** — Ollama for natural-language parsing, semantic memory, and RAG
- 📅 **Calendar** — publish an iCal feed, auto-import `.ics` files, optional Outlook sync
- 🛒 **Optional AnyList** — sync shared shopping/todo lists
- 💡 **Smart-home connectors** — control lights, plugs and more from the bot (Govee included; pluggable)
- 🏠 **Configurable household** — define your own members, banks, and accounts (no one is hardcoded)

---

## Requirements

- **Node.js 18+** and npm
- A **Telegram account** (to create a bot)
- *(optional)* **[Ollama](https://ollama.com)** running locally for AI features
- *(optional)* An **AnyList** account for list sync

---

## Quick start

```bash
# 1. Clone
git clone https://github.com/<your-username>/jarvis.git
cd jarvis

# 2. Install everything (backend + frontend + build)
npm run setup

# 3. Configure — interactive wizard (bot token, currency, timezone, PIN → .env)
npm run configure
#    Prefer to edit by hand? `cp .env.example .env` and fill it in instead.
#    Only TELEGRAM_BOT_TOKEN and ALLOWED_USER_ID are required.

# 4. (optional) Configure your household for the budget features
cp config/household.example.json config/household.json
#    then edit config/household.json — see "Household configuration" below

# 5. Run
npm start
```

Then open **http://localhost:3000** (or `http://<your-machine-ip>:3000` from another
device on your network) and message your bot on Telegram.

---

## Getting your Telegram credentials

1. **Bot token** — message [@BotFather](https://t.me/BotFather), send `/newbot`,
   follow the prompts, and copy the token into `TELEGRAM_BOT_TOKEN`.
2. **Your user ID** — message [@userinfobot](https://t.me/userinfobot); it replies with
   your numeric ID. Put it in `ALLOWED_USER_ID`. For a shared household, comma-separate
   several IDs: `ALLOWED_USER_ID=111111,222222`.

The bot **silently ignores** anyone not in `ALLOWED_USER_ID`.

---

## Configuration (`.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | ✅ | Bot token from @BotFather |
| `ALLOWED_USER_ID` | ✅ | Your Telegram user ID (comma-separated for multiple) |
| `PORT` | | Web/API port (default `3000`) |
| `DB_PATH` | | SQLite file path (default `./data/jarvis.db`) |
| `WEB_PIN` | | PIN for the dashboard. Empty = no PIN (anyone on the network can view) |
| `TIMEZONE` | | IANA timezone, e.g. `Europe/Istanbul` |
| `CURRENCY` | | Budget currency, ISO 4217, e.g. `TRY`, `EUR`, `USD` |
| `LOCALE` | | Number/amount formatting, e.g. `tr-TR`, `de-DE`, `en-US` |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` / `OLLAMA_EMBED_MODEL` | | Local AI (Ollama). If unset/unreachable, the app falls back to regex + keyword search |
| `ICS_WATCH_DIR` | | Folder watched for `.ics` files (defaults to your Downloads) |
| `MS_CLIENT_ID` / `MS_TENANT_ID` / `MS_CLIENT_SECRET` | | Outlook/Office 365 calendar sync (optional) |
| `ANYLIST_EMAIL` / `ANYLIST_PASSWORD` | | AnyList list sync (optional) |

Everything except the two Telegram values is optional and **degrades gracefully** when
left blank — unconfigured integrations are skipped, not fatal.

---

## Household configuration (budget)

The budget engine is driven by `config/household.json` (gitignored, never published).
Copy `config/household.example.json` and edit it to describe **your** home:

- **`members`** — the people in your household, with name `aliases` and
  `counterpartyPatterns` (regexes). When a bank line names a member, the transaction is
  treated as an **internal transfer** and excluded from real income/expense totals.
- **`banks`** / **`accounts`** — your banks and accounts (shown in the dashboard).
- **`uploaders`** — the upload buttons (who uploads which bank export, and in what format).
- **`importers`** — defaults the parser applies to known bank exports (Haspa/Wise).
- **`savings.ibanPrefixes`** — IBAN country prefixes that mark a savings account
  (e.g. `["IT"]` for an Italian savings account).
- **`salaryKeywords`** — words that identify salary deposits (your employer names + terms
  like `GEHALT`, `SALARY`) used for pay-period detection.

> Currency and number formatting are set in `.env` (`CURRENCY` / `LOCALE`), not here.

With an empty config the app still runs — it just won't tag people, detect internal
transfers, or auto-detect savings/salary. Auto-categorization always learns from your own
edits over time, so it improves as you use it.

### Supported bank statement formats

Turkish banks (Garanti, Yapı Kredi, İş Bankası, Akbank, QNB, Ziraat, Halkbank, Vakıfbank,
Denizbank, TEB, ING, HSBC, Enpara), German **Haspa** (semicolon CSV), **Wise** (Excel),
and any generic CSV with date / description / amount columns.

---

## Smart-home connectors

Control smart devices (lights, plugs, …) straight from the Telegram bot. Enable
the connectors you want during `npm run configure` — each asks for its own
credentials and stores them in `.env`. Then, in the bot:

```
/cihazlar        # list your devices with On/Off buttons  (aliases: /devices /isik /lamba)
```

**Included:**

- **Govee** — smart lights (bulbs, LED strips): on/off, brightness, colour.
  Get an API key in the Govee Home app → profile → *About Us* → *Apply for API
  Key* (arrives by email), then set `GOVEE_API_KEY` (the wizard does this for you).

**Add your own connector** — the framework is pluggable: drop a file in
`src/connectors/` that implements the contract in
[`src/connectors/base.js`](src/connectors/base.js) (`id`, `name`, `requiredEnv`,
`isConfigured()`, `listDevices()`, and any of `setPower` / `setBrightness` /
`setColor`). The registry auto-discovers it, the onboarding wizard offers it, and
`/cihazlar` controls it — no other wiring needed. See `src/connectors/govee.js`
for a complete example.

---

## Development

```bash
npm run dev          # run the single process (Express API + Next.js + bot)
npm run web:build    # rebuild the Next.js dashboard for production
```

The process serves the Express API (`/api/*`, `/health`, `/login*`) and the Next.js
dashboard (everything else) from the same port on `0.0.0.0`, so it's reachable across
your network.

---

## Privacy & security notes

- **All data is local** — SQLite on your disk. Nothing is sent to any cloud service.
- `.env`, `config/household.json`, `data/`, and `test_data/` are gitignored — your secrets
  and financial data are never committed.
- Set a strong `WEB_PIN`. The dashboard is reachable by anyone on your network without it.
- Keep your bot token private; rotate it via @BotFather if it ever leaks.

---

## License

MIT — see `LICENSE`. Use it, fork it, make it yours.
