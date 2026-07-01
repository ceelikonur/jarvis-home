const CalendarService = require('../../services/CalendarService');
const AIService = require('../../services/AIService');

/**
 * /event — Create a calendar event
 *
 * Phase 2: Tries AI natural language parsing first.
 * Falls back to strict regex if AI is unavailable or fails.
 *
 * Examples:
 *   /event yarın saat 3te toplantı var 1 saat sürecek
 *   /event Friday dinner with Ali at 7pm
 *   /event Meeting | 2026-03-25 14:00 | 2026-03-25 15:00   (legacy format still works)
 */
const EVENT_REGEX = /^(.+?)\s*\|\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s*\|\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})$/;

function registerEventCommand(bot) {
  bot.command('event', async (ctx) => {
    const text = ctx.message.text.replace(/^\/event\s*/, '').trim();

    if (!text) {
      return ctx.reply(
        'Please provide event details, sir.\n\n' +
        '🤖 AI mode: /event yarın saat 3te toplantı\n' +
        '📝 Manual mode: /event Meeting | 2026-03-25 14:00 | 2026-03-25 15:00'
      );
    }

    // Try strict regex first (fast path, no AI needed)
    const regexMatch = text.match(EVENT_REGEX);
    if (regexMatch) {
      return handleRegexEvent(ctx, regexMatch);
    }

    // AI-powered natural language parsing
    await ctx.reply('🧠 Parsing...');

    const parsed = await AIService.parseEvent(text);

    if (!parsed) {
      return ctx.reply(
        '❌ I couldn\'t parse that, sir. AI might be offline.\n\n' +
        'Try the manual format:\n' +
        '/event Meeting | 2026-03-25 14:00 | 2026-03-25 15:00'
      );
    }

    // Validate the AI-parsed dates
    const start = new Date(parsed.start_time.replace(' ', 'T'));
    const end = new Date(parsed.end_time.replace(' ', 'T'));

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return ctx.reply('❌ AI returned invalid dates, sir. Please try again or use manual format.');
    }

    if (end <= start) {
      return ctx.reply('❌ End time must be after start time, sir.');
    }

    try {
      const event = CalendarService.create(parsed.title, parsed.start_time, parsed.end_time);
      ctx.reply(
        `📅 Event saved, sir.\n\n` +
        `"${event.title}"\n` +
        `🕐 ${parsed.start_time} → ${parsed.end_time}`
      );
    } catch (err) {
      console.error('Error creating event:', err);
      ctx.reply('I encountered an error saving that event, sir.');
    }
  });
}

/**
 * Handle the legacy pipe-delimited format
 */
function handleRegexEvent(ctx, match) {
  const [, title, startTime, endTime] = match;

  const start = new Date(startTime.replace(' ', 'T'));
  const end = new Date(endTime.replace(' ', 'T'));

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return ctx.reply('❌ Invalid date values, sir. Please check the format.');
  }

  if (end <= start) {
    return ctx.reply('❌ End time must be after start time, sir.');
  }

  try {
    const event = CalendarService.create(title.trim(), startTime, endTime);
    ctx.reply(
      `📅 Event saved, sir.\n\n` +
      `"${event.title}"\n` +
      `🕐 ${startTime} → ${endTime}`
    );
  } catch (err) {
    console.error('Error creating event:', err);
    ctx.reply('I encountered an error saving that event, sir.');
  }
}

module.exports = { registerEventCommand };
