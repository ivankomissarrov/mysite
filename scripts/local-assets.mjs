#!/usr/bin/env node
/**
 * Keeps fonts and post images on disk so pages do not fetch Google Fonts,
 * VK, or other CDNs at runtime.
 *
 * On every start/build:
 *   - downloads Unbounded / Manrope into public/fonts/ if they are missing
 *   - downloads remote images from posts and rewrites Markdown to local paths
 *
 *   node scripts/local-assets.mjs --optimize
 * compresses oversized local photos (run once, or after adding heavy files).
 */
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fontsDir = path.join(root, 'public', 'fonts');
const imagesDir = path.join(root, 'public', 'images', 'articles');
const thumbsDir = path.join(imagesDir, 'thumbs');
const articlesDir = path.join(root, 'src', 'content', 'articles');
const optimize = process.argv.includes('--optimize');

const FONT_CSS_URL =
  'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700&family=Unbounded:wght@500;700&display=swap';
const SKIP_SUBSETS = new Set(['greek', 'vietnamese', 'latin-ext', 'cyrillic-ext']);
const REQUIRED_FONTS = [
  'manrope-cyrillic.woff2',
  'manrope-latin.woff2',
  'unbounded-cyrillic.woff2',
  'unbounded-latin.woff2',
];
const MAX_EDGE = 1400;
const JPEG_QUALITY = 78;
const THUMB_WIDTH = 720;
const THUMB_QUALITY = 68;
const FONT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function fetchBuffer(url, headers = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': FONT_UA, ...headers },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return { buffer: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') ?? '' };
}

function localFontName(family, subset) {
  return `${family.toLowerCase()}-${subset}.woff2`;
}

async function ensureFonts() {
  await mkdir(fontsDir, { recursive: true });
  const missing = [];
  for (const name of REQUIRED_FONTS) {
    if (!(await exists(path.join(fontsDir, name)))) missing.push(name);
  }
  if (missing.length === 0) {
    console.log('fonts: using local files');
    return;
  }

  const css = await (await fetch(FONT_CSS_URL, { headers: { 'User-Agent': FONT_UA } })).text();
  const blockRe = /\/\* ([^*]+) \*\/\s*@font-face \{([^}]+)\}/g;
  const seen = new Set();
  let match;

  while ((match = blockRe.exec(css))) {
    const subset = match[1].trim();
    const body = match[2];
    if (SKIP_SUBSETS.has(subset)) continue;
    const family = body.match(/font-family:\s*'([^']+)'/)?.[1];
    const src = body.match(/url\((https:\/\/[^)]+)\)/)?.[1];
    if (!family || !src) continue;
    const filename = localFontName(family, subset);
    if (seen.has(filename)) continue;
    seen.add(filename);
    const dest = path.join(fontsDir, filename);
    if (!(await exists(dest))) {
      const { buffer } = await fetchBuffer(src);
      await writeFile(dest, buffer);
      console.log(`font + ${filename}`);
    }
  }

  await writeFile(
    path.join(fontsDir, 'LICENSE.txt'),
    'Manrope and Unbounded are licensed under the SIL Open Font License 1.1.\nSources: https://fonts.google.com/specimen/Manrope and https://fonts.google.com/specimen/Unbounded\n',
  );
  console.log('fonts: downloaded');
}

async function compressToJpeg(input, dest) {
  const image = sharp(input, { failOn: 'none' }).rotate();
  const meta = await image.metadata();
  const needsResize = (meta.width ?? 0) > MAX_EDGE || (meta.height ?? 0) > MAX_EDGE;
  let pipeline = image;
  if (needsResize) {
    pipeline = pipeline.resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }
  const out = await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
  await writeFile(dest, out);
  return out.length;
}

