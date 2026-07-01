/**
 * Home Assistant connector — REST API (https://developers.home-assistant.io/docs/api/rest/).
 *
 * One integration unlocks every light/switch entity in a Home Assistant
 * install — fully local, no cloud. Needs the base URL and a Long-Lived Access
 * Token (HA → profile → Long-Lived Access Tokens → Create Token).
 *
 *   HASS_URL=http://homeassistant.local:8123
 *   HASS_TOKEN=<long-lived token>
 *
 * Requires Node 18+ (global fetch).
 */

const { CAPABILITIES, clamp, envConfigured } = require('./base');

const COLOR_MODES = ['hs', 'rgb', 'rgbw', 'rgbww', 'xy'];

function baseUrl() {
  return (process.env.HASS_URL || '').trim().replace(/\/+$/, '');
}
function token() {
  return (process.env.HASS_TOKEN || '').trim();
}

async function api(pathname, { method = 'GET', body } = {}) {
  if (typeof fetch !== 'function') {
    throw new Error('global fetch unavailable — Node 18+ required for the Home Assistant connector');
  }
  const res = await fetch(baseUrl() + pathname, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let msg = text || `HTTP ${res.status}`;
    if (res.status === 401) msg = 'Home Assistant token geçersiz (401)';
    if (res.status === 404) msg = 'Home Assistant endpoint bulunamadı (404) — HASS_URL doğru mu?';
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  const text = await res.text();
  try { return text ? JSON.parse(text) : {}; } catch { return {}; }
}

/** domain of an entity_id, e.g. "light" from "light.salon". */
function domainOf(entityId) {
  return String(entityId).split('.')[0];
}

async function callService(domain, service, data) {
  return api(`/api/services/${domain}/${service}`, { method: 'POST', body: data });
}

module.exports = {
  id: 'homeassistant',
  name: 'Home Assistant',
  description: 'Home Assistant ışık/priz entity\'leri (yerel, bulutsuz)',
  requiredEnv: ['HASS_URL', 'HASS_TOKEN'],
  configHints: {
    HASS_URL: 'ör. http://homeassistant.local:8123',
    HASS_TOKEN: 'HA → profil → Long-Lived Access Tokens → Create Token',
  },
  capabilities: [CAPABILITIES.POWER, CAPABILITIES.BRIGHTNESS, CAPABILITIES.COLOR],

  isConfigured() {
    return envConfigured(this.requiredEnv);
  },

  async listDevices() {
    const states = await api('/api/states');
    return (states || [])
      .filter((s) => s.entity_id && /^(light|switch|climate|vacuum|media_player)\./.test(s.entity_id))
      .map((s) => {
        const attrs = s.attributes || {};
        const domain = domainOf(s.entity_id);
        let capabilities = [];
        if (domain === 'light') {
          capabilities = [CAPABILITIES.POWER];
          const modes = attrs.supported_color_modes || [];
          const hasColor = modes.some((m) => COLOR_MODES.includes(m));
          const hasBrightness = hasColor || modes.includes('brightness') || modes.includes('color_temp');
          if (hasBrightness) capabilities.push(CAPABILITIES.BRIGHTNESS);
          if (hasColor) capabilities.push(CAPABILITIES.COLOR);
        } else if (domain === 'switch' || domain === 'media_player') {
          capabilities = [CAPABILITIES.POWER];
        } else if (domain === 'climate') {
          capabilities = [CAPABILITIES.TEMPERATURE, CAPABILITIES.POWER];
        } else if (domain === 'vacuum') {
          capabilities = [CAPABILITIES.VACUUM];
        }
        return {
          id: s.entity_id,
          name: attrs.friendly_name || s.entity_id,
          model: domain, // 'light' | 'switch' | 'climate' | 'vacuum'
          capabilities,
        };
      });
  },

  async setPower(device, on) {
    const domain = device.model || domainOf(device.id);
    await callService(domain, on ? 'turn_on' : 'turn_off', { entity_id: device.id });
  },

  async setTemperature(device, celsius) {
    await callService('climate', 'set_temperature', {
      entity_id: device.id,
      temperature: clamp(Math.round(celsius), 5, 35),
    });
  },

  async vacuum(device, action) {
    const service = { start: 'start', stop: 'stop', dock: 'return_to_base' }[action] || action;
    await callService('vacuum', service, { entity_id: device.id });
  },

  async setBrightness(device, pct) {
    await callService('light', 'turn_on', {
      entity_id: device.id,
      brightness_pct: clamp(Math.round(pct), 0, 100),
    });
  },

  async setColor(device, { r, g, b }) {
    await callService('light', 'turn_on', {
      entity_id: device.id,
      rgb_color: [clamp(Math.round(r), 0, 255), clamp(Math.round(g), 0, 255), clamp(Math.round(b), 0, 255)],
    });
  },
};
