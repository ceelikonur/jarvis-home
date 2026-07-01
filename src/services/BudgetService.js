const { getDb } = require('../database/init');

// ── Transaction CRUD ────────────────────────────────────────────

function getAllTransactions() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM budget_transactions ORDER BY date ASC').all();
  return rows.map(r => ({
    ...r,
    // Frontend camelCase bekliyor — hem snake hem camel olarak serve et
    subCategory: r.sub_category || '',
    is_fixed: undefined,
    is_internal: r.is_internal === 1,
    is_savings: r.is_savings === 1,
    tags: JSON.parse(r.tags || '[]'),
  }));
}

function getTransactionsByMonth(month) {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM budget_transactions WHERE month = ? ORDER BY date ASC').all(month);
  return rows.map(r => ({ ...r, tags: JSON.parse(r.tags || '[]') }));
}

function upsertTransactions(transactions) {
  const db = getDb();
  // ON CONFLICT: yalnızca yapısal alanları güncelle (parser'dan gelen).
  // category, sub_category, tags — kullanıcının elle düzelttiği alanlar — DOKUNMA.
  // Re-upload durumunda mevcut kaydın kategori/etiket düzeltmeleri korunur.
  const existsStmt = db.prepare(
    'SELECT 1 FROM budget_transactions WHERE date = ? AND source = ? AND amount = ?'
  );
  const upsert = db.prepare(`
    INSERT INTO budget_transactions (date, source, amount, type, category, sub_category, month, person, bank, account, tags, is_internal, is_savings)
    VALUES (@date, @source, @amount, @type, @category, @sub_category, @month, @person, @bank, @account, @tags, @is_internal, @is_savings)
    ON CONFLICT(date, source, amount) DO UPDATE SET
      month = @month,
      person = @person,
      bank = @bank,
      account = @account,
      is_internal = @is_internal,
      is_savings = @is_savings
  `);

  const upsertMany = db.transaction((txList) => {
    let inserted = 0;
    let existing = 0;
    for (const tx of txList) {
      const dateStr = new Date(tx.date).toISOString().slice(0, 10);
      const source = tx.source || '';
      const isExisting = !!existsStmt.get(dateStr, source, tx.amount);
      upsert.run({
        date: dateStr,
        source,
        amount: tx.amount,
        type: tx.type || 'expense',
        category: tx.category || '',
        sub_category: tx.subCategory || tx.sub_category || '',
        month: tx.month || '',
        person: tx.person || '',
        bank: tx.bank || '',
        account: tx.account || '',
        tags: JSON.stringify(tx.tags || []),
        is_internal: tx.is_internal ? 1 : 0,
        is_savings: tx.is_savings ? 1 : 0,
      });
      if (isExisting) existing++;
      else inserted++;
    }
    return { inserted, existing, upserted: inserted + existing };
  });

  return upsertMany(transactions);
}

function deleteTransaction(date, source, amount) {
  const db = getDb();
  const stmt = db.prepare('DELETE FROM budget_transactions WHERE date = ? AND source = ? AND amount = ?');
  return stmt.run(date, source, parseFloat(amount)).changes;
}

function updateTransaction(date, source, amount, updates) {
  const db = getDb();
  const fields = [];
  const values = {};

  if (updates.category !== undefined) {
    fields.push('category = @category');
    values.category = updates.category;
  }
  if (updates.tags !== undefined) {
    fields.push('tags = @tags');
    values.tags = JSON.stringify(updates.tags);
  }
  if (updates.sub_category !== undefined) {
    fields.push('sub_category = @sub_category');
    values.sub_category = updates.sub_category;
  }
  if (updates.installment_id !== undefined) {
    fields.push('installment_id = @installment_id');
    values.installment_id = (updates.installment_id === null || updates.installment_id === '')
      ? null : parseInt(updates.installment_id, 10);
  }

  if (fields.length === 0) return 0;

  values.date = date;
  values.source = source;
  values.amount = parseFloat(amount);

  const stmt = db.prepare(`
    UPDATE budget_transactions SET ${fields.join(', ')}
    WHERE date = @date AND source = @source AND amount = @amount
  `);

  return stmt.run(values).changes;
}

function deleteAllTransactions() {
  const db = getDb();
  return db.prepare('DELETE FROM budget_transactions').run().changes;
}

