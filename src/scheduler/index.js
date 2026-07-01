const cron = require('node-cron');
const TaskService = require('../services/TaskService');
const CalendarService = require('../services/CalendarService');
const CalendarSyncService = require('../services/CalendarSyncService');
const ListService = require('../services/ListService');
const TimeboxService = require('../services/TimeboxService');
const { getDb } = require('../database/init');
const { config } = require('../config');
const MSCalendarService = require('../services/MSCalendarService');

let botInstance = null;

// Track sent reminders to avoid duplicates (resets on restart)
const sent = new Set();

/**
 * Initialize scheduler with bot instance
 * @param {import('telegraf').Telegraf} bot
 */
function init(bot) {
  botInstance = bot;

  // Morning briefing — every day at 08:00 local time
  cron.schedule('0 8 * * *', sendMorningBriefing, { timezone: config.timezone });

  // Weekly summary — every Sunday at 20:00 local time
  cron.schedule('0 20 * * 0', sendWeeklySummary, { timezone: config.timezone });

  // Event reminders — every 5 minutes
  cron.schedule('*/5 * * * *', checkEventReminders);

  // Task due reminders — every 30 minutes
  cron.schedule('*/30 * * * *', checkTaskReminders);

  // Timebox slot-start pings — every minute (lightweight DB scan)
  cron.schedule('* * * * *', checkTimeboxStarts);

  // Calendar sync — every 30 minutes
  cron.schedule('*/30 * * * *', syncCalendars);

  console.log('⏰ Scheduler active — reminders enabled.');
}

async function send(text) {
  if (!botInstance) return;
  // Broadcast to every authorized household member.
  // Use for real-time event-driven notifications (event/task/timebox pings).
  for (const userId of config.telegram.allowedUserIds) {
    try {
      await botInstance.telegram.sendMessage(userId, text, {
        parse_mode: 'Markdown',
      });
    } catch (err) {
      console.error(`Scheduler send error to ${userId}:`, err.message);
    }
  }
}

async function sendPrimary(text) {
  // Send only to the primary user — for daily/weekly summary reports that
  // would be noise for the secondary household member.
  if (!botInstance) return;
  const target = config.telegram.allowedUserIds[0];
  if (!target) return;
  try {
    await botInstance.telegram.sendMessage(target, text, {
      parse_mode: 'Markdown',
    });
  } catch (err) {
    console.error(`Scheduler sendPrimary error to ${target}:`, err.message);
  }
}

async function sendMorningBriefing() {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // Use active tasks only — dormant recurring (e.g., due 40 days from now) stay quiet.
  const activeTasks = TaskService.getActive();
  const todayTasks = activeTasks.filter(t => t.due_date && t.due_date.startsWith(todayStr));
  const overdue = activeTasks.filter(t => {
    if (!t.due_date) return false;
    return new Date(t.due_date.replace(' ', 'T')) < today;
  });
  // Recurring tasks now in their lead window but not due today — "yaklaşan rutinler"
  const upcomingRecurring = activeTasks.filter(t =>
    t.recurrence_days
    && t.due_date
    && !t.due_date.startsWith(todayStr)
    && new Date(t.due_date.replace(' ', 'T')) >= today
  );

  const upcomingEvents = CalendarService.getUpcoming().slice(0, 5);
  const todayEvents = upcomingEvents.filter(e => e.start_time.startsWith(todayStr));

  const shopping = (() => {
    const list = ListService.findList('alışveriş');
    if (!list) return [];
    return ListService.getUncheckedItems(list.id);
  })();

  let msg = `☀️ *Günaydın, Sir. ${todayStr} günlük brifing:*\n\n`;

  if (overdue.length > 0) {
    msg += `🔴 *Gecikmiş görevler (${overdue.length}):*\n`;
    overdue.forEach(t => { msg += `• ${t.title}\n`; });
    msg += '\n';
  }

  if (todayTasks.length > 0) {
    msg += `✅ *Bugün bitirilmeli (${todayTasks.length}):*\n`;
    todayTasks.forEach(t => {
      const recur = t.recurrence_days ? ' 🔁' : '';
      msg += `• ${t.title}${recur}${t.due_date ? ` — ${t.due_date.slice(11, 16)}` : ''}\n`;
    });
    msg += '\n';
  } else if (activeTasks.length > 0) {
    msg += `📋 Toplam ${activeTasks.length} aktif görev var.\n\n`;
  } else {
    msg += `✅ Görev listesi temiz, Sir.\n\n`;
  }

  if (upcomingRecurring.length > 0) {
    msg += `🔁 *Yaklaşan rutinler:*\n`;
    upcomingRecurring.forEach(t => {
      msg += `• ${t.title} — ${t.due_date.slice(0, 10)}\n`;
    });
    msg += '\n';
  }

  if (todayEvents.length > 0) {
    msg += `📅 *Bugünkü etkinlikler:*\n`;
    todayEvents.forEach(e => { msg += `• ${e.title} — ${e.start_time.slice(11, 16)}\n`; });
    msg += '\n';
  }

  if (shopping.length > 0) {
    msg += `🛒 Alışveriş listesinde ${shopping.length} ürün var.`;
  }

  // Daily report — primary user only (skip household members)
  await sendPrimary(msg);
}

