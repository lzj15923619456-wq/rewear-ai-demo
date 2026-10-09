const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const sharp = require('sharp');
const { searchQueries, photoRecord, createPhotoSearch, analyzedReferences } = require('../photo-search.cjs');

const id = '324709e5-375e-435a-bfab-e190fa111c6a';
const secondId = '98bbbd9d-9eb1-4555-bb77-72803a03ea72';
const fixture = { id, title:'Grey hoodie outfit', creator:'Test photographer', foreign_landing_url:'https://www.flickr.com/photos/test/1', license:'by', license_version:'2.0', license_url:'https://creativecommons.org/licenses/by/2.0/', width:300, height:450 };
const item = { itemId:'my-hoodie', slot:'upper', name:'我的灰色卫衣', attributes:{subtype:'卫衣',colors:['灰色']} };

test('web search uses garment tags, rejects unsafe records and verifies model references', () => {
  const queries = searchQueries([item],{styles:['简约日常'],note:'PRIVATE-NOTE',heightCm:165});
  assert.ok(queries.some(q=>q.includes('grey hoodie')));
  assert.ok(queries.every(q=>!q.includes('PRIVATE')&&!q.includes('165')));
  assert.equal(photoRecord({...fixture,license:'by-nc'}),null);
  assert.equal(photoRecord({...fixture,foreign_landing_url:'javascript:alert(1)'}),null);
  assert.equal(photoRecord({...fixture,title:'sexy lingerie'}),null);
  const photo=photoRecord(fixture);
  const row={referenceId:photo.id,usable:true,matchedItemIds:[item.itemId],description:'灰色卫衣配牛仔裤，鞋未展示',styles:['简约日常'],scenes:['周末出门'],effects:[],exploration:40};
  assert.equal(analyzedReferences({references:[row]},[photo],[item]).length,1);
  assert.equal(analyzedReferences({references:[{...row,matchedItemIds:[]}]},[photo],[item]).length,0);
  assert.throws(()=>analyzedReferences({references:[{...row,referenceId:'invented'}]},[photo],[item]));
  assert.throws(()=>analyzedReferences({references:[{...row,matchedItemIds:[item.itemId,'stranger']}]},[photo],[item]));
});

test('image search caches safe proxy downloads and excludes duplicate photos across pages',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rewear-photo-test-'));
  const db=new DatabaseSync(path.join(directory,'test.sqlite'));
  t.after(()=>db.close());
  const bytes=await sharp({create:{width:300,height:450,channels:3,background:'#888'}}).jpeg().toBuffer();
  let searches=0,downloads=0;
  const helper=createPhotoSearch({db,dataDir:directory,fetcher:async url=>{
    const u=new URL(url);assert.equal(u.hostname,'api.openverse.org');
    if(u.pathname==='/v1/images/') {searches++;assert.equal(u.searchParams.get('mature'),'false');return Response.json({results:[fixture,{...fixture,id:secondId}]});}
    assert.match(u.pathname,/^\/v1\/images\/[a-f0-9-]+\/thumb\/$/);downloads++;
    return new Response(bytes,{headers:{'content-type':'image/jpeg'}});
  }});
  const first=await helper.search([item],{styles:['简约日常']});
  assert.equal(first.length,1,'Same photograph under two IDs must not become two recommendations');
  assert.equal(searches,2);assert.equal(downloads,2);
  const again=await helper.search([item],{styles:['简约日常']});assert.equal(again.length,1);
  assert.equal(searches,2);assert.equal(downloads,2);
  const more=await helper.search([item],{styles:['简约日常']},[first[0].id]);assert.equal(more.length,0);
  assert.equal(helper.image('../../private.env'),null);
});
