const TaskService = require('../../services/TaskService');
const CalendarService = require('../../services/CalendarService');
const ListService = require('../../services/ListService');
const NoteService = require('../../services/NoteService');
const MemoryService = require('../../services/MemoryService');
const AIService = require('../../services/AIService');
const BudgetService = require('../../services/BudgetService');

/**
 * /status — Daily briefing from JARVIS
 *
 * Shows:
 *   - Pending tasks (with overdue warnings)
 *   - Today's & upcoming events
 *   - Shopping list status
 *   - Memory stats
 *   - AI status
 */
function registerStatusCommand(bot) {
  bot.command('status', async (ctx) => {
    const name = ctx.from.first_name || 'Sir';
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const hour = now.getHours();

    // Time-based greeting
    let greeting;
    if (hour < 6) greeting = '🌙 Burning the midnight oil';
    else if (hour < 12) greeting = '☀️ Good morning';
    else if (hour < 17) greeting = '🌤️ Good afternoon';
    else if (hour < 21) greeting = '🌆 Good evening';
    else greeting = '🌙 Good night';

    const sections = [];

    // ── Tasks ──
    try {
      const tasks = TaskService.getPending();
      if (tasks.length > 0) {
        const overdue = tasks.filter(t => t.due_date && t.due_date < today);
        const todayTasks = tasks.filter(t => t.due_date && t.due_date.startsWith(today));
        const noDue = tasks.filter(t => !t.due_date);
        const future = tasks.filter(t => t.due_date && t.due_date > today && !t.due_date.startsWith(today));

        let taskSection = `✅ **Tasks** (${tasks.length} pending)`;

        if (overdue.length > 0) {
          taskSection += `\n🔴 OVERDUE:`;
          overdue.forEach(t => taskSection += `\n   ⚠️ ${t.title} (was due ${t.due_date})`);
        }
        if (todayTasks.length > 0) {
          taskSection += `\n📌 Today:`;
          todayTasks.forEach(t => taskSection += `\n   • ${t.title}`);
        }
        if (future.length > 0) {
          taskSection += `\n🔜 Upcoming:`;
          future.slice(0, 3).forEach(t => taskSection += `\n   • ${t.title} (${t.due_date})`);
          if (future.length > 3) taskSection += `\n   ... +${future.length - 3} more`;
        }
        if (noDue.length > 0) {
          taskSection += `\n📋 No deadline:`;
          noDue.slice(0, 3).forEach(t => taskSection += `\n   • ${t.title}`);
          if (noDue.length > 3) taskSection += `\n   ... +${noDue.length - 3} more`;
        }

        sections.push(taskSection);
      } else {
        sections.push('✅ Tasks: All clear, sir. No pending tasks.');
      }
    } catch (err) {
      console.error('Status tasks error:', err);
    }

    // ── Events ──
    try {
      const events = CalendarService.getUpcoming();
      if (events.length > 0) {
        const todayEvents = events.filter(e => e.start_time.startsWith(today));
        const upcomingEvents = events.filter(e => !e.start_time.startsWith(today)).slice(0, 3);

        let eventSection = '📅 Events';

        if (todayEvents.length > 0) {
          eventSection += '\n🔵 Today:';
          todayEvents.forEach(e => {
            const time = e.start_time.split(' ')[1] || '';
            eventSection += `\n   • ${e.title} at ${time}`;
          });
        } else {
          eventSection += '\n   No events today.';
        }

        if (upcomingEvents.length > 0) {
          eventSection += '\n🔜 Coming up:';
          upcomingEvents.forEach(e => eventSection += `\n   • ${e.title} (${e.start_time})`);
        }

        sections.push(eventSection);
      } else {
        sections.push('📅 Events: Calendar is clear.');
      }
    } catch (err) {
      console.error('Status events error:', err);
    }

    // ── Shopping List ──
    try {
      const shopList = ListService.findList('alışveriş');
      if (shopList) {
        const items = ListService.getUncheckedItems(shopList.id);
        if (items.length > 0) {
          let shopSection = `🛒 Shopping (${items.length} items)`;
          items.slice(0, 5).forEach(i => shopSection += `\n   • ${i.content}`);
          if (items.length > 5) shopSection += `\n   ... +${items.length - 5} more`;
          sections.push(shopSection);
        }
      }
    } catch (err) {
      console.error('Status shopping error:', err);
    }

    // ── Budget Summary ──
    try {
      const month = BudgetService.getCurrentMonthName();
      const summary = BudgetService.getMonthlySummary(month);
      if (summary.income > 0 || summary.expense > 0) {
        let budgetSection = `💰 Budget (${month})`;
        budgetSection += `\n   Gelir: ${summary.income.toFixed(2)}€`;
        budgetSection += `\n   Gider: ${summary.expense.toFixed(2)}€`;
        budgetSection += `\n   Bakiye: ${summary.balance.toFixed(2)}€`;
        if (summary.topCategories.length > 0) {
          budgetSection += `\n   Top: ${summary.topCategories.slice(0, 3).map(c => `${c.category} ${c.total.toFixed(0)}€`).join(', ')}`;
        }
        sections.push(budgetSection);
      }
    } catch (err) {
      console.error('Status budget error:', err);
    }

    // ── Memory Stats ──
    try {
      const stats = MemoryService.getStats();
      const aiOnline = await AIService.isAvailable();
      const aiStatus = aiOnline ? '🟢 Online' : '🔴 Offline';

      sections.push(
        `🧠 Memory: ${stats.total} indexed memories\n` +
        `🤖 AI: ${aiStatus}`
      );
    } catch (err) {
      console.error('Status memory error:', err);
    }

    // ── AI Insight ──
    let aiTip = '';
    try {
      const statusSummary = sections.join('\n');
      const { reply: tip } = await AIService.chat(
        `Based on this status: ${statusSummary}\n\nGive me exactly one sentence of prioritization advice.`,
        ''
      );
      if (tip) aiTip = `\n\n─────────────────────\n\n💡 JARVIS: ${tip}`;
    } catch (err) {
      console.error('Status AI tip error:', err.message);
    }

    // ── Compose ──
    const briefing = `${greeting}, ${name}.\n\nHere's your briefing, sir:\n\n${sections.join('\n\n─────────────────────\n\n')}${aiTip}`;

    ctx.reply(briefing);
  });
}

module.exports = { registerStatusCommand };
