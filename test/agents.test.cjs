const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {createApi}=require('../api.cjs');
const {createLlm}=require('../agents/llm.cjs');
const {createAgents}=require('../agents/orchestrator.cjs');
const sharp=require('sharp');
const requirements={personal:{性别:'女性',年龄:29,'身高（cm）':165},scenes:['周末出门'],styles:['简约日常'],avoids:[],changeAmount:50,note:'走很多路',budget:300};
async function fixture(t,config={},fetcher){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rewear-agents-'));
  const api=createApi({dataDir:directory,config:{PHOTO_SEARCH_ENABLED:'0',...config},...(fetcher?{fetch:fetcher}:{})});
  const server=http.createServer((req,res)=>api.handle(req,res,new URL(req.url,'http://local').pathname));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));api.close();fs.rmSync(directory,{recursive:true,force:true});});
  const base='http://127.0.0.1:'+server.address().port;let cookie='';
  async function request(url,input,method=input?'POST':'GET'){
    const response=await fetch(base+url,{method,headers:{Cookie:cookie,...(input?{'Content-Type':'application/json'}:{})},body:input?JSON.stringify(input):undefined});
    if(!cookie)cookie=response.headers.get('set-cookie')?.split(';')[0]||'';
    return response;
  }
  async function item(){const i=await(await request('/api/items',{slot:'upper',sample:true})).json();await request('/api/items/'+i.itemId,{name:i.name},'PATCH');return i;}
  return {request,item};
}
test('no-key stream is explicit rule mode, keeps ownership, never calls Coze, persists budget and anonymous preference memory',async t=>{
  const {request,item}=await fixture(t,{COZE_STYLIST_BASE_URL:'https://unused.invalid',COZE_STYLIST_TOKEN:'legacy-unused'},()=>assert.fail('No model or search should run without a key'));
  assert.equal((await(await request('/api/agent/status')).json()).mode,'rules');
  const i=await item();
  const stream=await request('/api/agent/run',{itemIds:[i.itemId],requirements});
  assert.match(stream.headers.get('content-type'),/ndjson/);
  const events=(await stream.text()).trim().split('\n').map(JSON.parse),result=events.at(-1).data.result;
  assert.equal(result.mode,'rules');assert.ok(result.outfits.length);assert.ok(events.some(e=>e.agent==='stylist'&&e.data.mode==='rules'));
  const outfit=result.outfits[0];assert.equal(outfit.ai,false);assert.equal(outfit.managed,true);assert.equal(outfit.items[0].itemId,i.itemId);
  assert.ok(result.outfits.every(o=>['upper','bottom','shoes'].every(slot=>o.items.some(i=>i.id===slot))),'partial photo annotations must not claim a complete outfit');
  const plan=(await(await request('/api/plans',{outfitId:outfit.id,budget:250})).json()).plan;assert.equal(plan.budget,250);
  const review=await(await request('/api/agent/task',{task:'review',planId:plan.id,worn:false,reason:'还缺单品',note:'想更休闲'})).json();assert.equal(review.review.mode,'rules');assert.deepEqual(review.review.preferences,[]);
  await request('/api/agent/memory',{preferences:['下次更休闲']});
  const record=await(await request('/api/records')).json();assert.deepEqual(record.preferences,['下次更休闲']);
  assert.equal((await request('/api/agent/task',{task:'answer',outfitId:'another-visitor',question:'越权'})).status,404);
  assert.equal((await request('/api/agent/task',{task:'unknown'})).status,400);
  await request('/api/items/'+i.itemId,{name:'灰色卫衣',attributes:{slot:'upper',subtype:'卫衣',colors:['灰色']}},'PATCH');
  const noReference=await(await request('/api/recommendations',{itemIds:[i.itemId],requirements})).json();assert.equal(noReference.outfits.length,0);
});
test('direct multi-agent flow forwards profile and confirmed memory, ranks only supplied references and proposes review memory',async t=>{
  const actions=[];
  const config={REWEAR_LLM_BASE_URL:'https://llm.example/v1',REWEAR_LLM_API_KEY:'test-only',REWEAR_MODEL_MAIN:'main-test',REWEAR_MODEL_ITEM:'vision-test',REWEAR_MODEL_STYLIST:'stylist-test',REWEAR_MODEL_WARDROBE:'wardrobe-test',REWEAR_MODEL_REVIEW:'review-test'};
  const {request,item}=await fixture(t,config,async(url,options)=>{
    assert.equal(String(url),'https://llm.example/v1/chat/completions');const request=JSON.parse(options.body),p=JSON.parse(request.messages[1].content),system=request.messages[0].content;
    let result;
    if(system.includes('你是主 Agent')){assert.equal(request.model,'main-test');actions.push('main');assert.equal(p.profile.heightCm,165);assert.deepEqual(p.preferences,['更休闲']);result={status:'completed',summary:'周末步行，保留西装',constraints:['走很多路'],questions:[]};}
    else if(system.includes('你是穿着复盘 Agent')){assert.equal(request.model,'review-test');actions.push('review');result={summary:'下次更休闲',preferences:['少些正式感']};}
    else if(system.includes('你是衣柜落地 Agent')){assert.equal(request.model,'wardrobe-test');actions.push(p.action);result=p.action==='revise'?(p.revision.note.includes('冲突')?{status:'needs_confirmation',outfits:[],questions:['具体要保留哪一项？'],warnings:[]}:{status:'completed',outfits:[{referenceId:p.originalOutfit.referenceId,lockedItemIds:p.lockedItems.map(i=>i.itemId),title:'保留裤装换鞋',reason:'根据步行要求调整鞋履',items:[{id:'bottom',name:'模型想改的裤装'},{id:'shoes',name:'黑色平底运动鞋'}]}]}):{status:'completed',answer:'考虑轻便鞋履'};}
    else {assert.equal(request.model,'stylist-test');actions.push('stylist');assert.equal(p.requirements.budget,300);assert.ok(p.referenceCandidates[0].baseline);result={status:'completed',outfits:[{referenceId:p.referenceCandidates[0].referenceId,lockedItemIds:p.lockedItems.map(i=>i.itemId),title:'周末西装',reason:'根据步行需求建议轻便鞋',difference:'鞋子与原照不同',items:[{id:'bottom',name:'蓝色牛仔裤'},{id:'shoes',name:'运动鞋'}]}]};}
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]});
  });
  const i=await item();await request('/api/agent/memory',{preferences:['更休闲']});
  const stream=await request('/api/agent/run',{itemIds:[i.itemId],requirements});const events=(await stream.text()).trim().split('\n').map(JSON.parse),result=events.at(-1).data.result;
  assert.equal(result.mode,'ai');assert.equal(result.outfits.length,1);assert.deepEqual(actions,['main','stylist','main']);
  const outfit=result.outfits[0];assert.equal(outfit.items[0].name,i.name);
  const answer=await(await request('/api/agent/task',{task:'answer',outfitId:outfit.id,question:'可以换鞋吗'})).json();assert.match(answer.answer,/轻便/);
  const question=await(await request('/api/agent/task',{task:'revise',outfitId:outfit.id,version:outfit.version,keepIds:['bottom'],note:'保留条件冲突'})).json();
  assert.equal(question.changed,false);assert.deepEqual(question.questions,['具体要保留哪一项？']);assert.equal(question.originalOutfit.version,outfit.version);
  assert.equal((await(await request('/api/records')).json()).outfits[0].version,outfit.version,'追问不得写入方案');
  const revised=await(await request('/api/agent/task',{task:'revise',outfitId:outfit.id,version:outfit.version,keepIds:['bottom'],note:'保留裤装，鞋子换成黑色平底运动鞋'})).json();
  assert.equal(revised.outfit.mode,'ai');assert.equal(revised.outfit.version,outfit.version+1);
  assert.equal(revised.outfit.items.find(i=>i.id==='bottom').name,outfit.items.find(i=>i.id==='bottom').name);
  assert.equal(revised.outfit.items.find(entry=>entry.itemId===i.itemId)?.name,i.name);
  assert.equal(revised.outfit.items.find(i=>i.id==='shoes').name,'黑色平底运动鞋');
  const plan=(await(await request('/api/plans',{outfitId:outfit.id})).json()).plan;
  const feedback=await(await request('/api/agent/task',{task:'review',planId:plan.id,worn:true,satisfaction:'还不错',note:'太正式'})).json();assert.deepEqual(feedback.review.preferences,['少些正式感']);
  assert.deepEqual((await(await request('/api/records')).json()).preferences,['更休闲'],'proposed memory is not saved without user confirmation');
});

