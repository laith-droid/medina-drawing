// Shared by the worker (via toString) and node tests: SVG chunk -> ordered drawing primitives.
function PARSE_CHUNK(canv, VIEW_H) {
  var re = /<polyline points='([^']*)' style='fill:([^;]*);stroke:([^;]*);stroke-width:([^']*)'(?: data-k='(\w)')?\/>|<text font-size='([^']*)'[^>]*style='fill:([^']*)'[^>]*translate\(([^,]*),([^)]*)\) rotate\(([^)]*)\)'>([^<]*)<\/text>/g;
  var pts = [], prims = [], m;
  var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  function clear(c) {
    c = c.trim();
    if (c === "none" || c === "transparent") return true;
    var a = /rgba\([^,]*,[^,]*,[^,]*,\s*([^)]*)\)/.exec(c);
    return a ? parseFloat(a[1]) <= 0.001 : false;
  }
  while ((m = re.exec(canv))) {
    if (m[11] !== undefined) {
      var tx = +m[8], ty = +m[9], sz = +m[6];
      if (!isFinite(tx) || !isFinite(ty) || ty > VIEW_H + sz || ty < -sz) continue;
      prims.push({ t: "x", o: pts.length / 2, n: 0, fil: m[7], txt: m[11], size: sz, rot: +m[10], tx: tx, ty: ty,
        bb: [tx - sz * 2, ty - sz, tx + sz * 2, ty + sz], len: sz * 2 });
      continue;
    }
    var raw = m[1].trim().split(/\s+/), arr = [], bad = false;
    for (var i = 0; i < raw.length; i++) {
      var c = raw[i].indexOf(","), x = +raw[i].slice(0, c), y = +raw[i].slice(c + 1);
      if (!isFinite(x) || !isFinite(y) || x <= -999 || y <= -999) { bad = true; break; }
      arr.push(x, y);
    }
    var n = arr.length / 2;
    if (bad || n < 2) continue;
    var fil = m[2], str = m[3], wid = parseFloat(m[4]) || 0, k = m[5];
    var fv = !clear(fil), sv = wid > 0 && !clear(str);
    var t;
    if ((k === "s" || k === "b") && n >= 5 && (n - 3) % 2 === 0) t = "r";      // ribbon: brush stroke or leaf blob
    else if (!fv && sv) t = "l";                                               // open line
    else if (fv && sv) t = "o";                                                // outlined shape: trace, fill on finish
    else if (fv) t = "w";                                                      // wash: fill only
    else continue;
    var bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
    for (i = 0; i < arr.length; i += 2) {
      if (arr[i] < bx0) bx0 = arr[i]; if (arr[i] > bx1) bx1 = arr[i];
      if (arr[i + 1] < by0) by0 = arr[i + 1]; if (arr[i + 1] > by1) by1 = arr[i + 1];
    }
    var pad = wid / 2 + 1;
    bx0 -= pad; by0 -= pad; bx1 += pad; by1 += pad;
    if (by0 > VIEW_H || by1 < 0) continue; // never visible
    // trace length = length of the path the brush will follow
    var len = 0;
    if (t === "r") {
      var mm = (n - 3) / 2, px = arr[0], py = arr[1];
      for (var j = 1; j <= mm + 1; j++) {
        var lx = arr[2 * j], ly = arr[2 * j + 1], ri = 2 * mm + 2 - j, rx = arr[2 * ri], ry = arr[2 * ri + 1];
        var cx = (lx + rx) / 2, cy = (ly + ry) / 2;
        len += Math.hypot(cx - px, cy - py); px = cx; py = cy;
      }
    } else if (t === "w") {
      len = 0; // decided by the brush (zigzag)
    } else {
      for (i = 2; i < arr.length; i += 2) len += Math.hypot(arr[i] - arr[i - 2], arr[i + 1] - arr[i - 1]);
    }
    prims.push({ t: t, o: pts.length / 2, n: n, fil: fil, str: str, wid: wid, bb: [bx0, by0, bx1, by1], len: len });
    for (i = 0; i < arr.length; i++) pts.push(arr[i]);
    if (bx0 < x0) x0 = bx0; if (bx1 > x1) x1 = bx1; if (by0 < y0) y0 = by0; if (by1 > y1) y1 = by1;
  }
  return { b: [x0, y0, x1, y1], pts: new Float32Array(pts), prims: prims };
}
if (typeof module !== "undefined") module.exports = PARSE_CHUNK;
