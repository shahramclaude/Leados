import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const backup = path.join(ROOT, `tmp/server-private-${process.pid}.json`);
const alias = path.join(ROOT, `app/server-private-${process.pid}.js`);
let child, base, linked = false;
before(async () => {
  await fs.mkdir(path.dirname(backup), { recursive: true });
  await fs.writeFile(backup, JSON.stringify({ privateNote: 'A test sentinel, not real employee data.' }));
  await fs.symlink(backup, alias); linked = true;
  child = spawn(process.execPath, ['scripts/serve.mjs', '--host', '0.0.0.0', '--port', '0'],
    { cwd: ROOT, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Static server did not start: ${output}`)), 10000);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('exit', (code) => { clearTimeout(timer); if (!base) reject(new Error(`Static server exited ${code}: ${output}`)); });
    child.stderr.on('data', (data) => { output += data.toString(); });
    child.stdout.on('data', (data) => {
      output += data.toString(); const match = output.match(/LeadOS running at http:\/\/0\.0\.0\.0:(\d+)\//);
      if (match) { clearTimeout(timer); base = `http://127.0.0.1:${match[1]}`; resolve(); }
    });
  });
});
after(async () => {
  if (child && child.exitCode === null) {
    await new Promise((resolve) => { child.once('exit', resolve); child.kill('SIGTERM'); });
  }
  if (linked) await fs.unlink(alias);
  await fs.rm(backup, { force: true });
});

test('static server serves the canonical shell and JS/CSS with preview-style Host/Origin accepted', async () => {
  for (const [route, mime] of [['/', 'text/html'], ['/index.html', 'text/html'], ['/app/main.js', 'text/javascript'], ['/app/styles.css', 'text/css']]) {
    const response = await fetch(base + route, { headers: { host: '5173-preview.e2b.app', origin: 'https://5173-preview.e2b.app' } });
    assert.equal(response.status, 200, route); assert.ok(response.headers.get('content-type').startsWith(mime));
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  }
});

test('static server never serves scratch backups, credentials, repository internals, test tools or legacy source', async () => {
  for (const route of [`/tmp/${path.basename(backup)}`, '/.env', '/.env.local', '/.git/config', '/README.md',
    '/app/package.json', '/tests/app/server.test.mjs', '/src/db/index.ts', '/node_modules/jsdom/package.json', '/public/index.html']) {
    assert.equal((await fetch(base + route)).status, 404, route);
  }
});

test('static server blocks symlink aliases, encoded traversal and malformed URLs', async () => {
  for (const route of [`/app/${path.basename(alias)}`, `/app/%2e%2e/tmp/${path.basename(backup)}`, '/%2e%2e%2f.env', '/not-a-route.js']) {
    const response = await fetch(base + route); assert.ok([400, 403, 404].includes(response.status), `${route}: ${response.status}`);
  }
  assert.equal((await fetch(base + '/%zz')).status, 400);
});

test('static server accepts GET/HEAD but has no write-method surface', async () => {
  const head = await fetch(base + '/', { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const response = await fetch(base + '/', { method }); assert.equal(response.status, 405); assert.equal(response.headers.get('allow'), 'GET, HEAD');
  }
});
