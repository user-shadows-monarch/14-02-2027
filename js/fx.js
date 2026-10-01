/* Particle effects drawn on one canvas behind the page content. */
(function () {
  'use strict';
  const canvas = document.getElementById('fx');
  const g = canvas.getContext('2d');
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const easeOut = k => 1 - Math.pow(1 - k, 3);

  let W = 0, H = 0, DPR = 1, flags = {}, modeStart = 0, raf = 0, last = 0;
  let stars = [], heartP = [], petals = [], confetti = [], rockets = [], sparks = [], floaters = [];
  let nextRocket = 0, heartScale = 1;

  function resize() {
    const r = canvas.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    initStars();
    if (flags.heart) initHeart();
  }

  function heartXY(t) {
    return { x: 16 * Math.pow(Math.sin(t), 3), y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) };
  }
  function heartPath(x, y, s) {
    g.beginPath();
    g.moveTo(x, y + s * 0.95);
    g.bezierCurveTo(x - s * 1.7, y - s * 0.15, x - s * 0.95, y - s * 1.35, x, y - s * 0.5);
    g.bezierCurveTo(x + s * 0.95, y - s * 1.35, x + s * 1.7, y - s * 0.15, x, y + s * 0.95);
    g.closePath();
  }

  function initStars() {
    stars = [];
    const n = RM ? 40 : 110;
    for (let i = 0; i < n; i++) stars.push({ x: Math.random() * W, y: Math.random() * H * 0.85, r: rnd(0.4, 1.4), p: rnd(0, TAU), s: rnd(0.6, 2) });
  }

  function initHeart() {
    heartP = [];
    const N = RM ? 380 : 950;
    const cx = W / 2, cy = H * 0.535;
    heartScale = Math.min(W * 0.34 / 16, H * 0.15 / 12);
    for (let i = 0; i < N; i++) {
      const outline = i < N * 0.6;
      const t = Math.random() * TAU;
      const r = outline ? 1 + (Math.random() - 0.5) * 0.07 : Math.sqrt(Math.random()) * 0.94;
      const p = heartXY(t);
      const ang = Math.random() * TAU, dist = rnd(0.3, 1) * Math.max(W, H) * 0.7;
      heartP.push({
        tx: p.x * r, ty: p.y * r + 2.4,
        sx: cx + Math.cos(ang) * dist, sy: cy + Math.sin(ang) * dist,
        delay: Math.random() * 0.9,
        size: outline ? rnd(0.9, 2.2) : rnd(0.5, 1.4),
        ph: rnd(0, TAU), outline,
        h: Math.random() < 0.12 ? rnd(15, 32) : rnd(328, 350),
        l: rnd(58, 78)
      });
    }
  }

  function initPetals() {
    petals = [];
    const n = RM ? 12 : 34;
    for (let i = 0; i < n; i++) petals.push(newPetal(true));
  }
  function newPetal(anywhere) {
    return { x: rnd(-20, W + 20), y: anywhere ? rnd(-H * 0.1, H) : rnd(-60, -10), vy: rnd(18, 42), sw: rnd(0.5, 1.4), sp: rnd(0, TAU),
      amp: rnd(14, 38), rot: rnd(0, TAU), vr: rnd(-1.4, 1.4), s: rnd(6, 13), h: rnd(345, 358), l: rnd(28, 46) };
  }

  function initFloaters() {
    floaters = [];
    const n = RM ? 6 : 16;
    for (let i = 0; i < n; i++) floaters.push(newFloater(true));
  }
  function newFloater(anywhere) {
    return { x: rnd(0, W), y: anywhere ? rnd(0, H) : H + 20, vy: rnd(14, 36), s: rnd(5, 13), ph: rnd(0, TAU), a: rnd(0.14, 0.5), amp: rnd(6, 18) };
  }

  const COLORS = ['#ff4f8b', '#ffc98a', '#ffffff', '#c56bff', '#ff2d75', '#ffe08a'];
  function burstConfetti(x, y, n) {
    n = RM ? Math.round(n / 3) : n;
    for (let i = 0; i < n; i++) {
      const a = rnd(-Math.PI * 0.95, -Math.PI * 0.05), sp = rnd(160, 520);
      confetti.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: rnd(0, TAU), vr: rnd(-8, 8), w: rnd(5, 10), h: rnd(3, 6), c: COLORS[(Math.random() * COLORS.length) | 0], life: rnd(3, 5.5), age: 0 });
    }
  }
  function launchRocket(x) {
    rockets.push({ x: x == null ? rnd(W * 0.15, W * 0.85) : x, y: H + 10, vy: -rnd(H * 0.55, H * 0.85), ty: rnd(H * 0.12, H * 0.42), h: rnd(320, 360) });
  }
  function explode(x, y, h) {
    const n = RM ? 24 : 64, hue = Math.random() < 0.3 ? rnd(30, 50) : h;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rnd(-0.05, 0.05), sp = rnd(60, 190) * (Math.random() < 0.3 ? 0.55 : 1);
      sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, life: rnd(0.9, 1.7), h: hue + rnd(-12, 12) });
    }
  }

  function draw(now) {
    raf = requestAnimationFrame(draw);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    const e = (now - modeStart) / 1000;
    g.clearRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';

    if (flags.stars) {
      g.fillStyle = '#fff';
      stars.forEach(s => {
        g.globalAlpha = 0.25 + 0.6 * (0.5 + 0.5 * Math.sin(e * s.s + s.ph));
        g.beginPath(); g.arc(s.x, s.y, s.r, 0, TAU); g.fill();
      });
      g.globalAlpha = 1;
    }

    if (flags.heart) {
      const cx = W / 2, cy = H * 0.535;
      const beat = 1 + 0.045 * Math.pow(Math.max(0, Math.sin(e * 2.5)), 6);
      const glow = g.createRadialGradient(cx, cy, 0, cx, cy, heartScale * 20);
      glow.addColorStop(0, 'rgba(255,45,117,0.28)'); glow.addColorStop(1, 'rgba(255,45,117,0)');
      g.fillStyle = glow; g.globalAlpha = easeOut(clamp(e / 2.6));
      g.fillRect(0, 0, W, H); g.globalAlpha = 1;
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < heartP.length; i++) {
        const p = heartP[i];
        const k = easeOut(clamp((e - p.delay) / 2.4));
        const x = cx + (p.tx * heartScale * beat) * k + (p.sx - cx) * (1 - k) + Math.sin(e * 1.3 + p.ph) * 0.7;
        const y = cy + (p.ty * heartScale * beat) * k + (p.sy - cy) * (1 - k) + Math.cos(e * 1.1 + p.ph) * 0.7;
        const a = (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(e * 2.2 + p.ph))) * (p.outline ? 1 : 0.55) * (0.25 + 0.75 * k);
        g.fillStyle = 'hsla(' + p.h + ',100%,' + p.l + '%,' + a + ')';
        g.beginPath(); g.arc(x, y, p.size, 0, TAU); g.fill();
        if (p.outline && p.size > 1.6) {
          g.fillStyle = 'hsla(' + p.h + ',100%,60%,' + a * 0.14 + ')';
          g.beginPath(); g.arc(x, y, p.size * 3.6, 0, TAU); g.fill();
        }
      }
      g.globalCompositeOperation = 'source-over';
    }

    if (flags.petals) {
      petals.forEach((p, i) => {
        p.y += p.vy * dt; p.sp += p.sw * dt; p.rot += p.vr * dt;
        const x = p.x + Math.sin(p.sp) * p.amp;
        if (p.y > H + 20) petals[i] = newPetal(false);
        g.save(); g.translate(x, p.y); g.rotate(p.rot); g.scale(1, 0.55 + 0.45 * Math.abs(Math.sin(p.sp * 1.3)));
        g.fillStyle = 'hsla(' + p.h + ',78%,' + p.l + '%,0.9)';
        g.beginPath(); g.ellipse(0, 0, p.s, p.s * 0.62, 0, 0, TAU); g.fill();
        g.fillStyle = 'rgba(255,190,200,0.16)';
        g.beginPath(); g.ellipse(-p.s * 0.2, -p.s * 0.15, p.s * 0.5, p.s * 0.25, 0, 0, TAU); g.fill();
        g.restore();
      });
    }

    if (flags.hearts) {
      floaters.forEach((f, i) => {
        f.y -= f.vy * dt; f.ph += dt * 1.2;
        if (f.y < -30) floaters[i] = newFloater(false);
        g.fillStyle = 'rgba(255,90,150,' + f.a + ')';
        heartPath(f.x + Math.sin(f.ph) * f.amp, f.y, f.s); g.fill();
      });
    }

    if (flags.fireworks) {
      nextRocket -= dt;
      if (nextRocket <= 0) { launchRocket(); nextRocket = rnd(0.7, 1.6); }
    }
    g.globalCompositeOperation = 'lighter';
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i]; r.y += r.vy * dt; r.vy *= 0.985;
      g.fillStyle = 'hsla(' + r.h + ',100%,75%,0.9)'; g.beginPath(); g.arc(r.x, r.y, 2, 0, TAU); g.fill();
      g.fillStyle = 'hsla(' + r.h + ',100%,60%,0.25)'; g.fillRect(r.x - 1, r.y, 2, 22);
      if (r.y <= r.ty || r.vy > -30) { explode(r.x, r.y, r.h); rockets.splice(i, 1); }
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.age += dt;
      if (s.age > s.life) { sparks.splice(i, 1); continue; }
      s.vy += 90 * dt; s.vx *= 0.985; s.vy *= 0.985; s.x += s.vx * dt; s.y += s.vy * dt;
      const a = 1 - s.age / s.life;
      g.fillStyle = 'hsla(' + s.h + ',100%,' + (55 + 25 * a) + '%,' + a + ')';
      g.beginPath(); g.arc(s.x, s.y, 1.2 + a * 1.4, 0, TAU); g.fill();
    }
    g.globalCompositeOperation = 'source-over';

    for (let i = confetti.length - 1; i >= 0; i--) {
      const c = confetti[i]; c.age += dt;
      if (c.age > c.life || c.y > H + 20) { confetti.splice(i, 1); continue; }
      c.vy += 420 * dt; c.vx *= 0.99; c.vy *= 0.985; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt;
      g.save(); g.translate(c.x, c.y); g.rotate(c.rot); g.scale(1, Math.cos(c.rot * 2));
      g.globalAlpha = Math.min(1, (c.life - c.age) * 1.5);
      g.fillStyle = c.c; g.fillRect(-c.w / 2, -c.h / 2, c.w, c.h); g.restore();
    }
    g.globalAlpha = 1;

    if (!flags.any && !rockets.length && !sparks.length && !confetti.length) {
      cancelAnimationFrame(raf); raf = 0; g.clearRect(0, 0, W, H);
    }
  }

  const MODES = {
    none: {},
    heart: { stars: 1, heart: 1 },
    petals: { petals: 1 },
    stars: { stars: 1 },
    hearts: { stars: 1, hearts: 1 },
    party: { hearts: 1, fireworks: 1, stars: 1 }
  };

  const FX = {
    set(name) {
      flags = Object.assign({}, MODES[name] || {});
      flags.any = Object.keys(flags).length > 0;
      modeStart = performance.now();
      if (flags.heart) initHeart();
      if (flags.petals) initPetals();
      if (flags.hearts) initFloaters();
      nextRocket = 1.2;
      if (flags.any && !raf) { last = performance.now(); raf = requestAnimationFrame(draw); }
    },
    confetti(x, y, n) { burstConfetti(x == null ? W / 2 : x, y == null ? H * 0.6 : y, n || 120); if (!raf) { last = performance.now(); raf = requestAnimationFrame(draw); } },
    fireworks(n) {
      for (let i = 0; i < (n || 5); i++) setTimeout(() => launchRocket(), i * 260);
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(draw); }
    },
    size() { return { W, H }; }
  };

  addEventListener('resize', resize);
  resize();
  window.FX = FX;
})();
