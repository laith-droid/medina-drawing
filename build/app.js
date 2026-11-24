/* Medina Drawing — engine (shared with Mountain Drawing / Shan Shui Swarm).
 * City generation: build/medina-lib.js (written for this project; PRNG + noise from shan-shui-inf, MIT),
 * wrapped in SHANSHUI_LIB. The generator's SVG is never shown. PARSE_CHUNK turns each object into ordered primitives
 * (brush ribbons, lines, outlines, washes); brushes trace each primitive's own path and the ink
 * grows behind the tip. Brushes, scheduling, layering and camera were written for this project. */
"use strict";

// ---------------------------------------------------------------------------
// Generator driver: runs inside a Web Worker (or on the main thread as a fallback)
// ---------------------------------------------------------------------------
function DRIVER(L, PARSE, VISF, VIEW_H, SAFE) {
  var seq = 0, held = [], V = VISF(VIEW_H), keepSvg = false;
  function before(a, b) { return a.key < b.key || (a.key === b.key && a.seq < b.seq); }
  return {
    init: function (seed, dbg, night) { if (L.setNight) L.setNight(night); Math.seed(seed); keepSvg = !!dbg; L.MEM.chunks = []; L.MEM.xmin = 0; L.MEM.xmax = 0; L.MEM.planmtx = []; held = []; },
    gen: function () {
      var M = L.MEM;
      M.chunks = [];
      var xmin = M.xmin + M.cwid;
      L.chunkloader(xmin, Math.max(M.xmax - M.cwid + 1, xmin));
      for (var i = 0; i < M.chunks.length; i++) {
        var ch = M.chunks[i], r = PARSE(ch.canv, VIEW_H);
        if (!r.prims.length) continue;
        var o = { seq: seq++, key: ch.y, tag: ch.tag, b: r.b, pts: r.pts, prims: r.prims, sent: false };
        if (keepSvg) o.svg = ch.canv;
        V.classify(o);
        held.push(o);
      }
      M.chunks = [];
      // an object is final once nothing still to be generated can be drawn over it
      var readyX = M.xmax - SAFE, items = [];
      for (i = 0; i < held.length; i++) {
        var ob = held[i];
        if (ob.sent || ob.b[2] >= readyX) continue;
        var later = held.filter(function (q) { return q !== ob && before(ob, q) && V.ov(q.b, ob.b); });
        V.finalize(ob, later);
        ob.sent = true;
        items.push({ seq: ob.seq, key: ob.key, tag: ob.tag, b: ob.b, pts: ob.pts, prims: ob.prims, items: ob.items,
          ext: ob.ext, extPolys: ob.extPolys, stats: ob.stats, svg: ob.svg });
      }
      held = held.filter(function (q) { return !(q.sent && q.b[2] < readyX - 2200); });
      return { r: { xmax: M.xmax, readyX: readyX, items: items }, t: [] };
    },
    paper: function () {
      var reso = 512, px = new Uint8ClampedArray(reso * reso * 4);
      function put(i, j, r, g, b) {
        if (i < 0 || j < 0 || i >= reso || j >= reso) return;
        var o = (j * reso + i) * 4; px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255;
      }
      for (var i = 0; i < reso / 2 + 1; i++)
        for (var j = 0; j < reso / 2 + 1; j++) {
          var c = 247 + L.Noise.noise(i * 0.1, j * 0.1) * 8;
          c -= Math.random() * 12;
          var r = Math.round(c), g = Math.round(c * 0.985), b = Math.round(c * 0.955);
          if (L.isNight && L.isNight()) { var d = c - 247; r = Math.round(21 + d * 0.5); g = Math.round(27 + d * 0.55); b = Math.round(49 + d * 0.8); }
          put(i, j, r, g, b); put(reso - i, j, r, g, b); put(i, reso - j, r, g, b); put(reso - i, reso - j, r, g, b);
        }
      return { r: px, t: [px.buffer] };
    },
  };
}

