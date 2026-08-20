// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

const siteUrl = 'https://komissarov.online';

function rehypeLazyImages() {
  return (tree) => {
    let first = true;
    const walk = (node) => {
      if (node?.type === 'element' && node.tagName === 'img') {
        node.properties ??= {};
        if (first) {
          node.properties.loading = 'eager';
          node.properties.fetchpriority = 'high';
          node.properties.decoding = 'async';
          first = false;
        } else {
          node.properties.loading ??= 'lazy';
          node.properties.decoding ??= 'async';
        }
      }
      for (const child of node?.children ?? []) walk(child);
    };
    walk(tree);
  };
}

export default defineConfig({
  site: siteUrl,
  trailingSlash: 'always',
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
  server: {
    port: 4321,
    host: '0.0.0.0',
    allowedHosts: true,
  },
  preview: {
    port: 4321,
    host: '0.0.0.0',
    allowedHosts: true,
  },
  vite: {
    server: {
      host: '0.0.0.0',
      allowedHosts: true,
      strictPort: true,
      hmr: {
        host: '127.0.0.1',
        clientPort: 4321,
      },
    },
    preview: {
      host: '0.0.0.0',
      allowedHosts: true,
    },
  },
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/404') && !page.includes('/articles'),
      serialize(item) {
        const url = item.url;
        if (url === `${siteUrl}/` || url === siteUrl) {
          return { ...item, changefreq: 'daily', priority: 1 };
        }
        if (url.includes('/posts/')) {
          return { ...item, changefreq: 'weekly', priority: 0.8 };
        }
        if (url.includes('/about') || url.includes('/services') || url.includes('/order')) {
          return { ...item, changefreq: 'monthly', priority: 0.9 };
        }
        return { ...item, changefreq: 'monthly', priority: 0.5 };
      },
    }),
  ],
  markdown: {
    shikiConfig: {
      theme: 'houston',
    },
    rehypePlugins: [rehypeLazyImages],
  },
  redirects: {
    '/articles': '/',
    '/articles/[id]': '/posts/[id]',
    '/posts': '/',
  },
});