async function checkEventReminders() {
  const now = new Date();
  const upcoming = CalendarService.getUpcoming();

  for (const event of upcoming) {
    const start = new Date(event.start_time.replace(' ', 'T'));
    const diffMin = (start - now) / 60000;

    // 15 minute warning
    if (diffMin > 0 && diffMin <= 15) {
      const key = `event-15m-${event.id}-${start.toDateString()}`;
      if (!sent.has(key)) {
        sent.add(key);
        await send(`⏰ *${Math.round(diffMin)} dakika içinde:* "${event.title}"`);
      }
    }

    // 1 hour warning
    if (diffMin > 55 && diffMin <= 65) {
      const key = `event-1h-${event.id}-${start.toDateString()}`;
      if (!sent.has(key)) {
        sent.add(key);
        await send(`🔔 *1 saat sonra:* "${event.title}" — ${event.start_time.slice(11, 16)}`);
      }
    }
  }
}

async function checkTimeboxStarts() {
  try {
    // Find any timebox starting in the next ~90 seconds (covers cron drift).
    const due = TimeboxService.getStartingSoon(90);
    for (const tb of due) {
      const startHHMM = tb.start_time.slice(11, 16);
      const endHHMM = tb.end_time.slice(11, 16);
      const dur = Math.round(
        (new Date(tb.end_time.replace(' ', 'T')) - new Date(tb.start_time.replace(' ', 'T'))) / 60000
      );
      const taskTag = tb.task_id ? ` (görev #${tb.task_id})` : '';
      await send(`🟢 *Şimdi başlıyor:* "${tb.title}"${taskTag}\n⏱ ${startHHMM}–${endHHMM} · ${dur} dakika`);
      TimeboxService.markNotified(tb.id);
    }
  } catch (err) {
    console.error('checkTimeboxStarts error:', err.message);
  }
}

async function checkTaskReminders() {
  const now = new Date();
  const tasks = TaskService.getPending();

  for (const task of tasks) {
    if (!task.due_date) continue;
    const due = new Date(task.due_date.replace(' ', 'T'));
    const diffMin = (due - now) / 60000;

    // 30 minute warning
    if (diffMin > 0 && diffMin <= 30) {
      const key = `task-30m-${task.id}`;
      if (!sent.has(key)) {
        sent.add(key);
        await send(`⏰ *Görev ${Math.round(diffMin)} dakika içinde bitirilmeli:* "${task.title}"`);
      }
    }

    // Overdue alert (just passed)
    if (diffMin < 0 && diffMin > -30) {
      const key = `task-overdue-${task.id}`;
      if (!sent.has(key)) {
        sent.add(key);
        await send(`🔴 *Süresi geçmiş görev:* "${task.title}" — ${task.due_date.slice(11, 16)}`);
      }
    }
  }
}

async function sendWeeklySummary() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekAgoStr = weekAgo.toISOString().replace('T', ' ').slice(0, 19);
  const nowStr = now.toISOString().replace('T', ' ').slice(0, 19);

  let completedCount = 0;
  let pendingCount = 0;
  let eventCount = 0;

  try {
    const db = getDb();
    const completed = db.prepare(
      "SELECT COUNT(*) as cnt FROM tasks WHERE status = 'completed' AND created_at >= ?"
    ).get(weekAgoStr);
    completedCount = completed ? completed.cnt : 0;

    const pending = db.prepare(
      "SELECT COUNT(*) as cnt FROM tasks WHERE status = 'pending'"
    ).get();
    pendingCount = pending ? pending.cnt : 0;

    const events = db.prepare(
      'SELECT COUNT(*) as cnt FROM events WHERE start_time >= ? AND start_time <= ?'
    ).get(weekAgoStr, nowStr);
    eventCount = events ? events.cnt : 0;
  } catch (err) {
    console.error('Weekly summary DB error:', err.message);
  }

  const weekStart = weekAgo.toISOString().split('T')[0];
  const weekEnd = now.toISOString().split('T')[0];

  const msg =
    `📊 *Haftalık Özet — ${weekStart} → ${weekEnd}*\n\n` +
    `✅ Bu hafta tamamlanan görevler: *${completedCount}*\n` +
    `📋 Hâlâ bekleyen görevler: *${pendingCount}*\n` +
    `📅 Bu haftaki etkinlikler: *${eventCount}*\n\n` +
    `_Güzel bir hafta geçirdiniz, Sir._`;

  // Weekly report — primary user only (skip household members)
  await sendPrimary(msg);
}

async function syncCalendars() {
  try {
    const count = await CalendarSyncService.syncAll();
    if (count > 0) {
      console.log(`📅 Calendar sync complete: ${count} events imported.`);
    }
  } catch (err) {
    console.error('📅 Calendar sync error:', err.message);
  }

  // Also sync MS Calendar if authenticated
  try {
    if (MSCalendarService.isAuthenticated()) {
      const msCount = await MSCalendarService.sync();
      if (msCount > 0) {
        console.log(`📅 MS Calendar sync complete: ${msCount} events imported.`);
      }
    }
  } catch (err) {
    console.error('📅 MS Calendar sync error:', err.message);
  }
}

module.exports = { init };
