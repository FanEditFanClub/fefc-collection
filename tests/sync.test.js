// node tests/sync.test.js : merge logic against a mocked Drive appDataFolder
const assert=require('assert');
function mkEnv(){const ls={};global.localStorage={getItem:k=>k in ls?ls[k]:null,setItem:(k,v)=>{ls[k]=String(v)},removeItem:k=>{delete ls[k]}};global.addEventListener=()=>{};global.window=global;delete global.UD;
 delete require.cache[require.resolve('../src/userdata.js')];require('../src/userdata.js');return global.UD}
function mockDrive(){const files={};let n=0;return {files,calls:[],find(){this.calls.push('find');const k=Object.keys(files)[0];return Promise.resolve(k||null)},read(id){this.calls.push('read');return Promise.resolve(files[id])},
 create(b){this.calls.push('create');const id='f'+(++n);files[id]=b;return Promise.resolve(id)},update(id,b){this.calls.push('update');files[id]=b;return Promise.resolve()}}}
require('../src/sync.js');const core=globalThis.FEFCSyncCore;
let T=1000;const realNow=Date.now;Date.now=()=>T;
(async()=>{
 // device A stars x,y; first sync creates file
 const A=mkEnv();const drive=mockDrive();
 A.toggleStar('x','X');T+=10;A.toggleStar('y','Y');T+=10;A.opened('v1','V1');
 const ca=core({drive,store:A});await ca.sync();assert.deepStrictEqual(drive.calls,['find','create']);
 const snapA=A.exportJSON();
 // device B: has z starred, unstars nothing; syncs -> gets x,y,z
 T+=10;const B=mkEnv();B.toggleStar('z','Z');T+=10;B.opened('v2','V2');const cb=core({drive,store:B});await cb.sync();
 assert.deepStrictEqual(B.stars().map(s=>s.id).sort(),['x','y','z']);assert.deepStrictEqual(B.history().map(h=>h.id),['v2','v1']);
 // B removes y later (tombstone) -> remote reflects
 T+=10;B.toggleStar('y');await cb.sync();
 // A (stale copy, still has y starred at older time) syncs -> y removed by newer tombstone, z arrives
 global.UD=null;const A2=mkEnv();A2.importJSON(snapA,true);const ca2=core({drive,store:A2});await ca2.sync();
 assert.deepStrictEqual(A2.stars().map(s=>s.id).sort(),['x','z']);
 // A re-stars y AFTER the removal -> newer write wins everywhere
 T+=10;A2.toggleStar('y','Y');await ca2.sync();await cb.sync();assert.ok(B.isStarred('y'));
 // history clear propagates as tombstones, newer open survives
 T+=10;B.clearHistory();T+=10;B.opened('v3','V3');await cb.sync();await ca2.sync();assert.deepStrictEqual(A2.history().map(h=>h.id),['v3']);
 // corrupt / foreign remote is ignored, local kept and file rewritten
 const id=Object.keys(drive.files)[0];drive.files[id]='{"v":9}';await ca2.sync();assert.ok(JSON.parse(drive.files[id]).v===1);assert.ok(A2.isStarred('x'));
 console.log('sync tests: all passed');Date.now=realNow})().catch(e=>{console.error('FAIL',e);process.exit(1)});
