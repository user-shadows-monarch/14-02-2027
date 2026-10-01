/* Background music: a Valentine piano piece that crossfades into a birthday
   music box. Uses your mp3 files when they exist, otherwise synthesizes both
   with the Web Audio API (no downloads, nothing to license). */
(function () {
  'use strict';

  const LEVEL = { valentine: 0.9, birthday: 0.95 };
  const FILE_LEVEL = { valentine: 0.55, birthday: 0.6 };

  let ctx = null, sendBus = null, current = null, muted = false, ducked = false, hidden = false;
  const tracks = {};
  const fileOK = {};
  let files = {};

  /* ---------- helpers ---------- */
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const level = () => (muted ? 0 : ducked ? 0.28 : 1);

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3;
    comp.connect(ctx.destination);
    // soft hall reverb from generated noise
    const len = Math.floor(ctx.sampleRate * 3.2);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    const conv = ctx.createConvolver(); conv.buffer = buf;
    sendBus = ctx.createGain(); sendBus.gain.value = 0.5;
    sendBus.connect(conv); conv.connect(comp);
    ctx.__out = comp;
    return ctx;
  }

  /* ---------- voices ---------- */
  function pluck(dest, t, midi, dur, vel, kind) {
    const f = mtof(midi), box = kind === 'box';
    const g = ctx.createGain(), lp = ctx.createBiquadFilter(), g2 = ctx.createGain();
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    o1.type = box ? 'sine' : 'triangle';
    o2.type = 'sine';
    o1.frequency.value = f;
    o2.frequency.value = box ? f * 4 : f * 2;
    g2.gain.value = box ? 0.22 : 0.32;
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(box ? 6000 : f * 5 + 900, t);
    lp.frequency.exponentialRampToValueAtTime(box ? 2500 : f * 1.6 + 260, t + 1.2);
    const d = box ? Math.min(1.3, dur + 0.6) : Math.max(0.9, dur * 1.7);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.007);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(lp); lp.connect(dest);
    o1.start(t); o2.start(t); o1.stop(t + d + 0.1); o2.stop(t + d + 0.1);
  }

  function pad(dest, t, notes, dur, vel) {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 1.0);
    g.gain.linearRampToValueAtTime(vel * 0.8, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.9);
    lp.connect(g); g.connect(dest);
    notes.forEach(n => {
      [-6, 6].forEach(det => {
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.value = mtof(n); o.detune.value = det;
        o.connect(lp); o.start(t); o.stop(t + dur + 1);
      });
    });
  }

  /* ---------- songs (times are in beats) ---------- */
  function buildValentine() {
    // Am F C G | F G Em Am : two gentle 4-bar phrases in 4/4
    const chords = [
      [[57, 60, 64], 45], [[53, 57, 60], 41], [[55, 60, 64], 48], [[55, 59, 62], 43],
      [[53, 57, 60], 41], [[55, 59, 62], 43], [[55, 59, 64], 40], [[57, 60, 64], 45]
    ];
    const mel = [
      [[76, 1.5], [74, .5], [72, 1], [76, 1]], [[81, 2], [79, 1], [77, 1]],
      [[79, 1.5], [76, .5], [74, 1], [72, 1]], [[74, 2], [71, 1], [74, 1]],
      [[84, 2], [81, 1], [77, 1]], [[83, 1.5], [86, .5], [83, 1], [79, 1]],
      [[79, 2], [76, 1], [79, 1]], [[81, 3], [0, 1]]
    ];
    const ev = [], pat = [0, 1, 2, 3, 2, 1, 2, 3];
    chords.forEach(([notes, bass], b) => {
      const s = b * 4;
      ev.push({ t: s, d: 4, notes, k: 'pad', v: 0.075 });
      ev.push({ t: s, d: 3.6, m: bass, k: 'pluck', v: 0.3 });
      ev.push({ t: s + 2, d: 1.8, m: bass + 7, k: 'pluck', v: 0.14 });
      const arp = [notes[0], notes[1], notes[2], notes[1] + 12];
      pat.forEach((p, i) => ev.push({ t: s + i * 0.5, d: 0.7, m: arp[p], k: 'pluck', v: 0.13 }));
      let x = s;
      mel[b].forEach(([m, d]) => { if (m) ev.push({ t: x, d: d * 1.4, m, k: 'pluck', v: 0.34 }); x += d; });
    });
    ev.sort((a, b) => a.t - b.t);
    return { bpm: 66, loop: 32, tr: [0], ev };
  }

  function buildBirthday() {
    // Traditional "Happy Birthday" tune (public domain), waltz feel, music box
    const C = { C: [[60, 64, 67], 48], G: [[59, 62, 67], 43], F: [[60, 65, 69], 41], Am: [[60, 64, 69], 45] };
    const chordPlan = [
      [0, 'C', 3], [3, 'G', 3], [6, 'C', 3], [9, 'G', 1], [10, 'C', 2],
      [12, 'C', 3], [15, 'Am', 3], [18, 'F', 3], [21, 'G', 1], [22, 'C', 2]
    ];
    const lines = [
      [[67, .75], [67, .25], [69, 1], [67, 1], [72, 1], [71, 2]],
      [[67, .75], [67, .25], [69, 1], [67, 1], [74, 1], [72, 2]],
      [[67, .75], [67, .25], [79, 1], [76, 1], [72, 1], [71, 1], [69, 1]],
      [[77, .75], [77, .25], [76, 1], [72, 1], [74, 1], [72, 2]]
    ];
    const ev = [];
    let x = 0;
    lines.forEach(l => l.forEach(([m, d]) => { ev.push({ t: x, d: d * 1.6, m, k: 'box', v: 0.34 }); x += d; }));
    chordPlan.forEach(([s, name, len]) => {
      const [notes, bass] = C[name];
      ev.push({ t: s, d: 1.5, m: bass, k: 'pluck', v: 0.26 });
      for (let b = 1; b < len; b++) notes.forEach(n => ev.push({ t: s + b, d: 0.5, m: n, k: 'box', v: 0.07 }));
      if (len === 3) ev.push({ t: s, d: 3, notes, k: 'pad', v: 0.045 });
    });
    const pent = [84, 86, 88, 91, 93, 96];
    let seed = 7;
    for (let b = 0; b < 24; b++) {
      seed = (seed * 9301 + 49297) % 233280;
      if (seed / 233280 < 0.5) ev.push({ t: b + 0.5, d: 0.6, m: pent[seed % pent.length], k: 'box', v: 0.05 });
    }
    ev.sort((a, b) => a.t - b.t);
    return { bpm: 100, loop: 24, tr: [0, 0, 2, 2, 4, 4, 0], ev };
  }

  const SONGS = {};

  function startSynth(name, bus) {
    const def = SONGS[name] || (SONGS[name] = name === 'valentine' ? buildValentine() : buildBirthday());
    const beat = 60 / def.bpm;
    let loop = 0, idx = 0, base = ctx.currentTime + 0.12;
    const timer = setInterval(() => {
      if (!ctx || ctx.state !== 'running') return;
      const horizon = ctx.currentTime + 0.6;
      for (let guard = 0; guard < 400; guard++) {
        const e = def.ev[idx];
        const t = base + e.t * beat;
        if (t > horizon) break;
        if (t > ctx.currentTime - 0.05) {
          const tr = def.tr[loop % def.tr.length];
          if (e.notes) pad(bus, t, e.notes.map(n => n + tr), e.d * beat, e.v);
          else pluck(bus, t, e.m + tr, e.d * beat, e.v, e.k);
        }
        idx++;
        if (idx >= def.ev.length) { idx = 0; loop++; base += def.loop * beat; }
      }
    }, 110);
    return () => clearInterval(timer);
  }

  /* ---------- tracks ---------- */
  function applyVol(tr) {
    if (!tr) return;
    if (tr.kind === 'synth') {
      tr.gain.gain.setTargetAtTime(tr.fade * LEVEL[tr.name] * level(), ctx.currentTime, 0.08);
    } else {
      tr.el.volume = Math.max(0, Math.min(1, tr.fade * FILE_LEVEL[tr.name] * level()));
    }
  }
  function applyAll() { Object.values(tracks).forEach(applyVol); }

  function fade(tr, to, ms, done) {
    clearInterval(tr.fadeTimer);
    const from = tr.fade, t0 = performance.now();
    tr.fadeTimer = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      tr.fade = from + (to - from) * k;
      applyVol(tr);
      if (k >= 1) { clearInterval(tr.fadeTimer); done && done(); }
    }, 40);
  }

  function makeTrack(name) {
    if (tracks[name]) return tracks[name];
    let tr;
    if (fileOK[name] && files[name]) {
      const el = new Audio(files[name]);
      el.loop = true; el.preload = 'auto'; el.volume = 0;
      tr = { name, kind: 'file', el, fade: 0 };
    } else {
      if (!ensureCtx()) return null;
      const gain = ctx.createGain(); gain.gain.value = 0;
      gain.connect(ctx.__out); gain.connect(sendBus);
      const bus = ctx.createGain(); bus.gain.value = 1; bus.connect(gain);
      tr = { name, kind: 'synth', gain, bus, fade: 0, stop: null };
    }
    tracks[name] = tr;
    return tr;
  }

  function play(tr) {
    if (tr.playing) return;
    tr.playing = true;
    if (tr.kind === 'file') { const p = tr.el.play(); p && p.catch(() => {}); }
    else tr.stop = startSynth(tr.name, tr.bus);
  }
  function halt(tr) {
    if (!tr || !tr.playing) return;
    tr.playing = false;
    if (tr.kind === 'file') tr.el.pause();
    else if (tr.stop) { tr.stop(); tr.stop = null; }
  }

  const Music = {
    init(cfg) {
      files = cfg || {};
      ['valentine', 'birthday'].forEach(n => {
        fileOK[n] = false;
        if (!files[n]) return;
        fetch(files[n], { method: 'HEAD' }).then(r => { fileOK[n] = r.ok; }).catch(() => {});
      });
    },
    /* Must be called from a tap so the browser allows sound. */
    unlock() {
      if (ensureCtx() && ctx.state === 'suspended') ctx.resume();
    },
    start(name) {
      this.unlock();
      const tr = makeTrack(name);
      if (!tr) return;
      // warm up the other track's <audio> inside this tap (iOS requires it)
      const other = name === 'valentine' ? 'birthday' : 'valentine';
      const ot = makeTrack(other);
      if (ot && ot.kind === 'file') { ot.el.volume = 0; const p = ot.el.play(); p && p.then(() => { if (!ot.playing) ot.el.pause(); }).catch(() => {}); }
      this.crossfadeTo(name);
    },
    crossfadeTo(name) {
      if (current === name) return;
      const next = makeTrack(name);
      if (!next) return;
      const prev = current && tracks[current];
      current = name;
      play(next);
      fade(next, 1, 2800);
      if (prev) fade(prev, 0, 3200, () => halt(prev));
    },
    duck(on) { ducked = !!on; applyAll(); },
    toggleMute() { muted = !muted; applyAll(); return muted; },
    isMuted() { return muted; },
    setHidden(h) {
      hidden = h;
      if (ctx) { h ? ctx.suspend() : (!muted || true) && ctx.resume(); }
      Object.values(tracks).forEach(t => { if (t.kind === 'file' && t.playing) { h ? t.el.pause() : t.el.play().catch(() => {}); } });
    },
    usingFiles() { return { ...fileOK }; }
  };

  document.addEventListener('visibilitychange', () => Music.setHidden(document.hidden));
  window.Music = Music;
})();