test('network inspection uses bounded batches, preserves successful batches and labels failures honestly',async t=>{
  const photos=Array.from({length:8},(_,i)=>({id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,source:'stocksnap',tags:[{name:'fashion'}],title:'Grey hoodie outfit',creator:'Test photographer',foreign_landing_url:`https://example.org/photo/${i}`,license:'by',license_version:'2.0',license_url:'https://creativecommons.org/licenses/by/2.0/',width:300,height:450}));
  const bytes=await Promise.all(photos.map((_,i)=>{const raw=Buffer.alloc(96*128*3);let seed=i+1;for(let n=0;n<raw.length;n++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;raw[n]=seed>>>24;}return sharp(raw,{raw:{width:96,height:128,channels:3}}).jpeg().toBuffer();}));
  let active=0,peak=0;const batches=[];
  const {request,item}=await fixture(t,{PHOTO_SEARCH_ENABLED:'1',REWEAR_LLM_BASE_URL:'https://llm.example/v1',REWEAR_LLM_API_KEY:'test-only',REWEAR_MODEL_MAIN:'main',REWEAR_MODEL_REFERENCE:'vision',REWEAR_MODEL_STYLIST:'stylist'},async(url,options)=>{
    const u=new URL(url);
    if(u.hostname==='api.openverse.org')return u.pathname.endsWith('/thumb/')?new Response(bytes[photos.findIndex(p=>u.pathname.includes(p.id))]):Response.json({results:photos});
    const body=JSON.parse(options.body);let result;
    if(body.model==='vision'){
      assert.match(body.messages[0].content,/夜市\/工作记录/);assert.match(body.messages[0].content,/不为凑数量降低门槛/);
      const ids=body.messages[1].content.filter(c=>c.type==='text'&&c.text.startsWith('referenceId=')).map(c=>c.text.slice(12));
      batches.push(ids);assert.ok(ids.length<=6);active++;peak=Math.max(peak,active);
      await new Promise(resolve=>setTimeout(resolve,10));active--;
      if(ids.includes('openverse-'+photos[7].id))return new Response('unavailable',{status:503});
      const p=JSON.parse(body.messages[1].content[0].text);
      assert.equal(p.profile,undefined);assert.equal(p.preferences,undefined);assert.equal(p.requirements.note,undefined,'photo inspection must not turn private planning constraints into picture rejection rules');
      result={references:ids.map(id=>({referenceId:id,usable:true,matchedItemIds:[p.lockedItems[0].itemId],visibleSlots:['upper','bottom'],referenceQuality:'fashion',styleEvidence:'灰白配色与宽松廓形，上衣裤装完整，背景干净',description:'灰色卫衣配牛仔裤，鞋不可见',styles:['简约日常'],scenes:['周末出门'],effects:[],exploration:50}))};
    }else{
      const p=JSON.parse(body.messages[1].content);
      if(body.model==='stylist')assert.ok(p.referenceCandidates.every(c=>c.styleEvidence),'Photo styling evidence must reach the recommender');
      result=body.model==='main'?{status:'completed',summary:'保留卫衣',constraints:[],questions:[]}:{status:'completed',outfits:p.referenceCandidates.map(c=>({referenceId:c.referenceId,lockedItemIds:p.lockedItems.map(i=>i.itemId),title:'卫衣搭配',reason:'舒适休闲',items:[{id:'bottom',name:'牛仔裤'},{id:'shoes',name:'运动鞋'}]}))};
    }
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]});
  });
  const i=await item();await request('/api/items/'+i.itemId,{name:'我的灰卫衣',attributes:{slot:'upper',subtype:'卫衣',colors:['灰色']}},'PATCH');
  const response=await request('/api/agent/run',{itemIds:[i.itemId],requirements});
  const events=(await response.text()).trim().split('\n').map(JSON.parse),result=events.at(-1).data.result;
  assert.equal(result.mode,'ai');assert.equal(result.outfits.length,6);assert.equal(peak,1);assert.deepEqual(batches.map(b=>b.length),[6,2]);
  assert.ok(result.outfits.every(o=>o.referenceId.startsWith('openverse-')));
  assert.ok(result.warnings.some(w=>w.includes('视觉核对不可用')));assert.ok(result.warnings.some(w=>w.includes('核对 6 张')));
  assert.ok(events.some(e=>e.agent==='reference'&&e.type==='log'&&e.data.message.includes('符合单品要求')));
  assert.ok(events.some(e=>e.agent==='reference'&&e.type==='error'));
});

