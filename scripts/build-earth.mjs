import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { geoEquirectangular, geoOrthographic, geoPath, geoArea, geoCentroid } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import topo from 'world-atlas/countries-50m.json' with { type: 'json' };

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, 'scripts/earth-source.jpg');
const EARTH_OUT = path.join(ROOT, 'public/img/earth');
const GLOBES_OUT = path.join(ROOT, 'public/img/globes');
const CONTENT = path.join(ROOT, 'src/content/kraje');
const countries = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/countries.json'), 'utf8'));

const args = new Set(process.argv.slice(2));
const only = [...args].find((a) => a.startsWith('--only='))?.slice(7).split(',');

const features = feature(topo, topo.objects.countries).features;
const borders = mesh(topo, topo.objects.countries, (a, b) => a !== b);
const byCcn3 = new Map(countries.map((c) => [c.ccn3, c]));

fs.mkdirSync(EARTH_OUT, { recursive: true });
fs.mkdirSync(GLOBES_OUT, { recursive: true });

async function textures() {
  for (const w of [2048, 4096]) {
    await sharp(SOURCE).resize(w, w / 2).webp({ quality: w > 2048 ? 78 : 80 }).toFile(path.join(EARTH_OUT, `day-${w}.webp`));
  }
}

async function idMaps() {
  for (const W of [2048, 4096]) {
    const H = W / 2;
    const projection = geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, H / 2]).precision(0.1);
    const p = geoPath(projection);
    const paths = features
      .map((f, i) => `<path d="${p(f)}" fill="rgb(${i + 1},0,0)"/>`)
      .join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="rgb(0,0,0)"/>${paths}</svg>`;
    const raw = await sharp(Buffer.from(svg), { density: 72 }).removeAlpha().raw().toBuffer();
    const out = Buffer.alloc(W * H);
    for (let i = 0; i < W * H; i++) out[i] = raw[i * 3];
    await sharp(out, { raw: { width: W, height: H, channels: 1 } })
      .toColourspace('b-w')
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(path.join(EARTH_OUT, `ids-${W}.png`));
  }
  const index = features.map((f, i) => ({
    i: i + 1,
    id: f.id ? String(f.id) : '',
    name: byCcn3.get(String(f.id))?.name ?? f.properties?.name ?? '',
  }));
  fs.writeFileSync(path.join(EARTH_OUT, 'ids.json'), JSON.stringify(index));
}

function visitedCodes() {
  return fs
    .readdirSync(CONTENT)
    .filter((f) => f.endsWith('.md'))
    .map((f) => fs.readFileSync(path.join(CONTENT, f), 'utf8').match(/^country:\s*(\w+)/m)[1]);
}

function mainland(f) {
  if (f.geometry.type !== 'MultiPolygon') return f;
  let best = null;
  let area = -1;
  for (const coords of f.geometry.coordinates) {
    const g = { type: 'Feature', geometry: { type: 'Polygon', coordinates: coords } };
    const a = geoArea(g);
    if (a > area) {
      area = a;
      best = g;
    }
  }
  return best;
}

async function countryGlobes(tex) {
  const SIZE = 640;
  const R = SIZE * 0.455;
  const C = SIZE / 2;
  const { data: td, info: ti } = tex;
  const TW = ti.width;
  const TH = ti.height;
  const sample = (lon, lat) => {
    const u = ((lon + 180) / 360) * TW - 0.5;
    const v = ((90 - lat) / 180) * TH - 0.5;
    const x0 = Math.floor(u);
    const y0 = Math.max(0, Math.min(TH - 2, Math.floor(v)));
    const fx = u - x0;
    const fy = v - y0;
    const xa = ((x0 % TW) + TW) % TW;
    const xb = (xa + 1) % TW;
    const out = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const a = td[(y0 * TW + xa) * 3 + k];
      const b = td[(y0 * TW + xb) * 3 + k];
      const c = td[((y0 + 1) * TW + xa) * 3 + k];
      const d = td[((y0 + 1) * TW + xb) * 3 + k];
      out[k] = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
    }
    return out;
  };
  const L = [-0.42, 0.48, 0.77];
  const ln = Math.hypot(...L);
  const light = L.map((v) => v / ln);

  const codes = visitedCodes().filter((c) => !only || only.includes(c));
  for (const code of codes) {
    const country = countries.find((c) => c.code === code);
    const f = features.find((x) => String(x.id) === country.ccn3);
    const center = f ? geoCentroid(mainland(f)) : [country.lng, country.lat];
    const lat0 = Math.max(-42, Math.min(48, center[1]));
    const projection = geoOrthographic().scale(R).translate([C, C]).rotate([-center[0], -lat0]).clipAngle(90).precision(0.2);
    const rgba = Buffer.alloc(SIZE * SIZE * 4);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const dx = (x + 0.5 - C) / R;
        const dy = (C - (y + 0.5)) / R;
        const r2 = dx * dx + dy * dy;
        const o = (y * SIZE + x) * 4;
        if (r2 > 1) {
          const d = Math.sqrt(r2) - 1;
          const glow = Math.exp(-d * 22) * 0.55;
          rgba[o] = 120;
          rgba[o + 1] = 165;
          rgba[o + 2] = 255;
          rgba[o + 3] = Math.round(glow * 255);
          continue;
        }
        const ll = projection.invert([x + 0.5, y + 0.5]);
        if (!ll) continue;
        const col = sample(ll[0], ll[1]);
        const z = Math.sqrt(1 - r2);
        const diff = Math.max(0, dx * light[0] + dy * light[1] + z * light[2]);
        const shade = 0.32 + 0.85 * diff;
        const rim = Math.pow(1 - z, 3) * 0.45;
        const edge = Math.min(1, (1 - Math.sqrt(r2)) * R * 0.9);
        rgba[o] = Math.min(255, col[0] * shade + 90 * rim);
        rgba[o + 1] = Math.min(255, col[1] * shade + 140 * rim);
        rgba[o + 2] = Math.min(255, col[2] * shade + 255 * rim);
        rgba[o + 3] = Math.round(255 * Math.max(0, Math.min(1, edge)));
      }
    }
    const p = geoPath(projection).digits(1);
    const pin = projection([country.lng, country.lat]) ?? [C, C];
    const area = f ? geoArea(f) * 510e6 : 0;
    const tiny = area < 25000;
    const shape = f ? p(f) : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
      <defs>
        <radialGradient id="h" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#ffd2c2"/><stop offset="0.45" stop-color="#ff6a3d"/><stop offset="1" stop-color="#9c3214"/></radialGradient>
        <clipPath id="c"><circle cx="${C}" cy="${C}" r="${R}"/></clipPath>
      </defs>
      <g clip-path="url(#c)">
        <path d="${p(borders)}" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="0.8"/>
        ${shape ? `<path d="${shape}" fill="rgba(255,106,61,0.5)" stroke="#ffb08f" stroke-width="2.2" stroke-linejoin="round"/>` : ''}
        ${tiny ? `<circle cx="${pin[0]}" cy="${pin[1]}" r="20" fill="none" stroke="#ffffff" stroke-width="2" stroke-dasharray="5 5" opacity="0.85"/>` : ''}
      </g>
      <ellipse cx="${pin[0] + 7}" cy="${pin[1] + 3}" rx="9" ry="4" fill="rgba(0,0,0,0.45)"/>
      <line x1="${pin[0]}" y1="${pin[1]}" x2="${pin[0] + 9}" y2="${pin[1] - 22}" stroke="#d9dde0" stroke-width="2.4" stroke-linecap="round"/>
      <circle cx="${pin[0] + 10}" cy="${pin[1] - 26}" r="10" fill="url(#h)"/>
      <circle cx="${pin[0] + 7}" cy="${pin[1] - 29}" r="3" fill="rgba(255,255,255,0.7)"/>
    </svg>`;
    await sharp(rgba, { raw: { width: SIZE, height: SIZE, channels: 4 } })
      .composite([{ input: Buffer.from(svg) }])
      .webp({ quality: 80, alphaQuality: 90 })
      .toFile(path.join(GLOBES_OUT, `${code.toLowerCase()}.webp`));
    process.stdout.write(`${code} `);
  }
  console.log(`\nGlobusy krajów: ${codes.length}`);
}

if (!args.has('--globes-only')) {
  await textures();
  await idMaps();
  console.log('Tekstury i mapy identyfikatorów gotowe');
}
if (args.has('--maps-only')) process.exit(0);
const tex = await sharp(SOURCE).removeAlpha().raw().toBuffer({ resolveWithObject: true });
await countryGlobes(tex);
