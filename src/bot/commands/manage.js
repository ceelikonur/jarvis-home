'use strict';

const TaskService = require('../../services/TaskService');
const CalendarService = require('../../services/CalendarService');

/**
 * /complete [id]   — mark task complete
 * /delete task [id] — delete a task
 * /delete event [id] — delete an event
 */
function registerManageCommands(bot) {
  // /complete <id>
  bot.command('complete', async (ctx) => {
    const arg = ctx.message.text.replace(/^\/complete\s*/i, '').trim();
    const id = parseInt(arg, 10);

    if (!id || isNaN(id)) {
      return ctx.reply('Usage: /complete <task_id>\nExample: /complete 3');
    }

    try {
      const task = TaskService.complete(id);
      if (!task) {
        return ctx.reply(`⚠️ Task #${id} not found, Sir.`);
      }
      ctx.reply(`✅ Completed [#${task.id}]: "${task.title}"`);
    } catch (err) {
      console.error('Complete command error:', err.message);
      ctx.reply('Something went wrong, Sir.');
    }
  });

  // /delete task <id> OR /delete event <id>
  bot.command('delete', async (ctx) => {
    const arg = ctx.message.text.replace(/^\/delete\s*/i, '').trim();
    const parts = arg.split(/\s+/);

    if (parts.length < 2) {
      return ctx.reply(
        'Usage:\n' +
        '  /delete task <id>\n' +
        '  /delete event <id>'
      );
    }

    const type = parts[0].toLowerCase();
    const id = parseInt(parts[1], 10);

    if (isNaN(id)) {
      return ctx.reply(`⚠️ Invalid ID: "${parts[1]}"`);
    }

    try {
      if (type === 'task') {
        const task = TaskService.delete(id);
        if (!task) return ctx.reply(`⚠️ Task #${id} not found, Sir.`);
        ctx.reply(`🗑️ Task deleted [#${task.id}]: "${task.title}"`);
      } else if (type === 'event') {
        const event = CalendarService.delete(id);
        if (!event) return ctx.reply(`⚠️ Event #${id} not found, Sir.`);
        ctx.reply(`🗑️ Event deleted [#${event.id}]: "${event.title}"`);
      } else {
        ctx.reply(`⚠️ Unknown type: "${type}". Use "task" or "event".`);
      }
    } catch (err) {
      console.error('Delete command error:', err.message);
      ctx.reply('Something went wrong, Sir.');
    }
  });
}

module.exports = { registerManageCommands };
