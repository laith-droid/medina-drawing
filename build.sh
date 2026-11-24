#!/usr/bin/env bash
# Assemble build/ into a single self-contained index.html
set -euo pipefail
cd "$(dirname "$0")"
python3 - <<'PY'
t = open('build/template.html').read()
t = t.replace('/*__LIB__*/', open('build/prng-noise.js').read() + open('build/medina-lib.js').read())
t = t.replace('/*__PARSE__*/', open('build/parse.js').read())
t = t.replace('/*__VIS__*/', open('build/vis.js').read())
t = t.replace('/*__APP__*/', open('build/app.js').read())
t = t.replace('/*__LICENSE__*/', open('build/SHANSHUI-LICENSE').read())
open('index.html', 'w').write(t)
# artifact variant: the publisher supplies doctype/html/head/body
import re
a = re.sub(r'<!doctype html>\s*<html lang="en">\s*<head>\s*<meta charset="utf-8">\s*<meta name="viewport"[^>]*>\s*', '', t)
a = a.replace('</head>\n<body>\n', '').replace('</body>\n</html>\n', '')
open('artifact.html', 'w').write(a)
PY
echo "index.html: $(wc -c < index.html) bytes"
