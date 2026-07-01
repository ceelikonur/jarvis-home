const ical = require('node-ical');
const { getDb } = require('../database/init');
const { config } = require('../config');
const { formatDateInTimezone } = require('../utils/helpers');

/**
 * Parse iCal data object into normalized event array (shared by URL sync and file upload)
 */
function parseIcalEvents(data, sourceId) {
  const now = new Date();
  const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const future90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  // Format in user's local timezone — node-ical parses iCal TZID/UTC correctly
  // into a Date, but the previous toISOString() formatter dropped back to UTC.
  const fmt = (d) => formatDateInTimezone(d, config.timezone);
  const events = [];

  for (const [key, event] of Object.entries(data)) {
    if (event.type !== 'VEVENT') continue;
    if (!event.start) continue;

    const start = event.start instanceof Date ? event.start : new Date(event.start);
    const end = event.end instanceof Date
      ? event.end
      : new Date(start.getTime() + 3600000);

    if (start < past30 || start > future90) continue;

    events.push({
      source_id: sourceId,
      uid: event.uid || key,
      title: event.summary || 'Untitled',
      start_time: fmt(start),
      end_time: fmt(end),
      all_day: event.datetype === 'date' ? 1 : 0,
    });
  }
  return events;
}

/**
 * Insert events into DB (transaction)
 */
function insertEvents(events) {
  const db = getDb();
  const insert = db.prepare(
    'INSERT INTO imported_events (source_id, uid, title, start_time, end_time, all_day) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const run = db.transaction((evts) => {
    for (const e of evts) insert.run(e.source_id, e.uid, e.title, e.start_time, e.end_time, e.all_day);
  });
  if (events.length > 0) run(events);
}

