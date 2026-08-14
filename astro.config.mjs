// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://ivankomissarrov.github.io',
  trailingSlash: 'always',
  server: {
    port: 4321,
    host: '127.0.0.1',
  },
  preview: {
    port: 4321,
    host: '127.0.0.1',
  },
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/404'),
    }),
  ],
  markdown: {
    shikiConfig: {
      theme: 'houston',
    },
  },
});
