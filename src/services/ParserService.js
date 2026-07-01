/**
 * ParserService — Excel, CSV ve PDF banka ekstre parser'ı
 * Budget-Master'dan taşındı (TypeScript → JavaScript)
 */

const XLSX = require('xlsx');
const Papa = require('papaparse');
const CategoryDeterminationService = require('./CategoryDeterminationService');
const Household = require('../config/household');

// ── Types (JSDoc) ───────────────────────────────────────────────

/**
 * @typedef {{
 *   account: string, month: string, person: string|null, bank: string|null,
 *   date: Date, source: string, type: 'income'|'expense',
 *   amount: number, subCategory: string, category: string, tags?: string[]
 * }} Transaction
 *
 * @typedef {{ month: string, categories: {name:string, projected:number, actual:number}[], totalProjected:number, totalActual:number, income:number, savingsTarget:number, savingsTransfer:number }} MonthlyBudget
 * @typedef {{ checked: boolean, product: string, price: number|null, status: string }} WishlistItem
 * @typedef {{ name:string, total:number, installmentCount:number, paidCount:number, finalDate:Date|null, monthlyAmount:number, remaining:number }} Installment
 * @typedef {{ transactions: Transaction[], monthlyBudgets: MonthlyBudget[], wishlist: WishlistItem[], installments: Installment[] }} BudgetData
 */

// ── Date helpers ────────────────────────────────────────────────

const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

function parseDate(value) {
  if (!value) return null;
  const s = String(value).trim();

  const short = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/);
  if (short) return new Date(+short[3] + 2000, +short[2] - 1, +short[1]);

  const dot = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dot) return new Date(+dot[3], +dot[2] - 1, +dot[1]);

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);

  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return new Date(+slash[3], +slash[2] - 1, +slash[1]);

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function detectMonth(date) {
  return MONTHS_TR[date.getMonth()];
}

function excelDateToDate(serial) {
  const epoch = new Date(1899, 11, 30);
  return new Date(epoch.getTime() + serial * 86400000);
}

// ── Amount helpers ──────────────────────────────────────────────

