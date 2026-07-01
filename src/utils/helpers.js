/**
 * Parse a datetime string "YYYY-MM-DD HH:MM" into a Date array
 * compatible with the `ics` package: [year, month, day, hour, minute]
 *
 * @param {string} dateStr — "YYYY-MM-DD HH:MM"
 * @returns {[number, number, number, number, number]}
 */
function parseToIcsDateArray(dateStr) {
  const d = new Date(dateStr.replace(' ', 'T'));
  return [
    d.getFullYear(),
    d.getMonth() + 1, // ics expects 1-indexed months
    d.getDate(),
    d.getHours(),
    d.getMinutes(),
  ];
}

/**
 * Generate a simple deterministic UID for ics events
 * @param {string} prefix
 * @param {number} id
 * @returns {string}
 */
function generateEventUid(prefix, id) {
  return `${prefix}-${id}@jarvis.local`;
}

/**
 * Format a Date as "YYYY-MM-DD HH:MM" in a specific IANA timezone.
 * Bug fix: previously CalendarSyncService used d.toISOString() which always
 * returns UTC — so events were stored 1-2h off depending on DST.
 *
 * @param {Date} date
 * @param {string} timezone — IANA name e.g. 'Europe/Berlin'
 * @returns {string}
 */
function formatDateInTimezone(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find(p => p.type === type)?.value || '00';
  // Intl returns "24" for midnight in some locales/zones; normalize.
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')}`;
}

module.exports = { parseToIcsDateArray, generateEventUid, formatDateInTimezone };
