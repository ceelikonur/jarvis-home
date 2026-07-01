/**
 * Connector registry.
 *
 * Auto-discovers every connector file in this directory (except base.js and
 * this index) and exposes a unified API the bot / web / AI layers use to list
 * and control smart-home devices. Adding an integration = dropping a new file
 * that implements the contract in base.js — no wiring changes needed.
 */

const fs = require('fs');
const path = require('path');

let _connectors = null;

function loadConnectors() {
  if (_connectors) return _connectors;
  const skip = new Set(['index.js', 'base.js']);
  const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.js') && !skip.has(f));
  const out = [];
  for (const file of files) {
    try {
      const c = require(path.join(__dirname, file));
      if (c && typeof c.id === 'string' && typeof c.listDevices === 'function') {
        out.push(c);
      } else {
        console.warn(`[connectors] ${file} does not implement the connector contract — skipped`);
      }
    } catch (err) {
      console.warn(`[connectors] failed to load ${file}: ${err.message}`);
    }
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  _connectors = out;
  return out;
}

/** All known connectors (configured or not) — used by onboarding. */
function all() {
  return loadConnectors();
}

/** Connectors whose credentials are present. */
function active() {
  return loadConnectors().filter((c) => {
    try { return c.isConfigured(); } catch { return false; }
  });
}

function get(id) {
  return loadConnectors().find((c) => c.id === id) || null;
}

// ── Device cache — short keys for Telegram callback_data (max 64 bytes) ──
const _deviceByKey = new Map();

/**
 * List devices across all active connectors. Each device is tagged with its
 * connectorId and a short stable `key` usable in callback data. Failures in
 * one connector don't sink the others.
 */
async function listDevices() {
  const conns = active();
  const results = await Promise.all(
    conns.map(async (c) => {
      try {
        const devices = await c.listDevices();
        return (devices || []).map((d) => ({ ...d, connectorId: c.id }));
      } catch (err) {
        console.warn(`[connectors] ${c.id} listDevices failed: ${err.message}`);
        return [];
      }
    })
  );
  const flat = results.flat();
  _deviceByKey.clear();
  flat.forEach((d, i) => {
    const key = `${d.connectorId[0]}${i}`; // e.g. g0, g1
    d.key = key;
    _deviceByKey.set(key, d);
  });
  return flat;
}

/** Resolve a device previously returned by listDevices() by its short key. */
function deviceByKey(key) {
  return _deviceByKey.get(key) || null;
}

/** Devices from the most recent listDevices() call (no API hit) — for menu redraws. */
function cachedDevices() {
  return [..._deviceByKey.values()];
}

/** Dispatch a control action to the owning connector. */
async function control(device, action, value) {
  const c = get(device.connectorId);
  if (!c) throw new Error(`Unknown connector: ${device.connectorId}`);
  switch (action) {
    case 'power':
      if (!c.setPower) throw new Error(`${c.name} cannot switch power`);
      return c.setPower(device, !!value);
    case 'brightness':
      if (!c.setBrightness) throw new Error(`${c.name} cannot set brightness`);
      return c.setBrightness(device, value);
    case 'color':
      if (!c.setColor) throw new Error(`${c.name} cannot set color`);
      return c.setColor(device, value);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

/** Test hook — forget the cached connector list so a re-require re-scans. */
function _reset() { _connectors = null; }

module.exports = { all, active, get, listDevices, deviceByKey, cachedDevices, control, _reset };