function parseEURAmount(value) {
  const cleaned = String(value).replace(/[€$TRY EUR\s"]/gi, '').trim();
  if (cleaned.includes(',')) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
  }
  return parseFloat(cleaned);
}

// ── Internal transfer detection (hane içi) ──────────────────────
// Karşı taraf (counterparty) yapılandırılmış hane üyelerinden biriyse, işlem
// hane içi transferdir ve gerçek gelir/giderden sayılmaz. Üyeler ve eşleşme
// kalıpları config/household.json'dan gelir (bkz. src/config/household.js).
// Owner'dan BAĞIMSIZ kontrol edilir; hem kişiler arası hem de aynı kişinin
// kendine transferlerini kapsar. ownerPerson parametresi geriye uyumluluk
// için korunur (kullanılmıyor).
function isInternalTransfer(text, ownerPerson) {
  return Household.isInternalTransfer(text);
}

// ── Savings detection (config'teki IBAN ülke ön ekleri) ─────────
function isIntesaSavings(counterpartyIBAN) {
  return Household.isSavingsIBAN(counterpartyIBAN);
}
const SAVINGS_CATEGORY = 'Gerçekleşen Birikim';
const SAVINGS_SUBCATEGORY = 'BİRİKİM';

// ── Sub-category detection ──────────────────────────────────────

// Source + context'e göre NOT/TÜR (etiket) tespiti.
// Önce cat_determination.csv'deki gerçek eşleşmelere bak, yoksa pattern fallback.
function resolveTag(source, purpose = '', bookingType = '') {
  const determined = CategoryDeterminationService.determineTag(source);
  if (determined) return determined;
  return detectSubCategory(source, purpose, bookingType);
}

function detectSubCategory(source, purpose = '', bookingType = '') {
  const t = `${source} ${purpose} ${bookingType}`.toUpperCase();
  if (t.includes('LOHN') || t.includes('GEHALT') || t.includes('MAAŞ')) return 'MAAŞ';
  if (t.includes('MIETE') || t.includes('KIRA')) return 'KİRA';
  if (t.includes('EDEKA') || t.includes('REWE') || t.includes('ALDI') || t.includes('LIDL') || t.includes('BUDNI') || t.includes('PENNY') || t.includes('NETTO') || t.includes('TJADEN') || t.includes('MARKET')) return 'MARKET ALIŞVERİŞ';
  if (t.includes('LIEFERANDO') || (t.includes('UBER') && t.includes('EATS')) || t.includes('RESTAURANT') || t.includes('CAFE') || t.includes('PIZZA') || t.includes('BURGER')) return 'DIŞARIDA YEMEK';
  if (t.includes('SHELL') || t.includes('ARAL') || t.includes('TANKSTELLE') || t.includes('HVV') || t.includes('BAHN') || t.includes('UBER')) return 'ULAŞIM';
  if (t.includes('NETFLIX') || t.includes('SPOTIFY') || t.includes('DISNEY') || t.includes('APPLE.COM') || t.includes('GOOGLE')) return 'APP/ÜYELİK';
  if (t.includes('URBAN SPORTS') || t.includes('FITNESS') || t.includes('GYM') || t.includes('SPORT')) return 'SPOR';
  if (t.includes('TELEKOM') || t.includes('VODAFONE') || t.includes('O2') || t.includes('INTERNET') || t.includes('FESTNETZ')) return 'FATURA';
  if (t.includes('VERSICHERUNG') || t.includes('ARAG') || t.includes('SIGORTA')) return 'Sigorta';
  if (t.includes('BARGELD') || t.includes('CASH') || t.includes('GA NR')) return 'CASH WITHDRAWAL';
  if (t.includes('APOTHEKE') || t.includes('ARZT') || t.includes('KLINIK') || t.includes('PHARMACY')) return 'SAĞLIK';
  if (t.includes('ZARA') || t.includes('H&M') || t.includes('HM.COM') || t.includes('THALIA') || t.includes('FASHION') || t.includes('KIYAFET')) return 'KİŞİSEL/KIYAFET ALIŞVERİŞ/EV EŞYASI';
  if (t.includes('ENTGELT') || t.includes('GEBUEHR')) return 'VERGİ/FAİZ/CEZA';
  if (t.includes('AMAZON')) return 'DİĞER';
  return 'DİĞER';
}

// ── Sub-category → Category mapping ─────────────────────────────
// cat_determination.csv lookup üzerinden: source + NOT/TÜR → KATEGORİ
// (eski hardcoded mapping CategoryDeterminationService'e taşındı)
function detectCategory(subCategory, type, source, isSavings) {
  return CategoryDeterminationService.determineCategory(source, subCategory, type, isSavings);
}

// ── Account parser ──────────────────────────────────────────────

function parseAccount(raw) {
  const str = String(raw).trim();
  let month = '', rest = str;

  for (const m of MONTHS_TR) {
    if (str.startsWith(m)) {
      month = m;
      rest = str.slice(m.length).replace(/^[\s-]+/, '');
      break;
    }
  }
  if (!month) { month = str; rest = ''; }

  let person = null, bank = null;
  const parts = rest.split(/[\s-]+/).filter(Boolean);
  const bankNames = Household.config.banks;
  const personNames = Household.config.memberAliases;

  for (const part of parts) {
    if (bankNames.some(b => part.toLowerCase() === b.toLowerCase())) bank = part;
    else if (personNames.some(p => part.toLowerCase() === p.toLowerCase())) person = part;
  }

  if (!person && !bank && rest) {
    if (personNames.some(p => rest.toLowerCase().includes(p.toLowerCase()))) person = rest;
  }

  return { month, person, bank };
}

// ── Bank detector ───────────────────────────────────────────────

const BANK_PATTERNS = {
  'Garanti BBVA': [/garanti/i, /bonus/i, /bbva/i],
  'Yapı Kredi': [/yap[ıi]\s*kredi/i, /world/i],
  'İş Bankası': [/i[sş]\s*bankas[ıi]/i, /maximum/i],
  'Akbank': [/akbank/i, /axess/i],
  'QNB Finansbank': [/finansbank/i, /qnb/i, /cardfinans/i],
  'Ziraat Bankası': [/ziraat/i, /bankkart/i],
  'Halkbank': [/halkbank/i, /paraf/i],
  'Vakıfbank': [/vak[ıi]fbank/i, /world/i],
  'Denizbank': [/denizbank/i, /bonus/i],
  'TEB': [/teb/i, /bnp\s*paribas/i],
  'ING': [/ing\s/i, /ing\b/i],
  'HSBC': [/hsbc/i],
  'Enpara': [/enpara/i],
};

function detectBank(text) {
  for (const [bank, patterns] of Object.entries(BANK_PATTERNS)) {
    if (patterns.some(p => p.test(text))) return bank;
  }
  return null;
}

// ── PayPal gerçek satıcı çıkarımı ───────────────────────────────
// Haspa ekstresinde PayPal ödemelerinde Beguenstigter alanı hep
// "PayPal Europe S.a.r.l. ..." gelir; bu yüzden tüm PayPal harcamaları
// tek satıcıda toplanır. Gerçek satıcı Verwendungszweck (purpose) alanında
// "Ihr Einkauf bei <satıcı>" olarak yer alır.
//   Ör: "1049312506997/PP.5628.PP/. Urban Sports GmbH, Ihr Einkauf bei Urban Sports GmbH"
//        → "Urban Sports GmbH"
// Satıcı PayPal'ın kendisiyse (doğrudan PayPal işlemi) yine PayPal döner — istenen budur.
function extractPayPalMerchant(purpose) {
  const m = /ihr einkauf bei\s+(.+?)\s*$/i.exec(String(purpose || ''));
  return m ? m[1].trim() : '';
}

// ── CSV Parsers ─────────────────────────────────────────────────

function parseHaspaCSV(rows) {
  const transactions = [];
  for (const row of rows) {
    const dateRaw = row['Buchungstag'] || '';
    const bookingType = row['Buchungstext'] || '';
    const purpose = row['Verwendungszweck'] || '';
    const beneficiary = row['Beguenstigter/Zahlungspflichtiger'] || '';
    const counterpartyIBAN = row['Kontonummer/IBAN'] || '';
    const amountRaw = row['Betrag'] || '';
    if (!amountRaw || !dateRaw) continue;

    const amount = parseEURAmount(amountRaw);
    if (isNaN(amount)) continue;

    const date = parseDate(dateRaw);
    if (!date) continue;

    let source = beneficiary.trim();
    if (!source) source = purpose.trim().slice(0, 80);
    if (!source) source = bookingType;
    // PayPal: gerçek satıcıyı purpose'tan çıkar ("Ihr Einkauf bei <satıcı>")
    const ppMerchant = extractPayPalMerchant(purpose);
    if (ppMerchant) source = ppMerchant;

    const is_savings = isIntesaSavings(counterpartyIBAN);
    const type = amount >= 0 ? 'income' : 'expense';
    const subCategory = is_savings ? SAVINGS_SUBCATEGORY : resolveTag(source, purpose, bookingType);
    transactions.push({
      account: 'Haspa', month: detectMonth(date), person: null, bank: 'Haspa',
      date, source, type, amount,
      subCategory,
      category: detectCategory(subCategory, type, source, is_savings),
      is_savings,
    });
  }
  return transactions;
}

function parseBudgetFormatCSV(rows) {
  const transactions = [];
  for (const row of rows) {
    const account = row['HESAP'] || '';
    const dateRaw = row['TARİH'] || '';
    const source = row['KAYNAK'] || '';
    const typeRaw = row['GELİR/GİDER'] || '';
    const amountRaw = row['MİKTAR'] || '';
    const subCategory = row['NOT/TÜR'] || '';
    const category = row['KATEGORİ'] || '';
    if (!amountRaw) continue;

    const amount = parseEURAmount(amountRaw);
    if (isNaN(amount)) continue;

    const date = parseDate(dateRaw);
    if (!date) continue;

    const type = typeRaw.toLowerCase().includes('gelir') ? 'income' : 'expense';
    let person = null, bank = null;
    const al = account.toLowerCase();
    // Resolve any alias to the canonical member name, and the bank by name.
    for (const m of Household.config.members) {
      const names = [m.name, ...(m.aliases || [])];
      if (names.some(n => n && al.includes(n.toLowerCase()))) { person = m.name; break; }
    }
    for (const b of Household.config.banks) {
      if (al.includes(b.toLowerCase())) { bank = b; break; }
    }

    transactions.push({
      account, month: detectMonth(date), person, bank,
      date, source, type, amount, subCategory, category,
    });
  }
  return transactions;
}

function parseGenericCSV(rows) {
  const transactions = [];
  const headers = Object.keys(rows[0] || {});
  for (const row of rows) {
    const dateRaw = row['Tarih'] || row['İşlem Tarihi'] || row['Date'] || row[headers[0]] || '';
    const source = row['Açıklama'] || row['İşlem Açıklaması'] || row['Description'] || row[headers[1]] || '';
    const amountRaw = row['Tutar'] || row['İşlem Tutarı'] || row['Amount'] || row[headers[2]] || '';
    if (!amountRaw || !dateRaw) continue;

    const amount = parseEURAmount(amountRaw);
    if (isNaN(amount)) continue;

    const date = parseDate(dateRaw);
    if (!date) continue;

    const type = amount >= 0 ? 'income' : 'expense';
    const subCategory = resolveTag(source, '', '');
    transactions.push({
      account: '', month: detectMonth(date), person: null, bank: null,
      date, source: source.trim(), type, amount,
      subCategory, category: detectCategory(subCategory, type, source, false),
    });
  }
  return transactions;
}

/** @returns {BudgetData} */
function parseCSVBudget(content) {
  const firstLine = content.split('\n')[0] || '';
  const delimiter = firstLine.includes(';') ? ';' : ',';

  const result = Papa.parse(content, { header: true, skipEmptyLines: true, delimiter });
  const headers = result.meta.fields || [];

  let transactions;
  if (headers.some(h => h === 'Auftragskonto' || h === 'Buchungstag' || h === 'Betrag')) {
    transactions = parseHaspaCSV(result.data);
  } else if (headers.some(h => h === 'HESAP' || h === 'GELİR/GİDER' || h === 'KATEGORİ')) {
    transactions = parseBudgetFormatCSV(result.data);
  } else {
    transactions = parseGenericCSV(result.data);
  }

  transactions.sort((a, b) => b.date.getTime() - a.date.getTime());
  return { transactions, monthlyBudgets: [], wishlist: [], installments: [] };
}

// ── Excel Parsers ───────────────────────────────────────────────

function parseTransactionsSheet(ws) {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const transactions = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0] || !row[4]) continue;

    const accountRaw = String(row[0]);
    const { month, person, bank } = parseAccount(accountRaw);

    let date;
    if (typeof row[1] === 'number') date = excelDateToDate(row[1]);
    else date = new Date(row[1]);
    if (isNaN(date.getTime())) continue;

    const typeRaw = String(row[3] || '');
    const type = typeRaw.includes('Gelir') ? 'income' : 'expense';
    const amount = typeof row[4] === 'number' ? row[4] : parseFloat(String(row[4]));
    if (isNaN(amount)) continue;

    transactions.push({
      account: accountRaw, month, person, bank, date,
      source: String(row[2] || ''), type, amount,
      subCategory: String(row[5] || ''), category: String(row[6] || ''),
    });
  }
  return transactions;
}

