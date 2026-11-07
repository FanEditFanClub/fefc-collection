/* App-only To Be Catalogued > 01 - Testing. Links, not verified films. */
(function (root) {
  var FOLDER = 'application/vnd.google-apps.folder';
  var mounted = false;
  function countsLine(list) {
    var folders = 0, files = 0, magnets = 0, subs = 0, notes = 0, pages = 0;
    (list || []).forEach(function (f) {
      if (!f || !f.pt) return;
      var k = f.ptKind;
      if (k === 'folder') folders++;
      else if (k === 'magnet') magnets++;
      else if (k === 'subtitle') subs++;
      else if (k === 'note') notes++;
      else if (k === 'page') pages++;
      else files++;
    });
    return folders + ' folder links · ' + files + ' unverified file links'
      + (pages ? ' · ' + pages + ' other links' : '')
      + (magnets ? ' · ' + magnets + ' magnets (not video)' : '')
      + (subs ? ' · ' + subs + ' subtitles (not video)' : '')
      + (notes ? ' · ' + notes + ' notes' : '')
      + ' · 0 verified videos';
  }
  function row(parent, it, openLabel) {
    var folder = it.kind === 'folder';
    return {
      id: it.id, name: it.name, parent: parent,
      mimeType: folder ? FOLDER : 'application/octet-stream',
      pt: 1, ptKind: it.kind, ptLabel: it.label || (folder ? 'FOLDER' : 'LINK'),
      ptUrl: it.url || '', ptStatus: it.status || '', ptCatalog: it.catalog || '',
      ptSource: it.source_url || '', ptOpen: openLabel || 'Open link', ptLine: it.line, kind: 'link'
    };
  }
  function flatten(doc) {
    var out = [{ id: 'pt:testing', name: '01 - Testing', parent: doc.parent, mimeType: FOLDER, pt: 1, ptKind: 'folder', ptLabel: 'APP ONLY', ptStatus: doc.note || '', kind: 'link' }];
    (doc.providers || []).forEach(function (p) {
      out.push({ id: p.id, name: p.name, parent: 'pt:testing', mimeType: FOLDER, pt: 1, ptKind: 'folder', ptLabel: 'PROVIDER', ptOpen: p.open_label, ptStatus: 'Links only. In-app playback has not been verified.', kind: 'link' });
      (function walk(items, parent) {
        (items || []).forEach(function (it) {
          out.push(row(parent, it, p.open_label));
          if (it.children && it.children.length) walk(it.children, it.id);
        });
      })(p.items, p.id);
    });
    return out;
  }
  function mount(add) {
    if (mounted || !add) return Promise.resolve();
    return fetch('data/provider-testing.json').then(function (r) {
      if (!r.ok) throw new Error('provider-testing ' + r.status);
      return r.json();
    }).then(function (doc) {
      if (!doc || !doc.providers) return;
      add(flatten(doc));
      mounted = true;
    });
  }
  function detailsHTML(f, esc) {
    var open = f.ptOpen || 'Open link';
    var bits = ['<h1 class="lc-title">' + esc(f.name) + '</h1>',
      '<div class="lc-sub">' + esc(f.ptLabel || 'LINK') + ' · not a verified film</div>',
      '<p>' + esc(f.ptStatus || 'Destination contents and playback were not verified.') + '</p>'];
    if (f.ptCatalog) bits.push('<p class="src">Catalog: ' + esc(f.ptCatalog) + (f.ptLine != null ? ' · line ' + esc(String(f.ptLine)) : '') + '</p>');
    if (f.ptSource) bits.push('<p class="src">Listed in: ' + esc(f.ptSource) + '</p>');
    bits.push('<p class="src">In-app Play is not offered. No stream was verified, and no description or artwork was added.</p>');
    var acts = '<button type="button" class="pill p1" data-act="back">Back</button>';
    if (f.ptUrl) acts += '<a class="pill p3 det-ext" href="' + esc(f.ptUrl) + '" target="_blank" rel="noopener">' + esc(open) + '</a>';
    return '<div class="lc-body nopo"><div class="lc-info">' + bits.join('') + '<div class="det-acts">' + acts + '</div></div></div>';
  }
  root.FEFCTesting = { mount: mount, countsLine: countsLine, detailsHTML: detailsHTML };
})(typeof window !== 'undefined' ? window : globalThis);
