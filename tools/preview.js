// node tools/preview.js SEED WIDTH out.svg  -> raw generator output in paint order (no swarm)
const fs = require("fs"), path = require("path");
const B = path.join(__dirname, "..", "build");
const src = "function LIB(window){var MEM;\n" + fs.readFileSync(B + "/prng-noise.js", "utf8") + fs.readFileSync(B + "/medina-lib.js", "utf8") +
  "\nreturn {MEM:MEM, chunkloader:chunkloader, Noise:Noise, setNight:setNight};}";
const L = new Function(src + "; return LIB;")()({ btoa: (s) => Buffer.from(s, "binary").toString("base64") });
const seed = process.argv[2] || "1", W = +(process.argv[3] || 2400), out = process.argv[4] || "/tmp/m.svg";
if (process.argv[5] === "night") L.setNight(true);
Math.seed(seed); L.Noise.noise(0, 0); // paper() initialises noise first in the real worker
const all = []; let seq = 0;
while (L.MEM.xmax < W + 600) { L.MEM.chunks = []; L.chunkloader(L.MEM.xmin + 512, Math.max(L.MEM.xmax - 511, 512)); L.MEM.chunks.forEach(c => all.push({ ...c, seq: seq++ })); }
all.sort((a, b) => a.y - b.y || a.seq - b.seq);
let svg = all.map(c => c.canv).join("");
fs.writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="700" viewBox="0 0 ${W} 700" style="background:${process.argv[5] === "night" ? "#151b31" : "#f4efe4"}">${svg}</svg>`);
console.log("objects", all.length, "polylines", (svg.match(/<polyline/g) || []).length, "bytes", svg.length);
