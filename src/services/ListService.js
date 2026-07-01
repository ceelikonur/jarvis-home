const { getDb } = require('../database/init');

const ListService = {
  // ── List CRUD ──────────────────────────────────────────

  /**
   * Create a new list
   * @param {string} name
   * @param {string} icon
   */
  createList(name, icon = '📋') {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM lists WHERE name = ? COLLATE NOCASE').get(name);
    if (existing) return existing;

    const stmt = db.prepare('INSERT INTO lists (name, icon) VALUES (?, ?)');
    const result = stmt.run(name.toLowerCase(), icon);
    return { id: result.lastInsertRowid, name: name.toLowerCase(), icon };
  },

  /**
   * Get all lists with item counts
   */
  getAllLists() {
    const db = getDb();
    return db.prepare(`
      SELECT l.*,
        COUNT(li.id) AS total_items,
        SUM(CASE WHEN li.checked = 0 THEN 1 ELSE 0 END) AS unchecked_items
      FROM lists l
      LEFT JOIN list_items li ON li.list_id = l.id
      GROUP BY l.id
      ORDER BY l.name ASC
    `).all();
  },

  /**
   * Find a list by name (case-insensitive)
   * @param {string} name
   */
  findList(name) {
    const db = getDb();
    return db.prepare('SELECT * FROM lists WHERE name = ? COLLATE NOCASE').get(name);
  },

  /**
   * Delete a list and all its items
   * @param {number} id
   */
  deleteList(id) {
    const db = getDb();
    db.prepare('DELETE FROM lists WHERE id = ?').run(id);
  },

  // ── Item CRUD ──────────────────────────────────────────

  /**
   * Add an item to a list
   * @param {number} listId
   * @param {string} content
   */
  addItem(listId, content) {
    const db = getDb();
    const stmt = db.prepare('INSERT INTO list_items (list_id, content) VALUES (?, ?)');
    const result = stmt.run(listId, content);
    return { id: result.lastInsertRowid, list_id: listId, content, checked: 0 };
  },

  /**
   * Add multiple items to a list at once
   * @param {number} listId
   * @param {string[]} items
   */
  addItems(listId, items) {
    const db = getDb();
    const stmt = db.prepare('INSERT INTO list_items (list_id, content) VALUES (?, ?)');
    const insertMany = db.transaction((entries) => {
      const results = [];
      for (const content of entries) {
        const result = stmt.run(listId, content.trim());
        results.push({ id: result.lastInsertRowid, list_id: listId, content: content.trim(), checked: 0 });
      }
      return results;
    });
    return insertMany(items);
  },

  /**
   * Get all unchecked items in a list
   * @param {number} listId
   */
  getUncheckedItems(listId) {
    const db = getDb();
    return db.prepare(
      'SELECT * FROM list_items WHERE list_id = ? AND checked = 0 ORDER BY created_at ASC'
    ).all(listId);
  },

  /**
   * Get all items in a list (checked and unchecked)
   * @param {number} listId
   */
  getAllItems(listId) {
    const db = getDb();
    return db.prepare(
      'SELECT * FROM list_items WHERE list_id = ? ORDER BY checked ASC, created_at ASC'
    ).all(listId);
  },

  /**
   * Check/uncheck an item
   * @param {number} itemId
   */
  toggleItem(itemId) {
    const db = getDb();
    const item = db.prepare('SELECT * FROM list_items WHERE id = ?').get(itemId);
    if (!item) return null;

    const newChecked = item.checked ? 0 : 1;
    db.prepare('UPDATE list_items SET checked = ? WHERE id = ?').run(newChecked, itemId);
    return { ...item, checked: newChecked };
  },

  /**
   * Remove a single item
   * @param {number} itemId
   */
  removeItem(itemId) {
    const db = getDb();
    const item = db.prepare('SELECT * FROM list_items WHERE id = ?').get(itemId);
    if (!item) return null;
    db.prepare('DELETE FROM list_items WHERE id = ?').run(itemId);
    return item;
  },

  /**
   * Clear all checked items from a list
   * @param {number} listId
   */
  clearChecked(listId) {
    const db = getDb();
    const result = db.prepare('DELETE FROM list_items WHERE list_id = ? AND checked = 1').run(listId);
    return result.changes;
  },

  /**
   * Clear all items from a list
   * @param {number} listId
   */
  clearAll(listId) {
    const db = getDb();
    const result = db.prepare('DELETE FROM list_items WHERE list_id = ?').run(listId);
    return result.changes;
  },
};

module.exports = ListService;
