/**
 * ForecastService — Bütçe tahmin ve öğrenen analiz katmanı
 *
 * Yaklaşım: İstatistiksel temel (EWMA + trend + recurring detection).
 * Açıklanabilir, debug edilebilir, ekstra dependency yok.
 *
 * Katmanlar:
 *  1. Recurring detector  — sabit/abonelik harcamaları tanır
 *  2. Forecaster          — EWMA + lineer trend ile next month tahmini
 *  3. Anomaly detector    — z-score ile alışılmadık işlemler
 *  4. Insight generator   — sayılardan anlamlı sinyal üretir
 *  5. Saving suggester    — tahminlere göre birikim hedefi önerir
 */

const { getDb } = require('../database/init');
const LearningService = require('./LearningService');

const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
                   'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

const EN_TO_TR = {
  '01': 'Ocak', '02': 'Şubat', '03': 'Mart', '04': 'Nisan',
  '05': 'Mayıs', '06': 'Haziran', '07': 'Temmuz', '08': 'Ağustos',
  '09': 'Eylül', '10': 'Ekim', '11': 'Kasım', '12': 'Aralık',
};

const TR_TO_NUM = Object.fromEntries(
  Object.entries(EN_TO_TR).map(([num, name]) => [name, parseInt(num, 10)])
);

// ── Helpers ─────────────────────────────────────────────────────────

function dateToMonthKey(dateStr) {
  // "2026-03-15" → "2026-03"
  return dateStr.slice(0, 7);
}

function monthKeyToTrName(monthKey) {
  // "2026-03" → "Mart"
  const [, mm] = monthKey.split('-');
  return EN_TO_TR[mm] || monthKey;
}

function monthKeyToLabel(monthKey) {
  // "2026-03" → "Mart 2026"
  const [yyyy, mm] = monthKey.split('-');
  return `${EN_TO_TR[mm]} ${yyyy}`;
}

function nextMonthKey(monthKey) {
  const [yyyy, mm] = monthKey.split('-').map(Number);
  if (mm === 12) return `${yyyy + 1}-01`;
  return `${yyyy}-${String(mm + 1).padStart(2, '0')}`;
}

function mean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

function stdDev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Exponentially Weighted Moving Average — son aylara daha çok ağırlık ver.
 * @param {number[]} values - kronolojik sırada (eski → yeni)
 * @param {number} alpha - 0-1 arası, yüksek alpha = son aylar daha baskın
 */
function ewma(values, alpha = 0.4) {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];
  let s = values[0];
  for (let i = 1; i < values.length; i++) {
    s = alpha * values[i] + (1 - alpha) * s;
  }
  return s;
}

/**
 * Basit lineer regresyon ile trend hesapla.
 * Returns { slope, intercept } — y = slope * x + intercept
 */
function linearTrend(values) {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] || 0 };
  const xs = values.map((_, i) => i);
  const xMean = mean(xs);
  const yMean = mean(values);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (values[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  return { slope, intercept };
}

// ── Data Loading ────────────────────────────────────────────────────

function loadTransactions(opts = {}) {
  const db = getDb();
  let sql = 'SELECT date, source, amount, type, category, sub_category, person, is_internal, is_savings FROM budget_transactions WHERE 1=1';
  const params = [];
  if (opts.excludeInternal !== false) sql += ' AND is_internal = 0';
  if (opts.excludeSavings !== false) sql += ' AND is_savings = 0';
  sql += ' ORDER BY date ASC';
  return db.prepare(sql).all(...params);
}

/**
 * Kronolojik sıralı month keys döndür.
 * Eksik aylar dahil edilmez (data yoksa atlar).
 */
function getMonthsInData() {
  const db = getDb();
  const rows = db.prepare(
    "SELECT DISTINCT substr(date, 1, 7) as mk FROM budget_transactions ORDER BY mk ASC"
  ).all();
  return rows.map(r => r.mk).filter(Boolean);
}

// ── Maaş dönemi (pay period) tespiti — frontend periods.ts ile aynı mantık ──
// Maaş anahtar kelimeleri config/household.json'dan gelir (işveren adları + genel terimler).
const Household = require('../config/household');

function isSalaryTx(t) {
  if (t.type !== 'income') return false;
  const text = `${t.source || ''} ${t.sub_category || ''}`.toUpperCase();
  return Household.config.salaryKeywords.some(k => text.includes(k.toUpperCase()));
}

// Maaş tarihlerinden dönem döngülerini çıkar (7 gün içindeki maaşlar = aynı döngü).
function detectPayPeriods(transactions) {
  const salaryDates = transactions.filter(isSalaryTx)
    .map(t => new Date(t.date))
    .filter(d => !isNaN(d.getTime()))
    .sort((a, b) => a - b);
  if (salaryDates.length === 0) return [];
  const cycleStarts = [];
  let last = null;
  for (const d of salaryDates) {
    if (!last || d - last > 7 * 86400000) cycleStarts.push(d);
    last = d;
  }
  const today = new Date();
  const periods = [];
  for (let i = 0; i < cycleStarts.length; i++) {
    const startDate = cycleStarts[i];
    const isActive = i === cycleStarts.length - 1;
    const endDate = isActive ? today : new Date(cycleStarts[i + 1].getTime() - 86400000);
    periods.push({ index: i + 1, shortLabel: `Dönem ${i + 1}`, startDate, endDate, isActive });
  }
  return periods;
}

function periodPosForDate(dateStr, seriesPeriods) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return -1;
  for (let i = seriesPeriods.length - 1; i >= 0; i--) {
    const s = new Date(seriesPeriods[i].startDate); s.setHours(0, 0, 0, 0);
    const e = new Date(seriesPeriods[i].endDate); e.setHours(23, 59, 59, 999);
    if (d >= s && d <= e) return i;
  }
  return -1;
}