// ── Bulk edit by keys ───────────────────────────────────────────
// keys: "date|source|amount" dizisi. updates: { category?, tags?, tagsMode? }
// tagsMode 'append' ise mevcut etiketlerin üzerine ekler (tekilleştirir), aksi halde değiştirir.
function parseKey(key) {
  const parts = String(key).split('|');
  if (parts.length < 3) return null;
  return {
    date: parts[0],
    amount: parseFloat(parts[parts.length - 1]),
    source: parts.slice(1, -1).join('|'), // source içinde '|' olabilir
  };
}

function updateTransactionsByKeys(keys, updates) {
  const db = getDb();
  const setCat = updates.category !== undefined && updates.category !== null && updates.category !== '';
  const setTags = Array.isArray(updates.tags);
  if ((!setCat && !setTags) || !Array.isArray(keys) || keys.length === 0) return { updated: 0 };
  const append = updates.tagsMode === 'append';

  const fields = [];
  if (setCat) fields.push('category = @category');
  if (setTags) fields.push('tags = @tags');
  const stmt = db.prepare(`UPDATE budget_transactions SET ${fields.join(', ')} WHERE date = @date AND source = @source AND amount = @amount`);
  const sel = db.prepare('SELECT tags FROM budget_transactions WHERE date = ? AND source = ? AND amount = ?');

  const run = db.transaction(() => {
    let updated = 0;
    for (const key of keys) {
      const k = parseKey(key);
      if (!k) continue;
      const vals = { date: k.date, source: k.source, amount: k.amount };
      if (setCat) vals.category = updates.category;
      if (setTags) {
        let finalTags = updates.tags;
        if (append) {
          const row = sel.get(k.date, k.source, k.amount);
          let existing = [];
          try { existing = JSON.parse(row && row.tags || '[]'); } catch { existing = []; }
          finalTags = [...new Set([...existing, ...updates.tags])];
        }
        vals.tags = JSON.stringify(finalTags);
      }
      updated += stmt.run(vals).changes;
    }
    return updated;
  });

  return { updated: run() };
}

// ── Merchant-based retroactive edit ─────────────────────────────
// Aynı satıcının (source baş anlamlı kelimesi) TÜM işlemlerine bir
// kategori/etiket düzeltmesini geçmişe dönük uygular.
// Not: extractStem ile aynı mantık + '*' karakteri de bölücü kabul edilir
// (ör. "ANTHROPIC* CLAUDE SUB ..." → stem "ANTHROPIC").
const MERCHANT_SKIP_WORDS = new Set([
  'CARD', 'TRANSACTION', 'OF', 'EUR', 'ISSUED', 'BY', 'THE',
  'VON', 'BEI', 'AUS', 'DER', 'DIE', 'DAS',
]);

function merchantStem(source) {
  const words = String(source || '')
    .toUpperCase()
    .split(/[\s/\-.,*]+/)
    .filter(w => w.length >= 3 && !MERCHANT_SKIP_WORDS.has(w) && !/^\d+$/.test(w));
  return words[0] || '';
}

function findTransactionIdsByMerchant(source) {
  const db = getDb();
  const stem = merchantStem(source);
  if (!stem) return [];
  const rows = db.prepare('SELECT id, source FROM budget_transactions').all();
  return rows.filter(r => merchantStem(r.source) === stem).map(r => r.id);
}

function updateTransactionsByMerchant(source, updates) {
  const db = getDb();
  const stem = merchantStem(source);
  const ids = findTransactionIdsByMerchant(source);
  if (!ids.length) return { matched: 0, updated: 0, stem };

  const fields = [];
  const baseVals = {};
  if (updates.category !== undefined) { fields.push('category = @category'); baseVals.category = updates.category; }
  if (updates.tags !== undefined) { fields.push('tags = @tags'); baseVals.tags = JSON.stringify(updates.tags); }
  if (updates.sub_category !== undefined) { fields.push('sub_category = @sub_category'); baseVals.sub_category = updates.sub_category; }
  if (fields.length === 0) return { matched: ids.length, updated: 0, stem };

  const stmt = db.prepare(`UPDATE budget_transactions SET ${fields.join(', ')} WHERE id = @id`);
  const run = db.transaction(() => {
    let updated = 0;
    for (const id of ids) updated += stmt.run({ ...baseVals, id }).changes;
    return updated;
  });
  const updated = run();
  return { matched: ids.length, updated, stem };
}

// ── Category CRUD ────────────────────────────────────────────────

function getAllCategories() {
  const db = getDb();
  return db.prepare('SELECT * FROM budget_categories ORDER BY name ASC').all();
}

