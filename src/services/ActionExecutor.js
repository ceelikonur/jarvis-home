const TaskService = require('./TaskService');
const CalendarService = require('./CalendarService');
const ListService = require('./ListService');
const NoteService = require('./NoteService');
const MemoryService = require('./MemoryService');

/**
 * Executes structured actions declared by JARVIS AI responses.
 * Returns array of human-readable result strings.
 */
// Names that mean "tasks" — must never become a list. add_to_list with these
// names is silently rerouted to create_task (defense against AI confusion).
const TASK_ALIASES = new Set([
  'yapılacaklar', 'yapilacaklar', 'yapılacak', 'yapilacak',
  'görev', 'gorev', 'görevler', 'gorevler',
  'todo', 'to-do', 'to_do', 'task', 'tasks',
]);

const ActionExecutor = {
  async run(actions = []) {
    const results = [];
    for (const action of actions) {
      try {
        const result = await this.execute(action);
        if (result) results.push(result);
      } catch (err) {
        console.error(`ActionExecutor error [${action.type}]:`, err);
        results.push(`⚠️ "${action.type}" işlemi başarısız: ${err.message}`);
        // Continue with remaining actions
      }
    }
    return results;
  },

  async execute(action) {
    switch (action.type) {

      case 'add_to_list': {
        const listName = (action.list || 'alışveriş').toLowerCase();

        // Defense: AI sometimes treats "yapılacaklar/todo/görev" as list names.
        // Reroute to the tasks system so the user sees them on the Görevler page.
        if (TASK_ALIASES.has(listName)) {
          const items = Array.isArray(action.items) ? action.items : [action.items];
          const created = [];
          for (const raw of items) {
            const title = String(raw).trim();
            if (!title) continue;
            const task = TaskService.create(title, null, 'normal');
            await MemoryService.index('task', task.id, `Task: ${task.title} (priority: normal)`);
            created.push(task);
          }
          if (created.length === 0) return null;
          const titles = created.map(t => `"${t.title}" [#${t.id}]`).join(', ');
          return `✅ Görev olarak eklendi: ${titles}\n_(yapılacaklar/todo görev sistemine yazılır, listeye değil — Görevler sayfasından görebilirsiniz)_`;
        }

        let list = ListService.findList(listName);
        if (!list) list = ListService.createList(listName, '📋');
        const items = Array.isArray(action.items) ? action.items : [action.items];
        const added = ListService.addItems(list.id, items.map(String));
        for (const item of added) {
          await MemoryService.index('list_item', item.id, `${listName}: ${item.content}`);
        }
        return `✅ ${list.icon || ''} **${listName}** listesine eklendi: ${added.map(i => i.content).join(', ')}`;
      }

      case 'remove_from_list': {
        const listName = (action.list || '').toLowerCase();
        const list = ListService.findList(listName);
        if (!list) return `⚠️ Liste bulunamadı: ${listName}`;
        const items = ListService.getAllItems(list.id);
        const match = items.find(i =>
          i.content.toLowerCase().includes((action.item || '').toLowerCase())
        );
        if (!match) return `⚠️ "${action.item}" listede bulunamadı`;
        ListService.removeItem(match.id);
        return `🗑️ **${listName}** listesinden silindi: ${match.content}`;
      }

      case 'create_task': {
        const recurrence = (Number.isInteger(action.recurrence_days) && action.recurrence_days > 0)
          ? action.recurrence_days : null;
        const task = TaskService.create(
          action.title,
          action.due_date || null,
          action.priority || 'normal',
          recurrence,
        );
        const recurrenceText = recurrence ? `, recurring every ${recurrence} days` : '';
        const memText = task.due_date
          ? `Task: ${task.title} (due: ${task.due_date}, priority: ${task.priority}${recurrenceText})`
          : `Task: ${task.title} (priority: ${task.priority}${recurrenceText})`;
        await MemoryService.index('task', task.id, memText);
        const priorityTag = task.priority === 'high' ? ' 🔴' : task.priority === 'low' ? ' 🔵' : '';
        const recurrenceTag = recurrence ? ` 🔁 her ${recurrence} gün` : '';
        return `✅ Görev oluşturuldu [#${task.id}]: "${task.title}"${task.due_date ? ` — ${task.due_date}` : ''}${priorityTag}${recurrenceTag}`;
      }

      case 'complete_task': {
        const task = TaskService.complete(Number(action.id));
        if (!task) return `⚠️ Görev bulunamadı: #${action.id}`;
        if (task.recurred) {
          return `🔁 Tamamlandı [#${task.id}]: "${task.title}" — sonraki tarih: ${task.due_date}`;
        }
        return `✅ Tamamlandı [#${task.id}]: "${task.title}"`;
      }

      case 'delete_task': {
        const task = TaskService.delete(Number(action.id));
        if (!task) return `⚠️ Görev bulunamadı: #${action.id}`;
        return `🗑️ Görev silindi: "${task.title}"`;
      }

      case 'create_event': {
        const event = CalendarService.create(action.title, action.start_time, action.end_time);
        await MemoryService.index('event', event.id,
          `Event: ${event.title} (${action.start_time} → ${action.end_time})`
        );
        return `📅 Etkinlik oluşturuldu [#${event.id}]: "${event.title}" — ${action.start_time}`;
      }

      case 'update_event': {
        const event = CalendarService.update(Number(action.id), {
          title: action.title,
          start_time: action.start_time,
          end_time: action.end_time,
        });
        if (!event) return `⚠️ Etkinlik bulunamadı: #${action.id}`;
        return `📅 Etkinlik güncellendi [#${event.id}]: "${event.title}" — ${event.start_time}`;
      }

      case 'delete_event': {
        const event = CalendarService.delete(Number(action.id));
        if (!event) return `⚠️ Etkinlik bulunamadı: #${action.id}`;
        return `🗑️ Etkinlik silindi: "${event.title}"`;
      }

      case 'save_note': {
        const note = NoteService.create(action.content);
        await MemoryService.index('note', note.id, action.content);
        return `📝 Not kaydedildi.`;
      }

      case 'control_device': {
        const Connectors = require('../connectors');
        const { parseColor, matchDevice } = require('../connectors/base');
        let devices = Connectors.cachedDevices();
        if (devices.length === 0) devices = await Connectors.listDevices();
        const device = matchDevice(devices, action.device);
        if (!device) return `⚠️ Cihaz bulunamadı: "${action.device || ''}"`;

        const done = [];
        if (action.power !== undefined && action.power !== null) {
          await Connectors.control(device, 'power', !!action.power);
          done.push(action.power ? 'açıldı' : 'kapatıldı');
        }
        if (action.brightness !== undefined && action.brightness !== null && action.brightness !== '') {
          await Connectors.control(device, 'brightness', Number(action.brightness));
          done.push(`parlaklık %${Number(action.brightness)}`);
        }
        if (action.color) {
          const rgb = parseColor(action.color);
          if (!rgb) return `⚠️ Renk tanınmadı: "${action.color}"`;
          await Connectors.control(device, 'color', rgb);
          done.push(`renk ${action.color}`);
        }
        if (action.temperature !== undefined && action.temperature !== null && action.temperature !== '') {
          await Connectors.control(device, 'temperature', Number(action.temperature));
          done.push(`${Number(action.temperature)}°C`);
        }
        if (action.vacuum) {
          await Connectors.control(device, 'vacuum', String(action.vacuum));
          done.push(`süpürge: ${action.vacuum}`);
        }
        if (done.length === 0) return null;
        return `💡 ${device.name}: ${done.join(', ')}`;
      }

      default:
        console.warn('Unknown action type:', action.type);
        return null;
    }
  },
};

module.exports = ActionExecutor;
