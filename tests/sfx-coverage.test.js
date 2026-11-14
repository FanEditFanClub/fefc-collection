const test=require('node:test'),assert=require('node:assert'),fs=require('fs');
const h=require('./sfx-harness.js');
const exists=p=>fs.existsSync(h.R(p));
const flat=L=>h.filesIn(L).filter(x=>/^assets\//.test(x));

test('every file referenced by data/folder-sfx.json exists, and id/name keys hold path arrays or clip sets',()=>{
  const bad=[];
  for(const [k,v] of Object.entries(h.FSFX)){
    if(k==='_note')continue;
    if(k==='_rules'){
      assert.ok(Array.isArray(v));
      v.forEach((r,i)=>{
        assert.ok(r.ids||r.regex||r.match,'rule '+i+' has no ids/regex/match');
        const L=r.files||r.file;assert.ok(L&&flat(L).length,'rule '+i+' has no files');
        flat(L).forEach(f=>{if(!exists(f))bad.push('rule '+i+': '+f)})});
    }else if(k==='_genres'){
      // Genres may be a plain path array OR a list-of-lists (multi-variant playlist, same shape as _rules[].file)
      Object.entries(v).forEach(([g,L])=>{
        assert.ok(Array.isArray(L)&&flat(L).length,'_genres.'+g);
        flat(L).forEach(f=>{if(!exists(f))bad.push('genre '+g+': '+f)});
      });
    }else if(v&&typeof v==='object'&&!Array.isArray(v)&&(v.file||v.files)){
      const L=v.file||v.files;
      assert.ok(Array.isArray(L)&&flat(L).length,'key '+k+' rotation has no files');
      flat(L).forEach(f=>{if(!exists(f))bad.push(k+': '+f)});
    }else if(Array.isArray(v)&&v.length&&Array.isArray(v[0])){
      // A clip set (list of clips, each a list of format alternatives), the same shape as _rules[].file.
      assert.ok(v.every(c=>Array.isArray(c)&&c.length&&c.every(x=>typeof x==='string')),'key '+k+' clip set must be lists of paths');
      flat(v).forEach(f=>{if(!exists(f))bad.push(k+': '+f)});
    }else{
      assert.ok(Array.isArray(v)&&v.every(x=>typeof x==='string'),'key '+k+' must be an array of paths or a list of path arrays');
      v.forEach(f=>{if(!exists(f))bad.push(k+': '+f)});
    }
  }
  assert.deepStrictEqual(bad,[]);
});

test('every collection / folder route resolves to a clip whose file exists',()=>{
  const miss=[],gone=[];
  for(const id of h.routeIds){
    let L;for(let i=0;i<4;i++){L=h.resolve(id);if(!L||!L.length)break; // rules may rotate between variants: check each
      const files=flat(L);if(!files.length||!files.some(exists))gone.push(id+' '+JSON.stringify(L))}
    if(!L||!L.length)miss.push(id+' '+((h.items.get(id)||{}).name||''));
  }
  assert.deepStrictEqual(miss.slice(0,20),[],miss.length+' folders have no sound');
  assert.deepStrictEqual(gone.slice(0,20),[]);
});

test('every actor and director has a sound',()=>{
  for(const [id,p] of Object.entries(h.people)){
    const L=h.resolve(id);assert.ok(L&&flat(L).some(exists),p.name+' ('+p.role+') has no sound');
  }
});

test('every genre page has a sound (incl. Uncategorized)',()=>{
  for(const g of h.allGenres){const L=h.FSFX._genres[g];assert.ok(L&&flat(L).some(exists),'genre '+g+' has no sound')}
});

test('known pairs resolve to their signature clips',()=>{
  const by=n=>[...h.items.values()].find(f=>f.name===n);
  const dexter=[...h.items.values()].find(f=>/^dexter\b/i.test(f.name)&&h.folders.includes(f));
  if(dexter)assert.match(flat(h.resolve(h.target(dexter))).join(),/dexter|default|trex/i);
  assert.match(flat(h.resolve('10AA5RFZKOrtyeALpY891WpIKTiqASZbZ')).join(),/bruce-almighty/);
});

test('clip sets never mix bare paths with clips (the web preload and Kodi both read a bare path as a broken clip)',()=>{
  const mixed=v=>Array.isArray(v)&&v.length&&Array.isArray(v[0])&&v.some(x=>!Array.isArray(x));
  const bad=[];
  for(const [k,v] of Object.entries(h.FSFX)){if(k[0]!=='_'&&mixed(v))bad.push(k)}
  (h.FSFX._rules||[]).forEach((r,i)=>{if(mixed(r.file)||mixed(r.files))bad.push('_rules['+i+'] '+(r.regex||r.name||''))});
  for(const [g,v] of Object.entries(h.FSFX._genres||{}))if(mixed(v))bad.push('_genres.'+g);
  assert.deepEqual(bad,[]);
});
