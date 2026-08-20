import { getCollection, type CollectionEntry } from 'astro:content';

export type Article = CollectionEntry<'articles'>;

export async function getPublishedArticles(): Promise<Article[]> {
  const articles = await getCollection('articles', ({ data }) => {
    return import.meta.env.PROD ? !data.draft : true;
  });

  return articles.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export function articlePath(article: Article): string {
  return `/posts/${article.id}/`;
}

/** Smaller WebP used on cards; full JPEG stays in the post. */
export function coverThumb(cover?: string): string | undefined {
  if (!cover) return;
  const file = cover.split('/').pop();
  if (!file) return cover;
  const stem = file.replace(/\.[^.]+$/, '');
  return `/images/articles/thumbs/${stem}.webp`;
}