function createCategory(name, color, is_fixed) {
  const db = getDb();
  return db.prepare('INSERT INTO budget_categories (name, color, is_fixed) VALUES (?, ?, ?)').run(name, color || '#6366f1', is_fixed ? 1 : 0);
}

function updateCategory(id, data) {
  const db = getDb();
  const existing = db.prepare('SELECT id, name, color, is_fixed FROM budget_categories WHERE id = ?').get(id);
  if (!existing) return null;

  const newName = data.name !== undefined ? String(data.name).trim() : existing.name;
  const newColor = data.color !== undefined ? data.color : existing.color;
  const newFixed = data.is_fixed !== undefined ? (data.is_fixed ? 1 : 0) : existing.is_fixed;
  const rename = newName !== existing.name;

  db.transaction(() => {
    db.prepare('UPDATE budget_categories SET name = ?, color = ?, is_fixed = ? WHERE id = ?')
      .run(newName, newColor, newFixed, id);
    if (rename) {
      // Cascade: mevcut işlemlerdeki eski kategori adını yenisiyle değiştir
      db.prepare('UPDATE budget_transactions SET category = ? WHERE category = ?')
        .run(newName, existing.name);
    }
  })();

  return db.prepare('SELECT * FROM budget_categories WHERE id = ?').get(id);
}

function deleteCategory(id) {
  const db = getDb();
  const existing = db.prepare('SELECT name FROM budget_categories WHERE id = ?').get(id);
  if (!existing) return 0;
  db.transaction(() => {
    db.prepare('DELETE FROM budget_categories WHERE id = ?').run(id);
    // Cascade: bu kategoriye bağlı işlemlerin category alanını temizle
    db.prepare("UPDATE budget_transactions SET category = '' WHERE category = ?").run(existing.name);
  })();
  return 1;
}

// ── Tags CRUD (NOT/TÜR lookup) ──────────────────────────────────

function getAllTags() {
  const db = getDb();
  return db.prepare('SELECT id, name, color FROM budget_tags ORDER BY name ASC').all();
}

function createTag(name, color) {
  const db = getDb();
  const info = db.prepare('INSERT INTO budget_tags (name, color) VALUES (?, ?)').run(name, color || '#6366f1');
  return db.prepare('SELECT id, name, color FROM budget_tags WHERE id = ?').get(info.lastInsertRowid);
}

function updateTag(id, data) {
  const db = getDb();
  const existing = db.prepare('SELECT id, name, color FROM budget_tags WHERE id = ?').get(id);
  if (!existing) return null;

  const newName = data.name !== undefined ? String(data.name).trim() : existing.name;
  const newColor = data.color !== undefined ? data.color : existing.color;

  // Rename cascade: tüm işlemlerdeki sub_category ve tags JSON array'ini güncelle
  const rename = newName !== existing.name;

  db.transaction(() => {
    db.prepare('UPDATE budget_tags SET name = ?, color = ? WHERE id = ?').run(newName, newColor, id);

    if (rename) {
      // sub_category cascade
      db.prepare('UPDATE budget_transactions SET sub_category = ? WHERE sub_category = ?').run(newName, existing.name);

      // tags JSON cascade — JSON array içinde eski adı yeniyle değiştir
      const txs = db.prepare("SELECT id, tags FROM budget_transactions WHERE tags LIKE ?").all(`%${existing.name}%`);
      const upd = db.prepare('UPDATE budget_transactions SET tags = ? WHERE id = ?');
      for (const tx of txs) {
        try {
          const arr = JSON.parse(tx.tags || '[]');
          const next = arr.map(t => t === existing.name ? newName : t);
          if (JSON.stringify(next) !== tx.tags) upd.run(JSON.stringify(next), tx.id);
        } catch { /* skip malformed */ }
      }
    }
  })();

  return db.prepare('SELECT id, name, color FROM budget_tags WHERE id = ?').get(id);
}

function deleteTag(id) {
  const db = getDb();
  const existing = db.prepare('SELECT name FROM budget_tags WHERE id = ?').get(id);
  if (!existing) return 0;

  db.transaction(() => {
    db.prepare('DELETE FROM budget_tags WHERE id = ?').run(id);

    // sub_category temizle
    db.prepare("UPDATE budget_transactions SET sub_category = '' WHERE sub_category = ?").run(existing.name);

    // tags JSON'dan çıkar
    const txs = db.prepare("SELECT id, tags FROM budget_transactions WHERE tags LIKE ?").all(`%${existing.name}%`);
    const upd = db.prepare('UPDATE budget_transactions SET tags = ? WHERE id = ?');
    for (const tx of txs) {
      try {
        const arr = JSON.parse(tx.tags || '[]');
        const next = arr.filter(t => t !== existing.name);
        if (JSON.stringify(next) !== tx.tags) upd.run(JSON.stringify(next), tx.id);
      } catch { /* skip */ }
    }
  })();

  return 1;
}

