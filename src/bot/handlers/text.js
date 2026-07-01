const NoteService = require('../../services/NoteService');
const TaskService = require('../../services/TaskService');
const CalendarService = require('../../services/CalendarService');
const ListService = require('../../services/ListService');
const AIService = require('../../services/AIService');
const MemoryService = require('../../services/MemoryService');
const ActionExecutor = require('../../services/ActionExecutor');
const Connectors = require('../../connectors');

/**
 * Default text handler — AI classifies free text, then routes:
 *   - shopping items → alışveriş list
 *   - tasks → task with AI due date
 *   - events → calendar event
 *   - questions → JARVIS RAG chat
 *   - everything else → note
 *
 * If AI is offline, falls back to saving as note.
 */
function registerTextHandler(bot) {
  bot.on('text', async (ctx) => {
    const content = ctx.message.text;

    // Skip if it looks like a command
    if (content.startsWith('/')) return;

    try {
      // Classify the message with AI
      const type = await AIService.classifyMessage(content);

      if (type === 'shopping') {
        return handleShopping(ctx, content);
      }

      if (type === 'task') {
        return handleTask(ctx, content);
      }

      if (type === 'event') {
        return handleEvent(ctx, content);
      }

      // Smart-home control — only when a connector is configured; otherwise
      // fall through to the note default (no behaviour change without connectors).
      if (type === 'device' && Connectors.active().length > 0) {
        return handleQuestion(ctx, content);
      }

      if (type === 'question') {
        return handleQuestion(ctx, content);
      }

      // Default: save as note + categorize + index to memory
      const category = await AIService.categorizeNote(content);
      const categoryEmoji = { personal: '👤', work: '💼', idea: '💡', health: '🏥', finance: '💰' }[category] || '📝';
      const noteContent = `[${category}] ${content}`;
      const note = NoteService.create(noteContent);
      await MemoryService.index('note', note.id, noteContent);
      ctx.reply(`${categoryEmoji} Note saved, sir. [${category}]`);
    } catch (err) {
      console.error('Error in text handler:', err);
      try {
        NoteService.create(content);
        ctx.reply('📝 Note saved, sir.');
      } catch (innerErr) {
        console.error('Error saving note fallback:', innerErr);
        ctx.reply('I had trouble saving that, sir.');
      }
    }
  });
}

async function handleShopping(ctx, content) {
  try {
    const items = content
      .replace(/^(alışveriş|market|grocery|shopping)\s*[:;-]?\s*/i, '')
      .split(/[,\n]+|\s+ve\s+|\s+and\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (items.length === 0) {
      NoteService.create(content);
      return ctx.reply('📝 Note saved, sir.');
    }

    let list = ListService.findList('alışveriş');
    if (!list) list = ListService.createList('alışveriş', '🛒');

    const added = ListService.addItems(list.id, items);
    const itemList = added.map(i => `  • ${i.content}`).join('\n');

    // Index to memory
    for (const item of added) {
      await MemoryService.index('list_item', item.id, `alışveriş: ${item.content}`);
    }

    ctx.reply(
      `🛒 Added ${added.length} item(s) to alışveriş:\n\n${itemList}\n\nView: /shop`
    );
  } catch (err) {
    console.error('Error handling shopping:', err);
    NoteService.create(content);
    ctx.reply('📝 Note saved, sir.');
  }
}

async function handleTask(ctx, content) {
  try {
    const parsed = await AIService.parseTask(content);
    let task;

    if (parsed) {
      task = TaskService.create(parsed.title, parsed.due_date);
      let reply = `✅ Task #${task.id} saved, sir.\n\n"${task.title}"`;
      if (task.due_date) reply += `\n📅 Due: ${task.due_date}`;
      ctx.reply(reply);
    } else {
      task = TaskService.create(content);
      ctx.reply(`✅ Saved as task, sir.\n\n"${task.title}"`);
    }

    // Index to memory
    const memText = task.due_date
      ? `Task: ${task.title} (due: ${task.due_date})`
      : `Task: ${task.title}`;
    await MemoryService.index('task', task.id, memText);
  } catch (err) {
    console.error('Error handling task:', err);
    NoteService.create(content);
    ctx.reply('📝 Note saved, sir.');
  }
}

async function handleEvent(ctx, content) {
  try {
    const parsed = await AIService.parseEvent(content);
    if (parsed) {
      const start = new Date(parsed.start_time.replace(' ', 'T'));
      const end = new Date(parsed.end_time.replace(' ', 'T'));

      if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) {
        const event = CalendarService.create(parsed.title, parsed.start_time, parsed.end_time);

        // Index to memory
        await MemoryService.index('event', event.id,
          `Event: ${event.title} (${parsed.start_time} → ${parsed.end_time})`);

        return ctx.reply(
          `📅 Event saved, sir.\n\n"${event.title}"\n🕐 ${parsed.start_time} → ${parsed.end_time}`
        );
      }
    }
    NoteService.create(content);
    ctx.reply('📝 Note saved, sir.');
  } catch (err) {
    console.error('Error handling event:', err);
    NoteService.create(content);
    ctx.reply('📝 Note saved, sir.');
  }
}

async function handleQuestion(ctx, content) {
  let typingInterval;
  try {
    await ctx.sendChatAction('typing');
    typingInterval = setInterval(() => ctx.sendChatAction('typing').catch(() => {}), 5000);
    const context = await MemoryService.buildContext(content);
    const { reply, actions } = await AIService.chat(content, context);
    clearInterval(typingInterval);

    if (!reply && actions.length === 0) {
      NoteService.create(content);
      return ctx.reply('📝 Not kaydedildi, Sir. (AI şu an erişilemiyor)');
    }

    // Execute actions
    let actionSummary = '';
    let updatedState = '';
    if (actions.length > 0) {
      const results = await ActionExecutor.run(actions);
      if (results.length > 0) actionSummary = '\n\n' + results.join('\n');
      // Show updated state after actions
      try {
        const updatedContext = await MemoryService.buildContext(content);
        updatedState = '\n\n📋 *Updated state:*\n' + updatedContext.slice(0, 500);
      } catch (e) {
        // Non-critical
      }
    }

    MemoryService.saveConversation('user', content);
    if (reply) {
      MemoryService.saveConversation('assistant', reply);
      await MemoryService.index('conversation', null, `User asked: ${content}`);
    }

    ctx.reply((reply || '') + actionSummary + (actions.length > 0 ? updatedState : ''));
  } catch (err) {
    clearInterval(typingInterval);
    console.error('Error handling question:', err);
    NoteService.create(content);
    ctx.reply('📝 Not kaydedildi, Sir.');
  }
}

module.exports = { registerTextHandler };