test('configured model order is respected, JSON fences are supported and account errors/cancellation never trigger backups',async t=>{
  const config={REWEAR_LLM_BASE_URL:'https://llm.example/v1',REWEAR_LLM_API_KEY:'test-only',REWEAR_MODEL_MAIN:'first, second,first, third'};
  const models=[],events=[];
  const deadlines=[],realTimeout=AbortSignal.timeout;
  t.mock.method(AbortSignal,'timeout',ms=>{deadlines.push(ms);return realTimeout(ms);});
  const llm=createLlm(config,async(_,options)=>{
    const request=JSON.parse(options.body);models.push(request.model);assert.ok(request.max_tokens>=1500);
    if(request.model==='first')return new Response('busy',{status:503});
    return Response.json({choices:[{finish_reason:'stop',message:{content:'```json\n{"summary":"成功"}\n```'}}]});
  });
  assert.deepEqual(await llm.call('test',{}, {onFallback:e=>events.push(e)}),{summary:'成功'});
  assert.deepEqual(models,['first','second']);assert.equal(events[0].attempt,2);
  assert.deepEqual(deadlines,[30000,10000,10000],'fallback attempts share a bounded thirty-second budget');
  for(const status of [401,402,403]){
    let calls=0;await assert.rejects(createLlm(config,async()=>{calls++;return new Response('',{status});}).call('test',{}),status===402?/余额不足/:/授权失败/);assert.equal(calls,1);
  }
  const controller=new AbortController();let calls=0;
  await assert.rejects(createLlm(config,async()=>{calls++;controller.abort();throw new Error('aborted');}).call('test',{}, {signal:controller.signal}),/任务已停止/);assert.equal(calls,1);
  await assert.rejects(createLlm(config,()=>assert.fail()).call('test',{}, {signal:controller.signal}),/任务已停止/);
  const content='Here is your JSON: {"summary":"invalid wrapper"}';let malformedCalls=0;
  await assert.rejects(createLlm(config,async()=>{malformedCalls++;return Response.json({choices:[{finish_reason:'stop',message:{content}}]});}).call('test',{}));assert.equal(malformedCalls,3);
  await assert.rejects(createLlm({...config,REWEAR_MODEL_MAIN:'a,b,c,d,e,f'},()=>assert.fail()).call('test',{}),/五个/);
});

