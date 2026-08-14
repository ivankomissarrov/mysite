export const site = {
  url: 'https://ivankomissarrov.github.io',
  name: 'Иван Комиссаров',
  shortName: 'ИК',
  title: 'Иван Комиссаров — статьи и заметки',
  description:
    'Персональный сайт Ивана Комиссарова: статьи, заметки и мысли. Пишу, чтобы меня было проще найти и чтобы идеи жили дольше переписки.',
  locale: 'ru_RU',
  language: 'ru',
  author: {
    name: 'Иван Комиссаров',
    givenName: 'Иван',
    familyName: 'Комиссаров',
    jobTitle: 'Автор',
    sameAs: ['https://github.com/ivankomissarrov'],
  },
  nav: [
    { href: '/', label: 'Главная' },
    { href: '/articles/', label: 'Статьи' },
    { href: '/about/', label: 'Обо мне' },
  ],
} as const;
