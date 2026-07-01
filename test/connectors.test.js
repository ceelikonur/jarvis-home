/**
 * Connector framework + Govee connector tests.
 * No real API key or devices needed — global fetch is mocked.
 *
 *   node test/connectors.test.js
 */

const assert = require('assert');

// ── Mock global fetch, recording the last request ──
let lastRequest = null;
function mockResponse(json, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return JSON.stringify(json); },
  };
}
global.fetch = async (url, opts = {}) => {
  lastRequest = { url, method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body ? JSON.parse(opts.body) : null };
  if (url.endsWith('/user/devices')) {
    return mockResponse({
      code: 200, message: 'success',
      data: [{
        sku: 'H6601',
        device: '9D:FA:85:EB:D3:00:8B:FF',
        deviceName: 'Salon Şerit',
        type: 'devices.types.light',
        capabilities: [
          { type: 'devices.capabilities.on_off', instance: 'powerSwitch' },
          { type: 'devices.capabilities.range', instance: 'brightness' },
          { type: 'devices.capabilities.color_setting', instance: 'colorRgb' },
        ],
      }],
    });
  }
  if (url.endsWith('/device/control')) {
    return mockResponse({ requestId: 'x', code: 200, msg: 'success', capability: {} });
  }
  // Home Assistant
  if (url.endsWith('/api/states')) {
    return mockResponse([
      { entity_id: 'light.salon', state: 'on', attributes: { friendly_name: 'Salon Lamba', supported_color_modes: ['rgb', 'brightness'] } },
      { entity_id: 'switch.priz', state: 'off', attributes: { friendly_name: 'Priz' } },
      { entity_id: 'climate.kalorifer', state: 'heat', attributes: { friendly_name: 'Kalorifer' } },
      { entity_id: 'vacuum.robot', state: 'docked', attributes: { friendly_name: 'Robot Süpürge' } },
      { entity_id: 'sensor.sicaklik', state: '21', attributes: { friendly_name: 'Sıcaklık' } },
    ]);
  }
  if (url.includes('/api/services/')) {
    return mockResponse([]); // HA returns the list of changed states
  }
  return mockResponse({ code: 404, message: 'not found' }, 404);
};

// ── Tiny test runner ──
let passed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failures.push({ name, err }); console.log(`  ✗ ${name}\n    ${err.message}`); }
}

