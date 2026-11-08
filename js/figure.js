/* Exercise figures: a cartoon person drawn as SVG from the key poses in poses.js (made by tools/poses.py), moving
   between them. Fig.html() writes a placeholder, Fig.mount() turns placeholders into drawings and starts the animation. */
(function () {
  "use strict";
  const DATA = window.POSES || { seg: {}, ex: {} };
  const SEG = DATA.seg;
  const RAD = Math.PI / 180;
  const OL = 0.0072;
  const REDUCE = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  // ------------------------------------------------------------ geometry
  function add(p, a, l) { return [p[0] + Math.cos(a * RAD) * l, p[1] + Math.sin(a * RAD) * l]; }
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function ang(a, b) { return Math.atan2(b[1] - a[1], b[0] - a[0]) / RAD; }
  function into(x, lo) { return x - 360 * Math.ceil((x - lo) / 360 - 1); } // x moved into (lo, lo + 360]
  function wrap(a) { return into(a, -180); }

  function fk(f, view) {
    const side = view === "side";
    const H = f.r, S = add(H, f.t, SEG.torso), N = add(S, f.h, SEG.neck);
    const j = { H: H, S: S, N: N, C: add(N, f.h, SEG.head) };
    if (side) { j.S1 = j.S2 = S; j.H1 = j.H2 = H; }
    else {
      j.S1 = add(S, f.t + 90, SEG.shoulder); j.S2 = add(S, f.t - 90, SEG.shoulder);
      j.H1 = add(H, f.t + 90, SEG.hip); j.H2 = add(H, f.t - 90, SEG.hip);
    }
    for (let i = 1; i <= 2; i++) {
      const k = i === 2 ? f.k : 1, a = f["a" + i], l = f["l" + i];
      j["E" + i] = add(j["S" + i], a[0], SEG.ua * k);
      j["W" + i] = add(j["E" + i], a[1], SEG.fa * k);
      j["K" + i] = add(j["H" + i], l[0], SEG.th);
      j["A" + i] = add(j["K" + i], l[1], SEG.sh);
      j["T" + i] = add(j["A" + i], l[2], side ? SEG.ft : SEG.footFront);
    }
    return j;
  }

  // Lowest point of the body, as the workbook grounds a figure.
  function lowest(j) {
    let lo = j.C[1] - SEG.head;
    for (const n in j) {
      if (n === "C" || n === "N") continue;
      const c = n[0];
      const r = c === "T" ? 0.02 : (c === "W" || c === "E" ? 0.026 : (c === "S" || c === "H" ? 0.0575 : 0.033)) + 0.013;
      lo = Math.min(lo, j[n][1] - r);
    }
    return lo;
  }

  // ------------------------------------------------------------ moving between poses
  // Angles are blended joint by joint, relative to the parent segment, inside each joint's natural range, so an arm
  // coming down from overhead swings forward and a knee never bends the wrong way on the way between two poses.
  function joints(f, view) {
    const side = view === "side", t = f.t;
    const o = { t: t, hd: wrap(f.h - t), b: f.b, k: f.k, r: f.r };
    for (let i = 1; i <= 2; i++) {
      const a = f["a" + i], l = f["l" + i];
      o["u" + i] = into(a[0] - t, side ? -290 : (i === 1 ? -405 : -315));
      o["e" + i] = into(a[1] - a[0], side ? -60 : -180);
      o["th" + i] = into(l[0] - t, side ? -330 : -360);
      o["kn" + i] = into(l[1] - l[0], side ? -300 : -180);
      o["ft" + i] = into(l[2] - l[1], side ? -90 : -180);
    }
    return o;
  }
  function blend(A, B, u, view) {
    const a = joints(A, view), b = joints(B, view), m = function (x, y) { return x + (y - x) * u; };
    const t = a.t + wrap(b.t - a.t) * u;
    const f = { t: t, h: t + m(a.hd, b.hd), b: m(a.b, b.b), k: m(a.k, b.k), r: [m(a.r[0], b.r[0]), m(a.r[1], b.r[1])] };
    for (let i = 1; i <= 2; i++) {
      const up = t + m(a["u" + i], b["u" + i]), th = t + m(a["th" + i], b["th" + i]), sh = th + m(a["kn" + i], b["kn" + i]);
      f["a" + i] = [up, up + m(a["e" + i], b["e" + i])];
      f["l" + i] = [th, sh, sh + m(a["ft" + i], b["ft" + i])];
    }
    return f;
  }

  // Bend the limb that ends at joint n so that joint lands on target.
  function reach(f, view, n, target) {
    const arm = n[0] === "W", i = +n[1], key = (arm ? "a" : "l") + i, j = fk(f, view);
    if (dist(j[n], target) < 0.004) return f; // already there: leave the limb exactly as drawn
    const B = j[(arm ? "S" : "H") + i];
    const L1 = arm ? SEG.ua * (i === 2 ? f.k : 1) : SEG.th, L2 = arm ? SEG.fa * (i === 2 ? f.k : 1) : SEG.sh;
    let P = target;
    if (n[0] === "T") P = add(target, f[key][2], -(view === "side" ? SEG.ft : SEG.footFront));
    const d = Math.min(Math.max(dist(B, P), Math.abs(L1 - L2) + 1e-6), L1 + L2 - 1e-6);
    const a = f[key], rel = wrap(a[1] - a[0]);
    const sign = Math.abs(rel) > 2 ? (rel > 0 ? 1 : -1) : (arm ? 1 : -1);
    const al = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)))) / RAD;
    const up = ang(B, P) - sign * al, E = add(B, up, L1), lo = ang(E, P);
    const g = Object.assign({}, f);
    g[key] = [up, lo].concat(a.slice(2));
    return g;
  }

  const PIN = ["H", "S", "C", "E1", "E2", "K1", "K2", "T1", "A1", "T2", "A2", "W1", "W2"];
  const LIMB = /^[WAT][12]$/;

  // The pose at the point u (0..1, already eased) of the move from key pose A to key pose B.
  function between(ex, A, B, u, hop) {
    const view = ex.v;
    let f = u <= 0 ? A : (u >= 1 ? B : blend(A, B, u, view));
    const shared = [];
    for (const n in A.c) if (B.c[n]) shared.push(n);
    if (shared.length && u > 0 && u < 1) {
      let pin = null;
      for (let q = 0; q < PIN.length; q++) {
        const n = PIN[q];
        if (shared.indexOf(n) >= 0 && dist(A.c[n], B.c[n]) < 0.02) { pin = n; break; }
      }
      const target = function (n) {
        const p = A.c[n], q = B.c[n], moving = dist(p, q) > 0.02 && !p[2];
        return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u + (moving ? 0.06 * Math.sin(Math.PI * u) : 0)];
      };
      if (pin) {
        const j = fk(f, view), tp = target(pin);
        f = Object.assign({}, f, { r: [f.r[0] + tp[0] - j[pin][0], f.r[1] + tp[1] - j[pin][1]] });
      }
      shared.forEach(function (n) {
        if (n !== pin && LIMB.test(n) && !(n[0] === "A" && shared.indexOf("T" + n[1]) >= 0)) f = reach(f, view, n, target(n));
      });
    }
    if (hop && u > 0 && u < 1) f = Object.assign({}, f, { r: [f.r[0], f.r[1] + hop * Math.sin(Math.PI * u)] });
    if (ex.floor) {
      // Keep to the floor level the two key poses rest at, so a move starts and ends exactly on them.
      const want = lowest(fk(A, view)) * (1 - u) + lowest(fk(B, view)) * u, lo = lowest(fk(f, view));
      if (lo < Math.min(want, 0) - 0.002) f = Object.assign({}, f, { r: [f.r[0], f.r[1] + Math.min(want, 0) - lo] });
      else if (!ex.air && !shared.length && Math.abs(lo - want) > 0.002) f = Object.assign({}, f, { r: [f.r[0], f.r[1] + want - lo] });
    }
    return f;
  }

  function ease(u) { return u * u * (3 - 2 * u); }

  function cycleLength(ex) {
    let s = 0;
    for (let i = 0; i < ex.seq.length; i++) s += ex.seq[i][1] + ex.go[i];
    return s;
  }

  // The pose and the label in force at time s (seconds) into the exercise's loop.
  function poseAt(ex, s) {
    const n = ex.seq.length, len = cycleLength(ex);
    let x = ((s % len) + len) % len;
    for (let i = 0; i < n; i++) {
      const here = ex.seq[i], next = ex.seq[(i + 1) % n];
      if (x < here[1]) return { f: ex.frames[here[0]], lab: ex.labels[here[0]] };
      x -= here[1];
      if (x < ex.go[i]) {
        const u = ease(x / ex.go[i]);
        return { f: between(ex, ex.frames[here[0]], ex.frames[next[0]], u, ex.hop), lab: ex.labels[(u < 0.5 ? here : next)[0]] };
      }
      x -= ex.go[i];
    }
    return { f: ex.frames[ex.seq[0][0]], lab: ex.labels[ex.seq[0][0]] };
  }

  // ------------------------------------------------------------ body shapes
  // Half-widths (front, back) along each segment, from the workbook's body.py, reshaped a little.
  const PROF = {
    torso: [[-0.17, 0.034, 0.044], [-0.07, 0.05, 0.068], [0.05, 0.053, 0.069], [0.2, 0.052, 0.055], [0.42, 0.05, 0.047],
      [0.62, 0.063, 0.053], [0.8, 0.068, 0.059], [0.93, 0.058, 0.059], [1.02, 0.042, 0.05], [1.09, 0.026, 0.034]],
    torsoF: [[-0.17, 0.072, 0.072], [-0.02, 0.095, 0.095], [0.2, 0.086, 0.086], [0.42, 0.078, 0.078], [0.66, 0.09, 0.09],
      [0.86, 0.106, 0.106], [0.96, 0.112, 0.112], [1.03, 0.1, 0.1], [1.08, 0.07, 0.07], [1.12, 0.036, 0.036]],
    thigh: [[-0.07, 0.046, 0.05], [0.0, 0.06, 0.07], [0.15, 0.063, 0.062], [0.4, 0.058, 0.049], [0.72, 0.047, 0.039],
      [0.92, 0.038, 0.033], [1.04, 0.035, 0.032], [1.1, 0.026, 0.026]],
    thighF: [[-0.1, 0.053, 0.053], [0.02, 0.063, 0.06], [0.4, 0.055, 0.051], [0.75, 0.043, 0.04], [0.95, 0.035, 0.033],
      [1.06, 0.032, 0.03]],
    shin: [[-0.06, 0.031, 0.031], [0.05, 0.032, 0.036], [0.24, 0.029, 0.052], [0.42, 0.027, 0.047], [0.7, 0.022, 0.031],
      [0.93, 0.02, 0.022], [1.04, 0.02, 0.021]],
    shinF: [[-0.06, 0.032, 0.032], [0.25, 0.038, 0.035], [0.5, 0.033, 0.031], [0.85, 0.023, 0.022], [1.04, 0.021, 0.021]],
    ua: [[-0.17, 0.012, 0.012], [-0.1, 0.035, 0.036], [0.0, 0.045, 0.046], [0.15, 0.041, 0.039], [0.5, 0.034, 0.032],
      [0.86, 0.026, 0.025], [1.05, 0.023, 0.023], [1.1, 0.018, 0.018]],
    fa: [[-0.05, 0.022, 0.022], [0.18, 0.029, 0.026], [0.55, 0.022, 0.02], [0.95, 0.016, 0.015], [1.03, 0.015, 0.014]],
    neck: [[-0.4, 0.031, 0.037], [0.5, 0.027, 0.03], [1.4, 0.027, 0.03]]
  };
  const SLEEVE = 0.42, LEG_HEM = 0.46, WAIST = 0.17;
  const SHOE = [[-0.04, -0.043], [-0.047, -0.012], [-0.036, 0.014], [-0.016, 0.028], [0.018, 0.028], [0.052, 0.013],
    [0.09, -0.005], [0.112, -0.022], [0.108, -0.037], [0.09, -0.044], [0.0, -0.045]];
  const HAND = [[-0.004, 0.016], [0.024, 0.021], [0.058, 0.02], [0.086, 0.013], [0.096, 0.0], [0.086, -0.013],
    [0.058, -0.02], [0.024, -0.021], [-0.004, -0.016]];

  function width(prof, u) {
    if (u <= prof[0][0]) return [prof[0][1], prof[0][2]];
    for (let i = 1; i < prof.length; i++) {
      const a = prof[i - 1], b = prof[i];
      if (u <= b[0]) {
        let g = (u - a[0]) / (b[0] - a[0]);
        g = 0.5 - 0.5 * Math.cos(Math.PI * g);
        return [a[1] + (b[1] - a[1]) * g, a[2] + (b[2] - a[2]) * g];
      }
    }
    const z = prof[prof.length - 1];
    return [z[1], z[2]];
  }

  function straight(P0, P1) {
    const dx = P1[0] - P0[0], dy = P1[1] - P0[1];
    return { pos: function (u) { return [P0[0] + dx * u, P0[1] + dy * u]; }, tan: function () { return [dx, dy]; } };
  }
  function bezier(P0, C, P1) {
    function tan(u) {
      u = Math.min(1, Math.max(0, u));
      return [2 * (1 - u) * (C[0] - P0[0]) + 2 * u * (P1[0] - C[0]), 2 * (1 - u) * (C[1] - P0[1]) + 2 * u * (P1[1] - C[1])];
    }
    function pos(u) {
      if (u < 0) { const t = tan(0); return [P0[0] + t[0] * u, P0[1] + t[1] * u]; }
      if (u > 1) { const t = tan(1); return [P1[0] + t[0] * (u - 1), P1[1] + t[1] * (u - 1)]; }
      return [(1 - u) * (1 - u) * P0[0] + 2 * u * (1 - u) * C[0] + u * u * P1[0], (1 - u) * (1 - u) * P0[1] + 2 * u * (1 - u) * C[1] + u * u * P1[1]];
    }
    return { pos: pos, tan: tan };
  }

  // Outline of a segment between u0 and u1 along a path. rot turns the path direction onto the segment's front side.
  function band(path, prof, rot, u0, u1, n) {
    n = n || 16;
    const a = rot * RAD, c = Math.cos(a), s = Math.sin(a), fr = [], bk = [];
    for (let k = 0; k <= n; k++) {
      const u = u0 + (u1 - u0) * k / n, p = path.pos(u), t = path.tan(u), L = Math.hypot(t[0], t[1]) || 1;
      const nx = (t[0] * c - t[1] * s) / L, ny = (t[0] * s + t[1] * c) / L, w = width(prof, u);
      fr.push([p[0] + nx * w[0], p[1] + ny * w[0]]);
      bk.push([p[0] - nx * w[1], p[1] - ny * w[1]]);
    }
    return fr.concat(bk.reverse());
  }
  function seg(path, prof, rot) { return band(path, prof, rot, prof[0][0], prof[prof.length - 1][0], 18); }
  // A line across the segment at u (a hem).
  function across(path, prof, rot, u) {
    const b = band(path, prof, rot, u, u, 1);
    return [b[0], b[3]];
  }

  function ellipse(c, angle, a, b, shift, n) {
    n = n || 26;
    shift = shift || [0, 0];
    const ca = Math.cos(angle * RAD), sa = Math.sin(angle * RAD), out = [];
    for (let k = 0; k < n; k++) {
      const t = 2 * Math.PI * k / n, x = a * Math.cos(t) + shift[0], y = b * Math.sin(t) + shift[1];
      out.push([c[0] + x * ca - y * sa, c[1] + x * sa + y * ca]);
    }
    return out;
  }
  function local(o, angle, pts) {
    const ca = Math.cos(angle * RAD), sa = Math.sin(angle * RAD);
    return pts.map(function (p) { return [o[0] + p[0] * ca - p[1] * sa, o[1] + p[0] * sa + p[1] * ca]; });
  }

  // A hand pressing down on the floor or furniture lies flat, fingers forward; otherwise it follows the forearm.
  function handPoly(W, faAng, side, tops) {
    if (side && Math.sin(faAng * RAD) < -0.5 && tops.some(function (y) { return W[1] - y < 0.07 && W[1] - y > -0.02; })) {
      return local([W[0] - 0.005, W[1] - 0.013], 0, HAND.map(function (p) { return [p[0] * 0.95, p[1] * 0.72]; }));
    }
    return local(W, faAng, HAND);
  }

  function torsoPath(j, f) {
    if (!f.b) return straight(j.H, j.S);
    const m = [(j.H[0] + j.S[0]) / 2, (j.H[1] + j.S[1]) / 2];
    return bezier(j.H, add(m, f.t + 90, 2 * f.b), j.S);
  }

  // ------------------------------------------------------------ drawing
  function d(poly) {
    let s = "M" + poly[0][0].toFixed(4) + " " + (-poly[0][1]).toFixed(4);
    for (let i = 1; i < poly.length; i++) s += "L" + poly[i][0].toFixed(4) + " " + (-poly[i][1]).toFixed(4);
    return s + "Z";
  }
  function line(a, b) { return "M" + a[0].toFixed(4) + " " + (-a[1]).toFixed(4) + "L" + b[0].toFixed(4) + " " + (-b[1]).toFixed(4); }
  function many(polys) { return polys.map(d).join(""); }

  function arm(j, i, far, side, tops) {
    const S = j["S" + i], E = j["E" + i], W = j["W" + i], up = straight(S, E), lo = straight(E, W);
    const all = [seg(up, PROF.ua, 90), seg(lo, PROF.fa, 90), handPoly(W, ang(E, W), side, tops)];
    const k = far ? "2" : "";
    return [["o", many(all)], ["sk" + k, many(all)], ["sh" + k, d(band(up, PROF.ua, 90, -0.14, SLEEVE))],
      ["hem", line.apply(null, across(up, PROF.ua, 90, SLEEVE))]];
  }
  function leg(j, i, front, far) {
    const H = j["H" + i], K = j["K" + i], A = j["A" + i], T = j["T" + i], th = straight(H, K), sh = straight(K, A);
    const pt = PROF.thigh, ps = PROF.shin, foot = local(A, ang(A, T), SHOE);
    const k = far ? "2" : "";
    return [["o", many([seg(th, pt, 90), seg(sh, ps, 90), foot])], ["sk" + k, many([seg(th, pt, 90), seg(sh, ps, 90)])],
      ["pt" + k, d(band(th, pt, 90, pt[0][0], LEG_HEM))], ["hem", line.apply(null, across(th, pt, 90, LEG_HEM))],
      ["shoe" + k, d(foot)]];
  }
  function head(j, f, view) {
    const C = j.C, h = f.h, front = h - 90, out = [];
    const neck = seg(straight(j.S, j.N), PROF.neck, -90);
    if (view === "side") {
      const skull = ellipse(C, h, 0.069, 0.058, [0.002, 0.004]);
      const jaw = ellipse(add(add(C, front, 0.024), h, -0.03), h, 0.031, 0.04);
      const nose = [add(add(C, front, 0.056), h, 0.0), add(add(C, front, 0.068), h, -0.015), add(add(C, front, 0.056), h, -0.021)];
      out.push(["neck", many([neck])], ["head", many([skull, jaw, nose])]);
      const hair = [];
      for (let k = 0; k <= 14; k++) hair.push(add(C, h - 30 + 165 * k / 14, 0.072));
      for (let k = 14; k >= 0; k--) {
        const a = h - 30 + 165 * k / 14, r = 0.072 - 0.03 * Math.sin(Math.PI * k / 14) - (k < 3 ? 0.01 * (3 - k) : 0);
        hair.push(add(C, a, r));
      }
      out.push(["hair", d(hair)]);
      out.push(["ear", d(ellipse(add(add(C, front, -0.012), h, -0.008), h, 0.021, 0.014))]);
      out.push(["eye", d(ellipse(add(add(C, front, 0.044), h, 0.006), h, 0.0095, 0.0062, null, 12))]);
      out.push(["brow", line(add(add(C, front, 0.034), h, 0.024), add(add(C, front, 0.058), h, 0.022))]);
      out.push(["brow", line(add(add(C, front, 0.046), h, -0.034), add(add(C, front, 0.062), h, -0.031))]);
    } else {
      const skull = ellipse(C, h, 0.07, 0.056, [0.003, 0]);
      out.push(["neck", many([neck])], ["head", d(skull)]);
      if (view === "back") out.push(["hair", d(ellipse(C, h, 0.068, 0.054, [0.008, 0]))]);
      else {
        const hair = [];
        for (let k = 0; k <= 16; k++) hair.push(add(C, h - 80 + 160 * k / 16, 0.073));
        for (let k = 16; k >= 0; k--) hair.push(add(C, h - 80 + 160 * k / 16, 0.073 - 0.035 * Math.sin(Math.PI * k / 16)));
        out.push(["hair", d(hair)]);
        [-1, 1].forEach(function (s) {
          out.push(["eye", d(ellipse(add(add(C, h - 90, s * 0.024), h, 0.004), h, 0.0075, 0.0075, null, 10))]);
          out.push(["brow", line(add(add(C, h - 90, s * 0.014), h, 0.02), add(add(C, h - 90, s * 0.036), h, 0.019))]);
        });
        out.push(["brow", line(add(add(C, h - 90, -0.014), h, -0.03), add(add(C, h - 90, 0.014), h, -0.03))]);
      }
    }
    return { outline: [neck].concat(view === "side" ? [ellipse(C, h, 0.069, 0.058, [0.002, 0.004]),
      ellipse(add(add(C, front, 0.024), h, -0.03), h, 0.031, 0.04),
      [add(add(C, front, 0.056), h, 0.0), add(add(C, front, 0.068), h, -0.015), add(add(C, front, 0.056), h, -0.021)]] :
      [ellipse(C, h, 0.07, 0.056, [0.003, 0])]), parts: out };
  }
  function body(j, f, view) {
    const path = torsoPath(j, f), torso = seg(path, PROF.torso, -90), hd = head(j, f, view);
    return [["o", many([torso].concat(hd.outline))], ["sh", d(torso)],
      ["pt", d(band(path, PROF.torso, -90, PROF.torso[0][0], WAIST))], ["hem", line.apply(null, across(path, PROF.torso, -90, WAIST))]].concat(hd.parts);
  }

  // Everything the person is made of, back to front, as [class, path] pairs. The list always has the same length for
  // a given view, so an animation only changes the paths.
  function figure(f, view, list) {
    const j = fk(f, view), side = view === "side";
    const tops = [0].concat((list || []).filter(function (p) { return p.k === "table" || p.k === "chair" || p.k === "block"; }).map(function (p) { return p.y; }));
    if (side) return arm(j, 2, true, true, tops).concat(leg(j, 2, false, true), body(j, f, view), leg(j, 1, false, false), arm(j, 1, false, true, tops));
    return facing(j, f, view, tops);
  }

  // Front and back views: legs, body and upper arms share one outline, so hips and shoulders join smoothly.
  // Forearms and hands are drawn on top with their own outline.
  function facing(j, f, view, tops) {
    const path = torsoPath(j, f), prof = PROF.torsoF, torso = seg(path, prof, -90), hd = head(j, f, view);
    const L = [1, 2].map(function (i) {
      const th = straight(j["H" + i], j["K" + i]);
      return { th: th, thigh: seg(th, PROF.thighF, 90), shin: seg(straight(j["K" + i], j["A" + i]), PROF.shinF, 90),
        foot: ellipse(j["A" + i], ang(j["A" + i], j["T" + i]), 0.042, 0.024, [0.022, 0]) };
    });
    const A = [1, 2].map(function (i) {
      const E = j["E" + i], W = j["W" + i], up = straight(j["S" + i], E);
      return { up: up, upper: seg(up, PROF.ua, 90), lower: [seg(straight(E, W), PROF.fa, 90), handPoly(W, ang(E, W), false, tops)] };
    });
    const hems = function (list) { return list.map(function (x) { return line.apply(null, x); }).join(""); };
    const out = [
      ["o", many([L[0].thigh, L[0].shin, L[0].foot, L[1].thigh, L[1].shin, L[1].foot, torso, A[0].upper, A[1].upper].concat(hd.outline))],
      ["sk", many([L[0].thigh, L[0].shin, L[1].thigh, L[1].shin])],
      ["pt", many([band(L[0].th, PROF.thighF, 90, -0.1, LEG_HEM), band(L[1].th, PROF.thighF, 90, -0.1, LEG_HEM)])],
      ["hem", hems([across(L[0].th, PROF.thighF, 90, LEG_HEM), across(L[1].th, PROF.thighF, 90, LEG_HEM)])],
      ["shoe", many([L[0].foot, L[1].foot])],
      ["sh", d(torso)],
      ["pt", d(band(path, prof, -90, prof[0][0], WAIST))],
      ["seam", line(add(j.H, f.t, -0.07), add(j.H, f.t, 0.03))],
      ["sk", many([A[0].upper, A[1].upper])],
      ["sh", many([band(A[0].up, PROF.ua, 90, -0.17, SLEEVE), band(A[1].up, PROF.ua, 90, -0.17, SLEEVE)])],
      ["hem", hems([across(path, prof, -90, WAIST), across(A[0].up, PROF.ua, 90, SLEEVE), across(A[1].up, PROF.ua, 90, SLEEVE)])]
    ];
    return out.concat(hd.parts, [["o", many(A[0].lower.concat(A[1].lower))], ["sk", many(A[0].lower.concat(A[1].lower))]]);
  }

  function props(list, j) {
    let s = "";
    (list || []).forEach(function (p) {
      if (p.k === "table") {
        s += '<path class="pr" d="' + d([[p.x0, p.y + 0.03], [p.x1, p.y + 0.03], [p.x1, p.y], [p.x0, p.y]]) + '"/>';
        [p.x0 + 0.025, p.x1 - 0.025].forEach(function (x) { s += '<path class="prl" d="' + line([x, p.y], [x, 0]) + '"/>'; });
      } else if (p.k === "chair") {
        const back = p.back === "left" ? p.x0 + 0.016 : p.back === "right" ? p.x1 - 0.016 : null;
        [p.x0 + 0.016, p.x1 - 0.016].forEach(function (x) { s += '<path class="prl" d="' + line([x, p.y], [x, 0]) + '"/>'; });
        if (back != null) s += '<path class="prl" d="' + line([back, p.y], [back, p.y + 0.25]) + '"/>' +
          '<path class="pr" d="' + d([[back - 0.014, p.y + 0.25], [back + 0.014, p.y + 0.25], [back + 0.014, p.y + 0.15], [back - 0.014, p.y + 0.15]]) + '"/>';
        s += '<path class="pr" d="' + d([[p.x0, p.y], [p.x1, p.y], [p.x1, p.y - 0.022], [p.x0, p.y - 0.022]]) + '"/>';
      } else if (p.k === "block") {
        s += '<path class="pr" d="' + d([[p.x0, p.y], [p.x1, p.y], [p.x1, 0], [p.x0, 0]]) + '"/>';
      } else if (p.k === "wall") {
        s += '<path class="wall" d="' + d([[p.x, p.y], [p.x + p.side * 0.05, p.y], [p.x + p.side * 0.05, 0], [p.x, 0]]) + '"/>';
        s += '<path class="prl2" d="' + line([p.x, 0], [p.x, p.y]) + '"/>';
      } else if (p.k === "door") {
        s += '<path class="pr" d="' + d([[p.x - 0.03, 1.05], [p.x + 0.03, 1.05], [p.x + 0.03, 0], [p.x - 0.03, 0]]) + '"/>';
      }
    });
    return s;
  }
  function towel(list, j) {
    const t = (list || []).filter(function (p) { return p.k === "towel"; })[0];
    if (!t) return "";
    const x = (t.at ? j[t.at][0] : 0) + t.dx;
    return d([[x - t.w / 2, 0.018], [x + t.w / 2, 0.018], [x + t.w / 2, 0], [x - t.w / 2, 0]]);
  }

  // ------------------------------------------------------------ framing
  function box(f, view, list) {
    const j = fk(f, view);
    let x0 = Infinity, x1 = -Infinity, y0 = 0, y1 = -Infinity;
    for (const n in j) {
      const r = n === "C" ? 0.085 : 0.075;
      x0 = Math.min(x0, j[n][0] - r); x1 = Math.max(x1, j[n][0] + r);
      y0 = Math.min(y0, j[n][1] - r); y1 = Math.max(y1, j[n][1] + r);
    }
    (list || []).forEach(function (p) {
      if (p.k === "table" || p.k === "chair" || p.k === "block") { x0 = Math.min(x0, p.x0); x1 = Math.max(x1, p.x1); y1 = Math.max(y1, p.y + (p.k === "chair" && p.back ? 0.26 : 0.04)); }
      if (p.k === "wall") { x0 = Math.min(x0, p.x - 0.06); x1 = Math.max(x1, p.x + 0.06); y1 = Math.max(y1, Math.min(p.y, 1.0)); }
      if (p.k === "door") { x0 = Math.min(x0, p.x - 0.04); x1 = Math.max(x1, p.x + 0.04); }
    });
    return [x0, y0, x1, y1];
  }
  function unite(a, b) { return a ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : b; }

  function frameAll(ex) {
    if (ex._box) return ex._box;
    let b = null;
    const p = ex.frames[ex.seq[0][0]].p;
    const len = cycleLength(ex);
    for (let k = 0; k < 48; k++) b = unite(b, box(poseAt(ex, len * k / 48).f, ex.v, p));
    ex.frames.forEach(function (f) { b = unite(b, box(f, ex.v, p)); });
    ex._box = b;
    return b;
  }

  function svgOpen(b, cls, floor) {
    const pad = 0.035, x = b[0] - pad, w = b[2] - b[0] + 2 * pad, top = -(b[3] + pad);
    const below = Math.max(-Math.min(b[1], 0), 0) + (floor ? 0.03 : pad), h = b[3] + pad + below;
    let s = '<svg class="' + cls + '" viewBox="' + x.toFixed(3) + " " + top.toFixed(3) + " " + w.toFixed(3) + " " + h.toFixed(3) + '" preserveAspectRatio="xMidYMax meet" aria-hidden="true">';
    if (floor) s += '<rect class="floor" x="' + x.toFixed(3) + '" y="0" width="' + w.toFixed(3) + '" height="' + below.toFixed(3) + '"/><path class="floorl" d="M' + x.toFixed(3) + ' 0H' + (x + w).toFixed(3) + '"/>';
    return s;
  }

  function staticSvg(ex, f, list, b, cls) {
    const j = fk(f, ex.v);
    let s = svgOpen(b, cls, ex.floor) + props(list, j);
    if (ex.floor) s += '<ellipse class="shadow" cx="' + j.H[0].toFixed(3) + '" cy="0" rx="0.2" ry="0.018"/>';
    const tw = towel(list, j);
    if (tw) s += '<path class="pr" d="' + tw + '"/>';
    s += '<g class="person">' + figure(f, ex.v, list).map(function (x) { return '<path class="' + x[0] + '" d="' + x[1] + '"/>'; }).join("") + "</g></svg>";
    return s;
  }

  // ------------------------------------------------------------ placing figures on the page
  const live = [];
  let raf = 0, last = 0;

  function stillFrame(ex) {
    if (ex.mode === "loop") return ex.frames[ex.still || 0];
    return ex.frames[0];
  }

  function stripHtml(ex) {
    const frames = ex.mode === "loop" ? uniqueSeq(ex) : ex.frames.map(function (f, i) { return i; });
    const boxes = frames.map(function (i) { const f = ex.frames[i]; return box(f, ex.v, f.p); });
    const y0 = Math.min.apply(null, boxes.map(function (b) { return b[1]; })), y1 = Math.max.apply(null, boxes.map(function (b) { return b[3]; }));
    return '<span class="figstrip">' + frames.map(function (i, n) {
      const b = [boxes[n][0], y0, boxes[n][2], y1], lab = (ex.labels || [])[i] || "";
      const w = b[2] - b[0] + 0.07;
      return '<span class="figcell" style="flex:' + w.toFixed(3) + ' 1 0">' + (lab ? '<span class="figlab' + (/^AVOID/.test(lab) ? " bad" : "") + '">' + esc(lab) + "</span>" : "") +
        staticSvg(ex, ex.frames[i], ex.frames[i].p, b, "figsvg") + "</span>";
    }).join("") + "</span>";
  }
  function uniqueSeq(ex) {
    const out = [];
    ex.seq.forEach(function (s) { if (out.indexOf(s[0]) < 0) out.push(s[0]); });
    return out;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function mountOne(el) {
    const key = el.getAttribute("data-fig"), ex = DATA.ex[key];
    el.setAttribute("data-done", "1");
    if (!ex) return;
    let mode = el.getAttribute("data-mode") || "anim";
    // No motion wanted (the phone's Reduce Motion): the workout screen shows one pose, other places all key poses.
    if (mode === "anim" && ex.mode === "loop" && REDUCE.matches) mode = el.getAttribute("data-ctx") === "session" ? "still" : "steps";
    if (mode === "anim" && ex.mode !== "loop") mode = ex.mode === "strip" ? "strip" : "still";
    if (mode === "strip" || (mode === "steps" && ex.frames.length > 1)) { el.innerHTML = stripHtml(ex); return; }
    if (mode === "steps") mode = "still";
    if (mode === "still") {
      const f = stillFrame(ex), list = ex.mode === "loop" ? ex.frames[ex.seq[0][0]].p : f.p;
      el.innerHTML = staticSvg(ex, f, list, box(f, ex.v, list), "figsvg");
      return;
    }
    const b = frameAll(ex), list = ex.frames[ex.seq[0][0]].p;
    el.innerHTML = '<span class="figlab" hidden></span>' + staticSvg(ex, ex.frames[ex.seq[0][0]], list, b, "figsvg");
    el._fig = { ex: ex, clock: 0, lab: el.firstChild, paths: el.querySelectorAll(".person path"), shadow: el.querySelector(".shadow"),
      towel: list.some(function (p) { return p.k === "towel"; }) ? el.querySelector("svg > path.pr:last-of-type") : null, labText: null };
    live.push(el);
    draw(el);
    if (!raf) { last = 0; raf = requestAnimationFrame(tick); }
  }

  function draw(el) {
    const st = el._fig, ex = st.ex, at = poseAt(ex, st.clock), parts = figure(at.f, ex.v, ex.frames[ex.seq[0][0]].p);
    for (let i = 0; i < parts.length && i < st.paths.length; i++) st.paths[i].setAttribute("d", parts[i][1]);
    const j = fk(at.f, ex.v);
    if (st.shadow) {
      const lift = Math.max(0, lowest(j));
      st.shadow.setAttribute("cx", j.H[0].toFixed(3));
      st.shadow.setAttribute("rx", (0.2 - lift * 0.5).toFixed(3));
      st.shadow.style.opacity = String(0.09 * Math.max(0.3, 1 - lift * 5));
    }
    if (st.towel) st.towel.setAttribute("d", towel(ex.frames[ex.seq[0][0]].p, j));
    const lab = at.lab && !/^\d+$/.test(at.lab) ? at.lab : "";
    if (lab !== st.labText) { st.labText = lab; st.lab.textContent = lab; st.lab.hidden = !lab; }
  }

  function tick(now) {
    raf = 0;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    for (let i = live.length - 1; i >= 0; i--) {
      const el = live[i];
      if (!el.isConnected) { live.splice(i, 1); continue; }
      if (Fig.playing(el)) { el._fig.clock += dt; draw(el); }
    }
    if (live.length) raf = requestAnimationFrame(tick);
  }

  const Fig = {
    // Placeholder markup. mode: "anim" (moves), "still" (one pose), "steps" (all key poses side by side).
    html: function (key, mode, ctx, cls) {
      return '<span class="fig' + (cls ? " " + cls : "") + '" data-fig="' + esc(key) + '" data-mode="' + (mode || "anim") + '"' + (ctx ? ' data-ctx="' + ctx + '"' : "") + "></span>";
    },
    mount: function (root) {
      (root || document).querySelectorAll(".fig[data-fig]:not([data-done])").forEach(mountOne);
    },
    // Whether a moving figure should move right now. The app replaces this to hold figures while a workout is paused.
    playing: function () { return true; },
    has: function (key) { return !!DATA.ex[key]; },
    // Whether the exercise is shown moving (so its key poses are worth showing side by side as well).
    moves: function (key) { const ex = DATA.ex[key]; return !!ex && ex.mode === "loop" && !REDUCE.matches; },
    _test: {
      fk: fk, poseAt: poseAt, between: between, lowest: lowest, blend: blend, cycleLength: cycleLength,
      // The drawing at s seconds into the loop, framed like the moving figure.
      svgAt: function (key, s) {
        const ex = DATA.ex[key];
        if (!ex || ex.mode !== "loop") return null;
        const at = poseAt(ex, s), list = ex.frames[ex.seq[0][0]].p;
        return { svg: staticSvg(ex, at.f, list, frameAll(ex), "figsvg"), lab: at.lab };
      }
    }
  };
  window.Fig = Fig;
})();
