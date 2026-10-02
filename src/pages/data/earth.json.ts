import type { APIRoute } from 'astro';
import { getImage } from 'astro:assets';
import ids from '../../../public/img/earth/ids.json';
import { continents } from '../../data/meta';
import { countries, getVisits, monthYear, travelled } from '../../lib/data';

export const GET: APIRoute = async () => {
  const visits = await getVisits();
  const byCode = new Map(visits.map((v) => [v.country.code, v]));
  const latest = travelled(visits)[0]?.country.ccn3;
  const list = await Promise.all(
    countries.map(async (c) => {
      const v = byCode.get(c.code);
      const img = v?.cover ? (await getImage({ src: v.cover.src, width: 400, format: 'webp', quality: 72 })).src : null;
      return {
        id: c.ccn3,
        n: c.name,
        s: c.slug,
        lat: c.lat,
        lng: c.lng,
        k: c.continent,
        c: continents.find((x) => x.key === c.continent)?.name ?? '',
        v: v ? (v.home ? 'dom' : monthYear(v.visited)) : null,
        img,
        alt: v?.cover?.alt ?? null,
        ex: v?.excerpt ?? null,
      };
    }),
  );
  return new Response(
    JSON.stringify({ latest, features: (ids as Array<{ i: number; id: string; name: string }>).map((f) => [f.id, f.name]), countries: list }),
    { headers: { 'Content-Type': 'application/json; charset=utf-8' } },
  );
};