const CalendarSyncService = {
  /**
   * Add a calendar source
   */
  addSource(name, url, owner = 'sir', color = '#00d4ff') {
    const db = getDb();
    const result = db.prepare(
      'INSERT INTO calendar_sources (name, url, owner, color) VALUES (?, ?, ?, ?)'
    ).run(name, url, owner, color);
    return db.prepare('SELECT * FROM calendar_sources WHERE id = ?').get(result.lastInsertRowid);
  },

  /**
   * Get all calendar sources
   */
  getAllSources() {
    const db = getDb();
    return db.prepare('SELECT * FROM calendar_sources ORDER BY created_at DESC').all();
  },

  /**
   * Get sources by owner
   */
  getSourcesByOwner(owner) {
    const db = getDb();
    return db.prepare('SELECT * FROM calendar_sources WHERE owner = ? ORDER BY created_at DESC').all(owner);
  },

  /**
   * Delete a source and its imported events (CASCADE handles events)
   */
  deleteSource(id) {
    const db = getDb();
    db.prepare('DELETE FROM imported_events WHERE source_id = ?').run(id);
    db.prepare('DELETE FROM calendar_sources WHERE id = ?').run(id);
  },

  /**
   * Sync a single source: fetch .ics URL, parse events, upsert into imported_events
   */
  async syncSource(sourceId) {
    const db = getDb();
    const source = db.prepare('SELECT * FROM calendar_sources WHERE id = ?').get(sourceId);
    if (!source || !source.url || source.url === 'file-upload') return 0;

    const data = await ical.async.fromURL(source.url);
    db.prepare('DELETE FROM imported_events WHERE source_id = ?').run(sourceId);
    const events = parseIcalEvents(data, sourceId);
    insertEvents(events);
    db.prepare("UPDATE calendar_sources SET last_synced = datetime('now') WHERE id = ?").run(sourceId);
    return events.length;
  },

  /**
   * Import from .ics file content (string or Buffer)
   * Creates a source with url='file-upload' and imports events
   */
  importFromFile(name, icsContent, owner = 'sir', color = '#00d4ff') {
    const db = getDb();

    // Create source
    const result = db.prepare(
      'INSERT INTO calendar_sources (name, url, owner, color) VALUES (?, ?, ?, ?)'
    ).run(name, 'file-upload', owner, color);
    const sourceId = result.lastInsertRowid;

    // Parse .ics content
    const data = ical.sync.parseICS(icsContent.toString());
    const events = parseIcalEvents(data, sourceId);
    insertEvents(events);

    db.prepare("UPDATE calendar_sources SET last_synced = datetime('now') WHERE id = ?").run(sourceId);

    return { sourceId, count: events.length };
  },

  /**
   * Re-import from .ics file content for existing source
   */
  reimportFromFile(sourceId, icsContent) {
    const db = getDb();
    const source = db.prepare('SELECT * FROM calendar_sources WHERE id = ?').get(sourceId);
    if (!source) return 0;

    db.prepare('DELETE FROM imported_events WHERE source_id = ?').run(sourceId);
    const data = ical.sync.parseICS(icsContent.toString());
    const events = parseIcalEvents(data, sourceId);
    insertEvents(events);

    db.prepare("UPDATE calendar_sources SET last_synced = datetime('now') WHERE id = ?").run(sourceId);
    return events.length;
  },

  /**
   * Sync all sources
   */
  async syncAll() {
    const sources = this.getAllSources();
    let total = 0;
    for (const source of sources) {
      try {
        const count = await this.syncSource(source.id);
        total += count;
        console.log(`📅 Synced "${source.name}": ${count} events`);
      } catch (err) {
        console.error(`📅 Sync failed for "${source.name}":`, err.message);
      }
    }
    return total;
  },

  /**
   * Get all events for a specific date, combined from all sources (JARVIS-created + imported)
   * @param {string} dateStr - "YYYY-MM-DD"
   */
  getEventsForDate(dateStr) {
    const db = getDb();
    const dayStart = dateStr + ' 00:00';
    const dayEnd = dateStr + ' 23:59';

    // JARVIS-created events (range query for multi-day support)
    const jarvisEvents = db.prepare(
      "SELECT id, title, start_time, end_time, 'jarvis' as source, '#00ff88' as color, 'sir' as owner FROM events WHERE start_time <= ? AND end_time >= ?"
    ).all(dayEnd, dayStart);

    // Imported events (range query for multi-day support)
    const imported = db.prepare(`
      SELECT ie.id, ie.title, ie.start_time, ie.end_time, ie.all_day,
             cs.name as source, cs.color, cs.owner
      FROM imported_events ie
      JOIN calendar_sources cs ON ie.source_id = cs.id
      WHERE ie.start_time <= ? AND ie.end_time >= ?
      ORDER BY ie.start_time ASC
    `).all(dayEnd, dayStart);

    return [...jarvisEvents, ...imported].sort((a, b) => a.start_time.localeCompare(b.start_time));
  },

  /**
   * Get all events for a date range (for week/month views)
   * @param {string} startDate - "YYYY-MM-DD"
   * @param {string} endDate - "YYYY-MM-DD"
   */
  getEventsForRange(startDate, endDate) {
    const db = getDb();
    const rangeStart = startDate + ' 00:00';
    const rangeEnd = endDate + ' 23:59';

    const jarvisEvents = db.prepare(
      "SELECT id, title, start_time, end_time, 'jarvis' as source, '#00ff88' as color, 'sir' as owner FROM events WHERE start_time <= ? AND end_time >= ?"
    ).all(rangeEnd, rangeStart);

    const imported = db.prepare(`
      SELECT ie.id, ie.title, ie.start_time, ie.end_time, ie.all_day,
             cs.name as source, cs.color, cs.owner
      FROM imported_events ie
      JOIN calendar_sources cs ON ie.source_id = cs.id
      WHERE ie.start_time <= ? AND ie.end_time >= ?
      ORDER BY ie.start_time ASC
    `).all(rangeEnd, rangeStart);

    return [...jarvisEvents, ...imported].sort((a, b) => a.start_time.localeCompare(b.start_time));
  },

  /**
   * Get availability data for a date
   * Returns { owners: {name: [{start, end, title, color}]}, freeSlots: {name: [{start, end}]} }
   */
  getAvailability(dateStr, startHour = 8, endHour = 22) {
    const events = this.getEventsForDate(dateStr);
    const owners = {};

    // Group events by owner
    for (const evt of events) {
      if (evt.all_day) continue;
      if (!owners[evt.owner]) owners[evt.owner] = [];
      owners[evt.owner].push({
        start: evt.start_time.slice(11, 16),
        end: evt.end_time.slice(11, 16),
        title: evt.title,
        color: evt.color,
        source: evt.source,
      });
    }

    // Calculate free slots for each owner
    const freeSlots = {};
    for (const [owner, evts] of Object.entries(owners)) {
      const sorted = evts.sort((a, b) => a.start.localeCompare(b.start));
      freeSlots[owner] = [];
      let current = `${String(startHour).padStart(2, '0')}:00`;
      const dayEnd = `${String(endHour).padStart(2, '0')}:00`;

      for (const evt of sorted) {
        if (evt.start > current) {
          freeSlots[owner].push({ start: current, end: evt.start });
        }
        if (evt.end > current) current = evt.end;
      }
      if (current < dayEnd) {
        freeSlots[owner].push({ start: current, end: dayEnd });
      }
    }

    return { owners, freeSlots };
  },
};

module.exports = CalendarSyncService;
