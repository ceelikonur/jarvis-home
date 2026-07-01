const MemoryService = require('../../services/MemoryService');

/**
 * /recall [query] — Semantic search across all memories
 *
 * Examples:
 *   /recall toplantı ne zaman
 *   /recall what did I note about the project
 *   /recall süt
 */
function registerRecallCommand(bot) {
  bot.command('recall', async (ctx) => {
    const query = ctx.message.text.replace(/^\/recall\s*/, '').trim();

    if (!query) {
      return ctx.reply(
        '🔍 What would you like me to recall, sir?\n\n' +
        'Usage: /recall toplantı ne zaman\n' +
        'or: /recall what did I note about...'
      );
    }

    await ctx.reply('🧠 Searching my memory banks...');

    try {
      const results = await MemoryService.recall(query, 8);

      if (results.length === 0) {
        return ctx.reply('I couldn\'t find anything matching that, sir. My memory on this topic is empty.');
      }

      const typeIcons = {
        note: '📝',
        task: '✅',
        event: '📅',
        list_item: '🛒',
        conversation: '💬',
      };

      const formatted = results.map((r, i) => {
        const icon = typeIcons[r.type] || '•';
        const score = Math.round(r.score * 100);
        return `${i + 1}. ${icon} ${r.content}\n   Match: ${score}%`;
      }).join('\n\n');

      ctx.reply(`🔍 Found ${results.length} memories, sir:\n\n${formatted}`);
    } catch (err) {
      console.error('Recall error:', err);
      ctx.reply('I had trouble searching my memory, sir.');
    }
  });
}

module.exports = { registerRecallCommand };
