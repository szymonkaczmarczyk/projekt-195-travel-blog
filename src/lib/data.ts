import { getCollection, type CollectionEntry } from 'astro:content';
import type { ImageMetadata } from 'astro';
import countriesJson from '../data/countries.json';
import photoJson from '../data/photos.json';
import altJson from '../data/alts.json';
import { continents, collectionsMeta, type ContinentKey } from '../data/meta';

export type Country = (typeof countriesJson)[number] & { continent: ContinentKey };

export type Photo = {
  src: ImageMetadata;
  alt: string;
  title: string;
  author: string;
  authorUrl: string | null;
  license: string;
  licenseUrl: string | null;
  source: string;
};

export type Visit = Omit<CollectionEntry<'kraje'>['data'], 'country'> & {
  id: string;
  entry: CollectionEntry<'kraje'>;
  country: Country;
  slug: string;
  name: string;
  photos: Photo[];
  cover: Photo | undefined;
  hasStory: boolean;
};

export const countries = countriesJson as Country[];
export const byCode = new Map(countries.map((c) => [c.code, c]));

const images = import.meta.glob<{ default: ImageMetadata }>('/src/assets/photos/*/*.webp', { eager: true });
const photoMeta = photoJson as Record<string, Array<Omit<Photo, 'src' | 'alt'> & { file: string }>>;
const alts = altJson as Record<string, string>;

export function photosFor(code: string): Photo[] {
  return (photoMeta[code] ?? [])
    .map(({ file, ...rest }) => ({ ...rest, alt: alts[file] ?? rest.title, src: images[`/src/assets/photos/${file}`]?.default }))
    .filter((p): p is Photo => Boolean(p.src));
}

let cache: Visit[] | null = null;

export async function getVisits(): Promise<Visit[]> {
  if (cache && import.meta.env.PROD) return cache;
  const entries = await getCollection('kraje');
  const list = entries
    .map((entry): Visit => {
      const country = byCode.get(entry.data.country);
      if (!country) throw new Error(`Nieznany kod kraju: ${entry.data.country} (${entry.id})`);
      const photos = photosFor(country.code);
      return {
        ...entry.data,
        id: entry.id,
        entry,
        country,
        slug: country.slug,
        name: country.name,
        photos,
        cover: photos[0],
        hasStory: Boolean(entry.body?.trim()),
      };
    })
    .sort((a, b) => b.visited.getTime() - a.visited.getTime());
  cache = list;
  return list;
}

export const travelled = (visits: Visit[]) => visits.filter((v) => !v.home);

const monthYearFmt = new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' });
const dayFmt = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });

export const monthYear = (d: Date) => monthYearFmt.format(d);
export const fullDate = (d: Date) => dayFmt.format(d);
export const number = (n: number) => new Intl.NumberFormat('pl-PL').format(n);

export function plural(n: number, one: string, few: string, many: string) {
  if (n === 1) return one;
  const d = n % 10;
  const t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
}

const HOME = { lat: 52.23, lng: 21.01 };

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export const fromHome = (c: Country) => Math.round(distanceKm(HOME, c));

export function stats(visits: Visit[]) {
  const trips = travelled(visits).slice().sort((a, b) => a.visited.getTime() - b.visited.getTime());
  let km = 0;
  let prev: Country | null = null;
  let prevDate = 0;
  for (const v of trips) {
    const gapDays = (v.visited.getTime() - prevDate) / 86400000;
    if (!prev || gapDays > 45) {
      if (prev) km += distanceKm(prev, HOME);
      km += distanceKm(HOME, v.country);
    } else {
      km += distanceKm(prev, v.country);
    }
    prev = v.country;
    prevDate = v.visited.getTime();
  }
  if (prev) km += distanceKm(prev, HOME);
  const first = trips[0]?.visited.getFullYear() ?? new Date().getFullYear();
  return {
    count: visits.length,
    total: countries.length,
    percent: Math.round((visits.length / countries.length) * 100),
    continents: new Set(visits.map((v) => v.country.continent)).size,
    days: visits.reduce((s, v) => s + v.days, 0),
    years: new Date().getFullYear() - first,
    since: first,
    km: Math.round(km / 1000) * 1000,
  };
}

export function continentStats(visits: Visit[]) {
  return continents.map((c) => {
    const all = countries.filter((x) => x.continent === c.key);
    const seen = visits.filter((v) => v.country.continent === c.key);
    return { ...c, total: all.length, visited: seen.length, visits: seen, all };
  });
}

export function inCollection(visits: Visit[], key: string) {
  if (key === 'najlepsze') return visits.filter((v) => v.top);
  return visits.filter((v) => (v.tags as string[]).includes(key));
}

export function collectionList(visits: Visit[]) {
  return collectionsMeta.map((c) => ({ ...c, visits: inCollection(visits, c.key) }));
}
