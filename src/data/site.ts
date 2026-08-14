export const site = {
  url: 'https://ivankomissarrov.github.io',
  name: 'Иван Комиссаров',
  shortName: 'ИК',
  title: 'Иван Комиссаров — геймдизайн и игропрактика',
  description:
    'Игропрактик и геймдизайнер: образовательные игры, настольный геймдизайн, курсы и конвенты. Сотрудничество — Telegram @IvanKomissarov.',
  locale: 'ru_RU',
  language: 'ru',
  author: {
    name: 'Иван Комиссаров',
    givenName: 'Иван',
    familyName: 'Комиссаров',
    jobTitle: 'Игропрактик и геймдизайнер',
    sameAs: [
      'https://vk.ru/ivankomissarrov',
      'https://t.me/IvanKomissarov',
      'https://github.com/ivankomissarrov',
    ],
  },
  telegram: 'https://t.me/IvanKomissarov',
  vk: 'https://vk.ru/ivankomissarrov',
  avatar: '/images/avatar.webp',
  nav: [
    { href: '/', label: 'Главная' },
    { href: '/about/', label: 'Обо мне' },
  ],
} as const;
