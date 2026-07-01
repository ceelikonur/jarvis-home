const AIService = require('../../services/AIService');
const MemoryService = require('../../services/MemoryService');
const ActionExecutor = require('../../services/ActionExecutor');

function registerAskCommand(bot) {
  bot.command('ask', async (ctx) => {
    const question = ctx.message.text.replace(/^\/ask\s*/, '').trim();

    if (!question) {
      return ctx.reply(
        '🤖 Ask me anything, sir.\n\nUsage: /ask bugün ne yapmalıyım?'
      );
    }

    await ctx.sendChatAction('typing');
    const typingInterval = setInterval(() => ctx.sendChatAction('typing').catch(() => {}), 5000);

    try {
      const context = await MemoryService.buildContext(question);
      const { reply, actions } = await AIService.chat(question, context);

      clearInterval(typingInterval);

      if (!reply && actions.length === 0) {
        return ctx.reply('AI şu an erişilemiyor, Sir. Lütfen biraz sonra tekrar deneyin.');
      }

      // Execute declared actions
      let actionSummary = '';
      let updatedState = '';
      if (actions.length > 0) {
        const results = await ActionExecutor.run(actions);
        if (results.length > 0) {
          actionSummary = '\n\n' + results.join('\n');
        }
        // Re-fetch context to show updated state after actions
        try {
          const updatedContext = await MemoryService.buildContext(question);
          updatedState = '\n\n📋 *Updated state:*\n' + updatedContext.slice(0, 500);
        } catch (e) {
          // Non-critical — skip updated state
        }
      }

      // Save conversation
      MemoryService.saveConversation('user', question);
      if (reply) {
        MemoryService.saveConversation('assistant', reply);
        await MemoryService.index('conversation', null, `User asked: ${question}`);
      }

      const fullReply = (reply || '') + actionSummary + (actions.length > 0 ? updatedState : '');
      ctx.reply(fullReply.trim());
    } catch (err) {
      clearInterval(typingInterval);
      console.error('Ask error:', err);
      ctx.reply('Bir hata oluştu, Sir.');
    }
  });
}

module.exports = { registerAskCommand };
