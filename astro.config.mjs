// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://ivankomissarrov.github.io',
  trailingSlash: 'always',
  server: {
    port: 4321,
    host: true,
    allowedHosts: true,
  },
  preview: {
    port: 4321,
    host: true,
    allowedHosts: true,
  },
  vite: {
    server: {
      host: true,
      allowedHosts: true,
      strictPort: true,
    },
    preview: {
      host: true,
      allowedHosts: true,
    },
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
  redirects: {
    '/articles': '/posts',
    '/articles/[id]': '/posts/[id]',
  },
});
