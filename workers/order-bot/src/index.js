import { ALLOWED_ORIGINS, buildMessage, corsHeaders, sendTelegram, validatePayload } from '../shared.js';

const hits = new Map();

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(origin),
    },
  });
}

function tooMany(ip) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const recent = (hits.get(ip) ?? []).filter((time) => now - time < windowMs);
  if (recent.length >= 5) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'POST') {
      return json({ ok: false, error: 'method' }, 405, origin);
    }

    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return json({ ok: false, error: 'origin' }, 403, origin);
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (tooMany(ip)) {
      return json({ ok: false, error: 'rate' }, 429, origin);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ ok: false, error: 'json' }, 400, origin);
    }

    const check = validatePayload(payload);
    if (!check.ok) return json({ ok: false, error: check.error }, 400, origin);
    if (check.honeypot) return json({ ok: true }, 200, origin);

    if (!env.BOT_TOKEN || !env.CHAT_ID) {
      return json({ ok: false, error: 'config' }, 500, origin);
    }

    const sent = await sendTelegram(env.BOT_TOKEN, env.CHAT_ID, buildMessage(payload));
    return sent ? json({ ok: true }, 200, origin) : json({ ok: false, error: 'telegram' }, 502, origin);
  },
};
