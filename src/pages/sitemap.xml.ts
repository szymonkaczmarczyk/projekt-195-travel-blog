import type { APIRoute } from 'astro';
import { collectionsMeta, continents, legal, nav } from '../data/meta';
import { getVisits } from '../lib/data';

export const GET: APIRoute = async ({ site }) => {
  const visits = await getVisits();
  const entries: Array<[string, string]> = [
    ['/', '1.0'],
    ...nav.filter((item) => !item.href.startsWith('/kolekcje/')).map((item): [string, string] => [item.href, '0.8']),
    ...visits.map((v): [string, string] => [`/kraje/${v.slug}/`, '0.7']),
    ...continents.map((c): [string, string] => [`/kontynenty/${c.key}/`, '0.6']),
    ...collectionsMeta.map((c): [string, string] => [`/kolekcje/${c.key}/`, '0.6']),
    ...legal.map((item): [string, string] => [item.href, '0.2']),
  ];
  const urls = entries.map(([path, priority]) => `  <url><loc>${new URL(path, site).href}</loc><priority>${priority}</priority></url>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