// ── Rules (otomatik kategorize — mail rules tarzı) ──────────────
function normalizeRule(d) {
  const clean = (v) => (v === undefined || v === null || v === '') ? null : v;
  const amt = (d.match_amount === undefined || d.match_amount === null || d.match_amount === '')
    ? null : parseFloat(d.match_amount);
  return {
    name: String(d.name || 'Kural').trim() || 'Kural',
    enabled: (d.enabled === false || d.enabled === 0) ? 0 : 1,
    match_source: clean(d.match_source),
    match_amount: (amt === null || isNaN(amt)) ? null : amt,
    match_person: clean(d.match_person),
    match_type: clean(d.match_type),
    set_category: clean(d.set_category),
    set_tag: clean(d.set_tag),
    priority: Number.isFinite(+d.priority) ? +d.priority : 0,
  };
}

function getAllRules() {
  const db = getDb();
  return db.prepare('SELECT * FROM budget_rules ORDER BY priority ASC, id ASC').all()
    .map(r => ({ ...r, enabled: r.enabled === 1 }));
}

function createRule(data) {
  const db = getDb();
  const info = db.prepare(`
    INSERT INTO budget_rules (name, enabled, match_source, match_amount, match_person, match_type, set_category, set_tag, priority)
    VALUES (@name, @enabled, @match_source, @match_amount, @match_person, @match_type, @set_category, @set_tag, @priority)
  `).run(normalizeRule(data));
  const row = db.prepare('SELECT * FROM budget_rules WHERE id = ?').get(info.lastInsertRowid);
  return { ...row, enabled: row.enabled === 1 };
}

function updateRule(id, data) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM budget_rules WHERE id = ?').get(id);
  if (!existing) return null;
  const merged = normalizeRule({ ...existing, enabled: existing.enabled, ...data });
  db.prepare(`
    UPDATE budget_rules SET name=@name, enabled=@enabled, match_source=@match_source, match_amount=@match_amount,
      match_person=@match_person, match_type=@match_type, set_category=@set_category, set_tag=@set_tag, priority=@priority
    WHERE id=@id
  `).run({ ...merged, id });
  const row = db.prepare('SELECT * FROM budget_rules WHERE id = ?').get(id);
  return { ...row, enabled: row.enabled === 1 };
}

function deleteRule(id) {
  const db = getDb();
  return db.prepare('DELETE FROM budget_rules WHERE id = ?').run(id).changes;
}

// Bir işlem bir kurala uyuyor mu? (belirtilen tüm koşullar sağlanmalı)
function txMatchesRule(tx, rule) {
  if (rule.match_source) {
    if (!String(tx.source || '').toUpperCase().includes(String(rule.match_source).toUpperCase())) return false;
  }
  if (rule.match_amount !== null && rule.match_amount !== undefined) {
    if (Math.abs(Math.abs(parseFloat(tx.amount)) - Math.abs(rule.match_amount)) > 0.005) return false;
  }
  if (rule.match_person && String(tx.person || '') !== String(rule.match_person)) return false;
  if (rule.match_type && String(tx.type || '') !== String(rule.match_type)) return false;
  return true;
}

// Kuralları bir işleme uygula (tx mutate edilir). tags array beklenir/oluşturulur.
function applyRulesToTx(tx, rules) {
  let changed = false;
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!txMatchesRule(tx, rule)) continue;
    if (rule.set_category) { tx.category = rule.set_category; changed = true; }
    if (rule.set_tag) {
      const tags = Array.isArray(tx.tags) ? tx.tags.slice() : [];
      if (!tags.includes(rule.set_tag)) { tags.push(rule.set_tag); tx.tags = tags; changed = true; }
    }
  }
  return changed;
}

