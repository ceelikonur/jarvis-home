const { getDb } = require('../../database/init');
const { config } = require('../../config');
const crypto = require('crypto');

// Public routes that don't require authentication
const PUBLIC_PATHS = [
  '/health',
  '/api/auth/login',
  '/api/auth/check',
  '/login.html',
  '/login',
];

function isPublicPath(path) {
  return PUBLIC_PATHS.some(p => path === p || path.startsWith(p + '?'));
}

function webAuthMiddleware(req, res, next) {
  // Skip auth if no PIN is configured
  if (!config.web.pin) return next();

  // Allow public paths
  if (isPublicPath(req.path)) return next();

  // Allow static assets (css, js, images, fonts)
  if (req.path.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/)) return next();

  // Check session cookie
  const sessionId = req.cookies?.jarvis_session;
  if (!sessionId) {
    return redirectOrReject(req, res);
  }

  const db = getDb();
  const session = db.prepare('SELECT * FROM web_sessions WHERE id = ? AND expires_at > datetime(\'now\')').get(sessionId);

  if (!session) {
    return redirectOrReject(req, res);
  }

  next();
}

function redirectOrReject(req, res) {
  // For API requests, return 401
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized', login: '/login.html' });
  }
  // For page requests, redirect to login
  return res.redirect('/login.html');
}

// ── Auth routes ──────────────────────────────────────────────────

const authRouter = require('express').Router();

authRouter.post('/auth/login', (req, res) => {
  const { pin } = req.body;

  if (!pin || pin !== config.web.pin) {
    return res.status(401).json({ error: 'Yanlış PIN' });
  }

  const db = getDb();
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

  db.prepare('INSERT INTO web_sessions (id, expires_at) VALUES (?, ?)').run(sessionId, expiresAt);

  // Clean expired sessions
  db.prepare("DELETE FROM web_sessions WHERE expires_at < datetime('now')").run();

  res.cookie('jarvis_session', sessionId, {
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    sameSite: 'lax',
  });

  res.json({ success: true });
});

authRouter.get('/auth/check', (req, res) => {
  if (!config.web.pin) {
    return res.json({ authenticated: true, pinRequired: false });
  }

  const sessionId = req.cookies?.jarvis_session;
  if (!sessionId) {
    return res.json({ authenticated: false, pinRequired: true });
  }

  const db = getDb();
  const session = db.prepare("SELECT * FROM web_sessions WHERE id = ? AND expires_at > datetime('now')").get(sessionId);

  res.json({ authenticated: !!session, pinRequired: true });
});

authRouter.post('/auth/logout', (req, res) => {
  const sessionId = req.cookies?.jarvis_session;
  if (sessionId) {
    const db = getDb();
    db.prepare('DELETE FROM web_sessions WHERE id = ?').run(sessionId);
  }
  res.clearCookie('jarvis_session');
  res.json({ success: true });
});

module.exports = { webAuthMiddleware, authRouter };
