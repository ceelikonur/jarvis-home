const { getDb } = require('../database/init');

const CalendarService = {
  /**
   * Create a new event
   * @param {string} title
   * @param {string} startTime — "YYYY-MM-DD HH:MM"
   * @param {string} endTime — "YYYY-MM-DD HH:MM"
   * @returns {{ id: number, title: string, start_time: string, end_time: string }}
   */
  create(title, startTime, endTime) {
    const db = getDb();
    const stmt = db.prepare(
      'INSERT INTO events (title, start_time, end_time) VALUES (?, ?, ?)'
    );
    const result = stmt.run(title, startTime, endTime);
    return {
      id: result.lastInsertRowid,
      title,
      start_time: startTime,
      end_time: endTime,
      created_at: new Date().toISOString(),
    };
  },

  /**
   * Get all events
   * @returns {Array}
   */
  getAll() {
    const db = getDb();
    return db.prepare('SELECT * FROM events ORDER BY start_time ASC').all();
  },

  /**
   * Get upcoming events (from start of today onward)
   * @returns {Array}
   */
  getUpcoming() {
    const db = getDb();
    return db
      .prepare("SELECT * FROM events WHERE start_time >= date('now') ORDER BY start_time ASC")
      .all();
  },

  /**
   * Get all events (local + imported) within a date range
   * @param {string} startDate — "YYYY-MM-DD"
   * @param {string} endDate — "YYYY-MM-DD"
   * @returns {Array}
   */
  getByRange(startDate, endDate) {
    const db = getDb();
    const local = db.prepare(
      `SELECT id, title, start_time, end_time, 0 as all_day, 'local' as source, NULL as source_name, NULL as color
       FROM events
       WHERE start_time < ? AND end_time >= ?
       ORDER BY start_time ASC`
    ).all(endDate, startDate);

    const imported = db.prepare(
      `SELECT ie.id, ie.title, ie.start_time, ie.end_time, ie.all_day,
              'imported' as source, cs.name as source_name, cs.color
       FROM imported_events ie
       JOIN calendar_sources cs ON ie.source_id = cs.id
       WHERE ie.start_time < ? AND ie.end_time >= ?
       ORDER BY ie.start_time ASC`
    ).all(endDate, startDate);

    return [...local, ...imported].sort((a, b) =>
      a.start_time.localeCompare(b.start_time)
    );
  },

  /**
   * Get a single event by ID
   * @param {number} id
   * @returns {object|undefined}
   */
  getById(id) {
    const db = getDb();
    return db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  },

  /**
   * Update an event (any field optional)
   */
  update(id, { title, start_time, end_time } = {}) {
    const db = getDb();
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
    if (!event) return null;
    const newTitle = title || event.title;
    const newStart = start_time || event.start_time;
    const newEnd = end_time || event.end_time;
    db.prepare('UPDATE events SET title=?, start_time=?, end_time=? WHERE id=?')
      .run(newTitle, newStart, newEnd, id);
    return { ...event, title: newTitle, start_time: newStart, end_time: newEnd };
  },

  /**
   * Delete an event by ID
   */
  delete(id) {
    const db = getDb();
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
    if (!event) return null;
    db.prepare('DELETE FROM events WHERE id = ?').run(id);
    return event;
  },
};

module.exports = CalendarService;
