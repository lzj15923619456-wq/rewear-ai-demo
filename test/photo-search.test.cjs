const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const sharp = require('sharp');
const { searchQueries, photoRecord, unsplashRecord, createPhotoSearch, analyzedReferences } = require('../photo-search.cjs');

const id = '324709e5-375e-435a-bfab-e190fa111c6a';
const secondId = '98bbbd9d-9eb1-4555-bb77-72803a03ea72';
const fixture = { id, source:'stocksnap',tags:[{name:'fashion'}],title:'Grey hoodie outfit', creator:'Test photographer', foreign_landing_url:'https://www.flickr.com/photos/test/1', license:'by', license_version:'2.0', license_url:'https://creativecommons.org/licenses/by/2.0/', width:300, height:450 };
const item = { itemId:'my-hoodie', slot:'upper', name:'我的灰色卫衣', attributes:{subtype:'卫衣',colors:['灰色']} };

test('web search uses garment tags, rejects unsafe records and verifies model references', () => {
  const queries = searchQueries([item],{styles:['简约日常'],note:'PRIVATE-NOTE',heightCm:165});
  assert.ok(queries.some(q=>q.includes('grey hoodie')));
  assert.ok(queries.every(q=>!q.includes('PRIVATE')&&!q.includes('165')));
  assert.ok(searchQueries([{...item,attributes:{subtype:'牛仔裤',colors:['浅蓝']}}],{}).includes('light blue jeans outfit'));
  assert.ok(queries.some(q=>q.includes('minimal clean outfit')));
  assert.equal(photoRecord({...fixture,license:'by-nc'}),null);
  assert.equal(photoRecord({...fixture,source:'flickr'}).source,'flickr');
  assert.equal(photoRecord({...fixture,source:'rawpixel'}).source,'rawpixel');
  assert.equal(photoRecord({...fixture,title:'Market snapshot',tags:[]}).title,'Market snapshot');
  assert.equal(photoRecord({...fixture,foreign_landing_url:'javascript:alert(1)'}),null);
  assert.equal(photoRecord({...fixture,title:'sexy lingerie'}),null);
  assert.equal(photoRecord({...fixture,category:'illustration'}),null);
  assert.equal(photoRecord({...fixture,title:'Second Life jeans outfit'}),null);
  assert.equal(photoRecord({...fixture,title:'White T-shirt illustration'}),null);
  assert.equal(photoRecord({...fixture,url:'https://127.0.0.1/private'}).commonsImage,null);
  assert.equal(photoRecord({...fixture,url:'https://upload.wikimedia.org.attacker.test/wikipedia/commons/photo.jpg'}).commonsImage,null);
  assert.equal(photoRecord({...fixture,width:2000,url:'https://upload.wikimedia.org/wikipedia/commons/9/95/Photo.jpg'}).commonsImage,'https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Photo.jpg/960px-Photo.jpg');
  const photo=photoRecord(fixture);
  const row={referenceId:photo.id,usable:true,matchedItemIds:[item.itemId],visibleSlots:['upper','bottom'],referenceQuality:'fashion',styleEvidence:'灰白配色与宽松廓形，上衣裤装完整，背景干净',description:'灰色卫衣配牛仔裤，鞋未展示',styles:['简约日常'],scenes:['周末出门'],effects:[],exploration:40};
  assert.equal(analyzedReferences({references:[row]},[photo],[item]).length,1);
  assert.equal(analyzedReferences({references:[row]},[photo],[item],{styles:['简约日常'],scenes:['周末出门']}).length,1);
  assert.equal(analyzedReferences({references:[{...row,scenes:[]}]},[photo],[item],{scenes:['周末出门']}).length,1,'Scene wording is a ranking signal, not a hard rejection gate');
  assert.equal(analyzedReferences({references:[row]},[photo],[item],{styles:['正式商务']}).length,1);
  assert.equal(analyzedReferences({references:[{...row,visibleSlots:['upper','bottom']}]},[photo],[{...item,slot:'bottom'}]).length,1,'Bottom anchors require a visible upper garment');
  const shoe={itemId:'my-shoes',slot:'shoes',name:'我的运动鞋'};
  assert.equal(analyzedReferences({references:[{...row,matchedItemIds:[shoe.itemId],visibleSlots:['bottom','shoes']}]},[photo],[shoe]).length,1,'Shoe anchors need a visible garment, not an upper garment specifically');
  for(const quality of [{referenceQuality:undefined},{referenceQuality:'snapshot'},{styleEvidence:''}])assert.equal(analyzedReferences({references:[{...row,...quality}]},[photo],[item]).length,0,'Matching garments without fashion evidence must not pass');
  assert.equal(analyzedReferences({references:[{...row,matchedItemIds:[]}]},[photo],[item]).length,0);
  assert.equal(analyzedReferences({references:[row]},[photo],[item,shoe]).length,0,'Every locked item must be visibly matched');
  for(const visibleSlots of [undefined,['upper'],['upper','upper'],['upper','invented'],['bottom','shoes']])assert.equal(analyzedReferences({references:[{...row,visibleSlots}]},[photo],[item]).length,0);
  assert.throws(()=>analyzedReferences({references:[{...row,referenceId:'invented'}]},[photo],[item]));
  assert.throws(()=>analyzedReferences({references:[{...row,matchedItemIds:[item.itemId,'stranger']}]},[photo],[item]));
  const unsplash=unsplashRecord({id:'abcDEF_123',urls:{small:'https://images.unsplash.com/photo-test?w=640'},links:{html:'https://unsplash.com/photos/abcDEF_123'},user:{name:'Test author'},width:900,height:1200});
  assert.equal(unsplash.provider,'unsplash');assert.equal(unsplashRecord({...unsplash,id:'bad',urls:{small:'https://evil.example/a.jpg'}}),null);
});

