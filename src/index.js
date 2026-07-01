const { config, validateConfig } = require('./config');
const { getDb, closeDb } = require('./database/init');
const { createBot } = require('./bot');
const { createServer } = require('./api');
const AIService = require('./services/AIService');
const MemoryService = require('./services/MemoryService');
const Scheduler = require('./scheduler');
const AnyListService = require('./services/AnyListService');
const MSCalendarService = require('./services/MSCalendarService');
const ICSWatcherService = require('./services/ICSWatcherService');

// ── Bootstrap ──────────────────────────────────────────────
validateConfig();

// Initialize database (creates tables if needed)
getDb();

async function start() {
  // Initialize memory system with embedding function
  const hasEmbeddings = await AIService.hasEmbeddings();
  if (hasEmbeddings) {
    MemoryService.init((text) => AIService.getEmbedding(text));
    console.log('🧠 Embeddings enabled — semantic search active.');
  } else {
    MemoryService.init(null);
    console.log('🧠 Embeddings not available — using keyword search fallback.');
  }

  // Index existing data into memory (runs in background)
  MemoryService.indexAll().catch(err => {
    console.error('Memory indexing error:', err);
  });

  // ── Start Express API + Next.js on single port ──────────
  const app = createServer();

  // Try to boot Next.js web dashboard
  let nextHandler = null;
  try {
    const path = require('path');
    const webDir = path.resolve(__dirname, '../web');
    // Load next from web's own node_modules to match the build
    const next = require(path.resolve(webDir, 'node_modules/next'));
    const isDev = process.env.NODE_ENV !== 'production';
    const nextApp = next({ dev: isDev, dir: webDir });
    nextHandler = nextApp.getRequestHandler();
    await nextApp.prepare();
    console.log(`🖥️  Next.js web dashboard ready (${isDev ? 'dev' : 'production'})`);
  } catch (err) {
    console.log('⚠️  Next.js not available — serving static dashboard only');
    console.log('   Error:', err.message);
    console.log('   Run "npm run setup" to enable web dashboard');
  }

  // Create unified http server
  const http = require('http');
  const server = http.createServer((req, res) => {
    // API, health, and static login page → Express
    if (req.url.startsWith('/api/') || req.url === '/health' || req.url.startsWith('/login')) {
      return app(req, res);
    }

    // If Next.js is not available, fall back to Express (static HTML)
    if (!nextHandler) {
      return app(req, res);
    }

    // Next.js internal routes — no auth needed (CSS, JS, images, HMR)
    if (req.url.startsWith('/_next/') || req.url.startsWith('/__next') || req.url.endsWith('.ico')) {
      return nextHandler(req, res);
    }

    // Auth check for web pages
    if (config.web.pin) {
      const cookieHeader = req.headers.cookie || '';
      let sessionId = '';
      cookieHeader.split(';').forEach(c => {
        const [name, ...rest] = c.trim().split('=');
        if (name && name.trim() === 'jarvis_session') {
          sessionId = decodeURIComponent(rest.join('='));
        }
      });

      if (!sessionId) {
        res.writeHead(302, { Location: '/login.html' });
        return res.end();
      }

      const db = getDb();
      const session = db.prepare("SELECT id FROM web_sessions WHERE id = ? AND expires_at > datetime('now')").get(sessionId);
      if (!session) {
        res.writeHead(302, { Location: '/login.html' });
        return res.end();
      }
    }

    // Authenticated — serve Next.js
    return nextHandler(req, res);
  });

  server.listen(config.server.port, '0.0.0.0', () => {
    console.log(`🌐 J.A.R.V.I.S. running on http://0.0.0.0:${config.server.port}`);
    if (nextHandler) {
      console.log(`🖥️  Web Dashboard: http://localhost:${config.server.port}`);
    }
    console.log(`📅 Calendar feed: http://localhost:${config.server.port}/api/calendar.ics`);
    console.log(`💰 Budget API: http://localhost:${config.server.port}/api/budget/`);
    if (config.web.pin) {
      console.log(`🔐 Web access protected with PIN`);
    }
  });

  // Initialize MS Calendar (non-blocking)
  MSCalendarService.init();

  // Start watching Downloads folder for .ics files
  ICSWatcherService.start();

  // Connect to AnyList (non-blocking)
  AnyListService.init().catch(err => {
    console.error('📋 AnyList init error:', err.message);
  });

  // Start Telegram bot
  const bot = createBot();

  // Peek at the queue Telegram has been holding for us while we were offline.
  // getUpdates with offset=0 is non-destructive — telegraf's launch() will
  // still receive the same updates and process them through the middleware.
  let queuedCount = 0;
  try {
    const pending = await bot.telegram.getUpdates(0, 100, 0, ['message']);
    queuedCount = pending.length;
  } catch (err) {
    console.error('Queue peek failed (non-fatal):', err.message);
  }

  bot.launch(() => {
    console.log(`🤖 J.A.R.V.I.S. is online. At your service, sir.${queuedCount ? ` (${queuedCount} pending)` : ''}`);
    Scheduler.init(bot);

    // Tell each authorized user the bot is back. If there are queued
    // messages, mention the count so they know earlier sends are being handled.
    const startupMsg = queuedCount > 0
      ? `🤖 JARVIS çevrimiçi, sir. Bekleyen ${queuedCount} mesaj sırayla işleniyor.`
      : '🤖 JARVIS çevrimiçi, sir.';
    for (const userId of config.telegram.allowedUserIds) {
      bot.telegram.sendMessage(userId, startupMsg)
        .catch(err => console.error(`Startup ping failed for ${userId} (non-fatal):`, err.message));
    }
  });

  // ── Graceful Shutdown ──────────────────────────────────
  function shutdown(signal) {
    console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
    bot.stop(signal);
    server.close(() => {
      closeDb();
      console.log('👋 J.A.R.V.I.S. offline. Goodbye, sir.');
      process.exit(0);
    });
  }

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch(err => {
  console.error('❌ Failed to start J.A.R.V.I.S.:', err);
  process.exit(1);
});
