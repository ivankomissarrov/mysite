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
    rehypePlugins: [rehypeLazyImages],
  },
  redirects: {
    '/articles': '/posts',
    '/articles/[id]': '/posts/[id]',
  },
});
