const { Router } = require('express');
const TaskService = require('../../services/TaskService');
const CalendarService = require('../../services/CalendarService');
const ListService = require('../../services/ListService');
const NoteService = require('../../services/NoteService');
const VectorStore = require('../../services/VectorStore');
const { getDb } = require('../../database/init');

const router = Router();

// GET /api/tasks — all pending tasks
router.get('/tasks', (req, res) => {
  try {
    const tasks = TaskService.getPending();
    res.json({ success: true, data: tasks });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/tasks/active — pending tasks visible right now
//   (non-recurring + recurring within their lead window)
router.get('/tasks/active', (req, res) => {
  try {
    res.json({ success: true, data: TaskService.getActive() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/tasks/dormant — recurring tasks scheduled but not yet within lead window
router.get('/tasks/dormant', (req, res) => {
  try {
    res.json({ success: true, data: TaskService.getDormant() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/dashboard/upcoming — combined feed for the home dashboard widget:
//   active tasks + events in the next N days (default 14)
router.get('/dashboard/upcoming', (req, res) => {
  try {
    const days = Math.max(1, Math.min(60, Number(req.query.days) || 14));
    const now = new Date();
    const horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const activeTasks = TaskService.getActive();
    const allEvents = CalendarService.getAll();
    const upcomingEvents = allEvents
      .filter(e => {
        const start = new Date(e.start_time.replace(' ', 'T'));
        return start >= now && start <= horizon;
      })
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .slice(0, 10);
    res.json({
      success: true,
      data: {
        tasks: activeTasks,
        events: upcomingEvents,
        windowDays: days,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/tasks/all — all tasks (pending + completed)
router.get('/tasks/all', (req, res) => {
  try {
    const tasks = TaskService.getAll();
    res.json({ success: true, data: tasks });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/tasks — create a task
router.post('/tasks', (req, res) => {
  try {
    const { title, due_date, priority, recurrence_days } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'Title is required' });
    const recurrence = Number.isInteger(recurrence_days) && recurrence_days > 0 ? recurrence_days : null;
    const task = TaskService.create(title, due_date || null, priority || 'normal', recurrence);
    res.status(201).json({ success: true, data: task });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/tasks/:id — update task title
router.patch('/tasks/:id', (req, res) => {
  try {
    const { title } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'Title is required' });
    const db = getDb();
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
    db.prepare('UPDATE tasks SET title = ? WHERE id = ?').run(title, req.params.id);
    res.json({ success: true, data: { ...task, title } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/tasks/:id/complete — complete a task
router.patch('/tasks/:id/complete', (req, res) => {
  try {
    const task = TaskService.complete(Number(req.params.id));
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
    res.json({ success: true, data: task });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/tasks/:id — delete a task
router.delete('/tasks/:id', (req, res) => {
  try {
    const task = TaskService.delete(Number(req.params.id));
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
    res.json({ success: true, data: task });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/events — upcoming events (next 10)
router.get('/events', (req, res) => {
  try {
    const events = CalendarService.getUpcoming().slice(0, 10);
    res.json({ success: true, data: events });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/events/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD — events in range (local + imported)
router.get('/events/calendar', (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ success: false, error: 'start and end query params required' });
    }
    const events = CalendarService.getByRange(start, end);
    res.json({ success: true, data: events });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/events — create event
router.post('/events', (req, res) => {
  try {
    const { title, start_time, end_time } = req.body;
    if (!title || !start_time || !end_time) {
      return res.status(400).json({ success: false, error: 'title, start_time, end_time required' });
    }
    const event = CalendarService.create(title, start_time, end_time);
    res.status(201).json({ success: true, data: event });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/events/:id — delete event
router.delete('/events/:id', (req, res) => {
  try {
    const event = CalendarService.delete(Number(req.params.id));
    if (!event) return res.status(404).json({ success: false, error: 'Event not found' });
    res.json({ success: true, data: event });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/lists — all lists with their items
router.get('/lists', (req, res) => {
  try {
    const lists = ListService.getAllLists();
    const listsWithItems = lists.map(list => ({
      ...list,
      items: ListService.getAllItems(list.id),
    }));
    res.json({ success: true, data: listsWithItems });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/lists/:id/items — add item to a list
router.post('/lists/:id/items', (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ success: false, error: 'Content is required' });
    const item = ListService.addItem(Number(req.params.id), content);
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/list-items/:id/toggle — toggle checked
router.patch('/list-items/:id/toggle', (req, res) => {
  try {
    const item = ListService.toggleItem(Number(req.params.id));
    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/list-items/:id — delete a list item
router.delete('/list-items/:id', (req, res) => {
  try {
    const item = ListService.removeItem(Number(req.params.id));
    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/notes — last 10 notes
router.get('/notes', (req, res) => {
  try {
    const notes = NoteService.getAll(10);
    res.json({ success: true, data: notes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/notes/:id — delete a note
router.delete('/notes/:id', (req, res) => {
  try {
    const note = NoteService.delete(Number(req.params.id));
    if (!note) return res.status(404).json({ success: false, error: 'Note not found' });
    res.json({ success: true, data: note });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/overview — combined data
router.get('/overview', (req, res) => {
  try {
    const tasks = TaskService.getPending();
    const events = CalendarService.getUpcoming().slice(0, 10);

    const lists = ListService.getAllLists();
    const listsWithItems = lists.map(list => ({
      ...list,
      items: ListService.getUncheckedItems(list.id),
    }));

    const notes = NoteService.getAll(10);

    const memoriesCount = VectorStore.count();

    const db = getDb();
    const conversationsCount = db.prepare('SELECT COUNT(*) as count FROM conversations').get().count;

    res.json({
      success: true,
      data: {
        tasks,
        events,
        lists: listsWithItems,
        notes,
        memories_count: memoriesCount,
        conversations_count: conversationsCount,
        lists_count: lists.length,
        tasks_count: tasks.length,
        events_count: events.length,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
