# Заявки через Yandex Cloud Functions

Бесплатного лимита Functions хватает на заявки с сайта: [1 000 000 вызовов и 10 ГБ·ч в месяц](https://yandex.cloud/ru/docs/billing/concepts/serverless-free-tier). Карту всё равно попросят при регистрации; при таком объёме обычно ничего не списывают.

Готовый код: [`yandex-function.js`](yandex-function.js). Токен бота в git не кладётся.

## 1. Аккаунт Яндекса

1. Войдите в [Яндекс ID](https://id.yandex.ru/) или [зарегистрируйтесь](https://id.yandex.ru/register).
2. Откройте [консоль Yandex Cloud](https://console.yandex.cloud/).
3. Создайте организацию в [Identity Hub](https://console.yandex.cloud/organizations) — появится облако и каталог `default`. Официально: [начало работы для физлиц](https://yandex.cloud/ru/docs/getting-started/individuals/registration).

## 2. Платёжный аккаунт

Без него функции не запустить.

1. Откройте [Yandex Cloud Billing](https://console.yandex.cloud/billing).
2. На вкладке **Аккаунт** нажмите **Создать аккаунт**.
3. Тип — **Физическое лицо**, страна — Россия.
4. Привяжите карту российского банка (Мир / Visa / MasterCard). Для проверки заморозят около 11 ₽, потом вернут.
5. Если облако ещё не пользовались, могут начислить стартовый грант на 60 дней.

Инструкции: [регистрация аккаунта](https://yandex.cloud/ru/docs/billing/quickstart/), [создать платёжный аккаунт](https://yandex.cloud/ru/docs/billing/operations/create-new-account).

## 3. Функция

Пошагово у Яндекса: [создать функцию на Node.js](https://yandex.cloud/ru/docs/functions/quickstart/create-function/node-function-quickstart).

1. В консоли откройте каталог `default`.
2. Перейдите в [Cloud Functions](https://console.yandex.cloud/folders) → сервис **Cloud Functions**.
3. **Создать функцию**, имя например `order-bot`.
4. **Создать в редакторе** / новая версия:
   - среда **Node.js 22**;
   - отключите «Добавить файлы с примерами»;
   - вставьте содержимое `workers/order-bot/yandex-function.js`;
   - точка входа: `index.handler` (если файл назвали `index.js`) или `yandex-function.handler`, если оставили исходное имя;
   - таймаут 5 секунд, память 128 МБ.
5. В **переменных окружения** версии добавьте:
   - `BOT_TOKEN` — токен от [@BotFather](https://t.me/BotFather);
   - `CHAT_ID` — ваш числовой id (уже есть после `/start` боту).
6. Сохраните версию. Про переменные: [окружение функции](https://yandex.cloud/ru/docs/functions/concepts/runtime/environment-variables).

## 4. Публичный вызов

Сайт должен вызывать функцию без логина Яндекса.

1. На вкладке **Обзор** функции включите **Публичная функция**.
2. Официально: [сделать функцию публичной](https://yandex.cloud/ru/docs/functions/operations/function/function-public).

Ссылка будет вида `https://functions.yandexcloud.net/<id>`. Она на вкладке **Обзор**, поле **Ссылка для вызова**.

## 5. Подключить к сайту

1. Откройте `tools/order-editor.html` или сразу `src/data/order-catalog.json`.
2. В `endpoint` вставьте ссылку `https://functions.yandexcloud.net/<id>`.
3. Закоммитьте и задеплойте сайт.

Пока `endpoint` пустой, форма по-прежнему открывает Telegram с готовым текстом.

## Проверка

С главной откройте `/order/`, заполните телефон и отправьте заявку. Сообщение должно прийти в [@IKomissarovBot](https://t.me/IKomissarovBot). Если нет — в функции вкладка **Логи**.
