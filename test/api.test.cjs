const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { createApi, normalizeRequirements, validateOutfits, decodeImage } = require('../api.cjs');

const requirements = {personal:{性别:'女性',年龄:29},scenes:['日常通勤'],styles:['简约日常'],avoids:[],changeAmount:50,note:'走很多路'};
const reference = {id:'test-photo',image:'assets/test.jpg',sourceUrl:'https://example.org/photo',credit:'Test fixture',styles:['简约日常'],scenes:['日常通勤'],exploration:50,effects:[],description:'真实参考元数据测试样例'};
test('non-blazer HTTP flow searches and inspects photos, serves cached images, revises and saves a dynamic reference',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rewear-online-test-'));
  const photoId='324709e5-375e-435a-bfab-e190fa111c6a';
  const photoBytes=await sharp({create:{width:300,height:450,channels:3,background:'#888'}}).jpeg().toBuffer();
  const actions=[];
  const api=createApi({dataDir:directory,references:[],config:{COZE_ANALYZE_BASE_URL:'https://workflow.test',COZE_ANALYZE_TOKEN:'test-only',COZE_STYLIST_BASE_URL:'https://workflow.test',COZE_STYLIST_TOKEN:'test-only'},fetch:async(url,options)=>{
    const u=new URL(url);
    if(u.hostname==='api.openverse.org'){
      if(u.pathname.endsWith('/thumb/'))return new Response(photoBytes);
      assert.match(u.searchParams.get('q'),/hoodie/);
      return Response.json({results:[{id:photoId,title:'Grey hoodie',creator:'Fixture author',foreign_landing_url:'https://example.org/photo',license:'by-sa',license_version:'2.0',license_url:'https://creativecommons.org/licenses/by-sa/2.0/',width:300,height:450}]});
    }
    const p=JSON.parse(options.body).payload;actions.push(p.action);
    if(p.action==='inspect_references'){
      assert.equal(p.imageCandidates.length,1);assert.match(p.imageCandidates[0].imageUrl,/^data:image\/jpeg;base64,/);
      return Response.json({result:{status:'completed',references:[{referenceId:p.imageCandidates[0].referenceId,usable:true,matchedItemIds:[p.lockedItems[0].itemId],description:'灰卫衣搭配牛仔裤，鞋未展示',styles:['简约日常'],scenes:['日常通勤'],effects:[],exploration:50}]}});
    }
    const id=p.action==='revise'?p.originalOutfit.referenceId:p.referenceCandidates[0].referenceId;
    return Response.json({result:{status:'completed',outfits:[{referenceId:id,lockedItemIds:p.lockedItems.map(i=>i.itemId),title:'灰色卫衣搭配',reason:'通勤使用舒适鞋履',items:[{id:'bottom',name:'蓝色牛仔裤'},{id:'shoes',name:'运动鞋'}]}]}});
  }});
  const server=http.createServer((req,res)=>api.handle(req,res,new URL(req.url,'http://local').pathname));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));api.close();fs.rmSync(directory,{recursive:true,force:true});});
  const base='http://127.0.0.1:'+server.address().port;let cookie='';
  async function request(url,body,method=body?'POST':'GET'){
    const res=await fetch(base+url,{method,headers:{Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
    if(!cookie)cookie=res.headers.get('set-cookie')?.split(';')[0]||'';
    assert.ok(res.ok,'HTTP request failed');return res.json();
  }
  const item=await request('/api/items',{slot:'upper',sample:true});
  await request('/api/items/'+item.itemId,{name:'我的灰色卫衣',attributes:{slot:'upper',subtype:'卫衣',colors:['灰色']}},'PATCH');
  const result=await request('/api/recommendations',{itemIds:[item.itemId],requirements});
  assert.deepEqual(actions,['inspect_references','recommend']);assert.equal(result.outfits.length,1);
  const outfit=result.outfits[0];assert.equal(outfit.items[0].name,'我的灰色卫衣');assert.equal(outfit.credit,'Fixture author');
  assert.match(outfit.photoChanges,/Resized/);
  const image=await fetch(base+outfit.image);assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/jpeg');
  const revised=(await request('/api/outfits/'+outfit.id+'/revisions',{version:1,note:'使用运动鞋',keepIds:['bottom']})).outfit;
  assert.equal(revised.referenceId,outfit.referenceId);assert.equal(revised.version,2);
  const saved=(await request('/api/plans',{outfitId:outfit.id})).plan;assert.equal(saved.outfit.credit,'Fixture author');
  const more=await request('/api/recommendations',{itemIds:[item.itemId],requirements,excludeReferenceIds:[outfit.referenceId]});
  assert.equal(more.outfits.length,0);assert.deepEqual(actions,['inspect_references','recommend','revise']);
});
test('trust boundaries reject invalid profile, image, invented photo and dropped locked clothing',async()=>{
  assert.throws(()=>normalizeRequirements({...requirements,personal:{性别:'女性',年龄:1.5}}));
  assert.throws(()=>normalizeRequirements({...requirements,scenes:[]}));
  await assert.rejects(decodeImage('data:image/png;base64,YmFk'));
  const image=await sharp({create:{width:50,height:50,channels:3,background:'#fff'}}).png().toBuffer();
  assert.equal((await sharp(await decodeImage('data:image/png;base64,'+image.toString('base64'))).metadata()).format,'jpeg');
  const locked=[{itemId:'shirt-id',slot:'upper',name:'我的西装'}];
  const row={referenceId:reference.id,lockedItemIds:['shirt-id'],title:'测试方案',reason:'保留衣物',items:[{id:'upper',name:'错误外套'},{id:'bottom',name:'灰裤'}]};
  const result=validateOutfits({outfits:[row]},[reference],locked,1);
  assert.equal(result[0].items[0].name,'我的西装');
  assert.throws(()=>validateOutfits({outfits:[{...row,referenceId:'made-up'}]},[reference],locked,1));
  assert.throws(()=>validateOutfits({outfits:[{...row,lockedItemIds:[]}]},[reference],locked,1));
});

test('HTTP flow isolates visitors, preserves kept items, rejects stale revisions and persists plan snapshots',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rewear-test-'));
  let calls=0;
  const api=createApi({dataDir:directory,references:[reference],config:{PHOTO_SEARCH_ENABLED:'0',COZE_ANALYZE_BASE_URL:'https://workflow.test',COZE_ANALYZE_TOKEN:'test-only',COZE_STYLIST_BASE_URL:'https://workflow.test',COZE_STYLIST_TOKEN:'test-only'},fetch:async(_,options)=>{
    calls++;
    const p=JSON.parse(options.body).payload;
    if(p.question==='触发无效结构测试')return new Response(JSON.stringify({result:{status:'error',warnings:['invalid_model_output'],outfits:[]}}));
    const row={referenceId:reference.id,lockedItemIds:p.lockedItems.map(i=>i.itemId),title:'按要求保留黑西装',reason:'适合通勤，步行使用平底鞋',items:[{id:'bottom',name:'灰色直筒裤'},{id:'shoes',name:'舒适平底鞋'}]};
    if(p.action==='revise')row.items=[{id:'shoes',name:'黑色运动鞋'}];
    return new Response(JSON.stringify({result:p.action==='answer'?{answer:'可以选择低帮运动鞋。'}:{status:'completed',outfits:[row]}}));
  }});
  const server=http.createServer((req,res)=>api.handle(req,res,new URL(req.url,'http://local').pathname));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));api.close();fs.rmSync(directory,{recursive:true,force:true});});
  const base='http://127.0.0.1:'+server.address().port;
  let cookie='';
  async function request(url,body,method=body?'POST':'GET',visitor=cookie){
    const response=await fetch(base+url,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),Cookie:visitor},body:body?JSON.stringify(body):undefined});
    if(response.headers.get('set-cookie')&&!visitor)cookie=response.headers.get('set-cookie').split(';')[0];
    return {status:response.status,body:await response.json()};
  }
  const item=(await request('/api/items',{slot:'upper',sample:true})).body;
  assert.equal(item.confirmed,false);
  assert.equal((await request('/api/items/'+item.itemId,{name:'我的黑西装'},'PATCH')).status,200);
  const generated=await request('/api/recommendations',{itemIds:[item.itemId],requirements});
  assert.equal(generated.status,200);
  assert.equal(generated.body.status,'insufficient_references');
  assert.ok(generated.body.warnings.some(w=>w.includes('1 套')));
  const outfit=generated.body.outfits[0];
  assert.equal(outfit.items[0].name,'我的黑西装');
  assert.equal(outfit.match.percent,100);
  const saved=(await request('/api/plans',{outfitId:outfit.id,owned:{upper:'missing'}})).body.plan;
  assert.equal(saved.items.find(i=>i.id==='upper').status,'owned');
  const revised=(await request('/api/outfits/'+outfit.id+'/revisions',{version:1,note:'换运动鞋',keepIds:['bottom']})).body.outfit;
  assert.equal(revised.version,2);
  assert.equal(revised.items.find(i=>i.id==='bottom').name,'灰色直筒裤');
  const before=calls;
  assert.equal((await request('/api/outfits/'+outfit.id+'/revisions',{version:1,note:'旧请求'})).status,409);
  assert.equal(calls,before);
  assert.equal((await request('/api/outfits/'+outfit.id+'/questions',{question:'可以换运动鞋吗'})).body.answer,'可以选择低帮运动鞋。');
  const invalid=await request('/api/outfits/'+outfit.id+'/questions',{question:'触发无效结构测试'});
  assert.equal(invalid.status,502);
  assert.match(invalid.body.error,/AI 返回格式不正确/);
  const ownerCookie=cookie;
  const other=await request('/api/records',undefined,'GET','');
  assert.deepEqual(other.body.outfits,[]);
  assert.equal((await request('/api/outfits/'+outfit.id+'/questions',{question:'越权'})).status,404);
  const original=await request('/api/records',undefined,'GET',ownerCookie);
  // Check saved snapshots with the original visitor after creating a second visitor.
  assert.equal(original.body.plans[0].outfit.version,1);
});
