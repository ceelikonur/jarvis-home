/**
 * Smart-home connector contract.
 *
 * A connector is a plain object exported from a file in src/connectors/ (one
 * file per integration, e.g. govee.js). The registry (index.js) auto-discovers
 * every such file, so adding a new integration is just dropping in a file that
 * implements this shape — the bot command and the onboarding wizard pick it up
 * automatically.
 *
 * @typedef {Object} Device
 * @property {string} id          Stable device id within the connector
 * @property {string} name        Human label ("Salon Lambası")
 * @property {string} connectorId Owning connector id (filled in by the registry)
 * @property {string} [model]     Vendor model/sku, when the API needs it
 * @property {string[]} capabilities  Subset of CAPABILITIES this device supports
 *
 * @typedef {Object} Connector
 * @property {string} id            Unique id, e.g. 'govee'
 * @property {string} name          Display name, e.g. 'Govee'
 * @property {string} description   One line, shown in onboarding
 * @property {string[]} requiredEnv Env vars needed to use it, e.g. ['GOVEE_API_KEY']
 * @property {Object<string,string>} [configHints]  envKey -> help text for the wizard
 * @property {string[]} capabilities  What it can do (subset of CAPABILITIES)
 * @property {() => boolean} isConfigured  True when all requiredEnv are present
 * @property {() => Promise<Device[]>} listDevices
 * @property {(device: Device, on: boolean) => Promise<void>} [setPower]
 * @property {(device: Device, pct: number) => Promise<void>} [setBrightness]   // 0..100
 * @property {(device: Device, rgb: {r:number,g:number,b:number}) => Promise<void>} [setColor]
 */

/** Canonical capability names shared across connectors. */
const CAPABILITIES = {
  POWER: 'power',
  BRIGHTNESS: 'brightness',
  COLOR: 'color',
};

/** Clamp a number into [min, max]. */
function clamp(n, min, max) {
  n = Number(n);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** Default isConfigured: every required env var is a non-empty string. */
function envConfigured(requiredEnv) {
  return (requiredEnv || []).every((k) => !!process.env[k] && process.env[k].trim() !== '');
}

/** Parse common color words / hex into {r,g,b}, or null if unrecognised. */
const COLOR_WORDS = {
  kırmızı: { r: 255, g: 0, b: 0 }, red: { r: 255, g: 0, b: 0 },
  yeşil: { r: 0, g: 255, b: 0 }, green: { r: 0, g: 255, b: 0 },
  mavi: { r: 0, g: 0, b: 255 }, blue: { r: 0, g: 0, b: 255 },
  beyaz: { r: 255, g: 255, b: 255 }, white: { r: 255, g: 255, b: 255 },
  sarı: { r: 255, g: 220, b: 0 }, yellow: { r: 255, g: 220, b: 0 },
  turuncu: { r: 255, g: 120, b: 0 }, orange: { r: 255, g: 120, b: 0 },
  mor: { r: 150, g: 0, b: 255 }, purple: { r: 150, g: 0, b: 255 },
  pembe: { r: 255, g: 80, b: 180 }, pink: { r: 255, g: 80, b: 180 },
};

function parseColor(input) {
  if (!input) return null;
  const s = String(input).trim().toLowerCase();
  if (COLOR_WORDS[s]) return COLOR_WORDS[s];
  const hex = s.match(/^#?([0-9a-f]{6})$/);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  return null;
}

/**
 * Resolve a spoken device name to a device from a list.
 * Tries: exact (case-insensitive) → device name contains the query →
 * query contains the device's first word ("salon" ← "Salon Lambası").
 */
function matchDevice(devices, query) {
  const q = String(query || '').toLowerCase().trim();
  if (!q || !Array.isArray(devices)) return null;
  const names = devices.map((d) => ({ d, n: String(d.name || '').toLowerCase() }));
  return (
    names.find((x) => x.n === q)?.d ||
    names.find((x) => x.n.includes(q))?.d ||
    names.find((x) => {
      const first = x.n.split(/[\s(]/)[0];
      return first.length >= 3 && q.includes(first);
    })?.d ||
    null
  );
}

module.exports = { CAPABILITIES, clamp, envConfigured, parseColor, COLOR_WORDS, matchDevice };