test('DeepSeek sends JSON and inline images without default thinking; other gateways keep their own defaults',async()=>{
  for(const base of ['https://api.deepseek.com','https://llm.example/v1']){
    const llm=createLlm({REWEAR_LLM_BASE_URL:base,REWEAR_LLM_API_KEY:'test-only',REWEAR_MODEL_ITEM:'user-selected-vision'},async(url,options)=>{
      assert.equal(String(url),base+'/chat/completions');
      const request=JSON.parse(options.body);
      assert.equal(request.model,'user-selected-vision');
      assert.deepEqual(request.response_format,{type:'json_object'});
      assert.deepEqual(request.thinking,base.includes('api.deepseek.com')?{type:'disabled'}:undefined);
      assert.equal(request.messages[1].content[1].image_url.url,'data:image/jpeg;base64,YWJj');
      return Response.json({choices:[{finish_reason:'stop',message:{content:'{"status":"needs_confirmation"}'}}]});
    });
    await llm.call('Return JSON',{imageUrl:'data:image/jpeg;base64,YWJj'},{agent:'item',vision:true});
  }
});

test('Qwen compatible endpoint disables thinking for the evaluated production parameters',async()=>{
  const llm=createLlm({REWEAR_LLM_BASE_URL:'https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',REWEAR_LLM_API_KEY:'test-only',REWEAR_MODEL_ITEM:'qwen3.5-plus-2026-02-15'},async(_,options)=>{
    const request=JSON.parse(options.body);assert.equal(request.enable_thinking,false);
    return Response.json({choices:[{finish_reason:'stop',message:{content:'{"status":"needs_confirmation"}'}}]});
  });
  await llm.call('JSON',{imageUrl:'data:image/jpeg;base64,YWJj'},{agent:'item',vision:true});
});

