// Worker side: work out what survives shan-shui's own erasing (white bodies and opaque patches painted over
// earlier lines), so brushes paint only the resulting linework. Shared with node tests via module.exports.
function VIS_LIB(VIEW_H) {
  var RES = 1; // mask resolution, world units per cell

  // ---- polygon scanline fill (nonzero winding, like SVG/canvas) over a mask window ----
  function spans(P, o, n, win, cb) {
    var rows = win.h, buckets = null;
    var ymin = 1e9, ymax = -1e9;
    for (var i = 0; i < n; i++) { var y = P[2 * (o + i) + 1]; if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
    var r0 = Math.max(0, Math.floor((ymin - win.y0) / RES)), r1 = Math.min(rows - 1, Math.ceil((ymax - win.y0) / RES));
    if (r1 < r0) return;
    buckets = new Array(r1 - r0 + 1);
    for (i = 0; i < n; i++) {
      var a = o + i, b = o + ((i + 1) % n);
      var x0 = P[2 * a], y0 = P[2 * a + 1], x1 = P[2 * b], y1 = P[2 * b + 1];
      if (y0 === y1) continue;
      var dir = y1 > y0 ? 1 : -1;
      var ya = Math.min(y0, y1), yb = Math.max(y0, y1);
      var ra = Math.max(r0, Math.ceil((ya - win.y0) / RES - 0.5)), rb = Math.min(r1, Math.ceil((yb - win.y0) / RES - 0.5) - 1);
      for (var r = ra; r <= rb; r++) {
        var yc = win.y0 + (r + 0.5) * RES;
        var x = x0 + (x1 - x0) * (yc - y0) / (y1 - y0);
        var bk = buckets[r - r0] || (buckets[r - r0] = []);
        bk.push(x, dir);
      }
    }
    for (r = r0; r <= r1; r++) {
      var bk2 = buckets[r - r0];
      if (!bk2) continue;
      var pairs = [];
      for (i = 0; i < bk2.length; i += 2) pairs.push([bk2[i], bk2[i + 1]]);
      pairs.sort(function (p, q) { return p[0] - q[0]; });
      var wind = 0;
      for (i = 0; i < pairs.length; i++) {
        var prev = wind;
        wind += pairs[i][1];
        if (prev === 0 && wind !== 0) var xs = pairs[i][0];
        else if (prev !== 0 && wind === 0) {
          var c0 = Math.max(0, Math.round((xs - win.x0) / RES)), c1 = Math.min(win.w, Math.round((pairs[i][0] - win.x0) / RES));
          if (c1 > c0) { if (cb(r, c0, c1)) return; }
        }
      }
    }
  }
  function fill(mask, win, P, o, n) {
    spans(P, o, n, win, function (r, c0, c1) { mask.fill(1, r * win.w + c0, r * win.w + c1); return false; });
  }
  function anyVisible(mask, win, P, o, n) {
    var vis = false;
    spans(P, o, n, win, function (r, c0, c1) {
      var base = r * win.w;
      for (var c = c0; c < c1; c++) if (!mask[base + c]) { vis = true; return true; }
      return false;
    });
    return vis;
  }
  function covered(mask, win, x, y) {
    var c = Math.floor((x - win.x0) / RES), r = Math.floor((y - win.y0) / RES);
    if (c < 0 || r < 0 || c >= win.w || r >= win.h) return y >= 0 && y <= VIEW_H ? false : true;
    return mask[r * win.w + c] === 1;
  }

  // ---- traces: the path a brush follows ----
  function trace(P, p) {
    var tr = [];
    if (p.t === "r") {
      var m = (p.n - 3) / 2;
      for (var j = 0; j <= m + 1; j++) {
        var a = p.o + j, b = p.o + p.n - 1 - j;
        tr.push((P[2 * a] + P[2 * b]) / 2, (P[2 * a + 1] + P[2 * b + 1]) / 2);
      }
    } else for (var i = 0; i < p.n; i++) tr.push(P[2 * (p.o + i)], P[2 * (p.o + i) + 1]);
    return tr;
  }
  // visible stretches along a trace, as [d0,d1, d2,d3, ...] in distance units
  function intervals(mask, win, tr) {
    var out = [], d = 0, on = false, start = 0, step = 0.75;
    for (var k = 0; k < tr.length - 2; k += 2) {
      var x0 = tr[k], y0 = tr[k + 1], x1 = tr[k + 2], y1 = tr[k + 3], L = Math.hypot(x1 - x0, y1 - y0);
      var ns = Math.max(1, Math.ceil(L / step));
      for (var s = 0; s < ns; s++) {
        var f = s / ns, vis = !covered(mask, win, x0 + (x1 - x0) * f, y0 + (y1 - y0) * f);
        var dd = d + L * f;
        if (vis && !on) { on = true; start = dd; } else if (!vis && on) { on = false; out.push(start, dd); }
      }
      d += L;
    }
    if (tr.length >= 2) {
      var vEnd = !covered(mask, win, tr[tr.length - 2], tr[tr.length - 1]);
      if (vEnd && !on) { on = true; start = d; }
    }
    if (on) out.push(start, d);
    // merge tiny gaps, drop slivers
    var m = [];
    for (var i = 0; i < out.length; i += 2) {
      if (m.length && out[i] - m[m.length - 1] < 1.5) m[m.length - 1] = out[i + 1];
      else m.push(out[i], out[i + 1]);
    }
    var res = [];
    for (i = 0; i < m.length; i += 2) if (m[i + 1] - m[i] >= 0.5 || (m.length === 2 && d < 0.5)) res.push(m[i], m[i + 1]);
    return { iv: res, L: d };
  }

  function opaqueColor(c) {
    c = c.trim();
    if (c === "white" || /^#/.test(c) || /^rgb\(/.test(c)) return true;
    var a = /rgba\([^,]*,[^,]*,[^,]*,\s*([^)]*)\)/.exec(c);
    return a ? parseFloat(a[1]) >= 0.98 : false;
  }
  function isWhite(c) { c = c.replace(/\s/g, ""); return c === "white" || c === "#fff" || c === "#ffffff" || c === "rgb(255,255,255)" || /^rgba\(255,255,255,/.test(c); }
  function ov(a, b) { return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]; }

  // Prepare one object (after PARSE_CHUNK): classify occluders and paint.
  function classify(obj) {
    for (var i = 0; i < obj.prims.length; i++) {
      var p = obj.prims[i];
      if (p.t === "o" && p.str.replace(/\s/g, "") === p.fil.replace(/\s/g, "")) { p.t = "w"; p.seam = true; } // outline only hides seams
      p.occ = (p.t === "w" || p.t === "o") && opaqueColor(p.fil);
      p.paint = !(p.t === "w" && isWhite(p.fil)); // pure white body: an eraser, never painted
    }
  }

  // Finalize an object against everything drawn after it (its own later prims + later objects).
  function finalize(obj, later) {
    var P = obj.pts, prims = obj.prims;
    var y0 = Math.max(0, Math.floor(obj.b[1])), y1 = Math.min(VIEW_H, Math.ceil(obj.b[3]));
    var x0 = Math.floor(obj.b[0]), x1 = Math.ceil(obj.b[2]);
    var win = { x0: x0, y0: y0, w: Math.max(1, Math.ceil((x1 - x0) / RES)), h: Math.max(1, Math.ceil((y1 - y0) / RES)) };
    var mask = new Uint8Array(win.w * win.h);
    // occluders from objects in front, kept for exact clipping on the main thread too
    var ext = [], extPolys = [];
    for (var k = 0; k < later.length; k++) {
      var L = later[k];
      for (var i = 0; i < L.prims.length; i++) {
        var q = L.prims[i];
        if (!q.occ || !ov(q.bb, obj.b)) continue;
        fill(mask, win, L.pts, q.o, q.n);
        extPolys.push({ o: ext.length / 2, n: q.n, bb: q.bb });
        for (var j = 0; j < q.n; j++) ext.push(L.pts[2 * (q.o + j)], L.pts[2 * (q.o + j) + 1]);
      }
    }
    // reverse sweep: each prim sees only what is drawn after it
    var stats = { ink: 0, kept: 0, hidden: 0, erasers: 0 };
    for (i = prims.length - 1; i >= 0; i--) {
      var p = prims[i];
      p.vis = false;
      if (p.t === "x") { p.vis = true; continue; }
      if (p.paint) {
        if (p.t === "r" || p.t === "l" || p.t === "o") {
          var tr = trace(P, p), r = intervals(mask, win, tr);
          stats.ink += r.L;
          p.iv = r.iv;
          var visLen = 0;
          for (j = 0; j < r.iv.length; j += 2) visLen += r.iv[j + 1] - r.iv[j];
          stats.kept += visLen;
          p.vis = r.iv.length > 0;
          if (p.t === "o" && !p.vis && !isWhite(p.fil) && anyVisible(mask, win, P, p.o, p.n)) { p.vis = true; p.iv = []; }
        } else if (p.t === "w") {
          p.vis = anyVisible(mask, win, P, p.o, p.n);
        }
        if (!p.vis) stats.hidden++;
      } else stats.erasers++;
      if (p.occ) fill(mask, win, P, p.o, p.n);
    }
    // work items: single strokes, or runs of consecutive fills merged into one wash
    var items = [], g = null;
    function closeGroup() { if (g) { items.push(g); g = null; } }
    for (i = 0; i < prims.length; i++) {
      p = prims[i];
      if (!p.paint || !p.vis) { if (p.occ) closeGroup(); continue; } // a hidden eraser between fills still splits a wash
      if (p.t === "w") {
        if (g && g.opq === p.occ && g.m.length < 80) {
          var nb = [Math.min(g.bb[0], p.bb[0]), Math.min(g.bb[1], p.bb[1]), Math.max(g.bb[2], p.bb[2]), Math.max(g.bb[3], p.bb[3])];
          if (nb[2] - nb[0] <= 150 && nb[3] - nb[1] <= 150) { g.m.push(i); g.bb = nb; continue; }
        }
        closeGroup();
        g = { k: "g", m: [i], bb: p.bb.slice(), opq: p.occ };
        continue;
      }
      closeGroup();
      items.push({ k: p.t, m: [i], bb: p.bb.slice(), opq: p.occ && p.paint });
    }
    closeGroup();
    // an item must land after any earlier opaque item it overlaps (otherwise that fill would cover it)
    var opq = [];
    for (i = 0; i < items.length; i++) {
      var it = items[i], deps = [];
      for (j = 0; j < opq.length; j++) if (ov(items[opq[j]].bb, it.bb)) deps.push(opq[j]);
      it.deps = deps;
      it.last = it.m[it.m.length - 1];
      if (it.opq) opq.push(i);
    }
    obj.items = items;
    obj.ext = new Float32Array(ext);
    obj.extPolys = extPolys;
    obj.stats = stats;
    return obj;
  }
  return { classify: classify, finalize: finalize, ov: ov };
}
if (typeof module !== "undefined") module.exports = VIS_LIB;
