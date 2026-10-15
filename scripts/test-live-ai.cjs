// Explicit opt-in integration check. Never accepts rule fallback as real AI success.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {createApi} = require('../api.cjs');
const {createLlm}=require('../agents/llm.cjs');
try { process.loadEnvFile(path.join(__dirname,'../.env')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
try { process.loadEnvFile(path.join(__dirname,'../.env.local')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

async function main() {
  assert.ok(process.argv.includes('--run'),'真实测试需传入 --run；会调用付费模型');
  const imageArg = process.argv.indexOf('--image');
  assert.ok(imageArg >= 0 && process.argv[imageArg + 1], '请用 --image 指定有权使用的清晰单品照片');
  const network = process.argv.includes('--network');
  const slotArg = process.argv.indexOf('--slot');
  const slot = slotArg < 0 ? 'upper' : process.argv[slotArg + 1];
  assert.ok(['upper','bottom','shoes'].includes(slot),'--slot 必须是 upper、bottom 或 shoes');
  const imagePath = path.resolve(process.argv[imageArg + 1]);
  const imageMime = {'.jpg':'jpeg','.jpeg':'jpeg','.png':'png','.webp':'webp'}[path.extname(imagePath).toLowerCase()];
  assert.ok(imageMime, '测试图片仅支持 JPG、PNG、WEBP');
  const image = fs.readFileSync(imagePath);
  const legacy=process.env.REWEAR_AI_PROVIDER==='coze';
  assert.ok(legacy ? process.env.COZE_ANALYZE_TOKEN && process.env.COZE_STYLIST_TOKEN : Object.values(createLlm(process.env).configured).every(Boolean),'请先完成六个任务角色的私密模型配置');
  const directory = path.join(__dirname,'../.runtime/live-ai-'+Date.now());
  fs.mkdirSync(directory,{recursive:true});
  const inspections=[];
  const api = createApi({dataDir:directory,fetch:async(url,options)=>{
    const response=await fetch(url,options);
    if(options?.body && String(url).endsWith('/chat/completions')) {
      const input=JSON.parse(options.body).messages?.[1]?.content;
      if(Array.isArray(input) && JSON.parse(input[0].text).action==='inspect_references' && response.ok) {
        const reply=await response.clone().json();
        try{inspections.push(JSON.parse(reply.choices?.[0]?.message?.content));}catch{}
      }
    }
    return response;
  }});
  const server = http.createServer((req,res)=>api.handle(req,res,new URL(req.url,'http://local').pathname));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base = 'http://127.0.0.1:'+server.address().port;
  let cookie = '';
  const report = {startedAt:new Date().toISOString(),mode:legacy?'real-coze':'real-direct-agent',networkRequired:network,slot,checks:[]};
  const check = (name,detail) => {report.checks.push({name,detail});console.log(name+': '+detail);};
  async function request(url,body,method=body?'POST':'GET',visitor=cookie) {
    const response = await fetch(base+url,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),Cookie:visitor,...(process.env.PUBLIC_ORIGIN?{Origin:process.env.PUBLIC_ORIGIN}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(300000)});
    if (!visitor && response.headers.get('set-cookie')) cookie=response.headers.get('set-cookie').split(';')[0];
    let result;
    if(response.headers.get('content-type')?.includes('ndjson')) {
      const events=[],decoder=new TextDecoder();let pending='';
      const consume=line=>{if(!line.trim())return;const event=JSON.parse(line);events.push(event);if(event.agent==='reference'&&['log','error'].includes(event.type))console.log('网络核对进度: '+(event.data?.message||''));};
      for await(const chunk of response.body){pending+=decoder.decode(chunk,{stream:true});let end;while((end=pending.indexOf('\n'))>=0){consume(pending.slice(0,end));pending=pending.slice(end+1);}}
      pending+=decoder.decode();consume(pending);
      report.agentEvents=events.filter(e=>!e.data?.result);
      const final=events.at(-1);
      assert.ok(final?.data?.result,final?.data?.message||'Agent 流程没有最终结果');
      result=final.data.result;
    } else result = await response.json();
    assert.ok(response.ok,`${url}: HTTP ${response.status}, ${result.error||'请求失败'}`);
    return result;
  }
  try {
    const item = await request('/api/items',{slot,name:'待识别单品',imageData:'data:image/'+imageMime+';base64,'+image.toString('base64')});
    assert.notEqual(item.mode,'rules','识图已降级，不能算真实模型验收');
    assert.equal(item.confirmed,false);
    assert.equal(item.attributes.slot,slot);
    if(!network) {
      assert.match(item.attributes.subtype,/blazer|西装|西服/i);
      assert.ok(item.attributes.colors.some(c=>['black','黑色','黑'].includes(c)));
    } else assert.ok(item.attributes.subtype && item.attributes.colors.length,'联网测试需要真实识别类别和颜色');
    report.item={name:item.name,attributes:item.attributes};
    check('真实衣物识别',JSON.stringify(item.attributes));
    const confirmed = await request('/api/items/'+item.itemId,{name:item.name,attributes:item.attributes},'PATCH');
    assert.equal(confirmed.confirmed,true);
    const requirements={personal:{性别:'女性',年龄:29,'身高（cm）':165},scenes:['周末出门'],styles:['简约日常'],avoids:[],changeAmount:50,note:''};
    const recommendationStart=Date.now();
    const generated = await request(legacy?'/api/recommendations':'/api/agent/run',{itemIds:[item.itemId],requirements});
    report.recommendationWarnings=generated.warnings||[];
    report.recommendationMs=Date.now()-recommendationStart;
    report.outfits=generated.outfits.map(({referenceId,image,sourceUrl,credit,license,licenseUrl,title,difference,items})=>({referenceId,image,sourceUrl,credit,license,licenseUrl,title,difference,items}));
    assert.ok(generated.outfits.length>0 && generated.outfits.length<=6,'没有返回可验收的方案：'+report.recommendationWarnings.join('；'));
    assert.notEqual(generated.mode,'rules','推荐已降级，不能算真实模型验收');
    if(!legacy) {
      const mainDone=report.agentEvents.filter(e=>e.agent==='main'&&e.type==='done'&&e.data.mode==='ai');
      assert.equal(mainDone.length,2,'主理人整理或总结未真实完成');
      assert.ok(generated.summary?.trim(),'主理人未返回总结');
      check('真实主理人整理与总结','两个阶段均真实完成，非规则降级');
    }
    assert.equal(new Set(generated.outfits.map(o=>o.referenceId)).size,generated.outfits.length);
    if(network) {
      assert.ok(generated.outfits.every(o=>o.referenceId.startsWith('openverse-')),'联网验收不能使用本地参考冒充网络结果');
      assert.ok(report.agentEvents.some(e=>e.agent==='reference'&&e.type==='log'&&e.data.mode==='ai'&&e.data.message.includes('符合单品要求')),'未完成真实网络图片核对');
      for(const outfit of generated.outfits) {
        assert.match(outfit.image,/^\/api\/reference-images\//);assert.ok(outfit.credit&&outfit.licenseUrl,'网络结果缺少来源许可');
        const photo=await fetch(base+outfit.image);
        assert.equal(photo.status,200);assert.equal(photo.headers.get('content-type'),'image/jpeg');
      }
      check('真实联网推荐',generated.outfits.length+' 套均来自联网检索与视觉核对，图片缓存可读取；耗时 '+Math.round(report.recommendationMs/1000)+' 秒');
    }
    for (const outfit of generated.outfits) {
      assert.equal(outfit.items.find(i=>i.itemId===item.itemId)?.name,item.name);
      assert.ok(outfit.sourceUrl && outfit.difference);
    }
    check('真实搭配生成',generated.outfits.length+' 套，引用互不重复并保留录入衣物');
    const first = generated.outfits[0];
    const answer = await request('/api/outfits/'+first.id+'/questions',{question:'这套能穿舒适平底鞋走很多路吗？请说明鞋履和参考照片的差异。'});
    assert.notEqual(answer.mode,'rules','问答已降级，不能算真实模型验收');
    assert.ok(answer.answer.length>10);
    check('真实追问',answer.answer);
    const keep = first.items.find(i=>i.id==='bottom');
    const revised = (await request('/api/outfits/'+first.id+'/revisions',{version:first.version,keepIds:keep?['bottom']:[],note:'保留已经选好的裤装和录入单品。'+(slot==='shoes'?'调整其他单品为周末休闲风，不要改动录入的鞋。':'鞋子改成黑色平底运动鞋，不要高跟鞋。')})).outfit;
    assert.equal(revised.version,first.version+1);
    assert.notEqual(revised.mode,'rules','修改已降级，不能算真实模型验收');
    assert.equal(revised.items.find(i=>i.itemId===item.itemId)?.name,item.name);
    if(keep)assert.equal(revised.items.find(i=>i.id==='bottom')?.name,keep.name);
    check('真实方案调整','版本增加，保留单品和指定下装');
    const plan = (await request('/api/plans',{outfitId:first.id,owned:{[slot]:'missing'}})).plan;
    assert.equal(plan.items.find(i=>i.itemId===item.itemId).status,'owned');
    const feedback=await request('/api/plans/'+plan.id+'/feedback',{worn:true,satisfaction:'还不错，但想更休闲',note:'下次希望少些正式感，继续穿舒适平底鞋。'});
    if(!legacy) {
      assert.equal(feedback.review?.mode,'ai','复盘已降级，不能算真实模型验收');
      assert.ok(feedback.review.summary?.trim(),'复盘未返回总结');
      assert.ok(Array.isArray(feedback.review.preferences)&&feedback.review.preferences.every(v=>typeof v==='string'),'复盘偏好格式无效');
      check('真实穿着复盘',feedback.review.summary);
    }
    const records=await request('/api/records');
    assert.equal(records.plans[0].outfit.version,revised.version);
    assert.equal(records.plans[0].feedback.worn,true);
    assert.deepEqual(records.preferences,[],'复盘建议不能未经确认自动写入长期偏好');
    if(!legacy && feedback.review.preferences.length) {
      await request('/api/agent/memory',{preferences:feedback.review.preferences});
      const confirmedMemory=await request('/api/records');
      assert.deepEqual(confirmedMemory.preferences,feedback.review.preferences,'确认后的偏好没有写入当前访客记忆');
      check('真实偏好确认','复盘建议未自动写入，确认后才进入当前访客记忆');
    }
    const owner=cookie;
    const stranger=await request('/api/records',undefined,'GET','');
    assert.equal(stranger.plans.length,0);
    const imageResponse=await fetch(base+item.image,{headers:{Cookie:cookie}});
    assert.equal(imageResponse.status,404);
    cookie=owner;
    check('保存、反馈和访客隔离','真实方案保存及重新读取成功，其他会话不能读取照片');
    report.status='passed';
  } catch(error) {report.status='failed';report.error=error.message;throw error;}
  finally {
    report.finishedAt=new Date().toISOString();
    report.referenceInspections=inspections;
    fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));
    console.log('私密测试报告：'+path.join(directory,'report.json'));
    await new Promise(resolve=>server.close(resolve));api.close();
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
