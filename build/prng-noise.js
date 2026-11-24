  // ---- Prng + Noise: copied from shan-shui-inf by Lingdong Huang (MIT) ----
  var Prng = new function() {
    this.s = 1234;
    this.p = 999979; //9887//983
    this.q = 999983; //9967//991
    this.m = this.p * this.q;
    this.hash = function(x) {
      var y = window.btoa(JSON.stringify(x));
      var z = 0;
      for (var i = 0; i < y.length; i++) {
        z += y.charCodeAt(i) * Math.pow(128, i);
      }
      return z;
    };
    this.seed = function(x) {
      if (x == undefined) {
        x = new Date().getTime();
      }
      var y = 0;
      var z = 0;
      function redo() {
        y = (Prng.hash(x) + z) % Prng.m;
        z += 1;
      }
      while (y % Prng.p == 0 || y % Prng.q == 0 || y == 0 || y == 1) {
        redo();
      }
      Prng.s = y;
      void(["int seed", Prng.s]);
      for (var i = 0; i < 10; i++) {
        Prng.next();
      }
    };
    this.next = function() {
      Prng.s = (Prng.s * Prng.s) % Prng.m;
      return Prng.s / Prng.m;
    };
    this.test = function(f) {
      var F =
        f ||
        function() {
          return Prng.next();
        };
      var t0 = new Date().getTime();
      var chart = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      for (var i = 0; i < 10000000; i++) {
        chart[Math.floor(F() * 10)] += 1;
      }
      void(chart);
      void("finished in " + (new Date().getTime() - t0));
      return chart;
    };
  }();
  Math.random = function() {
    return Prng.next();
  };
  Math.seed = function(x) {
    return Prng.seed(x);
  };
  //https://raw.githubusercontent.com/processing/p5.js/master/src/math/noise.js
  var Noise = new function() {
    var PERLIN_YWRAPB = 4;
    var PERLIN_YWRAP = 1 << PERLIN_YWRAPB;
    var PERLIN_ZWRAPB = 8;
    var PERLIN_ZWRAP = 1 << PERLIN_ZWRAPB;
    var PERLIN_SIZE = 4095;
    var perlin_octaves = 4;
    var perlin_amp_falloff = 0.5;
    var scaled_cosine = function(i) {
      return 0.5 * (1.0 - Math.cos(i * Math.PI));
    };
    var perlin;
    this.noise = function(x, y, z) {
      y = y || 0;
      z = z || 0;
      if (perlin == null) {
        perlin = new Array(PERLIN_SIZE + 1);
        for (var i = 0; i < PERLIN_SIZE + 1; i++) {
          perlin[i] = Math.random();
        }
      }
      if (x < 0) {
        x = -x;
      }
      if (y < 0) {
        y = -y;
      }
      if (z < 0) {
        z = -z;
      }
      var xi = Math.floor(x),
        yi = Math.floor(y),
        zi = Math.floor(z);
      var xf = x - xi;
      var yf = y - yi;
      var zf = z - zi;
      var rxf, ryf;
      var r = 0;
      var ampl = 0.5;
      var n1, n2, n3;
      for (var o = 0; o < perlin_octaves; o++) {
        var of = xi + (yi << PERLIN_YWRAPB) + (zi << PERLIN_ZWRAPB);
        rxf = scaled_cosine(xf);
        ryf = scaled_cosine(yf);
        n1 = perlin[of & PERLIN_SIZE];
        n1 += rxf * (perlin[(of + 1) & PERLIN_SIZE] - n1);
        n2 = perlin[(of + PERLIN_YWRAP) & PERLIN_SIZE];
        n2 += rxf * (perlin[(of + PERLIN_YWRAP + 1) & PERLIN_SIZE] - n2);
        n1 += ryf * (n2 - n1);
        of += PERLIN_ZWRAP;
        n2 = perlin[of & PERLIN_SIZE];
        n2 += rxf * (perlin[(of + 1) & PERLIN_SIZE] - n2);
        n3 = perlin[(of + PERLIN_YWRAP) & PERLIN_SIZE];
        n3 += rxf * (perlin[(of + PERLIN_YWRAP + 1) & PERLIN_SIZE] - n3);
        n2 += ryf * (n3 - n2);
        n1 += scaled_cosine(zf) * (n2 - n1);
        r += n1 * ampl;
        ampl *= perlin_amp_falloff;
        xi <<= 1;
        xf *= 2;
        yi <<= 1;
        yf *= 2;
        zi <<= 1;
        zf *= 2;
        if (xf >= 1.0) {
          xi++;
          xf--;
        }
        if (yf >= 1.0) {
          yi++;
          yf--;
        }
        if (zf >= 1.0) {
          zi++;
          zf--;
        }
      }
      return r;
    };
    this.noiseDetail = function(lod, falloff) {
      if (lod > 0) {
        perlin_octaves = lod;
      }
      if (falloff > 0) {
        perlin_amp_falloff = falloff;
      }
    };
    this.noiseSeed = function(seed) {
      var lcg = (function() {
        var m = 4294967296,
          a = 1664525,
          c = 1013904223,
          seed,
          z;
        return {
          setSeed: function(val) {
            z = seed = (val == null ? Math.random() * m : val) >>> 0;
          },
          getSeed: function() {
            return seed;
          },
          rand: function() {
            z = (a * z + c) % m;
            return z / m;
          },
        };
      })();
      lcg.setSeed(seed);
      perlin = new Array(PERLIN_SIZE + 1);
      for (var i = 0; i < PERLIN_SIZE + 1; i++) {
        perlin[i] = lcg.rand();
      }
    };
  }();
