// Explicit opt-in integration check. Uses the real configured Coze model.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {createApi} = require('../api.cjs');
try { process.loadEnvFile(path.join(__dirname,'../.env')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

async function main() {
  assert.ok(process.argv.includes('--run'),'真实测试需传入 --run；会调用付费模型');
  const imageArg = process.argv.indexOf('--image');
  assert.ok(imageArg >= 0 && process.argv[imageArg + 1], '请用 --image 指定有权使用的清晰黑西装单品照片；完整穿搭参考不能替代单品测试图');
  const imagePath = path.resolve(process.argv[imageArg + 1]);
  const imageMime = {'.jpg':'jpeg','.jpeg':'jpeg','.png':'png','.webp':'webp'}[path.extname(imagePath).toLowerCase()];
  assert.ok(imageMime, '测试图片仅支持 JPG、PNG、WEBP');
  const image = fs.readFileSync(imagePath);
  assert.ok(process.env.COZE_ANALYZE_TOKEN && process.env.COZE_STYLIST_TOKEN,'请先完成私密配置');
  const directory = path.join(__dirname,'../.runtime/live-ai-'+Date.now());
  fs.mkdirSync(directory,{recursive:true});
  const api = createApi({dataDir:directory});
  const server = http.createServer((req,res)=>api.handle(req,res,new URL(req.url,'http://local').pathname));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base = 'http://127.0.0.1:'+server.address().port;
  let cookie = '';
  const report = {startedAt:new Date().toISOString(),mode:'real-coze',checks:[]};
  const check = (name,detail) => {report.checks.push({name,detail});console.log(name+': '+detail);};
  async function request(url,body,method=body?'POST':'GET',visitor=cookie) {
    const response = await fetch(base+url,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),Cookie:visitor,...(process.env.PUBLIC_ORIGIN?{Origin:process.env.PUBLIC_ORIGIN}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(200000)});
    if (!visitor && response.headers.get('set-cookie')) cookie=response.headers.get('set-cookie').split(';')[0];
    const result = await response.json();
    assert.ok(response.ok,`${url}: HTTP ${response.status}, ${result.error||'请求失败'}`);
    return result;
  }
  try {
    const item = await request('/api/items',{slot:'upper',name:'待识别黑西装',imageData:'data:image/'+imageMime+';base64,'+image.toString('base64')});
    assert.equal(item.confirmed,false);
    assert.equal(item.attributes.slot,'upper');
    assert.match(item.attributes.subtype,/blazer|西装|西服/i);
    assert.ok(item.attributes.colors.some(c=>['black','黑色','黑'].includes(c)));
    check('真实衣物识别',JSON.stringify(item.attributes));
    const confirmed = await request('/api/items/'+item.itemId,{name:item.name,attributes:item.attributes},'PATCH');
    assert.equal(confirmed.confirmed,true);
    const requirements={personal:{性别:'女性',年龄:29,'身高（cm）':165},scenes:['日常通勤'],styles:['简约日常'],avoids:[],changeAmount:50,note:'需要走很多路，鞋子必须是舒适平底鞋，不要高跟鞋。'};
    const generated = await request('/api/recommendations',{itemIds:[item.itemId],requirements});
    assert.ok(generated.outfits.length>0 && generated.outfits.length<=6,'没有返回可验收的方案');
    assert.equal(new Set(generated.outfits.map(o=>o.referenceId)).size,generated.outfits.length);
    for (const outfit of generated.outfits) {
      assert.equal(outfit.items.find(i=>i.itemId===item.itemId)?.name,item.name);
      assert.ok(outfit.sourceUrl && outfit.difference);
    }
    check('真实搭配生成',generated.outfits.length+' 套，引用互不重复并保留录入衣物');
    const first = generated.outfits[0];
    const answer = await request('/api/outfits/'+first.id+'/questions',{question:'这套能穿舒适平底鞋走很多路吗？请说明鞋履和参考照片的差异。'});
    assert.ok(answer.answer.length>10);
    check('真实追问',answer.answer);
    const keep = first.items.find(i=>i.id==='bottom');
    const revised = (await request('/api/outfits/'+first.id+'/revisions',{version:first.version,keepIds:keep?['bottom']:[],note:'保留已经选好的裤装和录入西装，鞋子改成黑色平底运动鞋，不要高跟鞋。'})).outfit;
    assert.equal(revised.version,first.version+1);
    assert.equal(revised.items.find(i=>i.itemId===item.itemId)?.name,item.name);
    if(keep)assert.equal(revised.items.find(i=>i.id==='bottom')?.name,keep.name);
    check('真实方案调整','版本增加，保留单品和指定下装');
    const plan = (await request('/api/plans',{outfitId:first.id,owned:{upper:'missing'}})).plan;
    assert.equal(plan.items.find(i=>i.itemId===item.itemId).status,'owned');
    await request('/api/plans/'+plan.id+'/feedback',{worn:true,satisfaction:'满意，很像自己',note:'自动验收测试记录'});
    const records=await request('/api/records');
    assert.equal(records.plans[0].outfit.version,revised.version);
    assert.equal(records.plans[0].feedback.worn,true);
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
    fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));
    console.log('私密测试报告：'+path.join(directory,'report.json'));
    await new Promise(resolve=>server.close(resolve));api.close();
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
