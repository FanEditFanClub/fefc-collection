// FEFC user data store: stars + watch history. localStorage today; shaped for a future cloud sync.
// Every record carries updatedAt (ms) so two copies can be merged last-write-wins; removals are tombstones.
(function(){
var KEY='fefcUserData.v1',subs=[],db=load();
function now(){return Date.now()}
function load(){try{var j=JSON.parse(localStorage.getItem(KEY)||'null');if(j&&j.v===1)return j}catch(e){}return {v:1,stars:{},history:{},updatedAt:0}}
function save(){db.updatedAt=now();try{localStorage.setItem(KEY,JSON.stringify(db))}catch(e){}subs.forEach(function(f){try{f(db)}catch(e){}})}
function live(c){var o=[];Object.keys(c).forEach(function(k){if(!c[k].deleted)o.push(c[k])});return o}
var UD={
 get:function(col,id){var r=(db[col]||{})[id];return r&&!r.deleted?r:null},
 set:function(col,id,rec){db[col]=db[col]||{};var r=Object.assign({id:id},rec||{},{updatedAt:now()});db[col][id]=r;save();return r},
 remove:function(col,id){db[col]=db[col]||{};db[col][id]={id:id,deleted:true,updatedAt:now()};save()},
 all:function(col){return live(db[col]||{})},
 subscribe:function(f){subs.push(f);return function(){subs=subs.filter(function(x){return x!==f})}},
 // stars
 isStarred:function(id){return !!UD.get('stars',id)},
 toggleStar:function(id,name){if(UD.isStarred(id)){UD.remove('stars',id);return false}UD.set('stars',id,{starredAt:now(),name:name||''});return true},
 stars:function(){return UD.all('stars')},
 // history (last opened in the player; Drive preview can't report position, so no resume)
 opened:function(id,name){var r=UD.get('history',id);UD.set('history',id,{lastOpened:now(),count:(r&&r.count||0)+1,name:name||''})},
 history:function(n){return UD.all('history').sort(function(a,b){return b.lastOpened-a.lastOpened}).slice(0,n||50)},
 clearHistory:function(){Object.keys(db.history||{}).forEach(function(k){db.history[k]={id:k,deleted:true,updatedAt:now()}});save()},
 // export / import (+ merge for sync)
 exportJSON:function(){return JSON.stringify(db)},
 importJSON:function(s,replace){var j=typeof s==='string'?JSON.parse(s):s;if(!j||j.v!==1)throw new Error('bad format');if(replace){db=j}else UD.merge(j);save()},
 merge:function(o){['stars','history'].forEach(function(c){var a=db[c]=db[c]||{},b=o[c]||{};Object.keys(b).forEach(function(k){if(!a[k]||(b[k].updatedAt||0)>(a[k].updatedAt||0))a[k]=b[k]})})}
};
addEventListener('storage',function(e){if(e.key===KEY){db=load();subs.forEach(function(f){try{f(db)}catch(_){}})}});
window.UD=UD;
})();