test('mixed providers route each role with its own key and never leak shared credentials to an override',async()=>{
  const config={REWEAR_LLM_BASE_URL:'https://api.deepseek.com',REWEAR_LLM_API_KEY:'deepseek-test',REWEAR_MODEL_MAIN:'deepseek-flash',REWEAR_MODEL_REFERENCE:'kimi-k2.6',REWEAR_LLM_REFERENCE_BASE_URL:'https://api.moonshot.cn/v1',REWEAR_LLM_REFERENCE_API_KEY:'kimi-test'};
  const llm=createLlm(config,async(url,options)=>{
    const request=JSON.parse(options.body);
    if(request.model==='kimi-k2.6'){
      assert.equal(String(url),'https://api.moonshot.cn/v1/chat/completions');
      assert.equal(options.headers.Authorization,'Bearer kimi-test');
      assert.deepEqual(request.thinking,{type:'disabled'});assert.equal(request.temperature,0.6);
      assert.deepEqual(request.response_format,{type:'json_object'});
      assert.ok(request.messages[1].content.some(c=>c.type==='image_url'));
    }else{
      assert.equal(String(url),'https://api.deepseek.com/chat/completions');
      assert.equal(options.headers.Authorization,'Bearer deepseek-test');
      assert.deepEqual(request.thinking,{type:'disabled'});
    }
    return Response.json({choices:[{finish_reason:'stop',message:{content:'{"ok":true}'}}]});
  });
  await llm.call('JSON',{}, {agent:'main'});
  await llm.call('JSON',{imageUrl:'data:image/jpeg;base64,YWJj'}, {agent:'reference',vision:true});
  const missing=createLlm({...config,REWEAR_LLM_REFERENCE_API_KEY:''},()=>assert.fail('Shared secret must not leave its provider'));
  assert.equal(missing.readyFor('main'),true);assert.equal(missing.readyFor('reference'),false);
  await assert.rejects(missing.call('JSON',{}, {agent:'reference'}),/未配置/);
  const unsafe=createLlm({...config,REWEAR_LLM_REFERENCE_BASE_URL:'http://outside.invalid'},()=>assert.fail());
  await assert.rejects(unsafe.call('JSON',{}, {agent:'reference'}),/HTTPS/);
});

