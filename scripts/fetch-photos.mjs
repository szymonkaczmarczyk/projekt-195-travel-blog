import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const CONTENT = path.join(ROOT, 'src/content/kraje');
const OUT = path.join(ROOT, 'src/assets/photos');
const META = path.join(ROOT, 'src/data/photos.json');
const OVERRIDES = path.join(ROOT, 'scripts/photo-overrides.json');
const UA = 'Projekt195-TravelBlog/0.1 (static site build script; https://www.mediawiki.org/wiki/API:Etiquette)';
const API = 'https://commons.wikimedia.org/w/api.php';
const MIN_COUNT = 3;

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const only = args.only ? new Set(args.only.split(',').map((s) => s.toUpperCase())) : null;
const force = 'force' in args;

const junk = /\b(copernicus|sentinel|nasa|landsat|satellite|mineral|crystal|journal|certificate|secretary|witch|saxophone|map|flag|coat of arms|logo|diagram|chart|seal|stamp|coin|banknote|portrait|interior|insect|beetle|moth|butterfly|spider|wasp|bird|fish|lizard|frog|snake|orchid|mushroom|fungus|statue|bust|museum|painting|icon|manuscript|poster|signature|locomotive|aircraft|airplane|helmet|vase|pottery|skull|specimen|fossil|herbarium|postcard|stamps)\b/i;
const tiers = ['incategory:Featured_pictures_on_Wikimedia_Commons', 'incategory:Quality_images', ''];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (html = '') => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const firstHref = (html = '') => {
  const m = html.match(/href="([^"]+)"/);
  if (!m) return null;
  return m[1].startsWith('//') ? 'https:' + m[1] : m[1].startsWith('/') ? 'https://commons.wikimedia.org' + m[1] : m[1];
};

