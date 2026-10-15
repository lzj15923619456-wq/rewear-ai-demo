const agentRegistry = {
  main:{name:'再穿主理人',stage:'理解与分派',icon:'spark'},
  item:{name:'单品识别 Agent',stage:'认识单品',icon:'upload'},
  stylist:{name:'搭配推荐 Agent',stage:'寻找搭配',icon:'spark'},
  wardrobe:{name:'衣柜落地 Agent',stage:'让它落地',icon:'closet'},
  review:{name:'穿着复盘 Agent',stage:'穿出门',icon:'heart'}
};
const staticDemo = {useSample,uploadItem,startSearch,rankedOutfits,answerQuestion,evaluateReplacement,applyRevision,saveFeedback,savePlan,applyReplacement,replaceModal,wardrobeView,persist};
state.agentMode='checking';state.agentEvents=[];state.agentStates={};
let agentController;
function agentEvent(event) {
  if(!agentRegistry[event.agent]||!['start','log','done','error'].includes(event.type))return;
  state.agentEvents.push(event);state.agentEvents=state.agentEvents.slice(-40);
  if(event.type==='start')state.agentStates[event.agent]='进行中';
  if(event.type==='done')state.agentStates[event.agent]=event.data?.mode==='rules'?'规则完成':'完成';
  if(event.type==='error')state.agentStates[event.agent]='未完成';
  if(event.data?.mode==='rules')state.agentMode='rules';
  if(state.view==='agents'){render();const log=document.querySelector('.agent-log');if(log)log.scrollTop=log.scrollHeight;}
}
function agentProcessView() {
  return `<section class="agent-workspace"><div class="eyebrow">REWEAR AGENT TEAM</div><h1>一起找到你的穿法</h1><p class="muted">${state.agentMode==='rules'?'规则模式 · 只使用适用参考，不进行智能分析':'主理人整理需求，按任务分派专业 Agent'}</p><div class="agent-team">${Object.entries(agentRegistry).map(([id,a])=>`<article class="agent-row"><span class="agent-symbol">${icon(a.icon)}</span><div><strong>${esc(a.name)}</strong><small>${esc(a.stage)}</small></div><span class="agent-state">${esc(state.agentStates[id]||({wardrobe:'选方案后参与',review:'穿着反馈后参与'}[id]||'等待'))}</span></article>`).join('')}</div><div class="agent-log" role="log" aria-label="实际协作过程">${state.agentEvents.map(e=>`<p><b>${esc(agentRegistry[e.agent].name)}</b><span>${esc(e.data?.message||'')}</span></p>`).join('')||'<p>正在连接后端…</p>'}</div><button class="btn secondary wide" onclick="${agentController?'AgentHub.cancel()':"go('results')"}">${agentController?'停止并返回偏好':'返回搭配方案'}</button></section>`;
}
const normalView=view;
view=()=>state.view==='agents'?agentProcessView():normalView();
const normalResults=results,normalBuild=buildView,normalFinish=finishView,normalWardrobe=wardrobeView;
results=()=>agentBadge('stylist',state.agentMode)+(state.agentSummary?`<section class="agent-summary"><strong>主理人总结</strong><p>${esc(state.agentSummary)}</p>${state.agentEvents.length?`<button class="text-btn" onclick="go('agents')">查看本次协作过程</button>`:''}</section>`:'')+normalResults();
buildView=()=>agentBadge('wardrobe',current()?.mode||state.agentMode)+normalBuild();
finishView=()=>agentBadge('review',(state.saved.find(p=>p.id===state.lastPlan)||state.saved[0])?.outfit?.mode||state.agentMode)+normalFinish();
const normalIntake=intake;
intake=()=>`<p class="agent-mode-label">${state.agentMode==='checking'?'正在检查模型配置':state.agentMode==='rules'?'规则模式 · 未进行大模型分析':'AI 模式 · 主理人协调专业 Agent'}</p>`+normalIntake();
function agentBadge(agent,mode) {
  return `<div class="agent-badge">${icon(agentRegistry[agent]?.icon||'spark')}<span>${esc(agentRegistry[agent]?.name||'再穿主理人')} · ${mode==='rules'?'规则模式':'AI 模式'}</span></div>`;
}
const AgentHub = {
  backend:true,
  async run(input) {
    state.agentEvents=[];state.agentStates={};agentController=new AbortController();go('agents');
    let reader;
    try {
    const response=await fetch('/api/agent/run',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.any([agentController.signal,AbortSignal.timeout(300000)])});
    if(!response.ok){const result=await response.json();throw new Error(result.error||'Agent 请求未完成');}
    reader=response.body.getReader();const decoder=new TextDecoder();let pending='',result;
    function consume(line){if(!line.trim())return;const event=JSON.parse(line);if(event.type==='error'&&event.data?.final)throw new Error(event.data.message);if(event.data?.result)result=event.data.result;else agentEvent(event);}
      for(;;){const {value,done}=await reader.read();if(done)break;pending+=decoder.decode(value,{stream:true});if(pending.length>1000000)throw new Error('协作响应过大');let boundary;while((boundary=pending.indexOf('\n'))>=0){consume(pending.slice(0,boundary));pending=pending.slice(boundary+1);}}
      pending+=decoder.decode();consume(pending);
      if(!result||!Array.isArray(result.outfits))throw new Error('协作结果未完整返回');
      state.agentMode=result.mode||'ai';state.agentSummary=result.summary||'';return result;
    } finally {if(reader)await reader.cancel().catch(()=>{});agentController=null;}
  },
  async task(input){const result=await apiRequest('/api/agent/task',input);return result;},
  cancel(){agentController?.abort();searchGeneration++;state.intakeStep=2;go('intake');toast('已停止；原有选择与记录保留');},
  offlineRun(){
    const items=selectedItems();
    if(items.length!==1||!items[0].sample||items[0].category!=='upper')return toast('静态规则模式只支持黑西装示例；自己的衣物需要启动后端');
    state.agentOffline=true;state.agentMode='rules';
    const seen=new Set();state.agentOfflineIds=staticDemo.rankedOutfits().filter(o=>{const score=localMatch(o);if(score.conflicts.length||seen.has(o.image))return false;seen.add(o.image);return true;}).slice(0,6).map(o=>o.id);
    state.aiWarnings=['静态规则模式：固定参考，不理解自由要求、不识图。'];state.generated=true;state.deckIndex=0;go('results');
  }
};
function preferenceKey(){return 'rewear-agent-preferences-v1';}
async function confirmAgentMemory(){
  const preferences=state.pendingAgentMemory||[];
  try{const result=await apiRequest('/api/agent/memory',{preferences});state.agentPreferences=result.preferences;localStorage.setItem(preferenceKey(),JSON.stringify(result.preferences));state.pendingAgentMemory=null;closeModal();toast('偏好已确认，下次主理人会读取');}
  catch(error){toast(error.message);}
}
function agentMemoryModal(){
  const preferences=state.agentPreferences||[];
  modal('已确认的穿搭偏好',`<p class="small muted">这些偏好会交给主理人；本次填写的需求优先。</p><ul>${preferences.map(p=>`<li>${esc(p)}</li>`).join('')||'<li>尚未确认偏好。</li>'}</ul><button class="btn secondary wide" onclick="state.pendingAgentMemory=[];confirmAgentMemory()">清空偏好记忆</button>`);
}