// İşlemleri dönemlere göre kovala — predicate'e uyanları value() ile topla.
function bucketByPeriod(transactions, seriesPeriods, predicate, value) {
  const arr = new Array(seriesPeriods.length).fill(0);
  for (const t of transactions) {
    if (!predicate(t)) continue;
    const pos = periodPosForDate(t.date, seriesPeriods);
    if (pos >= 0) arr[pos] += value(t);
  }
  return arr;
}

// Tahmin serisi için dönemler: TAMAMLANMIŞ dönemler (aktif/yarım dönem hariç —
// yarım dönemin toplamı düşük olur, tahmini yanıltır). Hiç tamamlanmış yoksa eldekini kullan.
function getSeriesPeriods(transactions) {
  const periods = detectPayPeriods(transactions);
  if (periods.length === 0) return { periods, seriesPeriods: [] };
  const completed = periods.filter(p => !p.isActive);
  return { periods, seriesPeriods: completed.length >= 1 ? completed : periods };
}

// ── Layer 1: Recurring Detection ────────────────────────────────────

/**
 * Recurring = en az 3 aydan, aylık benzer tutarda gelen işlem.
 * Örn: kira, internet, telefon, Netflix vs.
 *
 * Algoritma:
 *  - Source string'lerini normalize et (PAYPAL 1234567 → PAYPAL)
 *  - Aynı normalized source + benzer tutar (±%15) gruplarını bul
 *  - 3+ ay görünen ve coefficient of variation < 0.3 olanları recurring say
 */
function normalizeSource(source) {
  if (!source) return '';
  return source
    .toUpperCase()
    .replace(/\d{4,}/g, '')           // uzun sayıları sil (referans no'lar)
    .replace(/[.,;:\-_/\\]/g, ' ')    // noktalama
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30);
}

function detectRecurring(transactions) {
  // User overrides
  const { whitelist, blacklist } = LearningService.getRecurringOverrides();

  // Group by normalized source
  const groups = new Map();
  for (const t of transactions) {
    if (t.type !== 'expense') continue;
    const key = normalizeSource(t.source);
    if (!key || key.length < 3) continue;
    const monthKey = dateToMonthKey(t.date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ month: monthKey, amount: Math.abs(t.amount), date: t.date, source: t.source, category: t.category });
  }

  const recurring = [];
  for (const [key, items] of groups.entries()) {
    // User override: blacklisted → asla recurring sayma
    if (blacklist.has(key)) continue;

    // Aynı ay içinde birden fazla varsa topla (tek "instance" say)
    const byMonth = new Map();
    for (const item of items) {
      if (!byMonth.has(item.month)) byMonth.set(item.month, { total: 0, count: 0, sources: [], date: item.date, category: item.category });
      const m = byMonth.get(item.month);
      m.total += item.amount;
      m.count++;
      m.sources.push(item.source);
    }

    const monthlyAmounts = Array.from(byMonth.values()).map(m => m.total);
    const months = Array.from(byMonth.keys()).sort();

    const isWhitelisted = whitelist.has(key);

    // Recurring kriterleri (whitelisted ise gevşet):
    if (!isWhitelisted) {
      if (months.length < 3) continue;
    } else {
      if (months.length < 1) continue;  // whitelisted bile olsa hiç görünmüyorsa skip
    }

    const m = mean(monthlyAmounts);
    if (m < 5) continue;
    const sd = stdDev(monthlyAmounts);
    const cv = m > 0 ? sd / m : 0;

    let consistency;
    if (isWhitelisted) {
      consistency = 'user-confirmed';
    } else if (cv < 0.15) consistency = 'high';
    else if (cv < 0.35) consistency = 'medium';
    else continue;

    const lastSeen = months[months.length - 1];
    const sample = items[0];

    recurring.push({
      key,
      sampleSource: sample.source,
      category: sample.category || '—',
      monthsActive: months.length,
      avgAmount: Math.round(m * 100) / 100,
      stdDev: Math.round(sd * 100) / 100,
      consistency,
      lastSeen,
      months,
      userOverride: isWhitelisted ? 'whitelist' : null,
    });
  }

  recurring.sort((a, b) => b.avgAmount - a.avgAmount);
  return recurring;
}

