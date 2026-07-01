/**
 * ONVIF camera connector — works with Tapo (C-series) and any ONVIF camera.
 *
 * Local-only: talks to the camera on your LAN via the ONVIF protocol. Pan/tilt
 * moves and still snapshots. (Privacy-mode / alarm aren't in ONVIF — use Home
 * Assistant's Tapo integration for those.)
 *
 * Credentials = the *camera account* you set in the Tapo app under
 * Advanced Settings → Camera Account (NOT your TP-Link cloud login):
 *   CAMERA_HOST=192.168.1.50   CAMERA_USER=...   CAMERA_PASS=...
 *   CAMERA_PORT=2020 (Tapo ONVIF default)   CAMERA_NAME="Salon Kamera" (optional)
 *
 * Requires Node 18+ (global fetch).
 */

const crypto = require('crypto');
const { Cam } = require('onvif');
const { CAPABILITIES, envConfigured } = require('./base');

let _cam = null;
let _camHost = null;

function host() { return (process.env.CAMERA_HOST || '').trim(); }
function user() { return (process.env.CAMERA_USER || '').trim(); }
function pass() { return process.env.CAMERA_PASS || ''; }

function connect() {
  const h = host();
  if (!h) return Promise.reject(new Error('Kamera yapılandırılmamış'));
  if (_cam && _camHost === h) return _cam;
  _camHost = h;
  _cam = new Promise((resolve, reject) => {
    const cam = new Cam(
      { hostname: h, username: user(), password: pass(), port: Number(process.env.CAMERA_PORT) || 2020, timeout: 10000 },
      (err) => {
        if (err) { _cam = null; return reject(new Error('Kameraya bağlanılamadı: ' + err.message)); }
        resolve(cam);
      }
    );
  });
  return _cam;
}

const DIRECTIONS = {
  up: { x: 0, y: 0.6 },
  down: { x: 0, y: -0.6 },
  left: { x: -0.6, y: 0 },
  right: { x: 0.6, y: 0 },
};

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

// GET a URL with HTTP Digest (falls back to Basic) — ONVIF snapshots need this.
async function authedGet(url) {
  let res = await fetch(url);
  if (res.status !== 401) return res;
  const wa = res.headers.get('www-authenticate') || '';
  if (!/digest/i.test(wa)) {
    return fetch(url, { headers: { Authorization: 'Basic ' + Buffer.from(`${user()}:${pass()}`).toString('base64') } });
  }
  const p = {};
  wa.replace(/(\w+)=(?:"([^"]*)"|([^,]*))/g, (_, k, v1, v2) => { p[k.toLowerCase()] = v1 !== undefined ? v1 : v2; return ''; });
  const u = new URL(url);
  const uri = u.pathname + (u.search || '');
  const ha1 = md5(`${user()}:${p.realm}:${pass()}`);
  const ha2 = md5(`GET:${uri}`);
  const cnonce = crypto.randomBytes(8).toString('hex');
  const nc = '00000001';
  let response, header;
  if (p.qop) {
    response = md5(`${ha1}:${p.nonce}:${nc}:${cnonce}:${p.qop}:${ha2}`);
    header = `Digest username="${user()}", realm="${p.realm}", nonce="${p.nonce}", uri="${uri}", qop=${p.qop}, nc=${nc}, cnonce="${cnonce}", response="${response}"${p.opaque ? `, opaque="${p.opaque}"` : ''}`;
  } else {
    response = md5(`${ha1}:${p.nonce}:${ha2}`);
    header = `Digest username="${user()}", realm="${p.realm}", nonce="${p.nonce}", uri="${uri}", response="${response}"${p.opaque ? `, opaque="${p.opaque}"` : ''}`;
  }
  return fetch(url, { headers: { Authorization: header } });
}

module.exports = {
  id: 'camera',
  name: 'Kamera',
  description: 'Tapo / ONVIF kamera — döndürme (PTZ) + anlık görüntü (yerel)',
  requiredEnv: ['CAMERA_HOST', 'CAMERA_USER', 'CAMERA_PASS'],
  configHints: {
    CAMERA_HOST: 'kameranın yerel IP\'si, ör. 192.168.1.50',
    CAMERA_USER: 'Tapo app → Gelişmiş → Kamera Hesabı kullanıcı adı',
    CAMERA_PASS: 'Kamera Hesabı şifresi',
  },
  capabilities: [CAPABILITIES.PTZ, CAPABILITIES.SNAPSHOT],

  isConfigured() { return envConfigured(this.requiredEnv); },

  async listDevices() {
    if (!host()) return [];
    return [{
      id: host(),
      name: (process.env.CAMERA_NAME || '').trim() || 'Kamera',
      model: 'onvif',
      capabilities: [CAPABILITIES.PTZ, CAPABILITIES.SNAPSHOT],
    }];
  },

  async ptz(device, direction) {
    const vec = DIRECTIONS[direction];
    if (!vec) throw new Error('Yön geçersiz: ' + direction);
    const cam = await connect();
    await new Promise((res, rej) => cam.continuousMove({ x: vec.x, y: vec.y, zoom: 0 }, (e) => (e ? rej(e) : res())));
    await new Promise((r) => setTimeout(r, 500));
    await new Promise((res) => cam.stop({ panTilt: true, zoom: true }, () => res()));
  },

  async snapshotUri(device) {
    const cam = await connect();
    return new Promise((res, rej) =>
      cam.getSnapshotUri({}, (e, r) => (e ? rej(e) : res(r && r.uri)))
    );
  },

  // Fetch the current frame (with digest auth) for the web proxy endpoint.
  async snapshotImage(device) {
    const uri = await this.snapshotUri(device);
    if (!uri) throw new Error('Görüntü adresi alınamadı');
    const res = await authedGet(uri);
    if (!res.ok) throw new Error('Görüntü alınamadı: ' + res.status);
    return { buffer: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') || 'image/jpeg' };
  },
};
