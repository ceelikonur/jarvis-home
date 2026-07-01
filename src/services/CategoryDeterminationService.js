/**
 * CategoryDeterminationService
 * test_data/cat_determination.csv dosyasından (KAYNAK, NOT/TÜR, KATEGORİ)
 * lookup tabloları kurar ve yeni işlemlerin kategorisini belirler.
 *
 *   Öncelik: exact source match → source stem match → NOT/TÜR fallback → 'Normal Harcama'
 *
 *   Canonical categories (seed setinde de bulunur):
 *     Normal Harcama, Beklenmedik Harcama, Kültür&Spor&Gastro, Ulaşım,
 *     Tatil, Finlandiya, Gelir, Ev Sabit Gideri (Kira-Fatura), Taşınma,
 *     Taksit, Kredi Kartı Borç Ödeme, Burs, Okul Kredileri, Birikim,
 *     Sigorta, Gerçekleşen Birikim
 */

const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

// Optional seed of labelled (KAYNAK, NOT/TÜR, KATEGORİ) rows used to bootstrap
// auto-categorisation. Personal/gitignored — absent on a fresh clone, in which
// case the service learns purely from the user's own edits (loadUserEdits).
// Override the location with CAT_DETERMINATION_FILE if you keep one elsewhere.
const DETERMINATION_FILE = process.env.CAT_DETERMINATION_FILE
  ? path.resolve(process.env.CAT_DETERMINATION_FILE)
  : path.join(__dirname, '..', '..', 'test_data', 'cat_determination.csv');

// User edits DB'den okunur (tags != '[]' olan tx'ler = elle düzenlenmiş)
function loadUserEdits() {
  try {
    const Database = require('better-sqlite3');
    const dbPath = process.env.DB_PATH || './data/jarvis.db';
    if (!fs.existsSync(dbPath)) return [];
    const udb = new Database(dbPath, { readonly: true, fileMustExist: true });
    const rows = udb.prepare("SELECT source, category, tags FROM budget_transactions WHERE tags IS NOT NULL AND tags != '[]'").all();
    udb.close();
    return rows.map(r => {
      let tags = [];
      try { tags = JSON.parse(r.tags || '[]'); } catch {}
      return { source: r.source || '', category: (r.category || '').trim(), tags };
    }).filter(r => r.source);
  } catch (e) {
    console.warn('[CatDetermination] user edits load skipped:', e.message);
    return [];
  }
}

// Canonical category list — seed these into budget_categories.
const CANONICAL_CATEGORIES = [
  { name: 'Normal Harcama',              color: '#64748b' },
  { name: 'Beklenmedik Harcama',         color: '#f97316' },
  { name: 'Ev Sabit Gideri (Kira-Fatura)', color: '#ef4444' },
  { name: 'Kültür&Spor&Gastro',          color: '#eab308' },
  { name: 'Ulaşım',                       color: '#3b82f6' },
  { name: 'Tatil',                        color: '#06b6d4' },
  { name: 'Finlandiya',                   color: '#22c55e' },
  { name: 'Taşınma',                      color: '#8b5cf6' },
  { name: 'Taksit',                       color: '#14b8a6' },
  { name: 'Kredi Kartı Borç Ödeme',       color: '#dc2626' },
  { name: 'Burs',                         color: '#a855f7' },
  { name: 'Okul Kredileri',               color: '#f59e0b' },
  { name: 'Sigorta',                      color: '#ec4899' },
  { name: 'Birikim',                      color: '#10b981' },
  { name: 'Gelir',                        color: '#16a34a' },
  { name: 'Gerçekleşen Birikim',          color: '#0ea5e9' },
];

// Legacy seed names to clean up on startup (if no tx uses them)
const LEGACY_CATEGORIES = [
  'Market', 'Yeme-İçme', 'Faturalar', 'Kira', 'Sağlık',
  'Giyim', 'Eğlence', 'Eğitim', 'Transferler', 'Diğer',
];

let cached = null;