async function get(url, asJson = true) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.status === 429 || res.status >= 500) {
      const wait = 4000 * (attempt + 1);
      console.log(`  ${res.status}, czekam ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    const text = asJson ? await res.text() : null;
    if (asJson) {
      if (text.startsWith('You are making too many')) {
        await sleep(8000 * (attempt + 1));
        continue;
      }
      return JSON.parse(text);
    }
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error('Nie udało się pobrać: ' + url);
}

function apiUrl(params) {
  const url = new URL(API);
  Object.entries({
    action: 'query',
    format: 'json',
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata|mime',
    iiurlwidth: '1920',
    iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl|ObjectName',
    ...params,
  }).forEach(([k, v]) => url.searchParams.set(k, v));
  return url;
}

async function search(term, tier) {
  const q = `${term} ${tier} filetype:bitmap`.replace(/\s+/g, ' ').trim();
  const d = await get(apiUrl({ generator: 'search', gsrsearch: q, gsrnamespace: '6', gsrlimit: '15' }));
  await sleep(300);
  return Object.values(d.query?.pages ?? {}).sort((a, b) => a.index - b.index);
}

async function byTitles(titles) {
  const d = await get(apiUrl({ titles: titles.map((t) => (t.startsWith('File:') ? t : 'File:' + t)).join('|') }));
  await sleep(300);
  const pages = Object.values(d.query?.pages ?? {});
  return titles.map((t) => pages.find((p) => p.title.replace(/^File:/, '') === t.replace(/^File:/, '').replace(/_/g, ' '))).filter(Boolean);
}

const generic = new Set(['lake', 'lakes', 'national', 'park', 'beach', 'island', 'islands', 'mount', 'mountain', 'mountains', 'valley', 'old', 'town', 'city', 'river', 'falls', 'waterfall', 'the', 'and', 'of', 'de', 'del', 'la', 'sea', 'bay', 'desert', 'canyon', 'great', 'aerial', 'skyline', 'square', 'church', 'temple', 'castle']);
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, ' ');
const tokens = (term) => norm(term).split(' ').filter((w) => w.length >= 3 && !generic.has(w));

function acceptable(page, cover, term) {
  if (term) {
    const t = tokens(term);
    const title = norm(page.title);
    if (t.length && !t.some((w) => title.includes(w))) return false;
  }
  const ii = page.imageinfo?.[0];
  if (!ii || !ii.thumburl) return false;
  if (!/image\/(jpeg|png|webp|tiff)/.test(ii.mime ?? '')) return false;
  const ratio = ii.width / ii.height;
  if (ii.width < 1600) return false;
  if (cover ? ratio < 1.3 || ratio > 2.3 : ratio < 0.66 || ratio > 2.4) return false;
  if (junk.test(page.title)) return false;
  return true;
}

function authorOf(html = '') {
  const user = html.match(/<a[^>]+href="[^"]*\/wiki\/User:[^"]*"[^>]*>(.*?)<\/a>/i);
  if (user && strip(user[1])) return { name: strip(user[1]), url: firstHref(user[0]) };
  let text = strip(html);
  const taken = text.match(/taken by ([^.]+)\./i);
  if (taken) text = taken[1];
  const ref = text.match(/Image: [^/]+\/ ([^/]+) \//);
  if (ref) text = ref[1];
  text = text.replace(/\s+(This is a retouched|Creator:|Please credit|You may re-use).*$/i, '').trim();
  if (text.length > 60) text = text.split(/[.(]/)[0].trim();
  return { name: text || 'autor nieznany', url: firstHref(html) };
}

function describe(page) {
  const ii = page.imageinfo[0];
  const em = ii.extmetadata ?? {};
  const who = authorOf(em.Artist?.value);
  return {
    title: page.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, ''),
    author: who.name,
    authorUrl: who.url,
    license: em.LicenseShortName?.value ?? 'zob. stronę pliku',
    licenseUrl: em.LicenseUrl?.value ?? null,
    source: ii.descriptionurl,
  };
}

async function save(page, code, index) {
  const ii = page.imageinfo[0];
  const buf = await get(ii.thumburl, false);
  await sleep(400);
  const dir = path.join(OUT, code.toLowerCase());
  fs.mkdirSync(dir, { recursive: true });
  const file = `${index + 1}.webp`;
  const info = await sharp(buf).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 78 }).toFile(path.join(dir, file));
  return { file: `${code.toLowerCase()}/${file}`, width: info.width, height: info.height, ...describe(page) };
}

const posts = fs.readdirSync(CONTENT).filter((f) => f.endsWith('.md')).map((f) => {
  const src = fs.readFileSync(path.join(CONTENT, f), 'utf8');
  return {
    code: src.match(/^country:\s*(\w+)/m)[1],
    terms: JSON.parse(src.match(/^photoSearch:\s*(\[.*\])/m)?.[1] ?? '[]'),
  };
});

const meta = fs.existsSync(META) ? JSON.parse(fs.readFileSync(META, 'utf8')) : {};
const overrides = fs.existsSync(OVERRIDES) ? JSON.parse(fs.readFileSync(OVERRIDES, 'utf8')) : { exclude: [], files: {} };
const excluded = new Set((overrides.exclude ?? []).map((t) => t.replace(/^File:/, '')));
const used = new Set(Object.values(meta).flat().map((p) => p.source));
const isExcluded = (p) => excluded.has(p.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '')) || excluded.has(p.title.replace(/^File:/, ''));

if ('meta' in args) {
  const entries = Object.values(meta).flat();
  for (let i = 0; i < entries.length; i += 40) {
    const chunk = entries.slice(i, i + 40);
    const titles = chunk.map((e) => decodeURIComponent(e.source.split('/wiki/')[1]).replace(/_/g, ' '));
    const pages = await byTitles(titles);
    for (const e of chunk) {
      const t = decodeURIComponent(e.source.split('/wiki/')[1]).replace(/_/g, ' ').replace(/^File:/, '');
      const page = pages.find((p) => p.title.replace(/^File:/, '') === t);
      if (page?.imageinfo?.[0]) Object.assign(e, describe(page), { file: e.file });
    }
  }
  fs.writeFileSync(META, JSON.stringify(meta, null, 1));
  console.log('Odświeżono metadane:', entries.length);
  process.exit(0);
}

for (const { code, terms } of posts) {
  if (only && !only.has(code)) continue;
  const need = Math.max(MIN_COUNT, terms.length);
  if (!force && !only && (meta[code]?.length ?? 0) >= need) continue;
  console.log(`${code}: ${terms.join(' | ')}`);
  (meta[code] ?? []).forEach((p) => used.delete(p.source));
  const picked = [];
  const forced = overrides.files?.[code] ?? [];
  if (forced.length) {
    for (const page of await byTitles(forced.filter(Boolean))) if (page.imageinfo?.[0]?.thumburl) picked.push(page);
  }
  const pool = [];
  for (let slot = picked.length; slot < need; slot++) {
    const term = terms[slot] ?? terms[slot % Math.max(terms.length, 1)] ?? code;
    let found = null;
    for (const tier of tiers) {
      const results = await search(term, tier);
      pool.push(...results);
      found = results.find((p) => acceptable(p, slot === 0, term) && !isExcluded(p) && !used.has(p.imageinfo[0].descriptionurl) && !picked.includes(p));
      if (found) break;
    }
    if (!found) found = pool.find((p) => acceptable(p, false, terms.join(' ')) && !isExcluded(p) && !used.has(p.imageinfo[0].descriptionurl) && !picked.includes(p));
    if (found) {
      picked.push(found);
      used.add(found.imageinfo[0].descriptionurl);
      console.log(`  ${slot + 1}. ${found.title}`);
    } else {
      console.log(`  ${slot + 1}. brak trafień dla "${term}"`);
    }
  }
  const dir = path.join(OUT, code.toLowerCase());
  fs.rmSync(dir, { recursive: true, force: true });
  meta[code] = [];
  for (let i = 0; i < picked.length; i++) meta[code].push(await save(picked[i], code, i));
  fs.writeFileSync(META, JSON.stringify(meta, null, 1));
}

fs.writeFileSync(META, JSON.stringify(meta, null, 1));
console.log('Gotowe:', Object.keys(meta).length, 'krajów,', Object.values(meta).flat().length, 'zdjęć');
