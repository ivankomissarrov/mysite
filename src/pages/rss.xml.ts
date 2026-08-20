import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { site } from '../data/site';
import { articlePath, getPublishedArticles } from '../lib/articles';

export async function GET(context: APIContext) {
  const articles = await getPublishedArticles();

  return rss({
    title: site.title,
    description: site.description,
    site: context.site ?? site.url,
    xmlns: { atom: 'http://www.w3.org/2005/Atom' },
    customData: `<language>${site.language}</language><atom:link href="${new URL('/rss.xml', site.url).href}" rel="self" type="application/rss+xml"/>`,
    items: articles.map((article) => ({
      title: article.data.title,
      description: article.data.description,
      pubDate: article.data.pubDate,
      link: articlePath(article),
      categories: article.data.tags,
    })),
  });
}
