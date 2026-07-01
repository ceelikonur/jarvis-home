const TimeboxService = require('../../services/TimeboxService');
const CalendarService = require('../../services/CalendarService');

const STATUS_ICON = {
  planned: '⏳',
  done: '✅',
  skipped: '⊘',
};

/**
 * /plan — show today's micro-plan: timeboxes + immovable events
 */
function registerPlanCommand(bot) {
  bot.command('plan', (ctx) => {
    try {
      const today = TimeboxService.todayDateOnly();
      const boxes = TimeboxService.getByDate(today);
      const stats = TimeboxService.getDailyStats(today);

      // Today's events from local events table (calendar imports excluded for terseness;
      // the web /plan view shows everything)
      const events = CalendarService.getAll().filter(e => e.start_time && e.start_time.startsWith(today));

      if (boxes.length === 0 && events.length === 0) {
        return ctx.reply(
          `📋 *Bugünkü plan boş, sir.*\n\nWeb \`/plan\` sayfasından box ekleyebilirsiniz, ya da AI'a planlamasını söyleyebilirsiniz: \`/ask bugünü planla\``,
          { parse_mode: 'Markdown' }
        );
      }

      // Merge events + boxes, sort by start
      const items = [
        ...events.map(e => ({
          type: 'event',
          start: e.start_time,
          end: e.end_time,
          title: e.title,
          status: 'event',
        })),
        ...boxes.map(b => ({
          type: 'box',
          start: b.start_time,
          end: b.end_time,
          title: b.title,
          status: b.status,
          id: b.id,
        })),
      ].sort((a, b) => a.start.localeCompare(b.start));

      let msg = `📋 *Bugünkü plan — ${today}*\n`;
      if (stats.total > 0) {
        msg += `_${stats.done} tamamlandı · ${stats.planned} planlanan · ${stats.skipped} atlandı_\n`;
      }
      msg += '\n';

      for (const it of items) {
        const time = `${it.start.slice(11, 16)}–${it.end.slice(11, 16)}`;
        if (it.type === 'event') {
          msg += `📅 *${time}*  _${escapeMd(it.title)}_  (etkinlik)\n`;
        } else {
          const icon = STATUS_ICON[it.status] || '⏳';
          msg += `${icon} *${time}*  ${escapeMd(it.title)}  \`#${it.id}\`\n`;
        }
      }

      msg += `\nDetaylı görünüm için web \`/plan\` sayfasına bakın.`;

      ctx.reply(msg, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('Error in /plan command:', err);
      ctx.reply('Plan getirme sırasında bir sorun oldu, sir.');
    }
  });
}

function escapeMd(s) {
  return String(s).replace(/[*_`\[\]]/g, '\\$&');
}

module.exports = { registerPlanCommand };
