/* FEFC shell for Samsung Tizen TVs.
   The collection page inside the iframe already moves with the D-pad (the site treats a Tizen
   user agent as a TV). This file registers the extra remote keys, keeps the update dialog off
   the intro, and plays a stream on AVPlay when the page asks. */
(function () {
  var SITE = 'https://collection.faneditfanclub.com';
  var VERSION_URL = 'https://fefc-collection.pages.dev/kodi-app/version.json';
  var site = document.getElementById('site');
  var updateBox = document.getElementById('update');
  var updateText = document.getElementById('update-text');
  var stage = document.getElementById('stage');
  var stageTitle = document.getElementById('stage-title');
  var stageStatus = document.getElementById('stage-status');
  var localBuild = null;
  var remote = null;
  var introDone = false;
  var playing = null;

  function allowed(url) {
    try {
      var u = new URL(url);
      return u.protocol === 'https:' &&
        (u.hostname === 'fefc-collection.pages.dev' || u.hostname === 'collection.faneditfanclub.com') &&
        u.pathname.indexOf('/kodi-app/') === 0;
    } catch (e) {
      return false;
    }
  }

  function fromSite(ev) {
    return ev.origin === SITE || ev.origin === 'https://fefc-collection.pages.dev';
  }

  function post(msg) {
    try { site.contentWindow.postMessage(msg, SITE); } catch (e) {}
  }

  function focusSite() {
    if (!updateBox.hidden || !stage.hidden) return;
    try { site.focus(); } catch (e) {}
  }

  function registerKeys() {
    var names = ['MediaPlay', 'MediaPause', 'MediaPlayPause', 'MediaStop', 'MediaRewind', 'MediaFastForward', 'Exit', 'Info'];
    if (!window.tizen || !tizen.tvinputdevice || !tizen.tvinputdevice.registerKey) return;
    names.forEach(function (name) {
      try { tizen.tvinputdevice.registerKey(name); } catch (e) {}
    });
  }

  function buttons(root) {
    return [].slice.call(root.querySelectorAll('button'));
  }

  function moveFocus(root, dir) {
    var list = buttons(root);
    var i = list.indexOf(document.activeElement);
    if (i < 0) i = 0;
    else i = (i + dir + list.length) % list.length;
    try { list[i].focus(); } catch (e) {}
  }

  function showUpdate(text) {
    updateText.textContent = text;
    updateBox.hidden = false;
    var first = updateBox.querySelector('button');
    if (first) try { first.focus(); } catch (e) {}
  }

  function hideUpdate() {
    updateBox.hidden = true;
    focusSite();
  }

  function tizenRecord(manifest) {
    var block = manifest && manifest.platforms && manifest.platforms.tizen;
    if (!block) return null;
    if (block.url) return block;
    var arch = block.arch || {};
    return arch.all || arch.tv || null;
  }

  function sameReleaseText(manifest) {
    var label = (manifest.version || '') + (manifest.build != null ? ' (build ' + manifest.build + ')' : '');
    return label.trim();
  }

  function considerUpdate() {
    if (!introDone || !remote || !localBuild || updateBox.hidden === false) return;
    var newer = window.FEFCVersion.releaseIsNewer(remote.version, remote.build, localBuild.version, localBuild.build);
    if (!newer) return;
    var rec = tizenRecord(remote);
    var label = sameReleaseText(remote);
    if (!rec || !rec.url || !allowed(rec.url)) {
      showUpdate('FEFC ' + label + ' is published. The Tizen package is not on the server yet, so there is nothing to install. Mac, webOS, and Android use this same version.');
      return;
    }
    showUpdate('FEFC ' + label + ' is ready. This TV cannot install a .wgt by itself. Download ' + rec.filename + ' on a computer and install it with the same Samsung certificate. ' + rec.url);
  }

  function loadJson(url, done) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { done(JSON.parse(xhr.responseText)); } catch (e) { done(null); }
      } else done(null);
    };
    xhr.onerror = function () { done(null); };
    xhr.send();
  }

  function av() {
    return window.webapis && webapis.avplay;
  }

  function showStage(msg) {
    playing = msg;
    document.body.classList.add('playing');
    stage.hidden = false;
    stageTitle.textContent = msg.title || 'FEFC';
    stageStatus.textContent = 'Playing';
    var pp = document.getElementById('stage-pp');
    if (pp) pp.textContent = 'Pause';
    try { document.getElementById('stage-pp').focus(); } catch (e) {}
  }

  function closeStage() {
    document.body.classList.remove('playing');
    stage.hidden = true;
    playing = null;
    if (av()) {
      try { webapis.avplay.stop(); } catch (e) {}
      try { webapis.avplay.close(); } catch (e) {}
    }
    post({ type: 'fefc-tizen-closed' });
    focusSite();
  }

  function playAv(msg) {
    if (!msg || !msg.url || !av()) {
      post({ type: 'fefc-tizen-nack' });
      return;
    }
    try {
      var player = webapis.avplay;
      try { player.stop(); } catch (e) {}
      try { player.close(); } catch (e) {}
      player.open(msg.url);
      player.setDisplayRect(0, 0, window.innerWidth || 1920, window.innerHeight || 1080);
      player.setListener({
        onbufferingstart: function () { stageStatus.textContent = 'Buffering'; },
        onbufferingcomplete: function () { stageStatus.textContent = 'Playing'; },
        onstreamcompleted: function () { closeStage(); },
        onerror: function () {
          post({ type: 'fefc-tizen-nack' });
          closeStage();
        }
      });
      player.prepareAsync(function () {
        player.play();
        showStage(msg);
        post({ type: 'fefc-tizen-ack', id: msg.id || '' });
      }, function () {
        post({ type: 'fefc-tizen-nack' });
      });
    } catch (e) {
      post({ type: 'fefc-tizen-nack' });
    }
  }

  function toggleAv() {
    if (!av() || !playing) return;
    try {
      var state = webapis.avplay.getState();
      if (state === 'PLAYING') {
        webapis.avplay.pause();
        document.getElementById('stage-pp').textContent = 'Play';
      } else {
        webapis.avplay.play();
        document.getElementById('stage-pp').textContent = 'Pause';
      }
    } catch (e) {}
  }

  function seekAv(delta) {
    if (!av() || !playing) return;
    try {
      var now = webapis.avplay.getCurrentTime();
      var dur = webapis.avplay.getDuration();
      var next = Math.max(0, Math.min(dur || (now + delta), now + delta * 1000));
      webapis.avplay.seekTo(next);
    } catch (e) {}
  }

  window.addEventListener('message', function (ev) {
    if (!fromSite(ev) || !ev.data) return;
    var d = ev.data;
    if (d.type === 'fefc-tizen-ready') {
      introDone = true;
      considerUpdate();
    } else if (d.type === 'fefc-tizen-play') {
      playAv(d);
    } else if (d.type === 'fefc-tizen-stop') {
      if (playing) closeStage();
    }
  });

  document.getElementById('update-later').addEventListener('click', hideUpdate);
  document.getElementById('update-go').addEventListener('click', hideUpdate);
  document.getElementById('stage-back').addEventListener('click', closeStage);
  document.getElementById('stage-pp').addEventListener('click', toggleAv);
  document.getElementById('stage-rew').addEventListener('click', function () { seekAv(-10); });
  document.getElementById('stage-fwd').addEventListener('click', function () { seekAv(10); });

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    var back = k === 10009 || k === 461 || k === 27 || k === 8;
    var ok = k === 13 || k === 23;
    if (!updateBox.hidden) {
      if (k === 38 || k === 40) { e.preventDefault(); moveFocus(updateBox, k === 38 ? -1 : 1); }
      else if (back) { e.preventDefault(); hideUpdate(); }
      else if (ok && document.activeElement && document.activeElement.click) { e.preventDefault(); document.activeElement.click(); }
      return;
    }
    if (!stage.hidden) {
      e.preventDefault();
      if (back) closeStage();
      else if (k === 37) seekAv(-10);
      else if (k === 39) seekAv(10);
      else if (k === 38 || k === 40) moveFocus(stage, k === 38 ? -1 : 1);
      else if (ok || k === 415 || k === 19 || k === 179) toggleAv();
      return;
    }
  });

  registerKeys();
  loadJson('fefc-build.json', function (cur) { localBuild = cur || {}; considerUpdate(); });
  loadJson(VERSION_URL + '?t=' + Date.now(), function (manifest) { remote = manifest; considerUpdate(); });
  setTimeout(function () { introDone = true; considerUpdate(); }, 25000);
  site.addEventListener('load', function () { setTimeout(focusSite, 600); });
})();