(async () => {
  const base = require('../src/connectors/base');
  process.env.GOVEE_API_KEY = 'test-key-123';
  const govee = require('../src/connectors/govee');
  const registry = require('../src/connectors');
  registry._reset();

  console.log('base helpers');
  await test('parseColor word (kırmızı) → red', () => {
    assert.deepStrictEqual(base.parseColor('kırmızı'), { r: 255, g: 0, b: 0 });
  });
  await test('parseColor hex (#00ff00) → green', () => {
    assert.deepStrictEqual(base.parseColor('#00ff00'), { r: 0, g: 255, b: 0 });
  });
  await test('clamp bounds', () => {
    assert.strictEqual(base.clamp(500, 1, 100), 100);
    assert.strictEqual(base.clamp(-5, 0, 255), 0);
  });
  await test('matchDevice resolves spoken names', () => {
    const devices = [
      { name: 'Salon Lambası (demo)' },
      { name: 'Yatak Odası (demo)' },
      { name: 'Balkon Prizi (demo)' },
    ];
    assert.strictEqual(base.matchDevice(devices, 'salon').name, 'Salon Lambası (demo)');
    assert.strictEqual(base.matchDevice(devices, 'salonu').name, 'Salon Lambası (demo)'); // suffix
    assert.strictEqual(base.matchDevice(devices, 'yatak odası').name, 'Yatak Odası (demo)');
    assert.strictEqual(base.matchDevice(devices, 'mutfak'), null);
  });

  console.log('govee connector');
  await test('isConfigured reflects env', () => {
    assert.strictEqual(govee.isConfigured(), true);
    delete process.env.GOVEE_API_KEY;
    assert.strictEqual(govee.isConfigured(), false);
    process.env.GOVEE_API_KEY = 'test-key-123';
  });
  await test('listDevices parses capabilities', async () => {
    const devices = await govee.listDevices();
    assert.strictEqual(devices.length, 1);
    assert.strictEqual(devices[0].id, '9D:FA:85:EB:D3:00:8B:FF');
    assert.strictEqual(devices[0].model, 'H6601');
    assert.deepStrictEqual(devices[0].capabilities, ['power', 'brightness', 'color']);
  });
  await test('setPower sends on_off=1 with both identifiers + key header', async () => {
    const dev = { id: 'DEV', model: 'H6601', connectorId: 'govee' };
    await govee.setPower(dev, true);
    assert.strictEqual(lastRequest.method, 'POST');
    assert.ok(lastRequest.url.endsWith('/device/control'));
    assert.strictEqual(lastRequest.headers['Govee-API-Key'], 'test-key-123');
    assert.strictEqual(lastRequest.body.payload.sku, 'H6601');
    assert.strictEqual(lastRequest.body.payload.device, 'DEV');
    assert.strictEqual(lastRequest.body.payload.capability.instance, 'powerSwitch');
    assert.strictEqual(lastRequest.body.payload.capability.value, 1);
    assert.ok(lastRequest.body.requestId, 'requestId present');
  });
  await test('setBrightness clamps to 1..100', async () => {
    const dev = { id: 'DEV', model: 'H6601' };
    await govee.setBrightness(dev, 250);
    assert.strictEqual(lastRequest.body.payload.capability.instance, 'brightness');
    assert.strictEqual(lastRequest.body.payload.capability.value, 100);
  });
  await test('setColor packs RGB into 24-bit int (red=16711680)', async () => {
    const dev = { id: 'DEV', model: 'H6601' };
    await govee.setColor(dev, { r: 255, g: 0, b: 0 });
    assert.strictEqual(lastRequest.body.payload.capability.instance, 'colorRgb');
    assert.strictEqual(lastRequest.body.payload.capability.value, 16711680);
  });
  await test('API 401 surfaces a friendly error', async () => {
    const orig = global.fetch;
    global.fetch = async () => mockResponse({ message: 'invalid key' }, 401);
    let threw = false;
    try { await govee.setPower({ id: 'X', model: 'Y' }, true); }
    catch (e) { threw = true; assert.ok(/401/.test(e.message)); }
    global.fetch = orig;
    assert.ok(threw, 'should throw on 401');
  });

  console.log('home assistant connector');
  process.env.HASS_URL = 'http://ha.local:8123';
  process.env.HASS_TOKEN = 'ha-token';
  const hass = require('../src/connectors/homeassistant');
  await test('HA isConfigured needs URL + token', () => {
    assert.strictEqual(hass.isConfigured(), true);
    const saved = process.env.HASS_TOKEN; delete process.env.HASS_TOKEN;
    assert.strictEqual(hass.isConfigured(), false);
    process.env.HASS_TOKEN = saved;
  });
  await test('HA listDevices covers light/switch/climate/vacuum + reads caps', async () => {
    const devices = await hass.listDevices();
    assert.strictEqual(devices.length, 4); // sensor filtered out
    const byId = (id) => devices.find((d) => d.id === id);
    assert.deepStrictEqual(byId('light.salon').capabilities, ['power', 'brightness', 'color']);
    assert.deepStrictEqual(byId('switch.priz').capabilities, ['power']);
    assert.deepStrictEqual(byId('climate.kalorifer').capabilities, ['temperature', 'power']);
    assert.deepStrictEqual(byId('vacuum.robot').capabilities, ['vacuum']);
  });
  await test('HA setTemperature calls climate.set_temperature', async () => {
    await hass.setTemperature({ id: 'climate.kalorifer', model: 'climate' }, 21);
    assert.ok(lastRequest.url.endsWith('/api/services/climate/set_temperature'));
    assert.strictEqual(lastRequest.body.entity_id, 'climate.kalorifer');
    assert.strictEqual(lastRequest.body.temperature, 21);
  });
  await test('HA vacuum dock → return_to_base', async () => {
    await hass.vacuum({ id: 'vacuum.robot', model: 'vacuum' }, 'dock');
    assert.ok(lastRequest.url.endsWith('/api/services/vacuum/return_to_base'));
    assert.strictEqual(lastRequest.body.entity_id, 'vacuum.robot');
  });
  await test('HA setPower routes to the entity domain', async () => {
    await hass.setPower({ id: 'switch.priz', model: 'switch' }, true);
    assert.ok(lastRequest.url.endsWith('/api/services/switch/turn_on'));
    assert.strictEqual(lastRequest.body.entity_id, 'switch.priz');
    await hass.setPower({ id: 'light.salon', model: 'light' }, false);
    assert.ok(lastRequest.url.endsWith('/api/services/light/turn_off'));
  });
  await test('HA setBrightness uses brightness_pct on light.turn_on', async () => {
    await hass.setBrightness({ id: 'light.salon', model: 'light' }, 40);
    assert.ok(lastRequest.url.endsWith('/api/services/light/turn_on'));
    assert.strictEqual(lastRequest.body.brightness_pct, 40);
  });
  await test('HA setColor uses rgb_color array', async () => {
    await hass.setColor({ id: 'light.salon', model: 'light' }, { r: 10, g: 20, b: 30 });
    assert.deepStrictEqual(lastRequest.body.rgb_color, [10, 20, 30]);
  });
  await test('HA sends Bearer auth', async () => {
    await hass.setPower({ id: 'switch.priz', model: 'switch' }, true);
    assert.strictEqual(lastRequest.headers.Authorization, 'Bearer ha-token');
  });

  console.log('demo connector');
  const demo = require('../src/connectors/demo');
  await test('demo isConfigured only with DEMO_DEVICES flag', () => {
    assert.strictEqual(demo.isConfigured(), false);
    process.env.DEMO_DEVICES = '1';
    assert.strictEqual(demo.isConfigured(), true);
  });
  await test('demo listDevices: 3 virtual devices, priz power-only', async () => {
    const devices = await demo.listDevices();
    assert.strictEqual(devices.length, 3);
    const priz = devices.find((d) => d.id === 'demo-priz');
    assert.deepStrictEqual(priz.capabilities, ['power']);
  });
  await test('demo setPower/setColor mutate in-memory state', async () => {
    await demo.setPower({ id: 'demo-salon', name: 'x' }, true);
    assert.strictEqual(demo._state['demo-salon'].power, true);
    await demo.setColor({ id: 'demo-salon', name: 'x' }, { r: 1, g: 2, b: 3 });
    assert.deepStrictEqual(demo._state['demo-salon'].color, { r: 1, g: 2, b: 3 });
  });
  delete process.env.DEMO_DEVICES; // keep demo inactive for the registry tests below

  console.log('registry');
  await test('active() includes govee when configured', () => {
    const ids = registry.active().map((c) => c.id);
    assert.ok(ids.includes('govee'));
  });
  await test('listDevices tags connectorId + short key, control() dispatches', async () => {
    const devices = await registry.listDevices();
    assert.strictEqual(devices[0].connectorId, 'govee');
    assert.ok(devices[0].key, 'has short key');
    const resolved = registry.deviceByKey(devices[0].key);
    assert.strictEqual(resolved.id, devices[0].id);
    await registry.control(resolved, 'power', false);
    assert.strictEqual(lastRequest.body.payload.capability.value, 0);
  });
  await test('both connectors active → merged devices with unique keys', async () => {
    const devices = await registry.listDevices();
    const conns = new Set(devices.map((d) => d.connectorId));
    assert.ok(conns.has('govee') && conns.has('homeassistant'));
    const keys = devices.map((d) => d.key);
    assert.strictEqual(new Set(keys).size, keys.length);
    assert.ok(devices.length >= 3); // 1 govee + HA
  });
  await test('control rejects an action the connector cannot do', async () => {
    const devices = await registry.listDevices();
    const govee = devices.find((d) => d.connectorId === 'govee');
    await assert.rejects(() => registry.control(govee, 'temperature', 21));
    await assert.rejects(() => registry.control(govee, 'ptz', 'up'));
  });

  console.log('');
  if (failures.length) {
    console.log(`❌ ${failures.length} failed, ${passed} passed`);
    process.exit(1);
  }
  console.log(`✅ all ${passed} tests passed`);
})();
