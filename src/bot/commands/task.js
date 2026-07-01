const TaskService = require('../../services/TaskService');
const AIService = require('../../services/AIService');

/**
 * /task [text] — Create a new task
 *
 * Phase 2: AI extracts due dates from natural language.
 *
 * Examples:
 *   /task yarın süt al
 *   /task finish the report by Friday
 *   /task buy groceries              (no date — saved without due_date)
 */
function registerTaskCommand(bot) {
  bot.command('task', async (ctx) => {
    const text = ctx.message.text.replace(/^\/task\s*/, '').trim();

    if (!text) {
      return ctx.reply(
        'Please provide a task description, sir.\n\n' +
        'Examples:\n' +
        '/task yarın süt al\n' +
        '/task finish report by Friday\n' +
        '/task buy groceries'
      );
    }

    try {
      // Try AI parsing for due date extraction
      const parsed = await AIService.parseTask(text);

      let task;
      if (parsed) {
        task = TaskService.create(parsed.title, parsed.due_date);

        let reply = `✅ Task #${task.id} saved, sir.\n\n"${task.title}"`;
        if (task.due_date) {
          reply += `\n📅 Due: ${task.due_date}`;
        }
        ctx.reply(reply);
      } else {
        // Fallback: save as-is without AI parsing
        task = TaskService.create(text);
        ctx.reply(`✅ Task #${task.id} saved, sir.\n\n"${task.title}"`);
      }
    } catch (err) {
      console.error('Error creating task:', err);
      ctx.reply('I encountered an error saving that task, sir. My apologies.');
    }
  });
}

module.exports = { registerTaskCommand };
