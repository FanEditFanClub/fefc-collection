// FEFC cloud sync: user's own Google Drive appDataFolder/fefc-userdata.json, merged last-write-wins per record.
// Signed-out use is unaffected; everything stays in localStorage via window.UD.
(function(root){
var CLIENT_ID='965770773324-i20msn4q01isddkunrcg4o30s5pju0bk.apps.googleusercontent.com';
var SCOPES='https://www.googleapis.com/auth/drive.appdata openid email profile';
var FILE='fefc-userdata.json';
// ---------- core (pure; unit-tested with a mocked drive) ----------
function core(o){ // o: {drive:{find(),read(id),create(json),update(id,json)}, store:UD}
 var fileId=null;
 return {sync:function(){var d=o.drive,st=o.store;
  return Promise.resolve(fileId||d.find()).then(function(id){fileId=id||null;return fileId?d.read(fileId):null})
   .then(function(remote){if(remote){var j=typeof remote==='string'?JSON.parse(remote):remote;if(j&&j.v===1)st.importJSON(j,false)}
    var body=st.exportJSON();return fileId?d.update(fileId,body):d.create(body).then(function(id){fileId=id})})
   .then(function(){return true})},
  reset:function(){fileId=null}}}
// ---------- Drive REST via fetch ----------
function driveApi(tok){var H=function(){return {Authorization:'Bearer '+tok()}};var B='https://www.googleapis.com/';
 function ok(r){if(!r.ok){var e=new Error('drive '+r.status);e.status=r.status;throw e}return r}
 return {find:function(){return fetch(B+'drive/v3/files?spaces=appDataFolder&fields=files(id,modifiedTime)&q='+encodeURIComponent("name='"+FILE+"'"),{headers:H()}).then(ok).then(function(r){return r.json()}).then(function(j){return j.files&&j.files[0]?j.files[0].id:null})},
  read:function(id){return fetch(B+'drive/v3/files/'+id+'?alt=media',{headers:H()}).then(ok).then(function(r){return r.text()})},
  create:function(body){var bd='fefc'+Date.now(),meta=JSON.stringify({name:FILE,parents:['appDataFolder'],mimeType:'application/json'});
   return fetch(B+'upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:Object.assign(H(),{'Content-Type':'multipart/related; boundary='+bd}),
    body:'--'+bd+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+meta+'\r\n--'+bd+'\r\nContent-Type: application/json\r\n\r\n'+body+'\r\n--'+bd+'--'}).then(ok).then(function(r){return r.json()}).then(function(j){return j.id})},
  update:function(id,body){return fetch(B+'upload/drive/v3/files/'+id+'?uploadType=media',{method:'PATCH',headers:Object.assign(H(),{'Content-Type':'application/json'}),body:body}).then(ok)}}}
// ---------- browser glue ----------
function browser(){
 var tok=null,exp=0,tc=null,user=null,subs=[],C=null,timer=null,busy=false,again=false,lastErr='';
 var K='fefcSync';var S={state:'out',user:null,error:''};
 function emit(){S.user=user;S.error=lastErr;subs.forEach(function(f){try{f(S)}catch(e){}})}
 function gis(){return new Promise(function(res,rej){if(window.google&&google.accounts&&google.accounts.oauth2)return res();var s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.onload=function(){res()};s.onerror=function(){rej(new Error('gis'))};document.head.appendChild(s)})}
 function token(prompt){return gis().then(function(){return new Promise(function(res,rej){
  tc=google.accounts.oauth2.initTokenClient({client_id:CLIENT_ID,scope:SCOPES,callback:function(r){if(r&&r.access_token){tok=r.access_token;exp=Date.now()+((+r.expires_in||3600)-120)*1000;res(tok)}else rej(new Error(r&&r.error||'denied'))},error_callback:function(e){rej(new Error(e&&e.type||'popup'))}});
  var hint=(localStorage.getItem(K)||'');tc.requestAccessToken({prompt:prompt,hint:hint||undefined})})})}
 function fresh(){if(tok&&Date.now()<exp)return Promise.resolve(tok);return token('')}
 function me(){return fetch('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:'Bearer '+tok}}).then(function(r){return r.ok?r.json():null}).then(function(u){if(u){user={email:u.email,name:u.name,picture:u.picture};localStorage.setItem(K,u.email||'1')}})}
 function run(){if(!tok||!window.UD)return Promise.resolve();if(busy){again=true;return Promise.resolve()}busy=true;S.state='syncing';emit();
  return fresh().then(function(){return C.sync()}).then(function(){S.state='in';lastErr=''},function(e){S.state='in';lastErr=(e&&e.message)||'sync failed';if(e&&e.status===401){tok=null}})
   .then(function(){busy=false;emit();if(again){again=false;return run()}})}
 var deb;function soon(){clearTimeout(deb);deb=setTimeout(run,2500)}
 function start(){C=core({drive:driveApi(function(){return tok}),store:window.UD});return me().then(function(){if(window.FEFCSrv&&user&&tok)window.FEFCSrv.googleSession(tok,user)}).then(run).then(function(){
  if(!S._wired){S._wired=1;window.UD.subscribe(function(){if(tok&&!busy)soon()});addEventListener('focus',function(){if(tok)run()});document.addEventListener('visibilitychange',function(){if(!document.hidden&&tok)run()})}
  clearInterval(timer);timer=setInterval(function(){if(tok)run()},4*60*1000)})}
 var api={
  get state(){return S},subscribe:function(f){subs.push(f);f(S)},
  signIn:function(){lastErr='';return token(localStorage.getItem(K)?'':'consent').then(start).catch(function(e){lastErr=e.message;S.state='out';emit()})},
  signOut:function(){if(window.FEFCSrv&&window.FEFCSrv.connected())window.FEFCSrv.signOut();try{if(tok&&window.google)google.accounts.oauth2.revoke(tok,function(){})}catch(e){}tok=null;user=null;localStorage.removeItem(K);clearInterval(timer);if(C)C.reset();S.state='out';emit()},
  syncNow:run,wasSignedIn:function(){return !!localStorage.getItem(K)}};
 // silent reconnect for returning users (works when Google can issue a token without UI; otherwise shows 'Reconnect')
 if(api.wasSignedIn()){S.state='reconnect';setTimeout(function(){token('none').then(start).catch(function(){S.state='reconnect';emit()})},2500)}
 return api}

// ---------- server-side list (KV via /api/sync/*): TV code, QR link, 6-digit pair code, and the Google user's server copy ----------
function srvClient(){
 var KT='fefcSrvTok',KU='fefcSrvUser',KK='fefcSrvKind',subs=[],busy=false,again=false,deb,timer,cfg=null;
 var S={state:'out',kind:null,user:null,error:''};
 function tok(){try{return localStorage.getItem(KT)}catch(e){return null}}
 function emit(){subs.forEach(function(f){try{f(S)}catch(e){}})}
 function api(path,body,auth){var h={'content-type':'application/json'};if(auth!==false&&tok())h.Authorization='Bearer '+tok();
  return fetch('/api/sync/'+path,{method:body===undefined?'GET':'POST',headers:h,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'}).then(function(r){return r.json().catch(function(){return {}}).then(function(j){if(!r.ok){var e=new Error(j.error||('http '+r.status));e.status=r.status;throw e}return j})})}
 function load(){var t=tok();if(!t){S.state='out';S.kind=null;S.user=null;return}S.state='in';S.kind=localStorage.getItem(KK)||'code';try{S.user=JSON.parse(localStorage.getItem(KU)||'null')}catch(e){S.user=null}}
 function persistNative(){try{if(window.FEFCSyncKeep&&window.FEFCNative&&window.FEFCNative.persistSync)window.FEFCNative.persistSync(JSON.stringify(window.FEFCSyncKeep.snapshot(localStorage)))}catch(e){}}
 function devId(){try{var id=localStorage.getItem('fefcDeviceId')||'';if(id.length>=20)return id}catch(e){}return ''}
 function registerDevice(){var id=devId();if(!id||!tok())return Promise.resolve();return api('device/register',{deviceId:id}).catch(function(){})}
 function refillUd(){try{if(!window.UD)return;var raw=localStorage.getItem('fefcUserData.v1');if(!raw)return;var cur=JSON.parse(window.UD.exportJSON()),inc=JSON.parse(raw);
  var empty=!Object.keys(cur.stars||{}).length&&!Object.keys(cur.history||{}).length&&!Object.keys(cur.playback||{}).length;
  var has=Object.keys(inc.stars||{}).length||Object.keys(inc.history||{}).length||Object.keys(inc.playback||{}).length;
  if(empty&&has)window.UD.importJSON(inc,true)}catch(e){}}
 function run(){if(!tok()||!window.UD)return Promise.resolve();if(busy){again=true;return Promise.resolve()}busy=true;S.state='syncing';emit();
  return api('list',{data:JSON.parse(window.UD.exportJSON())}).then(function(r){S.error='';if(r&&r.data&&r.data.v===1)window.UD.importJSON(r.data,false);S.state='in';persistNative();registerDevice()},function(e){
    if(e.status===401||e.status===503&&0){clear();return}S.state='in';S.error=e&&e.message||'sync failed'}).then(function(){busy=false;emit();if(again){again=false;return run()}})}
 function soon(){clearTimeout(deb);deb=setTimeout(run,2500)}
 function wire(){if(S._wired||!window.UD)return;S._wired=1;window.UD.subscribe(function(){persistNative();if(tok()&&!busy)soon()});addEventListener('focus',function(){if(tok())run()});document.addEventListener('visibilitychange',function(){if(!document.hidden&&tok())run()});timer=setInterval(function(){if(tok())run()},4*60*1000)}
 function adopt(r){if(!r||!r.token)throw new Error('no token');localStorage.setItem(KT,r.token);localStorage.setItem(KK,r.kind||'code');localStorage.setItem(KU,JSON.stringify(r.user||null));load();persistNative();wire();emit();return run().then(function(){return S})}
 function clear(){localStorage.removeItem(KT);localStorage.removeItem(KK);localStorage.removeItem(KU);persistNative();load();emit()}
 function tryRestore(){if(tok())return Promise.resolve(false);var id=devId();if(!id)return Promise.resolve(false);
  return api('restore',{deviceId:id},false).then(function(r){if(r&&r.token){adopt(r);return true}return false}).catch(function(){return false})}
 var A={
  get state(){return S},subscribe:function(f){subs.push(f);f(S)},
  status:function(){return cfg||(cfg=api('status',undefined,false).catch(function(){return {configured:false,tv:false}}))},
  adopt:adopt,syncNow:run,connected:function(){return !!tok()},
  signOut:function(){var t=tok(),id=devId();if(t&&id)try{fetch('/api/sync/device/forget',{method:'POST',headers:{'content-type':'application/json',Authorization:'Bearer '+t},body:JSON.stringify({deviceId:id})}).catch(function(){})}catch(e){}if(t)try{fetch('/api/sync/logout',{method:'POST',headers:{Authorization:'Bearer '+t}}).catch(function(){})}catch(e){}clear()},
  // Google web sign-in -> same server list as the TV code flow
  googleSession:function(accessToken,user){if(S.kind==='google'&&tok()&&S.user&&user&&S.user.email===user.email)return Promise.resolve(S);
   return A.status().then(function(c){if(!c.configured)return S;return api('google/session',{access_token:accessToken,name:user&&user.name,picture:user&&user.picture},false).then(adopt)}).catch(function(){return S})},
  deviceStart:function(){return api('device/start',{},false)},
  devicePoll:function(id){return api('device/poll',{id:id},false)},
  qrStart:function(){return api('qr/start',{},false)},
  qrPoll:function(id,secret){return api('qr/poll',{id:id,secret:secret},false)},
  qrInfo:function(id){return api('qr/info',{id:id},false)},
  qrApprove:function(id){return api('qr/approve',{id:id})},
  pairCreate:function(){return api('pair/create',{})},
  pairRedeem:function(code){return api('pair/redeem',{code:code},false)}};
 refillUd();load();persistNative();if(tok()){wire();setTimeout(function(){registerDevice();run()},1500)}else setTimeout(tryRestore,400)
 return A}
if(typeof window!=='undefined'&&window.addEventListener)window.addEventListener('keydown',function(e){if(window.__fefcModal&&window.__fefcModal(e)){e.preventDefault();e.stopImmediatePropagation()}},true);
root.FEFCSyncCore=core;
if(typeof window!=='undefined'&&window.document)window.FEFCSrv=srvClient();
if(typeof window!=='undefined'&&window.document)window.FEFCSync=browser();
})(typeof window!=='undefined'?window:globalThis);