function normalizeSource(source) {
  return String(source || '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Source'un baş anlamlı kelimesi — jenerik başlıkları atla
const SKIP_WORDS = new Set([
  'CARD', 'TRANSACTION', 'OF', 'EUR', 'ISSUED', 'BY', 'THE',
  'VON', 'BEI', 'AUS', 'DER', 'DIE', 'DAS',
]);

function extractStem(source) {
  const words = normalizeSource(source)
    .split(/[\s\/\-.,]+/)
    .filter(w => w.length >= 3 && !SKIP_WORDS.has(w) && !/^\d+$/.test(w));
  return words[0] || '';
}

function canonicalCategoryName(cat) {
  const c = String(cat || '').trim();
  if (!c) return '';
  if (c.toUpperCase() === 'ULAŞIM') return 'Ulaşım';
  if (c === 'Ev Sabit Giderleri') return 'Ev Sabit Gideri (Kira-Fatura)';
  return c;
}

function loadDetermination() {
  if (cached) return cached;
  const empty = {
    exactToCategory: new Map(),
    stemToCategory: new Map(),
    tagToCategory: new Map(),
    exactToTag: new Map(),
    stemToTag: new Map(),
  };
  if (!fs.existsSync(DETERMINATION_FILE)) {
    console.warn('[CatDetermination] cat_determination.csv yok; fallback kullanılacak');
    cached = empty;
    return cached;
  }
  try {
    const content = fs.readFileSync(DETERMINATION_FILE, 'utf-8');
    const rows = Papa.parse(content, { header: true, skipEmptyLines: true }).data;

    const incr = (map, key, cat) => {
      if (!map.has(key)) map.set(key, new Map());
      const inner = map.get(key);
      inner.set(cat, (inner.get(cat) || 0) + 1);
    };

    const exactMap = new Map();      // src → cat
    const stemMap = new Map();       // stem → cat
    const tagMap = new Map();        // tag → cat
    const exactTagMap = new Map();   // src → tag (NOT/TÜR)
    const stemTagMap = new Map();    // stem → tag

    // Tag name'leri birebir korunur (budget_tags tablosundaki seed casing ile tutarlı).
    // Ör: "Sigorta" ve "BİRİKİM" — tag için UPPERCASE normalize edilmez.
    const normalizeTagName = (raw) => String(raw || '').trim();

    for (const r of rows) {
      const src = normalizeSource(r['KAYNAK']);
      const tagRaw = normalizeTagName(r['NOT/TÜR']);
      const tagKey = tagRaw.toUpperCase();
      const cat = canonicalCategoryName(r['KATEGORİ']);

      if (cat) {
        if (src) incr(exactMap, src, cat);
        const stem = extractStem(src);
        if (stem) incr(stemMap, stem, cat);
        if (tagKey) incr(tagMap, tagKey, cat);
      }

      if (tagRaw) {
        if (src) incr(exactTagMap, src, tagRaw);
        const stem = extractStem(src);
        if (stem) incr(stemTagMap, stem, tagRaw);
      }
    }

    const mostCommon = (counts) => {
      let best = '', max = 0;
      for (const [c, n] of counts) if (n > max) { max = n; best = c; }
      return best;
    };

    // ── User edits (DB) — CSV'den daha güvenilir, override eder ──
    // Kullanıcının elle düzelttiği her işlem source→(category, tags) sinyali verir.
    const userExactCat = new Map();
    const userStemCat = new Map();
    const userExactTag = new Map();
    const userStemTag = new Map();
    const userEdits = loadUserEdits();
    for (const u of userEdits) {
      const src = normalizeSource(u.source);
      const stem = extractStem(u.source);
      const cat = canonicalCategoryName(u.category);
      const firstTag = (u.tags[0] || '').trim();
      if (cat) {
        if (src) incr(userExactCat, src, cat);
        if (stem) incr(userStemCat, stem, cat);
      }
      if (firstTag) {
        if (src) incr(userExactTag, src, firstTag);
        if (stem) incr(userStemTag, stem, firstTag);
      }
    }

    cached = {
      // User edits (yüksek öncelik)
      userExactToCategory: new Map([...userExactCat].map(([k, v]) => [k, mostCommon(v)])),
      userStemToCategory:  new Map([...userStemCat].map(([k, v]) => [k, mostCommon(v)])),
      userExactToTag:      new Map([...userExactTag].map(([k, v]) => [k, mostCommon(v)])),
      userStemToTag:       new Map([...userStemTag].map(([k, v]) => [k, mostCommon(v)])),
      // CSV (düşük öncelik — fallback)
      exactToCategory: new Map([...exactMap].map(([k, v]) => [k, mostCommon(v)])),
      stemToCategory: new Map([...stemMap].map(([k, v]) => [k, mostCommon(v)])),
      tagToCategory: new Map([...tagMap].map(([k, v]) => [k, mostCommon(v)])),
      exactToTag: new Map([...exactTagMap].map(([k, v]) => [k, mostCommon(v)])),
      stemToTag: new Map([...stemTagMap].map(([k, v]) => [k, mostCommon(v)])),
    };
    console.log(`[CatDetermination] CSV ${rows.length} satır + user edits ${userEdits.length} — kategori exact=${cached.exactToCategory.size}+${cached.userExactToCategory.size}, etiket exact=${cached.exactToTag.size}+${cached.userExactToTag.size}`);
    return cached;
  } catch (e) {
    console.warn('[CatDetermination] load failed:', e.message);
    cached = empty;
    return cached;
  }
}

function determineCategory(source, notTur, type, isSavings) {
  if (isSavings) return 'Gerçekleşen Birikim';
  if (type === 'income') return 'Gelir';

  const data = loadDetermination();
  const src = normalizeSource(source);
  const stem = extractStem(source);

  // Öncelik sırası: user edit exact → user stem → CSV exact → CSV stem → tag fallback
  if (src && data.userExactToCategory.has(src)) return data.userExactToCategory.get(src);
  if (stem && data.userStemToCategory.has(stem)) return data.userStemToCategory.get(stem);
  if (src && data.exactToCategory.has(src)) return data.exactToCategory.get(src);
  if (stem && data.stemToCategory.has(stem)) return data.stemToCategory.get(stem);

  const tag = String(notTur || '').trim().toUpperCase();
  if (tag && data.tagToCategory.has(tag)) return data.tagToCategory.get(tag);

  return 'Normal Harcama';
}

// Source'a göre NOT/TÜR (etiket) belirle.
// Öncelik: user edit exact → user stem → CSV exact → CSV stem → '' (fallback yok)
function determineTag(source) {
  const data = loadDetermination();
  const src = normalizeSource(source);
  const stem = extractStem(source);

  if (src && data.userExactToTag.has(src)) return data.userExactToTag.get(src);
  if (stem && data.userStemToTag.has(stem)) return data.userStemToTag.get(stem);
  if (src && data.exactToTag.has(src)) return data.exactToTag.get(src);
  if (stem && data.stemToTag.has(stem)) return data.stemToTag.get(stem);

  return '';
}

// Cache invalidate — PATCH / upsert sonrası çağır ki sonraki parse taze user edit'leri kullansın
function invalidate() {
  cached = null;
}

// Test/diagnostic — reload determination from disk
function reload() {
  cached = null;
  return loadDetermination();
}

module.exports = {
  CANONICAL_CATEGORIES,
  LEGACY_CATEGORIES,
  determineCategory,
  determineTag,
  normalizeSource,
  extractStem,
  reload,
  invalidate,
};
