// node tools/cdp-shot.js URL out.png seconds [w h]  — drive headless chromium over CDP (no playwright needed)
const { spawn } = require("child_process");
const [url, out, secs = "60", W = "1600", H = "900"] = process.argv.slice(2);
const port = 9333 + Math.floor(Math.random() * 500);
const ch = spawn("chromium", ["--headless=new", "--no-sandbox", "--hide-scrollbars", `--remote-debugging-port=${port}`, `--window-size=${W},${H}`, "--user-data-dir=" + require("os").tmpdir() + "/cdp-" + port, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  let ws;
  for (let i = 0; i < 50; i++) { try { const l = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const pg = l.find((t) => t.type === "page"); if (pg) { ws = new WebSocket(pg.webSocketDebuggerUrl); break; } } catch (e) {} await sleep(200); }
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = {};
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true })).result?.result?.value;
  await send("Page.enable"); await send("Runtime.enable");
  await send("Page.navigate", { url });
  const t0 = Date.now(), total = +secs * 1000;
  while (Date.now() - t0 < total) {
    await sleep(Math.min(10000, total - (Date.now() - t0)));
    console.log(Math.round((Date.now() - t0) / 1000) + "s", await ev(`(function(){var S=__swarm.state;return JSON.stringify({camX:Math.round(S.camX),jobs:S.jobs.length,strokes:S.strokes,started:S.started,busy:__swarm.brushes.filter(b=>b.state!=='idle').length,perf:__swarm.perf()})})()`));
  }
  const shot = await send("Page.captureScreenshot", { format: "png" });
  require("fs").writeFileSync(out, Buffer.from(shot.result.data, "base64"));
  ch.kill(); process.exit(0);
})().catch((e) => { console.error(e); ch.kill(); process.exit(1); });
