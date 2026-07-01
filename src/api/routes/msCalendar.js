const express = require('express');
const router = express.Router();
const MSCalendarService = require('../../services/MSCalendarService');

// GET /api/ms-calendar/status
router.get('/ms-calendar/status', (req, res) => {
  res.json({
    success: true,
    configured: MSCalendarService.isConfigured(),
    authenticated: MSCalendarService.isAuthenticated(),
  });
});

// GET /api/ms-calendar/auth — redirect to Microsoft login
router.get('/ms-calendar/auth', async (req, res) => {
  try {
    if (!MSCalendarService.isConfigured()) {
      return res.status(400).json({ error: 'MS Calendar not configured. Add MS_CLIENT_ID, MS_TENANT_ID, MS_CLIENT_SECRET to .env' });
    }
    const authUrl = await MSCalendarService.getAuthUrl();
    res.redirect(authUrl);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/ms-calendar/callback — OAuth2 callback
router.get('/ms-calendar/callback', async (req, res) => {
  try {
    const { code, error } = req.query;
    if (error) {
      return res.status(400).send(`<h2>Auth failed</h2><p>${error}</p><a href="/availability.html">Back</a>`);
    }
    if (!code) {
      return res.status(400).send('<h2>No code received</h2><a href="/availability.html">Back</a>');
    }

    await MSCalendarService.handleCallback(code);

    // Auto-sync after first auth
    try {
      const count = await MSCalendarService.sync();
      res.send(`
        <html><body style="background:#0a0e1a;color:#00d4ff;font-family:monospace;text-align:center;padding:60px;">
          <h1>Office 365 Connected</h1>
          <p>${count} events synced</p>
          <p style="margin-top:20px;"><a href="/availability.html" style="color:#00ff88;">Go to Availability</a></p>
        </body></html>
      `);
    } catch (syncErr) {
      res.send(`
        <html><body style="background:#0a0e1a;color:#00d4ff;font-family:monospace;text-align:center;padding:60px;">
          <h1>Office 365 Connected</h1>
          <p style="color:#ff3355;">Sync error: ${syncErr.message}</p>
          <p><a href="/availability.html" style="color:#00ff88;">Go to Availability</a></p>
        </body></html>
      `);
    }
  } catch (err) {
    res.status(500).send(`<h2>Auth error</h2><p>${err.message}</p><a href="/availability.html">Back</a>`);
  }
});

// POST /api/ms-calendar/sync — manual sync
router.post('/ms-calendar/sync', async (req, res) => {
  try {
    const count = await MSCalendarService.sync();
    res.json({ success: true, synced: count });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/ms-calendar/events?start=YYYY-MM-DD&end=YYYY-MM-DD — fetch events directly
router.get('/ms-calendar/events', async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'start and end required' });
    const events = await MSCalendarService.fetchEvents(start, end);
    res.json({ success: true, events });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
