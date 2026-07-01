const msal = require('@azure/msal-node');
const { config } = require('../config');
const { getDb } = require('../database/init');
const path = require('path');
const fs = require('fs');

const TOKEN_PATH = path.resolve(__dirname, '../../data/ms-token.json');

let msalClient = null;
let accessToken = null;
let tokenExpiry = 0;

const SCOPES = ['Calendars.Read', 'offline_access', 'User.Read'];

const MSCalendarService = {
  /**
   * Initialize MSAL client
   */
  init() {
    if (!config.microsoft.clientId || !config.microsoft.tenantId || !config.microsoft.clientSecret) {
      console.log('📅 MS Calendar: No credentials configured — skipping');
      return false;
    }

    msalClient = new msal.ConfidentialClientApplication({
      auth: {
        clientId: config.microsoft.clientId,
        authority: `https://login.microsoftonline.com/${config.microsoft.tenantId}`,
        clientSecret: config.microsoft.clientSecret,
      },
    });

    // Try to load saved token
    this._loadToken();

    console.log(`📅 MS Calendar: Initialized${accessToken ? ' (token loaded)' : ' (needs auth)'}`);
    return true;
  },

  isConfigured() {
    return !!msalClient;
  },

  isAuthenticated() {
    return !!accessToken && Date.now() < tokenExpiry;
  },

  /**
   * Get the OAuth2 authorization URL for user consent
   */
  async getAuthUrl() {
    if (!msalClient) throw new Error('MS Calendar not configured');

    const authUrl = await msalClient.getAuthCodeUrl({
      scopes: SCOPES,
      redirectUri: config.microsoft.redirectUri,
    });
    return authUrl;
  },

  /**
   * Exchange authorization code for tokens
   */
  async handleCallback(code) {
    if (!msalClient) throw new Error('MS Calendar not configured');

    const result = await msalClient.acquireTokenByCode({
      code,
      scopes: SCOPES,
      redirectUri: config.microsoft.redirectUri,
    });

    accessToken = result.accessToken;
    tokenExpiry = result.expiresOn ? result.expiresOn.getTime() : Date.now() + 3600000;

    // Save token cache for refresh
    this._saveToken(result);

    console.log('📅 MS Calendar: Authenticated successfully');
    return true;
  },

  /**
   * Get a valid access token (refresh if expired)
   */
  async _getToken() {
    if (accessToken && Date.now() < tokenExpiry) {
      return accessToken;
    }

    // Try silent refresh
    const savedToken = this._loadToken();
    if (savedToken && savedToken.account) {
      try {
        const result = await msalClient.acquireTokenSilent({
          scopes: SCOPES,
          account: savedToken.account,
        });
        accessToken = result.accessToken;
        tokenExpiry = result.expiresOn ? result.expiresOn.getTime() : Date.now() + 3600000;
        this._saveToken(result);
        return accessToken;
      } catch (err) {
        console.error('📅 MS Calendar: Silent refresh failed —', err.message);
        accessToken = null;
        return null;
      }
    }

    return null;
  },

  /**
   * Fetch calendar events from Microsoft Graph
   * @param {string} startDate - ISO date string (YYYY-MM-DD)
   * @param {string} endDate - ISO date string (YYYY-MM-DD)
   */
  async fetchEvents(startDate, endDate) {
    const token = await this._getToken();
    if (!token) throw new Error('Not authenticated — visit /api/ms-calendar/auth');

    const start = `${startDate}T00:00:00`;
    const end = `${endDate}T23:59:59`;

    const url = `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${start}&endDateTime=${end}&$top=100&$orderby=start/dateTime&$select=subject,start,end,isAllDay,showAs`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      accessToken = null;
      throw new Error('Token expired — re-authenticate at /api/ms-calendar/auth');
    }

    if (!res.ok) {
      throw new Error(`Graph API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    return (data.value || []).map(evt => ({
      uid: evt.id,
      title: evt.subject || 'Untitled',
      start_time: evt.start.dateTime.replace('T', ' ').slice(0, 16),
      end_time: evt.end.dateTime.replace('T', ' ').slice(0, 16),
      all_day: evt.isAllDay || false,
      showAs: evt.showAs,
    }));
  },

  /**
   * Sync Office 365 events into imported_events table
   * Creates/updates a calendar_source for MS Calendar
   */
  async sync() {
    const db = getDb();

    // Ensure calendar source exists
    let source = db.prepare("SELECT * FROM calendar_sources WHERE url = 'ms-graph'").get();
    if (!source) {
      const result = db.prepare(
        "INSERT INTO calendar_sources (name, url, owner, color) VALUES (?, ?, ?, ?)"
      ).run('Office 365', 'ms-graph', 'sir', '#0078d4');
      source = db.prepare('SELECT * FROM calendar_sources WHERE id = ?').get(result.lastInsertRowid);
    }

    // Fetch 30 days back + 90 days forward
    const now = new Date();
    const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const future90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const startDate = past30.toISOString().split('T')[0];
    const endDate = future90.toISOString().split('T')[0];

    const events = await this.fetchEvents(startDate, endDate);

    // Clear old events and insert new ones
    db.prepare('DELETE FROM imported_events WHERE source_id = ?').run(source.id);

    const insert = db.prepare(
      'INSERT INTO imported_events (source_id, uid, title, start_time, end_time, all_day) VALUES (?, ?, ?, ?, ?, ?)'
    );

    const insertAll = db.transaction((evts) => {
      for (const e of evts) {
        insert.run(source.id, e.uid, e.title, e.start_time, e.end_time, e.all_day ? 1 : 0);
      }
    });

    insertAll(events);

    db.prepare("UPDATE calendar_sources SET last_synced = datetime('now') WHERE id = ?").run(source.id);

    console.log(`📅 MS Calendar: Synced ${events.length} events`);
    return events.length;
  },

  _saveToken(result) {
    try {
      const data = {
        accessToken: result.accessToken,
        expiresOn: result.expiresOn ? result.expiresOn.toISOString() : null,
        account: result.account || null,
      };
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('📅 MS Token save error:', err.message);
    }
  },

  _loadToken() {
    try {
      if (!fs.existsSync(TOKEN_PATH)) return null;
      const data = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
      if (data.accessToken && data.expiresOn) {
        const expiry = new Date(data.expiresOn).getTime();
        if (Date.now() < expiry) {
          accessToken = data.accessToken;
          tokenExpiry = expiry;
        }
      }
      return data;
    } catch {
      return null;
    }
  },
};

module.exports = MSCalendarService;