// ── Layer 2: Forecasting ────────────────────────────────────────────

/**
 * Bir kategori için aylık toplam gider serisini çıkar.
 */
function getCategorySeries(transactions, category) {
  const byMonth = new Map();
  for (const t of transactions) {
    if (t.type !== 'expense') continue;
    if (t.category !== category) continue;
    const mk = dateToMonthKey(t.date);
    byMonth.set(mk, (byMonth.get(mk) || 0) + Math.abs(t.amount));
  }
  const months = Array.from(byMonth.keys()).sort();
  return {
    months,
    values: months.map(m => byMonth.get(m)),
  };
}

/**
 * Gelir için aylık seri.
 */
function getIncomeSeries(transactions) {
  const byMonth = new Map();
  for (const t of transactions) {
    if (t.type !== 'income') continue;
    const mk = dateToMonthKey(t.date);
    byMonth.set(mk, (byMonth.get(mk) || 0) + t.amount);
  }
  const months = Array.from(byMonth.keys()).sort();
  return { months, values: months.map(m => byMonth.get(m)) };
}

/**
 * Bir aylık seri için next-month tahmini üret.
 * EWMA + trend + confidence interval.
 */
function forecastSeries(values, alpha = 0.4) {
  if (values.length === 0) {
    return { forecast: 0, low: 0, high: 0, confidence: 'none', method: 'no-data', samples: 0, stdDev: 0 };
  }
  if (values.length === 1) {
    return { forecast: values[0], low: values[0] * 0.7, high: values[0] * 1.3, confidence: 'low', method: 'single-point', samples: 1, stdDev: 0 };
  }

  const ewmaValue = ewma(values, alpha);
  const { slope, intercept } = linearTrend(values);
  const trendForecast = slope * values.length + intercept;

  // Hibrit: EWMA + hafif trend etkisi
  // Çok az veri varsa EWMA'ya güvenelim, daha fazla varsa trendi de katalım
  const trendWeight = Math.min(0.4, values.length / 12);  // max %40 trend etkisi
  const forecast = (1 - trendWeight) * ewmaValue + trendWeight * trendForecast;

  // Confidence interval: std dev bazlı
  const sd = stdDev(values);
  const low = Math.max(0, forecast - sd);
  const high = forecast + sd;

  // Confidence level
  let confidence;
  const cv = sd / (mean(values) || 1);
  if (values.length >= 4 && cv < 0.25) confidence = 'high';
  else if (values.length >= 3 && cv < 0.5) confidence = 'medium';
  else confidence = 'low';

  return {
    forecast: Math.max(0, Math.round(forecast * 100) / 100),
    low: Math.round(low * 100) / 100,
    high: Math.round(high * 100) / 100,
    confidence,
    method: values.length >= 3 ? 'ewma+trend' : 'ewma',
    samples: values.length,
    stdDev: Math.round(sd * 100) / 100,
  };
}

/**
 * Tüm kategoriler için next month forecast döndür.
 */
