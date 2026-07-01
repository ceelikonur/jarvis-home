const AIService = require('../../services/AIService');
const MemoryService = require('../../services/MemoryService');

/**
 * /start — Welcome message with system status
 */
function registerStartCommand(bot) {
  bot.start(async (ctx) => {
    const name = ctx.from.first_name || 'Sir';
    const aiOnline = await AIService.isAvailable();
    const aiStatus = aiOnline ? '🟢 AI Online' : '🔴 AI Offline';
    const memStats = MemoryService.getStats();

    ctx.reply(
      `Good day, ${name}. I am J.A.R.V.I.S., your personal assistant.\n\n` +
      `${aiStatus} | 🧠 ${memStats.total} memories\n\n` +
      `━━━ Commands ━━━\n\n` +
      `📊 /status — Daily briefing\n` +
      `💬 /ask [text] — Ask me anything (RAG)\n` +
      `🔍 /recall [text] — Search my memory\n` +
      `📝 /task [text] — Create task\n` +
      `📋 /tasks — Pending tasks\n` +
      `📅 /event [text] — Create event\n` +
      `🔍 /notes — Recent notes\n` +
      `🛒 /shop [items] — Shopping list\n` +
      `🎬 /watch [title] — Watch list\n` +
      `📚 /read [title] — Reading list\n` +
      `📋 /list — All lists\n\n` +
      `━━━ Smart Mode ━━━\n\n` +
      `Just type naturally — I'll figure out what you mean.\n` +
      `Questions → I'll answer with context\n` +
      `Tasks → Saved with due dates\n` +
      `Shopping items → Added to list\n\n` +
      `At your service, sir.`
    );
  });
}

module.exports = { registerStartCommand };
