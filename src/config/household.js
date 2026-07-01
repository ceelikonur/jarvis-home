/**
 * Household configuration loader.
 *
 * Reads config/household.json (gitignored, user-specific). When the file is
 * missing or a field is absent, sane generic defaults are used so the app
 * still runs — internal-transfer and savings detection simply turn off and
 * the parser falls back to neutral labels. Copy config/household.example.json
 * to config/household.json to customise.
 */

const fs = require('fs');
const path = require('path');
require('./index'); // ensures .env is loaded (dotenv) so LOCALE/CURRENCY are available

const FILE = path.resolve(__dirname, '../../config/household.json');

const DEFAULTS = {
  locale: 'en-US',
  currency: 'EUR',
  members: [],
  banks: [],
  accounts: [],
  uploaders: [],
  importers: {},
  savings: { ibanPrefixes: [] },
  salaryKeywords: ['SALARY', 'PAYROLL', 'GEHALT', 'LOHN', 'MAAŞ'],
};

let cache = null;

function build(raw) {
  const cfg = {
    ...DEFAULTS,
    ...raw,
    savings: { ...DEFAULTS.savings, ...(raw.savings || {}) },
  };
  delete cfg._README;

  // locale/currency are app-wide display settings, set in .env (see config/index.js).
  // Precedence: env var > household.json > default. Turkey: LOCALE=tr-TR, CURRENCY=TRY.
  cfg.locale = process.env.LOCALE || raw.locale || DEFAULTS.locale;
  cfg.currency = process.env.CURRENCY || raw.currency || DEFAULTS.currency;

  // Names + aliases used to recognise a household member in free text.
  cfg.memberNames = (cfg.members || []).map(m => m.name).filter(Boolean);
  cfg.memberAliases = (cfg.members || []).flatMap(m => [m.name, ...(m.aliases || [])]).filter(Boolean);

  // Precompiled regexes for internal-transfer detection (counterparty = a member).
  cfg._memberRegexes = (cfg.members || [])
    .flatMap(m => m.counterpartyPatterns || [])
    .map(p => {
      try { return new RegExp(p, 'i'); }
      catch { console.warn(`⚠️  household: invalid counterpartyPattern "${p}"`); return null; }
    })
    .filter(Boolean);

  cfg._savingsPrefixes = (cfg.savings.ibanPrefixes || []).map(p => String(p).toUpperCase());
  return cfg;
}

function load() {
  if (cache) return cache;
  let raw = {};
  try {
    if (fs.existsSync(FILE)) {
      raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    } else {
      console.log('🏠 config/household.json not found — using generic defaults. Copy config/household.example.json to customise.');
    }
  } catch (e) {
    console.warn(`⚠️  config/household.json could not be parsed (${e.message}) — using defaults.`);
  }
  cache = build(raw);
  return cache;
}

/** Force re-read from disk (e.g. after the user edits the config via the UI). */
function reload() { cache = null; return load(); }

/** True when free text mentions any household member (an internal transfer). */
function isInternalTransfer(text) {
  if (!text) return false;
  const cfg = load();
  return cfg._memberRegexes.some(re => re.test(String(text)));
}

/** True when an IBAN belongs to a configured savings account (by country prefix). */
function isSavingsIBAN(iban) {
  const cfg = load();
  if (cfg._savingsPrefixes.length === 0) return false;
  const clean = String(iban || '').replace(/\s+/g, '').toUpperCase();
  return cfg._savingsPrefixes.some(prefix => clean.startsWith(prefix));
}

/** Importer defaults for a known bank export, or generic fallback. */
function getImporter(key, fallbackBank) {
  const cfg = load();
  return cfg.importers[key] || { person: null, bank: fallbackBank || null, account: fallbackBank || '' };
}

module.exports = {
  load,
  reload,
  isInternalTransfer,
  isSavingsIBAN,
  getImporter,
  get config() { return load(); },
};
