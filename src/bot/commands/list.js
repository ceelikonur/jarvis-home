const ListService = require('../../services/ListService');
const { Markup } = require('telegraf');

/**
 * List management commands:
 *
 *   /list                          — Show all lists
 *   /list alışveriş                — Show items in "alışveriş" list
 *   /list alışveriş süt, ekmek    — Add items to list
 *   /shop süt, ekmek, yumurta     — Shortcut for /list alışveriş
 *   /watch Breaking Bad            — Shortcut for /list izleme
 *   /read Dune                     — Shortcut for /list okuma
 *   /newlist [name] [icon]         — Create a custom list
 *   /clearlist [name]              — Clear checked items from a list
 */
function registerListCommands(bot) {

  // ── /list — View all lists, or interact with a specific list ──
  bot.command('list', (ctx) => {
    const args = ctx.message.text.replace(/^\/list\s*/, '').trim();

    if (!args) {
      return showAllLists(ctx);
    }

    // Check if there are items to add (comma or newline separated)
    const firstSpace = args.indexOf(' ');
    if (firstSpace === -1) {
      // Just a list name — show its items
      return showList(ctx, args);
    }

    const listName = args.substring(0, firstSpace).trim();
    const itemsText = args.substring(firstSpace + 1).trim();

    if (!itemsText) {
      return showList(ctx, listName);
    }

    // Parse items: comma-separated or newline-separated
    const items = itemsText
      .split(/[,\n]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    return addItemsToList(ctx, listName, items);
  });

  // ── /shop — Shortcut for alışveriş ──
  bot.command('shop', (ctx) => {
    const text = ctx.message.text.replace(/^\/shop\s*/, '').trim();
    if (!text) {
      return showList(ctx, 'alışveriş');
    }
    const items = text.split(/[,\n]+/).map(s => s.trim()).filter(s => s.length > 0);
    return addItemsToList(ctx, 'alışveriş', items);
  });

  // ── /watch — Shortcut for izleme ──
  bot.command('watch', (ctx) => {
    const text = ctx.message.text.replace(/^\/watch\s*/, '').trim();
    if (!text) {
      return showList(ctx, 'izleme');
    }
    const items = text.split(/[,\n]+/).map(s => s.trim()).filter(s => s.length > 0);
    return addItemsToList(ctx, 'izleme', items);
  });

  // ── /read — Shortcut for okuma ──
  bot.command('read', (ctx) => {
    const text = ctx.message.text.replace(/^\/read\s*/, '').trim();
    if (!text) {
      return showList(ctx, 'okuma');
    }
    const items = text.split(/[,\n]+/).map(s => s.trim()).filter(s => s.length > 0);
    return addItemsToList(ctx, 'okuma', items);
  });

  // ── /newlist — Create a custom list ──
  bot.command('newlist', (ctx) => {
    const args = ctx.message.text.replace(/^\/newlist\s*/, '').trim();
    if (!args) {
      return ctx.reply('Usage: /newlist grocery-store 🏪\nor: /newlist movies');
    }

    const parts = args.split(/\s+/);
    const name = parts[0];
    const icon = parts[1] || '📋';

    try {
      const list = ListService.createList(name, icon);
      ctx.reply(`${list.icon} List "${list.name}" is ready, sir.`);
    } catch (err) {
      console.error('Error creating list:', err);
      ctx.reply('I had trouble creating that list, sir.');
    }
  });

  // ── /clearlist — Clear checked items ──
  bot.command('clearlist', (ctx) => {
    const name = ctx.message.text.replace(/^\/clearlist\s*/, '').trim();
    if (!name) {
      return ctx.reply('Usage: /clearlist alışveriş');
    }

    const list = ListService.findList(name);
    if (!list) {
      return ctx.reply(`❌ List "${name}" not found, sir.`);
    }

    const cleared = ListService.clearChecked(list.id);
    ctx.reply(`🧹 Cleared ${cleared} checked item(s) from ${list.icon} ${list.name}.`);
  });

  // ── Inline keyboard callback: toggle item ──
  bot.action(/^toggle_item_(\d+)_(\d+)$/, (ctx) => {
    const itemId = Number(ctx.match[1]);
    const listId = Number(ctx.match[2]);

    try {
      const item = ListService.toggleItem(itemId);
      if (!item) {
        return ctx.answerCbQuery('Item not found.');
      }

      const status = item.checked ? '✅' : '⬜';
      ctx.answerCbQuery(`${item.content} — ${item.checked ? 'checked' : 'unchecked'}`);

      // Refresh the list view
      refreshListMessage(ctx, listId);
    } catch (err) {
      console.error('Error toggling item:', err);
      ctx.answerCbQuery('Error updating item.');
    }
  });
}

// ── Helper Functions ──────────────────────────────────────

function showAllLists(ctx) {
  try {
    const lists = ListService.getAllLists();
    if (lists.length === 0) {
      return ctx.reply('No lists yet, sir. Create one with /newlist [name]');
    }

    const text = lists.map(l => {
      const count = l.unchecked_items || 0;
      const countText = count > 0 ? ` (${count} item${count > 1 ? 's' : ''})` : ' (empty)';
      return `${l.icon} /${l.name === 'alışveriş' ? 'shop' : `list ${l.name}`}${countText}`;
    }).join('\n');

    ctx.reply(`📋 Your lists, sir:\n\n${text}`);
  } catch (err) {
    console.error('Error showing lists:', err);
    ctx.reply('I had trouble fetching your lists, sir.');
  }
}

function showList(ctx, listName) {
  try {
    const list = ListService.findList(listName);
    if (!list) {
      return ctx.reply(
        `❌ List "${listName}" not found, sir.\n\n` +
        `Create it with: /newlist ${listName}`
      );
    }

    const items = ListService.getAllItems(list.id);
    if (items.length === 0) {
      return ctx.reply(`${list.icon} ${list.name} is empty, sir.`);
    }

    const text = items.map((item, i) => {
      const check = item.checked ? '✅' : '⬜';
      const strike = item.checked ? `~${item.content}~` : item.content;
      return `${check} ${strike}`;
    }).join('\n');

    // Inline buttons to toggle items
    const buttons = items
      .filter(item => !item.checked)
      .map(item => [
        Markup.button.callback(`✅ ${item.content.substring(0, 30)}`, `toggle_item_${item.id}_${list.id}`)
      ]);

    const uncheckedCount = items.filter(i => !i.checked).length;
    const checkedCount = items.filter(i => i.checked).length;
    const summary = `\n\n📊 ${uncheckedCount} remaining, ${checkedCount} done`;

    if (buttons.length > 0) {
      ctx.reply(
        `${list.icon} ${list.name}:\n\n${text}${summary}`,
        Markup.inlineKeyboard(buttons)
      );
    } else {
      ctx.reply(`${list.icon} ${list.name}:\n\n${text}${summary}\n\n🎉 All done, sir!`);
    }
  } catch (err) {
    console.error('Error showing list:', err);
    ctx.reply('I had trouble fetching that list, sir.');
  }
}

function addItemsToList(ctx, listName, items) {
  try {
    // Auto-create the list if it doesn't exist
    let list = ListService.findList(listName);
    if (!list) {
      list = ListService.createList(listName);
    }

    const added = ListService.addItems(list.id, items);
    const itemList = added.map(i => `  • ${i.content}`).join('\n');

    ctx.reply(
      `${list.icon} Added ${added.length} item(s) to ${list.name}:\n\n${itemList}`
    );
  } catch (err) {
    console.error('Error adding items:', err);
    ctx.reply('I had trouble adding those items, sir.');
  }
}

function refreshListMessage(ctx, listId) {
  try {
    const db = require('../../database/init').getDb();
    const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(listId);
    if (!list) return;

    const items = ListService.getAllItems(listId);

    const text = items.map(item => {
      const check = item.checked ? '✅' : '⬜';
      const strike = item.checked ? `~${item.content}~` : item.content;
      return `${check} ${strike}`;
    }).join('\n');

    const buttons = items
      .filter(item => !item.checked)
      .map(item => [
        Markup.button.callback(`✅ ${item.content.substring(0, 30)}`, `toggle_item_${item.id}_${list.id}`)
      ]);

    const uncheckedCount = items.filter(i => !i.checked).length;
    const checkedCount = items.filter(i => i.checked).length;
    const summary = `\n\n📊 ${uncheckedCount} remaining, ${checkedCount} done`;

    if (buttons.length > 0) {
      ctx.editMessageText(
        `${list.icon} ${list.name}:\n\n${text}${summary}`,
        Markup.inlineKeyboard(buttons)
      );
    } else {
      ctx.editMessageText(
        `${list.icon} ${list.name}:\n\n${text}${summary}\n\n🎉 All done, sir!`
      );
    }
  } catch (err) {
    console.error('Error refreshing list:', err);
  }
}

module.exports = { registerListCommands };