test('Commons image fallback survives a broken thumbnail without fetching arbitrary source URLs',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rewear-commons-test-'));
  const db=new DatabaseSync(path.join(directory,'test.sqlite'));t.after(()=>db.close());
  const bytes=await sharp({create:{width:300,height:450,channels:3,background:'#888'}}).jpeg().toBuffer();
  const original='https://upload.wikimedia.org/wikipedia/commons/9/95/Photo.jpg';let direct=0;
  const helper=createPhotoSearch({db,dataDir:directory,fetcher:async (url,options)=>{
    const u=new URL(url);assert.equal(options.redirect,'error');
    if(u.hostname==='upload.wikimedia.org'){assert.equal(u.href,original);direct++;return new Response(bytes);}
    assert.equal(u.hostname,'api.openverse.org');
    return u.pathname==='/v1/images/'?Response.json({results:[{...fixture,url:original}]}):new Response('',{status:424});
  }});
  assert.equal((await helper.search([item],{})).length,1);assert.equal(direct,1);
});

test('image search caches safe proxy downloads and excludes duplicate photos across pages',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rewear-photo-test-'));
  const db=new DatabaseSync(path.join(directory,'test.sqlite'));
  t.after(()=>db.close());
  const bytes=await sharp({create:{width:300,height:450,channels:3,background:'#888'}}).jpeg().toBuffer();
  let searches=0,downloads=0;
  const helper=createPhotoSearch({db,dataDir:directory,fetcher:async url=>{
    const u=new URL(url);assert.equal(u.hostname,'api.openverse.org');
    if(u.pathname==='/v1/images/') {searches++;assert.equal(u.searchParams.get('mature'),'false');assert.match(u.searchParams.get('q'),/^[a-z -]+$/);assert.equal(u.searchParams.get('source'),null);return Response.json({results:[fixture,{...fixture,id:secondId}]});}
    assert.match(u.pathname,/^\/v1\/images\/[a-f0-9-]+\/thumb\/$/);downloads++;
    return new Response(bytes,{headers:{'content-type':'image/jpeg'}});
  }});
  const first=await helper.search([item],{styles:['简约日常']});
  assert.equal(first.length,1,'Same photograph under two IDs must not become two recommendations');
  assert.equal(searches,3);assert.equal(downloads,2);
  const again=await helper.search([item],{styles:['简约日常']});assert.equal(again.length,1);
  assert.equal(searches,3);assert.equal(downloads,2);
  const more=await helper.search([item],{styles:['简约日常']},[first[0].id]);assert.equal(more.length,0);
  assert.equal(helper.image('../../private.env'),null);
});

test('configured Unsplash joins the candidate pool and its image is not written to disk',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rewear-unsplash-test-'));
  const db=new DatabaseSync(path.join(directory,'test.sqlite'));t.after(()=>db.close());
  const bytes=await sharp({create:{width:300,height:450,channels:3,background:'#456'}}).jpeg().toBuffer();
  let openverse=0,unsplash=0,downloads=0;
  const helper=createPhotoSearch({db,dataDir:directory,unsplashKey:'secret-test-key',fetcher:async (url,options={})=>{
    const u=new URL(url);
    if(u.hostname==='api.openverse.org'){openverse++;return Response.json({results:[]});}
    if(u.hostname==='api.unsplash.com'){unsplash++;assert.equal(options.headers.Authorization,'Client-ID secret-test-key');return Response.json({results:[{id:'abcDEF_123',urls:{small:'https://images.unsplash.com/photo-test?w=640'},links:{html:'https://unsplash.com/photos/abcDEF_123'},user:{name:'Test author'},alt_description:'street outfit',width:900,height:1200}]});}
    assert.equal(u.hostname,'images.unsplash.com');downloads++;return new Response(bytes);
  }});
  const result=await helper.search([item],{styles:['街头风'],scenes:['周末出门']});
  assert.equal(openverse,3);assert.equal(unsplash,2);assert.equal(downloads,1);assert.equal(result.length,1);assert.equal(result[0].provider,'unsplash');
  assert.equal(fs.readdirSync(path.join(directory,'reference-images')).length,0);
});
