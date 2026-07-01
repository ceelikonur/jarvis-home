/**
 * Small .env writer used by the web connector-config UI.
 *
 * Updates the running process (process.env) so changes take effect immediately
 * — connectors read process.env at call time — and persists them to the .env
 * file so they survive a restart. .env is gitignored, so nothing is published.
 */

const fs = require('fs');
const path = require('path');

const ENV_PATH = path.resolve(__dirname, '../../.env');

/**
 * @param {Object<string,string>} updates  KEY -> value (value '' clears it)
 */
function setEnvVars(updates) {
  let lines = [];
  if (fs.existsSync(ENV_PATH)) {
    lines = fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/);
  }
  const seen = new Set();
  lines = lines.map((line) => {
    const m = line.match(/^([A-Z0-9_]+)=/);
    if (m && Object.prototype.hasOwnProperty.call(updates, m[1])) {
      seen.add(m[1]);
      return `${m[1]}=${updates[m[1]]}`;
    }
    return line;
  });
  const extra = Object.keys(updates).filter((k) => !seen.has(k));
  if (extra.length) {
    if (lines.length && lines[lines.length - 1].trim() !== '') lines.push('');
    for (const k of extra) lines.push(`${k}=${updates[k]}`);
  }
  fs.writeFileSync(ENV_PATH, lines.join('\n'));

  // Reflect into the live process so the change is effective without a restart.
  for (const [k, v] of Object.entries(updates)) {
    if (v === '') delete process.env[k];
    else process.env[k] = v;
  }
}

module.exports = { setEnvVars, ENV_PATH };
