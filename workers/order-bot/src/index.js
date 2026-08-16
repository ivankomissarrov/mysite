const ALLOWED_ORIGINS = [
  'https://ivankomissarrov.github.io',
  'http://127.0.0.1:4321',
  'http://localhost:4321',
  'http://0.0.0.0:4321',
];

const hits = new Map();

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(origin),
    },
  });
}

function formatRub(value) {
  return `${Math.round(Number(value) || 0).toLocaleString('ru-RU').replace(/[\u00A0\u202F]/g, ' ')} ₽`;
}

function buildMessage(payload) {
  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  const blocks = lines.map((line, index) => {
    const n = index + 1;
    const name = String(line.name ?? 'Позиция');
    const detail = String(line.detail ?? '');
    const title = detail ? `${name} — ${detail}` : name;
    const extras = (Array.isArray(line.options) ? line.options : [])
      .map((option) => `   + ${option}`)
      .join('\n');
    const price = Number(line.total) > 0 ? formatRub(line.total) : String(payload.negotiableLabel || 'по договорённости');
    if (extras) return `${n}. ${title}\n${extras}\n   = ${price}`;
    return `${n}. ${title} — ${price}`;
  });

  const total = Number(payload.total) || 0;
  const totalLine = payload.negotiable || total <= 0
    ? `Итого: ${payload.negotiableLabel || 'по договорённости'}`
    : `Итого: от ${formatRub(total)}`;
  const discountPercent = Number(payload.discountPercent) || 0;
  const discountLine = discountPercent
    ? `Скидка ${discountPercent}%: −${formatRub(payload.discountAmount)}`
    : '';
  const variance = Number(payload.variancePercent) || 20;

  return [
    'Новый заказ с сайта',
    '',
    ...blocks,
    '',
    Number(payload.subtotal) > 0 ? `Сумма: ${formatRub(payload.subtotal)}` : null,
    discountLine || null,
    totalLine,
    `(ориентировочно, ±${variance}%)`,
    '',
    `Телефон: ${String(payload.phone ?? '').trim() || '—'}`,
    `Мессенджер: ${String(payload.messenger ?? '').trim() || '—'}`,
    `Комментарий: ${String(payload.comment ?? '').trim() || '—'}`,
  ]
    .filter((line) => line !== null)
    .join('\n');
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

    if (String(payload.website ?? '').trim()) {
      return json({ ok: true }, 200, origin);
    }

    const phone = String(payload.phone ?? '').replace(/\D/g, '');
    if (phone.length < 10 || phone.length > 15) {
      return json({ ok: false, error: 'phone' }, 400, origin);
    }

    if (!Array.isArray(payload.lines) || payload.lines.length === 0) {
      return json({ ok: false, error: 'lines' }, 400, origin);
    }

    if (!env.BOT_TOKEN || !env.CHAT_ID) {
      return json({ ok: false, error: 'config' }, 500, origin);
    }

    const text = buildMessage(payload).slice(0, 3500);
    const telegram = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.CHAT_ID,
        text,
      }),
    });

    if (!telegram.ok) {
      return json({ ok: false, error: 'telegram' }, 502, origin);
    }

    return json({ ok: true }, 200, origin);
  },
};