function forecastAllCategories() {
  const transactions = loadTransactions();
  const { periods, seriesPeriods } = getSeriesPeriods(transactions);
  if (seriesPeriods.length === 0) return { forecasts: [], targetMonth: null, error: 'no-data' };

  // Hedef = içinde bulunulan (aktif) dönem; tamamlanmış dönem geçmişiyle tahmin edilir.
  const activePeriod = periods.find(p => p.isActive);
  const targetLabel = activePeriod ? activePeriod.shortLabel : 'Önümüzdeki dönem';

  const cats = new Set();
  for (const t of transactions) {
    if (t.type === 'expense' && t.category) cats.add(t.category);
  }

  const forecasts = [];
  for (const cat of cats) {
    const values = bucketByPeriod(transactions, seriesPeriods,
      t => t.type === 'expense' && t.category === cat, t => Math.abs(t.amount));
    if (values.every(v => v === 0)) continue;
    const fc = forecastSeries(values);
    forecasts.push({
      category: cat,
      ...fc,
      history: seriesPeriods.map((p, i) => ({ month: p.shortLabel, label: p.shortLabel, amount: values[i] })),
      lastMonthAmount: values[values.length - 1] || 0,
    });
  }

  forecasts.sort((a, b) => b.forecast - a.forecast);

  return {
    targetMonth: targetLabel,
    targetMonthLabel: targetLabel,
    historicalMonths: seriesPeriods.length,
    forecasts,
  };
}

// ── Layer 3: Anomaly Detection ──────────────────────────────────────

/**
 * Z-score bazlı anomali tespiti.
 * Bir kategoride normal harcama ortalamasından 2+ std dev sapan işlemler.
 */
function detectAnomalies(opts = {}) {
  const minZScore = opts.minZScore || 2.0;
  const transactions = loadTransactions();

  // Kullanıcının "normal" işaretlediği source'lar — bunları atla (öğrenme!)
  const whitelisted = LearningService.getWhitelistedSources();

  // Kategori başına tüm bireysel işlem tutarlarını topla
  const byCategory = new Map();
  for (const t of transactions) {
    if (t.type !== 'expense') continue;
    if (!t.category) continue;
    const amt = Math.abs(t.amount);
    if (!byCategory.has(t.category)) byCategory.set(t.category, []);
    byCategory.get(t.category).push({ ...t, amount: amt });
  }

  const anomalies = [];
  for (const [cat, items] of byCategory.entries()) {
    if (items.length < 5) continue;  // En az 5 örnek olmalı (anlamlı dağılım için)
    const amounts = items.map(i => i.amount);
    const m = mean(amounts);
    const sd = stdDev(amounts);
    if (sd === 0) continue;

    for (const item of items) {
      const z = (item.amount - m) / sd;
      if (z >= minZScore) {
        // User feedback: bu source "normal" işaretlendiyse atla
        if (whitelisted.has(item.source)) continue;

        anomalies.push({
          date: item.date,
          source: item.source,
          amount: item.amount,
          category: cat,
          zScore: Math.round(z * 100) / 100,
          categoryMean: Math.round(m * 100) / 100,
          deviation: Math.round((item.amount - m) * 100) / 100,
          severity: z >= 3 ? 'high' : 'medium',
        });
      }
    }
  }

  anomalies.sort((a, b) => b.zScore - a.zScore);
  return anomalies.slice(0, 20);  // En aykırı 20 işlem
}

// ── Layer 4: Insights & Trends ──────────────────────────────────────

/**
 * Aylık kategori karşılaştırması — son ay vs önceki ortalama.
 */
function getCategoryTrends() {
  const transactions = loadTransactions();
  const { seriesPeriods } = getSeriesPeriods(transactions);
  if (seriesPeriods.length < 2) return [];

  const lastLabel = seriesPeriods[seriesPeriods.length - 1].shortLabel;

  const cats = new Set();
  for (const t of transactions) {
    if (t.type === 'expense' && t.category) cats.add(t.category);
  }

  const trends = [];
  for (const cat of cats) {
    const values = bucketByPeriod(transactions, seriesPeriods,
      t => t.type === 'expense' && t.category === cat, t => Math.abs(t.amount));
    const lastValue = values[values.length - 1];
    const previousValues = values.slice(0, -1);
    if (previousValues.length === 0) continue;

    const prevAvg = mean(previousValues);
    if (prevAvg === 0 && lastValue === 0) continue;

    const changePct = prevAvg > 0 ? ((lastValue - prevAvg) / prevAvg) * 100 : (lastValue > 0 ? 100 : 0);
    const absChange = lastValue - prevAvg;

    trends.push({
      category: cat,
      lastMonth: lastLabel,
      lastMonthLabel: lastLabel,
      lastValue: Math.round(lastValue * 100) / 100,
      prevAvg: Math.round(prevAvg * 100) / 100,
      changePct: Math.round(changePct * 10) / 10,
      absChange: Math.round(absChange * 100) / 100,
      direction: changePct > 5 ? 'up' : changePct < -5 ? 'down' : 'flat',
    });
  }

  trends.sort((a, b) => Math.abs(b.absChange) - Math.abs(a.absChange));
  return trends;
}

