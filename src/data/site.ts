export const site = {
  url: 'https://ivankomissarrov.github.io',
  name: 'Иван Комиссаров',
  shortName: 'ИК',
  title: 'Иван Комиссаров — геймдизайн и игропрактика',
  description:
    'Игропрактик и геймдизайнер: образовательные игры, настольный геймдизайн, курсы и конвенты. Сотрудничество — Telegram @IvanKomissarrov.',
  locale: 'ru_RU',
  language: 'ru',
  author: {
    name: 'Иван Комиссаров',
    givenName: 'Иван',
    familyName: 'Комиссаров',
    jobTitle: 'Игропрактик и геймдизайнер',
    sameAs: [
      'https://vk.ru/ivankomissarrov',
      'https://t.me/IvanKomissarrov',
      'https://github.com/ivankomissarrov',
    ],
  },
  telegram: 'https://t.me/IvanKomissarrov',
  telegramHandle: '@IvanKomissarrov',
  phone: '8 925 235 56 12',
  phoneTel: '+79252355612',
  vk: 'https://vk.ru/ivankomissarrov',
  avatar: '/images/avatar.webp',
  avatarSmile: '/images/smile.webp',
  avatarOld: '/images/old.webp',
  nav: [],
  cta: {
    write: { href: 'https://t.me/IvanKomissarrov', label: 'Написать в Telegram' },
    order: { href: 'https://t.me/IvanKomissarrov', label: 'Рассчитать заказ' },
    work: { href: '/about/', label: 'Портфолио и опыт' },
  },
  contacts: [
    { href: 'https://t.me/IvanKomissarrov', label: 'Telegram' },
    { href: 'https://vk.ru/ivankomissarrov', label: 'ВКонтакте' },
  ],
} as const;