function parseBudgetSheet(ws) {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const budgets = [];
  const MONTHS_UPPER = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK'];

  let i = 0;
  while (i < data.length) {
    const row = data[i];
    const firstCell = String(row[0] || '').toUpperCase().trim();

    if (MONTHS_UPPER.includes(firstCell)) {
      const summaryRow = data[i + 1] || [];
      const totalProjected = typeof summaryRow[2] === 'number' ? summaryRow[2] : 0;
      const savingsTarget = typeof summaryRow[3] === 'number' ? summaryRow[3] : 0;
      const totalActual = typeof summaryRow[4] === 'number' ? summaryRow[4] : 0;
      const income = typeof summaryRow[5] === 'number' ? summaryRow[5] : 0;
      const savingsTransfer = typeof summaryRow[6] === 'number' ? summaryRow[6] : 0;

      const categories = [];
      let j = i + 2;
      while (j < data.length) {
        const catRow = data[j];
        const catFirst = String(catRow[0] || '').toUpperCase().trim();
        if (MONTHS_UPPER.includes(catFirst)) break;

        const catName = String(catRow[1] || '').trim();
        if (catName && catName !== 'BES') {
          const projected = typeof catRow[2] === 'number' ? catRow[2] : 0;
          const actual = typeof catRow[4] === 'number' ? catRow[4] : 0;
          if (projected !== 0 || actual !== 0) categories.push({ name: catName, projected, actual });
        }
        j++;
      }

      budgets.push({ month: firstCell, categories, totalProjected, totalActual, income, savingsTarget, savingsTransfer });
      i = j;
    } else {
      i++;
    }
  }
  return budgets;
}

