const { getDb } = require('../database/init');

const NoteService = {
  /**
   * Save a new note
   * @param {string} content
   * @returns {{ id: number, content: string, created_at: string }}
   */
  create(content) {
    const db = getDb();
    const stmt = db.prepare('INSERT INTO notes (content) VALUES (?)');
    const result = stmt.run(content);
    return {
      id: result.lastInsertRowid,
      content,
      created_at: new Date().toISOString(),
    };
  },

  /**
   * Get all notes, most recent first
   * @param {number} limit
   * @returns {Array}
   */
  getAll(limit = 50) {
    const db = getDb();
    return db.prepare('SELECT * FROM notes ORDER BY created_at DESC LIMIT ?').all(limit);
  },

  /**
   * Get a single note by ID
   * @param {number} id
   * @returns {object|undefined}
   */
  getById(id) {
    const db = getDb();
    return db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
  },

  /**
   * Delete a note by ID
   * @param {number} id
   * @returns {object|null}
   */
  delete(id) {
    const db = getDb();
    const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
    if (!note) return null;
    db.prepare('DELETE FROM notes WHERE id = ?').run(id);
    return note;
  },
};

module.exports = NoteService;
