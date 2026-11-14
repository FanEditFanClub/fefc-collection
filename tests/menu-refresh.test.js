'use strict';
// The overlay watcher sits outside the app's scope, so it used to call menu() and hit a ReferenceError
// that try/catch swallowed: the top menu never redrew when the details page opened or closed.
// This harness runs the real menu code from src/app.js and the real watcher in jsdom.
// jsdom is not a dependency of the site: the DOM part is skipped when it is not installed.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch (e) { JSDOM = null; }

function slice() {
  const a = app.indexOf("let _menuLast='';");
  const b = app.indexOf('window.FEFCMenuRefresh=menuRefresh;');
  assert.ok(a > 0 && b > a, 'menu block found');
  const watcher = app.split('\n').find(l => l.startsWith(';(function(){const sync=()=>{const d=!document.getElementById(\'details\')'));
  assert.ok(watcher, 'overlay watcher found');
  return { block: app.slice(a, b + 'window.FEFCMenuRefresh=menuRefresh;'.length), watcher };
}

test('overlay watcher no longer calls the out-of-scope menu()', () => {
  const { watcher } = slice();
  assert.doesNotMatch(watcher, /[^.\w]menu\(\)/);
  assert.match(watcher, /FEFCMenuRefresh/);
});

test('details open/close redraws the menu once, keeps remote focus, and never scrolls', { skip: !JSDOM && 'jsdom not installed' }, async () => {
  const { block, watcher } = slice();
  const html = '<body><div id="bar"><nav id="menu"></nav></div><div id="details" hidden></div><div id="player" hidden></div></body>';
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://collection.faneditfanclub.com/#/' });
  const w = dom.window;
  w.eval(fs.readFileSync(path.join(root, 'src/newarrivals.js'), 'utf8'));
  let scrolled = 0;
  w.HTMLElement.prototype.scrollIntoView = function () { scrolled++; };
  w.eval(`var $=s=>document.querySelector(s);var FOLD=[];var ROOT='root';var cur='root';var parseH=()=>[''];
${block}
window.__menu=menu;`);
  w.eval(watcher);
  const wait = () => new Promise(r => setTimeout(r, 0));
  const menuEl = w.document.getElementById('menu');
  // Nothing is drawn before the app draws the menu itself.
  assert.equal(menuEl.innerHTML, '');
  w.__menu();
  assert.doesNotMatch(menuEl.innerHTML, /data-nav="up"/);
  const home = menuEl.querySelector('[data-href="#/genres"]');
  home.focus();
  scrolled = 0;
  let writes = 0;
  new w.MutationObserver(() => { writes++; }).observe(menuEl, { childList: true });

  // Open details: Back appears, focus stays on the same button (a new node), nothing scrolls.
  w.document.getElementById('details').hidden = false;
  await wait(); await wait();
  assert.match(menuEl.innerHTML, /data-nav="up"/);
  assert.equal(w.document.activeElement.getAttribute('data-href'), '#/genres');
  assert.equal(scrolled, 0);
  const afterOpen = writes;
  assert.equal(afterOpen, 1);

  // Player opens over details: the menu would not change, so it is not rewritten.
  w.document.getElementById('player').hidden = false;
  await wait(); await wait();
  w.document.getElementById('player').hidden = true;
  await wait(); await wait();
  assert.equal(writes, afterOpen);

  // Focus on Back, then close details: Back is gone, focus moves to the current page's button.
  menuEl.querySelector('[data-nav="up"]').focus();
  w.document.getElementById('details').hidden = true;
  await wait(); await wait();
  assert.doesNotMatch(menuEl.innerHTML, /data-nav="up"/);
  assert.equal(w.document.activeElement.getAttribute('data-href'), '#/');
  assert.equal(writes, afterOpen + 1);

  // Focus outside the menu is left alone.
  const outside = w.document.createElement('button');
  w.document.body.appendChild(outside);
  outside.focus();
  w.document.getElementById('details').hidden = false;
  await wait(); await wait();
  assert.equal(w.document.activeElement, outside);
  assert.equal(scrolled, 0);
  dom.window.close();
});
