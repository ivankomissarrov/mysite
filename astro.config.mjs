// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

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
  site: 'https://ivankomissarrov.github.io',
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
      filter: (page) => !page.includes('/404'),
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