// ── Layer 5: Saving Suggestion ──────────────────────────────────────

/**
 * Tahmini gelir + tahmini gider → önerilen birikim hedefi.
 *
 * Yaklaşım:
 *  - Beklenen net = forecast(income) - forecast(total expense)
 *  - Tarihsel birikim oranı varsa onu hesaba kat
 *  - Conservative (kolay), realistic (orta), ambitious (zor) 3 senaryo
 */
function suggestSavings() {
  const transactions = loadTransactions();
  const { seriesPeriods } = getSeriesPeriods(transactions);

  // Dönem bazlı gelir tahmini
  const incomeValues = bucketByPeriod(transactions, seriesPeriods, t => t.type === 'income', t => t.amount);
  const incomeForecast = forecastSeries(incomeValues);

  // Dönem bazlı toplam gider tahmini
  const expenseValues = bucketByPeriod(transactions, seriesPeriods, t => t.type === 'expense', t => Math.abs(t.amount));
  const expenseForecast = forecastSeries(expenseValues);

  // Tarihsel birikim — dönem bazlı net (Intesa is_savings)
  const db = getDb();
  const savingsRows = db.prepare("SELECT date, type, amount FROM budget_transactions WHERE is_savings = 1").all();
  const savingsByPeriod = bucketByPeriod(savingsRows, seriesPeriods, () => true,
    t => (t.type === 'expense' ? Math.abs(t.amount) : -Math.abs(t.amount)));
  const histSavingsValues = savingsByPeriod.filter(v => v > 0);  // sadece pozitif birikim dönemleri
  const avgHistoricalSavings = histSavingsValues.length > 0 ? mean(histSavingsValues) : 0;

  const rawNet = incomeForecast.forecast - expenseForecast.forecast;
  const expectedNet = Math.max(0, rawNet);
  const isDeficit = rawNet < 0;

  // 3 senaryo
  let conservative, realistic, ambitious;
  let warning = null;

  if (isDeficit) {
    // Açık var — birikim mümkün değil, gider azaltma hedefleri öner
    const reductionNeeded = Math.abs(rawNet);
    conservative = 0;
    realistic = 0;
    ambitious = 0;
    warning = {
      type: 'deficit',
      message: `Bu dönem ${reductionNeeded.toFixed(0)} € açık beklenir. Birikim için önce giderleri azaltmak gerekiyor.`,
      reductionTarget: Math.round(reductionNeeded * 100) / 100,
    };
  } else {
    conservative = Math.min(expectedNet * 0.5, avgHistoricalSavings || expectedNet * 0.5);
    realistic = expectedNet * 0.7;
    ambitious = expectedNet * 0.9;
  }

  return {
    incomeForecast: incomeForecast.forecast,
    expenseForecast: expenseForecast.forecast,
    expectedNet: Math.round(expectedNet * 100) / 100,
    rawNet: Math.round(rawNet * 100) / 100,
    historicalAvgSavings: Math.round(avgHistoricalSavings * 100) / 100,
    isDeficit,
    warning,
    suggestions: {
      conservative: {
        amount: Math.round(conservative * 100) / 100,
        label: 'Güvenli',
        description: isDeficit ? 'Açık nedeniyle birikim mümkün değil' : 'Kolayca ulaşılabilir, geçmişe dayalı',
      },
      realistic: {
        amount: Math.round(realistic * 100) / 100,
        label: 'Hedef',
        description: isDeficit ? 'Önce gider azaltma gerekiyor' : 'Orta zorluk, gerçekçi',
      },
      ambitious: {
        amount: Math.round(ambitious * 100) / 100,
        label: 'Zorlu',
        description: isDeficit ? 'Mevcut durumda erişilemez' : 'Disiplin gerektirir',
      },
    },
  };
}

// ── Layer 6: Action Recommendations ─────────────────────────────────

/**
 * Sayılardan anlamlı aksiyon önerileri çıkar.
 */
