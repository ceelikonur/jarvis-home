#!/usr/bin/env node
/**
 * J.A.R.V.I.S. — interactive setup wizard.
 *
 *   npm run configure
 *
 * Collects the essential settings (Telegram credentials, currency, locale,
 * timezone, dashboard PIN) and writes them to .env. Dependency-free (Node's
 * built-in readline). Re-running it keeps your existing .env values as
 * defaults, so it's safe to run again to change a setting.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env');
const EXAMPLE_FILE = path.join(ROOT, '.env.example');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

const CURRENCIES = [
  { code: 'TRY', locale: 'tr-TR', label: 'Türk Lirası (₺)' },
  { code: 'EUR', locale: 'de-DE', label: 'Euro (€)' },
  { code: 'USD', locale: 'en-US', label: 'US Dollar ($)' },
  { code: 'GBP', locale: 'en-GB', label: 'British Pound (£)' },
];

function parseEnv(file) {
  const map = {};
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) map[m[1]] = m[2];
    }
  }
  return map;
}

// A value is a "real" default only if it's set and not an .env.example placeholder.
function realDefault(val) {
  if (!val) return '';
  return /^your-.*-here$/.test(val) ? '' : val;
}

async function main() {
  console.log('\n🏠  J.A.R.V.I.S. setup — press Enter to accept the [default].\n');

  const current = parseEnv(fs.existsSync(ENV_FILE) ? ENV_FILE : EXAMPLE_FILE);
  const askWithDefault = async (label, key, fallback = '') => {
    const def = realDefault(current[key]) || fallback;
    const ans = (await ask(`${label}${def ? ` [${def}]` : ''}: `)).trim();
    return ans || def;
  };

  // ── Required ──
  const token = await askWithDefault('Telegram bot token (from @BotFather)', 'TELEGRAM_BOT_TOKEN');
  const userId = await askWithDefault('Your Telegram user ID (from @userinfobot)', 'ALLOWED_USER_ID');

  // ── Currency (+ matching locale) ──
  console.log('\nWhich currency should the budget use?');
  CURRENCIES.forEach((c, i) => console.log(`  ${i + 1}) ${c.code} — ${c.label}`));
  console.log(`  ${CURRENCIES.length + 1}) Other`);
  const pick = (await ask(`Select [1]: `)).trim() || '1';

  let currency, locale;
  const chosen = CURRENCIES[parseInt(pick, 10) - 1];
  if (chosen) {
    currency = chosen.code;
    locale = chosen.locale;
  } else {
    currency = ((await ask('  Currency code (ISO 4217, e.g. CHF): ')).trim() || 'EUR').toUpperCase();
    locale = (await ask('  Locale (BCP-47, e.g. fr-CH): ')).trim() || 'en-US';
  }

  // ── Locale & PIN & timezone ──
  const timezone = await askWithDefault('Timezone (IANA, e.g. Europe/Istanbul)', 'TIMEZONE', 'Europe/Istanbul');
  const pin = await askWithDefault('Web dashboard PIN (leave blank to disable)', 'WEB_PIN');

  // ── Write .env ──
  // Base the file on the existing .env (preserves optional keys you already set)
  // or on .env.example for a first run (keeps the helpful comments).
  const base = fs.existsSync(ENV_FILE) ? ENV_FILE : EXAMPLE_FILE;
  const values = {
    TELEGRAM_BOT_TOKEN: token,
    ALLOWED_USER_ID: userId,
    CURRENCY: currency,
    LOCALE: locale,
    TIMEZONE: timezone,
    WEB_PIN: pin,
  };
  const out = fs.readFileSync(base, 'utf8').split(/\r?\n/).map((line) => {
    const m = line.match(/^([A-Z0-9_]+)=/);
    return m && values[m[1]] !== undefined ? `${m[1]}=${values[m[1]]}` : line;
  });
  fs.writeFileSync(ENV_FILE, out.join('\n'));

  console.log(`\n✅  Saved .env  (currency: ${currency}, locale: ${locale})`);
  if (!token || !userId) {
    console.log('⚠️  Telegram bot token / user ID are still empty — edit .env before starting.');
  }
  console.log('\nNext:  npm start   →   http://localhost:3000\n');
  rl.close();
}

main().catch((err) => {
  console.error('Setup failed:', err.message);
  rl.close();
  process.exit(1);
});
