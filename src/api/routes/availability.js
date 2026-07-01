const express = require('express');
const multer = require('multer');
const router = express.Router();
const CalendarSyncService = require('../../services/CalendarSyncService');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// GET /api/availability?date=YYYY-MM-DD
router.get('/availability', (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const availability = CalendarSyncService.getAvailability(date);
    const events = CalendarSyncService.getEventsForDate(date);
    res.json({ success: true, date, events, availability });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/events-range?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/events-range', (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'start and end required' });
    const events = CalendarSyncService.getEventsForRange(start, end);
    res.json({ success: true, events });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/calendars — list all sources
router.get('/calendars', (req, res) => {
  try {
    const sources = CalendarSyncService.getAllSources();
    res.json({ success: true, data: sources });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/calendars — add a source
router.post('/calendars', express.json(), (req, res) => {
  try {
    const { name, url, owner, color } = req.body;
    if (!name || !url) return res.status(400).json({ error: 'name and url required' });
    const source = CalendarSyncService.addSource(name, url, owner || 'sir', color || '#00d4ff');
    res.json({ success: true, data: source });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/calendars/:id
router.delete('/calendars/:id', (req, res) => {
  try {
    CalendarSyncService.deleteSource(Number(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/calendars/upload — import .ics file
router.post('/calendars/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const name = req.body.name || req.file.originalname.replace('.ics', '');
    const owner = req.body.owner || 'sir';
    const color = req.body.color || '#00d4ff';
    const result = CalendarSyncService.importFromFile(name, req.file.buffer, owner, color);
    res.json({ success: true, sourceId: result.sourceId, imported: result.count });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/calendars/:id/reimport — re-upload .ics for existing source
router.post('/calendars/:id/reimport', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const count = CalendarSyncService.reimportFromFile(Number(req.params.id), req.file.buffer);
    res.json({ success: true, imported: count });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/calendars/sync — force sync all
router.post('/calendars/sync', async (req, res) => {
  try {
    const count = await CalendarSyncService.syncAll();
    res.json({ success: true, synced: count });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
