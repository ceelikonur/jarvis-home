const { Telegraf } = require('telegraf');
const { config } = require('../config');
const { authMiddleware } = require('./middleware/auth');
const { queueMiddleware } = require('./middleware/queue');
const { registerStartCommand } = require('./commands/start');
const { registerTaskCommand } = require('./commands/task');
const { registerTasksCommand } = require('./commands/tasks');
const { registerEventCommand } = require('./commands/event');
const { registerNotesCommand } = require('./commands/notes');
const { registerListCommands } = require('./commands/list');
const { registerRecallCommand } = require('./commands/recall');
const { registerAskCommand } = require('./commands/ask');
const { registerStatusCommand } = require('./commands/status');
const { registerRemindCommand } = require('./commands/remind');
const { registerManageCommands } = require('./commands/manage');
const { registerCalendarSyncCommand } = require('./commands/calendar');
const { registerHelpCommand } = require('./commands/help');
const { registerAnyListCommand } = require('./commands/anylist');
const { registerPlanCommand } = require('./commands/plan');
const budgetCommands = require('./commands/budget');
const { registerTextHandler } = require('./handlers/text');

function createBot() {
  const bot = new Telegraf(config.telegram.botToken, { handlerTimeout: 300_000 });

  // Global auth middleware — runs before every update
  bot.use(authMiddleware);

  // Per-chat sequential queue — guarantees in-order processing of messages
  // that piled up while the bot was offline (Telegram queues for ~24h).
  bot.use(queueMiddleware());

  // Register commands (order matters — specific before generic)
  registerStartCommand(bot);
  registerStatusCommand(bot);
  registerTaskCommand(bot);
  registerTasksCommand(bot);
  registerEventCommand(bot);
  registerNotesCommand(bot);
  registerListCommands(bot);
  registerRecallCommand(bot);
  registerAskCommand(bot);
  registerRemindCommand(bot);
  registerManageCommands(bot);
  registerCalendarSyncCommand(bot);
  registerHelpCommand(bot);
  registerAnyListCommand(bot);
  registerPlanCommand(bot);
  budgetCommands.register(bot);

  // Register default handlers (must be last — catch-all)
  registerTextHandler(bot);

  return bot;
}

module.exports = { createBot };
