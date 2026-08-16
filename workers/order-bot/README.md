# Telegram-бот для заявок

Токен в git не кладётся.

```bash
cd workers/order-bot
npx wrangler login
npx wrangler secret put BOT_TOKEN
npx wrangler secret put CHAT_ID
npx wrangler deploy
```

Полученный URL (`https://order-bot.<аккаунт>.workers.dev`) вставьте в `endpoint` в `src/data/order-catalog.json` или через `tools/order-editor.html`.
