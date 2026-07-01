const VectorStore = require('./VectorStore');
const NoteService = require('./NoteService');
const TaskService = require('./TaskService');
const CalendarService = require('./CalendarService');
const ListService = require('./ListService');
const { getDb } = require('../database/init');

let embeddingsFn = null; // Set by init() — async function that returns embeddings
let saveConversationCount = 0; // For pruning every 20 saves

const MemoryService = {
  /**
   * Initialize with an embedding function (from AIService)
   * @param {function} embedFn — async (text) => number[] | null
   */
  init(embedFn) {
    embeddingsFn = embedFn;
  },

  /**
   * Index a single piece of content into the vector store
   * @param {string} type
   * @param {number|null} sourceId
   * @param {string} content
   */
  async index(type, sourceId, content) {
    if (!content || content.trim().length === 0) return;

    // Skip if already indexed
    if (sourceId && VectorStore.isIndexed(type, sourceId)) return;

    let embedding = null;
    if (embeddingsFn) {
      try {
        embedding = await embeddingsFn(content);
      } catch (err) {
        console.warn('Embedding generation failed, storing without vector:', err.message);
      }
    }

    VectorStore.store(type, sourceId, content, embedding);
  },

  /**
   * Index all existing data from the database (run on startup)
   */
  async indexAll() {
    console.log('🧠 Indexing memories...');
    let indexed = 0;

    // Index notes
    const notes = NoteService.getAll(500);
    for (const note of notes) {
      if (!VectorStore.isIndexed('note', note.id)) {
        await this.index('note', note.id, note.content);
        indexed++;
      }
    }

    // Index tasks
    const tasks = TaskService.getAll();
    for (const task of tasks) {
      if (!VectorStore.isIndexed('task', task.id)) {
        const text = task.due_date
          ? `Task: ${task.title} (due: ${task.due_date}, status: ${task.status})`
          : `Task: ${task.title} (status: ${task.status})`;
        await this.index('task', task.id, text);
        indexed++;
      }
    }

    // Index events
    const events = CalendarService.getAll();
    for (const evt of events) {
      if (!VectorStore.isIndexed('event', evt.id)) {
        const text = `Event: ${evt.title} (${evt.start_time} → ${evt.end_time})`;
        await this.index('event', evt.id, text);
        indexed++;
      }
    }

    // Index list items
    const lists = ListService.getAllLists();
    for (const list of lists) {
      const items = ListService.getAllItems(list.id);
      for (const item of items) {
        if (!VectorStore.isIndexed('list_item', item.id)) {
          const text = `${list.name} list: ${item.content}`;
          await this.index('list_item', item.id, text);
          indexed++;
        }
      }
    }

    const total = VectorStore.count();
    console.log(`🧠 Memory indexing complete. +${indexed} new, ${total} total memories.`);
  },

  /**
   * Semantic recall — search memories
   * @param {string} query
   * @param {number} topK
   * @param {string|null} typeFilter
   * @returns {Promise<Array>}
   */
  async recall(query, topK = 5, typeFilter = null) {
    // Try vector search first
    if (embeddingsFn) {
      try {
        const queryEmbedding = await embeddingsFn(query);
        if (queryEmbedding) {
          const results = VectorStore.searchByVector(queryEmbedding, topK, typeFilter);
          if (results.length > 0) return results;
        }
      } catch (err) {
        console.warn('Vector search failed, falling back to keyword:', err.message);
      }
    }

    // Fallback to keyword search
    return VectorStore.searchByKeyword(query, topK, typeFilter);
  },

  /**
   * Keep only the last 100 conversations
   */
  pruneConversations() {
    const db = getDb();
    db.prepare(`DELETE FROM conversations WHERE id NOT IN (
      SELECT id FROM conversations ORDER BY created_at DESC LIMIT 100
    )`).run();
  },

  /**
   * Store a conversation turn
   * @param {'user'|'assistant'} role
   * @param {string} content
   */
  saveConversation(role, content) {
    const db = getDb();
    db.prepare('INSERT INTO conversations (role, content) VALUES (?, ?)').run(role, content);
    saveConversationCount++;
    if (saveConversationCount % 20 === 0) {
      this.pruneConversations();
    }
  },

  /**
   * Get recent conversation history
   * @param {number} limit
   */
  getRecentConversations(limit = 10) {
    const db = getDb();
    return db.prepare(
      'SELECT * FROM conversations ORDER BY created_at DESC LIMIT ?'
    ).all(limit).reverse(); // Reverse to get chronological order
  },

  /**
   * Build RAG context string: live DB state + relevant memories + recent chat
   * @param {string} query
   * @returns {Promise<string>}
   */
  async buildContext(query) {
    let context = '';

    // ── Live data: always injected, never stale ──────────────────
    const pendingTasks = TaskService.getAll().filter(t => t.status === 'pending');
    if (pendingTasks.length > 0) {
      context += '=== Pending tasks ===\n';
      for (const t of pendingTasks) {
        const priorityTag = t.priority === 'high' ? ' [HIGH]' : t.priority === 'low' ? ' [LOW]' : '';
        const recurrenceTag = t.recurrence_days ? ` [🔁 her ${t.recurrence_days} gün]` : '';
        context += `• [#${t.id}] ${t.title}${t.due_date ? ` (due: ${t.due_date})` : ''}${priorityTag}${recurrenceTag}\n`;
      }
      context += '\n';
    } else {
      context += '=== Pending tasks ===\n(none)\n\n';
    }

    const lists = ListService.getAllLists();
    if (lists.length > 0) {
      context += '=== Lists ===\n';
      for (const list of lists) {
        const items = ListService.getUncheckedItems(list.id);
        if (items.length > 0) {
          context += `${list.icon} ${list.name}: ${items.map(i => i.content).join(', ')}\n`;
        } else {
          context += `${list.icon} ${list.name}: (empty)\n`;
        }
      }
      context += '\n';
    }

    const now = new Date();
    const upcoming = CalendarService.getAll().filter(e => new Date(e.end_time) >= now).slice(0, 5);
    if (upcoming.length > 0) {
      context += '=== Upcoming events ===\n';
      for (const e of upcoming) {
        context += `• ${e.title} — ${e.start_time} → ${e.end_time}\n`;
      }
      context += '\n';
    }

    // ── Semantic memories: notes, past conversations ─────────────
    const memories = await this.recall(query, 5);
    const relevantMems = memories.filter(m => !['task', 'list_item', 'event'].includes(m.type));
    if (relevantMems.length > 0) {
      context += '=== Relevant notes & memory ===\n';
      for (const mem of relevantMems) {
        const typeLabel = { note: '📝', conversation: '💬' };
        context += `${typeLabel[mem.type] || '•'} ${mem.content}\n`;
      }
      context += '\n';
    }

    // ── Recent conversation ──────────────────────────────────────
    const recentChat = this.getRecentConversations(6);
    if (recentChat.length > 0) {
      context += '=== Recent conversation ===\n';
      for (const msg of recentChat) {
        context += `${msg.role === 'user' ? 'Sir' : 'JARVIS'}: ${msg.content}\n`;
      }
      context += '\n';
    }

    return context;
  },

  /**
   * Get stats for /status command
   */
  getStats() {
    return {
      total: VectorStore.count(),
      byType: VectorStore.countByType(),
    };
  },
};

module.exports = MemoryService;
