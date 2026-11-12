const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');

const root = path.join(__dirname, '..');
const lib = path.join(root, 'kodi-src/plugin.video.fefc/resources/lib');

test('every FEFC QR bakes the logo into the PNG and still scans', () => {
  const logo = path.join(root, 'kodi-src/plugin.video.fefc/resources/media/fefc-logo.png');
  const asset = path.join(root, 'assets/fefc-logo.png');
  assert.ok(fs.existsSync(logo) && fs.statSync(logo).size > 1000);
  assert.ok(fs.existsSync(asset) && fs.statSync(asset).size > 1000);
  const verify = fs.readFileSync(path.join(root, 'tools/verify_apk_cues.py'), 'utf8');
  assert.match(verify, /resources\/media\/fefc-logo\.png/);
  const webos = fs.readFileSync(path.join(lib, 'webosguide.py'), 'utf8');
  assert.match(webos, /qrdraw\.write_qr_png/);
  assert.doesNotMatch(webos, /error='m'/);
  const app = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
  const sync = fs.readFileSync(path.join(root, 'src/syncui.js'), 'utf8');
  assert.match(app, /mountFefc/);
  assert.match(sync, /sp-qr-slot/);
  assert.doesNotMatch(app, /qrcode\(0,'M'\)/);
  assert.doesNotMatch(sync, /qrcode\(0,'M'\)/);
  const r = spawnSync('python3', ['-c', `
import sys
sys.path.insert(0, ${JSON.stringify(lib)})
import qrdraw
from pyzbar.pyzbar import decode
from PIL import Image
urls = [
    'https://www.patreon.com/cw/FanEditFanClub',
    'https://docs.google.com/forms/d/e/1FAIpQLSe_MZOis6_4DFTkrbSu2SiP0bGTMuCRruUPeemutI4uZ7nIbA/viewform',
    'https://collection.faneditfanclub.com/samsung',
    'https://fefc-collection.pages.dev/kodi-app/FEFC.apk',
    'https://collection.faneditfanclub.com/lg-update',
]
for url in urls:
    path = '/tmp/fefc-qr-test.png'
    info = qrdraw.write_qr_png(path, url, size=600, quiet=4)
    assert info['error'] == 'H'
    im = Image.open(path).convert('RGB')
    got = decode(im)
    assert got and got[0].data.decode() == url, (url, got)
    side = info['side']
    px = info['px']
    n = info['modules']
    box = max(7, int(n * 0.20))
    if box % 2 == 0:
        box += 1
    span = box + 2
    origin = 4 + (n - span) // 2
    black = white = 0
    x0, y0 = origin * px, origin * px
    x1 = (origin + span) * px
    for y in range(y0, x1):
        for x in range(x0, x1):
            p = im.getpixel((x, y))
            if p[0] < 40:
                black += 1
            elif p[0] > 250 and p[1] > 250 and p[2] > 250:
                white += 1
    assert black > (x1 - x0) * (x1 - y0) * 0.15, (url, black, white)
    assert white > 0
print('ok', len(urls))
`], {encoding: 'utf8', cwd: root});
  if (r.status !== 0)
    throw new Error(r.stderr || r.stdout);
  assert.match(r.stdout, /^ok /);

  for (const file of ['src/qrgen.js', 'qrgen.js']) {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(src, /fefcGrid/);
    assert.match(src, /qrcode\(0,'H'\)/);
    assert.doesNotMatch(src, /source-in/);
  }
  const qrcode = require(path.join(root, 'src/qrgen.js'));
  const built = require(path.join(root, 'qrgen.js'));
  const logoAlpha = spawnSync('python3', ['-c', `
import sys, json, base64
sys.path.insert(0, ${JSON.stringify(lib)})
import qrdraw
w, h, rows = qrdraw._read_rgba(${JSON.stringify(logo)})
alpha = bytes(pix[3] for line in rows for pix in line)
json.dump({'w': w, 'h': h, 'a': base64.b64encode(alpha).decode()}, sys.stdout)
`], {encoding: 'utf8', cwd: root});
  if (logoAlpha.status !== 0)
    throw new Error(logoAlpha.stderr || logoAlpha.stdout);
  const logoPx = JSON.parse(logoAlpha.stdout);
  const alpha = Buffer.from(logoPx.a, 'base64');
  function inkAt(mx, my, box) {
    const y0 = Math.floor(my * logoPx.h / box);
    const y1 = Math.max(y0 + 1, Math.floor((my + 1) * logoPx.h / box));
    const x0 = Math.floor(mx * logoPx.w / box);
    const x1 = Math.max(x0 + 1, Math.floor((mx + 1) * logoPx.w / box));
    let ink = 0, total = 0;
    for (let y = y0; y < Math.min(logoPx.h, y1); y++) {
      for (let x = x0; x < Math.min(logoPx.w, x1); x++) {
        total++;
        if (alpha[y * logoPx.w + x] >= 40) ink++;
      }
    }
    return total && ink / total >= 0.08;
  }
  const urls = [
    'https://www.patreon.com/cw/FanEditFanClub',
    'https://docs.google.com/forms/d/e/1FAIpQLSe_MZOis6_4DFTkrbSu2SiP0bGTMuCRruUPeemutI4uZ7nIbA/viewform',
    'https://collection.faneditfanclub.com/samsung',
    'https://fefc-collection.pages.dev/kodi-app/FEFC.apk',
    'https://collection.faneditfanclub.com/lg-update',
  ];
  for (const make of [qrcode.fefcGrid, built.fefcGrid]) {
    for (const url of urls) {
      const made = make(url, inkAt);
      assert.equal(made.error, 'H');
      const cell = 8;
      const px = made.side * cell;
      const pgm = Buffer.alloc(px * px, 255);
      let black = 0, white = 0;
      const box = made.box % 2 === 0 ? made.box + 1 : made.box;
      const span = box + 2;
      const origin = made.quiet + Math.floor((made.n - span) / 2);
      for (let i = 0; i < made.grid.length; i++) {
        const x = i % made.side, y = Math.floor(i / made.side);
        const on = made.grid[i] ? 1 : 0;
        if (x >= origin && x < origin + span && y >= origin && y < origin + span) {
          if (on) black++;
          else white++;
        }
        if (!on) continue;
        for (let dy = 0; dy < cell; dy++) {
          const row = (y * cell + dy) * px + x * cell;
          pgm.fill(0, row, row + cell);
        }
      }
      const area = span * span;
      assert.ok(black > area * 0.15, url + ' center black ' + black);
      assert.ok(white > 0, url);
      fs.writeFileSync('/tmp/fefc-qr-web.pgm', Buffer.concat([
        Buffer.from('P5\n' + px + ' ' + px + '\n255\n'),
        pgm,
      ]));
      const dec = spawnSync('python3', ['-c', `
from pyzbar.pyzbar import decode
from PIL import Image
got = decode(Image.open('/tmp/fefc-qr-web.pgm'))
print(got[0].data.decode() if got else '')
`], {encoding: 'utf8'});
      if (dec.status !== 0)
        throw new Error(dec.stderr || dec.stdout);
      assert.equal(dec.stdout.trim(), url);
    }
  }
});
