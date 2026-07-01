const { Router } = require('express');
const { getCalendarFeed } = require('../controllers/calendarController');

const router = Router();

// GET /api/calendar.ics — iCalendar subscription feed
router.get('/calendar.ics', getCalendarFeed);

module.exports = router;
