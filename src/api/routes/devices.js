const express = require('express');
const Connectors = require('../../connectors');
const { parseColor } = require('../../connectors/base');

const router = express.Router();

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
