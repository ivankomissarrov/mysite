import { createServer } from 'node:http';
import { ALLOWED_ORIGINS, buildMessage, corsHeaders, sendTelegram, validatePayload } from './shared.js';

const hits = new Map();
const port = Number(process.env.PORT) || 8787;

function tooMany(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((time) => now - time < 10 * 60 * 1000);
  if (recent.length >= 5) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

function send(response, origin, status, body) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders(origin),
  };
  response.writeHead(status, headers);
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin || '';

  if (request.method === 'OPTIONS') {
    response.writeHead(204, corsHeaders(origin));
    response.end();
    return;
  }

  if (request.method !== 'POST') {
    send(response, origin, 405, { ok: false, error: 'method' });
    return;
  }

  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    send(response, origin, 403, { ok: false, error: 'origin' });
    return;
  }

  const ip = request.headers['x-forwarded-for']?.split(',')[0]?.trim() || request.socket.remoteAddress || 'unknown';
  if (tooMany(ip)) {
    send(response, origin, 429, { ok: false, error: 'rate' });
    return;
  }

  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  let payload;
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    send(response, origin, 400, { ok: false, error: 'json' });
    return;
  }

  const check = validatePayload(payload);
  if (!check.ok) {
    send(response, origin, 400, { ok: false, error: check.error });
    return;
  }
  if (check.honeypot) {
    send(response, origin, 200, { ok: true });
    return;
  }

  const token = process.env.BOT_TOKEN;
  const chatId = process.env.CHAT_ID;
  if (!token || !chatId) {
    send(response, origin, 500, { ok: false, error: 'config' });
    return;
  }

  const sent = await sendTelegram(token, chatId, buildMessage(payload));
  send(response, origin, sent ? 200 : 502, sent ? { ok: true } : { ok: false, error: 'telegram' });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`order-bot listening on ${port}`);
});
