import json,urllib.request,urllib.parse,collections
UA={'User-Agent':'FEFCCollection/1.0 (faneditfanclub.com)'}
J=lambda u:json.loads(urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=30).read())
NAMES={'Brooks':'Mel Brooks','Cage':'Nicolas Cage','Carrey':'Jim Carrey','Costner':'Kevin Costner','Cruise':'Tom Cruise','Ford':'Harrison Ford','Gibson':'Mel Gibson','Sandler':'Adam Sandler','Schwarzenegger':'Arnold Schwarzenegger','Scorcese':'Martin Scorsese','Stallone':'Sylvester Stallone','Statham':'Jason Statham','Tarantino':'Quentin Tarantino','Willis':'Bruce Willis','Abrams':'J. J. Abrams','Bay':'Michael Bay','Cameron':'James Cameron','Emmerich':'Roland Emmerich','Nolan':'Christopher Nolan','Ritchie':'Guy Ritchie','Scott':'Ridley Scott','Snyder':'Zack Snyder','Spielberg':'Steven Spielberg','Verhoeven':'Paul Verhoeven'}
d=json.load(open('data/index.json'));L=json.load(open('data/links.json'))
by={x['id']:x for x in d['items']}
out={}
for parent,role in [('1Jb0DtQC05fOdpiNg-O88fUpwI5ic3UHS','actor'),('1u2B5d9cb1zAtrtdF_rA3eXhtcFgggSib','director')]:
  for i in L[parent]+[x['id'] for x in d['items'] if x.get('parent')==parent]:
    n=by.get(i,{}).get('name');full=NAMES.get(n)
    if not full or i in out: continue
    e=J('https://www.wikidata.org/w/api.php?'+urllib.parse.urlencode(dict(action='wbgetentities',sites='enwiki',titles=full,props='claims',format='json')))
    qid,ent=next(iter(e['entities'].items()));f=ent['claims']['P18'][0]['mainsnak']['datavalue']['value']
    ii=J('https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode(dict(action='query',titles='File:'+f,prop='imageinfo',iiprop='url',iiurlwidth=400,format='json')))
    p=next(iter(ii['query']['pages'].values()))['imageinfo'][0]
    out[i]=dict(name=full,folder=n,role=role,qid=qid,url=p['thumburl'],link=p['descriptionurl'])
    print(n,full,p['thumburl'])
json.dump(out,open('data/people.json','w'),indent=0)