function parseWishlist(ws) {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const items = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const product = String(row[1] || '').trim();
    if (!product) continue;
    items.push({
      checked: row[0] === true,
      product,
      price: typeof row[2] === 'number' ? row[2] : null,
      status: String(row[3] || ''),
    });
  }
  return items;
}

function parseInstallments(ws) {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const installments = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const name = String(row[0] || '').trim();
    if (!name || name === 'Ev Sabit Gideri' || name === 'Toplam Kalan') continue;
    const total = typeof row[1] === 'number' ? row[1] : 0;
    if (total === 0) continue;
    installments.push({
      name, total,
      installmentCount: typeof row[2] === 'number' ? row[2] : 0,
      paidCount: typeof row[3] === 'number' ? row[3] : 0,
      finalDate: typeof row[4] === 'number' ? excelDateToDate(row[4]) : null,
      monthlyAmount: typeof row[5] === 'number' ? row[5] : 0,
      remaining: typeof row[6] === 'number' ? row[6] : 0,
    });
  }
  return installments;
}

function parseHaspaExcelSheet(ws) {
  const imp = Household.getImporter('haspaExcel', 'Haspa');
  const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const csvLines = rawRows.map(row => row.filter(c => c !== '').join(','));
  const csvText = csvLines.join('\n');

  const result = Papa.parse(csvText, { header: true, skipEmptyLines: true, delimiter: ';' });
  const transactions = [];

  for (const row of result.data) {
    const dateRaw = row['Buchungstag'] || '';
    const bookingType = row['Buchungstext'] || '';
    const purpose = row['Verwendungszweck'] || '';
    const beneficiary = row['Beguenstigter/Zahlungspflichtiger'] || '';
    const counterpartyIBAN = row['Kontonummer/IBAN'] || '';
    const amountRaw = row['Betrag'] || '';
    if (!amountRaw || !dateRaw) continue;

    const amount = parseEURAmount(amountRaw);
    if (isNaN(amount)) continue;

    const date = parseDate(dateRaw);
    if (!date) continue;

    let source = beneficiary.trim();
    if (!source) source = purpose.trim().slice(0, 80);
    if (!source) source = bookingType;
    // PayPal: gerçek satıcıyı purpose'tan çıkar ("Ihr Einkauf bei <satıcı>")
    const ppMerchant = extractPayPalMerchant(purpose);
    if (ppMerchant) source = ppMerchant;

    const is_savings = isIntesaSavings(counterpartyIBAN);
    const type = amount >= 0 ? 'income' : 'expense';
    const subCategory = is_savings ? SAVINGS_SUBCATEGORY : resolveTag(source, purpose, bookingType);
    transactions.push({
      account: imp.account || 'Haspa', month: detectMonth(date), person: imp.person, bank: imp.bank || 'Haspa',
      date, source, type, amount,
      subCategory,
      category: detectCategory(subCategory, type, source, is_savings),
      is_savings,
    });
  }
  return transactions;
}

