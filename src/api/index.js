const express = require('express');
const path = require('path');
const calendarRoutes = require('./routes/calendar');
const dashboardRoutes = require('./routes/dashboard');
const availabilityRoutes = require('./routes/availability');
const anylistRoutes = require('./routes/anylist');
const msCalendarRoutes = require('./routes/msCalendar');
const budgetRoutes = require('./routes/budget');
const forecastRoutes = require('./routes/forecast');
const timeboxRoutes = require('./routes/timeboxes');
const { webAuthMiddleware, authRouter } = require('./middleware/webAuth');

function createServer() {
  const app = express();

  // Middleware
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Cookie parser (lightweight, no dependency)
  app.use((req, res, next) => {
    const cookieHeader = req.headers.cookie || '';
    req.cookies = {};
    cookieHeader.split(';').forEach(cookie => {
      const [name, ...rest] = cookie.trim().split('=');
      if (name) req.cookies[name.trim()] = decodeURIComponent(rest.join('='));
    });
    next();
  });

  // CORS (for dev if needed)
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // Auth routes (before auth middleware)
  app.use('/api', authRouter);

  // Web auth middleware (PIN-based)
  app.use(webAuthMiddleware);

  // Health check (public)
  app.get('/health', (req, res) => {
    res.json({ status: 'online', service: 'J.A.R.V.I.S.', timestamp: new Date().toISOString() });
  });

  // API routes
  app.use('/api', calendarRoutes);
  app.use('/api', dashboardRoutes);
  app.use('/api', availabilityRoutes);
  app.use('/api', anylistRoutes);
  app.use('/api', msCalendarRoutes);
  app.use('/api', budgetRoutes);
  app.use('/api', forecastRoutes);
  app.use('/api', timeboxRoutes);

  // Static files fallback (login page, legacy dashboard if Next.js not available)
  app.use(express.static(path.join(__dirname, 'public')));

  return app;
}

module.exports = { createServer };