function generateActions() {
  const trends = getCategoryTrends();
  const savings = suggestSavings();
  const recurring = detectRecurring(loadTransactions());

  const actions = [];

  // 1. Trend uyarıları (artış olan kategoriler)
  for (const t of trends.slice(0, 5)) {
    if (t.direction === 'up' && t.absChange > 50) {
      actions.push({
        type: 'spending-up',
        priority: t.changePct > 30 ? 'high' : 'medium',
        category: t.category,
        title: `${t.category} harcaman %${Math.abs(t.changePct).toFixed(0)} arttı`,
        description: `Son dönemde (${t.lastMonthLabel}) ${t.lastValue.toFixed(0)} € harcadın, önceki dönem ortalaman ${t.prevAvg.toFixed(0)} € idi. Aradaki fark: +${t.absChange.toFixed(0)} €.`,
        suggestion: t.changePct > 50
          ? `Bu kategoride ciddi bir artış var. ${t.category} harcamalarını gözden geçir.`
          : `${t.category} harcamalarını biraz dizginlemeye çalış.`,
        impact: t.absChange,
      });
    }
  }

  // 2. Düşüş başarıları
  for (const t of trends.slice(0, 5)) {
    if (t.direction === 'down' && Math.abs(t.absChange) > 50) {
      actions.push({
        type: 'spending-down',
        priority: 'low',
        category: t.category,
        title: `Tebrikler — ${t.category} harcaman düştü`,
        description: `Geçen dönem ${t.category} kategorisinde ${Math.abs(t.absChange).toFixed(0)} € daha az harcadın.`,
        suggestion: `Bu disiplini devam ettir. Tasarrufun birikim hedefine yardımcı olur.`,
        impact: t.absChange,
      });
    }
  }

  // 3. Birikim hedefi
  if (savings.expectedNet > 100) {
    actions.push({
      type: 'savings',
      priority: 'medium',
      title: `Önümüzdeki dönem ${savings.suggestions.realistic.amount.toFixed(0)} € birikim hedefi`,
      description: `Tahmini gelir: ${savings.incomeForecast.toFixed(0)} €. Tahmini gider: ${savings.expenseForecast.toFixed(0)} €. Net: ${savings.expectedNet.toFixed(0)} €.`,
      suggestion: `${savings.suggestions.realistic.label} hedefi ile başlamanı öneririm. Daha rahat gideceksen ${savings.suggestions.conservative.label} (${savings.suggestions.conservative.amount.toFixed(0)} €) seç.`,
      impact: savings.suggestions.realistic.amount,
    });
  }

  // 5. Recurring tespit bilgilendirmesi
  const totalRecurring = recurring.reduce((s, r) => s + r.avgAmount, 0);
  if (totalRecurring > 0) {
    actions.push({
      type: 'recurring-info',
      priority: 'low',
      title: `${recurring.length} sabit aylık gideriniz var`,
      description: `Toplam ${totalRecurring.toFixed(0)} € — kira, abonelikler, taksitler dahil.`,
      suggestion: `Tasarruf için sabit giderleri gözden geçirebilirsin. En büyüğü: ${recurring[0]?.sampleSource || '—'} (${recurring[0]?.avgAmount?.toFixed(0)} €).`,
      impact: totalRecurring,
    });
  }

  // Priority'ye göre sırala
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  actions.sort((a, b) => (priorityOrder[a.priority] - priorityOrder[b.priority]) || (b.impact - a.impact));

  return actions;
}

// ── Public API ──────────────────────────────────────────────────────

const ForecastService = {
  // Forecasts
  forecastNextMonth() {
    return forecastAllCategories();
  },

  // Recurring detection
  getRecurring() {
    return detectRecurring(loadTransactions());
  },

  // Anomalies
  getAnomalies(opts) {
    return detectAnomalies(opts);
  },

  // Trends
  getTrends() {
    return getCategoryTrends();
  },

  // Saving suggestion
  getSavingSuggestion() {
    return suggestSavings();
  },

  // Action recommendations
  getActions() {
    return generateActions();
  },

  // Full dashboard data
  getDashboard() {
    const forecast = forecastAllCategories();

    return {
      forecast,
      recurring: detectRecurring(loadTransactions()),
      trends: getCategoryTrends(),
      savings: suggestSavings(),
      actions: generateActions(),
      meta: {
        monthsAnalyzed: forecast.historicalMonths || 0,
        generatedAt: new Date().toISOString(),
      },
    };
  },

  // Internal helpers (export for testing)
  _internal: {
    ewma, linearTrend, forecastSeries, normalizeSource,
    detectRecurring, detectAnomalies, getCategoryTrends,
  },
};

module.exports = ForecastService;
