#!/usr/bin/env node
/**
 * Pulls new posts from the public VK wall into src/content/articles/.
 * No VK app token: uses the same wall HTML VK shows to guests.
 *
 *   node scripts/sync-vk-wall.mjs
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const articlesDir = path.join(root, 'src', 'content', 'articles');
const imagesDir = path.join(root, 'public', 'images', 'articles');
const statePath = path.join(root, 'src', 'data', 'vk-sync.json');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const PAGE_SIZE = 10;
const MAX_PAGES = 6;
const MAX_EDGE = 1400;
const JPEG_QUALITY = 78;

const RU = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'yo',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

function decodeEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function unwrapVkText(raw) {
  let text = decodeEntities(String(raw ?? ''));
  text = text.replace(/\[(?:club|id|public|event)-?\d+\|([^\]]+)\]/gi, '$1');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

function stripEmoji(text) {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function moscowDate(unix) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(unix * 1000));
}

function slugify(title) {
  const base = title
    .toLowerCase()
    .split('')
    .map((ch) => RU[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (base.length <= 56) return base || 'vk-post';
  return (base.slice(0, 56).replace(/-[^-]*$/, '') || base.slice(0, 56)).replace(/-+$/, '') || 'vk-post';
}

function yamlQuote(value) {
  const escaped = String(value).replace(/'/g, "''");
  return `'${escaped}'`;
}

function titleFromText(text) {
  const first = stripEmoji(text.split('\n').find((line) => line.trim()) ?? '').replace(
    /^(опа|ура|привет|всем привет)[!.…\s]*/i,
    '',
  );
  return first.replace(/[.!?]+$/, '').trim().slice(0, 90) || 'Заметка';
}

function descriptionFromText(text, title) {
  const parts = text
    .split(/\n{2,}/)
    .map((part) => stripEmoji(part.replace(/\n/g, ' ')).trim())
    .filter(Boolean);
  const rest = parts.slice(1).find(Boolean) ?? parts[0] ?? title;
  const one = rest.replace(/\s+/g, ' ');
  return one.length > 180 ? `${one.slice(0, 177).trim()}…` : one;
}

function tagsFrom(text) {
  const tags = [];
  if (/hobby games/i.test(text)) tags.push('Hobby Games');
  if (/издат|прода/i.test(text)) tags.push('издание');
  if (/настол/i.test(text)) tags.push('настолки');
  if (/scream school|universal university|курс|лекц|препод/i.test(text)) tags.push('преподавание');
  if (/граникон|гильди/i.test(text)) tags.push('Гильдия');
  if (tags.length === 0) tags.push('заметки');
  return [...new Set(tags)].slice(0, 4);
}

function bestPhotoUrl(photo) {
  const sizes = Array.isArray(photo?.sizes) ? photo.sizes : [];
  const usable = sizes.filter((size) => size?.url && !String(size.url).includes('blur='));
  if (usable.length === 0) {
    const orig = photo?.orig_photo?.url;
    return orig && !orig.includes('blur=') ? orig : null;
  }
  usable.sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0));
  return usable[0].url;
}

function extractPosts(html, ownerId) {
  const prefix = `post${ownerId}_`;
  const starts = [];
  const open = new RegExp(`<div id="(${prefix}\\d+)" class="([^"]*\\bpage_block[^"]*)"`, 'g');
  let match;
  while ((match = open.exec(html))) {
    starts.push({ id: Number(match[1].slice(prefix.length)), index: match.index, pinned: /\bpost_fixed\b/.test(match[2]) });
  }
  const posts = [];
  for (let i = 0; i < starts.length; i += 1) {
    const chunk = html.slice(starts[i].index, starts[i + 1]?.index ?? html.length);
    const exec = chunk.match(/PostContentContainer[^>]*data-exec="([^"]+)"/);
    if (!exec) continue;
    let data;
    try {
      data = JSON.parse(decodeEntities(exec[1]));
    } catch {
      continue;
    }
    const item = data['PostContentContainer/init']?.item;
    if (!item || item.copy_history) continue;
    const text = unwrapVkText(item.text);
    const photos = (item.attachments ?? [])
      .filter((att) => att?.type === 'photo' && att.photo)
      .map((att) => bestPhotoUrl(att.photo))
      .filter(Boolean);
    posts.push({
      id: item.id ?? starts[i].id,
      date: item.date,
      pinned: starts[i].pinned,
      text,
      photos,
    });
  }
  return posts;
}

