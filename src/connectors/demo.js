/**
 * Demo connector — virtual devices for testing, no hardware or API key needed.
 *
 * Enable it by setting DEMO_DEVICES=1 in .env, then use /cihazlar in the bot to
 * click through On/Off, brightness and colour on in-memory devices. Handy for
 * trying the smart-home flow (and for new users kicking the tyres) before
 * wiring a real connector like Govee or Home Assistant.
 */

const { CAPABILITIES, clamp } = require('./base');

const DEVICES = [
  { id: 'demo-salon', name: 'Salon Lambası (demo)', full: true },
  { id: 'demo-yatak', name: 'Yatak Odası (demo)', full: true },
  { id: 'demo-priz', name: 'Balkon Prizi (demo)', full: false },
];

// In-memory device state so the buttons visibly "do" something.
const state = {};
function stateOf(id) {
  if (!state[id]) state[id] = { power: false, brightness: 100, color: { r: 255, g: 255, b: 255 } };
  return state[id];
}
function log(device, what) {
  console.log(`[demo] ${device.name}: ${what}`);
}

module.exports = {
  id: 'demo',
  name: 'Demo cihazları',
  description: 'Sanal test cihazları — donanım/API gerektirmez (DEMO_DEVICES=1)',
  requiredEnv: ['DEMO_DEVICES'],
  configHints: { DEMO_DEVICES: 'test için 1 yazın' },
  capabilities: [CAPABILITIES.POWER, CAPABILITIES.BRIGHTNESS, CAPABILITIES.COLOR],

  isConfigured() {
    const v = (process.env.DEMO_DEVICES || '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes' || v === 'on';
  },

  async listDevices() {
    return DEVICES.map((d) => ({
      id: d.id,
      name: d.name,
      model: 'virtual',
      capabilities: d.full
        ? [CAPABILITIES.POWER, CAPABILITIES.BRIGHTNESS, CAPABILITIES.COLOR]
        : [CAPABILITIES.POWER],
    }));
  },

  async setPower(device, on) {
    stateOf(device.id).power = !!on;
    log(device, `power=${on ? 'on' : 'off'}`);
  },

  async setBrightness(device, pct) {
    stateOf(device.id).brightness = clamp(Math.round(pct), 0, 100);
    log(device, `brightness=${stateOf(device.id).brightness}%`);
  },

  async setColor(device, { r, g, b }) {
    stateOf(device.id).color = { r, g, b };
    log(device, `color=rgb(${r},${g},${b})`);
  },

  // Exposed for tests.
  _state: state,
};
