const { getDb } = require('../database/init');

// Default time-of-day for auto-set due dates on recurring tasks.
// 09:00 means: scheduler treats it as future (not overdue) when set in morning;
// 30-min and overdue reminders fire at sensible local times.
const DEFAULT_DUE_TIME = '09:00';

function todayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

function todayWithDefaultTime() {
  return `${todayDateOnly()} ${DEFAULT_DUE_TIME}`;
}

function addDays(baseStr, days) {
  // baseStr is "YYYY-MM-DD" or "YYYY-MM-DD HH:MM"; preserves time if present
  const hasTime = baseStr && baseStr.includes(' ');
  const time = hasTime ? baseStr.slice(11, 16) : DEFAULT_DUE_TIME;
  const datePart = baseStr ? baseStr.slice(0, 10) : todayDateOnly();
  const d = new Date(`${datePart}T00:00:00`);
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return `${d.toISOString().slice(0, 10)} ${time}`;
}

/**
 * Default lead window for a recurring task — how many days before due_date
 * the task becomes "active" (visible on dashboard, included in briefings).
 * Formula: ~11% of cycle, clamped between 1 and 14 days.
 *  7d  → 1d   (weekly: only on the day)
 *  14d → 2d
 *  30d → 3d
 *  45d → 5d   (matches "duş filtresi" use case)
 *  60d → 7d
 *  90d → 10d
 *  180d→ 14d  (capped)
 *  365d→ 14d  (capped — yearly things appear 2 weeks ahead)
 */
function defaultLeadDays(recurrenceDays) {
  if (!recurrenceDays || recurrenceDays <= 0) return 0;
  return Math.min(14, Math.max(1, Math.round(recurrenceDays / 9)));
}

function daysUntil(dueDateStr) {
  if (!dueDateStr) return null;
  // Compare dates at local midnight for stable day counts.
  const due = new Date(`${dueDateStr.slice(0, 10)}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due - today) / (1000 * 60 * 60 * 24));
}

function isActive(task) {
  // Non-recurring tasks are always active.
  if (!task.recurrence_days) return true;
  // Recurring without due_date — shouldn't happen, but treat as active.
  if (!task.due_date) return true;
  const lead = defaultLeadDays(task.recurrence_days);
  const remaining = daysUntil(task.due_date);
  // Active if overdue OR within the lead window.
  return remaining === null || remaining <= lead;
}

const TaskService = {
  /**
   * Create a new task
   * @param {string} title
   * @param {string|null} dueDate
   * @param {string} priority — 'high' | 'normal' | 'low'
   * @param {number|null} recurrenceDays — if set, task is recurring and renews on completion
   */
  create(title, dueDate = null, priority = 'normal', recurrenceDays = null) {
    const db = getDb();
    const validPriority = ['high', 'normal', 'low'].includes(priority) ? priority : 'normal';
    const validRecurrence = (Number.isInteger(recurrenceDays) && recurrenceDays > 0)
      ? recurrenceDays : null;
    // Recurring tasks need a due_date so the scheduler/calendar can act on them.
    // Default to today 09:00 if user didn't specify — sane time-of-day matters
    // because date-only strings parse as UTC midnight (wrong local time).
    let finalDueDate = dueDate || null;
    if (validRecurrence && !finalDueDate) {
      finalDueDate = todayWithDefaultTime();
    }
    const stmt = db.prepare('INSERT INTO tasks (title, due_date, priority, recurrence_days) VALUES (?, ?, ?, ?)');
    const result = stmt.run(title, finalDueDate, validPriority, validRecurrence);
    return {
      id: result.lastInsertRowid,
      title,
      status: 'pending',
      due_date: finalDueDate,
      priority: validPriority,
      recurrence_days: validRecurrence,
      created_at: new Date().toISOString(),
    };
  },

  /**
   * Get all pending tasks
   * @returns {Array}
   */
  getPending() {
    const db = getDb();
    return db
      .prepare("SELECT * FROM tasks WHERE status = 'pending' ORDER BY created_at ASC")
      .all();
  },

  /**
   * Get all tasks (any status)
   * @returns {Array}
   */
  getAll() {
    const db = getDb();
    return db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all();
  },

  /**
   * Mark a task as completed.
   * For recurring tasks (recurrence_days > 0), the due_date is rolled forward
   * by the interval and status stays 'pending'. The returned object has
   * `recurred: true` so callers can communicate that nothing was archived.
   * @param {number} id
   * @returns {object|null}
   */
  complete(id) {
    const db = getDb();
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!task) return null;

    if (task.recurrence_days && task.recurrence_days > 0) {
      // Anchor next occurrence to whichever is later: existing due_date or today.
      // Completing early doesn't permanently shift the schedule earlier;
      // completing late doesn't pile up overdue dates.
      const todayStr = todayWithDefaultTime();
      const existingFutureish = task.due_date && task.due_date.slice(0, 10) >= todayDateOnly();
      const anchor = existingFutureish ? task.due_date : todayStr;
      const newDue = addDays(anchor, task.recurrence_days);
      db.prepare('UPDATE tasks SET due_date = ? WHERE id = ?').run(newDue, id);
      return { ...task, due_date: newDue, recurred: true };
    }

    db.prepare("UPDATE tasks SET status = 'completed' WHERE id = ?").run(id);
    return { ...task, status: 'completed' };
  },

  /**
   * Delete a task by ID
   */
  delete(id) {
    const db = getDb();
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!task) return null;
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    return task;
  },

  /**
   * Get tasks with due dates (for calendar export)
   * @returns {Array}
   */
  getWithDueDates() {
    const db = getDb();
    return db
      .prepare('SELECT * FROM tasks WHERE due_date IS NOT NULL ORDER BY due_date ASC')
      .all();
  },

  /**
   * Pending tasks that should be visible to the user right now.
   * Excludes recurring tasks whose next due is far enough away to be hidden.
   */
  getActive() {
    return this.getPending().filter(isActive);
  },

  /**
   * Pending recurring tasks not yet within their lead window — "scheduled
   * but not yet active". Useful for a collapsed "Sıradaki rutinler" section.
   */
  getDormant() {
    return this.getPending().filter(t => !isActive(t));
  },

  /** @internal — exposed for testing & callers that need the rule */
  isActive,
  defaultLeadDays,
  daysUntil,
};

module.exports = TaskService;