function parseWiseExcelSheet(ws) {
  const imp = Household.getImporter('wiseExcel', 'Wise');
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const transactions = [];
  const epoch = new Date(1899, 11, 30);

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!String(row[0] || '')) continue;
    if (typeof row[1] !== 'number') continue;

    const date = new Date(epoch.getTime() + row[1] * 86400000);
    if (isNaN(date.getTime())) continue;

    const amount = typeof row[3] === 'number' ? row[3] : parseFloat(String(row[3]));
    if (isNaN(amount)) continue;

    const description = String(row[5] || '');
    const merchant = String(row[15] || '').trim();
    const payeeName = String(row[13] || '').trim();
    const payerName = String(row[12] || '').trim();
    const payeeIBAN = String(row[14] || '');
    const transactionType = String(row[21] || '').toUpperCase();
    const source = merchant || payeeName || payerName || description.slice(0, 80);

    const is_savings = isIntesaSavings(payeeIBAN);
    const type = transactionType === 'CREDIT' ? 'income' : 'expense';
    const subCategory = is_savings ? SAVINGS_SUBCATEGORY : resolveTag(source, description);
    transactions.push({
      account: imp.account || 'Wise', month: detectMonth(date), person: imp.person, bank: imp.bank || 'Wise',
      date, source, type, amount,
      subCategory,
      category: detectCategory(subCategory, type, source, is_savings),
      is_savings,
    });
  }
  return transactions;
}

