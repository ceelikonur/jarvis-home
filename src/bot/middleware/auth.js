const { config } = require('../../config');

const allowedSet = new Set(config.telegram.allowedUserIds);

/**
 * Authentication middleware — silently rejects any user whose Telegram ID
 * is not in the allowed set. No error message is sent to unauthorized users
 * (security by obscurity).
 */
function authMiddleware(ctx, next) {
  if (ctx.from && allowedSet.has(ctx.from.id)) {
    return next();
  }
  // Silently ignore unauthorized users — log for our awareness
  console.warn(
    `⚠️  Unauthorized access attempt from user ${ctx.from?.id} (@${ctx.from?.username || 'unknown'})`
  );
}

module.exports = { authMiddleware };
