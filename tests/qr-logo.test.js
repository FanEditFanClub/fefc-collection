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
});
