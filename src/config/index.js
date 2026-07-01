const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// ALLOWED_USER_ID accepts either a single ID ("123") or comma-separated
// list ("123,456") for shared household use. Backward compatible — single
// value parses cleanly into a 1-element array.
const allowedUserIds = (process.env.ALLOWED_USER_ID || '')
  .split(',')
  .map(s => Number(s.trim()))
  .filter(n => Number.isFinite(n) && n > 0);

const config = {
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    allowedUserIds,
    // Kept for any caller that only needs one ID (legacy/single-target ops).
    // Broadcast targets should iterate allowedUserIds instead.
    allowedUserId: allowedUserIds[0],
  },
  server: {
    port: Number(process.env.PORT) || 3000,
  },
  database: {
    path: process.env.DB_PATH
      ? path.resolve(__dirname, '../../', process.env.DB_PATH)
      : path.resolve(__dirname, '../../data/jarvis.db'),
  },
  ai: {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
    model: process.env.OLLAMA_MODEL || 'llama3.2',
    embedModel: process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text',
  },
  // IANA timezone — used for cron schedules, calendar formatting, AI date
  // context. Default: Europe/Berlin (Hamburg). Override via TIMEZONE env var
  // when deploying elsewhere.
  timezone: process.env.TIMEZONE || 'Europe/Berlin',
  // Display locale + currency for the budget UI. e.g. Turkey: LOCALE=tr-TR,
  // CURRENCY=TRY · Germany: LOCALE=de-DE, CURRENCY=EUR · US: en-US, USD.
  locale: process.env.LOCALE || 'en-US',
  currency: process.env.CURRENCY || 'EUR',
  microsoft: {
    clientId: process.env.MS_CLIENT_ID || '',
    tenantId: process.env.MS_TENANT_ID || '',
    clientSecret: process.env.MS_CLIENT_SECRET || '',
    redirectUri: `http://localhost:${Number(process.env.PORT) || 3000}/api/ms-calendar/callback`,
  },
  anylist: {
    email: process.env.ANYLIST_EMAIL || '',
    password: process.env.ANYLIST_PASSWORD || '',
  },
  web: {
    pin: process.env.WEB_PIN || '',
    nextPort: Number(process.env.NEXT_PORT) || 3001,
  },
};

// Validate critical config on startup
function validateConfig() {
  const missing = [];
  if (!config.telegram.botToken) missing.push('TELEGRAM_BOT_TOKEN');
  if (config.telegram.allowedUserIds.length === 0) missing.push('ALLOWED_USER_ID');
  if (missing.length > 0) {
    console.error(`❌ Missing required env vars: ${missing.join(', ')}`);
    console.error('   Copy .env.example to .env and fill in the values.');
    process.exit(1);
  }
}

module.exports = { config, validateConfig };
