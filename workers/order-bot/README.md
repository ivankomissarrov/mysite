# Заявки в Telegram

Cloudflare из России часто недоступен, поэтому форма по умолчанию открывает Telegram с готовым текстом заявки. Бот нужен только если хотите, чтобы сообщение приходило вам само, без действия клиента.

Токен в git не кладётся.

Бесплатный вариант без залога, который клиент из России обычно может вызвать: [Google Apps Script](GOOGLE.md). Яндекс Functions из‑за порога пополнения не используем. Cloudflare из России часто недоступен клиентам.

```bash
cd workers/order-bot
BOT_TOKEN=... CHAT_ID=... npm start
```

На Railway / Timeweb / Fly задайте те же переменные и команду `npm start`. Полученный HTTPS-адрес вставьте в `endpoint` в `src/data/order-catalog.json` или через `tools/order-editor.html`.
