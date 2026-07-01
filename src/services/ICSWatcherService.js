const fs = require('fs');
const path = require('path');
const CalendarSyncService = require('./CalendarSyncService');

const WATCH_DIR = process.env.ICS_WATCH_DIR || path.join(require('os').homedir(), 'Downloads');
const POLL_INTERVAL = 15_000; // check every 15 seconds
const processedFiles = new Set();

let watching = false;
let intervalId = null;

const ICSWatcherService = {
  /**
   * Start watching the configured directory for .ics files
   */
  start() {
    if (watching) return;

    if (!fs.existsSync(WATCH_DIR)) {
      console.log(`📂 ICS Watcher: Directory not found — ${WATCH_DIR}`);
      return;
    }

    watching = true;

    // Initial scan — mark existing files as already processed
    const existing = this._getIcsFiles();
    existing.forEach(f => processedFiles.add(f));

    // Start polling
    intervalId = setInterval(() => this._check(), POLL_INTERVAL);

    console.log(`📂 ICS Watcher: Monitoring ${WATCH_DIR} for .ics files (${existing.length} existing ignored)`);
  },

  stop() {
    if (intervalId) clearInterval(intervalId);
    watching = false;
  },

  _getIcsFiles() {
    try {
      return fs.readdirSync(WATCH_DIR)
        .filter(f => f.toLowerCase().endsWith('.ics'))
        .map(f => path.join(WATCH_DIR, f));
    } catch {
      return [];
    }
  },

  _check() {
    const files = this._getIcsFiles();

    for (const filePath of files) {
      if (processedFiles.has(filePath)) continue;

      // Check file age — only process files less than 5 minutes old
      try {
        const stat = fs.statSync(filePath);
        const ageMs = Date.now() - stat.mtimeMs;
        if (ageMs > 5 * 60 * 1000) {
          // Old file, skip and mark
          processedFiles.add(filePath);
          continue;
        }

        // Wait for file to finish writing (size stable for 2 seconds)
        const size1 = stat.size;
        setTimeout(() => {
          try {
            const size2 = fs.statSync(filePath).size;
            if (size1 === size2 && size2 > 0) {
              this._importFile(filePath);
            }
          } catch { /* file may have been moved/deleted */ }
        }, 2000);

        processedFiles.add(filePath); // mark immediately to prevent double-processing
      } catch {
        processedFiles.add(filePath);
      }
    }
  },

  _importFile(filePath) {
    try {
      const fileName = path.basename(filePath, '.ics');
      const buffer = fs.readFileSync(filePath);

      // Check if source with same name exists — reimport, otherwise create new
      const sources = CalendarSyncService.getAllSources();
      const existing = sources.find(s =>
        s.name.toLowerCase() === fileName.toLowerCase() && s.url === 'file-upload'
      );

      if (existing) {
        const count = CalendarSyncService.reimportFromFile(existing.id, buffer);
        console.log(`📂 ICS Watcher: Re-imported "${fileName}" — ${count} events updated`);
      } else {
        const result = CalendarSyncService.importFromFile(fileName, buffer, 'sir', '#0078d4');
        console.log(`📂 ICS Watcher: Imported "${fileName}" — ${result.count} events (source #${result.sourceId})`);
      }
    } catch (err) {
      console.error(`📂 ICS Watcher: Error importing ${path.basename(filePath)} —`, err.message);
    }
  },
};

module.exports = ICSWatcherService;
