const BudgetService = require('../../services/BudgetService');

function register(bot) {
  // /harcama [tutar] [açıklama] — Hızlı harcama girişi
  bot.command('harcama', async (ctx) => {
    const text = ctx.message.text.replace('/harcama', '').trim();
    if (!text) {
      return ctx.reply('Kullanım: /harcama 45.50 Market alışverişi');
    }

    // Parse: first token is amount, rest is description
    const parts = text.split(/\s+/);
    const amountStr = parts[0].replace(',', '.');
    const amount = parseFloat(amountStr);

    if (isNaN(amount)) {
      return ctx.reply('❌ Geçersiz tutar. Örnek: /harcama 45.50 Market alışverişi');
    }

    const source = parts.slice(1).join(' ') || 'Telegram girişi';
    const now = new Date();
    const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

    const tx = {
      date: now.toISOString().slice(0, 10),
      source,
      amount: -Math.abs(amount),
      type: 'expense',
      category: '',
      subCategory: '',
      month: months[now.getMonth()],
      person: '',
      bank: '',
      account: 'Telegram',
      tags: [],
    };

    try {
      BudgetService.upsertTransactions([tx]);
      ctx.reply(`✅ Harcama kaydedildi:\n💸 ${Math.abs(amount).toFixed(2)}€ — ${source}`);
    } catch (err) {
      console.error('[/harcama]', err);
      ctx.reply('❌ Harcama kaydedilemedi.');
    }
  });

  // /gelir [tutar] [açıklama] — Gelir girişi
  bot.command('gelir', async (ctx) => {
    const text = ctx.message.text.replace('/gelir', '').trim();
    if (!text) {
      return ctx.reply('Kullanım: /gelir 3500 Maaş');
    }

    const parts = text.split(/\s+/);
    const amount = parseFloat(parts[0].replace(',', '.'));
    if (isNaN(amount)) {
      return ctx.reply('❌ Geçersiz tutar. Örnek: /gelir 3500 Maaş');
    }

    const source = parts.slice(1).join(' ') || 'Telegram girişi';
    const now = new Date();
    const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

    const tx = {
      date: now.toISOString().slice(0, 10),
      source,
      amount: Math.abs(amount),
      type: 'income',
      category: '',
      subCategory: 'MAAŞ',
      month: months[now.getMonth()],
      person: '',
      bank: '',
      account: 'Telegram',
      tags: [],
    };

    try {
      BudgetService.upsertTransactions([tx]);
      ctx.reply(`✅ Gelir kaydedildi:\n💰 ${Math.abs(amount).toFixed(2)}€ — ${source}`);
    } catch (err) {
      console.error('[/gelir]', err);
      ctx.reply('❌ Gelir kaydedilemedi.');
    }
  });

  // /bakiye [ay] — Aylık bütçe özeti
  bot.command('bakiye', async (ctx) => {
    const monthInput = ctx.message.text.replace('/bakiye', '').trim();
    const month = monthInput || BudgetService.getCurrentMonthName();

    try {
      const summary = BudgetService.getMonthlySummary(month);

      let msg = `📊 *${month} Bütçe Özeti*\n\n`;
      msg += `💰 Gelir: ${summary.income.toFixed(2)}€\n`;
      msg += `💸 Gider: ${summary.expense.toFixed(2)}€\n`;
      msg += `📈 Bakiye: ${summary.balance.toFixed(2)}€\n`;

      if (summary.topCategories.length > 0) {
        msg += `\n📋 *En Çok Harcama:*\n`;
        for (const cat of summary.topCategories) {
          msg += `  • ${cat.category}: ${cat.total.toFixed(2)}€ (${cat.count} işlem)\n`;
        }
      }

      if (summary.income === 0 && summary.expense === 0) {
        msg += `\n⚠️ Bu ay için veri bulunamadı.`;
      }

      ctx.reply(msg, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('[/bakiye]', err);
      ctx.reply('❌ Bütçe özeti alınamadı.');
    }
  });
}

module.exports = { register };