/** @returns {BudgetData} */
function parseExcelBudget(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });

  // Wise export
  if (wb.Sheets['All transactions']) {
    const transactions = parseWiseExcelSheet(wb.Sheets['All transactions']);
    transactions.sort((a, b) => b.date.getTime() - a.date.getTime());
    return { transactions, monthlyBudgets: [], wishlist: [], installments: [] };
  }

  // Haspa export
  const haspaSheetName = wb.SheetNames.find(n => n.toLowerCase().includes('umsatz'));
  if (haspaSheetName) {
    const transactions = parseHaspaExcelSheet(wb.Sheets[haspaSheetName]);
    transactions.sort((a, b) => b.date.getTime() - a.date.getTime());
    return { transactions, monthlyBudgets: [], wishlist: [], installments: [] };
  }

  // Standard budget file
  let transactions = [];
  let monthlyBudgets = [];
  let wishlist = [];
  let installments = [];

  const gerceklesen = wb.Sheets['Gerçekleşen'];
  if (gerceklesen) transactions = parseTransactionsSheet(gerceklesen);

  const hesaplama = wb.Sheets['Hesaplama'];
  if (hesaplama) {
    const extraTx = parseTransactionsSheet(hesaplama);
    const existing = new Set(transactions.map(t => `${t.date.toISOString()}|${t.source}|${t.amount}`));
    for (const tx of extraTx) {
      const key = `${tx.date.toISOString()}|${tx.source}|${tx.amount}`;
      if (!existing.has(key)) { transactions.push(tx); existing.add(key); }
    }
  }

  const ongorulen = wb.Sheets['Öngörülen'];
  if (ongorulen) monthlyBudgets = parseBudgetSheet(ongorulen);

  const wishlistSheet = wb.Sheets['Almak İstediğimiz Şeyler'];
  if (wishlistSheet) wishlist = parseWishlist(wishlistSheet);

  const taksitlerSheet = wb.Sheets['Taksitler'];
  if (taksitlerSheet) installments = parseInstallments(taksitlerSheet);

  transactions.sort((a, b) => b.date.getTime() - a.date.getTime());
  return { transactions, monthlyBudgets, wishlist, installments };
}

module.exports = {
  parseCSVBudget,
  parseExcelBudget,
  detectBank,
  parseDate,
  detectMonth,
  detectSubCategory,
  detectCategory,
  isInternalTransfer,
  isIntesaSavings,
  extractPayPalMerchant,
  invalidateDetermination: CategoryDeterminationService.invalidate,
  SAVINGS_CATEGORY,
  SAVINGS_SUBCATEGORY,
};
