const express = require('express');
const Connectors = require('../../connectors');
const { parseColor } = require('../../connectors/base');
const { setEnvVars } = require('../../config/envFile');

const router = express.Router();

function safeConfigured(c) {
  try { return c.isConfigured(); } catch { return false; }
}

// GET /api/connectors — every connector + whether it's configured (for the UI).
router.get('/connectors', (req, res) => {
  try {
    const connectors = Connectors.all().map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      requiredEnv: c.requiredEnv || [],
      configHints: c.configHints || {},
      capabilities: c.capabilities || [],
      configured: safeConfigured(c),
    }));
    res.json({ connectors });
  } catch (err) {
    console.error('[api/connectors GET]', err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

// POST /api/connectors/:id/config — { values: { ENV_KEY: value } }
// Saves credentials (only the connector's own keys) to .env + live process.
router.post('/connectors/:id/config', (req, res) => {
  try {
    const c = Connectors.get(req.params.id);
    if (!c) return res.status(404).json({ error: 'connector bulunamadı' });
    const values = (req.body && req.body.values) || {};
    const allowed = new Set(c.requiredEnv || []);
    const updates = {};
    for (const [k, v] of Object.entries(values)) {
      if (allowed.has(k)) updates[k] = String(v == null ? '' : v).trim();
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'geçerli alan yok' });
    }
    setEnvVars(updates);
    res.json({ configured: safeConfigured(c) });
  } catch (err) {
    console.error('[api/connectors config POST]', err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

// DELETE /api/connectors/:id/config — clear the connector's keys (disable it).
router.delete('/connectors/:id/config', (req, res) => {
  try {
    const c = Connectors.get(req.params.id);
    if (!c) return res.status(404).json({ error: 'connector bulunamadı' });
    const updates = {};
    for (const k of c.requiredEnv || []) updates[k] = '';
    setEnvVars(updates);
    res.json({ configured: safeConfigured(c) });
  } catch (err) {
    console.error('[api/connectors config DELETE]', err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

// GET /api/devices — devices from every configured connector (PIN-protected).
router.get('/devices', async (req, res) => {
  try {
    const active = Connectors.active();
    if (active.length === 0) {
      return res.json({ active: false, connectors: [], devices: [] });
    }
    const devices = await Connectors.listDevices();
    res.json({
      active: true,
      connectors: active.map((c) => ({ id: c.id, name: c.name })),
      devices: devices.map((d) => ({
        key: d.key,
        connectorId: d.connectorId,
        id: d.id,
        name: d.name,
        model: d.model,
        capabilities: d.capabilities || [],
      })),
    });
  } catch (err) {
    console.error('[api/devices GET]', err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

// POST /api/devices/control — { device:{connectorId,id,model}, action, value }
//   action: 'power' (bool) | 'brightness' (0-100) | 'color' ({r,g,b} or a name/hex)
router.post('/devices/control', async (req, res) => {
  try {
    const { device, action } = req.body || {};
    let { value } = req.body || {};
    if (!device || !device.connectorId || !device.id) {
      return res.status(400).json({ error: 'device (connectorId + id) gerekli' });
    }
    if (action === 'color' && typeof value === 'string') {
      const rgb = parseColor(value);
      if (!rgb) return res.status(400).json({ error: 'renk tanınmadı' });
      value = rgb;
    }
    await Connectors.control(device, action, value);
    res.json({ ok: true });
  } catch (err) {
    console.error('[api/devices control]', err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

module.exports = router;
