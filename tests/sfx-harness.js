// Node-side mirror of the app's folder-sound resolver: evaluates the exact SFX-RESOLVE block from src/app.js
// against the shipped data files, so the tests cannot drift from the app.
const fs=require('fs'),path=require('path'),R=p=>path.join(__dirname,'..',p);
const app=fs.readFileSync(R('src/app.js'),'utf8');
const blk=app.slice(app.indexOf('/*SFX-RESOLVE-BEGIN'),app.indexOf('/*SFX-RESOLVE-END*/'));
const grab=re=>{const m=app.match(re);if(!m)throw new Error('cannot find '+re);return m[0]};
const FOLD=eval('('+grab(/\{readFirst:'[^}]+\}/)+')');
const DIR_IDS=eval('('+grab(/const DIR_IDS=(\{[^}]*\})/).replace(/^const DIR_IDS=/,'')+')');
const FOLDER='application/vnd.google-apps.folder';
const idx=JSON.parse(fs.readFileSync(R('data/index.json'),'utf8'));
const items=new Map(idx.items.map(x=>[x.id,x]));
const people=JSON.parse(fs.readFileSync(R('data/people.json'),'utf8'));
const FSFX=JSON.parse(fs.readFileSync(R('data/folder-sfx.json'),'utf8'));
const isFolder=f=>!!f&&(f.mimeType===FOLDER||f.kind==='folder'||f.targetMime===FOLDER||(!!f.targetId&&f.targetId!==f.id&&(items.get(f.targetId)||{}).mimeType===FOLDER));
const target=f=>f.targetId||f.id;
const genreMap=(()=>{const g=JSON.parse(fs.readFileSync(R('data/genres.json'),'utf8'));delete g.__collections;return g})();
const ctx={items,people,FSFX,DIR_IDS,FOLD,ROOT:idx.root,_sandlerLast:-1,_cruiseLast:-1};
const resolve=new Function('items','people','FSFX','DIR_IDS','FOLD','ROOT','genreMap','state',
 'let _sandlerLast=state._sandlerLast,_cruiseLast=state._cruiseLast;'+blk+';return sfxResolve;')(items,people,FSFX,DIR_IDS,FOLD,idx.root,genreMap,ctx);
const folders=[...items.values()].filter(isFolder);
const routeIds=[...new Set(folders.map(target))];
const genres=Object.keys(FSFX._genres||{});
const allGenres=new Set();for(const g of Object.values(JSON.parse(fs.readFileSync(R('data/genres.json'),'utf8')))){(g.genres||[]).forEach(x=>allGenres.add(x))}
function filesIn(L){const out=[];(function w(x){if(typeof x==='string')out.push(x);else if(Array.isArray(x))x.forEach(w)})(L);return out}
module.exports={resolve,items,people,FSFX,folders,routeIds,genres,allGenres,filesIn,target,R,FOLD};