// Tüm mevcut DB işlemlerine kuralları uygula → { updated, rules }
function applyRulesToAll() {
  const db = getDb();
  const rules = getAllRules().filter(r => r.enabled);
  if (!rules.length) return { updated: 0, rules: 0 };
  const rows = db.prepare('SELECT id, source, amount, type, person, category, tags FROM budget_transactions').all();
  const upd = db.prepare('UPDATE budget_transactions SET category = ?, tags = ? WHERE id = ?');
  let updated = 0;
  const run = db.transaction(() => {
    for (const r of rows) {
      let tags = [];
      try { tags = JSON.parse(r.tags || '[]'); } catch { tags = []; }
      const tx = { source: r.source, amount: r.amount, type: r.type, person: r.person, category: r.category, tags };
      const before = JSON.stringify([tx.category, tx.tags]);
      applyRulesToTx(tx, rules);
      if (JSON.stringify([tx.category, tx.tags]) !== before) {
        upd.run(tx.category, JSON.stringify(tx.tags), r.id);
        updated++;
      }
    }
  });
  run();
  return { updated, rules: rules.length };
}

// ── Monthly Budget ────────────────────────────────────────────────

function saveMonthlyBudgets(budgets) {
  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO budget_monthly (month, data) VALUES (@month, @data)
    ON CONFLICT(month) DO UPDATE SET data = @data
  `);

  // Add unique constraint on month if not exists
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_monthly_month ON budget_monthly(month)'); } catch (e) { /* ignore */ }

  const run = db.transaction((list) => {
    for (const b of list) {
      upsert.run({ month: b.month, data: JSON.stringify(b) });
    }
  });

  run(budgets);
}

function getMonthlyBudgets() {
  const db = getDb();
  return db.prepare('SELECT * FROM budget_monthly ORDER BY id ASC').all()
    .map(r => JSON.parse(r.data));
}

// ── Wishlist ────────────────────────────────────────────────

function getWishlist() {
  const db = getDb();
  return db.prepare('SELECT * FROM budget_wishlist ORDER BY id ASC').all();
}

function saveWishlist(items) {
  const db = getDb();
  db.prepare('DELETE FROM budget_wishlist').run();
  const insert = db.prepare('INSERT INTO budget_wishlist (product, price, status, checked) VALUES (@product, @price, @status, @checked)');
  const run = db.transaction((list) => {
    for (const item of list) {
      insert.run({
        product: item.product,
        price: item.price || null,
        status: item.status || '',
        checked: item.checked ? 1 : 0,
      });
    }
  });
  run(items);
}

// ── Installments ────────────────────────────────────────────

function addMonthsISO(dateStr, months) {
  // 'YYYY-MM-DD' bileşenlerini doğrudan ayrıştır (UTC kayması olmasın diye)
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ''));
  if (!m) return null;
  const r = new Date(Number(m[1]), Number(m[2]) - 1 + months, Number(m[3]));
  const y = r.getFullYear();
  const mm = String(r.getMonth() + 1).padStart(2, '0');
  const dd = String(r.getDate()).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

function mapInstallment(r) {
  return {
    id: r.id,
    name: r.name,
    total: r.total,
    installmentCount: r.installment_count,
    monthlyAmount: Math.round((r.monthly_amount || 0) * 100) / 100,
    startDate: r.start_date || null,
    finalDate: r.final_date || null,
  };
}

function getInstallments() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM budget_installments ORDER BY id ASC').all();
  // Bağlı işlemleri (gerçekleşen ödemeler) topla
  const linkStmt = db.prepare(
    'SELECT COUNT(*) as cnt, COALESCE(SUM(ABS(amount)), 0) as paid FROM budget_transactions WHERE installment_id = ?'
  );
  return rows.map(r => {
    const link = linkStmt.get(r.id);
    return { ...mapInstallment(r), linkedCount: link.cnt, linkedPaid: Math.round(link.paid * 100) / 100 };
  });
}

function createInstallment(data) {
  const db = getDb();
  const total = parseFloat(data.total) || 0;
  const count = parseInt(data.installmentCount, 10) || 1;
  const startDate = data.startDate || null;
  const monthly = (data.monthlyAmount !== undefined && data.monthlyAmount !== null && data.monthlyAmount !== '')
    ? parseFloat(data.monthlyAmount)
    : (count > 0 ? total / count : 0);
  const finalDate = startDate ? addMonthsISO(startDate, Math.max(0, count - 1)) : null;
  const info = db.prepare(`
    INSERT INTO budget_installments (name, total, installment_count, paid_count, final_date, monthly_amount, remaining, start_date)
    VALUES (@name, @total, @count, 0, @final, @monthly, @total, @start)
  `).run({ name: String(data.name || 'Taksit').trim() || 'Taksit', total, count, final: finalDate, monthly, start: startDate });
  return mapInstallment(db.prepare('SELECT * FROM budget_installments WHERE id = ?').get(info.lastInsertRowid));
}

function updateInstallment(id, data) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM budget_installments WHERE id = ?').get(id);
  if (!existing) return null;
  const name = data.name !== undefined ? String(data.name).trim() : existing.name;
  const total = data.total !== undefined ? parseFloat(data.total) : existing.total;
  const count = data.installmentCount !== undefined ? parseInt(data.installmentCount, 10) : existing.installment_count;
  const startDate = data.startDate !== undefined ? (data.startDate || null) : existing.start_date;
  const monthly = (data.monthlyAmount !== undefined && data.monthlyAmount !== null && data.monthlyAmount !== '')
    ? parseFloat(data.monthlyAmount)
    : (count > 0 ? total / count : 0);
  const finalDate = startDate ? addMonthsISO(startDate, Math.max(0, count - 1)) : null;
  db.prepare(`
    UPDATE budget_installments SET name=@name, total=@total, installment_count=@count,
      final_date=@final, monthly_amount=@monthly, start_date=@start WHERE id=@id
  `).run({ name, total, count, final: finalDate, monthly, start: startDate, id });
  return mapInstallment(db.prepare('SELECT * FROM budget_installments WHERE id = ?').get(id));
}

function deleteInstallment(id) {
  const db = getDb();
  const run = db.transaction(() => {
    // Bağlı işlemlerin linkini kaldır
    db.prepare('UPDATE budget_transactions SET installment_id = NULL WHERE installment_id = ?').run(id);
    return db.prepare('DELETE FROM budget_installments WHERE id = ?').run(id).changes;
  });
  return run();
}

function saveInstallments(items) {
  const db = getDb();
  db.prepare('DELETE FROM budget_installments').run();
  const insert = db.prepare(`
    INSERT INTO budget_installments (name, total, installment_count, paid_count, final_date, monthly_amount, remaining)
    VALUES (@name, @total, @installment_count, @paid_count, @final_date, @monthly_amount, @remaining)
  `);
  const run = db.transaction((list) => {
    for (const item of list) {
      insert.run({
        name: item.name,
        total: item.total,
        installment_count: item.installmentCount || item.installment_count || 0,
        paid_count: item.paidCount || item.paid_count || 0,
        final_date: item.finalDate ? new Date(item.finalDate).toISOString().slice(0, 10) : null,
        monthly_amount: item.monthlyAmount || item.monthly_amount || 0,
        remaining: item.remaining || 0,
      });
    }
  });
  run(items);
}

// ── Summary for Telegram ────────────────────────────────────────

function getMonthlySummary(month) {
  const db = getDb();
  const income = db.prepare(
    "SELECT COALESCE(SUM(amount), 0) as total FROM budget_transactions WHERE type = 'income' AND UPPER(month) = UPPER(?)"
  ).get(month);
  const expense = db.prepare(
    "SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM budget_transactions WHERE type = 'expense' AND UPPER(month) = UPPER(?)"
  ).get(month);
  const topCategories = db.prepare(`
    SELECT category, SUM(ABS(amount)) as total, COUNT(*) as count
    FROM budget_transactions
    WHERE type = 'expense' AND UPPER(month) = UPPER(?) AND category != ''
    GROUP BY category ORDER BY total DESC LIMIT 5
  `).all(month);

  return {
    income: income.total,
    expense: expense.total,
    balance: income.total - expense.total,
    topCategories,
  };
}

function getCurrentMonthName() {
  const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  return months[new Date().getMonth()];
}

module.exports = {
  getAllTransactions,
  getTransactionsByMonth,
  upsertTransactions,
  updateTransaction,
  updateTransactionsByMerchant,
  updateTransactionsByKeys,
  merchantStem,
  deleteTransaction,
  deleteAllTransactions,
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getAllTags,
  createTag,
  updateTag,
  deleteTag,
  getAllRules,
  createRule,
  updateRule,
  deleteRule,
  applyRulesToTx,
  applyRulesToAll,
  saveMonthlyBudgets,
  getMonthlyBudgets,
  getWishlist,
  saveWishlist,
  getInstallments,
  saveInstallments,
  createInstallment,
  updateInstallment,
  deleteInstallment,
  getMonthlySummary,
  getCurrentMonthName,
};
