const CalendarSyncService = require('../../services/CalendarSyncService');

/**
 * /cal — Calendar source management and combined availability
 *
 * Subcommands:
 *   /cal add <owner> <name> <url>   — Add a calendar source
 *   /cal list                        — Show all sources
 *   /cal sync                        — Force sync all sources
 *   /cal today                       — Show today's combined schedule
 *   /cal delete <id>                 — Remove a source
 */
function registerCalendarSyncCommand(bot) {
  // Handle .ics file uploads via Telegram
  bot.on('document', async (ctx) => {
    const doc = ctx.message.document;
    if (!doc || !doc.file_name || !doc.file_name.endsWith('.ics')) return;

    try {
      await ctx.reply('📅 .ics dosyası alındı, import ediliyor...');
      const fileLink = await ctx.telegram.getFileLink(doc.file_id);
      const response = await fetch(fileLink.href);
      const buffer = Buffer.from(await response.arrayBuffer());

      const name = doc.file_name.replace('.ics', '');
      const caption = (ctx.message.caption || '').trim();
      const owner = caption.includes('partner') ? 'partner' : 'sir';

      const result = CalendarSyncService.importFromFile(name, buffer, owner);
      ctx.reply(
        `✅ Import complete, Sir.\n\n` +
        `📅 *${name}*\n` +
        `👤 Owner: ${owner}\n` +
        `📊 ${result.count} events imported\n\n` +
        `_Tip: send again to update, or caption with "partner" for partner's calendar._`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      console.error('ICS import error:', err);
      ctx.reply('Error importing .ics file, sir.');
    }
  });

  bot.command('cal', async (ctx) => {
    const text = ctx.message.text.replace(/^\/cal\s*/, '').trim();
    const parts = text.split(/\s+/);
    const sub = (parts[0] || '').toLowerCase();

    // /cal add <owner> <name> <url>
    if (sub === 'add') {
      return handleAdd(ctx, text.slice(4).trim());
    }

    // /cal list
    if (sub === 'list') {
      return handleList(ctx);
    }

    // /cal sync
    if (sub === 'sync') {
      return handleSync(ctx);
    }

    // /cal today
    if (sub === 'today') {
      return handleToday(ctx);
    }

    // /cal delete <id>
    if (sub === 'delete') {
      const id = parseInt(parts[1], 10);
      if (!id) return ctx.reply('Usage: /cal delete <id>');
      return handleDelete(ctx, id);
    }

    // Default: show help
    return ctx.reply(
      `📅 *Calendar Commands*\n\n` +
      `*URL ile ekle:*\n` +
      `/cal add <owner> <name> <url>\n` +
      `  _/cal add sir "Work" https://...basic.ics_\n\n` +
      `*Dosya ile ekle:*\n` +
      `Telegram'dan .ics dosyası gönder\n` +
      `  _Caption: "partner" → partner takvimi olarak ekler_\n\n` +
      `/cal list — Tüm takvim kaynaklarını göster\n` +
      `/cal sync — Hepsini senkronize et\n` +
      `/cal today — Bugünün programı\n` +
      `/cal delete <id> — Kaynağı sil`,
      { parse_mode: 'Markdown' }
    );
  });
}

async function handleAdd(ctx, text) {
  // Parse: <owner> <"name" or name> <url>
  // Supports: sir "Work Calendar" https://...
  // Or:       partner Work https://...
  const match = text.match(/^(\S+)\s+"([^"]+)"\s+(https?:\/\/\S+)$/);
  const matchSimple = text.match(/^(\S+)\s+(\S+)\s+(https?:\/\/\S+)$/);

  const m = match || matchSimple;
  if (!m) {
    return ctx.reply(
      'Usage: /cal add <owner> <"name"> <url>\n\n' +
      'Example: /cal add sir "Work Calendar" https://calendar.google.com/.../basic.ics'
    );
  }

  const [, owner, name, url] = m;

  try {
    const source = CalendarSyncService.addSource(name, url, owner);
    await ctx.reply(
      `✅ Calendar source added, sir.\n\n` +
      `📅 *${source.name}*\n` +
      `👤 Owner: ${source.owner}\n` +
      `🔗 URL: ${url.slice(0, 50)}...\n\n` +
      `Run /cal sync to import events.`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('Error adding calendar source:', err);
    ctx.reply('Error adding calendar source, sir.');
  }
}

async function handleList(ctx) {
  const sources = CalendarSyncService.getAllSources();
  if (sources.length === 0) {
    return ctx.reply('No calendar sources configured yet, sir.\n\nUse /cal add to add one.');
  }

  let msg = `📅 *Calendar Sources (${sources.length})*\n\n`;
  for (const s of sources) {
    const synced = s.last_synced ? s.last_synced.slice(0, 16) : 'never';
    msg += `*#${s.id}* — ${s.name}\n`;
    msg += `  👤 ${s.owner} | 🔄 ${synced}\n\n`;
  }
  ctx.reply(msg, { parse_mode: 'Markdown' });
}

async function handleSync(ctx) {
  await ctx.reply('🔄 Syncing all calendar sources...');
  try {
    const count = await CalendarSyncService.syncAll();
    ctx.reply(`✅ Sync complete. ${count} events imported, sir.`);
  } catch (err) {
    console.error('Calendar sync error:', err);
    ctx.reply('Error during calendar sync, sir.');
  }
}

async function handleToday(ctx) {
  const today = new Date().toISOString().split('T')[0];
  const events = CalendarSyncService.getEventsForDate(today);
  const availability = CalendarSyncService.getAvailability(today);

  if (events.length === 0) {
    return ctx.reply(`📅 No events for today (${today}), sir. The day is free.`);
  }

  let msg = `📅 *Combined Schedule — ${today}*\n\n`;

  // Group by owner
  const byOwner = {};
  for (const evt of events) {
    const owner = evt.owner || 'unknown';
    if (!byOwner[owner]) byOwner[owner] = [];
    byOwner[owner].push(evt);
  }

  for (const [owner, ownerEvents] of Object.entries(byOwner)) {
    msg += `👤 *${owner}*\n`;
    for (const evt of ownerEvents) {
      const time = evt.all_day
        ? 'All day'
        : `${evt.start_time.slice(11, 16)} → ${evt.end_time.slice(11, 16)}`;
      msg += `  • ${time} — ${evt.title} _(${evt.source})_\n`;
    }
    msg += '\n';
  }

  // Show mutual free slots
  const ownerNames = Object.keys(availability.freeSlots);
  if (ownerNames.length >= 2) {
    const [a, b] = ownerNames;
    const slotsA = availability.freeSlots[a] || [];
    const slotsB = availability.freeSlots[b] || [];

    // Find overlapping free slots
    const mutual = [];
    for (const sa of slotsA) {
      for (const sb of slotsB) {
        const start = sa.start > sb.start ? sa.start : sb.start;
        const end = sa.end < sb.end ? sa.end : sb.end;
        if (start < end) mutual.push({ start, end });
      }
    }

    if (mutual.length > 0) {
      msg += `✅ *Both free:*\n`;
      for (const slot of mutual) {
        msg += `  • ${slot.start} → ${slot.end}\n`;
      }
    } else {
      msg += `⚠️ No mutual free time found today.`;
    }
  }

  ctx.reply(msg, { parse_mode: 'Markdown' });
}

async function handleDelete(ctx, id) {
  try {
    CalendarSyncService.deleteSource(id);
    ctx.reply(`✅ Calendar source #${id} deleted, sir.`);
  } catch (err) {
    console.error('Error deleting calendar source:', err);
    ctx.reply('Error deleting that source, sir.');
  }
}

module.exports = { registerCalendarSyncCommand };
