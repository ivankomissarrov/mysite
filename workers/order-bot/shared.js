export const ALLOWED_ORIGINS = [
  'https://ivankomissarrov.github.io',
  'http://127.0.0.1:4321',
  'http://localhost:4321',
  'http://0.0.0.0:4321',
];

export function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function formatRub(value) {
  return `${Math.round(Number(value) || 0)
    .toLocaleString('ru-RU')
    .replace(/[\u00A0\u202F]/g, ' ')} ₽`;
}

export function buildMessage(payload) {
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

export function validatePayload(payload) {
  if (String(payload.website ?? '').trim()) return { ok: true, honeypot: true };
  const phone = String(payload.phone ?? '').replace(/\D/g, '');
  if (phone.length < 10 || phone.length > 15) return { ok: false, error: 'phone' };
  if (!Array.isArray(payload.lines) || payload.lines.length === 0) return { ok: false, error: 'lines' };
  return { ok: true, honeypot: false };
}

export async function sendTelegram(token, chatId, text) {
  const telegram = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 3500) }),
  });
  return telegram.ok;
}
