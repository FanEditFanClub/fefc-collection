// FEFC boot intro: canvas-rendered homage to the OnLive boot sequence. All visuals drawn in code; logo is Carson's FE/FC mark.
window.FEFCIntro=(()=>{
const cl=(x,a=0,b=1)=>x<a?a:x>b?b:x,sm=(a,b,x)=>{x=cl((x-a)/(b-a));return x*x*(3-2*x)},lerp=(a,b,t)=>a+(b-a)*t,eo=t=>1-Math.pow(1-cl(t),3);
// condensed (repeat visit) maps real 0..4s onto story time segments
const SEG=[[0,.9,2,5],[.9,1.5,10.2,12.2],[1.5,2.6,13,20],[2.6,4,21,24.2]];
const mapC=r=>{for(const s of SEG)if(r<=s[1])return lerp(s[2],s[3],(r-s[0])/(s[1]-s[0]));return 24.2};
// full intro: real seconds (re-aligned to intro.mp3 onsets, total 26.15 s) -> story time
const FULL=26.15,SEGF=[[0,5.75,0,2.6],[5.75,6.75,2.6,4.8],[6.75,7.6,4.8,6.6],[7.6,10.07,6.6,8.3],[10.07,12.05,8.3,11.95],[12.05,24.75,11.95,24.2]];
const mapF=r=>{for(const s of SEGF)if(r<=s[1])return lerp(s[2],s[3],(r-s[0])/(s[1]-s[0]));return 24.2};
function create(opt){
 // lo = low-cost path (TV, iOS/WebKit, reduced motion, <=4 cores): same timeline/look, no canvas blur/shadowBlur, dpr 1, coarser ground strips, fewer stars
 let tv=opt.tv||opt.lite;const cv=document.createElement('canvas'),c=cv.getContext('2d',{alpha:false});// Full resolution everywhere: backing store = CSS size x device pixel ratio (TV: at least ~1920px wide, capped at 2x). TV stays fast by dropping blur/shadow and
 // rendering only the big mosaic ground at reduced internal resolution (see gs), not by shrinking the whole canvas.
 const pickDpr=()=>{const d=window.devicePixelRatio||1,w=Math.max(innerWidth,1);return tv?Math.min(2,Math.max(d,Math.min(2,1920/w),1)):Math.min(d,2)};let dpr=pickDpr(),gs=tv?.6:1,tier=0;
 let W=0,H=0;const size=()=>{W=innerWidth;H=innerHeight;cv.width=W*dpr;cv.height=H*dpr;cv.style.width=W+'px';cv.style.height=H+'px'};size();addEventListener('resize',()=>{dpr=pickDpr();size();if(warmed)warm()});
 const buf=document.createElement('canvas'),bc=buf.getContext('2d'),sbuf=document.createElement('canvas'),sbc=sbuf.getContext('2d');
 // white flashes: a pre-sized DOM layer animated with opacity only (compositor), so the canvas never repaints a full white frame
 let fx=null,fxa=-1;const flashA=a=>{a=a>.995?1:a<.005?0:+a.toFixed(3);if(!fx&&cv.parentNode){fx=document.createElement('div');fx.style.cssText='position:absolute;left:0;top:0;width:100%;height:100%;background:#fff;opacity:0;pointer-events:none;will-change:opacity;transform:translateZ(0);z-index:1';cv.parentNode.insertBefore(fx,cv.nextSibling)}if(fx&&a!==fxa){fxa=a;fx.style.opacity=a}};
 // logo + orange tinted logo
 const logo=new Image();logo.src='assets/fefc-logo-carson.png';let tint=null;
 logo.onload=()=>{const t=document.createElement('canvas');t.width=t.height=512;const x=t.getContext('2d');x.drawImage(logo,0,0,512,512);x.globalCompositeOperation='source-in';const g=x.createLinearGradient(0,0,512,512);g.addColorStop(0,'#ffb347');g.addColorStop(.45,'#ff8a1a');g.addColorStop(1,'#c24d00');x.fillStyle=g;x.fillRect(0,0,512,512);tint=t};
 // star field + mosaic tiles
 let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
 const stars=[];for(let i=0;i<(tv?160:420);i++)stars.push([rnd(),rnd(),rnd()]);
 const imgs=[];const setTiles=ids=>{imgs.length=0;(ids||[]).slice(0,tv?16:48).forEach(id=>{const im=new Image();im.referrerPolicy='no-referrer';im.onload=()=>{im.ok=1};im.src='https://drive.google.com/thumbnail?sz=w160&id='+id;imgs.push(im)})};
 const hues=[];for(let i=0;i<64;i++)hues.push(`hsl(${(rnd()*360)|0},${(20+rnd()*30)|0}%,${(18+rnd()*28)|0}%)`);
 const tile=(i,x,y,w,h)=>{const im=imgs.length?imgs[((i%imgs.length)+imgs.length)%imgs.length]:null;if(im&&im.ok)c.drawImage(im,x,y,w,h);else{c.fillStyle=hues[((i%64)+64)%64];c.fillRect(x,y,w,h)}};
 const hash=(a,b)=>{let h=a*374761393+b*668265263;h=(h^(h>>13))*1274126177;return (h^(h>>16))&0x7fffffff};
 function sky(a){const g=c.createLinearGradient(0,0,0,H);g.addColorStop(0,'#000');g.addColorStop(1,'#141a24');c.fillStyle=g;c.fillRect(0,0,W,H);c.fillStyle='#fff';for(const s of stars){c.globalAlpha=a*(.25+.75*s[2]);const r=s[2]>.9?1.6:.9;c.fillRect(s[0]*W,s[1]*H,r,r)}
  if(curS>12&&curS<22){const p=(curS-12)/10,startX=W*(-0.2+p*1.4),startY=H*(0.08+p*0.12);c.fillStyle='#88ccff';for(let i=0;i<12;i++){const sx=startX-i*(W*0.014),sy=startY-i*(H*0.005);if(sx>0&&sx<W&&sy>0&&sy<H){c.globalAlpha=a*0.75;c.fillRect(sx,sy,1.8,1.8)}}}
  c.globalAlpha=1}
 const LU=()=>Math.min(H*.46,W*.62);
 const tgEl=()=>document.getElementById('tagline');const LY=()=>{const t=tgEl();if(!t)return 0;const r=t.getBoundingClientRect();return Math.max(0,r.bottom+H*.03+LU()*.68-H/2)}; // push the logo down so the header (wordmark + subtitle) never overlaps it
 // logo box: never wider than the viewport (phone portrait)
 function drawLogo(s,a,sc,rot,dx,dy,tinted){if(!logo.complete)return;const L=LU()*sc;c.save();c.globalAlpha=a;c.translate(W/2+dx,H/2+LY()+dy);c.rotate(rot);if(!tv){c.shadowColor='rgba(255,255,255,.35)';c.shadowBlur=30*sc}c.drawImage(logo,-L/2,-L/2,L,L);c.restore()}
 function ribbon(s){ // 0-5: blurred glowing orange ribbons sweeping right->left, then zooming back into the mark
  const p=s/2,z=s<2?1:lerp(1,.18,eo((s-2)/1.6)),fade=sm(0,.5,s)*(1-sm(2.5,3.3,s));if(fade<=0)return;
  c.save();c.translate(W/2,H/2);c.scale(z,z);c.rotate(s<2?0:-(s-2)*.5);c.globalCompositeOperation='lighter';
  for(let k=0;k<2;k++){const cx=lerp(W*1.1,-W*.35,cl(p))+k*W*.25-W/2,cy=k?H*.55:-H*.2,R=H*(k?1.1:.85);
   const g=c.createLinearGradient(cx-R,cy-R,cx+R,cy+R);g.addColorStop(0,'#1c1f24');g.addColorStop(.5,'#c9ced6');g.addColorStop(.7,'#ffffff');g.addColorStop(1,'#202329');
   c.strokeStyle=g;c.lineWidth=H*(k?.34:.48);if(!tv&&'filter' in c)c.filter='blur('+Math.round(H*.018)+'px)';c.globalAlpha=fade*(k?.55:.9);if(!tv){c.shadowColor='#dfe6f0';c.shadowBlur=60}
   c.beginPath();c.arc(cx,cy,R,Math.PI*(.9+k*.3+p*.25),Math.PI*(1.7+k*.3+p*.25));c.stroke()}
  c.filter='none';c.restore()}
 function sheen(s){const t=(s-3.8)/1;if(t<0||t>1||!logo.complete)return;const L=LU();c.save();c.beginPath();c.rect(W/2-L/2,H/2+LY()-L/2,L,L);c.clip();c.globalCompositeOperation='lighter';const x=W/2-L+t*2*L,g=c.createLinearGradient(x-L*.15,0,x+L*.15,0);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(.5,'rgba(255,255,255,.55)');g.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=g;c.globalCompositeOperation='source-atop';c.restore();
  // apply sheen only on the logo pixels using buf
  if(sbuf.width!==(L|0)||sbuf.height!==(L|0)){sbuf.width=L|0;sbuf.height=L|0}const bc=sbc;bc.globalCompositeOperation='source-over';bc.clearRect(0,0,L,L);bc.drawImage(logo,0,0,L,L);bc.globalCompositeOperation='source-in';const g2=bc.createLinearGradient(t*2*L-L*.65,0,t*2*L-L*.35,0);g2.addColorStop(0,'rgba(255,255,255,0)');g2.addColorStop(.5,'rgba(235,240,250,.9)');g2.addColorStop(1,'rgba(255,255,255,0)');bc.fillStyle=g2;bc.fillRect(0,0,L,L);bc.globalCompositeOperation='source-over';
  c.save();c.globalCompositeOperation='lighter';c.drawImage(sbuf,W/2-L/2,H/2-L/2);c.restore()}
 // tile atlas (mosaic thumbnails, rebuilt as they arrive) used as a repeating ground texture
 const AT=tv?48:64,AN=16,atlas=document.createElement('canvas');atlas.width=atlas.height=AT*AN;const ax=atlas.getContext('2d');let pat=null,gpat=null,dirty=1,lastB=0,curS=0;
 function buildAtlas(){ax.fillStyle='#0c0e12';ax.fillRect(0,0,AT*AN,AT*AN);const gp=Math.max(2,AT*.09);for(let j=0;j<AN;j++)for(let i=0;i<AN;i++){const k=hash(i,j),im=imgs.length?imgs[k%imgs.length]:null,x=i*AT+gp/2,y=j*AT+gp/2,w=AT-gp;if(im&&im.ok)ax.drawImage(im,x,y,w,w*.82),ax.fillStyle='rgba(0,0,0,.15)',ax.fillRect(x,y+w*.82,w,w*.18);else{ax.fillStyle=hues[k%64];ax.fillRect(x,y,w,w*.82)}}pat=c.createPattern(atlas,'repeat');gpat=gx.createPattern(atlas,'repeat');dirty=0}
 const quiet=()=>(curS>11.0&&curS<23.2); // never rebuild the atlas through the flash → planet → dive (main stutter source)
 const ensure=()=>{if(pat&&quiet())return;const n=imgs.filter(i=>i.ok).length,now=Date.now();if(!pat||(n!==lastB&&now-(ensure.t||0)>400)){lastB=n;ensure.t=now;buildAtlas()}};
 const gcv=document.createElement('canvas'),gx=gcv.getContext('2d');
 const sizeG=()=>{const gw=Math.max(2,Math.round(cv.width*gs)),gh=Math.max(2,Math.round(cv.height*gs));if(gcv.width!==gw||gcv.height!==gh){gcv.width=gw;gcv.height=gh}};
 let warmed=0;const warm=()=>{warmed=1;flashA(0);sizeG();lastB=-1;ensure.t=0;buildAtlas();lastB=imgs.filter(i=>i.ok).length;gx.fillStyle=gpat;gx.fillRect(0,0,1,1);if(!tv&&(buf.width!==cv.width||buf.height!==cv.height)){buf.width=cv.width;buf.height=cv.height}};
 function ground(hy,cam,camX){ // mode-7 style perspective strips into gcv (screen space, unrotated)
  ensure();sizeG()
  const f=H*.9,h=10,band=opt.lite||(tv&&!opt.tv)?6:tv?4:(curS>=11.9?3:2);gx.setTransform(1,0,0,1,0,0);gx.clearRect(0,0,gcv.width,gcv.height);gx.fillStyle=gpat;
  for(let y=Math.max(Math.floor(hy)+1,-H);y<H*1.3;y+=band){const d=y-hy;if(d<=0)continue;const z=f*h/d,k=f/(z*AT),ky=f*h/(z*z*AT),tx=W/2-camX*AT*k,ty=y-(z+cam)*AT*ky;
   gx.setTransform(k*dpr*gs,0,0,ky*dpr*gs,tx*dpr*gs,ty*dpr*gs);gx.fillRect(-tx/k,(y-ty)/ky,W/k,band/ky*1.5)}
  gx.setTransform(1,0,0,1,0,0)}
 function planet(s){ // 12-23: starry sky, blue horizon limb, fly over a sphere of mosaic tiles
  const u=cl((s-12)/9),hy0=H*lerp(.5,.2,eo(u))-H*1.2*sm(21,22.8,s),R=W*lerp(.9,9,u*u),rot=lerp(-.3,0,eo(cl((s-12)/7)));
  const D=Math.hypot(W,H),hy=hy0; // ground rendered over an enlarged area so rotation never shows edges
  sky(1);ground(H/2+(hy-H/2)/1.35,(s-12)*7,Math.sin(s*.3)*3);
  c.save();c.translate(W/2,H/2);c.rotate(rot);c.translate(-W/2,-H/2);const cx=W/2,cy=hy+R;
  c.beginPath();c.arc(cx,cy,R+H*.07,0,Math.PI*2);const ag=c.createRadialGradient(cx,cy,R,cx,cy,R+H*.07);ag.addColorStop(0,'rgba(120,190,255,.6)');ag.addColorStop(1,'rgba(40,90,200,0)');c.fillStyle=ag;c.fill();
  c.save();c.beginPath();c.arc(cx,cy,R,0,Math.PI*2);c.clip();c.fillStyle='#7f8e9e';c.fillRect(-D,hy-2,W+2*D,H+2*D);
  c.save();c.translate(W/2,H/2);c.scale(1.35,1.35);c.translate(-W/2,-H/2);c.drawImage(gcv,0,0,W,H);c.restore();
  const fog=c.createLinearGradient(0,hy,0,hy+H*.24);fog.addColorStop(0,'rgba(175,195,215,.95)');fog.addColorStop(.35,'rgba(130,145,160,.45)');fog.addColorStop(1,'rgba(90,100,110,0)');c.fillStyle=fog;c.fillRect(-D,hy-2,W+2*D,H*.24);c.restore();
  c.beginPath();c.arc(cx,cy,R,0,Math.PI*2);c.strokeStyle='rgba(170,220,255,.95)';c.lineWidth=Math.max(2,H*.006);if(!tv){c.shadowColor='#4aa8ff';c.shadowBlur=30}c.stroke();c.restore()}
 function topdown(s){ // 22-24.2: look straight down at the tile grid and dive into the orange centre tile
  const a=s>=22.95?1:sm(22.1,22.9,s);if(a<=0)return;ensure();const e=cl((s-22.1)/2),k=Math.exp(Math.log(48)*e*e*e),ts=H/42*k,sc=ts/AT,rot=lerp(.35,0,eo(e));
  c.save();c.globalAlpha=a;c.fillStyle='#0a0c10';c.fillRect(0,0,W,H);c.translate(W/2,H/2);c.rotate(rot);c.scale(sc,sc);c.translate(-AT/2,-AT/2);const big=Math.hypot(W,H)/2/sc+AT,S=AT*AN,i0=Math.floor((AT/2-big)/S),i1=Math.floor((AT/2+big)/S);for(let j=i0;j<=i1;j++)for(let i=i0;i<=i1;i++)c.drawImage(atlas,i*S,j*S);c.restore();
  c.save();c.globalAlpha=a;c.translate(W/2,H/2);c.rotate(rot);const g=ts*.09;c.fillStyle='#ff8a1a';if(!tv){c.shadowColor='#ff8a1a';c.shadowBlur=30}c.fillRect(-ts/2-g*.3,-ts/2-g*.3,ts+g*.6,ts+g*.6);c.shadowBlur=0;c.fillStyle='#14171d';c.fillRect(-ts/2+g*.4,-ts/2+g*.4,ts-g*.8,ts-g*.8);if(logo.complete)c.drawImage(logo,-ts*.3,-ts*.34,ts*.6,ts*.6);c.restore();
  if(!tv&&s>22.6){const b=sm(22.6,23.6,s)*.3;if(buf.width!==cv.width||buf.height!==cv.height){buf.width=cv.width;buf.height=cv.height}bc.drawImage(cv,0,0);c.save();c.setTransform(1,0,0,1,0,0);for(const q of [1.04,1.09,1.15]){c.globalAlpha=b;const w=cv.width*q,h=cv.height*q;c.drawImage(buf,(cv.width-w)/2,(cv.height-h)/2,w,h)}c.restore();c.setTransform(dpr,0,0,dpr,0,0)}}
 function frame(s){curS=s;if(!warmed&&s>5.5&&s<11)warm();
  const fl=s<12.6?sm(11.7,11.95,s)*(1-sm(11.95,12.6,s)):0,sn=s>23.6?sm(23.6,24.15,s):0,fa=Math.max(fl,sn);flashA(fa);if(fa>=.995&&fx)return;
  c.setTransform(dpr,0,0,dpr,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';c.shadowBlur=0;c.fillStyle='#000';c.fillRect(0,0,W,H);
  if(s<12.2){
   ribbon(s);
   const la=sm(2.5,3.6,s)*(1-sm(8.2,10,s)*.62),sc=s<5?lerp(2.4,1,eo((s-2.4)/2.2)):1,rot=s<5?lerp(.4,0,eo((s-2.4)/2.4)):0,dy=-H*.09*sm(5,5.7,s)*(1-sm(8,9,s));
   const dive=s>11?Math.exp((s-11)*4.2):1;
   if(s>8.3){const pr=H*(lerp(0,.16,eo((s-8.3)/2.4)))*dive;c.save();c.beginPath();c.arc(W/2,H/2+dy*.5,pr,0,Math.PI*2);c.clip();sky(sm(8.3,9.5,s));
    const ly=H/2+pr*.55;c.beginPath();c.arc(W/2,ly+pr*3,pr*3,0,Math.PI*2);c.fillStyle='#2b3542';c.fill();c.strokeStyle='rgba(150,210,255,.9)';c.lineWidth=Math.max(1.5,pr*.03);if(!tv){c.shadowColor='#4aa8ff';c.shadowBlur=24}c.stroke();c.restore()}
   if(la>0)drawLogo(s,la*(s>11?1-sm(11.3,11.8,s):1),sc*dive,rot,0,dy*dive,true);
   if(s>3.7&&s<5)sheen(s);
   const wa=sm(5.6,6.6,s)*(1-sm(8,8.6,s));if(wa>0){c.save();c.globalAlpha=wa;c.fillStyle='#f2f2f2';{const T='The Fan Edit Fan Club';let fs=Math.round(H*.065),ls=Math.round(H*.006);c.textAlign='center';c.textBaseline='middle';
    const fit=()=>{c.font=`600 ${fs}px 'Source Sans 3',sans-serif`;if(c.letterSpacing!==undefined)c.letterSpacing=ls+'px';return c.measureText(T).width+(c.letterSpacing!==undefined?0:ls*T.length)};
    let tw=fit();const max=W*.88;if(tw>max){const k=max/tw;fs=Math.max(10,Math.floor(fs*k));ls=Math.floor(ls*k);tw=fit();if(tw>max){fs=Math.max(10,Math.floor(fs*max/tw));fit()}}
    /* letter-spacing adds trailing space after the last glyph: shift so the whole title (incl. the final "b") is centred and never clipped */
    c.textAlign='left';c.fillText(T,W/2-(tw-(c.letterSpacing!==undefined?ls:0))/2,Math.min(H*.93,H/2+LY()+Math.min(H*.24,LU()*.52+fs)));}c.restore()}
   if(s>11.4){const st=sm(11.4,11.8,s)*(1-sm(11.9,12.2,s));c.save();c.globalCompositeOperation='lighter';const g=c.createLinearGradient(0,0,W,0);g.addColorStop(0,'rgba(60,140,255,0)');g.addColorStop(.5,'rgba(190,230,255,1)');g.addColorStop(1,'rgba(60,140,255,0)');c.fillStyle=g;c.globalAlpha=st;const hh=H*lerp(.004,.05,st);c.fillRect(0,H*.56-hh/2,W,hh);c.restore()}
  }
  if(s>=11.95&&s<22.95)planet(s); // topdown is fully opaque from 22.9
  if(s>22.1)topdown(s);
  if(fa>0&&!fx){c.globalAlpha=fa;c.fillStyle='#fff';c.fillRect(0,0,W,H);c.globalAlpha=1}
  // tagline: title + subtitle are driven by CSS (style.css #tagline #wordmark / span) so the title is never clipped and the subtitle follows it
  {const tg=opt.tagline;if(tg&&!tg._v){tg._v=1;tg.style.visibility='visible'}}}
 // adaptive: if the device can't hold frame rate, drop to the low-cost path mid-intro (same timeline)
 // tier 1: drop blur/shadow path; tier 2: lower the ground resolution; tier 3: step the canvas down (never below ~1280px wide)
 const degrade=()=>{tier++;if(tier===1&&!tv){tv=true;gs=.6;dpr=pickDpr();size();if(warmed)warm();return true}
  if(tier<=2&&gs>.4){gs=.4;if(warmed)warm();else sizeG();return true}
  if(tier<=3&&cv.width>1400){dpr=Math.max(1,dpr*.75);size();if(warmed)warm();return true}
  return false};
 return {canvas:cv,frame,mapC,mapF,FULL,setTiles,degrade}}
return {create,mapC,mapF,FULL}})();
