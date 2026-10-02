export type EarthCountry = {
  id: string;
  n: string;
  s: string;
  lat: number;
  lng: number;
  k: string;
  c: string;
  v: string | null;
  img: string | null;
  alt: string | null;
  ex: string | null;
};

type EarthData = { latest?: string; features: [string, string][]; countries: EarthCountry[] };

export type EarthApi = {
  flyTo(id: string, select?: boolean): void;
  zoomBy(factor: number): void;
  setSpin(on: boolean): void;
  isSpinning(): boolean;
  reset(): void;
  select(id: string | null): void;
  setShift(px: number): void;
  countries: EarthCountry[];
};

type Options = {
  reduced: boolean;
  onSelect?: (country: EarthCountry | null, name?: string) => void;
  onSpinChange?: (on: boolean) => void;
};

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform sampler2D uDay;
uniform sampler2D uIds;
uniform sampler2D uState;
uniform vec2 uCenter;
uniform float uRadius;
uniform mat3 uRot;
uniform vec2 uIdSize;
uniform vec3 uAccent;
const float PI = 3.141592653589793;

vec4 st(float id) {
  return texture2D(uState, vec2((id * 255.0 + 0.5) / 256.0, 0.5));
}

float differs(float a, float b) {
  return step(0.5 / 255.0, abs(a - b)) * step(0.5 / 255.0, a) * step(0.5 / 255.0, b);
}

