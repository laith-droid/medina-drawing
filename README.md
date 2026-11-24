# Medina Drawing

An endless hillside medina (whitewashed houses, domes, minarets, kasbah towers, palms and city gates) drawn live
by a crew of 30 brush cursors. Black ink on paper, with gold and blue accents.

It is a sibling of Mountain Drawing (the `shanshui-swarm` repo) and uses the same engine. Only the generator differs.

- `index.html` is the whole program. `./build.sh` assembles it from `build/`.
- Served by Mountain Drawing's nginx container as `http://<host>:8795/medina.html`.
  Deploy: `./build.sh && cp index.html <shanshui-swarm checkout>/site/medina.html`.
- `build/medina-lib.js` is the city generator, written for this project. It emits the same per-object SVG format as
  shan-shui-inf: pen lines are thin ribbons (`data-k='s'`), white fills are bodies that hide what lies behind them,
  and other fills are colour or ink washes. Objects are keyed by depth (row base y, so nearer rows land later).
- `build/prng-noise.js`: the seeded PRNG and Perlin noise from shan-shui-inf (MIT, `build/SHANSHUI-LICENSE`).
- `build/parse.js`, `vis.js`, `app.js`: the Mountain Drawing engine (parse to primitives, drop what is hidden,
  brushes trace the surviving lines). Changes from the original are the names, layer ranks, paper tone and camera pace.
- `tools/preview.js SEED WIDTH out.svg` dumps the generator's raw SVG (no swarm) for fast iteration
  (`rsvg-convert out.svg -o out.png`). `tools/cdp-shot.js URL out.png SECONDS [W H]` runs the real page in headless
  Chromium and screenshots it.

Composition, back to front: sky (sun or crescent with stars, cloud bands, birds), two mountain ridges, a hazy far
skyline, desert dunes where the city thins out, eleven rows of buildings up a hill whose height follows noise, and
in front a crenellated city wall with a horseshoe gate, or palms in the open desert.

Keys: Space pause, 1/2/3 speed, L names, N new city, H toolbar, F fullscreen. `?seed=` picks a city, `?tv` hides the toolbar.
