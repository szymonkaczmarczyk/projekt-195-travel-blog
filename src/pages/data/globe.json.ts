import type { APIRoute } from 'astro';
import { countries, getVisits, monthYear, travelled } from '../../lib/data';

export const GET: APIRoute = async () => {
  const visits = await getVisits();
  const byCode = new Map(visits.map((v) => [v.country.code, v]));
  const latest = travelled(visits)[0]?.country.ccn3;
  const list = countries.map((c) => {
    const v = byCode.get(c.code);
    return { id: c.ccn3, n: c.name, s: c.slug, lat: c.lat, lng: c.lng, v: v ? (v.home ? 'dom' : monthYear(v.visited)) : null };
  });
  return new Response(JSON.stringify({ latest, countries: list }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
