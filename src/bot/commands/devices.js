const Connectors = require('../../connectors');
const { Markup } = require('telegraf');

/**
 * /cihazlar (aliases: /devices /isik /isiklar /lamba)
 * Lists smart-home devices from every configured connector with inline
 * On/Off buttons. Devices are referenced by a short cache key so callback_data
 * stays within Telegram's 64-byte limit.
 */
function registerDeviceCommands(bot) {
  bot.command(['cihazlar', 'devices', 'isik', 'isiklar', 'lamba'], async (ctx) => {
    try {
      const active = Connectors.active();
      if (active.length === 0) {
        return ctx.reply(
          '🔌 Henüz aktif akıllı-ev connector\'ı yok, sir.\n\n' +
          'Bir connector eklemek için `npm run configure` çalıştırıp seçin ' +
          '(ör. Govee), ya da .env\'e ilgili API anahtarını girin.',
          { parse_mode: 'Markdown' }
        );
      }

      await ctx.sendChatAction('typing');
      const devices = await Connectors.listDevices();
      if (devices.length === 0) {
        return ctx.reply('Connector aktif ama hesabında cihaz bulunamadı, sir.');
      }

      const rows = devices.map((d) => [
        Markup.button.callback(`💡 ${d.name}`.slice(0, 38), `dev_noop_${d.key}`),
        Markup.button.callback('Aç', `dev_on_${d.key}`),
        Markup.button.callback('Kapat', `dev_off_${d.key}`),
      ]);

      ctx.reply(`🏠 Cihazların, sir (${devices.length}):`, Markup.inlineKeyboard(rows));
    } catch (err) {
      console.error('[devices] list error:', err);
      ctx.reply('Cihazları getirirken bir sorun oldu, sir.');
    }
  });

  bot.action(/^dev_(on|off)_(.+)$/, async (ctx) => {
    const action = ctx.match[1];
    const key = ctx.match[2];
    const device = Connectors.deviceByKey(key);
    if (!device) {
      return ctx.answerCbQuery('Liste eskimiş — /cihazlar ile yenile.');
    }
    try {
      await Connectors.control(device, 'power', action === 'on');
      await ctx.answerCbQuery(`${device.name}: ${action === 'on' ? 'açıldı ✅' : 'kapatıldı ⭘'}`);
    } catch (err) {
      console.error('[devices] control error:', err);
      await ctx.answerCbQuery(`Hata: ${err.message}`.slice(0, 190));
    }
  });

  // Device-label button is a no-op (just shows the name).
  bot.action(/^dev_noop_/, (ctx) => ctx.answerCbQuery());
}

module.exports = { registerDeviceCommands };