// ---------------------------------------------------------------------------
// Main thread
// ---------------------------------------------------------------------------
(function () {
  var NRAND = Math.random; // native; the generator replaces Math.random with its seeded PRNG
  var rnd = function (a, b) { return a + NRAND() * (b - a); };

  var VIEW_H = 700;              // world units top to bottom
  var TILE_W = 1024;
  var BRUSHES = 30;              // fixed crew: every screen of landscape carries a similar amount of ink
  var PAINT_SPEED = 300;         // world units/s along a stroke
  var TRAVEL_SPEED = 2200;       // brush lifted between strokes
  var CAM_BASE = 12;             // world units/s when the crew is keeping up
  var EDGE = 8;                  // strokes must sit this far inside the screen to be painted
  var GEN_AHEAD = 5400, SAFE_MARGIN = 1900; // worker finalizes objects up to genXmax - SAFE_MARGIN

  // builders, calligraphers and scholars of the Arab and Islamic world
  var NAMES = ["Ibn Muqla", "Ibn al-Bawwab", "Yaqut al-Musta'simi", "Hashem al-Baghdadi", "Mimar Sinan", "Hassan Fathy",
    "Zaha Hadid", "Rifat Chadirji", "Mohamed Makiya", "Abdel-Wahed El-Wakil", "Rasem Badran", "Al-Jazari",
    "Ibn al-Haytham", "Al-Khwarizmi", "Ibn Khaldun", "Ibn Battuta", "Al-Idrisi", "Ibn Sina", "Ibn Rushd",
    "Al-Biruni", "Al-Kindi", "Al-Farabi", "Fatima al-Fihri", "Ibn Zamrak", "Mariam al-Ijliya", "Ibn al-Shatir",
    "Ibn Tulun", "Ibn Arabi", "Al-Mutanabbi", "Ustad Ahmad Lahauri"];
  var COLORS = ["#e5484d", "#f76b15", "#ffb224", "#30a46c", "#12a594", "#0091ff", "#3e63dd", "#8e4ec6",
    "#d6409f", "#e54666", "#46a758", "#00a2c7", "#6e56cf", "#ab4aba", "#ad7f58", "#978365"];

  var paperEl = document.getElementById("paper");
  var inkCv = document.getElementById("ink"), inkCtx = inkCv.getContext("2d");
  var curCv = document.getElementById("cursors"), curCtx = curCv.getContext("2d");
  var statusEl = document.getElementById("status");

  var dpr, TS, Vd, Vc, viewW, W, H;
  function measure() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    inkCv.width = Math.round(W * dpr); inkCv.height = Math.round(H * dpr);
    curCv.width = Math.round(W * dpr); curCv.height = Math.round(H * dpr);
    Vc = H / VIEW_H; Vd = Vc * dpr; viewW = W / Vc;
    if (!TS) TS = Math.min(Vd, 2.4); // layer/tile raster scale, fixed for the session
  }
  measure();
  window.addEventListener("resize", measure);

  var DEBUG = false, NIGHT = false, S, brushes = [], speedMult = 1, paused = false, showNames = false, time = 0;
  var mouse = { x: 0, y: 0, t: -1e9, inside: false, wx: 0, wy: 0 };

  function freshState(seed) {
    return { seed: seed, camX: 0, camV: 0, genXmax: 0, genBusy: false, jobs: [], tiles: new Map(), started: false,
      strokes: 0, block: Infinity, readyX: 0, svgs: [], stats: { ink: 0, kept: 0, hidden: 0, items: 0, prims: 0 } };
  }

  // ---------------- generator plumbing ----------------
  var gen = null;
  function makeGenerator() {
    var src = SHANSHUI_LIB.toString() + "\n" + PARSE_CHUNK.toString() + "\n" + VIS_LIB.toString() + "\n" + DRIVER.toString() +
      "\nvar D = DRIVER(SHANSHUI_LIB(self), PARSE_CHUNK, VIS_LIB, " + VIEW_H + ", " + SAFE_MARGIN + ");" +
      "\nonmessage = function(e){ var m=e.data;" +
      " if(m.op==='init'){ D.init(m.seed, m.dbg, m.night); postMessage({id:m.id,r:null}); return; }" +
      " var o = m.op==='gen' ? D.gen() : D.paper(); postMessage({id:m.id, r:o.r}, o.t); };";
    try {
      var w = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
      var pend = {}, nid = 1;
      w.onmessage = function (e) { var f = pend[e.data.id]; delete pend[e.data.id]; f && f(e.data.r); };
      return {
        call: function (op, extra) {
          return new Promise(function (res) { var id = nid++; pend[id] = res; var m = { op: op, id: id }; for (var k in extra) m[k] = extra[k]; w.postMessage(m); });
        },
        kill: function () { w.terminate(); },
      };
    } catch (err) {
      var D = DRIVER(SHANSHUI_LIB(window), PARSE_CHUNK, VIS_LIB, VIEW_H, SAFE_MARGIN);
      return {
        call: function (op, extra) {
          return new Promise(function (res) {
            setTimeout(function () { res(op === "init" ? D.init(extra.seed, extra.dbg, extra.night) : op === "gen" ? D.gen().r : D.paper().r); }, 0);
          });
        },
        kill: function () {},
      };
    }
  }

  // ---------------- geometry ----------------
  // Ribbon layout (shan-shui stroke() and blob()): p0, L1..Lm, pEnd, Rm..R1, p0  => n = 2m+3.
  function ribbonL(j, p) { return p.o + j; }
  function ribbonR(j, p) { return p.o + (p.n - 1) - j; }

  // The path a brush follows for one work item, plus the visible stretches on it.
  function buildTrace(job, it) {
    var P = job.pts, tr = [], p = job.prims[it.m[0]];
    if (it.k === "r") {
      var m = (p.n - 3) / 2;
      for (var j = 0; j <= m + 1; j++) {
        var a = ribbonL(j, p), b = ribbonR(j, p);
        tr.push((P[2 * a] + P[2 * b]) / 2, (P[2 * a + 1] + P[2 * b + 1]) / 2);
      }
    } else if (it.k === "l" || it.k === "o") {
      for (var i = 0; i < p.n; i++) tr.push(P[2 * (p.o + i)], P[2 * (p.o + i) + 1]);
    } else if (it.k === "g") {
      var x0 = it.bb[0], x1 = it.bb[2], y0 = Math.max(0, it.bb[1]), h = Math.min(VIEW_H, it.bb[3]) - y0;
      var rows = Math.max(1, Math.min(8, Math.ceil(h / 30)));
      it.rows = rows; it.rowH = h / rows; it.wy0 = y0;
      for (var r = 0; r < rows; r++) {
        var y = y0 + (r + 0.5) * it.rowH;
        if (r % 2 === 0) tr.push(x0, y, x1, y); else tr.push(x1, y, x0, y);
      }
    } else tr.push(p.tx - p.size, p.ty, p.tx + p.size, p.ty);
    var cum = new Float32Array(tr.length / 2), L = 0;
    for (var k = 1; k < cum.length; k++) { L += Math.hypot(tr[2 * k] - tr[2 * k - 2], tr[2 * k + 1] - tr[2 * k - 1]); cum[k] = L; }
    it.tr = tr; it.cum = cum; it.L = Math.max(L, 0.01); it.J = 0; it.d = 0;
    if (it.k === "r" || it.k === "l" || it.k === "o") {
      it.iv = p.iv && p.iv.length ? p.iv.slice() : [0, it.L];
      for (var q = 0; q < it.iv.length; q++) it.iv[q] = Math.min(it.iv[q], it.L);
    } else it.iv = [0, it.L];
    it.seg = 0;
    if (it.k === "g") { var dur = Math.max(0.2, Math.min(1.4, Math.sqrt((x1 - x0) * h) / 200)); it.speed = it.L / dur; }
    else it.speed = PAINT_SPEED;
  }
  function seek(it, d) {
    var cum = it.cum, J = it.J;
    if (cum.length < 2) { it.J = 0; return 1; }
    if (cum[J] > d) J = 0;
    while (J < cum.length - 2 && cum[J + 1] < d) J++;
    it.J = J;
    var segLen = cum[J + 1] - cum[J];
    return segLen > 0 ? Math.min(1, Math.max(0, (d - cum[J]) / segLen)) : 1;
  }
  function tracePoint(it, d, out) {
    if (it.cum.length < 2) { out[0] = it.tr[0]; out[1] = it.tr[1]; return; }
    var t = seek(it, d), J = it.J, tr = it.tr;
    out[0] = tr[2 * J] + (tr[2 * J + 2] - tr[2 * J]) * t;
    out[1] = tr[2 * J + 1] + (tr[2 * J + 3] - tr[2 * J + 1]) * t;
  }

  // ---------------- painting ----------------
  function pathPts(c, P, o, n) {
    c.beginPath();
    c.moveTo(P[2 * o], P[2 * o + 1]);
    for (var i = 1; i < n; i++) c.lineTo(P[2 * (o + i)], P[2 * (o + i) + 1]);
  }
  function paintFull(c, job, p) {
    if (p.t === "x") {
      c.save(); c.translate(p.tx, p.ty); c.rotate(p.rot * Math.PI / 180);
      c.font = p.size + "px Verdana, sans-serif"; c.textAlign = "center"; c.fillStyle = p.fil; c.fillText(p.txt, 0, 0);
      c.restore(); return;
    }
    pathPts(c, job.pts, p.o, p.n);
    if (p.t !== "l") { c.fillStyle = p.fil; c.fill(); }
    if (p.t === "l" || p.t === "o" || p.seam || (p.t === "r" && p.wid > 0)) { c.strokeStyle = p.str; c.lineWidth = p.wid; c.stroke(); }
  }
  // The item exactly as it survives in the finished picture: its prims, minus everything drawn over them later.
  function buildScratch(job, it) {
    var bb = it.bb;
    var ox = job.lx0 + Math.floor((bb[0] - job.lx0) * TS) / TS, oy = job.ly0 + Math.floor((Math.max(0, bb[1]) - job.ly0) * TS) / TS;
    var cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.ceil((bb[2] - ox) * TS) + 1); cv.height = Math.max(1, Math.ceil((Math.min(VIEW_H, bb[3]) - oy) * TS) + 1);
    var c = cv.getContext("2d");
    c.setTransform(TS, 0, 0, TS, -ox * TS, -oy * TS);
    for (var i = 0; i < it.m.length; i++) paintFull(c, job, job.prims[it.m[i]]);
    c.globalCompositeOperation = "destination-out";
    c.fillStyle = "#000";
    var occ = job.occ;
    for (i = 0; i < occ.length; i++) {
      var q = job.prims[occ[i]];
      if (occ[i] <= it.last || !overlap(q.bb, bb)) continue;
      pathPts(c, job.pts, q.o, q.n); c.fill();
    }
    for (i = 0; i < job.extPolys.length; i++) {
      var e = job.extPolys[i];
      if (!overlap(e.bb, bb)) continue;
      pathPts(c, job.ext, e.o, e.n); c.fill();
    }
    it.sc = cv; it.ox = ox; it.oy = oy;
  }
  function drawScratch(c, it) { c.drawImage(it.sc, it.ox, it.oy, it.sc.width / TS, it.sc.height / TS); }

  // the item while its brush is still on it (ctx in world coordinates)
  function paintPartial(c, job, it) {
    if (it.k === "x" || it.d <= 0) return;
    var t = seek(it, it.d), J = it.J, P = job.pts, p = job.prims[it.m[0]];
    if (it.k === "r") {
      // reveal the exact clipped stroke up to the brush tip
      var a0 = ribbonL(J, p), a1 = ribbonL(J + 1, p), b0 = ribbonR(J, p), b1 = ribbonR(J + 1, p);
      c.save();
      c.beginPath();
      c.moveTo(P[2 * p.o], P[2 * p.o + 1]);
      for (var j = 1; j <= J; j++) { var a = ribbonL(j, p); c.lineTo(P[2 * a], P[2 * a + 1]); }
      c.lineTo(P[2 * a0] + (P[2 * a1] - P[2 * a0]) * t, P[2 * a0 + 1] + (P[2 * a1 + 1] - P[2 * a0 + 1]) * t);
      c.lineTo(P[2 * b0] + (P[2 * b1] - P[2 * b0]) * t, P[2 * b0 + 1] + (P[2 * b1 + 1] - P[2 * b0 + 1]) * t);
      for (j = J; j >= 0; j--) { var b = ribbonR(j, p); c.lineTo(P[2 * b], P[2 * b + 1]); }
      c.closePath();
      c.clip();
      drawScratch(c, it);
      c.restore();
    } else if (it.k === "l" || it.k === "o") {
      // outline: only the visible stretches up to the tip (the fill lands when the brush finishes)
      c.beginPath();
      var tr = it.tr, cum = it.cum;
      for (var s = 0; s < it.iv.length; s += 2) {
        var d0 = it.iv[s], d1 = Math.min(it.iv[s + 1], it.d);
        if (d1 <= d0) break;
        var q = [0, 0];
        tracePoint(it, d0, q); c.moveTo(q[0], q[1]);
        for (var k = it.J + 1; k < cum.length && cum[k] < d1; k++) c.lineTo(tr[2 * k], tr[2 * k + 1]);
        tracePoint(it, d1, q); c.lineTo(q[0], q[1]);
      }
      c.strokeStyle = p.t === "o" ? p.str : p.str; c.lineWidth = p.wid || 1; c.stroke();
      seek(it, it.d);
    } else if (it.k === "g") {
      var x0 = it.bb[0], x1 = it.bb[2], y0 = it.wy0;
      c.save();
      c.beginPath();
      var row = J >> 1, inRow = (J % 2) === 0, done = inRow ? row : row + 1;
      if (done > 0) c.rect(x0, y0, x1 - x0, done * it.rowH);
      if (inRow) {
        var bx = it.tr[2 * J] + (it.tr[2 * J + 2] - it.tr[2 * J]) * t;
        if (row % 2 === 0) c.rect(x0, y0 + row * it.rowH, bx - x0, it.rowH); else c.rect(bx, y0 + row * it.rowH, x1 - bx, it.rowH);
      }
      c.clip();
      drawScratch(c, it);
      c.restore();
    }
  }

  // ---------------- tiles + layers ----------------
  function tile(i) {
    var t = S.tiles.get(i);
    if (!t) {
      var cv = document.createElement("canvas");
      cv.width = Math.ceil(TILE_W * TS); cv.height = Math.ceil(VIEW_H * TS);
      t = { x0: i * TILE_W, cv: cv, ctx: cv.getContext("2d") };
      S.tiles.set(i, t);
    }
    return t;
  }
  function before(a, b) { return a.key < b.key || (a.key === b.key && a.seq < b.seq); }
  function overlap(a, b) { return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]; }

  function goLive(j) {
    j.state = "live";
    j.deps = [];
    for (var k = 0; k < S.jobs.length; k++) {
      var o = S.jobs[k];
      if (o !== j && o.state !== "baked" && before(o, j) && overlap(o.b, j.b)) j.deps.push(o);
    }
    j.lx0 = Math.floor(j.b[0]); j.ly0 = Math.max(0, Math.floor(j.b[1]));
    var w = j.b[2] - j.lx0, h = Math.min(VIEW_H, j.b[3]) - j.ly0;
    j.layer = document.createElement("canvas");
    j.layer.width = Math.max(1, Math.ceil(w * TS) + 2); j.layer.height = Math.max(1, Math.ceil(h * TS) + 2);
    j.lctx = j.layer.getContext("2d");
    j.lctx.setTransform(TS, 0, 0, TS, -j.lx0 * TS, -j.ly0 * TS);
    j.occ = [];
    for (k = 0; k < j.prims.length; k++) if (j.prims[k].occ) j.occ.push(k);
    j.scan = 0; j.open = []; j.left = j.items.length;
    j.layerRank = j.key < -4000 ? 0 : j.key < 0 ? 1 : 2 + Math.max(0, (j.key - 250) / 120);
    for (k = 0; k < j.items.length; k++) { var it = j.items[k]; it.s = 0; it.i = k; if (it.k === "o" && !(j.prims[it.m[0]].iv || []).length) it.k = "g"; }
    if (!j.left) j.state = "done";
  }

  function depsMet(j, it) {
    for (var d = 0; d < it.deps.length; d++) if (j.items[it.deps[d]].s !== 3) return false;
    return true;
  }
  function finishItem(j, it) {
    it.s = 2;
    // land it (and anything that was waiting on it) as soon as the opaque fills under it have landed
    var again = true;
    while (again) {
      again = false;
      for (var k = 0; k < j.open.length; k++) {
        var o = j.items[j.open[k]];
        if (o.s === 2 && depsMet(j, o)) {
          drawScratch(j.lctx, o);
          o.s = 3; o.sc = o.tr = o.cum = null;
          j.open.splice(k, 1); k--;
          j.left--; S.strokes++;
          if (o.opq) again = true;
        }
      }
    }
    if (j.left <= 0) { j.state = "done"; j.pts = j.prims = j.items = j.ext = j.extPolys = null; j.open = []; }
  }
  function skipItem(j, it) { // scrolled off the left before anyone painted it: it can never be seen
    it.s = 3; j.left--;
    if (j.left <= 0) { j.state = "done"; j.pts = j.prims = j.items = j.ext = j.extPolys = null; j.open = []; }
  }

  function bakeReady() {
    var done = S.jobs.filter(function (j) { return j.state === "done"; }).sort(function (a, b) { return before(a, b) ? -1 : 1; });
    for (var k = 0; k < done.length; k++) {
      var j = done[k], ok = true;
      for (var d = 0; d < j.deps.length; d++) if (j.deps[d].state !== "baked") { ok = false; break; }
      if (!ok) continue;
      var i0 = Math.floor(j.lx0 / TILE_W), i1 = Math.floor((j.lx0 + j.layer.width / TS) / TILE_W);
      for (var i = i0; i <= i1; i++) {
        var t = tile(i);
        t.ctx.drawImage(j.layer, (j.lx0 - t.x0) * TS, j.ly0 * TS);
      }
      j.state = "baked"; j.layer = j.lctx = null;
    }
  }

  // ---------------- choosing work ----------------
  function claimable(it) {
    if (it.s !== 0) return false;
    if (it.bb[2] <= S.camX + EDGE) return false; // (straddling the left edge only happens if something arrived late)
    return it.bb[2] <= S.camX + viewW - EDGE || (it.bb[2] - it.bb[0] > viewW * 0.8);
  }
  function claim(j, it) {
    it.s = 1;
    buildTrace(j, it);
    buildScratch(j, it);
    var open = j.open, lo = 0, hi = open.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (open[mid] < it.i) lo = mid + 1; else hi = mid; }
    open.splice(lo, 0, it.i);
  }
  var tp = [0, 0];
  function pickWork(b) {
    var best = null, bestJob = null, bestScore = Infinity;
    for (var k = 0; k < S.jobs.length; k++) {
      var j = S.jobs[k];
      if (j.state !== "live") continue;
      while (j.scan < j.items.length && j.items[j.scan].s !== 0) j.scan++;
      var found = 0;
      for (var i = j.scan; i < j.items.length && found < 16; i++) {
        var it = j.items[i];
        if (!claimable(it)) continue;
        found++;
        var sx = (it.bb[0] + it.bb[2]) / 2, sy = (it.bb[1] + it.bb[3]) / 2;
        // near the brush, toward the left edge (the scroll needs it first), farther layers first,
        // opaque fills early (strokes on top of them wait for them)
        var sc = Math.hypot(sx - b.x, sy - b.y) + 0.45 * (it.bb[0] - S.camX) + j.layerRank * 70 + (it.opq ? -80 : 0);
        for (var q = 0; q < brushes.length; q++) {
          var o = brushes[q];
          if (o !== b && o.state !== "idle" && Math.abs(o.x - sx) < 22 && Math.abs(o.y - sy) < 22) sc += 45;
        }
        if (sc < bestScore) { bestScore = sc; best = it; bestJob = j; }
      }
    }
    if (!best) return false;
    claim(bestJob, best);
    b.job = bestJob; b.item = best; b.state = "travel";
    best.d = best.iv[0];
    tracePoint(best, best.d, tp); b.tx = tp[0]; b.ty = tp[1];
    S.started = true;
    return true;
  }

  // ---------------- brushes ----------------
  function makeBrush(i) {
    return { id: i, name: NAMES[i % NAMES.length], color: COLORS[(i * 7) % COLORS.length],
      x: viewW * rnd(0.3, 0.9), y: rnd(150, 500), vx: 0, vy: 0, ivx: 0, ivy: 0, ang: -0.95, state: "idle", job: null, item: null,
      lift: 1, phase: rnd(0, 6.28), tx: 0, ty: 0 };
  }
  var tmp = [0, 0];
  function stepBrush(b, dt, idle, anchor, mouseActive) {
    if (b.state !== "paint" && b.x < S.camX + EDGE) b.x = S.camX + EDGE; // the scroll just passed this spot
    var px = b.x, py = b.y, t = dt, picks = 0;
    while (t > 1e-5) {
      if (b.state === "idle") {
        if (picks >= 8 || !pickWork(b)) break;
        picks++;
      }
      if (b.state === "travel") { // lifted: to the start of the next visible stretch
        var dx = b.tx - b.x, dy = b.ty - b.y, d = Math.hypot(dx, dy);
        var sp = Math.min(TRAVEL_SPEED, 600 + d * 12);
        var mv = Math.min(d, sp * t);
        if (d > 0) { b.x += dx / d * mv; b.y += dy / d * mv; }
        t -= mv / sp;
        b.lift += (1 - b.lift) * Math.min(1, dt * 12);
        if (mv >= d - 1e-6) { b.x = b.tx; b.y = b.ty; b.state = "paint"; b.item.d = b.item.iv[2 * b.item.seg]; }
        continue;
      }
      if (b.state === "paint") {
        var it = b.item, end = it.iv[2 * it.seg + 1], rem = end - it.d, mv2 = Math.min(rem, it.speed * t);
        it.d += mv2; t -= mv2 / it.speed;
        tracePoint(it, it.d, tmp); b.x = tmp[0]; b.y = tmp[1];
        b.lift += (0 - b.lift) * Math.min(1, dt * 14);
        if (it.d >= end - 1e-6) {
          if (2 * (it.seg + 1) < it.iv.length) { // hidden stretch ahead: lift over it
            it.seg++;
            tracePoint(it, it.iv[2 * it.seg], tmp); b.tx = tmp[0]; b.ty = tmp[1];
            b.state = "travel";
            continue;
          }
          it.d = it.L;
          var j = b.job;
          b.state = "idle"; b.job = null; b.item = null;
          finishItem(j, it);
        }
      }
    }
    if (b.state === "idle" && t > 1e-5) idleFlock(b, t, idle, anchor, mouseActive);
    if (dt > 0) { var nvx = (b.x - px) / dt, nvy = (b.y - py) / dt; b.vx += (nvx - b.vx) * 0.3; b.vy += (nvy - b.vy) * 0.3; }
  }

  function idleFlock(b, dt, idle, anchor, mouseActive) {
    var ax = 0, ay = 0, n = idle.length;
    var dx = anchor.x - b.x, dy = anchor.y - b.y, d = Math.hypot(dx, dy) + 1e-6;
    var R = 40 + n * 2.2, dir = b.id % 2 ? 1 : -1;
    var seek = Math.max(0, d - R) / d;
    ax += dx * seek * 2.4; ay += dy * seek * 2.4;
    ax += (-dy / d) * 110 * dir * Math.min(1, R / d); ay += (dx / d) * 110 * dir * Math.min(1, R / d);
    if (d < R * 0.6) { ax -= dx / d * 150; ay -= dy / d * 150; }
    for (var i = 0; i < n; i++) {
      var o = idle[i];
      if (o === b) continue;
      var ox = b.x - o.x, oy = b.y - o.y, od = Math.hypot(ox, oy);
      if (od < 24 && od > 0) { ax += ox / od * (24 - od) * 22; ay += oy / od * (24 - od) * 22; }
    }
    if (mouseActive) {
      var mx = b.x - mouse.wx, my = b.y - mouse.wy, md = Math.hypot(mx, my);
      if (md < 45 && md > 0) { ax += mx / md * (45 - md) * 40; ay += my / md * (45 - md) * 40; }
    }
    ax += Math.sin(time * 1.3 + b.phase) * 40; ay += Math.cos(time * 1.1 + b.phase * 1.7) * 40;
    var vx = b.ivx, vy = b.ivy;
    vx += ax * dt; vy += ay * dt;
    var sp = Math.hypot(vx, vy);
    if (sp > 240) { vx *= 240 / sp; vy *= 240 / sp; }
    vx *= 1 - Math.min(0.9, dt * 0.6); vy *= 1 - Math.min(0.9, dt * 0.6);
    b.ivx = vx; b.ivy = vy;
    b.x += vx * dt; b.y += vy * dt;
    // stay on screen
    var l = S.camX + 30, r = S.camX + viewW - 30;
    if (b.x < l) b.x += (l - b.x) * Math.min(1, dt * 4);
    if (b.x > r) b.x -= (b.x - r) * Math.min(1, dt * 4);
    b.y = Math.max(25, Math.min(VIEW_H - 40, b.y));
    b.lift += (1 - b.lift) * Math.min(1, dt * 6);
  }

  // ---------------- simulation step ----------------
  function step(dt) {
    time += dt;
    if (!S.genBusy && S.genXmax < S.camX + viewW + GEN_AHEAD) {
      S.genBusy = true;
      var myS = S;
      gen.call("gen").then(function (r) {
        if (myS !== S) return;
        S.genBusy = false;
        S.genXmax = r.xmax;
        S.readyX = r.readyX;
        r.items.forEach(function (it) {
          it.state = "pending";
          if (it.svg) S.svgs.push({ key: it.key, seq: it.seq, svg: it.svg });
          S.stats.ink += it.stats.ink; S.stats.kept += it.stats.kept; S.stats.hidden += it.stats.hidden; S.stats.items += it.items.length; S.stats.prims += it.prims.length;
          S.jobs.push(it);
        });
      });
    }
    if (!S.placed) {
      // first screen: wait until every object that reaches into it is final, then start left of all of them
      if (S.readyX < viewW + 3000) return; // GEN_AHEAD - SAFE_MARGIN must exceed this
      var minX = 0;
      S.jobs.forEach(function (j) { if (j.b[0] < viewW) minX = Math.min(minX, j.b[0]); });
      S.camX = minX - EDGE * 2;
      S.placed = true;
      brushes.forEach(function (b) { b.x = S.camX + viewW * rnd(0.5, 0.9); b.y = rnd(150, 500); });
    }
    for (var k = 0; k < S.jobs.length; k++) {
      var j = S.jobs[k];
      if (j.state === "pending" && j.b[0] < S.camX + viewW) goLive(j);
    }
    // brushes
    var mouseActive = mouse.inside && time - mouse.t < 2.5;
    mouse.wx = S.camX + mouse.x / Vc; mouse.wy = mouse.y / Vc;
    var idle = brushes.filter(function (b) { return b.state === "idle"; });
    var anchor = mouseActive ? { x: mouse.wx, y: mouse.wy } :
      { x: S.camX + viewW * (0.8 + 0.05 * Math.sin(time * 0.21)), y: 320 + 70 * Math.sin(time * 0.33) };
    for (k = 0; k < brushes.length; k++) stepBrush(brushes[k], dt, idle, anchor, mouseActive);
    bakeReady();
    S.jobs = S.jobs.filter(function (j) { return j.state !== "baked"; });
    // camera: the left edge may not pass any stroke that is still unpainted
    var block = Infinity, busy = 0;
    for (k = 0; k < S.jobs.length; k++) {
      j = S.jobs[k];
      if (j.state === "live") {
        for (var oi = 0; oi < j.open.length; oi++) { var oit = j.items[j.open[oi]]; if (oit.s < 2 && oit.bb[0] < block) block = oit.bb[0]; }
        for (var i = j.scan; i < j.items.length; i++) {
          var it = j.items[i];
          if (it.s === 0 && it.bb[2] <= S.camX + EDGE) { skipItem(j, it); if (j.state !== "live") break; continue; }
          if (it.s < 2 && it.bb[0] < block) block = it.bb[0];
        }
      }
    }
    if ((S.readyX || 0) < S.camX + viewW + 1600) block = Math.min(block, S.camX + EDGE); // objects here are not final yet
    S.block = block;
    for (k = 0; k < brushes.length; k++) if (brushes[k].state !== "idle") busy++;
    var pace = CAM_BASE * (1 + 1.4 * (1 - busy / brushes.length));
    var room = (block - EDGE - S.camX) / (viewW * 0.2);
    var want = S.started ? pace * Math.max(0, Math.min(1, room)) : 0;
    S.camV += (want - S.camV) * Math.min(1, dt * 2);
    S.camX = Math.min(S.camX + S.camV * dt, Math.max(S.camX, block - EDGE));
    S.tiles.forEach(function (t, i) { if (t.x0 + TILE_W < S.camX - 64) S.tiles.delete(i); });
  }

  // ---------------- drawing ----------------
  function drawInk() {
    var c = inkCtx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, inkCv.width, inkCv.height);
    var sc = Vd / TS;
    S.tiles.forEach(function (t) {
      var x = (t.x0 - S.camX) * Vd;
      if (x > inkCv.width || x + TILE_W * Vd < 0) return;
      c.drawImage(t.cv, x, 0, t.cv.width * sc, t.cv.height * sc);
    });
    var layers = S.jobs.filter(function (j) { return (j.state === "live" || j.state === "done") && j.layer; })
      .sort(function (a, b) { return before(a, b) ? -1 : 1; });
    for (var k = 0; k < layers.length; k++) {
      var j = layers[k];
      if ((j.lx0 - S.camX) * Vd > inkCv.width || (j.lx0 + j.layer.width / TS - S.camX) * Vd < 0) continue;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.drawImage(j.layer, (j.lx0 - S.camX) * Vd, j.ly0 * Vd, j.layer.width * sc, j.layer.height * sc);
      if (j.state !== "live" || !j.open.length) continue;
      // strokes in flight, in the object's own drawing order
      c.setTransform(Vd, 0, 0, Vd, -S.camX * Vd, 0);
      for (var i = 0; i < j.open.length; i++) {
        var it = j.items[j.open[i]];
        if (it.s === 1) paintPartial(c, j, it);
        else if (it.s === 2) drawScratch(c, it);
      }
    }
  }

  function brushPath(c) {
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(4, -4.2, 11, -3.6); c.lineTo(11, 3.6); c.quadraticCurveTo(4, 4.2, 0, 0); c.closePath();
  }
  function handlePath(c) {
    c.beginPath(); c.moveTo(17.5, -3.6); c.lineTo(41, -2.3); c.arc(41, 0, 2.3, -Math.PI / 2, Math.PI / 2); c.lineTo(17.5, 3.6); c.closePath();
  }
  function drawBrush(c, b, sx, sy) {
    var painting = b.state === "paint";
    var s = 1 + b.lift * 0.1;
    c.save();
    c.translate(sx, sy); c.rotate(b.ang); c.scale(s, s);
    if (b.lift > 0.3) {
      c.save(); c.globalAlpha = 0.18 * b.lift; c.translate(3, 5); c.fillStyle = "#000";
      c.beginPath(); c.roundRect(0, -3.6, 40, 7.2, 3.6); c.fill(); c.restore();
    }
    c.lineJoin = "round"; c.strokeStyle = "rgba(255,255,255,0.95)"; c.lineWidth = 3.2;
    brushPath(c); c.stroke();
    c.beginPath(); c.roundRect(10, -4.4, 8, 8.8, 1.5); c.stroke();
    handlePath(c); c.stroke();
    c.fillStyle = b.color; c.strokeStyle = "rgba(0,0,0,0.45)"; c.lineWidth = 0.8;
    handlePath(c); c.fill(); c.stroke();
    c.fillStyle = "rgba(255,255,255,0.28)"; c.fillRect(19, -2.6, 20, 1.3);
    var fg = c.createLinearGradient(0, -4.4, 0, 4.4);
    fg.addColorStop(0, "#e9e6df"); fg.addColorStop(0.5, "#a9a59c"); fg.addColorStop(1, "#6f6b63");
    c.fillStyle = fg; c.beginPath(); c.roundRect(10, -4.4, 8, 8.8, 1.5); c.fill(); c.stroke();
    var bg = c.createLinearGradient(0, 0, 11, 0);
    bg.addColorStop(0, "#141210"); bg.addColorStop(painting ? 0.85 : 0.45, "#2a2622"); bg.addColorStop(1, "#b89b72");
    c.fillStyle = bg; brushPath(c); c.fill();
    c.strokeStyle = "rgba(0,0,0,0.5)"; c.stroke();
    c.restore();
    if (showNames) {
      c.save();
      c.font = "600 10.5px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";
      var tw = c.measureText(b.name).width, lx = sx + 8 + tw + 10 > W - 4 ? sx - 8 - tw - 10 : sx + 8, ly = sy + 10;
      c.fillStyle = b.color; c.beginPath(); c.roundRect(lx, ly, tw + 10, 16, 8); c.fill();
      c.fillStyle = "#fff"; c.textBaseline = "middle"; c.fillText(b.name, lx + 5, ly + 8.5);
      c.restore();
    }
  }
  function drawCursors(dt) {
    var c = curCtx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, curCv.width, curCv.height);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (var k = 0; k < brushes.length; k++) {
      var b = brushes[k];
      var tilt = Math.max(-0.5, Math.min(0.5, b.vx / 1200));
      var wob = b.state === "paint" ? Math.sin(time * 11 + b.phase) * 0.06 : 0;
      b.ang += (-0.95 + tilt + wob - b.ang) * Math.min(1, dt * 10);
      drawBrush(c, b, (b.x - S.camX) * Vc, b.y * Vc);
    }
  }

  // ---------------- loop ----------------
  var last = performance.now(), perf = { step: 0, ink: 0, cur: 0, n: 0 };
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (S && gen) {
      var t0 = performance.now();
      if (!paused) {
        var simDt = dt * speedMult, sub = Math.ceil(simDt / 0.034);
        for (var i = 0; i < sub; i++) step(simDt / sub);
      }
      var t1 = performance.now();
      drawInk();
      var t2 = performance.now();
      drawCursors(paused ? 0 : dt * speedMult);
      perf.step += t1 - t0; perf.ink += t2 - t1; perf.cur += performance.now() - t2; perf.n++;
      statusEl.style.opacity = S.started ? 0 : 1;
    }
    requestAnimationFrame(frame);
  }

  function start(seed) {
    if (gen) gen.kill();
    gen = makeGenerator();
    S = freshState(seed);
    brushes = [];
    for (var i = 0; i < BRUSHES; i++) brushes.push(makeBrush(i));
    document.getElementById("seed").textContent = seed;
    document.body.classList.toggle("night", NIGHT);
    document.getElementById("night").classList.toggle("on", NIGHT);
    statusEl.innerHTML = NIGHT ? "lighting the lamps&hellip;" : "laying the first stones&hellip;";
    try { history.replaceState(null, "", "?seed=" + encodeURIComponent(seed) + (NIGHT_Q ? "&night=" + NIGHT_Q : "")); } catch (e) {}
    // init then paper are queued before any chunk request, so a seed always gives the same landscape
    gen.call("init", { seed: seed, dbg: DEBUG, night: NIGHT });
    gen.call("paper").then(function (px) {
      var cv = document.createElement("canvas");
      cv.width = cv.height = 512;
      cv.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(px), 512, 512), 0, 0);
      paperEl.style.backgroundImage = "url(" + cv.toDataURL() + ")";
    });
  }
  var q = null, TV = false, NIGHT_Q = null;
  // ?night (or ?night=1) = night version; ?night=auto = night from 19:00 to 07:00 local time, checked at each new city
  function nightNow() { if (!NIGHT_Q) return false; if (NIGHT_Q !== "auto") return true; var h = new Date().getHours(); return h >= 19 || h < 7; }
  try { NIGHT_Q = new URLSearchParams(location.search).get("night"); if (NIGHT_Q === "") NIGHT_Q = "1"; } catch (e) {}
  NIGHT = nightNow();
  try { TV = new URLSearchParams(location.search).has("tv"); q = new URLSearchParams(location.search).get("seed"); DEBUG = new URLSearchParams(location.search).has("debug"); } catch (e) {}
  start(q || String(Date.now()));
  requestAnimationFrame(frame);

  // ---------------- UI ----------------
  var ui = document.getElementById("ui");
  var ICON_PAUSE = '<svg width="12" height="12" viewBox="0 0 12 12"><rect x="2" y="1.5" width="2.6" height="9" rx="0.8" fill="currentColor"/><rect x="7.4" y="1.5" width="2.6" height="9" rx="0.8" fill="currentColor"/></svg>';
  var ICON_PLAY = '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 1.6v8.8l7-4.4z" fill="currentColor"/></svg>';
  document.getElementById("pause").innerHTML = ICON_PAUSE;
  function setSpeed(m) {
    speedMult = m;
    document.querySelectorAll("[data-speed]").forEach(function (el) { el.classList.toggle("on", +el.dataset.speed === m); });
  }
  function togglePause() { paused = !paused; document.getElementById("pause").innerHTML = paused ? ICON_PLAY : ICON_PAUSE; }
  function toggleNames() { showNames = !showNames; document.getElementById("names").classList.toggle("on", showNames); }
  function toggleUI() { ui.classList.toggle("hidden"); }
  function newSeed() { NIGHT = nightNow(); start(String(Math.floor(NRAND() * 1e9))); }
  function toggleNight() { NIGHT = !NIGHT; NIGHT_Q = NIGHT ? "1" : null; start(S.seed); }
  function fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {});
  }
  setSpeed(1);
  // ?tv = screensaver mode (Fire TV Cube): no toolbar, no name tags; brushes still paint
  if (TV) ui.style.display = "none";   // read before start() rewrites the URL to ?seed=
  document.getElementById("pause").onclick = togglePause;
  document.querySelectorAll("[data-speed]").forEach(function (el) { el.onclick = function () { setSpeed(+el.dataset.speed); }; });
  document.getElementById("names").onclick = toggleNames;
  document.getElementById("night").onclick = toggleNight;
  document.getElementById("reseed").onclick = newSeed;
  document.getElementById("full").onclick = fullscreen;
  document.getElementById("hide").onclick = toggleUI;
  window.addEventListener("keydown", function (e) {
    var k = e.key.toLowerCase();
    if (k === " ") { togglePause(); e.preventDefault(); }
    else if (k === "1") setSpeed(1); else if (k === "2") setSpeed(2); else if (k === "3") setSpeed(4);
    else if (k === "l") toggleNames(); else if (k === "m") toggleNight(); else if (k === "n") newSeed();
    else if (k === "h") toggleUI(); else if (k === "f") fullscreen();
  });
  window.addEventListener("pointermove", function (e) { mouse.x = e.clientX; mouse.y = e.clientY; mouse.t = time; mouse.inside = true; });
  document.addEventListener("pointerleave", function () { mouse.inside = false; });
  // debug: land every live item at once, to compare the result with shan-shui's own SVG
  function instant() {
    brushes.forEach(function (b) { b.state = "idle"; b.job = null; b.item = null; });
    S.jobs.forEach(function (j) { if (j.state === "pending" && j.b[0] < S.camX + viewW) goLive(j); });
    S.jobs.forEach(function (j) {
      if (j.state !== "live") return;
      for (var i = 0; j.state === "live" && i < j.items.length; i++) {
        var it = j.items[i];
        if (it.s === 0) claim(j, it);
        if (it.s === 1) { it.d = it.L; finishItem(j, it); }
      }
    });
    bakeReady();
  }
  window.__swarm = { instant: instant, drawInk: function () { drawInk(); }, pause: function (v) { paused = v; }, get TS() { return TS; }, get state() { return S; }, get brushes() { return brushes; }, get viewW() { return viewW; }, perf: function () { var r = { step: perf.step / perf.n, ink: perf.ink / perf.n, cur: perf.cur / perf.n }; perf.step = perf.ink = perf.cur = perf.n = 0; return r; } };
})();
