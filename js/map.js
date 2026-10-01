/* A small, dependency-free map: real Web-Mercator tiles (OpenStreetMap data,
   CARTO dark style) drawn on a canvas, with a great-circle flight route,
   a plane, pins, and a sparkle trail. Everything moves at 60fps because it is
   one canvas and we control the camera ourselves. */
(function () {
  'use strict';
  const TILE = 256, MAX_CACHE = 700, D2R = Math.PI / 180, TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeInOut = k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const easeSine = k => -(Math.cos(Math.PI * k) - 1) / 2;

  const mercX = lng => (lng + 180) / 360;
  const mercY = lat => {
    const s = Math.sin(clamp(lat, -85.05, 85.05) * D2R);
    return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  };
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

  function heartShape(g, x, y, s) {
    g.beginPath();
    g.moveTo(x, y + s * 0.95);
    g.bezierCurveTo(x - s * 1.7, y - s * 0.15, x - s * 0.95, y - s * 1.35, x, y - s * 0.5);
    g.bezierCurveTo(x + s * 0.95, y - s * 1.35, x + s * 1.7, y - s * 0.15, x, y + s * 0.95);
    g.closePath();
  }

  const PLANE = typeof Path2D !== 'undefined'
    ? new Path2D('M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z')
    : null;

  class MiniMap {
    constructor(canvas, from, to) {
      this.canvas = canvas; this.g = canvas.getContext('2d');
      this.from = from; this.to = to;
      const gc = greatCircle(from, to, 260);
      this.route = gc.pts; this.km = gc.km;
      this.cam = { lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2, zoom: 4.2 };
      this.focusY = 0.5;
      this.tiles = new Map();
      this.stops = []; this.visited = -1;
      this.progress = 0; this.heading = 0;
      this.sparks = []; this.anims = [];
      this.running = false; this.showRoute = true; this.showPlane = true;
      this.retina = (window.devicePixelRatio || 1) > 1.4;
      this.tilesSeen = 0;
      this.resize();
      addEventListener('resize', () => this.resize());
    }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
      this.canvas.width = Math.round(this.w * this.dpr); this.canvas.height = Math.round(this.h * this.dpr);
      this.g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    /* ----- geometry ----- */
    project(lat, lng, z) {
      const n = TILE * Math.pow(2, z);
      return { x: mercX(lng) * n, y: mercY(lat) * n };
    }
    toScreen(lat, lng) {
      const c = this.project(this.cam.lat, this.cam.lng, this.cam.zoom);
      const p = this.project(lat, lng, this.cam.zoom);
      return { x: this.w / 2 + (p.x - c.x), y: this.h * this.focusY + (p.y - c.y) };
    }
    pathAt(t) {
      const f = clamp(t, 0, 1) * (this.route.length - 1), i = Math.min(this.route.length - 2, Math.floor(f)), k = f - i;
      const a = this.route[i], b = this.route[i + 1];
      return { lat: lerp(a.lat, b.lat, k), lng: lerp(a.lng, b.lng, k) };
    }
    /* zoom that fits the whole route inside the given padding */
    fit(padTop, padBottom, padSide) {
      let minX = 1, maxX = 0, minY = 1, maxY = 0;
      this.route.forEach(p => { const x = mercX(p.lng), y = mercY(p.lat); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); });
      const availW = this.w - padSide * 2, availH = this.h - padTop - padBottom;
      const zx = Math.log2(availW / (TILE * (maxX - minX || 0.001)));
      const zy = Math.log2(availH / (TILE * (maxY - minY || 0.001)));
      const zoom = Math.min(zx, zy);
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      // choose focusY so the route's centre sits in the middle of the free band
      const focusY = (padTop + availH / 2) / this.h;
      return { lat: unY(cy), lng: unX(cx), zoom, focusY };
    }

    /* ----- tiles ----- */
    url(z, x, y) {
      return 'https://' + 'abcd'[(x + y) % 4] + '.basemaps.cartocdn.com/dark_all/' + z + '/' + x + '/' + y + (this.retina ? '@2x' : '') + '.png';
    }
    tile(z, x, y) {
      const key = z + '/' + x + '/' + y;
      let t = this.tiles.get(key);
      if (!t) {
        t = { img: new Image(), ok: false, fail: false, at: 0 };
        t.img.onload = () => { t.ok = true; t.at = performance.now(); this.tilesSeen++; };
        t.img.onerror = () => { t.fail = true; };
        t.img.src = this.url(z, x, y);
        this.tiles.set(key, t);
        if (this.tiles.size > MAX_CACHE) this.tiles.delete(this.tiles.keys().next().value);
      }
      return t;
    }
    /* Warm the cache along the flight so the map never flashes empty. */
    prefetch() {
      const want = new Set();
      const add = (z, lat, lng, r) => {
        const n = Math.pow(2, z), tx = Math.floor(mercX(lng) * n), ty = Math.floor(mercY(lat) * n);
        for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
          const x = ((tx + dx) % n + n) % n, y = ty + dy;
          if (y >= 0 && y < n) want.add(z + '/' + x + '/' + y);
        }
      };
      this.route.forEach((p, i) => {
        add(3, p.lat, p.lng, 0); add(4, p.lat, p.lng, 1);
        if (i % 3 === 0) add(5, p.lat, p.lng, 1);
        if (i % 6 === 0) add(6, p.lat, p.lng, 1);
      });
      [this.route[0], this.route[this.route.length - 1]].forEach(p => { add(7, p.lat, p.lng, 1); add(8, p.lat, p.lng, 1); });
      const end = this.route[this.route.length - 1];
      add(9, end.lat, end.lng, 1); add(10, end.lat, end.lng, 1); add(11, end.lat, end.lng, 1);
      want.forEach(k => { const [z, x, y] = k.split('/').map(Number); this.tile(z, x, y); });
    }

    drawTile(z, x, y, dx, dy, size, now) {
      const g = this.g, t = this.tile(z, x, y);
      const a = t.ok ? Math.min(1, (now - t.at) / 320) : 0;
      if (a < 1) {
        for (let k = 1; k <= 5 && z - k >= 0; k++) {
          const px = x >> k, py = y >> k, p = this.tiles.get((z - k) + '/' + px + '/' + py);
          if (p && p.ok) {
            const f = 1 << k, sw = p.img.naturalWidth / f, sh = p.img.naturalHeight / f;
            g.drawImage(p.img, (x - (px << k)) * sw, (y - (py << k)) * sh, sw, sh, dx, dy, size + 0.7, size + 0.7);
            break;
          }
        }
      }
      if (a > 0) { g.globalAlpha = a; g.drawImage(t.img, dx, dy, size + 0.7, size + 0.7); g.globalAlpha = 1; }
    }

    drawTiles(now) {
      const cam = this.cam, tz = clamp(Math.round(cam.zoom), 2, 17);
      const s = Math.pow(2, cam.zoom - tz), c = this.project(cam.lat, cam.lng, tz);
      const cx = this.w / 2, cy = this.h * this.focusY, n = Math.pow(2, tz);
      const x0 = Math.floor((c.x - cx / s) / TILE), x1 = Math.floor((c.x + (this.w - cx) / s) / TILE);
      const y0 = Math.floor((c.y - cy / s) / TILE), y1 = Math.floor((c.y + (this.h - cy) / s) / TILE);
      for (let y = y0; y <= y1; y++) {
        if (y < 0 || y >= n) continue;
        for (let x = x0; x <= x1; x++) {
          this.drawTile(tz, ((x % n) + n) % n, y, cx + (x * TILE - c.x) * s, cy + (y * TILE - c.y) * s, TILE * s, now);
        }
      }
    }

    /* ----- scene painting ----- */
    drawBackdrop() {
      const g = this.g, w = this.w, h = this.h;
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#0a0c26'); bg.addColorStop(1, '#170a2e');
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      // faint graticule so the page still feels like a map while tiles load
      g.strokeStyle = 'rgba(160,120,255,.07)'; g.lineWidth = 1;
      for (let lat = -80; lat <= 80; lat += 5) { const a = this.toScreen(lat, -180), b = this.toScreen(lat, 180); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
      for (let lng = -180; lng <= 180; lng += 5) { const a = this.toScreen(80, lng), b = this.toScreen(-80, lng); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
    }

    tint() {
      const g = this.g, w = this.w, h = this.h;
      g.save();
      g.globalCompositeOperation = 'color'; g.globalAlpha = 0.85; g.fillStyle = '#8b3fd6'; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'screen'; g.globalAlpha = 1; g.fillStyle = 'rgba(70,28,118,.55)'; g.fillRect(0, 0, w, h);
      g.restore();
    }

    drawRoute(now) {
      const g = this.g, pts = this.route.map(p => this.toScreen(p.lat, p.lng));
      g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
      // full route: soft marching dots
      g.setLineDash([1, 9]); g.lineDashOffset = -now / 55;
      g.strokeStyle = 'rgba(255,170,210,.75)'; g.lineWidth = 2.6;
      g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke();
      g.setLineDash([]);
      // travelled part: glowing line
      const f = this.progress * (pts.length - 1), n = Math.floor(f), k = f - n;
      if (this.progress > 0.002) {
        g.beginPath();
        for (let i = 0; i <= n; i++) i ? g.lineTo(pts[i].x, pts[i].y) : g.moveTo(pts[i].x, pts[i].y);
        if (n < pts.length - 1) g.lineTo(lerp(pts[n].x, pts[n + 1].x, k), lerp(pts[n].y, pts[n + 1].y, k));
        g.shadowColor = '#ff2d75'; g.shadowBlur = 16; g.strokeStyle = '#ff6fa6'; g.lineWidth = 3.2; g.stroke();
        g.shadowBlur = 0; g.strokeStyle = 'rgba(255,225,238,.9)'; g.lineWidth = 1.2; g.stroke();
      }
      g.restore();
    }

    drawPin(x, y, label, sub, now, big) {
      const g = this.g, pulse = 0.5 + 0.5 * Math.sin(now / 420);
      g.save();
      g.fillStyle = 'rgba(255,79,139,' + (0.18 + 0.12 * pulse) + ')';
      g.beginPath(); g.ellipse(x, y, 16 + 5 * pulse, 6 + 2 * pulse, 0, 0, TAU); g.fill();
      const r = big ? 9 : 8;
      g.shadowColor = '#ff2d75'; g.shadowBlur = 14;
      g.fillStyle = '#ff5f9c';
      g.beginPath(); g.arc(x, y - r - 6, r, Math.PI * 0.8, Math.PI * 2.2); g.lineTo(x, y); g.closePath(); g.fill();
      g.shadowBlur = 0; g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y - r - 6, r * 0.38, 0, TAU); g.fill();
      if (label) {
        g.textBaseline = 'alphabetic'; g.shadowColor = 'rgba(0,0,0,.9)'; g.shadowBlur = 6;
        g.fillStyle = '#ffeaea'; g.font = '600 ' + (big ? 19 : 17) + 'px "Cormorant Garamond", Georgia, serif';
        g.textAlign = 'left'; g.fillText(label, x + r + 8, y - r - 5);
        g.fillStyle = 'rgba(255,220,232,.85)'; g.font = '400 12px Jost, Arial, sans-serif'; g.fillText(sub || '', x + r + 8, y - r + 10);
      }
      g.restore();
    }

    drawStops(now) {
      const g = this.g;
      this.stops.forEach((s, i) => {
        if (s.pin) return;
        const p = this.pos(s.t), pulse = 0.5 + 0.5 * Math.sin(now / 500 + i);
        const on = i <= this.visited;
        g.save();
        if (on) {
          g.fillStyle = 'rgba(255,45,117,' + (0.22 + 0.18 * pulse) + ')';
          g.beginPath(); g.arc(p.x, p.y, 15 + 4 * pulse, 0, TAU); g.fill();
          g.shadowColor = '#ff2d75'; g.shadowBlur = 12; g.fillStyle = '#ff5f9c'; heartShape(g, p.x, p.y, 7.5); g.fill();
        } else {
          g.strokeStyle = 'rgba(255,190,220,.75)'; g.lineWidth = 1.6; g.fillStyle = 'rgba(20,10,40,.7)';
          g.beginPath(); g.arc(p.x, p.y, 5, 0, TAU); g.fill(); g.stroke();
        }
        g.restore();
      });
    }
    pos(t) { const p = this.pathAt(t); return this.toScreen(p.lat, p.lng); }

    drawSparks(now) {
      const g = this.g;
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let i = this.sparks.length - 1; i >= 0; i--) {
        const s = this.sparks[i], age = (now - s.born) / 1400;
        if (age >= 1) { this.sparks.splice(i, 1); continue; }
        const p = this.toScreen(s.lat, s.lng);
        const a = (1 - age) * 0.9;
        g.fillStyle = 'rgba(255,' + (150 + 60 * age) + ',' + (190 + 40 * age) + ',' + a + ')';
        g.beginPath(); g.arc(p.x + s.dx * age * 14, p.y + s.dy * age * 14, s.r * (1 - age * 0.6), 0, TAU); g.fill();
      }
      g.restore();
    }
    emit(lat, lng, now) {
      if (this.sparks.length > 120) return;
      for (let i = 0; i < 2; i++) this.sparks.push({ lat, lng, born: now, dx: (Math.random() - 0.5) * 2, dy: (Math.random() - 0.5) * 2, r: 1 + Math.random() * 2.2 });
    }

    drawPlane(now) {
      const g = this.g;
      const p = this.pathAt(this.progress), q = this.pathAt(Math.min(1, this.progress + 0.006)), q0 = this.pathAt(Math.max(0, this.progress - 0.006));
      const a = this.toScreen(p.lat, p.lng), b = this.toScreen(q.lat, q.lng), c = this.toScreen(q0.lat, q0.lng);
      let ang = Math.atan2(b.x - c.x, -(b.y - c.y));
      if (this.progress >= 0.995) ang = this.heading;
      this.heading = ang;
      const bob = this.flying ? 0 : Math.sin(now / 700) * 2.2;
      g.save(); g.translate(a.x, a.y + bob);
      const halo = g.createRadialGradient(0, 0, 2, 0, 0, 34);
      halo.addColorStop(0, 'rgba(255,120,175,.55)'); halo.addColorStop(1, 'rgba(255,120,175,0)');
      g.fillStyle = halo; g.beginPath(); g.arc(0, 0, 34, 0, TAU); g.fill();
      g.rotate(ang); g.scale(1.55, 1.55); g.translate(-12, -12);
      g.shadowColor = '#ff2d75'; g.shadowBlur = 14; g.fillStyle = '#fff4f8';
      if (PLANE) g.fill(PLANE);
      g.restore();
    }

    vignette() {
      const g = this.g, w = this.w, h = this.h;
      const v = g.createRadialGradient(w / 2, h * 0.5, Math.min(w, h) * 0.35, w / 2, h * 0.5, Math.max(w, h) * 0.78);
      v.addColorStop(0, 'rgba(6,4,24,0)'); v.addColorStop(1, 'rgba(6,4,24,.72)');
      g.fillStyle = v; g.fillRect(0, 0, w, h);
      const t = g.createLinearGradient(0, 0, 0, 170);
      t.addColorStop(0, 'rgba(6,4,24,.55)'); t.addColorStop(1, 'rgba(6,4,24,0)');
      g.fillStyle = t; g.fillRect(0, 0, w, 170);
    }

    frame(now) {
      // animations first
      for (let i = this.anims.length - 1; i >= 0; i--) {
        const a = this.anims[i], k = clamp((now - a.start) / a.ms, 0, 1);
        a.fn(a.ease(k), k, now);
        if (k >= 1) { this.anims.splice(i, 1); a.done(); }
      }
      this.drawBackdrop();
      this.drawTiles(now);
      this.tint();
      this.vignette();
      if (this.showRoute) { this.drawRoute(now); this.drawStops(now); }
      this.drawSparks(now);
      this.stops.forEach(s => {
        if (!s.pin) return;
        const p = this.pos(s.t); this.drawPin(p.x, p.y, s.pin.name, s.pin.country, now, true);
      });
      if (this.showPlane) this.drawPlane(now);
    }

    start() {
      if (this.running) return;
      this.running = true;
      const loop = now => { if (!this.running) return; this.frame(now); this.raf = requestAnimationFrame(loop); };
      this.raf = requestAnimationFrame(loop);
    }
    stop() { this.running = false; cancelAnimationFrame(this.raf); }

    /* ----- animation helpers (all return promises) ----- */
    anim(ms, fn, ease) {
      return new Promise(done => this.anims.push({ start: performance.now(), ms: Math.max(1, ms), fn, ease: ease || easeInOut, done }));
    }
    flyTo(target, ms, arc) {
      const a = { x: mercX(this.cam.lng), y: mercY(this.cam.lat), z: this.cam.zoom, f: this.focusY };
      const b = { x: mercX(target.lng), y: mercY(target.lat), z: target.zoom, f: target.focusY == null ? this.focusY : target.focusY };
      return this.anim(ms, e => {
        this.cam.lng = unX(lerp(a.x, b.x, e)); this.cam.lat = unY(lerp(a.y, b.y, e));
        this.cam.zoom = lerp(a.z, b.z, e) - (arc || 0) * Math.sin(Math.PI * e);
        this.focusY = lerp(a.f, b.f, e);
      });
    }
    setFocus(f, ms) {
      const a = this.focusY;
      return this.anim(ms, e => { this.focusY = lerp(a, f, e); });
    }
    fly(t0, t1, ms, zoomAt) {
      this.flying = true;
      return this.anim(ms, (e, k, now) => {
        const t = lerp(t0, t1, e); this.progress = t;
        const p = this.pathAt(t); this.cam.lat = p.lat; this.cam.lng = p.lng; this.cam.zoom = zoomAt(k);
        this.emit(p.lat, p.lng, now);
      }, easeSine).then(() => { this.flying = false; });
    }
  }

  window.MiniMap = MiniMap;
})();
