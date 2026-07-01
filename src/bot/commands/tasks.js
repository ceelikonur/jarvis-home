const TaskService = require('../../services/TaskService');
const { Markup } = require('telegraf');

/**
 * /tasks — List pending tasks with inline keyboard buttons to complete them
 */
function registerTasksCommand(bot) {
  bot.command('tasks', (ctx) => {
    try {
      const tasks = TaskService.getPending();

      if (tasks.length === 0) {
        return ctx.reply('No pending tasks, sir. You\'re all caught up. 🎯');
      }

      const taskList = tasks
        .map((t, i) => `${i + 1}. ${t.title}`)
        .join('\n');

      // Build inline keyboard — one "✓ Done" button per task
      const buttons = tasks.map((t) =>
        [Markup.button.callback(`✅ Complete: ${t.title.substring(0, 30)}`, `complete_task_${t.id}`)]
      );

      ctx.reply(
        `📋 Pending tasks, sir:\n\n${taskList}`,
        Markup.inlineKeyboard(buttons)
      );
    } catch (err) {
      console.error('Error fetching tasks:', err);
      ctx.reply('I had trouble fetching your tasks, sir.');
    }
  });

  // Handle the inline keyboard callback for completing tasks
  bot.action(/^complete_task_(\d+)$/, (ctx) => {
    const taskId = Number(ctx.match[1]);

    try {
      const task = TaskService.complete(taskId);
      if (task) {
        ctx.answerCbQuery(`Task "${task.title}" completed!`);
        ctx.editMessageText(
          ctx.callbackQuery.message.text + `\n\n✅ "${task.title}" — marked complete.`
        );
      } else {
        ctx.answerCbQuery('Task not found or already completed.');
      }
    } catch (err) {
      console.error('Error completing task:', err);
      ctx.answerCbQuery('Error completing task.');
    }
  });
}

module.exports = { registerTasksCommand };
