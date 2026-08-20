const ALLOWED_ORIGINS = [
  'https://ivankomissarrov.github.io',
  'http://127.0.0.1:4321',
  'http://localhost:4321',
  'http://0.0.0.0:4321',
];

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

function formatRub(value) {
  return `${Math.round(Number(value) || 0)
    .toLocaleString('ru-RU')
    .replace(/[\u00A0\u202F]/g, ' ')} ₽`;
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
  const totalLine =
    payload.negotiable || total <= 0
      ? `Итого: ${payload.negotiableLabel || 'по договорённости'}`
      : `Итого: от ${formatRub(total)}`;
  const discountPercent = Number(payload.discountPercent) || 0;
  const discountLine = discountPercent ? `Скидка ${discountPercent}%: −${formatRub(payload.discountAmount)}` : '';
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

function header(event, name) {
  const headers = event.headers || {};
  const key = Object.keys(headers).find((item) => item.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : '';
}

function json(origin, statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(origin),
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async function (event) {
  const origin = header(event, 'origin');
  const method = event.httpMethod || 'POST';

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(origin), body: '' };
  }

  if (method !== 'POST') {
    return json(origin, 405, { ok: false, error: 'method' });
  }

  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return json(origin, 403, { ok: false, error: 'origin' });
  }

  let raw = event.body || '{}';
  if (event.isBase64Encoded) {
    raw = Buffer.from(raw, 'base64').toString('utf8');
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json(origin, 400, { ok: false, error: 'json' });
  }

  if (String(payload.website ?? '').trim()) {
    return json(origin, 200, { ok: true });
  }

  const phone = String(payload.phone ?? '').replace(/\D/g, '');
  if (phone.length < 10 || phone.length > 15) {
    return json(origin, 400, { ok: false, error: 'phone' });
  }
  if (!Array.isArray(payload.lines) || payload.lines.length === 0) {
    return json(origin, 400, { ok: false, error: 'lines' });
  }

  const token = process.env.BOT_TOKEN;
  const chatId = process.env.CHAT_ID;
  if (!token || !chatId) {
    return json(origin, 500, { ok: false, error: 'config' });
  }

  const telegram = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: buildMessage(payload).slice(0, 3500),
    }),
  });

  return telegram.ok
    ? json(origin, 200, { ok: true })
    : json(origin, 502, { ok: false, error: 'telegram' });
};
