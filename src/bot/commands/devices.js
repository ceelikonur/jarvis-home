const Connectors = require('../../connectors');
const { parseColor } = require('../../connectors/base');
const { Markup } = require('telegraf');

/**
 * /cihazlar (aliases: /devices /isik /isiklar /lamba)
 *
 * Lists smart-home devices from every configured connector. Tap a device to
 * open its control panel: On/Off, brightness presets, and colour presets
 * (only the capabilities the device actually supports are shown).
 *
 * Devices are referenced by a short cache key (e.g. "g0") so callback_data
 * stays within Telegram's 64-byte limit. Callback data uses ":" separators:
 *   dev:menu:<key> · dev:pow:<key>:on|off · dev:bri:<key>:<pct> ·
 *   dev:col:<key>:<colorCode> · dev:list
 */

const COLOR_PRESETS = [
  { code: 'red', emoji: '🔴' },
  { code: 'green', emoji: '🟢' },
  { code: 'blue', emoji: '🔵' },
  { code: 'yellow', emoji: '🟡' },
  { code: 'orange', emoji: '🟠' },
  { code: 'purple', emoji: '🟣' },
  { code: 'white', emoji: '⚪' },
];

const BRIGHTNESS_PRESETS = [25, 50, 75, 100];

function listKeyboard(devices) {
  return Markup.inlineKeyboard(
    devices.map((d) => [Markup.button.callback(`💡 ${d.name}`.slice(0, 45), `dev:menu:${d.key}`)])
  );
}

function panelKeyboard(device) {
  const rows = [
    [
      Markup.button.callback('🔆 Aç', `dev:pow:${device.key}:on`),
      Markup.button.callback('⭘ Kapat', `dev:pow:${device.key}:off`),
    ],
  ];
  const caps = device.capabilities || [];
  if (caps.includes('brightness')) {
    rows.push(BRIGHTNESS_PRESETS.map((p) => Markup.button.callback(`${p}%`, `dev:bri:${device.key}:${p}`)));
  }
  if (caps.includes('color')) {
    rows.push(COLOR_PRESETS.map((c) => Markup.button.callback(c.emoji, `dev:col:${device.key}:${c.code}`)));
  }
  rows.push([Markup.button.callback('⬅️ Cihazlar', 'dev:list')]);
  return Markup.inlineKeyboard(rows);
}

function panelText(device) {
  const capLabels = { power: 'aç/kapa', brightness: 'parlaklık', color: 'renk' };
  const caps = (device.capabilities || []).map((c) => capLabels[c] || c).join(' · ') || '—';
  return `💡 *${device.name}*\n${caps}`;
}

function registerDeviceCommands(bot) {
  bot.command(['cihazlar', 'devices', 'isik', 'isiklar', 'lamba'], async (ctx) => {
    try {
      if (Connectors.active().length === 0) {
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
      ctx.reply(`🏠 Cihazların, sir (${devices.length}) — kontrol için birine dokun:`, listKeyboard(devices));
    } catch (err) {
      console.error('[devices] list error:', err);
      ctx.reply('Cihazları getirirken bir sorun oldu, sir.');
    }
  });

  // Open a device's control panel
  bot.action(/^dev:menu:(.+)$/, async (ctx) => {
    const device = Connectors.deviceByKey(ctx.match[1]);
    if (!device) return ctx.answerCbQuery('Liste eskimiş — /cihazlar ile yenile.');
    await ctx.answerCbQuery();
    await ctx.editMessageText(panelText(device), { parse_mode: 'Markdown', ...panelKeyboard(device) });
  });

  // Back to the device list (from cache, no API hit)
  bot.action('dev:list', async (ctx) => {
    const devices = Connectors.cachedDevices();
    if (devices.length === 0) return ctx.answerCbQuery('Liste eskimiş — /cihazlar ile yenile.');
    await ctx.answerCbQuery();
    await ctx.editMessageText(`🏠 Cihazların, sir (${devices.length}):`, listKeyboard(devices));
  });

  // Power on/off
  bot.action(/^dev:pow:(.+):(on|off)$/, async (ctx) => {
    const device = Connectors.deviceByKey(ctx.match[1]);
    const on = ctx.match[2] === 'on';
    if (!device) return ctx.answerCbQuery('Liste eskimiş — /cihazlar ile yenile.');
    await runControl(ctx, device, 'power', on, on ? 'açıldı ✅' : 'kapatıldı ⭘');
  });

  // Brightness preset
  bot.action(/^dev:bri:(.+):(\d+)$/, async (ctx) => {
    const device = Connectors.deviceByKey(ctx.match[1]);
    const pct = Number(ctx.match[2]);
    if (!device) return ctx.answerCbQuery('Liste eskimiş — /cihazlar ile yenile.');
    await runControl(ctx, device, 'brightness', pct, `parlaklık %${pct} 🔆`);
  });

  // Colour preset
  bot.action(/^dev:col:(.+):([a-z]+)$/, async (ctx) => {
    const device = Connectors.deviceByKey(ctx.match[1]);
    const rgb = parseColor(ctx.match[2]);
    if (!device) return ctx.answerCbQuery('Liste eskimiş — /cihazlar ile yenile.');
    if (!rgb) return ctx.answerCbQuery('Renk tanınmadı.');
    await runControl(ctx, device, 'color', rgb, `renk ${ctx.match[2]} 🎨`);
  });
}

async function runControl(ctx, device, action, value, okMsg) {
  try {
    await Connectors.control(device, action, value);
    await ctx.answerCbQuery(`${device.name}: ${okMsg}`);
  } catch (err) {
    console.error('[devices] control error:', err);
    await ctx.answerCbQuery(`Hata: ${err.message}`.slice(0, 190));
  }
}

module.exports = { registerDeviceCommands };
