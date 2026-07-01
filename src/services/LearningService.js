/**
 * LearningService — Feedback loop ve self-correction katmanı
 *
 * Sistem öğrenir çünkü:
 *  1. Her forecast'i snapshot olarak kaydederiz → ay kapandığında actual ile karşılaştırırız
 *  2. Kullanıcı anomali "normal" derse, o source kategoriye eklenir → bir daha uyarı vermez
 *  3. Recurring detection için kullanıcı override edebilir (whitelist/blacklist)
 *  4. Accuracy istatistikleri toplanır, modelin nasıl performans gösterdiği rapor edilir
 */

const { getDb } = require('../database/init');

const LearningService = {
  // ── Forecast Snapshots ──────────────────────────────────────────

  /**
   * Bir forecast üretildiğinde tüm kategorileri snapshot olarak kaydet.
   * Aynı target_month + category için son snapshot'ı tutar (eski olanlar silinir).
   */
  saveSnapshot(forecastData) {
    const db = getDb();
    const targetMonth = forecastData.targetMonth;
    if (!targetMonth) return 0;

    // Aynı target_month için eski snapshot'ları temizle (sadece henüz scoring olmayanlar)
    db.prepare('DELETE FROM forecast_snapshots WHERE target_month = ? AND scored_at IS NULL').run(targetMonth);

    const insert = db.prepare(`
      INSERT INTO forecast_snapshots (target_month, category, forecast_amount, low, high, confidence, method, samples)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const txn = db.transaction((forecasts) => {
      for (const f of forecasts) {
        insert.run(targetMonth, f.category, f.forecast, f.low, f.high, f.confidence, f.method, f.samples || 0);
      }
    });

    txn(forecastData.forecasts);
    return forecastData.forecasts.length;
  },

  /**
   * Geçmiş bir aydaki tahminleri actual değerlerle skorla.
   * Bu fonksiyon idempotent — aynı ay tekrar skorlanırsa sadece güncellenir.
   */
  scoreSnapshots(targetMonth) {
    const db = getDb();

    const snapshots = db.prepare(
      'SELECT * FROM forecast_snapshots WHERE target_month = ? AND actual_amount IS NULL'
    ).all(targetMonth);

    if (snapshots.length === 0) return { scored: 0, alreadyScored: 0 };

    const update = db.prepare(`
      UPDATE forecast_snapshots
      SET actual_amount = ?, error_pct = ?, scored_at = datetime('now')
      WHERE id = ?
    `);

    const txn = db.transaction(() => {
      let scored = 0;
      for (const snap of snapshots) {
        // Calculate actual for this category in target_month
        const actual = db.prepare(`
          SELECT COALESCE(SUM(ABS(amount)), 0) as total
          FROM budget_transactions
          WHERE type = 'expense'
            AND category = ?
            AND substr(date, 1, 7) = ?
            AND is_internal = 0
            AND is_savings = 0
        `).get(snap.category, targetMonth);

        const actualAmount = actual.total || 0;
        const errorPct = snap.forecast_amount > 0
          ? ((actualAmount - snap.forecast_amount) / snap.forecast_amount) * 100
          : 0;

        update.run(actualAmount, Math.round(errorPct * 10) / 10, snap.id);
        scored++;
      }
      return scored;
    });

    return { scored: txn(), alreadyScored: 0 };
  },

  /**
   * Tüm geçmiş, henüz tamamlanmış aylar için skorlama yap.
   * Bir ay "tamamlanmış" sayılır eğer sonraki ayın 1. günü geçmişse.
   */
  scoreAllPastMonths() {
    const db = getDb();
    const now = new Date();
    const cutoff = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Pending snapshot olan tüm ayları al
    const pendingMonths = db.prepare(
      'SELECT DISTINCT target_month FROM forecast_snapshots WHERE actual_amount IS NULL AND target_month < ?'
    ).all(cutoff).map(r => r.target_month);

    let total = 0;
    for (const month of pendingMonths) {
      const result = this.scoreSnapshots(month);
      total += result.scored;
    }
    return { months: pendingMonths.length, scored: total };
  },

  /**
   * Accuracy raporu: hangi kategoride ne kadar isabetli tahmin yapıldı?
   */
  getAccuracyReport() {
    const db = getDb();

    // Tüm skorlanmış snapshot'lar
    const all = db.prepare(`
      SELECT target_month, category, forecast_amount, actual_amount, error_pct, confidence
      FROM forecast_snapshots
      WHERE actual_amount IS NOT NULL
      ORDER BY target_month DESC
    `).all();

    if (all.length === 0) {
      return {
        hasData: false,
        message: 'Henüz tamamlanmış tahmin yok. Bir ay kapandıktan sonra performans raporu burada görünür.',
      };
    }

    // Genel istatistikler
    const errors = all.map(s => Math.abs(s.error_pct));
    const meanAbsError = errors.reduce((s, e) => s + e, 0) / errors.length;

    const within20pct = all.filter(s => Math.abs(s.error_pct) <= 20).length;
    const accuracy = (within20pct / all.length) * 100;

    // Kategori bazlı
    const byCategory = new Map();
    for (const s of all) {
      if (!byCategory.has(s.category)) byCategory.set(s.category, []);
      byCategory.get(s.category).push(s);
    }
    const categoryStats = Array.from(byCategory.entries()).map(([cat, items]) => {
      const errs = items.map(i => Math.abs(i.error_pct));
      return {
        category: cat,
        count: items.length,
        meanAbsError: Math.round(errs.reduce((s, e) => s + e, 0) / errs.length * 10) / 10,
        avgForecast: Math.round(items.reduce((s, i) => s + i.forecast_amount, 0) / items.length),
        avgActual: Math.round(items.reduce((s, i) => s + i.actual_amount, 0) / items.length),
      };
    }).sort((a, b) => a.meanAbsError - b.meanAbsError);

    // Aylık özet
    const byMonth = new Map();
    for (const s of all) {
      if (!byMonth.has(s.target_month)) byMonth.set(s.target_month, []);
      byMonth.get(s.target_month).push(s);
    }
    const monthStats = Array.from(byMonth.entries()).map(([month, items]) => {
      const errs = items.map(i => Math.abs(i.error_pct));
      return {
        month,
        count: items.length,
        meanAbsError: Math.round(errs.reduce((s, e) => s + e, 0) / errs.length * 10) / 10,
      };
    }).sort((a, b) => b.month.localeCompare(a.month));

    return {
      hasData: true,
      totalForecasts: all.length,
      overallAccuracy: Math.round(accuracy * 10) / 10,
      meanAbsError: Math.round(meanAbsError * 10) / 10,
      categoryStats,
      monthStats,
    };
  },

  // ── Anomaly Feedback ────────────────────────────────────────────

  /**
   * Bir anomali için kullanıcı verdict'i kaydet.
   * verdict: 'normal' (yanıltıcı uyarı, bir daha uyarma)
   *          'correct' (doğru tespit, kullanıcı zaten biliyor)
   *          'wrong-category' (yanlış kategoride sınıflandırılmış)
   */
  markAnomaly(txDate, txSource, txAmount, verdict, reason = null) {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO anomaly_feedback (tx_date, tx_source, tx_amount, verdict, reason)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(tx_date, tx_source, tx_amount) DO UPDATE SET
        verdict = excluded.verdict,
        reason = excluded.reason,
        created_at = datetime('now')
    `);
    return stmt.run(txDate, txSource, txAmount, verdict, reason).changes;
  },

  /**
   * Bir işlem için kayıtlı verdict'i getir (varsa).
   */
  getAnomalyVerdict(txDate, txSource, txAmount) {
    const db = getDb();
    return db.prepare(
      'SELECT verdict, reason, created_at FROM anomaly_feedback WHERE tx_date = ? AND tx_source = ? AND tx_amount = ?'
    ).get(txDate, txSource, txAmount);
  },

  /**
   * Tüm "normal" işaretlenmiş işlemlerin source'larını döndür — anomaly detector
   * bunları skip etmeli.
   */
  getWhitelistedSources() {
    const db = getDb();
    const rows = db.prepare(
      "SELECT DISTINCT tx_source FROM anomaly_feedback WHERE verdict = 'normal'"
    ).all();
    return new Set(rows.map(r => r.tx_source));
  },

  // ── Backtest (geçmişe simülasyon) ────────────────────────────────

  /**
   * Geçmiş ayları retroactive olarak forecast edip skorla.
   * Her ay için, o ay öncesindeki verileri kullanarak forecast üretir.
   *
   * Kullanım: Sistem ilk açıldığında veya yeniden eğitim için.
   */
  runBacktest() {
    const db = getDb();

    // Tüm ayları al
    const allMonths = db.prepare(
      "SELECT DISTINCT substr(date, 1, 7) as mk FROM budget_transactions WHERE is_internal = 0 AND is_savings = 0 ORDER BY mk ASC"
    ).all().map(r => r.mk);

    if (allMonths.length < 3) {
      return { ok: false, reason: 'En az 3 aylık veri gerekiyor', monthsAvailable: allMonths.length };
    }

    // İlk 2 ay base olarak kullan, sonraki her ayı tahmin et
    const targetMonths = allMonths.slice(2);

    // Skorlanmış snapshot'ları temizle (backtest sonuçlarını yenilemek için)
    const placeholders = targetMonths.map(() => '?').join(',');
    db.prepare(`DELETE FROM forecast_snapshots WHERE target_month IN (${placeholders})`).run(...targetMonths);

    let totalSnaps = 0;

    for (const target of targetMonths) {
      // Bu aydan önceki tüm transactions'u kullan
      const histTxs = db.prepare(`
        SELECT date, source, amount, type, category, sub_category
        FROM budget_transactions
        WHERE substr(date, 1, 7) < ? AND is_internal = 0 AND is_savings = 0
        ORDER BY date ASC
      `).all(target);

      // Kategori başına aylık seri çıkar
      const catSeries = new Map();
      for (const t of histTxs) {
        if (t.type !== 'expense' || !t.category) continue;
        const mk = t.date.slice(0, 7);
        if (!catSeries.has(t.category)) catSeries.set(t.category, new Map());
        const m = catSeries.get(t.category);
        m.set(mk, (m.get(mk) || 0) + Math.abs(t.amount));
      }

      // Her kategori için inline forecast (basit EWMA + trend)
      const insert = db.prepare(`
        INSERT INTO forecast_snapshots (target_month, category, forecast_amount, low, high, confidence, method, samples, generated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      const txn = db.transaction(() => {
        for (const [cat, monthMap] of catSeries.entries()) {
          const months = Array.from(monthMap.keys()).sort();
          const values = months.map(m => monthMap.get(m));
          if (values.length === 0) continue;

          // EWMA
          let s = values[0];
          const alpha = 0.4;
          for (let i = 1; i < values.length; i++) s = alpha * values[i] + (1 - alpha) * s;

          // Linear trend
          const xs = values.map((_, i) => i);
          const xMean = xs.reduce((a, b) => a + b, 0) / xs.length;
          const yMean = values.reduce((a, b) => a + b, 0) / values.length;
          let num = 0, den = 0;
          for (let i = 0; i < values.length; i++) {
            num += (xs[i] - xMean) * (values[i] - yMean);
            den += (xs[i] - xMean) ** 2;
          }
          const slope = den === 0 ? 0 : num / den;
          const intercept = yMean - slope * xMean;
          const trendForecast = slope * values.length + intercept;

          const trendWeight = Math.min(0.4, values.length / 12);
          const forecast = Math.max(0, (1 - trendWeight) * s + trendWeight * trendForecast);

          // Std dev
          const sd = values.length > 1
            ? Math.sqrt(values.reduce((a, b) => a + (b - yMean) ** 2, 0) / (values.length - 1))
            : 0;
          const cv = yMean > 0 ? sd / yMean : 0;
          const confidence = (values.length >= 4 && cv < 0.25) ? 'high'
                          : (values.length >= 3 && cv < 0.5) ? 'medium' : 'low';

          insert.run(
            target, cat,
            Math.round(forecast * 100) / 100,
            Math.max(0, Math.round((forecast - sd) * 100) / 100),
            Math.round((forecast + sd) * 100) / 100,
            confidence,
            values.length >= 3 ? 'ewma+trend' : 'ewma',
            values.length,
          );
          totalSnaps++;
        }
      });
      txn();
    }

    // Şimdi tümünü skorla
    let totalScored = 0;
    for (const target of targetMonths) {
      const result = this.scoreSnapshots(target);
      totalScored += result.scored;
    }

    return { ok: true, monthsBacktested: targetMonths.length, snapshotsCreated: totalSnaps, scored: totalScored };
  },

  // ── Recurring Overrides ─────────────────────────────────────────

  setRecurringOverride(patternKey, action) {
    const db = getDb();
    return db.prepare(`
      INSERT INTO recurring_overrides (pattern_key, action)
      VALUES (?, ?)
      ON CONFLICT(pattern_key) DO UPDATE SET action = excluded.action
    `).run(patternKey, action).changes;
  },

  getRecurringOverrides() {
    const db = getDb();
    const rows = db.prepare('SELECT pattern_key, action FROM recurring_overrides').all();
    return {
      whitelist: new Set(rows.filter(r => r.action === 'whitelist').map(r => r.pattern_key)),
      blacklist: new Set(rows.filter(r => r.action === 'blacklist').map(r => r.pattern_key)),
    };
  },

  removeRecurringOverride(patternKey) {
    const db = getDb();
    return db.prepare('DELETE FROM recurring_overrides WHERE pattern_key = ?').run(patternKey).changes;
  },
};

module.exports = LearningService;
