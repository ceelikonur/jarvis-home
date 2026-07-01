const express = require('express');
const multer = require('multer');
const BudgetService = require('../../services/BudgetService');
const ParserService = require('../../services/ParserService');
const Household = require('../../config/household');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ── Household config (frontend-safe view) ───────────────────────
// GET /api/budget/household — members, banks, accounts, uploaders, salary
// keywords, locale/currency. No secrets; drives the budget UI so it isn't
// hardcoded to one household.
router.get('/budget/household', (req, res) => {
  try {
    const c = Household.config;
    res.json({
      locale: c.locale,
      currency: c.currency,
      members: c.memberNames,
      banks: c.banks,
      accounts: c.accounts,
      uploaders: c.uploaders,
      salaryKeywords: c.salaryKeywords,
    });
  } catch (err) {
    console.error('[budget/household GET]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Transactions ────────────────────────────────────────────────

// GET /api/budget/transactions
router.get('/budget/transactions', (req, res) => {
  try {
    const transactions = BudgetService.getAllTransactions();
    res.json({ transactions });
  } catch (err) {
    console.error('[budget/transactions GET]', err);
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/budget/transactions — Upsert transactions
router.post('/budget/transactions', (req, res) => {
  try {
    const { transactions } = req.body;
    // Savings flag parser'dan gelir (IBAN tabanlı) — koru. Internal'ı yeniden hesapla.
    for (const tx of transactions || []) {
      if (tx.is_savings) {
        // Savings, internal'dan üstün
        tx.is_internal = false;
        tx.category = tx.category || ParserService.SAVINGS_CATEGORY;
        tx.subCategory = tx.subCategory || ParserService.SAVINGS_SUBCATEGORY;
      } else {
        tx.is_internal = ParserService.isInternalTransfer(tx.source, tx.person);
      }
    }
    // Kuralları uygula (yeni eklenenlere yansır)
    const activeRules = BudgetService.getAllRules().filter(r => r.enabled);
    if (activeRules.length) {
      for (const tx of (transactions || [])) BudgetService.applyRulesToTx(tx, activeRules);
    }
    const upserted = BudgetService.upsertTransactions(transactions);
    res.json({ upserted });
  } catch (err) {
    console.error('[budget/transactions POST]', err);
    res.status(500).json({ error: String(err) });
  }
});

// PATCH /api/budget/transactions/:key — Update category/tags
//   body.applyToSimilar === true  → aynı satıcının TÜM işlemlerine geçmişe dönük uygula
router.patch('/budget/transactions/:key', (req, res) => {
  try {
    const { category, tags, sub_category, installment_id, applyToSimilar } = req.body;
    const [date, source, amount] = decodeURIComponent(req.params.key).split('|');
    let result;
    if (applyToSimilar) {
      // Kategori/etiket satıcının tümüne; installment_id ASLA yayılmaz (her ödeme ayrı)
      result = BudgetService.updateTransactionsByMerchant(source, { category, tags, sub_category });
    } else {
      const updated = BudgetService.updateTransaction(date, source, amount, { category, tags, sub_category, installment_id });
      result = { matched: 1, updated };
    }
    // User edit yapıldı — determination cache'i boşalt, sonraki parse taze değerleri görür
    ParserService.invalidateDetermination && ParserService.invalidateDetermination();
    res.json(result);
  } catch (err) {
    console.error('[budget/transactions PATCH]', err);
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/budget/transactions/bulk — Seçili işlemleri (keys) toplu güncelle
//   body: { keys: string[], category?, tags?, tagsMode?: 'replace'|'append' }
router.post('/budget/transactions/bulk', (req, res) => {
  try {
    const { keys, category, tags, tagsMode } = req.body || {};
    if (!Array.isArray(keys) || keys.length === 0) {
      return res.status(400).json({ error: 'keys gerekli' });
    }
    const result = BudgetService.updateTransactionsByKeys(keys, { category, tags, tagsMode });
    ParserService.invalidateDetermination && ParserService.invalidateDetermination();
    res.json(result);
  } catch (err) {
    console.error('[budget/transactions bulk POST]', err);
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/budget/transactions — Clear all
router.delete('/budget/transactions', (req, res) => {
  try {
    const deleted = BudgetService.deleteAllTransactions();
    res.json({ deleted });
  } catch (err) {
    console.error('[budget/transactions DELETE]', err);
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/budget/transactions/:key — Delete single transaction
router.delete('/budget/transactions/:key', (req, res) => {
  try {
    const [date, source, amount] = decodeURIComponent(req.params.key).split('|');
    if (!date || source === undefined || amount === undefined) {
      return res.status(400).json({ error: 'Geçersiz key' });
    }
    const deleted = BudgetService.deleteTransaction(date, source, amount);
    res.json({ deleted });
  } catch (err) {
    console.error('[budget/transactions DELETE one]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Categories ──────────────────────────────────────────────────

// GET /api/budget/categories
router.get('/budget/categories', (req, res) => {
  try {
    const categories = BudgetService.getAllCategories();
    res.json({ categories });
  } catch (err) {
    console.error('[budget/categories GET]', err);
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/budget/categories
router.post('/budget/categories', (req, res) => {
  try {
    const { name, color, is_fixed } = req.body;
    BudgetService.createCategory(name, color, is_fixed);
    res.json({ created: true });
  } catch (err) {
    console.error('[budget/categories POST]', err);
    res.status(500).json({ error: String(err) });
  }
});

// PUT /api/budget/categories/:id
router.put('/budget/categories/:id', (req, res) => {
  try {
    const category = BudgetService.updateCategory(parseInt(req.params.id), req.body);
    ParserService.invalidateDetermination && ParserService.invalidateDetermination();
    res.json({ category });
  } catch (err) {
    console.error('[budget/categories PUT]', err);
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/budget/categories/:id
router.delete('/budget/categories/:id', (req, res) => {
  try {
    BudgetService.deleteCategory(parseInt(req.params.id));
    ParserService.invalidateDetermination && ParserService.invalidateDetermination();
    res.json({ deleted: true });
  } catch (err) {
    console.error('[budget/categories DELETE]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Tags (NOT/TÜR) ──────────────────────────────────────────────

router.get('/budget/tags', (req, res) => {
  try {
    const tags = BudgetService.getAllTags();
    res.json({ tags });
  } catch (err) {
    console.error('[budget/tags GET]', err);
    res.status(500).json({ error: String(err) });
  }
});

router.post('/budget/tags', (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Ad zorunlu' });
    const tag = BudgetService.createTag(String(name).trim(), color);
    res.json({ tag });
  } catch (err) {
    console.error('[budget/tags POST]', err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

router.put('/budget/tags/:id', (req, res) => {
  try {
    const tag = BudgetService.updateTag(parseInt(req.params.id), req.body);
    if (!tag) return res.status(404).json({ error: 'Etiket bulunamadı' });
    ParserService.invalidateDetermination && ParserService.invalidateDetermination();
    res.json({ tag });
  } catch (err) {
    console.error('[budget/tags PUT]', err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

router.delete('/budget/tags/:id', (req, res) => {
  try {
    const deleted = BudgetService.deleteTag(parseInt(req.params.id));
    ParserService.invalidateDetermination && ParserService.invalidateDetermination();
    res.json({ deleted });
  } catch (err) {
    console.error('[budget/tags DELETE]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Rules (otomatik kategorize) ─────────────────────────────────

router.get('/budget/rules', (req, res) => {
  try {
    res.json({ rules: BudgetService.getAllRules() });
  } catch (err) {
    console.error('[budget/rules GET]', err);
    res.status(500).json({ error: String(err) });
  }
});

router.post('/budget/rules', (req, res) => {
  try {
    const rule = BudgetService.createRule(req.body || {});
    res.json({ rule });
  } catch (err) {
    console.error('[budget/rules POST]', err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

router.put('/budget/rules/:id', (req, res) => {
  try {
    const rule = BudgetService.updateRule(parseInt(req.params.id), req.body || {});
    if (!rule) return res.status(404).json({ error: 'Kural bulunamadı' });
    res.json({ rule });
  } catch (err) {
    console.error('[budget/rules PUT]', err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

router.delete('/budget/rules/:id', (req, res) => {
  try {
    res.json({ deleted: BudgetService.deleteRule(parseInt(req.params.id)) });
  } catch (err) {
    console.error('[budget/rules DELETE]', err);
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/budget/rules/apply — kuralları tüm mevcut işlemlere uygula
router.post('/budget/rules/apply', (req, res) => {
  try {
    res.json(BudgetService.applyRulesToAll());
  } catch (err) {
    console.error('[budget/rules apply POST]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── File Upload & Parse ─────────────────────────────────────────

// POST /api/budget/upload — Upload and parse Excel/CSV
// Optional form fields:
//   - person: 'Onur' | 'Şewi'  (explicit owner; overrides parser auto-detect)
//   - bank:   'Haspa' | 'Wise' (explicit bank)
//   - requireFormat: 'csv' | 'xlsx' (enforces expected file type)
router.post('/budget/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Dosya bulunamadı' });
    }

    const fileName = req.file.originalname.toLowerCase();
    const isCSV = fileName.endsWith('.csv');
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

    if (!isCSV && !isExcel) {
      return res.status(400).json({ error: 'Desteklenmeyen dosya formatı. .xlsx, .xls veya .csv yükleyin.' });
    }

    const { person, bank, requireFormat } = req.body || {};

    if (requireFormat === 'csv' && !isCSV) {
      return res.status(400).json({ error: 'Bu tuş yalnızca .csv (Haspa) kabul eder.' });
    }
    if (requireFormat === 'xlsx' && !isExcel) {
      return res.status(400).json({ error: 'Bu tuş yalnızca .xlsx (Wise) kabul eder.' });
    }

    let data;
    if (isCSV) {
      const text = req.file.buffer.toString('utf-8');
      data = ParserService.parseCSVBudget(text);
    } else {
      data = ParserService.parseExcelBudget(req.file.buffer);
    }

    // Explicit person/bank override — form seçimi parser auto-detect'ten üstündür
    if (person || bank) {
      const accountPrefix = bank || '';
      const accountSuffix = person || '';
      const account = [accountPrefix, accountSuffix].filter(Boolean).join('-');
      for (const tx of data.transactions) {
        if (person) tx.person = person;
        if (bank) tx.bank = bank;
        if (account) tx.account = account;
      }
    }

    // Flag rekompozisyonu: savings > internal. Savings'ler parser'da flagleniyor (IBAN).
    let internalCount = 0;
    let savingsCount = 0;
    for (const tx of data.transactions) {
      if (tx.is_savings) {
        tx.is_internal = false;
        tx.category = tx.category || ParserService.SAVINGS_CATEGORY;
        tx.subCategory = tx.subCategory || ParserService.SAVINGS_SUBCATEGORY;
        savingsCount++;
      } else {
        tx.is_internal = ParserService.isInternalTransfer(tx.source, tx.person);
        if (tx.is_internal) internalCount++;
      }
    }

    // Kuralları uygula (kategori/etiket override — yalnızca yeni eklenenlere yansır,
    // mevcut kayıtlar upsert'te korunur; geçmişe uygulamak için /rules/apply kullanılır)
    const activeRules = BudgetService.getAllRules().filter(r => r.enabled);
    if (activeRules.length) {
      for (const tx of data.transactions) BudgetService.applyRulesToTx(tx, activeRules);
    }

    // Auto-save to DB — upsert yalnızca ekler/günceller, asla silmez
    let insertCounts = { inserted: 0, existing: 0, upserted: 0 };
    if (data.transactions.length > 0) {
      insertCounts = BudgetService.upsertTransactions(data.transactions);
    }
    if (data.monthlyBudgets.length > 0) {
      BudgetService.saveMonthlyBudgets(data.monthlyBudgets);
    }
    if (data.wishlist.length > 0) {
      BudgetService.saveWishlist(data.wishlist);
    }
    if (data.installments.length > 0) {
      BudgetService.saveInstallments(data.installments);
    }

    res.json({
      transactions: data.transactions.length,
      inserted: insertCounts.inserted,
      existing: insertCounts.existing,
      internal: internalCount,
      savings: savingsCount,
      monthlyBudgets: data.monthlyBudgets.length,
      wishlist: data.wishlist.length,
      installments: data.installments.length,
      message: `${insertCounts.inserted} yeni işlem eklendi, ${insertCounts.existing} mevcut işlem korundu.`,
    });
  } catch (err) {
    console.error('[budget/upload POST]', err);
    res.status(500).json({ error: 'Dosya işlenirken hata oluştu: ' + String(err.message || err) });
  }
});

// ── Monthly Budgets ─────────────────────────────────────────────

router.get('/budget/monthly', (req, res) => {
  try {
    const budgets = BudgetService.getMonthlyBudgets();
    res.json({ budgets });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Wishlist ────────────────────────────────────────────────────

router.get('/budget/wishlist', (req, res) => {
  try {
    const items = BudgetService.getWishlist();
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Installments ────────────────────────────────────────────────

router.get('/budget/installments', (req, res) => {
  try {
    const items = BudgetService.getInstallments();
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/budget/installments', (req, res) => {
  try {
    const item = BudgetService.createInstallment(req.body || {});
    res.json({ item });
  } catch (err) {
    console.error('[budget/installments POST]', err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

router.put('/budget/installments/:id', (req, res) => {
  try {
    const item = BudgetService.updateInstallment(parseInt(req.params.id), req.body || {});
    if (!item) return res.status(404).json({ error: 'Taksit bulunamadı' });
    res.json({ item });
  } catch (err) {
    console.error('[budget/installments PUT]', err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

router.delete('/budget/installments/:id', (req, res) => {
  try {
    res.json({ deleted: BudgetService.deleteInstallment(parseInt(req.params.id)) });
  } catch (err) {
    console.error('[budget/installments DELETE]', err);
    res.status(500).json({ error: String(err) });
  }
});

// ── Summary (for Telegram & dashboard) ──────────────────────────

router.get('/budget/summary', (req, res) => {
  try {
    const month = req.query.month || BudgetService.getCurrentMonthName();
    const summary = BudgetService.getMonthlySummary(month);
    res.json({ month, ...summary });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

module.exports = router;
