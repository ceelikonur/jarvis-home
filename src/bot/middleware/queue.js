/**
 * Per-chat sequential queue. Ensures messages from the same chat are processed
 * strictly in order, even when handlers do long async work (AI calls).
 *
 * Why this matters: Telegram queues messages for up to 24h when the bot is
 * offline. When the bot comes back, all queued updates arrive at once.
 * Telegraf's default is to invoke handlers concurrently — meaning 5 queued
 * messages all kick off AI calls in parallel, replies arrive out of order,
 * and Ollama gets hammered with simultaneous requests.
 *
 * This middleware chains handlers per chat: update N+1 waits for update N
 * to finish before its handler runs.
 */

const chatQueues = new Map();

function queueMiddleware() {
  return async (ctx, next) => {
    const chatId = ctx.chat?.id ?? 'global';
    const prev = chatQueues.get(chatId) || Promise.resolve();
    let resolveCurrent;
    const current = new Promise((resolve) => { resolveCurrent = resolve; });
    chatQueues.set(chatId, current);
    try {
      // Wait for the previous handler in this chat to fully complete.
      // Use catch to swallow upstream errors so one bad handler doesn't
      // permanently block the queue.
      await prev.catch(() => {});
      await next();
    } finally {
      resolveCurrent();
      // Cleanup if no newer entry has replaced us.
      if (chatQueues.get(chatId) === current) {
        chatQueues.delete(chatId);
      }
    }
  };
}

module.exports = { queueMiddleware };
