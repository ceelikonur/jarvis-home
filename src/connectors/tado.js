/**
 * tado° connector — smart thermostat (heating).
 *
 * Auth: OAuth 2.0 Device Code flow (tado° removed password auth in 2025).
 * The user links once via a browser (a "Bağla" button in the web UI, or the
 * npm run tado:link script), which stores a refresh_token in .env
 * (TADO_REFRESH_TOKEN). Refresh tokens ROTATE on every use, so we persist the
 * new one immediately. Access tokens (~10 min) are cached in memory.
 *
 * Requires Node 18+ (global fetch).
 */

const { CAPABILITIES, clamp, envConfigured } = require('./base');
const { setEnvVars } = require('../config/envFile');

const CLIENT_ID = '1bb50063-6b0c-4d11-bd99-387f4a91cc46'; // public community client
const AUTH_URL = 'https://login.tado.com/oauth2';
const API_URL = 'https://my.tado.com/api/v2';

let _access = null;     // { token, expiresAt }
let _refreshing = null; // single-flight refresh promise
let _homeId = null;     // cached

function refreshTokenValue() {
  return (process.env.TADO_REFRESH_TOKEN || '').trim();
}

async function postForm(path, params) {
  const res = await fetch(`${AUTH_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  let json = {};
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { ok: res.ok, status: res.status, json };
}

// Store a freshly-issued token pair. Persist the rotated refresh token at once.
function storeTokens(json) {
  if (json.refresh_token) setEnvVars({ TADO_REFRESH_TOKEN: json.refresh_token });
  const ttl = (Number(json.expires_in) || 600) - 30;
  _access = { token: json.access_token, expiresAt: Date.now() + ttl * 1000 };
}

async function refreshAccess() {
  if (_refreshing) return _refreshing;
  _refreshing = (async () => {
    const rt = refreshTokenValue();
    if (!rt) throw new Error('tado° bağlı değil — önce bağlayın');
    const { ok, json } = await postForm('/token', {
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: rt,
    });
    if (!ok || !json.access_token) {
      throw new Error('tado° oturumu geçersiz — yeniden bağlayın');
    }
    storeTokens(json);
    return _access.token;
  })().finally(() => { _refreshing = null; });
  return _refreshing;
}

async function accessToken() {
  if (_access && _access.expiresAt > Date.now()) return _access.token;
  return refreshAccess();
}

async function api(path, opts = {}, _retried = false) {
  const token = await accessToken();
  const res = await fetch(API_URL + path, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (res.status === 401 && !_retried) {
    _access = null; // force a refresh, then retry once
    return api(path, opts, true);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`tado° ${res.status}: ${body}`.slice(0, 200));
  }
  return res.status === 204 ? {} : res.json();
}

async function homeId() {
  if (_homeId) return _homeId;
  const me = await api('/me');
  _homeId = me.homes && me.homes[0] && me.homes[0].id;
  if (!_homeId) throw new Error('tado° ev bulunamadı');
  return _homeId;
}

// ── OAuth device-code linking (used by the web "Bağla" flow) ──
async function linkStart() {
  const res = await fetch(`${AUTH_URL}/device_authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, scope: 'offline_access' }).toString(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error('tado° bağlantı başlatılamadı');
  return {
    verification_uri_complete: json.verification_uri_complete,
    user_code: json.user_code,
    device_code: json.device_code,
    expires_in: json.expires_in,
    interval: json.interval,
  };
}

async function linkPoll(deviceCode) {
  const { ok, json } = await postForm('/token', {
    client_id: CLIENT_ID,
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    device_code: deviceCode,
  });
  if (ok && json.access_token) {
    storeTokens(json);
    _homeId = null;
    return { status: 'linked' };
  }
  if (json.error === 'authorization_pending' || json.error === 'slow_down') return { status: 'pending' };
  if (json.error === 'expired_token') return { status: 'expired' };
  return { status: 'error', error: json.error || 'unknown' };
}

module.exports = {
  id: 'tado',
  name: 'tado°',
  description: 'tado° akıllı termostat — sıcaklık ayarı, ısıtmayı aç/kapat (yerel program)',
  requiredEnv: ['TADO_REFRESH_TOKEN'],
  authType: 'device_code', // web UI shows a "Bağla" flow instead of a key field
  configHints: {},
  capabilities: [CAPABILITIES.TEMPERATURE, CAPABILITIES.POWER],

  isConfigured() { return envConfigured(this.requiredEnv); },
  linkStart,
  linkPoll,

  async listDevices() {
    const home = await homeId();
    const zones = await api(`/homes/${home}/zones`);
    return (zones || [])
      .filter((z) => z.type === 'HEATING')
      .map((z) => ({
        id: String(z.id),
        name: z.name,
        model: 'HEATING',
        capabilities: [CAPABILITIES.TEMPERATURE, CAPABILITIES.POWER],
      }));
  },

  async setTemperature(device, celsius) {
    const home = await homeId();
    await api(`/homes/${home}/zones/${device.id}/overlay`, {
      method: 'PUT',
      body: JSON.stringify({
        setting: { type: 'HEATING', power: 'ON', temperature: { celsius: clamp(celsius, 5, 25) } },
        termination: { type: 'MANUAL' },
      }),
    });
  },

  async setPower(device, on) {
    const home = await homeId();
    if (on) {
      // "on" = resume the programmed schedule (clear the manual override)
      await api(`/homes/${home}/zones/${device.id}/overlay`, { method: 'DELETE' });
    } else {
      await api(`/homes/${home}/zones/${device.id}/overlay`, {
        method: 'PUT',
        body: JSON.stringify({
          setting: { type: 'HEATING', power: 'OFF' },
          termination: { type: 'MANUAL' },
        }),
      });
    }
  },
};
