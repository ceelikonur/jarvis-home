const ics = require('ics');
const CalendarService = require('../../services/CalendarService');
const TaskService = require('../../services/TaskService');
const { parseToIcsDateArray, generateEventUid } = require('../../utils/helpers');

/**
 * GET /api/calendar.ics
 *
 * Generates an iCalendar feed from events + tasks with due dates.
 * Apple Calendar (and others) can subscribe to this URL.
 */
function getCalendarFeed(req, res) {
  try {
    const events = CalendarService.getAll();
    const tasksWithDates = TaskService.getWithDueDates();

    const icsEvents = [];

    // Convert events
    for (const evt of events) {
      icsEvents.push({
        uid: generateEventUid('event', evt.id),
        title: evt.title,
        start: parseToIcsDateArray(evt.start_time),
        end: parseToIcsDateArray(evt.end_time),
        calName: 'J.A.R.V.I.S.',
        status: 'CONFIRMED',
      });
    }

    // Convert tasks with due dates as 1-hour calendar blocks
    for (const task of tasksWithDates) {
      const startArr = parseToIcsDateArray(task.due_date);
      const endDate = new Date(task.due_date.replace(' ', 'T'));
      endDate.setHours(endDate.getHours() + 1);
      const endArr = [
        endDate.getFullYear(),
        endDate.getMonth() + 1,
        endDate.getDate(),
        endDate.getHours(),
        endDate.getMinutes(),
      ];

      icsEvents.push({
        uid: generateEventUid('task', task.id),
        title: `📌 Task: ${task.title}`,
        start: startArr,
        end: endArr,
        calName: 'J.A.R.V.I.S.',
        status: task.status === 'completed' ? 'CANCELLED' : 'CONFIRMED',
      });
    }

    if (icsEvents.length === 0) {
      // Return a valid but empty calendar
      const emptyCal = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//JARVIS//EN',
        'X-WR-CALNAME:J.A.R.V.I.S.',
        'END:VCALENDAR',
      ].join('\r\n');

      res.set('Content-Type', 'text/calendar; charset=utf-8');
      return res.send(emptyCal);
    }

    const { error, value } = ics.createEvents(icsEvents);

    if (error) {
      console.error('ICS generation error:', error);
      return res.status(500).json({ error: 'Failed to generate calendar feed' });
    }

    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Content-Disposition', 'inline; filename="jarvis.ics"');
    res.send(value);
  } catch (err) {
    console.error('Calendar feed error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { getCalendarFeed };
