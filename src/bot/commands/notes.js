const NoteService = require('../../services/NoteService');

/**
 * /notes — View recent notes
 */
function registerNotesCommand(bot) {
  bot.command('notes', (ctx) => {
    try {
      const notes = NoteService.getAll(10);

      if (notes.length === 0) {
        return ctx.reply('No notes yet, sir.');
      }

      const list = notes
        .map((n, i) => {
          const date = new Date(n.created_at).toLocaleDateString('tr-TR');
          const preview = n.content.length > 80
            ? n.content.substring(0, 80) + '...'
            : n.content;
          return `${i + 1}. ${preview}\n   📅 ${date}`;
        })
        .join('\n\n');

      ctx.reply(`📝 Recent notes, sir:\n\n${list}`);
    } catch (err) {
      console.error('Error fetching notes:', err);
      ctx.reply('I had trouble fetching your notes, sir.');
    }
  });
}

module.exports = { registerNotesCommand };
