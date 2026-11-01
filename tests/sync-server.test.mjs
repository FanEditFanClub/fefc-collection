// node tests/sync-server.test.mjs : device-flow + web-Google sessions against a fake KV and stubbed Google endpoints
import w from '../_worker.js';
const store=new Map();const SYNC={async get(k,t){const v=store.get(k);return v===undefined?null:t==='json'?JSON.parse(v):v},async put(k,v){store.set(k,v)},async delete(k){store.delete(k)}};
const env={SYNC,GOOGLE_TV_CLIENT_ID:'tv.apps',GOOGLE_TV_CLIENT_SECRET:'sec'};
let state='pending';const realFetch=globalThis.fetch;
globalThis.fetch=async(u,o)=>{u=String(u);
 if(u.includes('/device/code'))return new Response(JSON.stringify({device_code:'DC',user_code:'ABCD-EFGH',verification_url:'https://www.google.com/device',expires_in:1800,interval:0}),{status:200});
 if(u.endsWith('/token')){if(state==='pending')return new Response(JSON.stringify({error:'authorization_pending'}),{status:428});
  const pl=Buffer.from(JSON.stringify({sub:'123',aud:'tv.apps',email:'a@b.c',name:'A'})).toString('base64url');return new Response(JSON.stringify({id_token:'h.'+pl+'.s'}),{status:200})}
 if(u.includes('tokeninfo'))return new Response(JSON.stringify({sub:'123',aud:'965770773324-i20msn4q01isddkunrcg4o30s5pju0bk.apps.googleusercontent.com',email:'a@b.c'}),{status:200});
 throw new Error('unexpected '+u)};
const call=async(p,body,tok)=>{const r=await w.fetch(new Request('https://x.test/api/sync/'+p,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(tok?{authorization:'Bearer '+tok}:{})},body:body===undefined?undefined:JSON.stringify(body)}),env,{});return {s:r.status,j:await r.json()}};
const ok=(c,m)=>{console.log(c?'PASS':'FAIL',m);if(!c)process.exitCode=1};
let d=await call('device/start',{});ok(d.j.user_code==='ABCD-EFGH'&&d.j.id&&!JSON.stringify(d.j).includes('DC"'),'device start hides device_code');
let p=await call('device/poll',{id:d.j.id});ok(p.j.status==='pending','pending');
state='ok';let rec=JSON.parse(store.get('dev:'+d.j.id));rec.next=0;store.set('dev:'+d.j.id,JSON.stringify(rec));
p=await call('device/poll',{id:d.j.id});ok(p.j.status==='ok'&&p.j.token&&p.j.user.email==='a@b.c','device ok');
const tvTok=p.j.token;
let g=await call('google/session',{access_token:'t'.repeat(40),name:'A'});ok(g.j.token&&g.j.kind==='google','web google session');
await call('list',{data:{v:1,stars:{['S'.repeat(11)]:{id:'S'.repeat(11),updatedAt:3}},history:{},playback:{}}},g.j.token);
let l=await call('list',undefined,tvTok);ok(l.j.data.stars['S'.repeat(11)],'TV (device flow) and web Google share the same list');
