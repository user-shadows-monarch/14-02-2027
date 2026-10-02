/* Extras layered on top of the journey:
   1) a pilot avatar (your face) that flies beside the plane and, on landing, brings up a bouquet of red roses
   2) an endless, window-less chat that drifts up the side of the screen from take-off to landing
   Nothing here changes the rest of the page: app.js just calls Extras.pilot / Extras.chat at a few moments. */
(function () {
  'use strict';
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let map = null, C = null, app = null;

  /* ---------------- pilot ---------------- */
  const P = { arr: false, el: null, img: null, ring: null, ox: 46, oy: -10, tx: 46, ty: -10, raf: 0, on: false, x: 0, y: 0 };

  function place() {
    const p = map && map.planeXY;
    if (!p) return;
    if (P.arr) P.ty = Math.max(-168, 228 - p.y); // keep the avatar clear of the header on short screens
    P.ox += (P.tx - P.ox) * 0.08; P.oy += (P.ty - P.oy) * 0.08;
    P.x = p.x + P.ox; P.y = p.y + P.oy;
    P.el.style.transform = 'translate3d(' + P.x.toFixed(1) + 'px,' + P.y.toFixed(1) + 'px,0)';
  }
  function loop() { place(); P.raf = P.on ? requestAnimationFrame(loop) : 0; }
  function run() { if (!P.raf) { P.on = true; P.raf = requestAnimationFrame(loop); } P.on = true; }

  const pilot = {
    fly() {
      if (!P.el) return;
      P.el.classList.remove('big', 'hold'); P.arr = false;
      P.tx = 46; P.ty = -10;
      if (!P.el.classList.contains('show')) { P.ox = P.tx; P.oy = P.ty; place(); }
      P.el.classList.add('show'); run();
    },
    hide() {
      if (!P.el) return;
      P.el.classList.remove('show', 'big', 'hold'); P.arr = false;
      clearTimeout(P.hideT);
      P.hideT = setTimeout(() => { if (!P.el.classList.contains('show')) P.on = false; }, 1000);
    },
    arrive() {
      if (!P.el) return;
      P.tx = 0; P.ty = -168; P.arr = true;
      P.el.classList.add('show', 'big'); run();
      const cfg = C.pilot || {};
      if (cfg.bouquet === false) return;
      setTimeout(() => { P.el.classList.add('hold'); heartsBurst(); }, 900);
    }
  };

  function heartsBurst() {
    const n = RM ? 4 : 14;
    for (let i = 0; i < n; i++) {
      const h = document.createElement('span');
      h.className = 'hb'; h.textContent = '\u2665';
      const a = (Math.random() - 0.5) * 2.4, d = 70 + Math.random() * 90;
      h.style.cssText = 'left:' + (P.x + (Math.random() - 0.5) * 30) + 'px;top:' + (P.y + 20) + 'px;--dx:' + Math.sin(a) * d + 'px;--dy:' + (-Math.cos(a) * d - 30) + 'px;--s:' + (0.7 + Math.random() * 0.9) + ';animation-delay:' + (i * 55) + 'ms';
      app.appendChild(h);
      setTimeout(() => h.remove(), 2600 + i * 55);
    }
  }

  /* ---------------- floating chat ---------------- */
  const F = { box: null, list: [], idx: 0, timer: 0, on: false };
  const tpl = s => String(s == null ? '' : s).replace(/\{name\}/g, C.herName).replace(/\{from\}/g, C.from);

  function buildList() {
    const out = [];
    (C.memories || []).forEach(m => (m.chat || []).forEach(c => out.push({ me: !!c.me, text: c.text, date: m.date || '' })));
    ((C.floatChat && C.floatChat.extra) || []).forEach(c => out.push({ me: !!c.me, text: c.text, date: c.date || '' }));
    return out;
  }
  function spawn() {
    if (!F.on || document.hidden || !F.list.length) return;
    const m = F.list[F.idx++ % F.list.length];
    const d = document.createElement('div');
    d.className = 'fm ' + (m.me ? 'me' : 'her');
    d.textContent = tpl(m.text);
    if (m.date) { const s = document.createElement('small'); s.textContent = m.date; d.appendChild(s); }
    const cfg = C.floatChat || {};
    d.style.setProperty('--dist', (F.box.clientHeight + 90) + 'px');
    d.style.setProperty('--dur', (cfg.duration || 17) + 's');
    F.box.appendChild(d);
    d.addEventListener('animationend', () => d.remove());
  }
  const chat = {
    start() {
      const cfg = C.floatChat || {};
      if (RM || cfg.enabled === false || F.on || !F.box) return;
      F.list = buildList(); if (!F.list.length) return;
      F.on = true; app.classList.add('fc-on');
      spawn();
      F.timer = setInterval(spawn, (cfg.every || 2.6) * 1000);
    },
    stop() {
      if (!F.on) return;
      F.on = false; clearInterval(F.timer);
      app.classList.remove('fc-on');
      setTimeout(() => { if (!F.on && F.box) F.box.innerHTML = ''; }, 2600);
    }
  };

  window.Extras = {
    pilot, chat,
    init(opts) {
      map = opts.map; C = opts.C; app = opts.app;
      P.el = document.getElementById('pilot'); P.img = document.getElementById('pilot-img'); P.ring = P.el && P.el.querySelector('.pilot-ring');
      F.box = document.getElementById('fchat');
      const cfg = C.pilot || {};
      if (P.img) {
        if (cfg.face) {
          P.img.onerror = () => P.ring.classList.add('noface');
          P.img.style.objectPosition = cfg.facePosition || '50% 30%';
          P.img.src = cfg.face;
        } else P.ring.classList.add('noface');
      }
    }
  };
})();
