import sharp from 'sharp';
import fs from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const input = args.input ?? 'scripts/hero-source.jpg';
const out = args.out ?? 'public/img/hero';
const W = Number(args.width ?? 2560);
const threshold = Number(args.threshold ?? 28);
const extend = Number(args.extend ?? 400);
const floors = (args.floor ?? '').split(',').filter(Boolean).map((f) => f.split(':').map(Number));
const widths = (args.sizes ?? '960,1600,2200').split(',').map(Number);

const { data, info } = await sharp(input).resize(W).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const H0 = info.height;
const H = H0 + extend;
const px = (x, y) => { const i = (y * W + x) * 3; return [data[i], data[i + 1], data[i + 2]]; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const sky = new Int32Array(W);
for (let x = 0; x < W; x++) {
  let ref = px(x, 2);
  let run = 0;
  let found = H0;
  for (let y = 3; y < H0; y++) {
    const c = px(x, y);
    if (dist(c, ref) > threshold) {
      if (++run >= 4) { found = y - 3; break; }
    } else {
      run = 0;
      ref = ref.map((v, k) => v * 0.85 + c[k] * 0.15);
    }
  }
  sky[x] = found;
}
for (const [x0, x1, y] of floors) for (let x = Math.round(x0 * W); x < Math.round(x1 * W); x++) sky[x] = Math.max(sky[x], Math.round(y * H0));
const line = new Int32Array(W);
for (let x = 0; x < W; x++) {
  const w = [];
  for (let k = -2; k <= 2; k++) w.push(sky[Math.min(W - 1, Math.max(0, x + k))]);
  line[x] = w.sort((a, b) => a - b)[2];
}

const top = new Float32Array(W * 3);
for (let x = 0; x < W; x++) for (let y = 0; y < 14; y++) { const c = px(x, y); for (let k = 0; k < 3; k++) top[x * 3 + k] += c[k] / 14; }
const R = 96;
const smooth = new Float32Array(W * 3);
for (let x = 0; x < W; x++) {
  let n = 0;
  for (let k = -R; k <= R; k++) { const xx = Math.min(W - 1, Math.max(0, x + k)); for (let c = 0; c < 3; c++) smooth[x * 3 + c] += top[xx * 3 + c]; n++; }
  for (let c = 0; c < 3; c++) smooth[x * 3 + c] /= n;
}

const rgb = Buffer.alloc(W * H * 3);
const alpha = Buffer.alloc(W * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 3;
    if (y < extend) {
      const t = (extend - y) / extend;
      const blend = Math.min(1, (extend - y) / 60);
      const base = [0, 1, 2].map((c) => smooth[x * 3 + c] * blend + top[x * 3 + c] * (1 - blend));
      const shade = 1 - 0.2 * t * t;
      const noise = (Math.random() - 0.5) * 3;
      rgb[o] = Math.max(0, Math.min(255, base[0] * shade * 0.97 + noise));
      rgb[o + 1] = Math.max(0, Math.min(255, base[1] * shade * 0.99 + noise));
      rgb[o + 2] = Math.max(0, Math.min(255, base[2] * shade + noise));
    } else {
      const c = px(x, y - extend);
      rgb[o] = c[0]; rgb[o + 1] = c[1]; rgb[o + 2] = c[2];
      const d = y - extend - line[x];
      alpha[y * W + x] = d >= 1 ? 255 : d <= -1 ? 0 : 128;
    }
  }
}

const mask = await sharp(alpha, { raw: { width: W, height: H, channels: 1 } }).blur(0.6).extractChannel(0).raw().toBuffer();
const rgba = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) {
  rgba[i * 4] = rgb[i * 3]; rgba[i * 4 + 1] = rgb[i * 3 + 1]; rgba[i * 4 + 2] = rgb[i * 3 + 2]; rgba[i * 4 + 3] = mask[i];
}

const soft = await sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).blur(18).raw().toBuffer();
const back = Buffer.from(rgb);
const margin = Math.round(W * 0.03);
for (let x = 0; x < W; x++) {
  for (let y = extend + line[x] + margin; y < H; y++) {
    const t = Math.min(1, (y - extend - line[x] - margin) / margin);
    const o = (y * W + x) * 3;
    for (let c = 0; c < 3; c++) back[o + c] = rgb[o + c] * (1 - t) + soft[o + c] * t;
  }
}

fs.mkdirSync(out, { recursive: true });
for (const w of widths) {
  await sharp(back, { raw: { width: W, height: H, channels: 3 } }).resize(w).webp({ quality: 76 }).toFile(`${out}/bg-${w}.webp`);
  await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).resize(w).webp({ quality: w > 2000 ? 70 : 76, alphaQuality: 80 }).toFile(`${out}/fg-${w}.webp`);
}
await sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).resize(48).blur(1.2).webp({ quality: 50 }).toFile(`${out}/bg-blur.webp`);

const profile = [];
for (let i = 0; i <= 20; i++) { const x = Math.min(W - 1, Math.round((i / 20) * W)); profile.push(((line[x] + extend) / H).toFixed(3)); }
console.log({ W, H, aspect: (W / H).toFixed(3), skyline: profile.join(' ') });
