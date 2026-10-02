import { geoOrthographic, geoPath, geoGraticule10, geoContains, geoDistance, type GeoPermissibleObjects } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';

type Entry = { id: string; n: string; s: string; lat: number; lng: number; v: string | null };
type Data = { latest?: string; countries: Entry[] };

const COLORS = {
  ocean: '#111916',
  oceanLight: '#1a2521',
  land: '#2a3430',
  landHover: '#3a4641',
  visited: '#ff6a3d',
  visitedHover: '#ffb08f',
  border: 'rgba(13,17,16,0.9)',
  grid: 'rgba(236,233,225,0.06)',
  rim: 'rgba(236,233,225,0.18)',
  pinIdle: 'rgba(236,233,225,0.35)',
};

export async function mountGlobe(root: HTMLElement, opts: { reduced: boolean }) {
  const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
  const tip = root.querySelector<HTMLElement>('[data-globe-tip]')!;
  const ctx = canvas.getContext('2d')!;

  const [topo, data] = await Promise.all([
    fetch('/data/world-110m.json').then((r) => r.json() as Promise<Topology>),
    fetch('/data/globe.json').then((r) => r.json() as Promise<Data>),
  ]);

  const geo = feature(topo, topo.objects.countries as GeometryCollection);
  const byId = new Map(data.countries.map((c) => [c.id, c]));
  const shapes = geo.features.map((f) => ({ f, info: f.id ? byId.get(String(f.id)) : undefined, name: (f.properties as { name?: string })?.name ?? '' }));
  const withShape = new Set(shapes.map((s) => s.info?.id).filter(Boolean));
  const pins = data.countries.filter((c) => !withShape.has(c.id));
  const latest = data.countries.find((c) => c.id === data.latest);

  const projection = geoOrthographic().clipAngle(90).precision(0.6);
  const path = geoPath(projection, ctx);
  const graticule = geoGraticule10();
  const sphere = { type: 'Sphere' } as GeoPermissibleObjects;

  let w = 0;
  let h = 0;
  let dpr = 1;
  let rot: [number, number] = latest ? [-latest.lng + 25, -28] : [-20, -30];
  let vel = 0;
  let dragging = false;
  let hover: (typeof shapes)[number] | Entry | null = null;
  let lastPointer = { x: 0, y: 0 };
  let running = false;
  let raf = 0;
  let last = performance.now();
  let pulse = 0;

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = rect.width;
    h = rect.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    projection.scale(Math.min(w, h) / 2 - 2).translate([w / 2, h / 2]);
  };

  const isVisited = (s: (typeof shapes)[number]) => Boolean(s.info?.v);
  const visible = (lng: number, lat: number) => geoDistance([lng, lat], [-rot[0], -rot[1]]) < Math.PI / 2 - 0.04;

  const draw = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    projection.rotate([rot[0], rot[1], 0]);
    const [cx, cy] = projection.translate();
    const r = projection.scale();

    const ocean = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    ocean.addColorStop(0, COLORS.oceanLight);
    ocean.addColorStop(1, COLORS.ocean);
    ctx.beginPath();
    path(sphere);
    ctx.fillStyle = ocean;
    ctx.fill();

    ctx.beginPath();
    path(graticule);
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 0.6;
    ctx.stroke();

    for (const s of shapes) {
      ctx.beginPath();
      path(s.f);
      const hot = hover === s;
      ctx.fillStyle = isVisited(s) ? (hot ? COLORS.visitedHover : COLORS.visited) : hot ? COLORS.landHover : COLORS.land;
      ctx.fill();
    }

    ctx.beginPath();
    for (const s of shapes) path(s.f);
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 0.7;
    ctx.stroke();

    for (const p of pins) {
      if (!visible(p.lng, p.lat)) continue;
      const xy = projection([p.lng, p.lat]);
      if (!xy) continue;
      const hot = hover === p;
      ctx.beginPath();
      ctx.arc(xy[0], xy[1], hot ? 4.5 : p.v ? 3.2 : 2.2, 0, Math.PI * 2);
      ctx.fillStyle = p.v ? (hot ? COLORS.visitedHover : COLORS.visited) : COLORS.pinIdle;
      ctx.fill();
      if (p.v) {
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = COLORS.border;
        ctx.stroke();
      }
    }

    if (latest && visible(latest.lng, latest.lat)) {
      const xy = projection([latest.lng, latest.lat]);
      if (xy) {
        const t = (pulse % 1800) / 1800;
        ctx.beginPath();
        ctx.arc(xy[0], xy[1], 4 + t * 16, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(236,233,225,${0.7 * (1 - t)})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(xy[0], xy[1], 4, 0, Math.PI * 2);
        ctx.fillStyle = '#ece9e1';
        ctx.fill();
      }
    }

    const shade = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.2, cx, cy, r * 1.02);
    shade.addColorStop(0, 'rgba(255,255,255,0.05)');
    shade.addColorStop(0.65, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.beginPath();
    path(sphere);
    ctx.fillStyle = shade;
    ctx.fill();
    ctx.strokeStyle = COLORS.rim;
    ctx.lineWidth = 1;
    ctx.stroke();
  };

  const tick = (now: number) => {
    const dt = Math.min(64, now - last);
    last = now;
    pulse += dt;
    if (!dragging) {
      if (Math.abs(vel) > 0.001) {
        rot[0] += vel * dt;
        vel *= Math.pow(0.94, dt / 16);
      } else if (!opts.reduced) {
        rot[0] += 0.006 * dt;
      }
    }
    draw();
    if (running) raf = requestAnimationFrame(tick);
  };

  const start = () => {
    if (running) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };

  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };

  const pick = (x: number, y: number) => {
    const ll = projection.invert?.([x, y]);
    if (!ll || geoDistance(ll, [-rot[0], -rot[1]]) > Math.PI / 2) return null;
    for (const p of pins) {
      if (!visible(p.lng, p.lat)) continue;
      const xy = projection([p.lng, p.lat]);
      if (xy && Math.hypot(xy[0] - x, xy[1] - y) < 9) return p;
    }
    return shapes.find((s) => geoContains(s.f, ll)) ?? null;
  };

  const label = (target: (typeof shapes)[number] | Entry) => {
    const info = 'f' in target ? target.info : target;
    const name = info?.n ?? ('name' in target ? target.name : '');
    const status = info?.v ? (info.v === 'dom' ? 'dom, punkt zero' : `byłem: ${info.v}`) : info ? 'jeszcze przede mną' : 'terytorium spoza listy';
    return { name, status, visited: Boolean(info?.v), slug: info?.s };
  };

  const showTip = (x: number, y: number) => {
    if (!hover) {
      tip.hidden = true;
      canvas.style.cursor = dragging ? 'grabbing' : 'grab';
      return;
    }
    const l = label(hover);
    tip.hidden = false;
    tip.dataset.visited = String(l.visited);
    tip.querySelector('[data-tip-name]')!.textContent = l.name;
    tip.querySelector('[data-tip-status]')!.textContent = l.status;
    tip.style.transform = `translate(${x + 16}px, ${y + 16}px)`;
    canvas.style.cursor = l.visited && l.slug ? 'pointer' : dragging ? 'grabbing' : 'grab';
  };

  let downAt = { x: 0, y: 0, t: 0 };

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    vel = 0;
    lastPointer = { x: e.clientX, y: e.clientY };
    downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (dragging) {
      const dx = e.clientX - lastPointer.x;
      const dy = e.clientY - lastPointer.y;
      const k = 90 / projection.scale();
      rot[0] += dx * k;
      rot[1] = Math.max(-70, Math.min(70, rot[1] - dy * k));
      vel = (dx * k) / 16;
      lastPointer = { x: e.clientX, y: e.clientY };
    }
    if (e.pointerType === 'mouse') {
      hover = pick(x, y);
      showTip(x, y);
    }
  });

  const release = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    if (moved < 6) {
      const rect = canvas.getBoundingClientRect();
      const hit = pick(e.clientX - rect.left, e.clientY - rect.top);
      if (hit) {
        const l = label(hit);
        if (l.visited && l.slug) {
          window.location.href = `/kraje/${l.slug}/`;
          return;
        }
        if (e.pointerType !== 'mouse') {
          hover = hit;
          showTip(e.clientX - rect.left, e.clientY - rect.top);
          setTimeout(() => {
            hover = null;
            tip.hidden = true;
          }, 2200);
        }
      }
    }
  };

  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', () => (dragging = false));
  canvas.addEventListener('pointerleave', () => {
    if (dragging) return;
    hover = null;
    tip.hidden = true;
  });

  new ResizeObserver(() => {
    resize();
    draw();
  }).observe(canvas);

  new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : stop()), { rootMargin: '100px' }).observe(root);

  resize();
  draw();
  root.classList.add('is-ready');
}
