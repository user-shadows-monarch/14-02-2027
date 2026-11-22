/* The walkable 3D world that opens after the promise.
   Plain WebGL (no libraries): sky, fog, sun with planar shadows, a low-poly street (world-scene.js),
   a walking avatar (your face), joystick + drag + keyboard controls, collisions and glowing memory hearts. */
(function () {
  'use strict';
  const { M4, MeshBuilder, program, clamp } = window.GL3D;
  const TAU = Math.PI * 2;
  const $ = s => document.querySelector(s);
  const lerp = (a, b, k) => a + (b - a) * k;
  const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

  /* ---------- looks: day (like the reference photos), golden hour, night ---------- */
  const PRESETS = {
    day:    { top: [0.30, 0.54, 0.90], hor: [0.78, 0.87, 0.97], fog: [0.80, 0.87, 0.95], fogN: 50, fogF: 230, sun: [0.62, 0.55, 0.56], sunCol: [0.80, 0.72, 0.58], sky: [0.40, 0.47, 0.60], gnd: [0.27, 0.25, 0.20], night: 0, glow: 0, shadow: 0.36, clouds: 0.95 },
    sunset: { top: [0.16, 0.13, 0.38], hor: [1.00, 0.54, 0.38], fog: [0.88, 0.52, 0.47], fogN: 35, fogF: 180, sun: [0.80, 0.19, 0.55], sunCol: [1.00, 0.58, 0.32], sky: [0.36, 0.28, 0.44], gnd: [0.26, 0.17, 0.19], night: 0.1, glow: 0.55, shadow: 0.42, clouds: 0.75 },
    night:  { top: [0.015, 0.025, 0.09], hor: [0.10, 0.08, 0.26], fog: [0.05, 0.05, 0.14], fogN: 25, fogF: 140, sun: [-0.4, 0.62, 0.5], sunCol: [0.28, 0.36, 0.66], sky: [0.14, 0.17, 0.32], gnd: [0.07, 0.07, 0.13], night: 1, glow: 1, shadow: 0.3, clouds: 0.25 }
  };
  const norm3 = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

  /* ---------- shaders ---------- */
  const PREC = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';
  const LIT_VS = 'attribute vec3 a_pos; attribute vec3 a_nrm; attribute vec4 a_col; uniform mat4 u_vp; uniform mat4 u_model; varying vec3 v_n; varying vec4 v_c; varying vec3 v_w;' +
    'void main(){ vec4 w=u_model*vec4(a_pos,1.0); v_w=w.xyz; v_n=(u_model*vec4(a_nrm,0.0)).xyz; v_c=a_col; gl_Position=u_vp*w; }';
  const LIT_FS = PREC + 'varying vec3 v_n; varying vec4 v_c; varying vec3 v_w; uniform vec3 u_sun,u_sunCol,u_sky,u_gnd,u_fogCol,u_cam; uniform vec2 u_fog;' +
    'void main(){ vec3 n=normalize(v_n); vec3 amb=mix(u_gnd,u_sky,n.y*0.5+0.5); float d=max(dot(n,u_sun),0.0); vec3 lit=v_c.rgb*(amb+u_sunCol*d); lit=mix(lit,v_c.rgb*1.3,v_c.a);' +
    'float f=smoothstep(u_fog.x,u_fog.y,distance(v_w,u_cam)); gl_FragColor=vec4(mix(lit,u_fogCol,f),1.0); }';
  const SH_VS = 'attribute vec3 a_pos; uniform mat4 u_vp; uniform mat4 u_model; uniform vec3 u_sun; varying vec3 v_w;' +
    'void main(){ vec4 w=u_model*vec4(a_pos,1.0); float k=w.y/max(u_sun.y,0.24); vec3 p=vec3(w.x-u_sun.x*k,0.06,w.z-u_sun.z*k); v_w=p; gl_Position=u_vp*vec4(p,1.0); }';
  const SH_FS = PREC + 'varying vec3 v_w; uniform vec4 u_col; uniform vec3 u_cam; uniform vec2 u_fog; void main(){ float f=smoothstep(u_fog.x,u_fog.y,distance(v_w,u_cam)); gl_FragColor=vec4(u_col.rgb,u_col.a*(1.0-f)); }';
  const SPR_VS = 'attribute vec2 a_off; attribute vec2 a_uv; uniform mat4 u_vp; uniform vec3 u_center,u_right,u_up; uniform vec2 u_size; uniform float u_flat; varying vec2 v_uv;' +
    'void main(){ vec3 p; if(u_flat>0.5){ p=u_center+vec3(a_off.x*u_size.x,0.0,a_off.y*u_size.y); } else { p=u_center+u_right*(a_off.x*u_size.x)+u_up*(a_off.y*u_size.y); } v_uv=a_uv; gl_Position=u_vp*vec4(p,1.0); }';
  const SPR_FS = PREC + 'varying vec2 v_uv; uniform sampler2D u_tex; uniform vec4 u_col; void main(){ gl_FragColor=texture2D(u_tex,v_uv)*u_col; }';
  const TEX_VS = 'attribute vec3 a_pos; attribute vec2 a_uv; uniform mat4 u_vp; uniform mat4 u_model; varying vec2 v_uv; void main(){ v_uv=a_uv; gl_Position=u_vp*u_model*vec4(a_pos,1.0); }';
  const TEX_FS = PREC + 'varying vec2 v_uv; uniform sampler2D u_tex; uniform float u_l; void main(){ vec4 t=texture2D(u_tex,v_uv); gl_FragColor=vec4(t.rgb*u_l,t.a); }';
  const SKY_VS = 'attribute vec3 a_pos; uniform mat4 u_vp; uniform vec3 u_cam; varying vec3 v_d; void main(){ v_d=a_pos; gl_Position=u_vp*vec4(a_pos*400.0+u_cam,1.0); }';
  const SKY_FS = PREC + 'varying vec3 v_d; uniform vec3 u_top,u_hor,u_fog,u_sun,u_sunCol; uniform float u_night,u_time;' +
    'float hash(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }' +
    'void main(){ vec3 d=normalize(v_d); float h=d.y; vec3 col=mix(u_hor,u_top,pow(clamp(h,0.0,1.0),0.55)); col=mix(col,u_fog,smoothstep(0.03,-0.2,h));' +
    'float s=max(dot(d,normalize(u_sun)),0.0); col+=u_sunCol*(pow(s,600.0)*2.2+pow(s,16.0)*0.2+pow(s,3.0)*0.07);' +
    'if(u_night>0.01&&h>0.0){ float r=hash(floor(d*150.0)); float st=step(0.9962,r)*(0.55+0.45*sin(u_time*2.0+r*70.0)); col+=vec3(st)*u_night*smoothstep(0.0,0.25,h); }' +
    'gl_FragColor=vec4(col,1.0); }';

  /* ---------- state ---------- */
  const W = {
    ready: false, running: false, paused: false, gl: null, canvas: null, C: null, T: PRESETS.day, timeName: 'day',
    av: { x: 0, z: 0, th: 0, speed: 0, phase: 0 }, cam: { yaw: 0, pitch: 0.34, dist: 5.4, x: 0, y: 2, z: 0 },
    keys: {}, stick: { x: 0, y: 0, id: null }, drag: null, collected: [], hearts: [], particles: [], scale: 1, ftAvg: 16, ftN: 0, t0: 0,
    adapt: !/[?&]wfix\b/.test(location.search)
  };
  let raf = 0, last = 0, onExit = null;

  /* ---------- textures ---------- */
  function canvasTex(gl, cv) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  function glowCanvas() { const c = mkCanvas(64, 64), g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return c; }
  function cloudCanvas() {
    const c = mkCanvas(256, 128), g = c.getContext('2d'); let s = 9; const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let i = 0; i < 16; i++) { const x = 40 + r() * 176, y = 56 + r() * 30, rad = 22 + r() * 30, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill(); }
    return c;
  }
  function heartCanvas() {
    const c = mkCanvas(64, 64), g = c.getContext('2d'); g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 8; g.beginPath();
    g.moveTo(32, 54); g.bezierCurveTo(6, 34, 10, 8, 32, 20); g.bezierCurveTo(54, 8, 58, 34, 32, 54); g.fill(); return c;
  }
  function faceCanvas(img) {
    const c = mkCanvas(128, 128), g = c.getContext('2d');
    g.save(); g.beginPath(); g.arc(64, 64, 62, 0, TAU); g.clip();
    if (img) { const s = Math.min(img.naturalWidth, img.naturalHeight), sx = (img.naturalWidth - s) / 2, sy = Math.max(0, (img.naturalHeight - s) * 0.3); g.drawImage(img, sx, sy, s, s, 0, 0, 128, 128); }
    else {
      g.fillStyle = '#f2c3a0'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#2a1a12'; g.beginPath(); g.ellipse(64, 24, 62, 30, 0, 0, TAU); g.fill();
      g.fillStyle = '#2a1a12'; g.beginPath(); g.arc(44, 64, 6, 0, TAU); g.arc(84, 64, 6, 0, TAU); g.fill();
      g.strokeStyle = '#8a3a2a'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(44, 90); g.quadraticCurveTo(64, 108, 84, 90); g.stroke();
      g.fillStyle = 'rgba(255,110,130,.35)'; g.beginPath(); g.arc(30, 86, 10, 0, TAU); g.arc(98, 86, 10, 0, TAU); g.fill();
    }
    g.restore(); g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 4; g.beginPath(); g.arc(64, 64, 61, 0, TAU); g.stroke();
    return c;
  }
  const loadImage = src => new Promise(res => { if (!src) return res(null); const i = new Image(); const t = setTimeout(() => res(null), 2500); i.onload = () => { clearTimeout(t); res(i); }; i.onerror = () => { clearTimeout(t); res(null); }; i.src = src; });

  /* ---------- gl setup ---------- */
  const tick = () => new Promise(r => setTimeout(r, 16));
  function bufOf(gl, data, usage) { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, usage || gl.STATIC_DRAW); return b; }
  function uploadChunks(gl, chunks) { return chunks.map(c => ({ pos: bufOf(gl, c.pos), nrm: bufOf(gl, c.nrm), col: bufOf(gl, c.col), count: c.count })); }
  function useProg(gl, p, attribs) {
    gl.useProgram(p);
    for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i);
    attribs.forEach(n => gl.enableVertexAttribArray(p.a[n]));
  }
  function drawChunk(gl, p, c) {
    gl.bindBuffer(gl.ARRAY_BUFFER, c.pos); gl.vertexAttribPointer(p.a.a_pos, 3, gl.FLOAT, false, 0, 0);
    if (p.a.a_nrm != null) { gl.bindBuffer(gl.ARRAY_BUFFER, c.nrm); gl.vertexAttribPointer(p.a.a_nrm, 3, gl.BYTE, true, 0, 0); }
    if (p.a.a_col != null) { gl.bindBuffer(gl.ARRAY_BUFFER, c.col); gl.vertexAttribPointer(p.a.a_col, 4, gl.UNSIGNED_BYTE, true, 0, 0); }
    gl.drawArrays(gl.TRIANGLES, 0, c.count);
  }

  /* ---------- avatar parts ---------- */
  function buildAvatar(cfg) {
    const A = Object.assign({ skin: [0.95, 0.76, 0.62], hair: [0.16, 0.11, 0.09], jacket: [0.20, 0.24, 0.46], scarf: [0.93, 0.30, 0.50], pants: [0.18, 0.18, 0.22], shoes: [0.95, 0.95, 0.95] }, cfg || {});
    const part = fn => { const b = new MeshBuilder(); fn(b); return b; };
    return {
      torso: part(b => { b.box(0, 0.33, 0, 0.5, 0.66, 0.28, A.jacket); b.box(0, 0.62, 0.02, 0.52, 0.12, 0.31, A.scarf); b.box(0.18, 0.5, 0.15, 0.1, 0.34, 0.06, A.scarf); }),
      head: part(b => { b.blob(0, 0.26, 0, 0.26, 0.28, 0.26, A.skin, { seg: 10, rings: 6, jit: 0 }); b.blob(0, 0.43, -0.07, 0.275, 0.17, 0.255, A.hair, { seg: 10, rings: 4, jit: 0 }); }),
      leg: part(b => { b.box(0, -0.34, 0, 0.17, 0.68, 0.19, A.pants); b.box(0, -0.72, 0.05, 0.19, 0.12, 0.3, A.shoes); }),
      arm: part(b => { b.box(0, -0.27, 0, 0.13, 0.56, 0.14, A.jacket); b.box(0, -0.58, 0, 0.12, 0.1, 0.12, A.skin); })
    };
  }
  function heartMesh() {
    const b = new MeshBuilder(), N = 28, d = 0.16, pts = [];
    for (let i = 0; i < N; i++) { const t = i / N * TAU; pts.push([0.42 * Math.pow(Math.sin(t), 3), 0.42 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16 + 0.05]); }
    const col = [1.0, 0.28, 0.5];
    for (let i = 0; i < N; i++) {
      const p = pts[i], q = pts[(i + 1) % N];
      b.tri([0, 0.05, d], [p[0], p[1], d], [q[0], q[1], d], col, 0.9, [0, 0.05, 0]); b.tri([0, 0.05, -d], [q[0], q[1], -d], [p[0], p[1], -d], col, 0.9, [0, 0.05, 0]);
      b.quad([p[0], p[1], d], [q[0], q[1], d], [q[0], q[1], -d], [p[0], p[1], -d], [1, 0.45, 0.62], 0.9, [0, 0.05, 0]);
    }
    return b;
  }

  /* ---------- setup (once) ---------- */
  async function setup(setText) {
    const canvas = $('#world-canvas');
    const gl = canvas.getContext('webgl', { antialias: true, stencil: true, alpha: false }) || canvas.getContext('experimental-webgl', { antialias: true, stencil: true, alpha: false });
    if (!gl) throw new Error('no webgl');
    W.gl = gl; W.canvas = canvas;
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); W.ready = false; W.running = false; });
    W.P = {
      lit: program(gl, LIT_VS, LIT_FS), sh: program(gl, SH_VS, SH_FS), spr: program(gl, SPR_VS, SPR_FS), tex: program(gl, TEX_VS, TEX_FS), sky: program(gl, SKY_VS, SKY_FS)
    };
    // sky sphere
    const sv = [], R = 12, S = 20;
    for (let i = 0; i < R; i++) for (let j = 0; j < S; j++) {
      const p = (a, b) => { const ph = a / R * Math.PI, th = b / S * TAU; return [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)]; };
      const a = p(i, j), b = p(i + 1, j), c = p(i + 1, j + 1), d = p(i, j + 1); [a, b, c, a, c, d].forEach(v => sv.push(v[0], v[1], v[2]));
    }
    W.skyBuf = bufOf(gl, new Float32Array(sv)); W.skyN = sv.length / 3;
    W.quadBuf = bufOf(gl, new Float32Array([-1, -1, 0, 1, 1, -1, 1, 1, -1, 1, 0, 0, 1, 1, 1, 0]));
    W.decalBuf = bufOf(gl, new Float32Array([-1, -1, 0, 0, 1, 1, -1, 0, 1, 1, -1, 1, 0, 0, 0, 1, 1, 0, 1, 0]));
    W.tx = { glow: canvasTex(gl, glowCanvas()), cloud: canvasTex(gl, cloudCanvas()), heart: canvasTex(gl, heartCanvas()) };
    setText('Meeting you at the street…');
    const face = await loadImage((W.C.pilot && W.C.pilot.face) || '');
    W.tx.face = canvasTex(gl, faceCanvas(face));
    W.avParts = {}; const av = buildAvatar(W.C.world && W.C.world.avatar);
    Object.keys(av).forEach(k => { W.avParts[k] = uploadChunks(gl, av[k].chunks())[0]; });
    W.heartGeo = uploadChunks(gl, heartMesh().chunks())[0];
    W.clouds = []; for (let i = 0; i < 14; i++) W.clouds.push({ az: i / 14 * TAU + (i % 3) * 0.3, el: 0.14 + (i * 0.37 % 0.45), w: 90 + (i * 53 % 80), sp: 0.004 + (i % 4) * 0.0015 });
    await tick();
  }

  async function buildWorld(setText) {
    const key = (/[?&]wtime=(day|sunset|night)/.exec(location.search) || [])[1] || (W.C.world && W.C.world.time) || 'day';
    W.timeName = PRESETS[key] ? key : 'day'; W.T = PRESETS[W.timeName];
    setText('Building our street…'); await tick();
    const sc = window.WorldScene.build(W.T);
    W.sc = sc; W.circles = sc.circles; W.boxes = sc.boxes; W.bounds = sc.bounds; W.lamps = sc.lamps;
    W.chunks = uploadChunks(W.gl, sc.mesh.chunks());
    const cas = sc.mesh.cas.view(), per = 300000, gl = W.gl; W.casChunks = [];
    for (let s = 0; s < cas.length; s += per) { const sl = cas.subarray(s, Math.min(cas.length, s + per)); W.casChunks.push({ pos: bufOf(gl, sl), count: sl.length / 3 }); }
    W.hearts = sc.hearts.map((h, i) => ({ x: h.x, z: h.z, i, pop: 0 })); W.collected = W.hearts.map(() => false);
    W.sunV = norm3(W.T.sun);
    await tick();
  }

  /* ---------- collisions ---------- */
  const AV_R = 0.36;
  function resolve(p) {
    for (let it = 0; it < 2; it++) {
      for (const c of W.circles) { const dx = p.x - c.x, dz = p.z - c.z, m = AV_R + c.r; if (dx * dx + dz * dz < m * m) { const d = Math.hypot(dx, dz) || 1e-4; p.x = c.x + dx / d * m; p.z = c.z + dz / d * m; } }
      for (const b of W.boxes) {
        const cx = clamp(p.x, b.x0, b.x1), cz = clamp(p.z, b.z0, b.z1), dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
        if (d < AV_R) {
          if (d > 1e-4) { p.x = cx + dx / d * AV_R; p.z = cz + dz / d * AV_R; }
          else { const l = p.x - b.x0, r = b.x1 - p.x, t = p.z - b.z0, bt = b.z1 - p.z, m = Math.min(l, r, t, bt); if (m === l) p.x = b.x0 - AV_R; else if (m === r) p.x = b.x1 + AV_R; else if (m === t) p.z = b.z0 - AV_R; else p.z = b.z1 + AV_R; }
        }
      }
    }
    p.x = clamp(p.x, W.bounds.x0, W.bounds.x1); p.z = clamp(p.z, W.bounds.z0, W.bounds.z1);
  }

  /* ---------- update ---------- */
  function update(dt, now) {
    const a = W.av, cam = W.cam, k = W.keys;
    let jx = W.stick.x + ((k.d || k.arrowright) ? 1 : 0) - ((k.a || k.arrowleft) ? 1 : 0);
    let jy = W.stick.y + ((k.w || k.arrowup) ? 1 : 0) - ((k.s || k.arrowdown) ? 1 : 0);
    if (W.paused) { jx = 0; jy = 0; }
    const mag = Math.hypot(jx, jy);
    if (mag > 1) { jx /= mag; jy /= mag; }
    const m = Math.min(1, mag);
    const run = k.shift ? 1.7 : 1;
    let target = 0;
    if (m > 0.06) {
      const fx = Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = Math.sin(cam.yaw);
      let dx = fx * jy + rx * jx, dz = fz * jy + rz * jx; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      target = 3.4 * m * run;
      a.th += angDiff(a.th, Math.atan2(dx, -dz)) * (1 - Math.exp(-dt * 13));
      a.speed += (target - a.speed) * (1 - Math.exp(-dt * 10));
      const np = { x: a.x + dx * a.speed * dt, z: a.z + dz * a.speed * dt };
      resolve(np); a.x = np.x; a.z = np.z;
    } else a.speed += (0 - a.speed) * (1 - Math.exp(-dt * 12));
    a.phase += a.speed * dt * 2.4;

    // hearts
    W.hearts.forEach(h => {
      if (W.collected[h.i]) { h.pop = Math.max(0, h.pop - dt * 1.6); return; }
      if (!W.paused && Math.hypot(h.x - a.x, h.z - a.z) < 1.7) openCard(h.i);
    });
    // particles
    for (let i = W.particles.length - 1; i >= 0; i--) { const p = W.particles[i]; p.life -= dt; if (p.life <= 0) { W.particles.splice(i, 1); continue; } p.vy -= 1.8 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; }

    // camera follows the avatar
    const tx = a.x, ty = 1.45, tz = a.z, f = 1 - Math.exp(-dt * 9);
    cam.x += (tx - cam.x) * f; cam.y += (ty - cam.y) * f; cam.z += (tz - cam.z) * f;
  }

  function burst(x, y, z, n) {
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = 0.8 + Math.random() * 2.2; W.particles.push({ x, y, z, vx: Math.cos(a) * s, vy: 1 + Math.random() * 2.4, vz: Math.sin(a) * s, life: 1.2 + Math.random() * 0.9, size: 0.14 + Math.random() * 0.14 }); }
  }

  /* ---------- rendering ---------- */
  function resize() {
    const c = W.canvas, dpr = Math.min(window.devicePixelRatio || 1, 1.75) * W.scale, w = Math.max(2, Math.round(c.clientWidth * dpr)), h = Math.max(2, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  }
  function drawAvatar(gl, p, shadow, now) {
    const a = W.av, swing = Math.sin(a.phase) * 0.8 * clamp(a.speed / 3.2, 0, 1.2), bob = Math.abs(Math.cos(a.phase)) * 0.045 * clamp(a.speed / 3.2, 0, 1) + Math.sin(now / 900) * 0.006;
    const root = M4.mul(M4.trans(a.x, bob, a.z), M4.rotY(Math.PI - a.th));
    const parts = [
      ['torso', M4.mul(root, M4.trans(0, 0.78, 0))],
      ['head', M4.mul(root, M4.trans(0, 1.4, 0))],
      ['leg', M4.mul(root, M4.mul(M4.trans(-0.12, 0.78, 0), M4.rotX(swing)))],
      ['leg', M4.mul(root, M4.mul(M4.trans(0.12, 0.78, 0), M4.rotX(-swing)))],
      ['arm', M4.mul(root, M4.mul(M4.trans(-0.32, 1.36, 0), M4.rotX(-swing * 0.9)))],
      ['arm', M4.mul(root, M4.mul(M4.trans(0.32, 1.36, 0), M4.rotX(swing * 0.9)))]
    ];
    parts.forEach(([n, m]) => { gl.uniformMatrix4fv(p.u.u_model, false, m); drawChunk(gl, p, W.avParts[n]); });
    return M4.mul(root, M4.trans(0, 1.4, 0));
  }
  function sprite(gl, p, tex, c, size, col, flat, cam) {
    gl.uniform3f(p.u.u_center, c[0], c[1], c[2]); gl.uniform2f(p.u.u_size, size[0], size[1]); gl.uniform4f(p.u.u_col, col[0], col[1], col[2], col[3]); gl.uniform1f(p.u.u_flat, flat ? 1 : 0);
    gl.bindTexture(gl.TEXTURE_2D, tex); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function render(now) {
    const gl = W.gl, T = W.T, cam = W.cam, a = W.av, P = W.P;
    resize(); gl.viewport(0, 0, W.canvas.width, W.canvas.height);
    const aspect = W.canvas.width / W.canvas.height, fov = aspect < 1 ? 1.12 : 0.92;
    const proj = M4.persp(fov, aspect, 0.15, 700);
    const cp = Math.cos(cam.pitch), eye = [cam.x - Math.sin(cam.yaw) * cam.dist * cp, Math.max(0.5, cam.y + Math.sin(cam.pitch) * cam.dist), cam.z + Math.cos(cam.yaw) * cam.dist * cp];
    eye[0] = clamp(eye[0], -60, 70); eye[2] = clamp(eye[2], -95, 95);
    const view = M4.look(eye, [cam.x, cam.y, cam.z], [0, 1, 0]), vp = M4.mul(proj, view);
    const right = [view[0], view[4], view[8]], up = [view[1], view[5], view[9]], I = M4.ident();

    gl.clearColor(T.fog[0], T.fog[1], T.fog[2], 1); gl.clearStencil(0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND); gl.depthMask(false);

    // sky
    let p = P.sky; useProg(gl, p, ['a_pos']);
    gl.uniformMatrix4fv(p.u.u_vp, false, vp); gl.uniform3fv(p.u.u_cam, eye); gl.uniform3fv(p.u.u_top, T.top); gl.uniform3fv(p.u.u_hor, T.hor); gl.uniform3fv(p.u.u_fog, T.fog);
    gl.uniform3fv(p.u.u_sun, W.sunV); gl.uniform3fv(p.u.u_sunCol, T.sunCol.map(v => v * (T.night > 0.5 ? 0.9 : 1.2))); gl.uniform1f(p.u.u_night, T.night); gl.uniform1f(p.u.u_time, now / 1000);
    gl.bindBuffer(gl.ARRAY_BUFFER, W.skyBuf); gl.vertexAttribPointer(p.a.a_pos, 3, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLES, 0, W.skyN);

    // clouds
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    p = P.spr; useProg(gl, p, ['a_off', 'a_uv']);
    gl.uniformMatrix4fv(p.u.u_vp, false, vp); gl.uniform3fv(p.u.u_right, right); gl.uniform3fv(p.u.u_up, up); gl.uniform1i(p.u.u_tex, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, W.quadBuf); gl.vertexAttribPointer(p.a.a_off, 2, gl.FLOAT, false, 16, 0); gl.vertexAttribPointer(p.a.a_uv, 2, gl.FLOAT, false, 16, 8);
    const cc = T.night > 0.5 ? [0.35, 0.38, 0.6] : T.sunCol.map((v, i) => 0.55 + v * 0.45 + (i === 2 ? -0.1 : 0));
    W.clouds.forEach(c => {
      const az = c.az + now / 1000 * c.sp, el = c.el, d = [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)];
      sprite(gl, p, W.tx.cloud, [eye[0] + d[0] * 320, eye[1] + d[1] * 320, eye[2] + d[2] * 320], [c.w, c.w * 0.38], [Math.min(1, cc[0]), Math.min(1, cc[1]), Math.min(1, cc[2]), T.clouds * 0.8], false);
    });

    // world
    gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    p = P.lit; useProg(gl, p, ['a_pos', 'a_nrm', 'a_col']);
    gl.uniformMatrix4fv(p.u.u_vp, false, vp); gl.uniform3fv(p.u.u_sun, W.sunV); gl.uniform3fv(p.u.u_sunCol, T.sunCol); gl.uniform3fv(p.u.u_sky, T.sky); gl.uniform3fv(p.u.u_gnd, T.gnd);
    gl.uniform3fv(p.u.u_fogCol, T.fog); gl.uniform3fv(p.u.u_cam, eye); gl.uniform2f(p.u.u_fog, T.fogN, T.fogF);
    gl.uniformMatrix4fv(p.u.u_model, false, I);
    W.chunks.forEach(c => drawChunk(gl, p, c));
    const headM = drawAvatar(gl, p, false, now);
    // memory hearts
    W.hearts.forEach(h => {
      const sc = W.collected[h.i] ? h.pop : 1; if (sc <= 0.01) return;
      const y = 1.55 + Math.sin(now / 600 + h.i) * 0.12, m = M4.mul(M4.trans(h.x, y, h.z), M4.mul(M4.rotY(now / 900 + h.i), M4.scale(sc * (1 + Math.sin(now / 300 + h.i) * 0.05), sc, sc)));
      gl.uniformMatrix4fv(p.u.u_model, false, m); drawChunk(gl, p, W.heartGeo);
    });

    // face decal on the avatar's head
    p = P.tex; useProg(gl, p, ['a_pos', 'a_uv']);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniformMatrix4fv(p.u.u_vp, false, vp); gl.uniform1i(p.u.u_tex, 0); gl.uniform1f(p.u.u_l, 0.55 + Math.min(1, T.sunCol[0] + T.sky[0]) * 0.5);
    gl.uniformMatrix4fv(p.u.u_model, false, M4.mul(headM, M4.mul(M4.trans(0, 0.25, 0.262), M4.scale(0.185, 0.185, 0.185))));
    gl.bindBuffer(gl.ARRAY_BUFFER, W.decalBuf); gl.vertexAttribPointer(p.a.a_pos, 3, gl.FLOAT, false, 20, 0); gl.vertexAttribPointer(p.a.a_uv, 2, gl.FLOAT, false, 20, 12);
    gl.bindTexture(gl.TEXTURE_2D, W.tx.face); gl.depthMask(false); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // planar shadows (stencil so overlaps don't double-darken)
    p = P.sh; useProg(gl, p, ['a_pos']);
    gl.enable(gl.STENCIL_TEST); gl.stencilFunc(gl.EQUAL, 0, 255); gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
    gl.uniformMatrix4fv(p.u.u_vp, false, vp); gl.uniform3fv(p.u.u_sun, W.sunV); gl.uniform4f(p.u.u_col, 0.04, 0.03, 0.10, T.shadow); gl.uniform3fv(p.u.u_cam, eye); gl.uniform2f(p.u.u_fog, T.fogN, T.fogF);
    gl.uniformMatrix4fv(p.u.u_model, false, I);
    W.casChunks.forEach(c => { gl.bindBuffer(gl.ARRAY_BUFFER, c.pos); gl.vertexAttribPointer(p.a.a_pos, 3, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLES, 0, c.count); });
    drawAvatar(gl, p, true, now);
    gl.disable(gl.STENCIL_TEST);

    // glows: lamps, hearts, particles
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    p = P.spr; useProg(gl, p, ['a_off', 'a_uv']);
    gl.uniformMatrix4fv(p.u.u_vp, false, vp); gl.uniform3fv(p.u.u_right, right); gl.uniform3fv(p.u.u_up, up); gl.uniform1i(p.u.u_tex, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, W.quadBuf); gl.vertexAttribPointer(p.a.a_off, 2, gl.FLOAT, false, 16, 0); gl.vertexAttribPointer(p.a.a_uv, 2, gl.FLOAT, false, 16, 8);
    if (T.glow > 0.05) W.lamps.forEach(l => {
      if (Math.hypot(l.x - eye[0], l.z - eye[2]) > 90) return;
      sprite(gl, p, W.tx.glow, [l.x, l.y, l.z], [3.2, 3.2], [1, 0.82, 0.55, 0.5 * T.glow], false);
      sprite(gl, p, W.tx.glow, [l.x - Math.sign(l.x) * 0.2, 0.08, l.z], [6, 6], [1, 0.8, 0.5, 0.34 * T.glow], true);
    });
    W.hearts.forEach(h => { if (!W.collected[h.i]) sprite(gl, p, W.tx.glow, [h.x, 1.55, h.z], [2.4, 2.4], [1, 0.3, 0.55, 0.45 + Math.sin(now / 400 + h.i) * 0.12], false); });
    W.particles.forEach(q => { gl.bindTexture(gl.TEXTURE_2D, W.tx.heart); sprite(gl, p, W.tx.heart, [q.x, q.y, q.z], [q.size, q.size], [1, 0.4, 0.6, clamp(q.life, 0, 1)], false); });
    gl.depthMask(true); gl.disable(gl.BLEND);
  }

  /* ---------- loop ---------- */
  function frame(now) {
    if (!W.running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    update(dt, now); render(now);
    if (W.adapt) {      // keep phones smooth: drop resolution if the frame time stays high
      W.ftAvg = W.ftAvg * 0.95 + dt * 1000 * 0.05; W.ftN++;
      if (W.ftN > 90 && W.ftAvg > 36 && W.scale > 0.55) { W.scale = Math.max(0.55, W.scale - 0.15); W.ftN = 0; W.ftAvg = 16; }
    }
  }

  /* ---------- UI + input ---------- */
  function openCard(i) {
    const m = (W.C.memories || [])[i]; if (!m) return;
    W.paused = true; W.stick.x = W.stick.y = 0; $('#w-knob').style.transform = '';
    $('#w-c-title').textContent = m.title || ''; $('#w-c-date').textContent = m.date || ''; $('#w-c-quote').textContent = m.quote || '';
    const img = $('#w-c-img'), box = $('#w-c-photo'); box.classList.remove('fallback'); img.onerror = () => box.classList.add('fallback'); img.removeAttribute('src');
    if (m.photo) img.src = m.photo; else box.classList.add('fallback');
    $('#w-card').hidden = false; $('#w-card').dataset.i = i;
    requestAnimationFrame(() => $('#w-card').classList.add('show'));
  }
  function closeCard() {
    const c = $('#w-card'), i = +c.dataset.i; c.classList.remove('show'); setTimeout(() => { c.hidden = true; }, 350);
    if (!W.collected[i]) { W.collected[i] = true; const h = W.hearts[i]; h.pop = 1; burst(h.x, 1.6, h.z, 26); }
    W.paused = false; updateCount();
    if (W.collected.every(Boolean)) setTimeout(showEnd, 900);
  }
  function updateCount() { $('#w-count').textContent = '♥ ' + W.collected.filter(Boolean).length + ' / ' + W.collected.length; }
  function showEnd() {
    const wc = W.C.world || {}; $('#w-end-text').textContent = wc.finalMessage || 'You found every memory. I love you.'; W.paused = true; const e = $('#w-end'); e.hidden = false; requestAnimationFrame(() => e.classList.add('show'));
    burst(W.av.x, 1.6, W.av.z, 70);
  }

  let bound = false;
  function bindInput() {
    if (bound) return; bound = true;
    const stick = $('#w-stick'), knob = $('#w-knob'), cv = W.canvas, MAXR = 44;
    const setStick = e => {
      const r = stick.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; let dx = e.clientX - cx, dy = e.clientY - cy; const l = Math.hypot(dx, dy);
      if (l > MAXR) { dx = dx / l * MAXR; dy = dy / l * MAXR; }
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'; W.stick.x = dx / MAXR; W.stick.y = -dy / MAXR;
    };
    stick.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); W.stick.id = e.pointerId; stick.setPointerCapture(e.pointerId); setStick(e); });
    stick.addEventListener('pointermove', e => { if (e.pointerId === W.stick.id) setStick(e); });
    const endStick = e => { if (e.pointerId !== W.stick.id) return; W.stick.id = null; W.stick.x = W.stick.y = 0; knob.style.transform = ''; };
    stick.addEventListener('pointerup', endStick); stick.addEventListener('pointercancel', endStick);

    cv.addEventListener('pointerdown', e => { if (W.drag) return; W.drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); cv.classList.add('grab'); });
    cv.addEventListener('pointermove', e => {
      if (!W.drag || e.pointerId !== W.drag.id) return;
      W.cam.yaw += (e.clientX - W.drag.x) * 0.0058; W.cam.pitch = clamp(W.cam.pitch + (e.clientY - W.drag.y) * 0.0042, 0.04, 1.25);
      W.drag.x = e.clientX; W.drag.y = e.clientY;
    });
    const endDrag = e => { if (W.drag && e.pointerId === W.drag.id) { W.drag = null; cv.classList.remove('grab'); } };
    cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
    cv.addEventListener('wheel', e => { e.preventDefault(); W.cam.dist = clamp(W.cam.dist + e.deltaY * 0.004, 2.4, 11); }, { passive: false });
    window.addEventListener('keydown', e => { if (!W.running) return; const k = e.key.toLowerCase(); W.keys[k] = true; if (k === 'shift') W.keys.shift = true; if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault(); if (k === 'q') W.cam.yaw -= 0.15; if (k === 'e') W.cam.yaw += 0.15; });
    window.addEventListener('keyup', e => { W.keys[e.key.toLowerCase()] = false; });
    window.addEventListener('blur', () => { W.keys = {}; });
    $('#w-c-close').addEventListener('click', closeCard);
    $('#w-end-close').addEventListener('click', () => { const e = $('#w-end'); e.classList.remove('show'); setTimeout(() => { e.hidden = true; }, 350); W.paused = false; });
    $('#w-back').addEventListener('click', () => { World.leave(); if (onExit) onExit(); });
    addEventListener('resize', () => { if (W.running) resize(); });
  }

  /* ---------- public ---------- */
  const World = {
    supported() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl') || c.getContext('experimental-webgl')); } catch (e) { return false; } },
    async enter(opts) {
      W.C = opts.C; onExit = opts.onExit;
      const load = $('#w-load'), txt = $('#w-load-text'), ui = $('#w-ui');
      load.classList.remove('gone'); load.hidden = false; ui.hidden = true;
      const setText = t => { txt.textContent = t; };
      try {
        if (!W.ready) {
          setText('Warming up…'); await tick();
          if (!W.gl) await setup(setText);
          await buildWorld(setText);
          W.ready = true;
        }
      } catch (err) { console.error('[world]', err); txt.textContent = 'This device cannot show the 3D world.'; $('#w-load-back').hidden = false; return false; }
      const sc = W.sc, wc = W.C.world || {};
      W.av.x = sc.spawn.x; W.av.z = sc.spawn.z; W.av.th = 0; W.av.speed = 0; W.cam.yaw = 0; W.cam.pitch = 0.34; W.cam.dist = 5.4; W.cam.x = W.av.x; W.cam.y = 1.45; W.cam.z = W.av.z;
      W.collected = W.hearts.map(() => false); W.particles = []; W.paused = false; W.scale = 1; W.ftN = 0; W.ftAvg = 16;
      const tt = $('#w-title'); tt.textContent = wc.title || 'Our street'; tt.classList.remove('run'); void tt.offsetWidth; tt.classList.add('run'); updateCount();
      $('#w-hint').textContent = (matchMedia('(pointer: coarse)').matches ? (wc.hintTouch || 'Joystick to walk · drag to look around') : (wc.hintDesktop || 'WASD or arrows to walk · drag to look · wheel to zoom'));
      $('#w-count').hidden = !(wc.hearts !== false);
      bindInput(); ui.hidden = false;
      load.classList.add('gone'); setTimeout(() => { load.hidden = true; }, 900);
      W.running = true; last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
      return true;
    },
    step(dt) { update(dt, performance.now()); },
    leave() { W.running = false; cancelAnimationFrame(raf); W.keys = {}; W.stick.x = W.stick.y = 0; },
    _W: W
  };
  window.World = World;
  window.__world = W;
})();
