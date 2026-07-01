'use strict';

/**
 * /remind <time> <message>
 * Examples:
 *   /remind 30m check the oven
 *   /remind 2h call dentist
 *   /remind 10m toplantıya hazırlan
 *   /remind 1d take out trash
 */
function registerRemindCommand(bot) {
  bot.command('remind', async (ctx) => {
    const text = ctx.message.text.replace(/^\/remind\s*/i, '').trim();

    if (!text) {
      return ctx.reply(
        '⏰ Usage: /remind <time> <message>\n\n' +
        'Examples:\n' +
        '  /remind 30m check the oven\n' +
        '  /remind 2h call dentist\n' +
        '  /remind 1d take out trash'
      );
    }

    // Parse time token (e.g. 30m, 2h, 1d)
    const match = text.match(/^(\d+)(m|h|d)\s+(.+)$/i);
    if (!match) {
      return ctx.reply(
        '⏰ Could not parse time, Sir. Use format: /remind <Xm|Xh|Xd> <message>\n\n' +
        'Example: /remind 30m check the oven'
      );
    }

    const amount = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const message = match[3].trim();

    let ms;
    if (unit === 'm') ms = amount * 60 * 1000;
    else if (unit === 'h') ms = amount * 60 * 60 * 1000;
    else if (unit === 'd') ms = amount * 24 * 60 * 60 * 1000;

    const chatId = ctx.chat.id;

    // Friendly display of time
    let display;
    if (unit === 'm') display = `${amount} minute${amount !== 1 ? 's' : ''}`;
    else if (unit === 'h') display = `${amount} hour${amount !== 1 ? 's' : ''}`;
    else display = `${amount} day${amount !== 1 ? 's' : ''}`;

    await ctx.reply(`⏰ Reminder set, Sir. I'll remind you in ${display}: "${message}"`);

    setTimeout(async () => {
      try {
        await bot.telegram.sendMessage(chatId, `⏰ *Reminder:* ${message}`, {
          parse_mode: 'Markdown',
        });
      } catch (err) {
        console.error('Remind send error:', err.message);
      }
    }, ms);
  });
}

module.exports = { registerRemindCommand };
