'use strict';

const HELP_TEXT = `🤖 *J.A.R.V.I.S. — Command Reference*

──────────────────────────
*General*
/start — Welcome message
/status — Full briefing: tasks, events, shopping, AI status
/help — This help message

──────────────────────────
*AI Conversation*
/ask <question> — Ask JARVIS anything
  _/ask bugün ne yapmalıyım?_
  _/ask what's on my shopping list?_

Free text is auto-classified and handled:
  • Shopping items → alışveriş list
  • Tasks → task with due date
  • Events → calendar entry
  • Questions → JARVIS chat
  • Everything else → note

──────────────────────────
*Tasks*
/task <text> — Create a task
  _/task raporu bitir yarına kadar_
/tasks — List all pending tasks
/complete <id> — Mark task complete
  _/complete 3_
/delete task <id> — Delete a task
  _/delete task 5_

──────────────────────────
*Events / Calendar*
/event <text> — Create a calendar event
  _/event yarın saat 14'te toplantı_

──────────────────────────
*Lists*
/list — Show all lists
/list alışveriş — Show shopping list
/shop — Shortcut for shopping list

──────────────────────────
*Notes*
/notes — Show recent notes
/recall <query> — Semantic search in memory
  _/recall dentist appointment_

──────────────────────────
*Reminders*
/remind <time> <message> — One-shot reminder
  _/remind 30m check the oven_
  _/remind 2h call dentist_
  _/remind 1d take out trash_

──────────────────────────
*Calendar Sync / Availability*
/cal add <owner> <name> <url> — Add calendar source
  _/cal add sir "Work" https://calendar.google.com/.../basic.ics_
/cal list — Show all calendar sources
/cal sync — Force sync all calendars
/cal today — Combined schedule + mutual free time
/cal delete <id> — Remove a calendar source

──────────────────────────
*Budget / Bütçe*
/harcama <tutar> <açıklama> — Hızlı harcama girişi
  _/harcama 45.50 Market alışverişi_
/gelir <tutar> <açıklama> — Gelir girişi
  _/gelir 3500 Maaş_
/bakiye [ay] — Aylık bütçe özeti
  _/bakiye Mart_

──────────────────────────
*Akıllı Ev / Smart Home*
/cihazlar — Bağlı cihazları listele + Aç/Kapat
  _(alias: /devices /isik /lamba)_
  Connector eklemek için: \`npm run configure\` (ör. Govee ampuller)

──────────────────────────
*Manage*
/delete event <id> — Delete an event
  _/delete event 2_

──────────────────────────
_Tip: Just type naturally — JARVIS will figure it out, sir._`;

function registerHelpCommand(bot) {
  bot.command('help', async (ctx) => {
    ctx.reply(HELP_TEXT, { parse_mode: 'Markdown' });
  });
}

module.exports = { registerHelpCommand };
