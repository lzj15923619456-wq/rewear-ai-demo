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
  const api=createApi({dataDir:directory,references:[reference],config:{COZE_ANALYZE_BASE_URL:'https://workflow.test',COZE_ANALYZE_TOKEN:'test-only',COZE_STYLIST_BASE_URL:'https://workflow.test',COZE_STYLIST_TOKEN:'test-only'},fetch:async(_,options)=>{
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
