(function () {
  'use strict';
  const C = window.GIFT;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DEV = /[?&]dev\b/.test(location.search);
  const app = $('#app');

  /* ---------- map instance (also gives us the real distance) ---------- */
  const R = C.route;
  const map = new window.MiniMap($('#map'), R.from, R.to, C.tiles);
  const km = Math.round(map.km / 10) * 10;

  /* ---------- text helpers ---------- */
  const tpl = s => String(s == null ? '' : s)
    .replace(/\{name\}/g, C.herName).replace(/\{from\}/g, C.from)
    .replace(/\{km\}/g, km.toLocaleString('en-US'));
  const lines = (arr, sep) => arr.map(tpl).join(sep || '<br>');
  const missing = [];
  const note = src => { if (src && missing.indexOf(src) < 0) { missing.push(src); if (DEV) console.warn('[gift] file not found:', src); } };

  const existsCache = {};
  function exists(src) {
    if (!src) return Promise.resolve(false);
    if (!existsCache[src]) {
      existsCache[src] = fetch(src, { method: 'HEAD' }).then(r => { if (!r.ok) note(src); return r.ok; }).catch(() => { note(src); return false; });
    }
    return existsCache[src];
  }

  /* ---------- scene manager ---------- */
  const SCENES = {
    's-open':     { bg: 'open',    fx: 'heart' },
    's-letter':   { bg: 'letter',  fx: 'petals' },
    's-map':      { map: true, hud: true, fx: 'none' },
    's-flight':   { map: true, hud: true, fx: 'none' },
    's-memory':   { map: true, hud: true, fx: 'none' },
    's-cross':    { map: true, hud: true, fx: 'none' },
    's-arrive':   { map: true, hud: true, fx: 'petals' },
    's-birthday': { bg: 'reveal',  fx: 'party' },
    's-final':    { bg: 'final',   fx: 'hearts' },
    's-promise':  { bg: 'promise', fx: 'hearts' }
  };
  let currentScene = null;
  function go(id) {
    const cfg = SCENES[id];
    currentScene = id;
    $$('.scene').forEach(s => s.classList.toggle('active', s.id === id));
    app.dataset.scene = id;
    app.scrollTop = 0; app.scrollLeft = 0;
    app.dataset.bg = cfg.bg || '';
    app.classList.toggle('map-on', !!cfg.map);
    $('#map').classList.toggle('on', !!cfg.map);
    $('#hud').classList.toggle('on', !!cfg.hud);
    if (cfg.map) map.start(); else setTimeout(() => { if (!SCENES[currentScene].map) map.stop(); }, 1600);
    FX.set(cfg.fx);
  }

  /* ---------- stops ---------- */
  const stops = C.memories.map((m, i) => Object.assign({ type: 'memory', i }, m));
  stops.push(Object.assign({ type: 'crossing' }, C.crossing));
  stops.push({ type: 'arrival', t: 1 });
  map.stops = stops.map((s, i) => ({ t: s.t, pin: i === 0 ? R.from : s.type === 'arrival' ? R.to : null, hidden: s.type === 'crossing' }));
  map.stops = map.stops.filter(s => !s.hidden);
  const stopIndexOf = s => map.stops.findIndex(x => x.t === s.t);

  /* ---------- static text ---------- */
  function fillStatic() {
    $('#o-title').innerHTML = lines(C.opening.title);
    $('#o-text').innerHTML = lines(C.opening.text);
    $('#o-btn').textContent = C.opening.button;
    $('#l-hint').textContent = tpl(C.letter.hint);
    $('#l-sub').textContent = tpl(C.letter.sub);
    $('#hud-a').textContent = R.from.name; $('#hud-b').textContent = R.to.name;
    $('#hud-sub').textContent = tpl(R.subtitle);
    $('#go-label').textContent = tpl(R.button);
    $('#x-title').textContent = tpl(C.crossing.title);
    $('#x-sub').textContent = tpl(C.crossing.sub);
    $('#x-script').textContent = tpl(C.crossing.script);
    $('#a-text').innerHTML = lines(C.arrival.text);
    $('#a-label').textContent = tpl(C.arrival.button);
    $('#b-script').textContent = tpl(C.birthday.script);
    $('#b-sub').textContent = tpl(C.birthday.sub);
    $('#b-lines').innerHTML = lines(C.birthday.lines);
    $('#b-hint').textContent = tpl(C.birthday.hint);
    $('#b-next').textContent = tpl(C.birthday.button);
    $('#f-next').textContent = tpl(C.finale.button);
    $('#p-label').textContent = tpl(C.promise.button);
    $('#p-after').textContent = tpl(C.promise.after);
    $('#p-replay').textContent = tpl(C.promise.replay);
    document.title = R.from.name + ' ✈ ' + R.to.name + ' · a journey for you';
  }

  /* ---------- audio bar (voice notes) ---------- */
  const fmt = s => (isFinite(s) ? Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') : '0:00');
  class AudioBar {
    constructor(host) {
      this.host = host;
      host.innerHTML =
        '<button class="ab-play" type="button" aria-label="Play voice message">' +
        '<svg class="play" viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>' +
        '<svg class="pause" viewBox="0 0 24 24"><path fill="currentColor" d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg></button>' +
        '<div class="ab-wave" role="slider" aria-label="Seek" tabindex="0"></div><span class="ab-time">0:00</span>';
      this.btn = $('.ab-play', host); this.wave = $('.ab-wave', host); this.time = $('.ab-time', host);
      const N = 34; this.bars = [];
      for (let i = 0; i < N; i++) {
        const b = document.createElement('i');
        b.style.height = (22 + 78 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6) + 0.2 * Math.sin(i * 4.1))) * 0.9 + '%';
        b.style.setProperty('--k', i);
        this.wave.appendChild(b); this.bars.push(b);
      }
      this.btn.addEventListener('click', () => this.toggle());
      this.wave.addEventListener('click', e => {
        if (!this.a || !isFinite(this.a.duration)) return;
        const r = this.wave.getBoundingClientRect();
        this.a.currentTime = this.a.duration * Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      });
    }
    async load(src) {
      this.stop(); this.host.hidden = true; this.host.classList.remove('playing');
      if (!src || !(await exists(src))) return;
      const a = this.a = new Audio(); a.preload = 'metadata'; a.src = src;
      a.addEventListener('loadedmetadata', () => { if (this.a === a) { this.host.hidden = false; this.time.textContent = fmt(a.duration); } });
      a.addEventListener('timeupdate', () => {
        const p = a.duration ? a.currentTime / a.duration : 0;
        this.bars.forEach((b, i) => b.classList.toggle('on', i / this.bars.length < p));
        this.time.textContent = fmt(a.currentTime) + ' / ' + fmt(a.duration);
      });
      a.addEventListener('play', () => { window.Music.duck(true); this.host.classList.add('playing'); this.btn.setAttribute('aria-label', 'Pause'); });
      const off = () => { window.Music.duck(false); this.host.classList.remove('playing'); this.btn.setAttribute('aria-label', 'Play voice message'); };
      a.addEventListener('pause', off); a.addEventListener('ended', () => { off(); a.currentTime = 0; });
      a.addEventListener('error', () => { if (this.a === a) this.host.hidden = true; });
      if (a.readyState >= 1) this.host.hidden = false;
    }
    toggle() { if (this.a) (this.a.paused ? this.a.play().catch(() => {}) : this.a.pause()); }
    stop() { if (this.a) { const a = this.a; this.a = null; a.pause(); a.removeAttribute('src'); a.load(); window.Music.duck(false); } }
  }
  const memAudio = new AudioBar($('#m-audio'));
  const finAudio = new AudioBar($('#f-audio'));

  /* ---------- memory sheet ---------- */
  const FALLBACKS = [
    'linear-gradient(180deg,#1d1050 0%,#7b2f8f 45%,#ff8a5c 100%)',
    'linear-gradient(180deg,#0c1a4a 0%,#3b3d9b 50%,#e56aa0 100%)',
    'linear-gradient(180deg,#2b0f45 0%,#a02f7a 55%,#ffb070 100%)',
    'linear-gradient(180deg,#081a3d 0%,#2a5a9b 50%,#ff9d8a 100%)',
    'linear-gradient(180deg,#25104a 0%,#c23a72 55%,#ffcf8a 100%)',
    'linear-gradient(180deg,#10163f 0%,#5b3aa8 50%,#ff7fa8 100%)'
  ];
  let activeTab = 'photo';
  function setTab(name) {
    activeTab = name;
    $$('.tab').forEach(t => { const on = t.dataset.tab === name; t.classList.toggle('on', on); t.setAttribute('aria-selected', on); });
    $$('.pane').forEach(p => p.classList.remove('on'));
    $('#pane-' + name).classList.add('on');
    const v = $('#m-video');
    if (name !== 'video') v.pause();
    if (name === 'chat') {
      const pc = $('#pane-chat'); pc.classList.remove('on'); void pc.offsetWidth; pc.classList.add('on'); pc.scrollTop = 0;
      $$('.bub', pc).forEach((b, i) => setTimeout(() => { if (activeTab === 'chat') pc.scrollTo({ top: pc.scrollHeight, behavior: 'smooth' }); }, i * 600 + 500));
    }
  }
  $$('.tab').forEach(t => t.addEventListener('click', () => setTab(t.dataset.tab)));
  $('#m-heart').addEventListener('click', e => { const b = e.currentTarget; b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'); if (b.getAttribute('aria-pressed') === 'true') FX.confetti(b.getBoundingClientRect().left, b.getBoundingClientRect().top, 18); });
  const vid = $('#m-video');
  vid.addEventListener('play', () => window.Music.duck(true));
  vid.addEventListener('pause', () => window.Music.duck(false));
  vid.addEventListener('ended', () => window.Music.duck(false));

  async function fillSheet(m) {
    $('#m-title').textContent = tpl(m.title); $('#m-date').textContent = m.date || '';
    $('#m-date').setAttribute('datetime', (m.date || '').split('.').reverse().join('-'));
    $('#m-quote').textContent = tpl(m.quote);
    $('#m-heart').setAttribute('aria-pressed', 'false');
    $('#fb-date').textContent = m.date || '';
    // photo
    const pane = $('#pane-photo'), img = $('#m-img');
    pane.classList.remove('fallback'); pane.style.setProperty('--fbg', FALLBACKS[m.i % FALLBACKS.length]);
    img.alt = tpl(m.title);
    img.onerror = () => { note(m.photo); pane.classList.add('fallback'); };
    if (m.photo) img.src = m.photo; else { img.removeAttribute('src'); pane.classList.add('fallback'); }
    // chat
    const chat = $('#pane-chat'); chat.innerHTML = '';
    (m.chat || []).forEach((c, i) => {
      const b = document.createElement('div'); b.className = 'bub ' + (c.me ? 'me' : 'her'); b.style.setProperty('--i', i);
      b.textContent = tpl(c.text);
      if (c.time) { const s = document.createElement('small'); s.textContent = c.time; b.appendChild(s); }
      chat.appendChild(b);
    });
    let hasChat = !!(m.chat && m.chat.length);
    if (m.chatImage && await exists(m.chatImage)) {
      const im = document.createElement('img'); im.src = m.chatImage; im.alt = 'Chat screenshot'; chat.appendChild(im); hasChat = true;
    }
    // video
    let hasVideo = false;
    vid.pause(); vid.removeAttribute('src'); vid.load();
    if (m.video && await exists(m.video)) { vid.src = m.video; hasVideo = true; }
    $('.tab[data-tab="chat"]').hidden = !hasChat;
    $('.tab[data-tab="video"]').hidden = !hasVideo;
    $('#tabs').style.visibility = (hasChat || hasVideo) ? 'visible' : 'hidden';
    setTab('photo');
    memAudio.load(m.audio);
  }

  /* ---------- the journey ---------- */
  const nextBtn = $('#m-next');
  const clickOnce = el => new Promise(res => { const h = () => { el.removeEventListener('click', h); res(); }; el.addEventListener('click', h); });
  const setProg = t => { $('#prog-fill').style.width = Math.round(t * 100) + '%'; };
  const zoomStop = window.innerHeight < 640 ? 6.9 : 7.3;
  const legZoom = k => 5.9 + (zoomStop - 5.9) * Math.pow(Math.cos(Math.PI * k), 2);
  const landZoom = k => zoomStop + (11.4 - zoomStop) * Math.pow(k, 2.2) - 1.2 * Math.sin(Math.PI * k) * (1 - k);

  let overview;
  function layoutOverview() {
    overview = map.fit(150, 120, 34);
    return overview;
  }

  async function journey() {
    go('s-flight');
    if (window.Extras) Extras.chat.start();
    await map.flyTo({ lat: map.route[0].lat, lng: map.route[0].lng, zoom: zoomStop, focusY: 0.3 }, 3200, 1.2);
    for (let i = 0; i < stops.length; i++) {
      const s = stops[i];
      if (i > 0) {
        const prev = stops[i - 1];
        if (window.Extras) Extras.pilot.fly();
        const ms = s.type === 'crossing' ? 6200 : s.type === 'arrival' ? 6800 : 5200;
        if (s.type === 'arrival') {
          await map.fly(prev.t, s.t, ms, landZoom);
        } else {
          await map.fly(prev.t, s.t, ms, legZoom);
        }
      }
      const mi = stopIndexOf(s);
      if (mi >= 0) map.visited = Math.max(map.visited, mi);
      setProg(s.t);

      if (s.type === 'memory') {
        if (window.Extras) Extras.pilot.hide();
        await map.setFocus(0.27, 500);
        await fillSheet(s);
        go('s-memory');
                $('#m-next-label').textContent = 'Next memory';
        await clickOnce(nextBtn);
        memAudio.stop(); vid.pause();
        go('s-flight');
        await wait(650);
        map.setFocus(0.45, 1200);
      } else if (s.type === 'crossing') {
        map.setFocus(0.5, 800);
        go('s-cross');
        await wait(4600);
        go('s-flight');
        await wait(600);
      } else if (s.type === 'arrival') {
        map.showPlane = false; // landed
        if (window.Extras) { Extras.chat.stop(); Extras.pilot.arrive(); map.setFocus(0.55, 1400); }
        go('s-arrive');
        await clickOnce($('#a-btn'));
      }
    }
    window.Music.crossfadeTo('birthday');
    birthdayScene();
  }

  /* ---------- letter ---------- */
  let letterOpened = false;
  function buildLetter() {
    const L = C.letter, box = $('#letter-scroll'); box.innerHTML = '';
    const words = [];
    const addP = (txt, cls, tag) => {
      const el = document.createElement(tag || 'p'); if (cls) el.className = cls;
      tpl(txt).split(/\s+/).forEach((w, i, a) => { const sp = document.createElement('span'); sp.className = 'w'; sp.textContent = w + (i < a.length - 1 ? ' ' : ''); el.appendChild(sp); words.push(sp); });
      box.appendChild(el);
    };
    addP(L.greeting, 'greet', 'h2');
    L.paragraphs.forEach(p => addP(p));
    addP(L.signature, 'sign', 'p');
    $('#letter-next').textContent = tpl(L.button);
    return words;
  }
  async function openLetter() {
    if (letterOpened) return; letterOpened = true;
    const words = buildLetter();
    $('#envelope').classList.add('open');
    await wait(RM ? 100 : 1500);
    $('#env-wrap').classList.add('gone'); $('.hint').classList.add('gone');
    await wait(300);
    $('#letter-card').classList.add('show');
    await wait(700);
    const per = RM ? 0 : Math.max(38, Math.min(90, 6200 / words.length));
    words.forEach((w, i) => setTimeout(() => w.classList.add('in'), i * per));
    setTimeout(() => { $('#letter-next').hidden = false; }, Math.min(words.length * per + 400, 7000));
    // any tap on the paper reveals everything at once
    $('#letter-scroll').addEventListener('click', () => { words.forEach(w => w.classList.add('in')); $('#letter-next').hidden = false; }, { once: true });
  }

  /* ---------- birthday ---------- */
  let blown = false;
  function birthdayScene() {
    go('s-birthday');
    blown = false;
    $('#cake').classList.remove('out'); $('#b-next').hidden = true; $('#b-hint').textContent = tpl(C.birthday.hint);
    setTimeout(() => FX.confetti(undefined, undefined, 140), 500);
    setTimeout(() => FX.fireworks(4), 1100);
    setTimeout(() => { if (!blown && currentScene === 's-birthday') $('#b-next').hidden = false; }, 9000);
  }
  function blow() {
    if (blown) return; blown = true;
    $('#cake').classList.add('out');
    $('#b-hint').textContent = tpl(C.birthday.wish);
    const r = $('#cake').getBoundingClientRect(), a = app.getBoundingClientRect();
    FX.confetti(r.left - a.left + r.width / 2, r.top - a.top + r.height * 0.3, 200);
    FX.fireworks(6);
    setTimeout(() => { $('#b-next').hidden = false; }, 1800);
  }

  /* ---------- finale ---------- */
  function finalScene() {
    const box = $('#f-lines'); box.innerHTML = '';
    const arr = C.finale.lines.map(tpl);
    let d = 0.7;
    arr.forEach((t, i) => {
      const p = document.createElement('p'); p.textContent = t;
      const last = i === arr.length - 1, before = i === 4;
      if (before) p.className = 'gap big'; else if (i > 4 && !last) p.className = 'big'; if (last) p.className = 'love';
      p.style.setProperty('--d', d + 's'); box.appendChild(p);
      d += RM ? 0 : (i === 2 ? 2.1 : i === 3 ? 2.0 : 1.5);
    });
    $('#f-next').hidden = true;
    go('s-final');
    finAudio.load(C.finale.voice);
    setTimeout(() => { if (currentScene === 's-final') { $('#f-next').hidden = false; } }, (d + 1) * 1000);
  }

  /* ---------- promise ---------- */
  function promiseScene() {
    finAudio.stop();
    const p = $('#p-lines'); p.innerHTML = '';
    C.promise.lines.forEach((t, i) => { const s = document.createElement('span'); s.textContent = tpl(t); s.style.setProperty('--d', (0.8 + i * 1.3) + 's'); p.appendChild(s); });
    $('#p-btn').hidden = false; $('#p-after').hidden = true; $('#p-replay').hidden = true;
    go('s-promise');
  }
  $('#p-btn').addEventListener('click', () => {
    $('#p-btn').hidden = true; $('#p-after').hidden = false;
    FX.fireworks(9); FX.confetti(undefined, undefined, 160);
    FX.set('party');
    setTimeout(() => { $('#p-replay').hidden = false; }, 3500);
  });
  $('#p-replay').addEventListener('click', () => location.reload());

  /* ---------- wiring ---------- */
  function begin() {
    if (currentScene !== 's-open') return;
    window.Music.start('valentine');
    $('#sound').hidden = false;
    go('s-letter');
    map.prefetch();
  }
  $('#s-open').addEventListener('click', begin);
  $('#begin').addEventListener('click', e => { e.stopPropagation(); begin(); });
  $('#envelope').addEventListener('click', openLetter);
  $('#envelope').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLetter(); } });
  $('#letter-next').addEventListener('click', () => {
    layoutOverview();
    map.cam.lat = overview.lat; map.cam.lng = overview.lng; map.cam.zoom = overview.zoom - 0.6; map.focusY = overview.focusY;
    map.progress = 0; map.visited = -1; map.showPlane = true; setProg(0);
    go('s-map');
    map.flyTo(overview, 2600, 0);
  });
  $('#go').addEventListener('click', journey);
  $('#a-btn').addEventListener('click', () => { window.Music.crossfadeTo('birthday'); if (window.Extras) Extras.pilot.hide(); });
  $('#cake').addEventListener('click', blow);
  $('#b-next').addEventListener('click', finalScene);
  $('#f-next').addEventListener('click', promiseScene);
  $('#sound').addEventListener('click', e => {
    const m = window.Music.toggleMute();
    e.currentTarget.classList.toggle('muted', m);
    e.currentTarget.setAttribute('aria-label', m ? 'Unmute music' : 'Mute music');
  });

  // recompute overview if the window changes while looking at it
  addEventListener('resize', () => { if (currentScene === 's-map') { layoutOverview(); map.cam.zoom = overview.zoom; map.cam.lat = overview.lat; map.cam.lng = overview.lng; map.focusY = overview.focusY; } });

  window.Music.init(C.music);
  if (window.Extras) Extras.init({ map, C, app });
  fillStatic();
  go('s-open');
  window.__gift = { map, go, stops, journey, missing };
})();
