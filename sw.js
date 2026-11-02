// FEFC Collection service worker. Version is stamped at build time; a new build = new cache.
const V='mvyu420f',SHELL='fefc-shell-'+V;
const ASSETS=[
 '/',
 '/index.html',
 '/style.css',
 '/config.js',
 '/audio.js',
 '/eastereggs.js',
 '/intro.js',
 '/readfirst.js',
 '/newarrivals.js',
 '/zoom.js',
 '/userdata.js',
 '/sync.js',
 '/syncui.js',
 '/qrgen.js',
 '/genres.js',
 '/ticker.js',
 '/tvplayer.js',
 '/app.js',
 '/assets/fefc-logo-carson.png',
 '/manifest.json',
 '/assets/fonts/fonts.css',
 '/assets/fonts/source-sans-3-400.ttf',
 '/assets/fonts/source-sans-3-600.ttf',
 '/assets/fefc-logo.png',
 '/assets/icon-192.png',
 '/assets/icon-512.png',
 '/assets/apple-touch-icon.png',
 '/favicon.ico',
 '/assets/sfx/cat-meow.wav',
 '/assets/sfx/cat-meow.m4a',
 '/assets/sfx/trex-roar.mp3'
];
self.addEventListener('install',e=>{e.waitUntil(caches.open(SHELL).then(c=>c.addAll(ASSETS.map(a=>new Request(a,{cache:'reload'})))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==SHELL).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);
 if(e.request.method!=='GET'||u.origin!==location.origin||u.pathname.startsWith('/assets/clips/')||u.pathname.startsWith('/api/stream/'))return; // never touch Drive/Docs/YouTube/Google APIs
 if(u.pathname.startsWith('/data/')){e.respondWith(fetch(e.request,{cache:'no-cache'}).catch(()=>caches.match(e.request)));return} // network-first, no caching of data
 // app shell: network-first (fresh builds), cache fallback for offline
 const nav=e.request.mode==='navigate'||/(^\/$|\.html$|\.js$|\.css$)/.test(u.pathname);
 e.respondWith(fetch(e.request,nav?{cache:'no-store'}:undefined).then(r=>{if(r.ok){const c=r.clone();caches.open(SHELL).then(x=>x.put(e.request,c))}return r}).catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||caches.match('/index.html'))))});
self.addEventListener('message',e=>{if(e&&e.data&&e.data.type==='SKIP_WAITING')self.skipWaiting()});
