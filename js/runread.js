/* Reads distance, time and pace from a MapMyRun screenshot, on the phone. The picture never leaves the phone. */
(function (root) {
  "use strict";
  const KM_TO_MI = 0.621371;

  function clock(h, m, s) { return (+h || 0) * 3600 + (+m) * 60 + (+s); }

  // Pure text parsing, tested in tests/tests.html. Layout assumptions come from memory of the app, so everything falls back to typing.
  function parse(raw) {
    const fixed = String(raw || "").replace(/[|]/g, " ").replace(/[’`]/g, "'");
    const lines = fixed.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    const out = { distanceMi: null, durationSec: null, paceSec: null, found: [] };

    function near(i, re) { // the label's own line, then the lines just above and below it
      const order = [i, i - 1, i + 1, i - 2, i + 2];
      for (let k = 0; k < order.length; k++) {
        const l = lines[order[k]];
        if (l == null) continue;
        const m = re.exec(l);
        if (m) return m;
      }
      return null;
    }

    // ---- pace
    let paceUnit = "mi", paceSec = null;
    lines.forEach(function (l, i) {
      if (paceSec != null) return;
      const m = /(\d{1,2})\s*[:'.]\s*(\d{2})"?\s*(?:min)?\s*\/\s*(mi|km)\b/i.exec(l) || /(\d{1,2}):(\d{2})\s*(?:min)?\s*\/?\s*(mi|km)\b/i.exec(l);
      if (m) { paceSec = clock(0, m[1], m[2]); paceUnit = m[3].toLowerCase(); return; }
      if (/pace/i.test(l)) {
        const mmss = /(?:^|[^:\d])(\d{1,2}):(\d{2})(?![:\d])/;
        const n = mmss.exec(l) || mmss.exec(lines[i + 1] || "") || mmss.exec(lines[i - 1] || "");
        if (n) {
          paceSec = clock(0, n[1], n[2]);
          if (/km/i.test(l) || /km/i.test(lines[i + 1] || "")) paceUnit = "km";
        }
      }
    });
    if (paceSec != null && paceUnit === "km") paceSec = paceSec / KM_TO_MI;

    // ---- time: prefer a Duration or Time label, then the longest h:mm:ss on the page. Clock times and paces are not durations.
    const candidates = [];
    lines.forEach(function (l, i) {
      const re = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b(\s*[ap]\.?m\b)?/ig;
      let m;
      while ((m = re.exec(l))) {
        if (m[4]) continue;
        if (i === 0 && m[3] == null) continue; // the phone's own clock at the top of a screenshot
        if (/\/\s*(mi|km)|min\s*\/|pace/i.test(l)) continue;
        const sec = m[3] != null ? clock(m[1], m[2], m[3]) : clock(0, m[1], m[2]);
        candidates.push({ sec: sec, full: m[3] != null, line: i });
      }
    });
    let dur = null;
    lines.forEach(function (l, i) {
      if (dur != null) return;
      if (/\b(duration|time|elapsed|moving)\b/i.test(l) && !/pace/i.test(l)) {
        const m = near(i, /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b(?!\s*[ap]\.?m)/i);
        if (m && !/\/\s*(mi|km)/i.test(m.input)) dur = m[3] != null ? clock(m[1], m[2], m[3]) : clock(0, m[1], m[2]);
      }
    });
    if (dur == null && candidates.length) {
      const full = candidates.filter(function (c) { return c.full; });
      const pool = full.length ? full : candidates;
      dur = pool.reduce(function (a, c) { return c.sec > a ? c.sec : a; }, 0) || null;
    }

    // ---- distance: a number with a unit, or next to a Distance label; a number that agrees with time / pace wins.
    const dists = [];
    lines.forEach(function (l, i) {
      const re = /(\d{1,3}(?:[.,]\d{1,2})?)\s*(mi|miles?|km|kilomet\w*)\b(?!\s*\/)/ig;
      let m;
      while ((m = re.exec(l))) {
        const v = parseFloat(m[1].replace(",", "."));
        dists.push({ mi: /^k/i.test(m[2]) ? v * KM_TO_MI : v, score: 3 });
      }
      if (/distance/i.test(l)) {
        const n = near(i, /\b(\d{1,3}[.,]\d{1,2})\b/);
        if (n) {
          const kmNear = /\bkm\b/i.test(l) || /\bkm\b/i.test(n.input);
          const v = parseFloat(n[1].replace(",", "."));
          dists.push({ mi: kmNear ? v * KM_TO_MI : v, score: 4 });
        }
      }
      const plain = /^(\d{1,2}[.,]\d{1,2})$/.exec(l);
      if (plain) dists.push({ mi: parseFloat(plain[1].replace(",", ".")), score: 1 });
    });
    let best = null;
    dists.forEach(function (d) {
      if (d.mi <= 0 || d.mi > 60) return;
      let score = d.score;
      if (dur && paceSec) {
        const expect = dur / paceSec;
        if (Math.abs(d.mi - expect) / expect < 0.08) score += 5;
      }
      if (!best || score > best.score) best = { mi: d.mi, score: score };
    });

    if (best) { out.distanceMi = Math.round(best.mi * 100) / 100; out.found.push("distance"); }
    if (dur) { out.durationSec = dur; out.found.push("time"); }
    if (paceSec != null) { out.paceSec = Math.round(paceSec); out.found.push("pace"); }
    if (out.distanceMi && out.durationSec) { // a pace that disagrees with distance and time was misread
      const worked = out.durationSec / out.distanceMi;
      if (out.paceSec == null || Math.abs(out.paceSec - worked) / worked > 0.15) out.paceSec = Math.round(worked);
    }
    return out;
  }

  // Parses "28:14", "1:02:03" or "28" (minutes) as typed by the user.
  function parseTyped(text) {
    const t = String(text || "").trim();
    if (!t) return null;
    const p = t.split(":").map(Number);
    if (p.some(isNaN)) return null;
    if (p.length === 1) return Math.round(p[0] * 60);
    if (p.length === 2) return clock(0, p[0], p[1]);
    if (p.length === 3) return clock(p[0], p[1], p[2]);
    return null;
  }

  function loadScript(src) {
    return new Promise(function (ok, bad) {
      const el = document.createElement("script");
      el.src = src; el.onload = ok; el.onerror = function () { bad(new Error("Could not load " + src)); };
      document.head.appendChild(el);
    });
  }
  function loadImage(file) {
    return new Promise(function (ok, bad) {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { ok({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); bad(new Error("That picture could not be opened.")); };
      img.src = url;
    });
  }

  // Grey, high contrast, dark text on light. invert flips it, for dark-themed screens.
  function prepare(img, invert) {
    const scale = Math.min(1, 1500 / img.naturalWidth);
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height), px = d.data;
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) {
      const v = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      px[i] = v; sum += v;
    }
    const mean = sum / (px.length / 4);
    const flip = invert ? mean >= 128 : mean < 128;
    for (let i = 0; i < px.length; i += 4) {
      let v = px[i];
      if (flip) v = 255 - v;
      v = Math.max(0, Math.min(255, (v - 128) * 1.35 + 128));
      px[i] = px[i + 1] = px[i + 2] = v;
    }
    g.putImageData(d, 0, 0);
    return c;
  }

  async function read(file, onProgress) {
    const loaded = await loadImage(file);
    let worker = null;
    try {
      if (!root.Tesseract) await loadScript("vendor/tesseract/tesseract.min.js");
      const base = new URL("vendor/tesseract/", document.baseURI).href;
      worker = await root.Tesseract.createWorker("eng", 1, {
        workerPath: base + "worker.min.js", corePath: base, langPath: base, gzip: true, workerBlobURL: false,
        logger: function (m) { if (onProgress && m && m.status === "recognizing text") onProgress(m.progress || 0); },
      });
      let res = await worker.recognize(prepare(loaded.img, false));
      let parsed = parse(res.data.text);
      if (!parsed.distanceMi || !parsed.durationSec) { // try once more with the colours flipped
        res = await worker.recognize(prepare(loaded.img, true));
        const again = parse(res.data.text);
        if (again.found.length > parsed.found.length) parsed = again;
      }
      return parsed;
    } finally {
      if (worker) { try { await worker.terminate(); } catch (e) { /* already gone */ } }
      URL.revokeObjectURL(loaded.url);
    }
  }

  // A smaller copy to keep with the run record.
  async function shrink(file) {
    const loaded = await loadImage(file);
    try {
      const scale = Math.min(1, 800 / loaded.img.naturalWidth);
      const c = document.createElement("canvas");
      c.width = Math.round(loaded.img.naturalWidth * scale);
      c.height = Math.round(loaded.img.naturalHeight * scale);
      c.getContext("2d").drawImage(loaded.img, 0, 0, c.width, c.height);
      return await new Promise(function (ok) { c.toBlob(ok, "image/jpeg", 0.7); });
    } finally { URL.revokeObjectURL(loaded.url); }
  }

  root.RunRead = { parse: parse, parseTyped: parseTyped, read: read, shrink: shrink };
})(window);
