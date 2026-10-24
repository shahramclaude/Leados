#!/usr/bin/env node
/**
 * scripts/serve.mjs — zero-dependency static server for the LeadOS app.
 *
 * The app has no build step: index.html loads ES modules straight from disk.
 * That only works over HTTP (file:// blocks modules for security reasons), so
 * this is the required local entry point.
 *
 * Usage: node scripts/serve.mjs [--port 5173] [--host 0.0.0.0]
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}
const PORT = Number(process.env.PORT || arg('--port', 5173));
const HOST = arg('--host', '0.0.0.0');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname);
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end('Bad request');
    return;
  }

  if (pathname.endsWith('/')) pathname += 'index.html';
  const target = path.join(ROOT, pathname);
  // Refuse anything that escapes the repository root.
  if (!target.startsWith(ROOT + path.sep) && target !== ROOT) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  // Never serve the repository internals, credentials or test artefacts.
  const rel = path.relative(ROOT, target).split(path.sep);
  if (rel.includes('.git') || rel.includes('node_modules') || rel[0] === 'tests') {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
    return;
  }

  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) {
      // Single-page app: unknown paths fall back to index.html so hash routes work.
      if (!path.extname(pathname)) {
        return send(path.join(ROOT, 'index.html'), res);
      }
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`Not found: ${pathname}`);
      return;
    }
    send(target, res);
  });
});

function send(file, res) {
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    res.end(data);
  });
}

server.listen(PORT, HOST, () => {
  console.log(`LeadOS running at http://${HOST}:${PORT}/`);
  console.log(`  root: ${ROOT}`);
  console.log('  no build step, no database, no network calls');
});
