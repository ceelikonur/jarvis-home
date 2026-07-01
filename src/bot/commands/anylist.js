const AnyListService = require('../../services/AnyListService');

/**
 * /anylist — AnyList integration
 *
 * Subcommands:
 *   /anylist              — Show all lists with item counts
 *   /anylist <listname>   — Show items in a list
 *   /anylist add <list> <item> — Add item to list
 */
function registerAnyListCommand(bot) {
  bot.command('anylist', async (ctx) => {
    if (!AnyListService.isConnected()) {
      return ctx.reply('📋 AnyList is not connected. Add ANYLIST_EMAIL and ANYLIST_PASSWORD to .env');
    }

    const text = ctx.message.text.replace(/^\/anylist\s*/, '').trim();

    // /anylist add <list> <item>
    if (text.toLowerCase().startsWith('add ')) {
      const rest = text.slice(4).trim();
      // Parse: "listname" item  OR  listname item
      const quotedMatch = rest.match(/^"([^"]+)"\s+(.+)$/);
      const simpleMatch = rest.match(/^(\S+)\s+(.+)$/);
      const m = quotedMatch || simpleMatch;

      if (!m) {
        return ctx.reply('Usage: /anylist add <list> <item>\nExample: /anylist add "Grocery List" milk');
      }

      const [, listName, itemName] = m;
      try {
        await AnyListService.addItem(listName, itemName);
        ctx.reply(`✅ Added "${itemName}" to ${listName}, sir.`);
      } catch (err) {
        ctx.reply(`Error: ${err.message}`);
      }
      return;
    }

    // /anylist <listname> — show items
    if (text) {
      try {
        const list = await AnyListService.getListByName(text);
        if (!list) return ctx.reply(`List "${text}" not found, sir.`);

        const unchecked = list.items.filter(i => !i.checked);
        const checked = list.items.filter(i => i.checked);

        let msg = `📋 *${list.name}* (${unchecked.length} items)\n\n`;

        if (unchecked.length === 0 && checked.length === 0) {
          msg += '_List is empty._';
        }

        unchecked.forEach(i => {
          const qty = i.quantity ? ` (${i.quantity})` : '';
          msg += `▫️ ${i.name}${qty}\n`;
        });

        if (checked.length > 0) {
          msg += `\n_Checked (${checked.length}):_\n`;
          checked.forEach(i => {
            msg += `✅ ~${i.name}~\n`;
          });
        }

        ctx.reply(msg, { parse_mode: 'Markdown' });
      } catch (err) {
        ctx.reply(`Error: ${err.message}`);
      }
      return;
    }

    // /anylist — show all lists
    try {
      const lists = await AnyListService.getLists();
      if (lists.length === 0) {
        return ctx.reply('No lists found in AnyList, sir.');
      }

      let msg = `📋 *AnyList* (${lists.length} lists)\n\n`;
      lists.forEach(l => {
        const unchecked = l.items.filter(i => !i.checked).length;
        const total = l.items.length;
        msg += `• *${l.name}* — ${unchecked}/${total} items\n`;
      });
      msg += '\n_Use /anylist <name> to view a list._';

      ctx.reply(msg, { parse_mode: 'Markdown' });
    } catch (err) {
      ctx.reply(`Error loading AnyList: ${err.message}`);
    }
  });
}

module.exports = { registerAnyListCommand };
