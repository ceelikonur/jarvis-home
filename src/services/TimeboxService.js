const { getDb } = require('../database/init');
const { config } = require('../config');
const { formatDateInTimezone } = require('../utils/helpers');

/**
 * Timebox = a planned focus block for the day. Distinct from events
 * (commitments to others) and tasks (open todos).
 *
 * Schema: see migration in database/init.js
 */

function todayDateOnly() {
  return formatDateInTimezone(new Date(), config.timezone).slice(0, 10);
}

function deriveDate(startTime) {
  // start_time is 'YYYY-MM-DD HH:MM' — first 10 chars are the date.
  return startTime.slice(0, 10);
}

const VALID_STATUS = new Set(['planned', 'done', 'skipped']);

const TimeboxService = {
  /**
   * Create a single timebox.
   * @param {{title:string, start_time:string, end_time:string, task_id?:number|null, notes?:string|null}} input
   */
  create({ title, start_time, end_time, task_id = null, notes = null }) {
    if (!title || !start_time || !end_time) {
      throw new Error('title, start_time, end_time required');
    }
    const date = deriveDate(start_time);
    const db = getDb();
    const stmt = db.prepare(
      `INSERT INTO timeboxes (date, start_time, end_time, title, task_id, notes)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const result = stmt.run(date, start_time, end_time, title, task_id, notes);
    return this.getById(result.lastInsertRowid);
  },

  /**
   * Create many timeboxes in one transaction (used by AI plan suggestion).
   * Each item must include title, start_time, end_time.
   */
  createMany(items) {
    if (!Array.isArray(items) || items.length === 0) return [];
    const db = getDb();
    const stmt = db.prepare(
      `INSERT INTO timeboxes (date, start_time, end_time, title, task_id, notes)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const txn = db.transaction((rows) => {
      const ids = [];
      for (const it of rows) {
        if (!it.title || !it.start_time || !it.end_time) continue;
        const r = stmt.run(
          deriveDate(it.start_time),
          it.start_time,
          it.end_time,
          it.title,
          it.task_id ?? null,
          it.notes ?? null,
        );
        ids.push(r.lastInsertRowid);
      }
      return ids;
    });
    const ids = txn(items);
    return ids.map(id => this.getById(id));
  },

  getById(id) {
    const db = getDb();
    return db.prepare('SELECT * FROM timeboxes WHERE id = ?').get(id);
  },

  /**
   * All timeboxes for a given local date (YYYY-MM-DD), ordered by start time.
   */
  getByDate(date = todayDateOnly()) {
    const db = getDb();
    return db.prepare(
      `SELECT * FROM timeboxes WHERE date = ? ORDER BY start_time ASC`
    ).all(date);
  },

  /**
   * Update mutable fields. Pass only the fields you want changed.
   */
  update(id, patch = {}) {
    const db = getDb();
    const current = this.getById(id);
    if (!current) return null;

    const next = {
      title: patch.title ?? current.title,
      start_time: patch.start_time ?? current.start_time,
      end_time: patch.end_time ?? current.end_time,
      task_id: patch.task_id !== undefined ? patch.task_id : current.task_id,
      status: patch.status && VALID_STATUS.has(patch.status) ? patch.status : current.status,
      notes: patch.notes !== undefined ? patch.notes : current.notes,
    };
    const newDate = deriveDate(next.start_time);
    // If time/title changed, reset notified flag so a new ping can fire.
    const resetNotified = (next.start_time !== current.start_time || next.title !== current.title) ? 0 : current.notified;

    db.prepare(
      `UPDATE timeboxes SET date=?, start_time=?, end_time=?, title=?,
         task_id=?, status=?, notes=?, notified=?
       WHERE id=?`
    ).run(newDate, next.start_time, next.end_time, next.title, next.task_id, next.status, next.notes, resetNotified, id);

    return this.getById(id);
  },

  delete(id) {
    const db = getDb();
    const row = this.getById(id);
    if (!row) return null;
    db.prepare('DELETE FROM timeboxes WHERE id=?').run(id);
    return row;
  },

  /**
   * Find timeboxes whose start_time falls within the next N seconds and
   * have not been notified yet. Used by the per-minute scheduler tick.
   */
  getStartingSoon(secondsAhead = 60) {
    const db = getDb();
    const all = db.prepare(
      `SELECT * FROM timeboxes
       WHERE status = 'planned' AND notified = 0
       AND start_time >= ?
       ORDER BY start_time ASC`
    ).all(formatDateInTimezone(new Date(), config.timezone));

    const cutoff = new Date(Date.now() + secondsAhead * 1000);
    const cutoffStr = formatDateInTimezone(cutoff, config.timezone);
    return all.filter(t => t.start_time <= cutoffStr);
  },

  /**
   * Mark a timebox as having had its start-ping fired.
   */
  markNotified(id) {
    const db = getDb();
    db.prepare('UPDATE timeboxes SET notified=1 WHERE id=?').run(id);
  },

  /**
   * Aggregated counts for a date — used by /plan stats panel.
   */
  getDailyStats(date = todayDateOnly()) {
    const db = getDb();
    const rows = db.prepare(
      `SELECT status, COUNT(*) as cnt FROM timeboxes WHERE date = ? GROUP BY status`
    ).all(date);
    const stats = { planned: 0, done: 0, skipped: 0, total: 0 };
    for (const r of rows) {
      stats[r.status] = r.cnt;
      stats.total += r.cnt;
    }
    return stats;
  },

  // Exposed for callers that need the same date logic
  todayDateOnly,
};

module.exports = TimeboxService;