void main() {
  vec2 p = (gl_FragCoord.xy - uCenter) / uRadius;
  float r2 = dot(p, p);
  if (r2 > 1.0) {
    float d = sqrt(r2) - 1.0;
    float g = exp(-d * 16.0) * 0.45;
    gl_FragColor = vec4(vec3(0.47, 0.65, 1.0) * g, g);
    return;
  }
  float z = sqrt(1.0 - r2);
  vec3 n = vec3(p, z);
  vec3 w = uRot * n;
  float lat = asin(clamp(w.y, -1.0, 1.0));
  float lon = atan(w.x, w.z);
  vec2 uv = vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI);
  vec3 col = texture2D(uDay, uv).rgb;

  vec2 tc = uv * uIdSize - 0.5;
  vec2 f = fract(tc);
  vec2 base = (floor(tc) + 0.5) / uIdSize;
  vec2 dx = vec2(1.0 / uIdSize.x, 0.0);
  vec2 dy = vec2(0.0, 1.0 / uIdSize.y);
  float i00 = texture2D(uIds, base).r;
  float i10 = texture2D(uIds, base + dx).r;
  float i01 = texture2D(uIds, base + dy).r;
  float i11 = texture2D(uIds, base + dx + dy).r;
  vec4 s00 = st(i00);
  vec4 s10 = st(i10);
  vec4 s01 = st(i01);
  vec4 s = mix(mix(s00, s10, f.x), mix(s01, st(i11), f.x), f.y);
  float border = clamp(differs(i00, i10) + differs(i00, i01), 0.0, 1.0);
  float outline = clamp(abs(s00.b - s10.b) + abs(s00.b - s01.b) + abs(s00.g - s10.g) + abs(s00.g - s01.g), 0.0, 1.0);

  float lum = dot(col, vec3(0.3, 0.59, 0.11));
  col = mix(col, uAccent * (0.45 + lum * 1.25), s.r * 0.58);
  col = mix(col, vec3(1.0), max(s.g, s.b) * 0.14);
  col = mix(col, vec3(1.0), border * 0.3);
  col = mix(col, vec3(1.0), outline * 0.95);

  vec3 L = normalize(vec3(-0.45, 0.5, 0.75));
  float diff = max(dot(n, L), 0.0);
  col *= 0.42 + 0.78 * diff;
  col += vec3(0.35, 0.55, 1.0) * pow(1.0 - z, 3.0) * 0.38;
  float edge = clamp((1.0 - sqrt(r2)) * uRadius, 0.0, 1.0);
  gl_FragColor = vec4(col * edge, edge);
}
`;

const PIN_COLORS = ['#ff6a3d', '#ff6a3d', '#f2c14e', '#4cb5ae', '#ece9e1', '#ff6a3d'];
const RAD = Math.PI / 180;

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export async function mountEarth(root: HTMLElement, opts: Options): Promise<EarthApi | null> {
  const glCanvas = root.querySelector<HTMLCanvasElement>('[data-earth-gl]')!;
  const pinCanvas = root.querySelector<HTMLCanvasElement>('[data-earth-pins]')!;
  const tip = root.querySelector<HTMLElement>('[data-earth-tip]');
  const gl = glCanvas.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: true });
  const ctx = pinCanvas.getContext('2d')!;
  if (!gl) return null;

  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  const size = !small && maxTex >= 4096 ? 4096 : 2048;

  const [data, day, ids] = await Promise.all([
    fetch('/data/earth.json').then((r) => r.json() as Promise<EarthData>),
    loadImage(`/img/earth/day-${size}.webp`),
    fetch(`/img/earth/ids-${size}.png`)
      .then((r) => r.blob())
      .then((b) => createImageBitmap(b, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })),
  ]);

  const idW = ids.width;
  const idH = ids.height;
  const scratch = document.createElement('canvas');
  scratch.width = idW;
  scratch.height = idH;
  const sctx = scratch.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(ids, 0, 0);
  const idPixels = sctx.getImageData(0, 0, idW, idH).data;

  const byId = new Map(data.countries.map((c) => [c.id, c]));
  const featureOf = new Map<string, number>();
  data.features.forEach(([ccn3], i) => ccn3 && featureOf.set(ccn3, i + 1));
  const pins = data.countries.filter((c) => c.v);
  const latest = data.latest;

  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader');
    return sh;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const texture = (unit: number, source: TexImageSource | null, filter: number, w = 0, h = 0, pixels?: Uint8Array) => {
    const t = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    if (source) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels ?? null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, source ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };

  texture(0, day, gl.LINEAR);
  texture(1, ids, gl.NEAREST);
  const stateData = new Uint8Array(256 * 4);
  data.features.forEach(([ccn3], i) => {
    if (byId.get(ccn3)?.v) stateData[(i + 1) * 4] = 255;
  });
  const stateTex = texture(2, null, gl.NEAREST, 256, 1, stateData);

  const u = (name: string) => gl.getUniformLocation(prog, name);
  gl.uniform1i(u('uDay'), 0);
  gl.uniform1i(u('uIds'), 1);
  gl.uniform1i(u('uState'), 2);
  gl.uniform2f(u('uIdSize'), idW, idH);
  gl.uniform3f(u('uAccent'), 1, 106 / 255, 61 / 255);
  const uCenter = u('uCenter');
  const uRadius = u('uRadius');
  const uRot = u('uRot');
  gl.disable(gl.DEPTH_TEST);

  const start = latest ? byId.get(latest) : undefined;
  const view = { lon: start ? start.lng - 30 : 20, lat: 22, zoom: 1 };
  let w = 0;
  let h = 0;
  let dpr = 1;
  let R = 1;
  let cx = 0;
  let cy = 0;
  let spin = !opts.reduced;
  let vel = 0;
  let dragging = false;
  let moved = 0;
  let hoverIdx = 0;
  let selectedIdx = 0;
  let selectedId: string | null = null;
  let anim: { from: typeof view; to: typeof view; t0: number; dur: number } | null = null;
  let running = false;
  let raf = 0;
  let last = performance.now();
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchStart = 0;
  let pinchZoom = 1;
  let shift = 0;
  let shiftTarget = 0;

  const setState = (idx: number, channel: 1 | 2, on: boolean) => {
    if (!idx) return;
    stateData[idx * 4 + channel] = on ? 255 : 0;
  };
  const pushState = () => {
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, stateTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, stateData);
  };

  const matrix = () => {
    const a = view.lat * RAD;
    const b = -view.lon * RAD;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const cb = Math.cos(b);
    const sb = Math.sin(b);
    return [cb, 0, sb, sa * sb, ca, -sa * cb, -ca * sb, sa, ca * cb];
  };

  const resize = () => {
    const rect = glCanvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = rect.width;
    h = rect.height;
    for (const c of [glCanvas, pinCanvas]) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    gl.viewport(0, 0, glCanvas.width, glCanvas.height);
  };

  const toScreen = (m: number[], lat: number, lng: number) => {
    const la = lat * RAD;
    const lo = lng * RAD;
    const x = Math.cos(la) * Math.sin(lo);
    const y = Math.sin(la);
    const z = Math.cos(la) * Math.cos(lo);
    const vx = m[0] * x + m[1] * y + m[2] * z;
    const vy = m[3] * x + m[4] * y + m[5] * z;
    const vz = m[6] * x + m[7] * y + m[8] * z;
    return { x: cx + vx * R, y: cy - vy * R, vx, vy, vz };
  };

  const pick = (mx: number, my: number): { country?: EarthCountry; name?: string; idx: number } | null => {
    const m = matrix();
    let best: EarthCountry | null = null;
    let bestD = 14;
    for (const p of pins) {
      const s = toScreen(m, p.lat, p.lng);
      if (s.vz < 0.1) continue;
      const hx = s.x + s.vx * R * 0.05;
      const hy = s.y - s.vy * R * 0.05 - 9;
      const d = Math.hypot(hx - mx, hy - my);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (best) return { country: best, idx: featureOf.get(best.id) ?? 0 };
    const px = (mx - cx) / R;
    const py = (cy - my) / R;
    const r2 = px * px + py * py;
    if (r2 > 1) return null;
    const nz = Math.sqrt(1 - r2);
    const wx = m[0] * px + m[3] * py + m[6] * nz;
    const wy = m[1] * px + m[4] * py + m[7] * nz;
    const wz = m[2] * px + m[5] * py + m[8] * nz;
    const lat = Math.asin(Math.max(-1, Math.min(1, wy)));
    const lon = Math.atan2(wx, wz);
    const ix = ((Math.floor((lon / (2 * Math.PI) + 0.5) * idW) % idW) + idW) % idW;
    const iy = Math.min(idH - 1, Math.max(0, Math.floor((0.5 - lat / Math.PI) * idH)));
    const idx = idPixels[(iy * idW + ix) * 4];
    if (!idx) return { idx: 0 };
    const [ccn3, name] = data.features[idx - 1] ?? ['', ''];
    return { country: byId.get(ccn3), name, idx };
  };

  const drawPins = (m: number[], now: number) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const scale = Math.min(1.35, 0.85 + view.zoom * 0.15);
    const items = pins
      .map((p) => ({ p, s: toScreen(m, p.lat, p.lng) }))
      .filter((o) => o.s.vz > 0.02)
      .sort((a, b) => a.s.vz - b.s.vz);
    for (const { p, s } of items) {
      const alpha = Math.min(1, (s.vz - 0.02) / 0.2);
      const isSel = p.id === selectedId;
      const k = scale * (isSel ? 1.35 : 1);
      const hx = s.x + s.vx * R * 0.05;
      const hy = s.y - s.vy * R * 0.05 - 9 * k;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      ctx.beginPath();
      ctx.ellipse(s.x + 3 * k, s.y + 1.5 * k, 3.6 * k, 1.6 * k, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#cfd5d8';
      ctx.lineWidth = 1.4 * k;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      const color = PIN_COLORS[hash(p.id) % PIN_COLORS.length];
      const r = 5.2 * k;
      const g = ctx.createRadialGradient(hx - r * 0.4, hy - r * 0.45, r * 0.1, hx, hy, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.28, color);
      g.addColorStop(1, shade(color));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(hx, hy, r, 0, Math.PI * 2);
      ctx.fill();
      if (p.id === latest) {
        const t = (now % 1800) / 1800;
        ctx.strokeStyle = `rgba(255,255,255,${0.75 * (1 - t) * alpha})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(hx, hy, r + 3 + t * 14, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  };

  const draw = (now: number) => {
    R = Math.min(w, h) * 0.43 * view.zoom;
    cx = w / 2;
    cy = h / 2 - shift;
    const m = matrix();
    gl.uniform2f(uCenter, cx * dpr, (h - cy) * dpr);
    gl.uniform1f(uRadius, R * dpr);
    gl.uniformMatrix3fv(uRot, false, new Float32Array(m));
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    drawPins(m, now);
  };

  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  const tick = (now: number) => {
    const dt = Math.min(64, now - last);
    last = now;
    shift += (shiftTarget - shift) * Math.min(1, dt / 120);
    if (anim) {
      const t = Math.min(1, (now - anim.t0) / anim.dur);
      const e = ease(t);
      view.lon = anim.from.lon + (anim.to.lon - anim.from.lon) * e;
      view.lat = anim.from.lat + (anim.to.lat - anim.from.lat) * e;
      view.zoom = anim.from.zoom + (anim.to.zoom - anim.from.zoom) * e;
      if (t >= 1) anim = null;
    } else if (!dragging) {
      if (Math.abs(vel) > 0.0005) {
        view.lon -= vel * dt;
        vel *= Math.pow(0.93, dt / 16);
      } else if (spin) {
        view.lon -= 0.004 * dt;
      }
    }
    draw(now);
    if (running) raf = requestAnimationFrame(tick);
  };

  const startLoop = () => {
    if (running) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };
  const stopLoop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };

  const showTip = (mx: number, my: number, hit: ReturnType<typeof pick>) => {
    if (!tip) return;
    if (!hit || !hit.idx && !hit.country) {
      tip.hidden = true;
      return;
    }
    const name = hit.country?.n ?? hit.name ?? '';
    const status = hit.country?.v ? (hit.country.v === 'dom' ? 'dom, punkt zero' : `byłem: ${hit.country.v}`) : hit.country ? 'jeszcze przede mną' : 'terytorium spoza listy';
    tip.hidden = false;
    tip.dataset.visited = String(Boolean(hit.country?.v));
    tip.querySelector('[data-tip-name]')!.textContent = name;
    tip.querySelector('[data-tip-status]')!.textContent = status;
    tip.style.transform = `translate(${mx + 16}px, ${my + 16}px)`;
  };

  const setHover = (idx: number) => {
    if (idx === hoverIdx) return;
    setState(hoverIdx, 1, false);
    setState(idx, 1, true);
    hoverIdx = idx;
    pushState();
  };

  const select = (id: string | null) => {
    setState(selectedIdx, 2, false);
    selectedId = id;
    selectedIdx = id ? featureOf.get(id) ?? 0 : 0;
    setState(selectedIdx, 2, true);
    pushState();
  };

  const local = (e: PointerEvent | WheelEvent) => {
    const rect = glCanvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  pinCanvas.addEventListener('pointerdown', (e) => {
    pinCanvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, local(e));
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
      pinchZoom = view.zoom;
    }
    dragging = true;
    moved = 0;
    vel = 0;
    anim = null;
  });

  pinCanvas.addEventListener('pointermove', (e) => {
    const p = local(e);
    const prev = pointers.get(e.pointerId);
    if (prev && dragging) {
      if (pointers.size === 2) {
        pointers.set(e.pointerId, p);
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchStart) view.zoom = Math.max(1, Math.min(5, (pinchZoom * d) / pinchStart));
        moved += 10;
        return;
      }
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      moved += Math.abs(dx) + Math.abs(dy);
      const k = 57.3 / R;
      view.lon -= dx * k;
      view.lat = Math.max(-80, Math.min(80, view.lat + dy * k));
      vel = (dx * k) / 16;
      pointers.set(e.pointerId, p);
      pinCanvas.style.cursor = 'grabbing';
      if (tip) tip.hidden = true;
      return;
    }
    if (e.pointerType === 'mouse') {
      const hit = pick(p.x, p.y);
      setHover(hit?.idx ?? 0);
      showTip(p.x, p.y, hit);
      pinCanvas.style.cursor = hit?.country ? 'pointer' : 'grab';
    }
  });

  const release = (e: PointerEvent) => {
    const p = local(e);
    pointers.delete(e.pointerId);
    if (pointers.size > 0) return;
    dragging = false;
    pinchStart = 0;
    pinCanvas.style.cursor = 'grab';
    if (moved < 6) {
      const hit = pick(p.x, p.y);
      if (hit?.country) {
        select(hit.country.id);
        opts.onSelect?.(hit.country);
      } else if (hit?.name) {
        select(null);
        opts.onSelect?.(null, hit.name);
      } else {
        select(null);
        opts.onSelect?.(null);
      }
    }
  };
  pinCanvas.addEventListener('pointerup', release);
  pinCanvas.addEventListener('pointercancel', release);
  pinCanvas.addEventListener('pointerleave', () => {
    setHover(0);
    if (tip) tip.hidden = true;
  });

  pinCanvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      anim = null;
      view.zoom = Math.max(1, Math.min(5, view.zoom * Math.exp(-e.deltaY * 0.0015)));
    },
    { passive: false },
  );

  const flyTo = (id: string, doSelect = true) => {
    const c = byId.get(id);
    if (!c) return;
    let lon = c.lng;
    while (lon - view.lon > 180) lon -= 360;
    while (lon - view.lon < -180) lon += 360;
    const zoom = Math.max(view.zoom, 1.6);
    anim = { from: { ...view }, to: { lon, lat: Math.max(-60, Math.min(60, c.lat)), zoom }, t0: performance.now(), dur: opts.reduced ? 1 : 1500 };
    if (doSelect) {
      select(id);
      opts.onSelect?.(c);
    }
  };

  new ResizeObserver(() => {
    resize();
    draw(performance.now());
  }).observe(glCanvas);
  new IntersectionObserver(([entry]) => (entry.isIntersecting ? startLoop() : stopLoop())).observe(root);

  resize();
  draw(performance.now());
  root.classList.add('is-ready');

  return {
    flyTo,
    zoomBy: (f) => {
      anim = { from: { ...view }, to: { ...view, zoom: Math.max(1, Math.min(5, view.zoom * f)) }, t0: performance.now(), dur: 450 };
    },
    setSpin: (on) => {
      spin = on;
      opts.onSpinChange?.(on);
    },
    isSpinning: () => spin,
    reset: () => {
      select(null);
      opts.onSelect?.(null);
      anim = { from: { ...view }, to: { lon: view.lon, lat: 22, zoom: 1 }, t0: performance.now(), dur: 900 };
    },
    select: (id) => select(id),
    setShift: (px) => {
      shiftTarget = px;
    },
    countries: data.countries,
  };
}

function shade(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * 0.45);
  const g = Math.round(((n >> 8) & 255) * 0.45);
  const b = Math.round((n & 255) * 0.45);
  return `rgb(${r},${g},${b})`;
}
