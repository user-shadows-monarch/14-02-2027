/* Tiny 3D toolkit (no libraries): 4x4 matrices, a low-poly mesh builder with flat shading and planar-shadow
   casters, a seeded random generator and shader helpers. Used by the walkable world (world.js). */
(function () {
  'use strict';

  /* ---------- matrices (column-major, like WebGL) ---------- */
  const M4 = {
    ident() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
    mul(a, b) {
      const o = new Float32Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; }
      return o;
    },
    persp(fovy, asp, n, f) {
      const t = 1 / Math.tan(fovy / 2), o = new Float32Array(16);
      o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f);
      return o;
    },
    look(e, c, u) {
      let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2], l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
      let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx; l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
      const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
        -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]);
    },
    trans(x, y, z) { const o = M4.ident(); o[12] = x; o[13] = y; o[14] = z; return o; },
    scale(x, y, z) { const o = M4.ident(); o[0] = x; o[5] = y; o[10] = z; return o; },
    rotY(a) { const c = Math.cos(a), s = Math.sin(a), o = M4.ident(); o[0] = c; o[2] = -s; o[8] = s; o[10] = c; return o; },
    rotX(a) { const c = Math.cos(a), s = Math.sin(a), o = M4.ident(); o[5] = c; o[6] = s; o[9] = -s; o[10] = c; return o; },
    rotZ(a) { const c = Math.cos(a), s = Math.sin(a), o = M4.ident(); o[0] = c; o[1] = s; o[4] = -s; o[5] = c; return o; }
  };

  /* ---------- seeded random ---------- */
  function rng(seed) {
    let s = seed >>> 0 || 1;
    const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    r.range = (a, b) => a + (b - a) * r();
    r.pick = arr => arr[Math.floor(r() * arr.length) % arr.length];
    return r;
  }

  /* ---------- growable typed buffer ---------- */
  class Buf {
    constructor(T, cap) { this.T = T; this.a = new T(cap || 4096); this.n = 0; }
    grow(extra) { if (this.n + extra > this.a.length) { const b = new this.T(Math.max(this.a.length * 2, this.n + extra)); b.set(this.a); this.a = b; } }
    p3(x, y, z) { this.grow(3); const a = this.a; a[this.n++] = x; a[this.n++] = y; a[this.n++] = z; }
    p4(x, y, z, w) { this.grow(4); const a = this.a; a[this.n++] = x; a[this.n++] = y; a[this.n++] = z; a[this.n++] = w; }
    view() { return this.a.subarray(0, this.n); }
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------- mesh builder (flat-shaded triangles, vertex colours, emissive in alpha) ---------- */
  class MeshBuilder {
    constructor() {
      this.pos = new Buf(Float32Array, 1 << 16); this.nrm = new Buf(Int8Array, 1 << 16); this.col = new Buf(Uint8Array, 1 << 16);
      this.cas = new Buf(Float32Array, 1 << 15);
      this.m = M4.ident(); this.stack = [];
    }
    get vertCount() { return this.pos.n / 3; }
    push() { this.stack.push(this.m); }
    pop() { this.m = this.stack.pop(); }
    T(x, y, z) { this.m = M4.mul(this.m, M4.trans(x, y, z)); }
    RY(a) { this.m = M4.mul(this.m, M4.rotY(a)); }
    RX(a) { this.m = M4.mul(this.m, M4.rotX(a)); }
    RZ(a) { this.m = M4.mul(this.m, M4.rotZ(a)); }
    S(x, y, z) { this.m = M4.mul(this.m, M4.scale(x, y == null ? x : y, z == null ? x : z)); }
    pt(x, y, z) { const m = this.m; return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]; }

    /* one triangle. ref = a point inside the shape: the normal is flipped to face away from it. */
    tri(p0, p1, p2, c, em, ref, cast) {
      const a = this.pt(p0[0], p0[1], p0[2]), b = this.pt(p1[0], p1[1], p1[2]), d = this.pt(p2[0], p2[1], p2[2]);
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz); if (l < 1e-9) return;
      nx /= l; ny /= l; nz /= l;
      if (ref) {
        const r = this.pt(ref[0], ref[1], ref[2]);
        if (nx * ((a[0] + b[0] + d[0]) / 3 - r[0]) + ny * ((a[1] + b[1] + d[1]) / 3 - r[1]) + nz * ((a[2] + b[2] + d[2]) / 3 - r[2]) < 0) { nx = -nx; ny = -ny; nz = -nz; }
      }
      const ix = Math.round(nx * 127), iy = Math.round(ny * 127), iz = Math.round(nz * 127);
      const cr = Math.round(clamp(c[0], 0, 1) * 255), cg = Math.round(clamp(c[1], 0, 1) * 255), cb = Math.round(clamp(c[2], 0, 1) * 255), ce = Math.round(clamp(em || 0, 0, 1) * 255);
      [a, b, d].forEach(q => { this.pos.p3(q[0], q[1], q[2]); this.nrm.p3(ix, iy, iz); this.col.p4(cr, cg, cb, ce); });
      if (cast) { this.cas.p3(a[0], a[1], a[2]); this.cas.p3(b[0], b[1], b[2]); this.cas.p3(d[0], d[1], d[2]); }
    }
    quad(p0, p1, p2, p3, c, em, ref, cast) { this.tri(p0, p1, p2, c, em, ref, cast); this.tri(p0, p2, p3, c, em, ref, cast); }

    box(cx, cy, cz, w, h, d, c, o) {
      o = o || {}; const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2, ref = [cx, cy, cz];
      const q = (a, b, cc, dd) => this.quad(a, b, cc, dd, c, o.em, ref, o.cast);
      q([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
      q([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
      q([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]);
      q([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
      if (!o.noTop) q([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]);
      if (!o.noBottom) q([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
    }
    /* box standing on y=cy */
    base(cx, cy, cz, w, h, d, c, o) { this.box(cx, cy + h / 2, cz, w, h, d, c, o); }

    /* gable roof: base rectangle w (x) by d (z) at height cy, ridge along z */
    gable(cx, cy, cz, w, h, d, c, endC, o) {
      o = o || {}; const hw = w / 2, hd = d / 2, ref = [cx, cy + h / 3, cz];
      this.quad([cx - hw, cy, cz + hd], [cx, cy + h, cz + hd], [cx, cy + h, cz - hd], [cx - hw, cy, cz - hd], c, o.em, ref, o.cast);
      this.quad([cx, cy + h, cz + hd], [cx + hw, cy, cz + hd], [cx + hw, cy, cz - hd], [cx, cy + h, cz - hd], c, o.em, ref, o.cast);
      this.tri([cx - hw, cy, cz + hd], [cx + hw, cy, cz + hd], [cx, cy + h, cz + hd], endC || c, o.em, ref, o.cast);
      this.tri([cx + hw, cy, cz - hd], [cx - hw, cy, cz - hd], [cx, cy + h, cz - hd], endC || c, o.em, ref, o.cast);
      this.quad([cx - hw, cy, cz - hd], [cx + hw, cy, cz - hd], [cx + hw, cy, cz + hd], [cx - hw, cy, cz + hd], [0.2, 0.2, 0.2], 0, ref, false);
    }
    /* hipped roof: four slopes, ridge of length rl along z */
    hip(cx, cy, cz, w, h, d, rl, c, o) {
      o = o || {}; const hw = w / 2, hd = d / 2, r = rl / 2, ref = [cx, cy + h / 3, cz];
      const A = [cx - hw, cy, cz + hd], B = [cx + hw, cy, cz + hd], C = [cx + hw, cy, cz - hd], D = [cx - hw, cy, cz - hd];
      const E = [cx, cy + h, cz + r], F = [cx, cy + h, cz - r];
      this.quad(A, B, E, E, c, o.em, ref, o.cast);         // front hip (triangle)
      this.quad(C, D, F, F, c, o.em, ref, o.cast);         // back hip
      this.quad(D, A, E, F, c, o.em, ref, o.cast);         // left slope
      this.quad(B, C, F, E, c, o.em, ref, o.cast);         // right slope
    }
    /* shed roof: slopes from high edge (z+) to low edge (z-) */
    shed(cx, cy, cz, w, hHigh, hLow, d, c, o) {
      o = o || {}; const hw = w / 2, hd = d / 2, ref = [cx, cy + 0.1, cz];
      this.quad([cx - hw, cy + hHigh, cz - hd], [cx + hw, cy + hHigh, cz - hd], [cx + hw, cy + hLow, cz + hd], [cx - hw, cy + hLow, cz + hd], c, o.em, ref, o.cast);
      this.quad([cx - hw, cy, cz + hd], [cx + hw, cy, cz + hd], [cx + hw, cy + hLow, cz + hd], [cx - hw, cy + hLow, cz + hd], c, o.em, ref, o.cast);
    }
    cyl(cx, cy, cz, r0, r1, h, seg, c, o) {
      o = o || {}; seg = seg || 6; const ref = [cx, cy + h / 2, cz];
      for (let i = 0; i < seg; i++) {
        const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
        const p0 = [cx + Math.cos(a0) * r0, cy, cz + Math.sin(a0) * r0], p1 = [cx + Math.cos(a1) * r0, cy, cz + Math.sin(a1) * r0];
        const p2 = [cx + Math.cos(a1) * r1, cy + h, cz + Math.sin(a1) * r1], p3 = [cx + Math.cos(a0) * r1, cy + h, cz + Math.sin(a0) * r1];
        this.quad(p0, p1, p2, p3, c, o.em, ref, o.cast);
        if (!o.noTop) this.tri([cx, cy + h, cz], p3, p2, c, o.em, ref, o.cast);
      }
    }
    cone(cx, cy, cz, r, h, seg, c, o) { this.cyl(cx, cy, cz, r, 0.001, h, seg, c, o); }
    /* oriented prism between two points (branches, poles, rails) */
    tube(a, b, r0, r1, seg, c, o) {
      o = o || {}; seg = seg || 4;
      let dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2]; const l = Math.hypot(dx, dy, dz); if (l < 1e-6) return;
      dx /= l; dy /= l; dz /= l;
      let ux = 0, uy = 1, uz = 0; if (Math.abs(dy) > 0.95) { ux = 1; uy = 0; }
      let px = dy * uz - dz * uy, py = dz * ux - dx * uz, pz = dx * uy - dy * ux; const pl = Math.hypot(px, py, pz); px /= pl; py /= pl; pz /= pl;
      const qx = dy * pz - dz * py, qy = dz * px - dx * pz, qz = dx * py - dy * px;
      const ring = (p, r) => { const o2 = []; for (let i = 0; i < seg; i++) { const t = i / seg * Math.PI * 2, cs = Math.cos(t) * r, sn = Math.sin(t) * r; o2.push([p[0] + px * cs + qx * sn, p[1] + py * cs + qy * sn, p[2] + pz * cs + qz * sn]); } return o2; };
      const A = ring(a, r0), B = ring(b, r1), ref = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      for (let i = 0; i < seg; i++) { const j = (i + 1) % seg; this.quad(A[i], A[j], B[j], B[i], c, o.em, ref, o.cast); }
    }
    /* lumpy ellipsoid (foliage, shrubs, heads) */
    blob(cx, cy, cz, rx, ry, rz, c, o) {
      o = o || {}; const seg = o.seg || 7, rings = o.rings || 4, jit = o.jit == null ? 0.12 : o.jit, R = o.rnd || Math.random;
      const grid = [];
      for (let i = 0; i <= rings; i++) {
        const v = i / rings, phi = v * Math.PI, row = [];
        for (let j = 0; j < seg; j++) {
          const th = j / seg * Math.PI * 2, k = (i === 0 || i === rings) ? 1 : 1 + (R() - 0.5) * 2 * jit;
          row.push([cx + Math.sin(phi) * Math.cos(th) * rx * k, cy + Math.cos(phi) * ry * k, cz + Math.sin(phi) * Math.sin(th) * rz * k]);
        }
        grid.push(row);
      }
      const ref = [cx, cy, cz];
      for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
        const j2 = (j + 1) % seg;
        this.tri(grid[i][j], grid[i][j2], grid[i + 1][j], c, o.em, ref, o.cast);
        this.tri(grid[i][j2], grid[i + 1][j2], grid[i + 1][j], c, o.em, ref, o.cast);
      }
    }
    /* upload-ready chunks (<= 60k vertices each, whole triangles) */
    chunks() {
      const out = [], total = this.vertCount, per = 59997;
      for (let s = 0; s < total; s += per) {
        const e = Math.min(total, s + per);
        out.push({ pos: this.pos.view().subarray(s * 3, e * 3), nrm: this.nrm.view().subarray(s * 3, e * 3), col: this.col.view().subarray(s * 4, e * 4), count: e - s });
      }
      return out;
    }
  }

  /* ---------- shader helpers ---------- */
  function program(gl, vs, fs) {
    const mk = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    p.u = {}; p.a = {};
    const nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS), na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < nu; i++) { const n = gl.getActiveUniform(p, i).name; p.u[n] = gl.getUniformLocation(p, n); }
    for (let i = 0; i < na; i++) { const n = gl.getActiveAttrib(p, i).name; p.a[n] = gl.getAttribLocation(p, n); }
    return p;
  }

  window.GL3D = { M4, MeshBuilder, rng, program, clamp };
})();