function remoteImageUrls(markdown) {
  const found = new Set();
  const patterns = [
    /cover:\s*['"]?(https?:\/\/[^\s'"]+)/g,
    /!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/g,
    /<img[^>]+src=['"](https?:\/\/[^'"]+)['"]/gi,
  ];
  for (const re of patterns) {
    let match;
    while ((match = re.exec(markdown))) found.add(match[1]);
  }
  return [...found];
}

function extFromType(contentType, url) {
  const type = contentType.split(';')[0].trim().toLowerCase();
  if (type === 'image/png') return '.png';
  if (type === 'image/webp') return '.webp';
  if (type === 'image/gif') return '.gif';
  if (type === 'image/jpeg') return '.jpg';
  const fromUrl = url.match(/\.(jpe?g|png|webp|gif)(?:$|\?)/i)?.[1];
  if (!fromUrl) return '.jpg';
  return `.${fromUrl.toLowerCase().replace('jpeg', 'jpg')}`;
}

async function localizeArticleImages() {
  await mkdir(imagesDir, { recursive: true });
  const files = (await readdir(articlesDir)).filter((name) => name.endsWith('.md'));
  let changedFiles = 0;

  for (const name of files) {
    const file = path.join(articlesDir, name);
    let markdown = await readFile(file, 'utf8');
    const urls = remoteImageUrls(markdown);
    if (urls.length === 0) continue;

    const slug = path.basename(name, '.md');
    let changed = false;

    for (const url of urls) {
      try {
        const { buffer, contentType } = await fetchBuffer(url, { Accept: 'image/*,*/*;q=0.8' });
        const hash = createHash('sha1').update(buffer).digest('hex').slice(0, 10);
        const ext = extFromType(contentType, url);
        const filename = ext === '.gif' ? `${slug}-${hash}.gif` : `${slug}-${hash}.jpg`;
        const dest = path.join(imagesDir, filename);
        if (!(await exists(dest))) {
          if (ext === '.gif') await writeFile(dest, buffer);
          else await compressToJpeg(buffer, dest);
          console.log(`image + ${filename}`);
        }
        markdown = markdown.split(url).join(`/images/articles/${filename}`);
        changed = true;
      } catch (error) {
        console.warn(`could not download ${url}: ${error.message}`);
      }
    }

    if (changed) {
      await writeFile(file, markdown);
      changedFiles += 1;
    }
  }

  if (changedFiles) console.log(`posts: localized images in ${changedFiles} files`);
  else console.log('images: posts already use local files');
}

async function optimizeExistingImages() {
  await mkdir(imagesDir, { recursive: true });
  const files = (await readdir(imagesDir)).filter((name) => /\.(jpe?g|png|webp)$/i.test(name));
  let saved = 0;

  for (const name of files) {
    const file = path.join(imagesDir, name);
    const { size } = await stat(file);
    const original = await readFile(file);
    let meta;
    try {
      meta = await sharp(original, { failOn: 'none' }).metadata();
    } catch (error) {
      console.warn(`skip ${name}: ${error.message}`);
      continue;
    }
    const oversized = (meta.width ?? 0) > MAX_EDGE || (meta.height ?? 0) > MAX_EDGE;
    const heavy = size > 280 * 1024;
    if (!oversized && !heavy) continue;

    const tmp = `${file}.tmp.jpg`;
    try {
      const nextSize = await compressToJpeg(original, tmp);
      if (nextSize >= size * 0.98) {
        await unlink(tmp).catch(() => {});
        continue;
      }
      const finalName = name.replace(/\.(png|webp)$/i, '.jpg');
      const finalPath = path.join(imagesDir, finalName);
      await writeFile(finalPath, await readFile(tmp));
      await unlink(tmp).catch(() => {});
      if (finalPath !== file) await unlink(file);
      saved += size - nextSize;
      console.log(`image ~ ${name} ${Math.round(size / 1024)}KB → ${Math.round(nextSize / 1024)}KB`);
    } catch (error) {
      await unlink(tmp).catch(() => {});
      console.warn(`skip ${name}: ${error.message}`);
    }
  }

  console.log(saved ? `images: saved ${(saved / 1024 / 1024).toFixed(1)}MB` : 'images: already compressed');
}

async function ensureThumbs() {
  await mkdir(thumbsDir, { recursive: true });
  const files = (await readdir(imagesDir)).filter((name) => /\.(jpe?g|png|webp)$/i.test(name));
  let made = 0;

  for (const name of files) {
    const src = path.join(imagesDir, name);
    const dest = path.join(thumbsDir, name.replace(/\.[^.]+$/, '.webp'));
    const srcStat = await stat(src);
    if (await exists(dest)) {
      const destStat = await stat(dest);
      if (destStat.mtimeMs >= srcStat.mtimeMs && destStat.size > 0) continue;
    }
    await sharp(src, { failOn: 'none' })
      .rotate()
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY })
      .toFile(dest);
    made += 1;
  }

  console.log(made ? `thumbs: created ${made}` : 'thumbs: up to date');
}

async function ensureAvatar() {
  const dir = path.join(root, 'public', 'images');
  await mkdir(dir, { recursive: true });
  const dest = path.join(dir, 'avatar.webp');
  const sources = ['avatar.jpg', 'avatar.jpeg', 'avatar.png'];
  let src;
  for (const name of sources) {
    const file = path.join(dir, name);
    if (await exists(file)) {
      src = file;
      break;
    }
  }
  if (!src) {
    if (await exists(dest)) console.log('avatar: using local webp');
    else console.log('avatar: missing public/images/avatar.jpg');
    return;
  }

  await sharp(src, { failOn: 'none' })
    .rotate()
    .resize({ width: 512, height: 512, fit: 'cover', position: 'centre' })
    .webp({ quality: 82 })
    .toFile(dest);
  console.log('avatar: wrote avatar.webp');
}

const start = Date.now();
await ensureFonts();
await localizeArticleImages();
if (optimize) await optimizeExistingImages();
await ensureThumbs();
await ensureAvatar();
console.log(`local-assets ${Date.now() - start}ms`);
