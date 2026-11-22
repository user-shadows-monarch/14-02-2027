/* 3D flight map, no libraries.
   - The ground is the same real map tiles, laid on a tilted plane with a perspective camera (CSS 3D matrix),
     so it needs no special permissions from the tile servers.
   - A second canvas on top draws everything that stands above the ground with the SAME camera maths:
     the raised glowing flight path, 3D pins, clouds, sparkles and a lit 3D airliner.
   It exposes the same interface as the flat map (map.js), so the rest of the page works unchanged. */
(function () {
  'use strict';
  const TILE = 256, D2R = Math.PI / 180, TAU = Math.PI * 2, MAX_TILES = 150, ALT = 40, PS = 1.3;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeInOut = k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const easeSine = k => -(Math.cos(Math.PI * k) - 1) / 2;
  const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

  const mercX = lng => (lng + 180) / 360;
  const mercY = lat => { const s = Math.sin(clamp(lat, -85.05, 85.05) * D2R); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
  const unX = x => x * 360 - 180;
  const unY = y => Math.atan(Math.sinh(Math.PI - 2 * Math.PI * y)) / D2R;

  function greatCircle(a, b, n) {
    const p1 = a.lat * D2R, l1 = a.lng * D2R, p2 = b.lat * D2R, l2 = b.lng * D2R;
    const d = 2 * Math.asin(Math.sqrt(Math.pow(Math.sin((p2 - p1) / 2), 2) + Math.cos(p1) * Math.cos(p2) * Math.pow(Math.sin((l2 - l1) / 2), 2)));
    const out = [];
    for (let i = 0; i <= n; i++) {
      const f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
      const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
      const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
      const z = A * Math.sin(p1) + B * Math.sin(p2);
      out.push({ lat: Math.atan2(z, Math.sqrt(x * x + y * y)) / D2R, lng: Math.atan2(y, x) / D2R });
    }
    return { pts: out, km: d * 6371 };
  }

  const mul = (A, B) => {
    const R = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += A[i][k] * B[k][j]; R[i][j] = s; }
    return R;
  };

  function providers(cfg) {
    const list = [];
    const needsKey = cfg && cfg.custom && /\{key\}/.test(cfg.custom);
    if (cfg && cfg.custom && (!needsKey || cfg.key)) {
      const url = String(cfg.custom).replace(/\{key\}/g, encodeURIComponent(cfg.key || ''));
      list.push({ name: 'custom', url, sub: cfg.subdomains || '', light: !!cfg.light, retina: !!cfg.retina, max: cfg.maxZoom || 18 });
    }
    list.push(
      { name: 'esri', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', retina: false, max: 16 },
      { name: 'osm', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', retina: false, max: 18, light: true }
    );
    return list;
  }

  /* ---------- low-poly airliner (units ~ px; x = right wing, y = nose, z = up) ---------- */
  function buildPlane() {
    const F = [];
    const ring = (pts, sides, col, skip) => {
      for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < sides; k++) {
        const a0 = k / sides * TAU, a1 = (k + 1) / sides * TAU, A = pts[i], B = pts[i + 1];
        const v = (p, a) => [p[2] + p[1] * Math.cos(a) * (p[3] || 1), p[0], p[1] * Math.sin(a)];
        const top = Math.sin((a0 + a1) / 2) > 0.2;
        F.push({ p: [v(A, a0), v(A, a1), v(B, a1), v(B, a0)], c: (skip && skip(i, k, top)) || col });
      }
    };
    // fuselage rings: [y, radius, x-offset]
    const fus = [[31, 0.9, 0], [25, 3.3, 0], [17, 4.5, 0], [-14, 4.5, 0], [-25, 3.1, 0], [-31, 1.3, 0]];
    ring(fus, 8, [255, 244, 248], (i, k, top) => (i === 1 && top ? [40, 62, 120] : null));
    // wings (top + underside) and winglets
    [-1, 1].forEach(s => {
      F.push({ p: [[3 * s, 8, -1], [3 * s, -4, -1], [27 * s, -16, 2.5], [27 * s, -9, 2.5]], c: [255, 226, 238] });
      F.push({ p: [[3 * s, 8, -1.8], [3 * s, -4, -1.8], [27 * s, -16, 1.7], [27 * s, -9, 1.7]], c: [233, 184, 204] });
      F.push({ p: [[27 * s, -9, 2.5], [27 * s, -16, 2.5], [28 * s, -17, 8.5], [28 * s, -12, 8.5]], c: [255, 111, 166] });
      ring([[2, 2.7, 11 * s], [-5, 2.7, 11 * s]], 8, [236, 214, 224]);
      F.push({ p: [[1.5 * s, -22, 1.5], [1.5 * s, -28, 1.5], [11 * s, -31, 1.8], [11 * s, -26.5, 1.8]], c: [255, 226, 238] });
    });
    F.push({ p: [[0, -17, 4.2], [0, -30, 3.2], [0, -33, 13.5], [0, -26, 13.5]], c: [255, 111, 166] });
    return F;
  }

  class Map3D {
    constructor(canvas, from, to, tileCfg) {
      this.canvas = canvas; this.g = canvas.getContext('2d');
      this.from = from; this.to = to;
      const gc = greatCircle(from, to, 260);
      this.route = gc.pts; this.km = gc.km;
      this.pitchOverview = 0.72; this.pitchFlight = 0.86;
      this.cam = { lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2, zoom: 4.2, heading: 0, pitch: this.pitchOverview };
      this.cam.heading = this.routeHeading(0.5);
      this.focusY = 0.5; this.stops = []; this.visited = -1; this.progress = 0;
      this.showRoute = true; this.showPlane = true; this.flying = false;
      this.sparks = []; this.anims = []; this.running = false;
      this.planeHeading = this.routeHeading(0); this.bank = 0; this.pitchAng = 0;
      this.retina = (window.devicePixelRatio || 1) > 1.4;
      this.tilesSeen = 0; this.fails = 0; this.pi = 0; this.provs = providers(tileCfg);
      this.layers = new Map(); this.seq = 10; this.lastNow = 0; this.planeXY = { x: 0, y: 0 };
      this.pov = 'chase'; this.povBlend = 0; this.ep = this.cam.pitch; this.cr = 1; this.sr = 0; this.roll = 0; this.curAlt = 0; this.cz0 = { x: 0, y: 0 }; this._lastE = -1;
      this.mesh = buildPlane();
      this.clouds = this.makeClouds();

      const wrap = document.createElement('div'); wrap.id = 'map3d';
      wrap.innerHTML = '<div class="m3-world"></div><div class="m3-tint"></div><div class="m3-screen"></div><div class="m3-vig"></div><div class="m3-haze"></div><div class="m3-fog"></div>';
      canvas.parentNode.insertBefore(wrap, canvas);
      this.wrap = wrap; this.world = wrap.firstChild;
      this.haze = wrap.querySelector('.m3-haze'); this.fogEl = wrap.querySelector('.m3-fog');
      // cockpit window frame, drawn above the flight canvas
      const cock = document.createElement('div'); cock.className = 'm3-cockpit';
      cock.innerHTML = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs>'
        + '<linearGradient id="ck-d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c0c36"/><stop offset="1" stop-color="#05030d"/></linearGradient>'
        + '<linearGradient id="ck-l" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#05030d"/><stop offset="1" stop-color="#1c0c36"/></linearGradient>'
        + '<linearGradient id="ck-r" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#05030d"/><stop offset="1" stop-color="#1c0c36"/></linearGradient>'
        + '<radialGradient id="ck-g" cx=".5" cy="1" r=".75"><stop offset="0" stop-color="#ff2d75" stop-opacity=".38"/><stop offset="1" stop-color="#ff2d75" stop-opacity="0"/></radialGradient></defs>'
        + '<rect x="0" y="80" width="100" height="20" fill="url(#ck-g)"/>'
        + '<path d="M0 100V89Q50 83 100 89V100Z" fill="url(#ck-d)"/>'
        + '<path d="M0 89Q50 83 100 89" fill="none" stroke="#ff6fa6" stroke-opacity=".75" stroke-width="1" vector-effect="non-scaling-stroke"/>'
        + '<path d="M0 0H6L2.8 89H0Z" fill="url(#ck-l)"/><path d="M100 0H94L97.2 89H100Z" fill="url(#ck-r)"/>'
        + '<path d="M6 0L2.8 89M94 0L97.2 89" stroke="#ff6fa6" stroke-opacity=".45" stroke-width="1" vector-effect="non-scaling-stroke"/>'
        + '<path d="M0 0H100V3.500Q50 6.500 0 3.500Z" fill="#05030d" opacity=".9"/>'
        + '<g fill="#ff8fb2"><rect x="30" y="93" width="1.600" height=".9" opacity=".9"/><rect x="34" y="93" width="1.600" height=".9" opacity=".5"/><rect x="38" y="93" width="1.600" height=".9" opacity=".9"/><rect x="60" y="93" width="1.600" height=".9" opacity=".5"/><rect x="64" y="93" width="1.600" height=".9" opacity=".9"/><rect x="68" y="93" width="1.600" height=".9" opacity=".5"/></g></svg>';
      canvas.parentNode.insertBefore(cock, canvas.nextSibling);
      this.cock = cock;
      new MutationObserver(() => { const on = canvas.classList.contains('on'); wrap.classList.toggle('on', on); cock.classList.toggle('on', on); }).observe(canvas, { attributes: true, attributeFilter: ['class'] });

      this.resize();
      addEventListener('resize', () => this.resize());
    }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
      this.canvas.width = Math.round(this.w * this.dpr); this.canvas.height = Math.round(this.h * this.dpr);
      this.g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.D = clamp(this.h * 0.85, 520, 900);
    }

    /* ---------- geometry ---------- */
    project(lat, lng, z) { const n = TILE * Math.pow(2, z); return { x: mercX(lng) * n, y: mercY(lat) * n }; }
    pathAt(t) {
      const f = clamp(t, 0, 1) * (this.route.length - 1), i = Math.min(this.route.length - 2, Math.floor(f)), k = f - i;
      const a = this.route[i], b = this.route[i + 1];
      return { lat: lerp(a.lat, b.lat, k), lng: lerp(a.lng, b.lng, k) };
    }
    routeHeading(t) {
      const a = this.pathAt(clamp(t - 0.01, 0, 1)), b = this.pathAt(clamp(t + 0.02, 0, 1));
      return Math.atan2(mercX(b.lng) - mercX(a.lng), -(mercY(b.lat) - mercY(a.lat)));
    }
    alt(t) { return ALT * Math.pow(Math.max(0, Math.sin(Math.PI * clamp(t, 0, 1))), 0.6); }

    /* camera basis for this frame. In plane view the aim point slides forward so that the camera sits ON the plane. */
    upd() {
      const c = this.cam, e = this.povBlend;
      let ep = c.pitch;
      if (e > 0.001) {
        const cosv = clamp((this.curAlt + 16) / this.D, 0.02, 0.6);
        ep = lerp(c.pitch, Math.min(1.5, Math.acos(cosv) + this.pitchAng * 0.6), e);
      }
      this.ep = ep;
      this.ca = Math.cos(c.heading); this.sa = Math.sin(c.heading); this.cp = Math.cos(ep); this.sp = Math.sin(ep);
      const base = this.project(c.lat, c.lng, c.zoom), off = e * this.D * this.sp;
      this.cz0 = base;
      this.cz = { x: base.x + this.sa * off, y: base.y - this.ca * off };
      this.roll = e * clamp(this.bank * 0.9, -0.4, 0.4); this.cr = Math.cos(this.roll); this.sr = Math.sin(this.roll);
    }
    pg(gx, gy, gz) {
      const ff = this.sa * gx - this.ca * gy, x0 = this.ca * gx + this.sa * gy;
      const zc = this.sp * ff - this.cp * gz + this.D, y0 = this.cp * ff + this.sp * gz, k = this.D / zc;
      const xc = x0 * this.cr - y0 * this.sr, yc = x0 * this.sr + y0 * this.cr;
      return { x: this.w / 2 + xc * k, y: this.h * this.focusY - yc * k, k, z: zc };
    }
    P(lat, lng, alt) { const p = this.project(lat, lng, this.cam.zoom); return this.pg(p.x - this.cz.x, p.y - this.cz.y, alt || 0); }
    toScreen(lat, lng) { return this.P(lat, lng, 0); }
    ground(X, Y) {
      const tp = Math.tan(this.ep), a = X - this.w / 2, bb = this.h * this.focusY - Y;
      const a0 = a * this.cr + bb * this.sr, b0 = -a * this.sr + bb * this.cr;
      const eta = Math.max(-b0 / this.D, -0.78 / tp);
      const zc = this.D / (1 + eta * tp), xc = a0 / this.D * zc, ff = -eta * zc / this.cp;
      return { gx: this.ca * xc + this.sa * ff, gy: this.sa * xc - this.ca * ff };
    }

    /* switch between the chase camera and the view from the plane */
    setPov(mode) {
      if (mode === this.pov) return;
      this.pov = mode;
      const a = this.povBlend, b = mode === 'cockpit' ? 1 : 0;
      this.anims = this.anims.filter(x => x.tag !== 'pov');
      this.anims.push({ start: performance.now(), ms: 1500, ease: easeInOut, fn: e => { this.povBlend = lerp(a, b, e); }, done() {}, tag: 'pov' });
    }

    /* camera that fits the whole route (used for the overview) */
    fit(padTop, padBottom, padSide) {
      const save = Object.assign({}, this.cam), saveF = this.focusY;
      const mid = this.pathAt(0.5), hd = this.routeHeading(0.5);
      const focusY = (padTop + (this.h - padTop - padBottom) / 2) / this.h;
      Object.assign(this.cam, { lat: mid.lat, lng: mid.lng, heading: hd, pitch: this.pitchOverview }); this.focusY = focusY;
      let z = 7.5;
      for (; z > 2; z -= 0.05) {
        this.cam.zoom = z; this.upd();
        let ok = true;
        for (let i = 0; i < this.route.length && ok; i += 4) {
          const p = this.P(this.route[i].lat, this.route[i].lng, 0), q = this.P(this.route[i].lat, this.route[i].lng, 36);
          if (p.z < 40 || p.x < padSide || p.x > this.w - padSide || q.y < padTop || p.y > this.h - padBottom) ok = false;
        }
        if (ok) break;
      }
      const out = { lat: mid.lat, lng: mid.lng, zoom: z, focusY, heading: hd, pitch: this.pitchOverview };
      Object.assign(this.cam, save); this.focusY = saveF; this.upd();
      return out;
    }

    /* ---------- tiles ---------- */
    get prov() { return this.provs[this.pi]; }
    url(z, x, y) {
      const p = this.prov;
      return p.url.replace('{s}', p.sub ? p.sub[(x + y) % p.sub.length] : '').replace('{z}', z).replace('{x}', x).replace('{y}', y)
        .replace('{r}', this.retina && p.retina ? '@2x' : '');
    }
    switchProvider() {
      if (this.pi >= this.provs.length - 1) return;
      this.pi++; this.fails = 0;
      this.layers.forEach(L => L.el.remove()); this.layers.clear();
      if (window.console) console.warn('[gift] map tiles: switching to', this.prov.name);
    }
    makeLayer(tz, base) {
      const c = this.project(this.cam.lat, this.cam.lng, tz);
      const el = document.createElement('div'); el.className = 'layer';
      el.style.zIndex = base ? 1 : ++this.seq; this.world.appendChild(el);
      const L = { tz, el, base, tiles: new Map(), ox: Math.floor(c.x / TILE), oy: Math.floor(c.y / TILE), range: '', born: performance.now(), vis: 0, ok: 0 };
      this.layers.set(base ? 'base' : tz, L);
      return L;
    }
    addTile(L, tx, ty) {
      const key = tx + ',' + ty;
      if (L.tiles.has(key)) return;
      const n = Math.pow(2, L.tz);
      if (ty < 0 || ty >= n) return;
      const img = new Image(); img.decoding = 'async'; img.draggable = false; img.alt = '';
      const t = { img, tx, ty, ok: false };
      const pi = this.pi;
      img.onload = () => { t.ok = true; img.classList.add('ok'); this.tilesSeen++; };
      img.onerror = () => { if (pi !== this.pi) return; this.fails++; if (this.tilesSeen === 0 && this.fails >= 6) this.switchProvider(); };
      img.style.left = (tx - L.ox) * TILE + 'px'; img.style.top = (ty - L.oy) * TILE + 'px';
      img.src = this.url(L.tz, ((tx % n) + n) % n, ty);
      L.el.appendChild(img); L.tiles.set(key, t);
    }
    reorigin(L) {
      const c = this.project(this.cam.lat, this.cam.lng, L.tz);
      L.ox = Math.floor(c.x / TILE); L.oy = Math.floor(c.y / TILE);
      L.tiles.forEach(t => { t.img.style.left = (t.tx - L.ox) * TILE + 'px'; t.img.style.top = (t.ty - L.oy) * TILE + 'px'; });
    }
    layerMatrix(L) {
      const cam = this.cam, s = Math.pow(2, cam.zoom - L.tz), c = this.project(cam.lat, cam.lng, L.tz);
      const Cx = c.x + (this.cz.x - this.cz0.x) / s - L.ox * TILE, Cy = c.y + (this.cz.y - this.cz0.y) / s - L.oy * TILE;
      const a = this.ca, b = this.sa, cp = this.cp, sp = this.sp, D = this.D, cr = this.cr, sr = this.sr;
      const S = [[s, 0, 0, -s * Cx], [0, s, 0, -s * Cy], [0, 0, 1, 0], [0, 0, 0, 1]];
      const R0 = [a, b, 0, 0], R1 = [cp * b, -cp * a, sp, 0];
      const R = [R0.map((v, i) => cr * v - sr * R1[i]), R0.map((v, i) => sr * v + cr * R1[i]), [sp * b, -sp * a, -cp, D], [0, 0, 0, 1]];
      const Pm = [[D, 0, this.w / 2, 0], [0, -D, this.h * this.focusY, 0], [0, 0, 1, 0], [0, 0, 1, 0]];
      const M = mul(Pm, mul(R, S)), o = [];
      M[2] = [0, 0, 1, 0]; // flat depth (z = 0), like a normal CSS perspective: otherwise the compositor clips the tiles away
      for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) o.push(M[row][col].toFixed(6));
      return 'matrix3d(' + o.join(',') + ')';
    }
    updateTiles(now) {
      // permanent coarse layer under everything: never an empty map
      let base = this.layers.get('base');
      if (!base) {
        base = this.makeLayer(3, true);
        let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
        this.route.forEach(p => { x0 = Math.min(x0, mercX(p.lng)); x1 = Math.max(x1, mercX(p.lng)); y0 = Math.min(y0, mercY(p.lat)); y1 = Math.max(y1, mercY(p.lat)); });
        for (let x = Math.floor(x0 * 8) - 2; x <= Math.floor(x1 * 8) + 2; x++) for (let y = Math.floor(y0 * 8) - 2; y <= Math.floor(y1 * 8) + 2; y++) this.addTile(base, x, y);
      }
      const tz = clamp(Math.round(this.cam.zoom), 3, Math.min(17, this.prov.max));
      let cur = this.layers.get(tz);
      if (!cur) cur = this.makeLayer(tz, false);
      if (cur.tz <= 3) { /* base already covers it */ }
      else {
        const s = Math.pow(2, this.cam.zoom - tz), c = this.project(this.cam.lat, this.cam.lng, tz);
        c.x += (this.cz.x - this.cz0.x) / s; c.y += (this.cz.y - this.cz0.y) / s;
        const tp = Math.tan(this.ep);
        const yTop = Math.max(this.h * 0.1, this.h * this.focusY - 0.72 / tp * this.D);
        const pts = [[-60, yTop], [this.w + 60, yTop], [this.w + 60, this.h + 60], [-60, this.h + 60]].map(p => this.ground(p[0], p[1]));
        let minX = 1e18, maxX = -1e18, minY = 1e18, maxY = -1e18;
        pts.forEach(p => { const X = c.x + p.gx / s, Y = c.y + p.gy / s; minX = Math.min(minX, X); maxX = Math.max(maxX, X); minY = Math.min(minY, Y); maxY = Math.max(maxY, Y); });
        let x0 = Math.floor(minX / TILE), x1 = Math.floor(maxX / TILE), y0 = Math.floor(minY / TILE), y1 = Math.floor(maxY / TILE);
        while ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_TILES) { x0++; x1--; y0++; y1--; if (x0 >= x1) break; }
        if (Math.abs(c.x / TILE - (cur.ox + 0.5)) > 8 || Math.abs(c.y / TILE - (cur.oy + 0.5)) > 8) this.reorigin(cur);
        const range = x0 + ',' + x1 + ',' + y0 + ',' + y1;
        if (range !== cur.range) {
          cur.range = range;
          for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.addTile(cur, x, y);
          if (cur.tiles.size > 260) cur.tiles.forEach((t, k) => { if (t.tx < x0 - 3 || t.tx > x1 + 3 || t.ty < y0 - 3 || t.ty > y1 + 3) { t.img.remove(); cur.tiles.delete(k); } });
        }
        let vis = 0, ok = 0;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const t = cur.tiles.get(x + ',' + y); if (t) { vis++; if (t.ok) ok++; } }
        cur.vis = vis; cur.ok = ok;
        // once the sharper layer is mostly in, retire the others (keep the coarse base)
        if (vis && ok / vis >= 0.85 || now - cur.born > 2500) {
          this.layers.forEach((L, k) => { if (L !== cur && !L.base) { L.el.remove(); this.layers.delete(k); } });
        }
      }
      this.layers.forEach(L => { L.el.style.transform = this.layerMatrix(L); });
    }
    prefetch() {
      const want = new Set();
      const add = (z, lat, lng, r) => {
        const n = Math.pow(2, z), tx = Math.floor(mercX(lng) * n), ty = Math.floor(mercY(lat) * n);
        for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) { const x = ((tx + dx) % n + n) % n, y = ty + dy; if (y >= 0 && y < n && z <= this.prov.max) want.add(z + '/' + x + '/' + y); }
      };
      const gentle = !!this.prov.light;
      this.route.forEach((p, i) => {
        if (i % 3 === 0) add(5, p.lat, p.lng, 2);
        if (!gentle && i % 6 === 0) add(6, p.lat, p.lng, 2);
        if (!gentle && i % 10 === 0) add(7, p.lat, p.lng, 1);
      });
      if (!gentle) {
        const end = this.route[this.route.length - 1], st = this.route[0];
        [st, end].forEach(p => { add(7, p.lat, p.lng, 2); add(8, p.lat, p.lng, 2); });
        add(9, end.lat, end.lng, 2); add(10, end.lat, end.lng, 2); add(11, end.lat, end.lng, 2);
      }
      this.warm = this.warm || [];
      want.forEach(k => { const [z, x, y] = k.split('/').map(Number); const im = new Image(); im.src = this.url(z, x, y); this.warm.push(im); });
    }

    /* ---------- scenery ---------- */
    makeClouds() {
      let s = 11; const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
      const out = [];
      for (let i = 0; i < 26; i++) {
        const p = this.pathAt(rnd());
        const mx = mercX(p.lng) + (rnd() - 0.5) * 0.034, my = mercY(p.lat) + (rnd() - 0.5) * 0.034;
        out.push({ lat: unY(my), lng: unX(mx), alt: 46 + rnd() * 70, r: 46 + rnd() * 70, a: 0.07 + rnd() * 0.08, ph: rnd() * TAU });
      }
      return out;
    }

    heartPath(g, x, y, s) {
      g.beginPath(); g.moveTo(x, y + s * 0.95);
      g.bezierCurveTo(x - s * 1.7, y - s * 0.15, x - s * 0.95, y - s * 1.35, x, y - s * 0.5);
      g.bezierCurveTo(x + s * 0.95, y - s * 1.35, x + s * 1.7, y - s * 0.15, x, y + s * 0.95); g.closePath();
    }

    drawRoute(now) {
      const g = this.g, n = this.route.length, air = [], gnd = [];
      for (let i = 0; i < n; i++) {
        const r = this.route[i], t = i / (n - 1);
        gnd.push(this.P(r.lat, r.lng, 0)); air.push(this.P(r.lat, r.lng, this.alt(t)));
      }
      const ok = p => p.z > 60 && Math.abs(p.x) < 4000 && Math.abs(p.y) < 4000;
      const stroke = (arr, from, to) => {
        g.beginPath(); let pen = false;
        for (let i = from; i <= to; i++) { const p = arr[i]; if (!ok(p)) { pen = false; continue; } pen ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); pen = true; }
        g.stroke();
      };
      g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
      // translucent curtain between the ground track and the flight path
      g.fillStyle = 'rgba(255,90,160,.07)';
      for (let i = 0; i < n - 1; i += 2) {
        const a = air[i], b = air[Math.min(n - 1, i + 2)], c = gnd[Math.min(n - 1, i + 2)], d = gnd[i];
        if (!(ok(a) && ok(b) && ok(c) && ok(d))) continue;
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(d.x, d.y); g.closePath(); g.fill();
      }
      // ground track (soft)
      g.setLineDash([1, 8]); g.lineDashOffset = -now / 60; g.strokeStyle = 'rgba(255,170,210,.4)'; g.lineWidth = 2; stroke(gnd, 0, n - 1);
      // flight path ahead (marching dots) and travelled part (glowing line)
      g.strokeStyle = 'rgba(255,190,225,.85)'; g.lineWidth = 2.8; stroke(air, 0, n - 1);
      g.setLineDash([]);
      const f = this.progress * (n - 1), k = Math.floor(f);
      if (this.progress > 0.002) {
        g.shadowColor = '#ff2d75'; g.shadowBlur = 16; g.strokeStyle = '#ff6fa6'; g.lineWidth = 3.4; stroke(air, 0, k);
        g.shadowBlur = 0; g.strokeStyle = 'rgba(255,228,240,.92)'; g.lineWidth = 1.2; stroke(air, 0, k);
      }
      g.restore();
    }

    drawGroundRing(lat, lng, r, fill, stroke) {
      const g = this.g, p0 = this.project(lat, lng, this.cam.zoom), cx = p0.x - this.cz.x, cy = p0.y - this.cz.y;
      g.beginPath();
      for (let i = 0; i <= 18; i++) { const a = i / 18 * TAU, q = this.pg(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0); i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y); }
      g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1.6; g.stroke(); }
    }

    spriteList(now) {
      const g = this.g, items = [];
      // pins and stop markers
      this.stops.forEach((s, i) => {
        const pt = this.pathAt(s.t), base = this.P(pt.lat, pt.lng, 0);
        if (base.z < 60) return;
        if (s.pin) {
          items.push({ z: base.z, f: () => {
            const top = this.P(pt.lat, pt.lng, 36), pulse = 0.5 + 0.5 * Math.sin(now / 420), kk = clamp(top.k, 0.65, 1.3);
            this.drawGroundRing(pt.lat, pt.lng, 15 + 4 * pulse, 'rgba(255,79,139,' + (0.2 + 0.12 * pulse) + ')', 'rgba(255,140,190,.7)');
            g.save(); g.strokeStyle = 'rgba(255,160,205,.9)'; g.lineWidth = 2; g.beginPath(); g.moveTo(base.x, base.y); g.lineTo(top.x, top.y); g.stroke();
            const r = 10 * kk; g.shadowColor = '#ff2d75'; g.shadowBlur = 16; g.fillStyle = '#ff5f9c';
            g.beginPath(); g.arc(top.x, top.y - r * 0.6, r, Math.PI * 0.8, Math.PI * 2.2); g.lineTo(top.x, top.y + r * 0.9); g.closePath(); g.fill();
            g.shadowBlur = 0; g.fillStyle = '#fff'; g.beginPath(); g.arc(top.x, top.y - r * 0.6, r * 0.38, 0, TAU); g.fill();
            g.shadowColor = 'rgba(0,0,0,.95)'; g.shadowBlur = 7; g.textAlign = 'left'; g.fillStyle = '#ffeaea';
            g.font = '600 ' + Math.round(19 * kk) + 'px "Cormorant Garamond", Georgia, serif'; g.fillText(s.pin.name, top.x + r + 8, top.y - r * 0.6 + 2);
            g.fillStyle = 'rgba(255,220,232,.88)'; g.font = '400 ' + Math.round(12 * kk) + 'px Jost, Arial, sans-serif'; g.fillText(s.pin.country || '', top.x + r + 8, top.y - r * 0.6 + 17 * kk);
            g.restore();
          } });
        } else {
          items.push({ z: base.z, f: () => {
            const top = this.P(pt.lat, pt.lng, 20), on = i <= this.visited, pulse = 0.5 + 0.5 * Math.sin(now / 500 + i), kk = clamp(top.k, 0.65, 1.3);
            g.save();
            this.drawGroundRing(pt.lat, pt.lng, on ? 10 + 3 * pulse : 7, on ? 'rgba(255,45,117,.25)' : 'rgba(20,10,40,.4)', on ? 'rgba(255,140,190,.8)' : 'rgba(255,190,220,.55)');
            g.strokeStyle = on ? 'rgba(255,150,200,.9)' : 'rgba(255,190,220,.5)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(base.x, base.y); g.lineTo(top.x, top.y); g.stroke();
            if (on) { g.shadowColor = '#ff2d75'; g.shadowBlur = 14; g.fillStyle = '#ff5f9c'; this.heartPath(g, top.x, top.y - 4, 8 * kk); g.fill(); }
            else { g.fillStyle = 'rgba(20,10,40,.8)'; g.strokeStyle = 'rgba(255,190,220,.8)'; g.beginPath(); g.arc(top.x, top.y - 3, 5 * kk, 0, TAU); g.fill(); g.stroke(); }
            g.restore();
          } });
        }
      });
      // clouds (only when we are flying low enough for them to make sense)
      const cloudZoom = clamp((this.cam.zoom - 5.2) / 0.8, 0, 1);
      if (cloudZoom > 0) this.clouds.forEach(c => {
        const p = this.P(c.lat, c.lng, c.alt + Math.sin(now / 3000 + c.ph) * 3);
        if (p.z < 80 || Math.abs(p.x - this.w / 2) > this.w * 1.2 || Math.abs(p.y) > this.h * 1.6) return;
        const fade = cloudZoom * clamp((2.6 - p.k) / 0.9, 0, 1) * clamp((p.z - 80) / 160, 0, 1);
        if (fade <= 0.02) return;
        items.push({ z: p.z, f: () => {
          const r = c.r * p.k, gr = g.createRadialGradient(p.x, p.y, r * 0.1, p.x, p.y, r);
          gr.addColorStop(0, 'rgba(255,225,240,' + c.a * fade + ')'); gr.addColorStop(1, 'rgba(255,200,230,0)');
          g.fillStyle = gr; g.beginPath(); g.ellipse(p.x, p.y, r, r * 0.55, 0, 0, TAU); g.fill();
        } });
      });
      return items;
    }

    drawPlane(now, pos, alt) {
      const g = this.g, hd = this.planeHeading, ch = Math.cos(hd), sh = Math.sin(hd);
      const cb = Math.cos(this.bank), sb = Math.sin(this.bank), cpi = Math.cos(this.pitchAng), spi = Math.sin(this.pitchAng);
      const L = (() => { const v = [-0.35, -0.5, 0.78], m = Math.hypot(v[0], v[1], v[2]); return [v[0] / m, v[1] / m, v[2] / m]; })();
      // ground shadow
      const sp = this.pg(pos.x, pos.y, 0), centre = this.pg(pos.x, pos.y, alt);
      g.save();
      g.beginPath();
      for (let i = 0; i <= 16; i++) { const a = i / 16 * TAU, q = this.pg(pos.x + Math.cos(a) * 24 * PS, pos.y + Math.sin(a) * 24 * PS, 0); i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y); }
      g.closePath(); g.fillStyle = 'rgba(8,0,24,.4)'; g.shadowColor = 'rgba(8,0,24,.6)'; g.shadowBlur = 14; g.fill();
      g.restore();
      // glow
      const halo = g.createRadialGradient(centre.x, centre.y, 4, centre.x, centre.y, 54);
      halo.addColorStop(0, 'rgba(255,120,175,.5)'); halo.addColorStop(1, 'rgba(255,120,175,0)');
      g.fillStyle = halo; g.beginPath(); g.arc(centre.x, centre.y, 54, 0, TAU); g.fill();
      // faces
      const faces = this.mesh.map(f => {
        const v = f.p.map(([ax, ay, az]) => {
          const x0 = ax * PS, y0 = ay * PS, z0 = az * PS;
          let x = x0 * cb + z0 * sb, z = -x0 * sb + z0 * cb;                 // bank (about the nose axis)
          const y = y0 * cpi - z * spi; z = y0 * spi + z * cpi;              // pitch
          return [pos.x + x * ch + y * sh, pos.y + x * sh - y * ch, alt + z];
        });
        const e1 = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]], e2 = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]];
        let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
        const m = Math.hypot(nx, ny, nz) || 1; nx /= m; ny /= m; nz /= m;
        const lit = Math.abs(nx * L[0] + ny * L[1] + nz * L[2]);
        const sc = v.map(q => this.pg(q[0], q[1], q[2]));
        return { sc, lit, c: f.c, z: sc.reduce((a, q) => a + q.z, 0) / sc.length };
      });
      faces.sort((a, b) => b.z - a.z);
      g.save(); g.lineJoin = 'round'; g.lineWidth = 0.7; g.strokeStyle = 'rgba(120,40,90,.4)';
      g.shadowColor = 'rgba(255,45,117,.55)'; g.shadowBlur = 10;
      faces.forEach(fc => {
        const k = 0.5 + 0.55 * fc.lit;
        g.fillStyle = 'rgb(' + Math.min(255, fc.c[0] * k | 0) + ',' + Math.min(255, fc.c[1] * k | 0) + ',' + Math.min(255, fc.c[2] * k | 0) + ')';
        g.beginPath(); fc.sc.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.closePath(); g.fill(); g.stroke();
      });
      g.restore();
      this.planeXY = { x: centre.x, y: centre.y };
    }

    drawSparks(now) {
      const g = this.g;
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let i = this.sparks.length - 1; i >= 0; i--) {
        const s = this.sparks[i], age = (now - s.born) / 1400;
        if (age >= 1) { this.sparks.splice(i, 1); continue; }
        const p = this.P(s.lat, s.lng, s.alt + age * 8);
        if (p.z < 60) continue;
        g.fillStyle = 'rgba(255,' + (150 + 60 * age | 0) + ',' + (190 + 40 * age | 0) + ',' + (1 - age) * 0.9 + ')';
        g.beginPath(); g.arc(p.x + s.dx * age * 12, p.y + s.dy * age * 12, s.r * p.k * (1 - age * 0.6), 0, TAU); g.fill();
      }
      g.restore();
    }
    emit(lat, lng, alt, now) {
      if (this.sparks.length > 120) return;
      for (let i = 0; i < 2; i++) this.sparks.push({ lat, lng, alt, born: now, dx: (Math.random() - 0.5) * 2, dy: (Math.random() - 0.5) * 2, r: 1 + Math.random() * 2.2 });
    }

    frame(now) {
      const dt = clamp((now - (this.lastNow || now)) / 1000, 0.001, 0.1); this.lastNow = now;
      for (let i = this.anims.length - 1; i >= 0; i--) {
        const a = this.anims[i], k = clamp((now - a.start) / a.ms, 0, 1);
        a.fn(a.ease(k), k, now);
        if (k >= 1) { this.anims.splice(i, 1); a.done(); }
      }
      // plane attitude follows the route
      const tgt = this.routeHeading(this.progress), dh = angDiff(this.planeHeading, tgt);
      this.planeHeading += dh * (1 - Math.exp(-dt * 5));
      this.bank += (clamp(dh * 4, -0.55, 0.55) - this.bank) * (1 - Math.exp(-dt * 4));
      const t2 = clamp(this.progress + 0.01, 0, 1), a1 = this.alt(this.progress), a2 = this.alt(t2);
      const pA = this.pathAt(this.progress), pB = this.pathAt(t2);
      const pa = this.project(pA.lat, pA.lng, this.cam.zoom), pb = this.project(pB.lat, pB.lng, this.cam.zoom);
      const run = Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1;
      const slope = this.flying || this.progress < 0.999 ? Math.atan2(a2 - a1, run) : 0;
      this.pitchAng += (clamp(slope * 0.9, -0.45, 0.45) - this.pitchAng) * (1 - Math.exp(-dt * 4));

      this.curAlt = a1 + 3;
      this.upd();
      this.updateTiles(now);
      const pe = this.povBlend;
      if (pe !== this._lastE) {
        this._lastE = pe;
        this.cock.style.opacity = clamp((pe - 0.35) / 0.65, 0, 1);
        this.haze.style.opacity = clamp(pe * 1.4, 0, 1);
        this.fogEl.style.opacity = 1 - clamp(pe * 1.3, 0, 1);
      }
      if (pe > 0.001) {
        const hy = this.h * this.focusY - this.D / Math.tan(this.ep);
        this.haze.style.setProperty('--hy', hy.toFixed(1) + 'px');
        this.haze.style.transformOrigin = '50% ' + hy.toFixed(1) + 'px';
        this.haze.style.transform = 'rotate(' + (-this.roll).toFixed(4) + 'rad) scale(1.7)';
      }

      const g = this.g; g.clearRect(0, 0, this.w, this.h);
      if (this.showRoute) this.drawRoute(now);
      this.drawSparks(now);
      const items = this.spriteList(now);
      const pp = this.pathAt(this.progress), pr = this.project(pp.lat, pp.lng, this.cam.zoom);
      const gpos = { x: pr.x - this.cz.x, y: pr.y - this.cz.y };
      const bob = this.flying ? 0 : Math.sin(now / 700) * 2.2, alt = a1 + 3 + bob;
      const pz = this.pg(gpos.x, gpos.y, alt);
      this.planeXY = { x: pz.x, y: pz.y };
      const planeFade = 1 - clamp(this.povBlend * 1.6, 0, 1);
      if (this.showPlane && planeFade > 0.02) items.push({ z: pz.z, f: () => { g.save(); g.globalAlpha = planeFade; this.drawPlane(now, gpos, alt); g.restore(); } });
      items.sort((a, b) => b.z - a.z).forEach(it => it.f());
      // distant things dissolve into the horizon haze at the top of the screen
      g.save(); g.globalCompositeOperation = 'destination-out';
      const mk = g.createLinearGradient(0, 0, 0, this.h * 0.24);
      mk.addColorStop(0, 'rgba(0,0,0,1)'); mk.addColorStop(0.55, 'rgba(0,0,0,.85)'); mk.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = mk; g.fillRect(0, 0, this.w, this.h * 0.24); g.restore();
    }

    start() {
      if (this.running) return;
      this.running = true; this.lastNow = 0;
      if (!this.warned) { this.warned = true; setTimeout(() => { if (!this.tilesSeen && window.console) console.warn('[gift] No map tiles loaded. Check js/config.js > tiles, and open the page from a web address (not by double-clicking the file).'); }, 12000); }
      const loop = now => { if (!this.running) return; this.frame(now); this.raf = requestAnimationFrame(loop); };
      this.raf = requestAnimationFrame(loop);
    }
    stop() { this.running = false; cancelAnimationFrame(this.raf); }

    /* ---------- animation helpers (same API as the flat map) ---------- */
    anim(ms, fn, ease) {
      return new Promise(done => this.anims.push({ start: performance.now(), ms: Math.max(1, ms), fn, ease: ease || easeInOut, done }));
    }
    flyTo(target, ms, arc) {
      const c = this.cam;
      const a = { x: mercX(c.lng), y: mercY(c.lat), z: c.zoom, f: this.focusY, h: c.heading, p: c.pitch };
      const b = { x: mercX(target.lng), y: mercY(target.lat), z: target.zoom, f: target.focusY == null ? this.focusY : target.focusY,
        h: target.heading == null ? this.routeHeading(0) : target.heading, p: target.pitch == null ? this.pitchFlight : target.pitch };
      const dH = angDiff(a.h, b.h);
      return this.anim(ms, e => {
        c.lng = unX(lerp(a.x, b.x, e)); c.lat = unY(lerp(a.y, b.y, e));
        c.zoom = lerp(a.z, b.z, e) - (arc || 0) * Math.sin(Math.PI * e);
        this.focusY = lerp(a.f, b.f, e); c.heading = a.h + dH * e; c.pitch = lerp(a.p, b.p, e);
      });
    }
    setFocus(f, ms) { const a = this.focusY; return this.anim(ms, e => { this.focusY = lerp(a, f, e); }); }
    fly(t0, t1, ms, zoomAt) {
      this.flying = true;
      const c = this.cam;
      return this.anim(ms, (e, k, now) => {
        const t = lerp(t0, t1, e); this.progress = t;
        const p = this.pathAt(t); c.lat = p.lat; c.lng = p.lng; c.zoom = zoomAt(k);
        c.heading += angDiff(c.heading, this.routeHeading(t)) * 0.045;
        c.pitch += (this.pitchFlight - c.pitch) * 0.05;
        this.emit(p.lat, p.lng, this.alt(t) + 3, now);
      }, easeSine).then(() => { this.flying = false; });
    }
  }

  window.Map3D = Map3D;
})();
