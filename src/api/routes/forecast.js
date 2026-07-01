const { Router } = require('express');
const ForecastService = require('../../services/ForecastService');
const AIService = require('../../services/AIService');
const LearningService = require('../../services/LearningService');

const router = Router();

// GET /api/forecast — full dashboard data
router.get('/forecast', (req, res) => {
  try {
    const data = ForecastService.getDashboard();
    res.json({ success: true, data });
  } catch (err) {
    console.error('Forecast error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/forecast/categories — only category forecasts
router.get('/forecast/categories', (req, res) => {
  try {
    const data = ForecastService.forecastNextMonth();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/forecast/recurring
router.get('/forecast/recurring', (req, res) => {
  try {
    const data = ForecastService.getRecurring();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/forecast/anomalies
router.get('/forecast/anomalies', (req, res) => {
  try {
    const minZ = req.query.minZ ? parseFloat(req.query.minZ) : 2.0;
    const data = ForecastService.getAnomalies({ minZScore: minZ });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/forecast/trends
router.get('/forecast/trends', (req, res) => {
  try {
    const data = ForecastService.getTrends();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/forecast/savings
router.get('/forecast/savings', (req, res) => {
  try {
    const data = ForecastService.getSavingSuggestion();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/forecast/actions
router.get('/forecast/actions', (req, res) => {
  try {
    const data = ForecastService.getActions();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Learning / Feedback Loop ────────────────────────────────────────

// POST /api/forecast/feedback/anomaly — kullanıcı bir anomali için verdict verir
router.post('/forecast/feedback/anomaly', (req, res) => {
  try {
    const { date, source, amount, verdict, reason } = req.body || {};
    if (!date || !source || amount === undefined || !verdict) {
      return res.status(400).json({ success: false, error: 'date, source, amount, verdict required' });
    }
    if (!['normal', 'correct', 'wrong-category'].includes(verdict)) {
      return res.status(400).json({ success: false, error: 'invalid verdict' });
    }
    LearningService.markAnomaly(date, source, parseFloat(amount), verdict, reason);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/forecast/feedback/recurring — recurring whitelist/blacklist
router.post('/forecast/feedback/recurring', (req, res) => {
  try {
    const { patternKey, action } = req.body || {};
    if (!patternKey || !['whitelist', 'blacklist'].includes(action)) {
      return res.status(400).json({ success: false, error: 'patternKey and valid action required' });
    }
    LearningService.setRecurringOverride(patternKey, action);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/forecast/feedback/recurring/:key — kullanıcı override'ı kaldırır
router.delete('/forecast/feedback/recurring/:key', (req, res) => {
  try {
    LearningService.removeRecurringOverride(req.params.key);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/forecast/accuracy — geçmiş tahmin doğruluk raporu
router.get('/forecast/accuracy', (req, res) => {
  try {
    const data = LearningService.getAccuracyReport();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/forecast/backtest — geçmiş aylar için retroactive forecast + skorla
router.post('/forecast/backtest', (req, res) => {
  try {
    const result = LearningService.runBacktest();
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Backtest error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/forecast/insights — AI-enriched insights (lazy-load, slower)
router.post('/forecast/insights', async (req, res) => {
  try {
    const dashboard = ForecastService.getDashboard();
    const insights = await AIService.enrichForecastActions(dashboard);

    if (!insights) {
      return res.status(503).json({
        success: false,
        error: 'AI servisi erişilemiyor',
        fallback: true,
      });
    }

    res.json({ success: true, data: insights });
  } catch (err) {
    console.error('Forecast insights error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