test('visual tools use separate item and reference models and role configuration never silently chooses a model',async()=>{
  const config={REWEAR_LLM_BASE_URL:'https://llm.example/v1',REWEAR_LLM_API_KEY:'test-only',REWEAR_MODEL_ITEM:'item-vision',REWEAR_MODEL_REFERENCE:'reference-first,reference-second'};
  const events=[],models=[];
  const agents=createAgents(config,async(_,options)=>{
    const request=JSON.parse(options.body);models.push(request.model);assert.ok(request.messages[1].content.some(c=>c.type==='image_url'));
    if(request.model==='reference-first')return Response.json({choices:[{finish_reason:'length',message:{content:'{}'}}]});
    return Response.json({choices:[{finish_reason:'stop',message:{content:'{"status":"needs_confirmation"}'}}]});
  });
  assert.equal(agents.ready,false);assert.equal(agents.readyFor('item'),true);assert.equal(agents.readyFor('review'),false);
  await agents.run({action:'analyze',imageUrl:'data:image/jpeg;base64,YWJj'},{emit:e=>events.push(e)});
  assert.deepEqual(models,['item-vision']);assert.ok(events.some(e=>e.agent==='item'));
  models.length=0;
  await agents.run({action:'inspect_references',imageCandidates:[{referenceId:'r1',imageUrl:'data:image/jpeg;base64,YWJj'}]});
  assert.deepEqual(models,['reference-first','reference-second']);
  await assert.rejects(agents.run({action:'answer'}),/未配置/);
});

test('review-only configuration still enforces AI quota and saves feedback before model failure',async t=>{
  let calls=0;
  const {request,item}=await fixture(t,{REWEAR_LLM_BASE_URL:'https://llm.example/v1',REWEAR_LLM_API_KEY:'test-only',REWEAR_MODEL_REVIEW:'review-only',AI_USER_DAILY_LIMIT:'1'},async(_,options)=>{
    calls++;assert.equal(JSON.parse(options.body).model,'review-only');return Response.json({choices:[{finish_reason:'stop',message:{content:'{"summary":"更休闲","preferences":["更休闲"]}'}}]});
  });
  const status=await(await request('/api/agent/status')).json();assert.equal(status.configuredAgents.review,true);assert.equal(status.configuredAgents.main,false);
  const i=await item();const result=await(await request('/api/recommendations',{itemIds:[i.itemId],requirements})).json();assert.equal(result.mode,'rules');
  const plan=(await(await request('/api/plans',{outfitId:result.outfits[0].id})).json()).plan;
  const feedback=()=>request('/api/agent/task',{task:'review',planId:plan.id,worn:false,reason:'还缺单品'});
  assert.equal((await(await feedback()).json()).review.mode,'ai');
  const limited=await(await feedback()).json();assert.equal(limited.review.mode,'rules');assert.match(limited.review.summary,/额度/);assert.equal(limited.feedback.worn,false);assert.equal(calls,1);
});
test('model errors and malformed JSON degrade honestly; unsafe endpoints and truncated results are rejected',async()=>{
  const config={REWEAR_LLM_BASE_URL:'https://llm.example/v1',REWEAR_LLM_API_KEY:'test-only',REWEAR_LLM_MODEL:'text'};
  for(const response of [new Response('down',{status:503}),Response.json({choices:[{finish_reason:'length',message:{content:'{}'}}]}),Response.json({choices:[{finish_reason:'stop',message:{content:'bad'}}]})]){
    await assert.rejects(createLlm(config,async()=>response).call('test',{}));
  }
  await assert.rejects(createLlm({...config,REWEAR_LLM_BASE_URL:'http://outside.invalid/v1'},()=>assert.fail()).call('test',{}),/HTTPS/);
  let captured;
  const llm=createLlm({...config,REWEAR_LLM_VISION_MODEL:'vision'},async(_,options)=>{captured=JSON.parse(options.body);return Response.json({choices:[{finish_reason:'stop',message:{content:'{"status":"needs_confirmation"}'}}]});});
  await llm.call('test',{imageUrl:'data:image/jpeg;base64,YWJj'},{vision:true});assert.equal(captured.model,'vision');assert.equal(captured.messages[1].content[1].type,'image_url');
});
