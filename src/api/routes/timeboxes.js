const { Router } = require('express');
const TimeboxService = require('../../services/TimeboxService');
const TaskService = require('../../services/TaskService');
const CalendarService = require('../../services/CalendarService');
const AIService = require('../../services/AIService');

const router = Router();

// GET /api/timeboxes?date=YYYY-MM-DD  (date defaults to today)
router.get('/timeboxes', (req, res) => {
  try {
    const date = req.query.date || TimeboxService.todayDateOnly();
    const data = TimeboxService.getByDate(date);
    res.json({ success: true, data, date });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/timeboxes/stats?date=YYYY-MM-DD
router.get('/timeboxes/stats', (req, res) => {
  try {
    const date = req.query.date || TimeboxService.todayDateOnly();
    const stats = TimeboxService.getDailyStats(date);
    res.json({ success: true, data: stats, date });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/timeboxes  body: { title, start_time, end_time, task_id?, notes? }
router.post('/timeboxes', (req, res) => {
  try {
    const { title, start_time, end_time, task_id, notes } = req.body;
    if (!title || !start_time || !end_time) {
      return res.status(400).json({ success: false, error: 'title, start_time, end_time required' });
    }
    const tb = TimeboxService.create({ title, start_time, end_time, task_id: task_id || null, notes: notes || null });
    res.status(201).json({ success: true, data: tb });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/timeboxes/batch  body: { items: [...] }  — used by AI suggest insert
router.post('/timeboxes/batch', (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length === 0) {
      return res.status(400).json({ success: false, error: 'items array required' });
    }
    const created = TimeboxService.createMany(items);
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/timeboxes/:id  body: any subset of mutable fields + status
router.patch('/timeboxes/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const updated = TimeboxService.update(id, req.body || {});
    if (!updated) return res.status(404).json({ success: false, error: 'Timebox not found' });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/timeboxes/suggest  body: { date }  → AI returns proposed timebox array
router.post('/timeboxes/suggest', async (req, res) => {
  try {
    const date = req.body?.date || TimeboxService.todayDateOnly();
    const pendingTasks = TaskService.getActive();
    const events = CalendarService.getAll().filter(e => e.start_time?.startsWith(date));
    const existingTimeboxes = TimeboxService.getByDate(date);

    const suggestions = await AIService.suggestDayPlan({
      date, pendingTasks, events, existingTimeboxes,
    });

    res.json({ success: true, data: suggestions, date });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/timeboxes/:id
router.delete('/timeboxes/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const removed = TimeboxService.delete(id);
    if (!removed) return res.status(404).json({ success: false, error: 'Timebox not found' });
    res.json({ success: true, data: removed });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
