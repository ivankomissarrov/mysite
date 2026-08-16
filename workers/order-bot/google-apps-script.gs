function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.type === 'max') {
      pingMax_();
    }
  } catch (error) {}
  return ContentService.createTextOutput('ok');
}

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) || '{}';
    const payload = JSON.parse(raw);

    if (String(payload.website || '').trim()) {
      return json_({ ok: true });
    }

    const props = PropertiesService.getScriptProperties();
    const token = props.getProperty('BOT_TOKEN');
    const chatId = props.getProperty('CHAT_ID');
    if (!token || !chatId) {
      return json_({ ok: false, error: 'config' });
    }

    if (payload.type === 'max') {
      return pingMax_();
    }

    const phone = String(payload.phone || '').replace(/\D/g, '');
    if (phone.length < 10 || phone.length > 15) {
      return json_({ ok: false, error: 'phone' });
    }
    if (!Array.isArray(payload.lines) || payload.lines.length === 0) {
      return json_({ ok: false, error: 'lines' });
    }

    return sendTelegram_(token, chatId, buildMessage_(payload).slice(0, 3500));
  } catch (error) {
    return json_({ ok: false, error: String(error) });
  }
}

function sendTelegram_(token, chatId, text) {
  const response = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      chat_id: chatId,
      text: text,
    }),
    muteHttpExceptions: true,
  });
  return json_({ ok: response.getResponseCode() < 300 });
}

function pingMax_() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('BOT_TOKEN');
  const chatId = props.getProperty('CHAT_ID');
  if (!token || !chatId) return json_({ ok: false, error: 'config' });
  return sendTelegram_(token, chatId, 'Вам скоро напишут в MAX');
}

function json_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

function formatRub_(value) {
  return Math.round(Number(value) || 0).toLocaleString('ru-RU').replace(/[\u00A0\u202F]/g, ' ') + ' ₽';
}

function buildMessage_(payload) {
  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  const blocks = lines.map(function (line, index) {
    const n = index + 1;
    const name = String(line.name || 'Позиция');
    const detail = String(line.detail || '');
    const title = detail ? name + ' — ' + detail : name;
    const extras = (Array.isArray(line.options) ? line.options : []).map(function (option) {
      return '   + ' + option;
    }).join('\n');
    const price = Number(line.total) > 0 ? formatRub_(line.total) : String(payload.negotiableLabel || 'по договорённости');
    if (extras) return n + '. ' + title + '\n' + extras + '\n   = ' + price;
    return n + '. ' + title + ' — ' + price;
  });

  const total = Number(payload.total) || 0;
  const totalLine = payload.negotiable || total <= 0
    ? 'Итого: ' + (payload.negotiableLabel || 'по договорённости')
    : 'Итого: от ' + formatRub_(total);
  const discountPercent = Number(payload.discountPercent) || 0;
  const discountLine = discountPercent ? 'Скидка ' + discountPercent + '%: −' + formatRub_(payload.discountAmount) : '';
  const variance = Number(payload.variancePercent) || 20;

  return [
    'Новый заказ с сайта',
    '',
    blocks.join('\n'),
    '',
    Number(payload.subtotal) > 0 ? 'Сумма: ' + formatRub_(payload.subtotal) : '',
    discountLine,
    totalLine,
    '(ориентировочно, ±' + variance + '%)',
    '',
    'Имя: ' + (String(payload.name || '').trim() || '—'),
    'Телефон: ' + (String(payload.phone || '').trim() || '—'),
    'Мессенджер: ' + (String(payload.messenger || '').trim() || '—'),
    'Комментарий: ' + (String(payload.comment || '').trim() || '—'),
  ].filter(Boolean).join('\n');
}
