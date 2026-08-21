#!/usr/bin/env node
/**
 * Local order-catalog editor server.
 *   node scripts/order-editor-server.mjs
 * Opens on http://0.0.0.0:8765/tools/order-editor.html
 *
 * GET  /api/catalog  → current src/data/order-catalog.json
 * POST /api/save     → write body to src/data/order-catalog.json
 */
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = path.join(root, 'src', 'data', 'order-catalog.json');
const port = Number(process.env.ORDER_EDITOR_PORT || 8765);
const host = process.env.ORDER_EDITOR_HOST || '0.0.0.0';

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(data);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const { pathname } = url;

    if (req.method === 'OPTIONS') {
      send(res, 204, '');
      return;
    }

    if (pathname === '/api/catalog' && req.method === 'GET') {
      const json = await readFile(catalogPath, 'utf8');
      send(res, 200, json, 'application/json; charset=utf-8');
      return;
    }

    if (pathname === '/api/save' && req.method === 'POST') {
      const raw = await readBody(req);
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.products)) {
        send(res, 400, { ok: false, error: 'Invalid catalog JSON' });
        return;
      }
      const pretty = `${JSON.stringify(parsed, null, 2)}\n`;
      await writeFile(catalogPath, pretty, 'utf8');
      send(res, 200, { ok: true, path: 'src/data/order-catalog.json', bytes: Buffer.byteLength(pretty) });
      return;
    }

    let filePath = pathname;
    if (pathname === '/' || pathname === '/order-editor' || pathname === '/order-editor.html') {
      filePath = '/tools/order-editor.html';
    }
    if (filePath.includes('..')) {
      send(res, 400, 'Bad path');
      return;
    }
    const abs = path.join(root, filePath.replace(/^\//, ''));
    if (!abs.startsWith(root)) {
      send(res, 400, 'Bad path');
      return;
    }
    const data = await readFile(abs);
    const ext = path.extname(abs).toLowerCase();
    send(res, 200, data, mime[ext] || 'application/octet-stream');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      send(res, 404, 'Not found');
      return;
    }
    console.error(error);
    send(res, 500, String(error?.message || error));
  }
});

server.listen(port, host, () => {
  console.log(`Order editor: http://127.0.0.1:${port}/tools/order-editor.html`);
  console.log(`Catalog API:  http://127.0.0.1:${port}/api/catalog`);
  console.log(`Save API:     POST http://127.0.0.1:${port}/api/save`);
});
