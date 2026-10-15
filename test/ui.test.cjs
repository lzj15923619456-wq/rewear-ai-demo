const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('AI checklists preserve their own input snapshot and escape model output; saved plans retain their photo', () => {
  const dialog = {addEventListener(){},setAttribute(){},showModal(){},innerHTML:''};
  const context = vm.createContext({console,localStorage:{getItem:()=>null},document:{querySelector:()=>dialog},window:{},setTimeout,clearTimeout});
  for (const file of ['data.js','ui.js','results.js','app.js']) {
    let code = fs.readFileSync(path.join(__dirname,'../dist',file),'utf8');
    if (file === 'app.js') code = code.replace(/render\(\);\s*$/, '');
    vm.runInContext(code,context,{filename:file});
  }
  vm.runInContext(`
    const locked={itemId:'old-shirt',slot:'upper',name:'原方案的西装',image:'old-shirt.jpg'};
    const generated={id:'ai-test',ai:true,title:'<script>alert(1)</script>',subtitle:'<img src=x onerror=alert(1)>',difference:'<b>不执行</b>',image:'new-reference.jpg',inputItems:[locked],items:[{id:'upper',itemId:locked.itemId,name:locked.name,role:'核心'},{id:'bottom',name:'方案建议裤装',role:'核心',tip:'舒适'}]};
    outfits.push(generated);state.selected=generated.id;
    state.intakeItems.upper={name:'之后新选的上衣',itemId:'new-shirt'};
    state.intakeItems.bottom={name:'之后新选的裤子',itemId:'new-pants'};
  `,context);
  assert.equal(vm.runInContext('itemName(current(),current().items[0])',context),'原方案的西装');
  assert.equal(vm.runInContext('getStatus(current(),current().items[1])',context),'missing');
  const html = vm.runInContext('buildView()',context);
  assert.ok(html.includes('原方案的西装'));
  assert.ok(!html.includes('之后新选的上衣'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img src=x'));
  vm.runInContext(`state.saved=[{id:'saved-test',outfitId:'ai-test',outfit:{...generated,image:'saved-reference.jpg'},items:[],title:'旧计划',feedback:{worn:true,satisfaction:'<script>bad</script>'}}];state.lastPlan='saved-test';`,context);
  assert.ok(vm.runInContext('finishView()',context).includes('saved-reference.jpg'));
  const saved = vm.runInContext('savedView()',context);
  assert.ok(saved.includes('saved-reference.jpg'));
  assert.ok(!saved.includes('<script>bad</script>'));
});

test('Agent stream tolerates intermediate errors, decodes split UTF-8 and escapes collaboration text', async () => {
  const context=vm.createContext({console,localStorage:{getItem:()=>null},document:{querySelector:s=>s==='#modal'?{addEventListener(){}}:null},window:{},setTimeout,clearTimeout,AbortController,AbortSignal,TextDecoder});
  for(const file of ['data.js','ui.js','results.js','app.js','agents.js']) {
    let code=fs.readFileSync(path.join(__dirname,'../dist',file),'utf8');
    if(file==='app.js')code=code.replace(/render\(\);\s*$/, '');
    vm.runInContext(code,context,{filename:file});
  }
  vm.runInContext('render=()=>{};go=v=>{state.view=v;};',context);
  let streamText=[{agent:'main',type:'error',data:{message:'<img src=x onerror=bad()>模型失败'}},{agent:'main',type:'log',data:{mode:'rules',message:'降级为规则'}},{agent:'main',type:'done',data:{result:{mode:'rules',summary:'保留单品',outfits:[]}}}].map(JSON.stringify).join('\n');
  context.fetch=async()=>new Response(new ReadableStream({start(c){for(const byte of Buffer.from(streamText))c.enqueue(Uint8Array.of(byte));c.close();}}));
  const result=await vm.runInContext('AgentHub.run({})',context);
  assert.equal(result.mode,'rules');assert.equal(result.summary,'保留单品');
  const html=vm.runInContext('agentProcessView()',context);assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img src=x'));assert.ok(html.includes('模型失败'));
  streamText=JSON.stringify({agent:'main',type:'error',data:{final:true,message:'最终失败'}});
  await assert.rejects(vm.runInContext('AgentHub.run({})',context),/最终失败/);
});
