const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { config } = require('../config');

let db;

function getDb() {
  if (db) return db;

  // Ensure the data directory exists
  const dbDir = path.dirname(config.database.path);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(config.database.path);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run migrations
  migrate(db);

  console.log(`✅ Database initialized at ${config.database.path}`);
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      due_date DATETIME,
      priority TEXT NOT NULL DEFAULT 'normal',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      start_time DATETIME NOT NULL,
      end_time DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      icon TEXT DEFAULT '📋',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS list_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      list_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      checked INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      source_id INTEGER,
      content TEXT NOT NULL,
      embedding TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS calendar_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      color TEXT DEFAULT '#00d4ff',
      owner TEXT NOT NULL DEFAULT 'sir',
      last_synced TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS imported_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL,
      uid TEXT,
      title TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      all_day INTEGER DEFAULT 0,
      last_synced TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (source_id) REFERENCES calendar_sources(id) ON DELETE CASCADE
    );

    -- ── Budget tables ──────────────────────────────────────
    CREATE TABLE IF NOT EXISTS budget_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      source TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      category TEXT NOT NULL DEFAULT '',
      sub_category TEXT NOT NULL DEFAULT '',
      month TEXT NOT NULL DEFAULT '',
      person TEXT NOT NULL DEFAULT '',
      bank TEXT NOT NULL DEFAULT '',
      account TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(date, source, amount)
    );

    CREATE INDEX IF NOT EXISTS idx_budget_tx_month ON budget_transactions(month);
    CREATE INDEX IF NOT EXISTS idx_budget_tx_type ON budget_transactions(type);

    CREATE TABLE IF NOT EXISTS budget_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#6366f1',
      is_fixed INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS budget_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#6366f1'
    );

    CREATE TABLE IF NOT EXISTS budget_monthly (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS budget_wishlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product TEXT NOT NULL,
      price REAL,
      status TEXT NOT NULL DEFAULT '',
      checked INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS budget_installments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      total REAL NOT NULL,
      installment_count INTEGER NOT NULL DEFAULT 0,
      paid_count INTEGER NOT NULL DEFAULT 0,
      final_date TEXT,
      monthly_amount REAL NOT NULL DEFAULT 0,
      remaining REAL NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ── Auth table for web PIN access ────────────────────
    CREATE TABLE IF NOT EXISTS web_sessions (
      id TEXT PRIMARY KEY,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL
    );

    -- ── Forecast learning system ──────────────────────────
    -- Snapshot every forecast we make so we can score it later
    CREATE TABLE IF NOT EXISTS forecast_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_month TEXT NOT NULL,        -- "YYYY-MM" the forecast is for
      generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      category TEXT NOT NULL,
      forecast_amount REAL NOT NULL,     -- predicted value
      low REAL NOT NULL,
      high REAL NOT NULL,
      confidence TEXT NOT NULL,
      method TEXT NOT NULL,
      samples INTEGER NOT NULL,
      actual_amount REAL,                -- filled when month closes
      error_pct REAL,                    -- (actual - forecast) / forecast * 100
      scored_at DATETIME
    );

    CREATE INDEX IF NOT EXISTS idx_forecast_snapshots_target ON forecast_snapshots(target_month);
    CREATE INDEX IF NOT EXISTS idx_forecast_snapshots_cat ON forecast_snapshots(category);

    -- User feedback on anomalies — model learns what's "normal" for this user
    CREATE TABLE IF NOT EXISTS anomaly_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tx_date TEXT NOT NULL,
      tx_source TEXT NOT NULL,
      tx_amount REAL NOT NULL,
      verdict TEXT NOT NULL CHECK(verdict IN ('normal','correct','wrong-category')),
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tx_date, tx_source, tx_amount)
    );

    -- Recurring whitelist/blacklist — user-confirmed recurring patterns
    CREATE TABLE IF NOT EXISTS recurring_overrides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern_key TEXT NOT NULL UNIQUE,  -- normalized source key
      action TEXT NOT NULL CHECK(action IN ('whitelist','blacklist')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- _meta: tek-seferlik seed'leri takip etmek için
    CREATE TABLE IF NOT EXISTS _meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Timeboxes: micro-plan items for the day (separate from events)
    CREATE TABLE IF NOT EXISTS timeboxes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,                                       -- 'YYYY-MM-DD'
      start_time TEXT NOT NULL,                                 -- 'YYYY-MM-DD HH:MM'
      end_time TEXT NOT NULL,                                   -- 'YYYY-MM-DD HH:MM'
      title TEXT NOT NULL,
      task_id INTEGER,                                          -- optional FK to tasks
      status TEXT NOT NULL DEFAULT 'planned'
        CHECK(status IN ('planned','done','skipped')),
      notes TEXT,
      notified INTEGER NOT NULL DEFAULT 0,                      -- start-ping fired
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_timeboxes_date ON timeboxes(date);
    CREATE INDEX IF NOT EXISTS idx_timeboxes_start ON timeboxes(start_time);

    -- ── Auto-categorization rules (mail-rules tarzı) ──────
    -- Eşleşen işlemlere otomatik kategori/etiket atar.
    CREATE TABLE IF NOT EXISTS budget_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      match_source TEXT,        -- açıklama/kaynak içerir (NULL = herhangi)
      match_amount REAL,        -- mutlak tutar (NULL = herhangi)
      match_person TEXT,        -- 'Onur' | 'Şewi' | NULL
      match_type TEXT,          -- 'income' | 'expense' | NULL
      set_category TEXT,        -- aksiyon: kategori ata
      set_tag TEXT,             -- aksiyon: etiket ekle
      priority INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Seed default lists if they don't exist
    INSERT OR IGNORE INTO lists (name, icon) VALUES ('alışveriş', '🛒');
    INSERT OR IGNORE INTO lists (name, icon) VALUES ('izleme', '🎬');
    INSERT OR IGNORE INTO lists (name, icon) VALUES ('okuma', '📚');
  `);

  // Add priority column to existing tasks table if it doesn't exist
  try {
    db.exec(`ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'`);
  } catch (err) {
    // Column already exists — safe to ignore
  }

  // Add recurrence_days column for recurring tasks (NULL = one-off)
  try {
    db.exec(`ALTER TABLE tasks ADD COLUMN recurrence_days INTEGER`);
  } catch (err) {
    // Column already exists — safe to ignore
  }

  // Add is_internal column to budget_transactions (household transfer marker)
  try {
    db.exec(`ALTER TABLE budget_transactions ADD COLUMN is_internal INTEGER NOT NULL DEFAULT 0`);
  } catch (err) {
    // Column already exists — safe to ignore
  }

  // Add is_savings column — Intesa (IT IBAN) savings transfer marker
  try {
    db.exec(`ALTER TABLE budget_transactions ADD COLUMN is_savings INTEGER NOT NULL DEFAULT 0`);
  } catch (err) {
    // Column already exists — safe to ignore
  }

  // Add start_date (ilk ödeme tarihi) to installments for manual entry
  try {
    db.exec(`ALTER TABLE budget_installments ADD COLUMN start_date TEXT`);
  } catch (err) {
    // Column already exists — safe to ignore
  }

  // Link a transaction to an installment (PayPal taksit ödemesi → taksit)
  try {
    db.exec(`ALTER TABLE budget_transactions ADD COLUMN installment_id INTEGER`);
  } catch (err) {
    // Column already exists — safe to ignore
  }

  // ── One-time seeding (silinen kayıtları restart'ta geri getirme) ──
  // _meta.categories_seeded / tags_seeded bayrakları ile takip.
  const getMeta = db.prepare('SELECT value FROM _meta WHERE key = ?');
  const setMeta = db.prepare('INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)');

  // Legacy kullanıcılar için: tablo zaten doluysa seed "önceden yapılmış" sayılsın
  const catCount = db.prepare('SELECT COUNT(*) as n FROM budget_categories').get().n;
  const tagCount = db.prepare('SELECT COUNT(*) as n FROM budget_tags').get().n;
  if (catCount > 0 && !getMeta.get('categories_seeded')) setMeta.run('categories_seeded', '1');
  if (tagCount > 0 && !getMeta.get('tags_seeded')) setMeta.run('tags_seeded', '1');

  if (!getMeta.get('categories_seeded')) {
    const CAT_SEED = [
      { name: 'Normal Harcama',                 color: '#64748b', is_fixed: 0 },
      { name: 'Beklenmedik Harcama',            color: '#f97316', is_fixed: 0 },
      { name: 'Ev Sabit Gideri (Kira-Fatura)',  color: '#ef4444', is_fixed: 1 },
      { name: 'Kültür&Spor&Gastro',             color: '#eab308', is_fixed: 0 },
      { name: 'Ulaşım',                         color: '#3b82f6', is_fixed: 0 },
      { name: 'Tatil',                          color: '#06b6d4', is_fixed: 0 },
      { name: 'Finlandiya',                     color: '#22c55e', is_fixed: 0 },
      { name: 'Taşınma',                        color: '#8b5cf6', is_fixed: 0 },
      { name: 'Taksit',                         color: '#14b8a6', is_fixed: 0 },
      { name: 'Kredi Kartı Borç Ödeme',         color: '#dc2626', is_fixed: 0 },
      { name: 'Burs',                           color: '#a855f7', is_fixed: 0 },
      { name: 'Okul Kredileri',                 color: '#f59e0b', is_fixed: 0 },
      { name: 'Sigorta',                        color: '#ec4899', is_fixed: 0 },
      { name: 'Birikim',                        color: '#10b981', is_fixed: 0 },
      { name: 'Gelir',                          color: '#16a34a', is_fixed: 0 },
      { name: 'Gerçekleşen Birikim',            color: '#0ea5e9', is_fixed: 0 },
    ];
    const ins = db.prepare('INSERT OR IGNORE INTO budget_categories (name, color, is_fixed) VALUES (?, ?, ?)');
    for (const c of CAT_SEED) ins.run(c.name, c.color, c.is_fixed);
    setMeta.run('categories_seeded', '1');
  }

  if (!getMeta.get('tags_seeded')) {
    const TAG_SEED = [
      { name: 'MARKET ALIŞVERİŞ',                    color: '#22c55e' },
      { name: 'DIŞARIDA YEMEK',                      color: '#f97316' },
      { name: 'KİŞİSEL/KIYAFET ALIŞVERİŞ/EV EŞYASI', color: '#06b6d4' },
      { name: 'ULAŞIM',                              color: '#3b82f6' },
      { name: 'APP/ÜYELİK',                          color: '#eab308' },
      { name: 'FATURA',                              color: '#8b5cf6' },
      { name: 'ENTERTAINMENT',                       color: '#a855f7' },
      { name: 'MAAŞ',                                color: '#16a34a' },
      { name: 'CASH WITHDRAWAL',                     color: '#64748b' },
      { name: 'BEKLENMEDİK',                         color: '#ef4444' },
      { name: 'TAŞINMA',                             color: '#78716c' },
      { name: 'KİRA',                                color: '#dc2626' },
      { name: 'TATIL',                               color: '#14b8a6' },
      { name: 'SPOR',                                color: '#f59e0b' },
      { name: 'Sigorta',                             color: '#ec4899' },
      { name: 'BAKIM & KOZMETİK',                    color: '#f472b6' },
      { name: 'VERGİ/FAİZ/CEZA',                     color: '#b91c1c' },
      { name: 'SAĞLIK',                              color: '#f43f5e' },
      { name: 'BİRİKİM',                             color: '#0ea5e9' },
      { name: 'DİĞER',                               color: '#94a3b8' },
    ];
    const ins = db.prepare('INSERT OR IGNORE INTO budget_tags (name, color) VALUES (?, ?)');
    for (const t of TAG_SEED) ins.run(t.name, t.color);
    setMeta.run('tags_seeded', '1');
  }

  // Legacy category cleanup — eski seed adlarını (Market, Yeme-İçme, vs) tx kullanmıyorsa sil
  const LEGACY = ['Market', 'Yeme-İçme', 'Faturalar', 'Kira', 'Sağlık', 'Giyim', 'Eğlence', 'Eğitim', 'Transferler', 'Diğer'];
  const checkStmt = db.prepare("SELECT COUNT(*) as n FROM budget_transactions WHERE category = ?");
  const delStmt = db.prepare('DELETE FROM budget_categories WHERE name = ?');
  for (const legacy of LEGACY) {
    if (checkStmt.get(legacy).n === 0) delStmt.run(legacy);
  }
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
    console.log('📦 Database connection closed.');
  }
}

module.exports = { getDb, closeDb };
