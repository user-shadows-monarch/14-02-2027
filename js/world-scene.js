/* The street, built from low-poly shapes. Layout follows the reference photos:
   a quiet residential road (z axis), white/cream houses with dark tile roofs and picket fences on the west,
   a low hedge, a dirt path, lawn, tall bare trees and pines on the east, a scaffolded block in the park. */
(function () {
  'use strict';
  const { MeshBuilder, rng, clamp } = window.GL3D;
  const TAU = Math.PI * 2;

  const C = {
    asphalt: [0.40, 0.40, 0.43], curb: [0.56, 0.56, 0.57], paver: [0.68, 0.67, 0.66], paver2: [0.61, 0.60, 0.59],
    grass: [0.47, 0.54, 0.27], grass2: [0.57, 0.55, 0.31], dirt: [0.57, 0.47, 0.34], leaf: [0.45, 0.37, 0.27],
    white: [0.94, 0.94, 0.92], cream: [0.93, 0.87, 0.71], beige: [0.88, 0.80, 0.64], brick: [0.56, 0.29, 0.23], brickCap: [0.78, 0.74, 0.70],
    bark: [0.33, 0.27, 0.23], bark2: [0.43, 0.37, 0.31], pineTop: [0.72, 0.41, 0.23], pineLow: [0.42, 0.33, 0.28], pineLeaf: [0.13, 0.27, 0.17],
    thuja: [0.09, 0.25, 0.14], hedge: [0.29, 0.35, 0.17], roofDark: [0.20, 0.20, 0.24], roofBrown: [0.27, 0.20, 0.17], roofRed: [0.58, 0.26, 0.19],
    timber: [0.29, 0.19, 0.14], glass: [0.17, 0.21, 0.30], wood: [0.27, 0.19, 0.14], dark: [0.12, 0.12, 0.14], blue: [0.18, 0.30, 0.78], red: [0.80, 0.18, 0.16],
    pole: [0.24, 0.26, 0.28], black: [0.06, 0.06, 0.07], metal: [0.62, 0.64, 0.68], steel: [0.72, 0.74, 0.78]
  };
  const WARM = [1.0, 0.78, 0.42];
  const jit = (R, c, a) => { const k = 1 + (R() - 0.5) * 2 * a; return [c[0] * k, c[1] * k, c[2] * k]; };
  const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

  function build(T) {
    const R = rng(20241), b = new MeshBuilder();
    b.pos.grow(1 << 20);
    const circles = [], boxes = [], lamps = [];
    const circle = (x, z, r) => circles.push({ x, z, r });
    const boxc = (x0, z0, x1, z1) => boxes.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) });
    const glow = T.glow;
    const hearts = [[-4.4, 55], [2.0, 36], [8.4, 12], [-4.4, -2], [2.2, -22], [8.6, -30]].map(([x, z]) => ({ x, z }));
    const nearHeart = (x, z) => hearts.some(h => Math.hypot(h.x - x, h.z - z) < 3.4);

    /* ---------- helpers ---------- */
    const flat = (x, z, w, d, y, c, ang) => {
      b.push(); b.T(x, y, z); if (ang) b.RY(ang);
      b.quad([-w / 2, 0, -d / 2], [w / 2, 0, -d / 2], [w / 2, 0, d / 2], [-w / 2, 0, d / 2], c, 0, [0, -1, 0], false);
      b.pop();
    };
    const win = (x, y, w, h, z, lit) => {
      b.box(x, y, z, w + 0.16, h + 0.16, 0.1, C.white);
      b.box(x, y, z + 0.04, w, h, 0.09, lit ? WARM : C.glass, { em: lit ? glow : 0 });
      b.box(x, y, z + 0.09, 0.05, h, 0.04, C.white); b.box(x, y, z + 0.09, w, 0.05, 0.04, C.white);
      b.box(x, y - h / 2 - 0.1, z + 0.1, w + 0.34, 0.07, 0.22, C.white);
    };

    /* ---------- ground ---------- */
    function ground() {
      b.quad([-160, 0, -160], [160, 0, -160], [160, 0, 160], [-160, 0, 160], C.grass, 0, [0, -1, 0], false);
      for (let i = 0; i < 300; i++) {
        const x = R.range(-70, 70), z = R.range(-110, 110); if (Math.abs(x) < 5) continue;
        const s = R.range(2, 9), col = R.pick([C.grass2, C.leaf, C.dirt, C.grass, [0.55, 0.58, 0.31], [0.40, 0.46, 0.22]]);
        flat(x, z, s * R.range(0.6, 1.5), s * R.range(0.6, 1.5), 0.01, jit(R, col, 0.07), R() * TAU);
      }
      // road, with a little wear
      flat(0, 0, 6.5, 260, 0.03, C.asphalt);
      for (let i = 0; i < 60; i++) flat(R.range(-2.8, 2.8), R.range(-100, 100), R.range(0.8, 2.6), R.range(3, 9), 0.035, jit(R, C.asphalt, 0.09), 0);
      // kerbs
      b.base(-3.35, 0, 0, 0.22, 0.14, 260, C.curb); b.base(3.35, 0, 0, 0.22, 0.14, 260, C.curb);
      // west pavement (pavers)
      for (let z = -110; z < 110; z += 1.3) {
        flat(-4.55, z + 0.65, 1.15, 1.25, 0.02, jit(R, C.paver, 0.04)); flat(-5.45, z + 0.65, 1.15, 1.25, 0.02, jit(R, C.paver2, 0.04));
        flat(-6.0, z + 0.65, 0.2, 1.3, 0.022, jit(R, C.paver2, 0.04));
      }
      // east verge + winding dirt path through the park
      flat(3.95, 0, 1.1, 260, 0.02, [0.36, 0.30, 0.21]);
      for (let z = -112; z < 112; z += 3) {
        const x = 8.2 + 3.2 * Math.sin(z / 17);
        flat(x, z + 1.5, 2.4, 3.4, 0.015, jit(R, C.dirt, 0.05), Math.cos(z / 17) * 0.3);
      }
      // little side paths from the street into the park
      [[-38, 6.2], [4, 6.6], [44, 6.0]].forEach(([z, w]) => { for (let x = 4.2; x < 7.6; x += 1.5) flat(x + 0.8, z, 1.7, 2.2, 0.016, jit(R, C.dirt, 0.05)); });
    }

    /* ---------- trees ---------- */
    function limb(p, dir, len, rad, depth, cast) {
      const q = [p[0] + dir[0] * len, p[1] + dir[1] * len, p[2] + dir[2] * len];
      b.tube(p, q, rad, rad * 0.62, depth >= 2 ? 4 : 3, jit(R, C.bark2, 0.1), { cast: cast && depth > 0 });
      if (depth <= 0) return;
      const kids = depth === 3 ? 3 : 2;
      for (let i = 0; i < kids; i++) {
        const nd = norm([dir[0] + (R() - 0.5) * 1.2, dir[1] * 0.75 + (R() * 0.55 - 0.05), dir[2] + (R() - 0.5) * 1.2]);
        limb(q, nd, len * (0.6 + R() * 0.22), rad * 0.6, depth - 1, cast);
      }
    }
    function bareTree(x, z, h) {
      b.tube([x, 0, z], [x + (R() - 0.5) * 0.4, h * 0.46, z + (R() - 0.5) * 0.4], 0.32, 0.2, 5, jit(R, C.bark, 0.1), { cast: true });
      const n = 5 + Math.floor(R() * 3);
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU + R() * 0.7, up = 0.7 + R() * 0.7;
        limb([x, h * (0.3 + R() * 0.2), z], norm([Math.cos(a) * 0.7, up, Math.sin(a) * 0.7]), h * 0.3, 0.15, 3, true);
      }
      // a few early-spring buds
      for (let i = 0; i < 6; i++) b.blob(x + (R() - 0.5) * h * 0.45, h * (0.62 + R() * 0.4), z + (R() - 0.5) * h * 0.45, 0.35, 0.28, 0.35, [0.55, 0.66, 0.26], { rnd: R, seg: 5, rings: 3 });
      circle(x, z, 0.5);
    }
    function pine(x, z, h) {
      const lean = (R() - 0.5) * 0.8;
      b.tube([x, 0, z], [x + lean * 0.5, h * 0.5, z], 0.34, 0.24, 5, jit(R, C.pineLow, 0.08), { cast: true });
      b.tube([x + lean * 0.5, h * 0.5, z], [x + lean, h, z], 0.24, 0.08, 5, jit(R, C.pineTop, 0.08), { cast: true });
      for (let i = 0; i < 5; i++) {
        const a = R() * TAU, r = R() * 1.6, y = h * (0.64 + R() * 0.34);
        b.blob(x + lean * 0.8 + Math.cos(a) * r, y, z + Math.sin(a) * r, 2.2 + R() * 1.2, 0.9 + R() * 0.5, 2.2 + R() * 1.2, jit(R, C.pineLeaf, 0.12), { cast: true, rnd: R, seg: 7, rings: 3, jit: 0.2 });
      }
      for (let i = 0; i < 3; i++) { const a = R() * TAU; limb([x + lean * 0.5, h * (0.5 + R() * 0.15), z], norm([Math.cos(a), 0.5, Math.sin(a)]), 2.2, 0.07, 1, true); }
      circle(x, z, 0.5);
    }
    function thuja(x, z, s) { b.cone(x, 0, z, 0.75 * s, 3.0 * s, 6, jit(R, C.thuja, 0.1), { cast: true }); circle(x, z, 0.6 * s); }
    function bush(x, z, s, c) { b.blob(x, 0.35 * s, z, 0.9 * s, 0.6 * s, 0.9 * s, jit(R, c || C.hedge, 0.1), { cast: true, rnd: R, seg: 6, rings: 3 }); }

    /* ---------- fences ---------- */
    function fence(x, z0, z1, o) {
      o = o || {}; const h = o.h || 1.05, col = o.color || C.white, len = z1 - z0, zm = (z0 + z1) / 2;
      b.box(x, h * 0.28, zm, 0.06, 0.07, len, col, { cast: true }); b.box(x, h * 0.78, zm, 0.06, 0.07, len, col, { cast: true });
      for (let z = z0 + 0.12; z < z1; z += o.spacing || 0.17) b.base(x, 0, z, 0.05, h * (1 - 0.06 * (R() > 0.9 ? 1 : 0)), 0.1, col, { cast: true });
      if (o.brickBase) b.base(x, 0, zm, 0.3, 0.38, len, C.brick, { cast: true });
      if (o.pillars) for (let z = z0; z <= z1 + 0.01; z += o.pillars) { b.base(x, 0, z, 0.46, 1.32, 0.46, jit(R, C.brick, 0.08), { cast: true }); b.base(x, 1.32, z, 0.56, 0.08, 0.56, C.brickCap); }
      boxc(x - 0.12, z0, x + 0.12, z1);
    }

    /* ---------- houses (local: facade on +z, rotated so +z faces the street, i.e. east) ---------- */
    function house(s) {
      const lit = glow > 0.1, W = s.w, D = s.d, Hw = s.h;
      b.push(); b.T(s.x, 0, s.z); b.RY(Math.PI / 2);
      b.base(0, 0, 0, W, Hw, D, s.wall, { cast: true });
      b.base(0, 0, 0, W + 0.06, 0.55, D + 0.06, [0.2, 0.2, 0.22]);
      if (s.type === 'gable') {
        b.gable(0, Hw, 0, W + 1.0, 6.0, D, s.roof, s.wall, { cast: true });
        b.base(W * 0.28, Hw + 1.2, -D * 0.2, 0.95, 4.4, 0.95, C.brick, { cast: true }); b.base(W * 0.28, Hw + 5.5, -D * 0.2, 1.1, 0.12, 1.1, C.brickCap);
        // dormer on the left slope
        b.push(); b.T(-W * 0.26, Hw + 1.35, -0.6); b.base(0, 0, 0, 1.5, 1.5, 1.6, s.wall, { cast: true }); b.gable(0, 1.5, 0, 1.9, 1.0, 1.7, s.roof, s.wall); b.pop();
        win(1.2, 4.2, 0.95, 1.25, D / 2, lit); win(2.9, 4.2, 0.95, 1.25, D / 2, lit); win(2.1, 1.9, 2.0, 1.2, D / 2, lit);
        // entrance annex (left)
        b.push(); b.T(-W / 2 - 1.2, 0, D / 2 - 1.6); b.base(0, 0, 0, 2.6, 2.7, 3.2, s.wall, { cast: true }); b.shed(0, 2.7, 0, 3.1, 1.1, 0.5, 3.8, s.roof, { cast: true });
        b.box(0, 1.1, 1.62, 1.0, 2.15, 0.1, C.white); b.push(); b.T(0, 1.4, 1.7); b.RZ(Math.PI / 4); b.box(0, 0, 0, 0.22, 0.22, 0.06, C.dark); b.pop();
        b.base(0, 0, 2.0, 1.6, 0.35, 0.9, C.brick); b.pop();
        win(-W / 2 + 1.2, 1.9, 0.8, 1.1, D / 2, lit);
      } else if (s.type === 'hip') {
        b.push(); b.T(0, Hw, 0); b.RY(Math.PI / 2); b.hip(0, 0, 0, D + 1.4, 3.1, W + 1.4, W - 2.5, s.roof, { cast: true }); b.pop();
        for (let i = -1; i <= 1; i++) { b.push(); b.T(i * 2.2, Hw + 1.15, D / 2 - 0.2); b.RX(0.62); b.box(0, 0, 0, 0.9, 0.06, 1.0, [0.45, 0.6, 0.75], { em: lit ? glow * 0.6 : 0 }); b.pop(); }
        win(-2.6, 1.7, 1.2, 1.3, D / 2, lit); win(2.4, 1.7, 1.5, 1.3, D / 2, lit); win(-0.6, 1.7, 0.9, 1.5, D / 2, lit);
        b.box(-0.3, 1.1, D / 2 + 0.02, 1.0, 2.1, 0.1, s.timber || C.timber);
        b.base(-0.3, 0, D / 2 + 0.9, 3.0, 0.2, 1.8, C.paver2);
        [-1.3, 0.7].forEach(px => b.base(px, 0, D / 2 + 1.5, 0.14, 2.5, 0.14, C.timber, { cast: true }));
        b.hip(-0.3, 2.5, D / 2 + 0.9, 3.4, 0.75, 2.1, 0.9, s.roof, { cast: true });
        // carport on the right
        b.push(); b.T(W / 2 + 2.6, 0, 0.5);
        [[-2.2, 2.6], [2.2, 2.6], [-2.2, -2.6], [2.2, -2.6]].forEach(([px, pz]) => b.base(px, 0, pz, 0.16, 2.5, 0.16, C.timber, { cast: true }));
        b.shed(0, 2.5, 0, 5.2, 0.7, 0.4, 6.0, s.roof, { cast: true }); b.base(0, 0, -2.4, 4.4, 2.0, 0.2, [0.22, 0.17, 0.13]); b.pop();
        boxc(s.x - D / 2 - 0.2, s.z - W / 2 - 5.8, s.x + D / 2 + 0.2, s.z - W / 2 - 0.2);
      } else if (s.type === 'bungalow') {
        b.push(); b.T(0, Hw, 0); b.RY(Math.PI / 2); b.hip(0, 0, 0, D + 1.4, 2.6, W + 1.4, W - 3.0, s.roof, { cast: true }); b.pop();
        b.base(W * 0.3, Hw + 0.9, -D * 0.2, 0.7, 2.0, 0.7, C.brick, { cast: true });
        win(-3.4, 1.6, 1.3, 1.2, D / 2, lit); win(-0.9, 1.6, 1.3, 1.2, D / 2, lit); win(3.2, 1.6, 1.8, 1.2, D / 2, lit);
        b.box(1.4, 1.05, D / 2 + 0.02, 1.0, 2.1, 0.1, C.white);
      } else if (s.type === 'timber') {
        b.base(0, Hw, 0, W - 0.2, 2.6, D - 0.2, s.timber || C.timber, { cast: true });
        b.push(); b.T(0, Hw + 2.6, 0); b.RY(Math.PI / 2); b.hip(0, 0, 0, D + 1.4, 3.0, W + 0.8, W - 3.2, s.roof, { cast: true }); b.pop();
        win(-2.6, 1.7, 1.2, 1.3, D / 2, lit); win(2.0, 1.7, 1.6, 1.3, D / 2, lit); win(-2.4, Hw + 1.3, 1.1, 1.2, D / 2 - 0.1, lit); win(1.8, Hw + 1.3, 1.1, 1.2, D / 2 - 0.1, lit);
        b.box(-0.2, 1.05, D / 2 + 0.02, 1.0, 2.1, 0.1, C.timber);
        b.base(-0.2, 0, D / 2 + 0.7, 2.4, 0.2, 1.4, C.paver2);
      }
      b.pop();
      boxc(s.x - D / 2, s.z - W / 2, s.x + D / 2, s.z + W / 2);
    }

    function westSide() {
      const specs = [
        { z: 56, type: 'hip', w: 9.5, d: 8, h: 3.4, wall: C.cream, roof: C.roofBrown, fence: 'wood' },
        { z: 37, type: 'gable', w: 8.2, d: 9.5, h: 5.2, wall: C.white, roof: C.roofDark, fence: 'brick' },
        { z: 18, type: 'bungalow', w: 11, d: 7, h: 2.9, wall: C.white, roof: C.roofDark, fence: 'whitebase' },
        { z: -1, type: 'timber', w: 9.5, d: 8, h: 3.0, wall: C.cream, roof: C.roofRed, fence: 'wood', timber: C.timber },
        { z: -21, type: 'gable', w: 8.6, d: 9, h: 5.0, wall: C.beige, roof: C.roofBrown, fence: 'whitebase' },
        { z: -41, type: 'hip', w: 10, d: 8, h: 3.4, wall: C.white, roof: C.roofDark, fence: 'brick' },
        { z: -61, type: 'bungalow', w: 10, d: 7, h: 2.9, wall: C.beige, roof: C.roofBrown, fence: 'wood' }
      ];
      specs.forEach((s, i) => {
        const xf = -11.6 + (R() - 0.5) * 1.6;
        house({ x: xf - s.d / 2, z: s.z, w: s.w, d: s.d, h: s.h, type: s.type, wall: s.wall, roof: s.roof, timber: s.timber });
        const z0 = s.z - 9, z1 = s.z + 9;
        if (s.fence === 'wood') fence(-6.5, z0, z1, { color: [0.24, 0.17, 0.13], h: 1.15, spacing: 0.2 });
        else if (s.fence === 'brick') fence(-6.5, z0, z1, { color: C.white, h: 1.0, pillars: 4.5 });
        else fence(-6.5, z0, z1, { color: C.white, h: 0.95, brickBase: true });
        // garden: path, shrubs, a thuja or two
        flat(-9.2, s.z + (s.type === 'bungalow' ? 1.4 : -0.2), 5.6, 1.4, 0.02, C.paver2);
        thuja(-8.4, s.z + 3.6 + R() * 1.5, 0.8 + R() * 0.5); bush(-7.4, s.z - 3.4 + R() * 2, 1 + R() * 0.5); bush(-8.0, s.z + 6 + R(), 0.9);
        if (i % 2 === 0) pine(-17 + R() * 3, s.z + R() * 4 - 2, 17 + R() * 6);
        // blue recycling bin, mailbox
        b.base(-6.9, 0, s.z + 2.2, 0.55, 0.95, 0.55, [0.15, 0.32, 0.72], { cast: true }); circle(-6.9, s.z + 2.2, 0.35);
        b.base(-6.65, 0.85, s.z - 1.6, 0.34, 0.3, 0.2, C.white);
      });
    }

    /* ---------- cars ---------- */
    function car(x, z, ry, body, kind) {
      const L = kind === 'van' ? 5.0 : 4.25, hh = kind === 'van' ? 1.2 : 0.68;
      b.push(); b.T(x, 0, z); b.RY(ry);
      b.base(0, 0.3, 0, 1.82, 0.62, L, body, { cast: true });
      b.base(0, 0.92, kind === 'van' ? 0.1 : -0.2, 1.66, hh, L * (kind === 'van' ? 0.88 : 0.56), body, { cast: true });
      b.base(0, 1.0, kind === 'van' ? 0.1 : -0.2, 1.69, hh * 0.62, L * (kind === 'van' ? 0.8 : 0.5), C.glass);
      [[-0.92, 1.3], [0.92, 1.3], [-0.92, -1.3], [0.92, -1.3]].forEach(([wx, wz]) => { b.push(); b.T(wx, 0.34, wz * (L / 4.25)); b.RZ(Math.PI / 2); b.cyl(0, -0.12, 0, 0.34, 0.34, 0.24, 8, C.black); b.pop(); });
      b.box(-0.6, 0.55, L / 2, 0.32, 0.14, 0.06, [1, 1, 0.9], { em: glow * 0.6 }); b.box(0.6, 0.55, L / 2, 0.32, 0.14, 0.06, [1, 1, 0.9], { em: glow * 0.6 });
      b.box(-0.6, 0.6, -L / 2, 0.3, 0.12, 0.06, [0.8, 0.1, 0.1], { em: glow * 0.5 }); b.box(0.6, 0.6, -L / 2, 0.3, 0.12, 0.06, [0.8, 0.1, 0.1], { em: glow * 0.5 });
      b.pop();
      boxc(x - 1.0, z - L / 2, x + 1.0, z + L / 2);
    }
    function cars() {
      const list = [[44, 0, [0.50, 0.46, 0.43], 'suv'], [38.5, Math.PI, [0.72, 0.74, 0.78], 'suv'], [30, 0, [0.9, 0.9, 0.92], 'van'], [8, Math.PI, [0.35, 0.28, 0.24], 'suv'],
        [-9, 0, [0.62, 0.64, 0.68], 'suv'], [-26, Math.PI, [0.18, 0.2, 0.3], 'suv'], [-33, 0, [0.6, 0.12, 0.12], 'suv'], [-52, Math.PI, [0.85, 0.85, 0.86], 'suv'], [60, Math.PI, [0.25, 0.3, 0.26], 'suv']];
      list.forEach(([z, ry, c, k]) => car(-2.25, z + (R() - 0.5), ry, c, k));
    }

    /* ---------- lamps ---------- */
    function lamp(x, z, face) {
      b.tube([x, 0, z], [x, 5.7, z], 0.1, 0.065, 6, C.pole, { cast: true });
      b.tube([x, 5.7, z], [x + face * 0.9, 6.15, z], 0.055, 0.05, 5, C.pole, { cast: true });
      b.tube([x + face * 0.9, 6.15, z], [x + face * 1.55, 6.0, z], 0.05, 0.05, 5, C.pole, { cast: true });
      b.box(x + face * 1.65, 5.97, z, 0.8, 0.14, 0.3, C.dark, { cast: true });
      b.box(x + face * 1.65, 5.88, z, 0.62, 0.05, 0.22, [1, 0.95, 0.8], { em: 0.25 + glow * 0.75 });
      lamps.push({ x: x + face * 1.65, y: 5.85, z });
      circle(x, z, 0.28);
    }

    /* ---------- park, buildings, props ---------- */
    function hedges() {
      const gaps = [[-38, 3.6], [4, 3.6], [44, 3.6]];
      let z = -76;
      while (z < 76) {
        let end = z + 8; const gap = gaps.find(g => g[0] > z - 1 && g[0] < end + 2);
        if (gap) end = Math.min(end, gap[0] - gap[1] / 2);
        if (end - z > 0.5) {
          b.base(4.0, 0, (z + end) / 2, 0.95, 0.9, end - z, jit(R, C.hedge, 0.1), { cast: true });
          for (let q = z; q < end; q += 1.6) b.blob(4.0, 0.95, q + 0.8, 0.6, 0.3, 0.9, jit(R, C.hedge, 0.12), { rnd: R, seg: 5, rings: 3 });
          boxc(3.5, z, 4.5, end);
        }
        z = gap ? gap[0] + gap[1] / 2 : end;
      }
    }
    function scaffoldBlock(cx, cz, wz, dx, h) {
      b.base(cx, 0, cz, dx, h, wz, C.cream, { cast: true });
      b.base(cx, h, cz, dx + 0.4, 0.4, wz + 0.4, [0.55, 0.55, 0.58], { cast: true });
      const xf = cx - dx / 2;
      for (let f = 0; f < 4; f++) for (let c2 = -5; c2 <= 5; c2++) {
        const zz = cz + c2 * (wz / 11), yy = 1.7 + f * 2.8, lit = glow > 0.1 && ((c2 + f) % 3 === 0);
        b.box(xf - 0.03, yy, zz, 0.06, 1.3, 1.1, lit ? WARM : [0.18, 0.2, 0.26], { em: lit ? glow : 0 });
      }
      // scaffolding in front of the west face: poles, blue rails, red planks, ladders
      const sx = xf - 1.3;
      for (let z = cz - wz / 2; z <= cz + wz / 2 + 0.01; z += 2.6) { b.tube([sx, 0, z], [sx, h + 1.0, z], 0.045, 0.045, 4, C.steel, { cast: true }); b.tube([xf - 0.1, 0, z], [xf - 0.1, h + 1.0, z], 0.04, 0.04, 4, C.steel); }
      for (let f = 0; f < 5; f++) {
        const yy = 0.4 + f * 2.8;
        b.box(sx, yy + 0.05, cz, 0.04, 0.14, wz, C.blue); b.box(sx + 0.6, yy, cz, 1.4, 0.07, wz, C.red, { cast: f < 4 }); b.box(sx, yy + 1.0, cz, 0.04, 0.05, wz, C.steel);
      }
      boxc(sx - 0.2, cz - wz / 2, cx + dx / 2, cz + wz / 2);
    }
    function trailer(x, z) {
      b.push(); b.T(x, 0, z); b.RY(0.25);
      b.base(0, 0.5, 0, 2.3, 2.2, 5.4, [0.92, 0.92, 0.92], { cast: true }); b.base(0, 0.35, 0, 2.2, 0.2, 5.2, [0.55, 0.14, 0.12]);
      b.box(1.16, 1.6, 0.4, 0.04, 0.7, 1.0, C.glass);
      for (let i = 0; i < 9; i++) { b.push(); b.T(1.18, 1.0 + R() * 1.1, -1.8 + R() * 3.4); b.RX((R() - 0.5) * 1.2); b.box(0, 0, 0, 0.03, 0.08 + R() * 0.1, 0.4 + R() * 0.6, R() > 0.5 ? [0.1, 0.1, 0.12] : [0.35, 0.35, 0.4]); b.pop(); }
      [[-1.2, 0.8], [1.2, 0.8]].forEach(([wx, wz]) => { b.push(); b.T(wx, 0.38, wz); b.RZ(Math.PI / 2); b.cyl(0, -0.12, 0, 0.38, 0.38, 0.22, 8, C.black); b.pop(); });
      b.pop(); circle(x, z, 2.6); circle(x, z + 1.5, 1.6); circle(x, z - 1.5, 1.6);
    }
    function bench(x, z, ry) {
      b.push(); b.T(x, 0, z); b.RY(ry);
      b.base(0, 0.45, 0, 1.7, 0.08, 0.5, C.wood, { cast: true }); b.base(0, 0.62, -0.22, 1.7, 0.45, 0.07, C.wood, { cast: true });
      [-0.75, 0.75].forEach(px => b.base(px, 0, 0, 0.08, 0.46, 0.46, C.metal, { cast: true }));
      b.pop(); circle(x, z, 0.8);
    }
    function barrier(z) {
      for (let i = -3; i <= 3; i++) b.base(i * 1.0, 0, z, 0.95, 0.35, 0.12, i % 2 ? C.red : C.white, { cast: true });
      for (let i = -3; i <= 3; i++) b.base(i * 1.0, 0.7, z, 0.95, 0.3, 0.12, i % 2 ? C.white : C.red, { cast: true });
      [-3.4, 3.4].forEach(px => b.base(px, 0, z, 0.08, 1.2, 0.08, C.steel));
      boxc(-3.5, z - 0.3, 3.5, z + 0.3);
    }

    /* ---------- compose ---------- */
    ground();
    westSide();
    cars();
    hedges();
    for (let z = -70; z <= 70; z += 28) { lamp(-5.7, z + 8, 1); lamp(3.9, z - 6, -1); }

    // tall bare street trees along the west pavement (like the reference), tall pines and oaks in the park
    [64, 46, 27, 8, -12, -31, -50, -68].forEach(z => bareTree(-4.9, z + (R() - 0.5) * 3, 17 + R() * 6));
    for (let i = 0; i < 34; i++) {
      const z = R.range(-72, 72), x = R.range(7, 30);
      if (Math.abs(x - (8.2 + 3.2 * Math.sin(z / 17))) < 2.2) continue; if (Math.abs(x - 33) < 10 && Math.abs(z + 12) < 16) continue; if (Math.abs(x - 9) < 3.6 && Math.abs(z + 14) < 5) continue;
      R() > 0.35 ? bareTree(x, z, 15 + R() * 8) : pine(x, z, 17 + R() * 7);
    }
    for (let i = 0; i < 10; i++) pine(R.range(32, 42), R.range(-72, 72), 18 + R() * 8);
    scaffoldBlock(34, -12, 26, 14, 11.2);
    scaffoldBlock(36, 46, 22, 14, 11.2);
    trailer(10.4, -13);
    bench(10.2, 12, -Math.PI / 2); bench(9.6, -30, -Math.PI / 2); bench(7.2, 52, -Math.PI / 2);
    barrier(-74); barrier(74);
    // far trees close the street at both ends
    for (let i = -2; i <= 2; i++) { pine(i * 8 + R() * 2, -100 + R() * 4, 18 + R() * 4); pine(i * 8 + 3 + R() * 2, 100 + R() * 4, 18 + R() * 4); }
    for (let i = 0; i < 12; i++) { pine(-26 + R() * 6, -70 + i * 13, 18 + R() * 7); }

    return { mesh: b, circles, boxes, lamps, hearts, spawn: { x: -1.2, z: 66 }, bounds: { x0: -21, x1: 44, z0: -72, z1: 72 } };
  }

  window.WorldScene = { build };
})();
