const { getDb } = require('../database/init');

/**
 * Lightweight vector store backed by SQLite.
 * Embeddings stored as JSON arrays in the `memories` table.
 * Falls back to keyword search when embeddings aren't available.
 */
const VectorStore = {
  /**
   * Store a memory with optional embedding
   * @param {string} type — 'note' | 'task' | 'event' | 'list_item' | 'conversation'
   * @param {number|null} sourceId — ID from the source table
   * @param {string} content — text content
   * @param {number[]|null} embedding — vector embedding
   */
  store(type, sourceId, content, embedding = null) {
    const db = getDb();
    const embeddingJson = embedding ? JSON.stringify(embedding) : null;
    const stmt = db.prepare(
      'INSERT INTO memories (type, source_id, content, embedding) VALUES (?, ?, ?, ?)'
    );
    const result = stmt.run(type, sourceId, content, embeddingJson);
    return result.lastInsertRowid;
  },

  /**
   * Check if a source is already indexed
   */
  isIndexed(type, sourceId) {
    const db = getDb();
    const row = db.prepare(
      'SELECT id FROM memories WHERE type = ? AND source_id = ?'
    ).get(type, sourceId);
    return !!row;
  },

  /**
   * Semantic search using cosine similarity
   * @param {number[]} queryEmbedding
   * @param {number} topK
   * @param {string|null} typeFilter
   * @returns {Array<{content: string, type: string, score: number}>}
   */
  searchByVector(queryEmbedding, topK = 5, typeFilter = null) {
    const db = getDb();
    let query = 'SELECT * FROM memories WHERE embedding IS NOT NULL';
    const params = [];

    if (typeFilter) {
      query += ' AND type = ?';
      params.push(typeFilter);
    }

    const rows = db.prepare(query).all(...params);

    // Calculate cosine similarity for each row
    const scored = rows.map(row => {
      const embedding = JSON.parse(row.embedding);
      const score = cosineSimilarity(queryEmbedding, embedding);
      return { ...row, score };
    });

    // Sort by similarity descending, return top K
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).map(r => ({
      id: r.id,
      type: r.type,
      source_id: r.source_id,
      content: r.content,
      score: r.score,
    }));
  },

  /**
   * Keyword-based fallback search (when embeddings not available)
   * Uses simple TF scoring — counts matching words
   * @param {string} query
   * @param {number} topK
   * @param {string|null} typeFilter
   */
  searchByKeyword(query, topK = 5, typeFilter = null) {
    const db = getDb();
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);

    let sql = 'SELECT * FROM memories WHERE 1=1';
    const params = [];

    if (typeFilter) {
      sql += ' AND type = ?';
      params.push(typeFilter);
    }

    const rows = db.prepare(sql).all(...params);

    const scored = rows.map(row => {
      const contentLower = row.content.toLowerCase();
      let score = 0;
      for (const word of words) {
        if (contentLower.includes(word)) {
          score += 1;
          // Bonus for exact word boundary match
          const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'i');
          if (regex.test(row.content)) score += 0.5;
        }
      }
      // Normalize by query length
      score = words.length > 0 ? score / words.length : 0;
      return { ...row, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored
      .filter(r => r.score > 0)
      .slice(0, topK)
      .map(r => ({
        id: r.id,
        type: r.type,
        source_id: r.source_id,
        content: r.content,
        score: r.score,
      }));
  },

  /**
   * Get total memory count
   */
  count() {
    const db = getDb();
    return db.prepare('SELECT COUNT(*) as count FROM memories').get().count;
  },

  /**
   * Get count by type
   */
  countByType() {
    const db = getDb();
    return db.prepare(
      'SELECT type, COUNT(*) as count FROM memories GROUP BY type'
    ).all();
  },
};

// ── Math helpers ──────────────────────────────────────────

function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = VectorStore;