async function fetchWallPage(ownerId, offset) {
  const body = new URLSearchParams({
    act: 'get_wall',
    owner_id: String(ownerId),
    offset: String(offset),
    type: 'own',
    al: '1',
  });
  const res = await fetch('https://vk.ru/al_wall.php', {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'ru-RU,ru;q=0.9',
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Referer: `https://vk.ru/id${ownerId}`,
    },
    body,
  });
  if (!res.ok) throw new Error(`al_wall.php ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const decoded = new TextDecoder('windows-1251').decode(buf);
  const payload = JSON.parse(decoded);
  const html = payload?.payload?.[1]?.[0];
  if (typeof html !== 'string') throw new Error('VK wall payload has no HTML');
  return html;
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const data = {};
  for (const line of match[1].split('\n')) {
    const vk = line.match(/^vkPostId:\s*(\d+)\s*$/);
    if (vk) data.vkPostId = Number(vk[1]);
    const date = line.match(/^pubDate:\s*['"]?(\d{4}-\d{2}-\d{2})/);
    if (date) data.pubDate = date[1];
    const title = line.match(/^title:\s*['"]?(.*?)['"]?\s*$/);
    if (title) data.title = title[1].replace(/''/g, "'");
  }
  return data;
}

function normalize(text) {
  return stripEmoji(unwrapVkText(text))
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, ' ')
    .trim()
    .slice(0, 80);
}

async function loadExisting() {
  const files = (await readdir(articlesDir)).filter((name) => name.endsWith('.md'));
  const articles = [];
  let maxDate = '1970-01-01';
  const vkIds = new Set();
  const slugs = new Set();
  for (const name of files) {
    slugs.add(name.replace(/\.md$/, ''));
    const markdown = await readFile(path.join(articlesDir, name), 'utf8');
    const meta = parseFrontmatter(markdown);
    if (meta.vkPostId) vkIds.add(meta.vkPostId);
    if (meta.pubDate && meta.pubDate > maxDate) maxDate = meta.pubDate;
    articles.push({ slug: name.replace(/\.md$/, ''), ...meta, body: markdown });
  }
  return { articles, maxDate, vkIds, slugs };
}

function alreadyOnSite(post, articles) {
  const needle = normalize(post.text);
  if (!needle) return false;
  const day = moscowDate(post.date);
  return articles.some((article) => {
    if (article.pubDate && article.pubDate !== day) return false;
    const hay = normalize(`${article.title ?? ''}\n${article.body ?? ''}`);
    return hay.includes(needle.slice(0, 40)) || needle.includes(normalize(article.title ?? '').slice(0, 40));
  });
}

async function downloadJpeg(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'image/*,*/*;q=0.8' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toFile(dest);
}

function uniqueSlug(base, slugs) {
  let slug = base;
  let n = 2;
  while (slugs.has(slug)) {
    slug = `${base}-${n}`;
    n += 1;
  }
  slugs.add(slug);
  return slug;
}

async function writeArticle(post, slugs) {
  const title = titleFromText(post.text);
  const description = descriptionFromText(post.text, title);
  const slug = uniqueSlug(slugify(title), slugs);
  const day = moscowDate(post.date);
  const tags = tagsFrom(post.text);
  await mkdir(imagesDir, { recursive: true });
  const localPhotos = [];
  for (const [index, url] of post.photos.entries()) {
    const filename = `${slug}-${index + 1}.jpg`;
    const dest = path.join(imagesDir, filename);
    try {
      await downloadJpeg(url, dest);
      localPhotos.push(`/images/articles/${filename}`);
      console.log(`photo + ${filename}`);
    } catch (error) {
      console.warn(`photo skip ${url}: ${error.message}`);
    }
  }
  const figures = localPhotos
    .map((src, index) => `![${index === 0 ? title : `Фото ${index + 1}`}](${src})`)
    .join('\n\n');
  const coverLine = localPhotos[0] ? `cover: '${localPhotos[0]}'\n` : '';
  const markdown = `---
title: ${yamlQuote(title)}
description: ${yamlQuote(description)}
pubDate: ${day}
tags: [${tags.map((tag) => yamlQuote(tag)).join(', ')}]
${coverLine}vkPostId: ${post.id}
---

${figures ? `${figures}\n\n` : ''}${post.text}
`;
  await writeFile(path.join(articlesDir, `${slug}.md`), markdown);
  console.log(`post + ${slug} (vk ${post.id})`);
  return slug;
}

async function main() {
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  const existing = await loadExisting();
  const skipped = new Set(state.skippedIds ?? []);
  const known = new Set([...(state.importedIds ?? []), ...existing.vkIds, ...skipped]);
  const wall = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const html = await fetchWallPage(state.ownerId, page * PAGE_SIZE);
    const posts = extractPosts(html, state.ownerId);
    if (posts.length === 0) break;
    wall.push(...posts);
    const oldest = posts.at(-1);
    if (oldest?.date && moscowDate(oldest.date) < existing.maxDate) break;
    if (posts.length < PAGE_SIZE) break;
  }

  const created = [];
  for (const post of wall) {
    if (!post.id || known.has(post.id)) continue;
    if (post.pinned) {
      known.add(post.id);
      continue;
    }
    if (!post.text) {
      known.add(post.id);
      continue;
    }
    const day = moscowDate(post.date);
    if (day < existing.maxDate) {
      known.add(post.id);
      continue;
    }
    if (alreadyOnSite(post, existing.articles)) {
      known.add(post.id);
      continue;
    }
    await writeArticle(post, existing.slugs);
    known.add(post.id);
    created.push(post.id);
  }

  state.importedIds = [...known].sort((a, b) => a - b);
  state.skippedIds = [...skipped].sort((a, b) => a - b);
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
  if (created.length === 0) console.log('vk: no new posts');
  else console.log(`vk: imported ${created.length} post(s)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
