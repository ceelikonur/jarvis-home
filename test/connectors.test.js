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

  console.log('');
  if (failures.length) {
    console.log(`❌ ${failures.length} failed, ${passed} passed`);
    process.exit(1);
  }
  console.log(`✅ all ${passed} tests passed`);
})();
