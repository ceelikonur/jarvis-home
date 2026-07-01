/**
 * Govee connector — Platform API v2 (https://developer.govee.com).
 *
 * Controls Govee smart lights (bulbs, LED strips): on/off, brightness, colour.
 * Needs a personal API key: Govee Home app → profile → About Us → Apply for
 * API Key (arrives by email). Put it in .env as GOVEE_API_KEY.
 *
 * Requires Node 18+ (global fetch).
 */

const { CAPABILITIES, clamp, envConfigured } = require('./base');

const BASE_URL = 'https://openapi.api.govee.com/router/api/v1';

function apiKey() {
  return (process.env.GOVEE_API_KEY || '').trim();
}

function requestId() {
  try {
    return require('crypto').randomUUID();
  } catch {
    return `jarvis-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }
}

async function api(pathname, { method = 'GET', body } = {}) {
  if (typeof fetch !== 'function') {
    throw new Error('global fetch unavailable — Node 18+ required for the Govee connector');
  }
  const res = await fetch(BASE_URL + pathname, {
    method,
    headers: {
      'Govee-API-Key': apiKey(),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON error body */ }

  // Govee can return a non-200 `code` inside an HTTP 200, so check both.
  if (!res.ok || (json.code !== undefined && json.code !== 200)) {
    const msg = json.message || json.msg || text || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    if (res.status === 401) err.message = 'Govee API anahtarı geçersiz (401)';
    if (res.status === 429) err.message = 'Govee limit aşıldı (429) — biraz sonra tekrar deneyin';
    throw err;
  }
  return json;
}

/** Send a single capability control to a device. */
function control(device, capability) {
  return api('/device/control', {
    method: 'POST',
    body: {
      requestId: requestId(),
      payload: { sku: device.model, device: device.id, capability },
    },
  });
}

module.exports = {
  id: 'govee',
  name: 'Govee',
  description: 'Govee akıllı ışıklar (ampul/LED şerit) — aç/kapa, parlaklık, renk',
  requiredEnv: ['GOVEE_API_KEY'],
  configHints: {
    GOVEE_API_KEY: 'Govee Home app → profil → About Us → Apply for API Key',
  },
  capabilities: [CAPABILITIES.POWER, CAPABILITIES.BRIGHTNESS, CAPABILITIES.COLOR],

  isConfigured() {
    return envConfigured(this.requiredEnv);
  },

  async listDevices() {
    const json = await api('/user/devices');
    const data = json.data || [];
    return data
      .map((d) => {
        const instances = (d.capabilities || []).map((c) => c.instance);
        const capabilities = [];
        if (instances.includes('powerSwitch')) capabilities.push(CAPABILITIES.POWER);
        if (instances.includes('brightness')) capabilities.push(CAPABILITIES.BRIGHTNESS);
        if (instances.includes('colorRgb')) capabilities.push(CAPABILITIES.COLOR);
        return {
          id: d.device,
          name: d.deviceName || d.sku || d.device,
          model: d.sku,
          capabilities,
        };
      })
      .filter((d) => d.id && d.model);
  },

  async setPower(device, on) {
    await control(device, {
      type: 'devices.capabilities.on_off',
      instance: 'powerSwitch',
      value: on ? 1 : 0,
    });
  },

  async setBrightness(device, pct) {
    await control(device, {
      type: 'devices.capabilities.range',
      instance: 'brightness',
      value: clamp(Math.round(pct), 1, 100),
    });
  },

  async setColor(device, { r, g, b }) {
    const R = clamp(Math.round(r), 0, 255);
    const G = clamp(Math.round(g), 0, 255);
    const B = clamp(Math.round(b), 0, 255);
    await control(device, {
      type: 'devices.capabilities.color_setting',
      instance: 'colorRgb',
      value: (R << 16) | (G << 8) | B,
    });
  },
};
