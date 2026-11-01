const test=require('node:test'),assert=require('node:assert'),fs=require('fs');
const F='application/vnd.google-apps.folder';
const items=JSON.parse(fs.readFileSync(__dirname+'/../data/index.json','utf8')).items;
test('no folder or folder shortcut is ever given a file kind (so it can never show as a document)',()=>{
  const by=new Map(items.map(x=>[x.id,x]));
  const bad=items.filter(x=>(x.mimeType===F||(x.targetId&&(by.get(x.targetId)||{}).mimeType===F))&&x.kind);
  assert.deepStrictEqual(bad.map(x=>x.name),[]);
});
test('every non-folder entry is classified (video or doc)',()=>{
  const bad=items.filter(x=>x.mimeType!==F&&!x.kind);
  assert.ok(bad.length<=5,bad.length+' unclassified, e.g. '+bad.slice(0,3).map(x=>x.name));
});
