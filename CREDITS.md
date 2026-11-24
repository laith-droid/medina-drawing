# Credits

Medina Drawing is © 2026 laith-droid under the MIT License, written with Claude (Anthropic) as a contributor.
It stands on the following open-source work:

- **[shan-shui-inf](https://github.com/LingDong-/shan-shui-inf)** by Lingdong Huang (MIT): the seeded PRNG and
  Perlin noise (`build/prng-noise.js`, copied), the SVG output format the engine reads, and the method (procedural
  pen strokes, white bodies that hide what lies behind). Full licence: `build/SHANSHUI-LICENSE`, also embedded at
  the end of `index.html`.
- **[swarm-cursors](https://github.com/DhvanilPatel/swarm-cursors)** by Dhvanil Patel and Joel Califa's **Swarm**:
  the idea of a swarm of cursors drawing together. No code from them is used.

The medina generator (`build/medina-lib.js`) and the brush engine (`build/parse.js`, `build/vis.js`,
`build/app.js`) were written for this project.
