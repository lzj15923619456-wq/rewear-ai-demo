// Model requests go through the same-origin backend. No credentials in this file.
state.aiOutfitIds = [];
state.aiReady = false;
let aiBusy = false;
let searchGeneration = 0;

async function apiRequest(url, body, method = 'POST') {
  const response = await fetch(url, { method, credentials: 'same-origin', headers: body === undefined ? {} : {'Content-Type':'application/json'}, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(300000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '请求失败，请稍后重试');
  return result;
}
async function aiTask(title, task) {
  if (aiBusy) return toast('上一项请求还在处理中');
  aiBusy = true;
  modal(title, '<div class="ai-working" role="status"><span></span><p>正在处理，请稍候…</p><small>检索与看图核对需要一些时间。可关闭窗口继续查看，完成后会提示。</small></div>');
  try { return await task(); }
  catch (error) { modal('暂时没有完成', `<p role="alert">${esc(error.name==='TimeoutError'?'请求超时，请稍后重试':error.message)}</p><button class="btn primary wide" onclick="closeModal()">知道了</button>`); }
  finally { aiBusy = false; }
}
function storeOutfit(outfit) {
  const index = outfits.findIndex(o => o.id === outfit.id);
  if (index === -1) outfits.push(outfit); else outfits[index] = outfit;
}
function requirementRequest() { return {personal:{...state.personal},scenes:[...state.scenes],styles:[...state.styles],avoids:[...state.avoids],changeAmount:state.changeAmount,note:state.note,budget:state.budget}; }
function requestFingerprint() { return JSON.stringify({requirements:requirementRequest(),items:selectedItems().map(i=>[i.itemId,i.name,i.confirmed])}); }

const localOutfitItems = outfitItems;
outfitItems = o => isManagedOutfit(o) ? o.items : localOutfitItems(o);
const localMatch = matchOutfit;
matchOutfit = o => isManagedOutfit(o) ? o.match : localMatch(o);
rankedOutfits = () => (state.agentOffline?state.agentOfflineIds||[]:state.aiOutfitIds).map(id=>outfits.find(o=>o.id===id)).filter(Boolean);
visibleOutfits = () => rankedOutfits();
const localTip = itemTip;
itemTip = (o,i) => isManagedOutfit(o) ? esc(i.tip) : localTip(o,i);
const localReason = userReason;
userReason = o => isManagedOutfit(o) ? esc(o.reason) : localReason(o);

const localPiecePanel = piecePanel;
piecePanel = (slot,index) => {
  const item = state.intakeItems[slot.id];
  const confirmation = item?.itemId ? `<div class="ai-item-status"><span>${item.confirmed?'✓ 已确认属性':'待确认识别结果'}</span><button class="text-btn" onclick="confirmItemModal('${slot.id}')">${item.confirmed?'修改属性':'确认属性'}</button><small>${esc([item.attributes.subtype,...item.attributes.colors,item.attributes.fit].filter(Boolean).join(' · '))}</small></div>` : '';
  return localPiecePanel(slot,index).replace('</section>',confirmation+'</section>');
};
function confirmItemModal(category) {
  const item=state.intakeItems[category]; if(!item?.itemId)return;
  state.confirmCategory=category;
  modal('确认这件单品', `<img class="uploaded-thumb" src="${item.image}" alt="待确认单品"><p class="small muted">${item.sample?'示例属性为人工标注。':item.mode==='rules'?'识别未完成，请手动填写真实类别、名称和颜色。':'单品识别 Agent 的结果仅供参考，请核对类别、名称和颜色。'} 不确定的材质不会猜测。</p><label>名称<input id="confirm-name" maxlength="80" value="${esc(item.name)}"></label><label>类别<select id="confirm-slot">${itemSlots.map(s=>`<option value="${s.id}" ${s.id===item.attributes.slot?'selected':''}>${s.label}</option>`).join('')}</select></label><label>细分类目<input id="confirm-subtype" maxlength="60" value="${esc(item.attributes.subtype||'')}"></label><label>颜色（以顿号分隔）<input id="confirm-colors" maxlength="80" value="${esc(item.attributes.colors.join('、'))}"></label><label>版型<input id="confirm-fit" maxlength="50" value="${esc(item.attributes.fit||'')}"></label>${item.uncertainFields.length?`<p class="small muted">无法确定：${item.uncertainFields.map(esc).join('、')}</p>`:''}${item.warnings.includes('category_conflict')?'<p role="alert">图片主体类别与录入类别不同，请选择正确类别。</p>':''}<button class="btn primary wide" onclick="confirmItem()">确认并保存</button>`);
}
async function confirmItem() {
  const category=state.confirmCategory,item=state.intakeItems[category];
  const slot=document.querySelector('#confirm-slot').value;
  if(slot!==category&&state.intakeItems[slot])return toast('这个类别已有单品，请先移除或更换');
  const body={name:document.querySelector('#confirm-name').value,attributes:{...item.attributes,slot,subtype:document.querySelector('#confirm-subtype').value,colors:document.querySelector('#confirm-colors').value.split(/[、,，]/).map(s=>s.trim()).filter(Boolean),fit:document.querySelector('#confirm-fit').value}};
  try {
    const updated=await apiRequest('/api/items/'+item.itemId,body,'PATCH');
    if(state.intakeItems[category]?.itemId!==item.itemId)return;
    state.intakeItems[category]=null;state.intakeItems[slot]=updated;rememberItem(updated);resetOutfitChoices();closeModal();render();toast('单品已确认');
  } catch(error){toast(error.message)}
}
useSample = async () => {
  if(!AgentHub.backend)return staticDemo.useSample();
  const version=++uploadVersions.upper;
  await aiTask('加入示例单品',async()=>{
    const item=await apiRequest('/api/items',{slot:'upper',sample:true});
    const confirmed=await apiRequest('/api/items/'+item.itemId,{name:item.name},'PATCH');
    if(version!==uploadVersions.upper)return closeModal();
    state.intakeItems.upper=confirmed;rememberItem(confirmed);resetOutfitChoices();closeModal();render();toast('示例单品已加入，属性由人工标注');
  });
};
uploadItem = (file,category='upper') => {
  if(!AgentHub.backend)return staticDemo.uploadItem(file,category);
  if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8388608)return toast('请选择 8 MB 以内的 JPG、PNG 或 WEBP 图片');
  const version=++uploadVersions[category],reader=new FileReader();
  reader.onload=()=>{
    if(version!==uploadVersions[category])return;
    state.uploadDraft={category,version,imageData:reader.result,name:file.name.replace(/\.[^.]+$/,'')};
    modal('识别这件衣物', '<p>这张衣物照片会发送到 REWEAR 后端；已配置模型时交给单品识别 Agent。规则模式只保存照片，需你手动确认属性。头像与本人试穿照片不会随请求发送。</p><p class="small muted">后端会压缩照片并去除 EXIF。确认衣物保存在当前体验会话。</p><button class="btn primary wide" onclick="analyzeUpload()">同意并继续</button><button class="text-btn" onclick="state.uploadDraft=null;closeModal()">取消</button>');
  };
  reader.onerror=()=>toast('照片读取失败');reader.readAsDataURL(file);
};
async function analyzeUpload() {
  const draft=state.uploadDraft;if(!draft)return;
  state.uploadDraft=null;
  await aiTask('正在识别衣物',async()=>{
    const item=await apiRequest('/api/items',{slot:draft.category,imageData:draft.imageData,name:draft.name});
    if(uploadVersions[draft.category]!==draft.version)return closeModal();
    state.intakeItems[draft.category]=item;resetOutfitChoices();render();confirmItemModal(draft.category);
  });
}
renameItem = (category,value) => {const item=state.intakeItems[category];if(!item)return;item.name=value;item.confirmed=false;resetOutfitChoices();const heading=document.querySelector('#piece-name-'+category);if(heading)heading.textContent=selectedItemName(category);};
startSearch = async () => {
  if(!validateProfile())return;
  if(!selectedItems().length)return toast('请先录入至少一件单品');
  if(!AgentHub.backend)return AgentHub.offlineRun();
  state.agentOffline=false;
  const unconfirmed=selectedItems().find(i=>!i.itemId||!i.confirmed);
  if(unconfirmed)return confirmItemModal(unconfirmed.category);
  if(!state.scenes.length||!state.styles.length)return toast('请选择至少一个场景和一种风格');
  await requestOutfits(false);
};
async function requestOutfits(more) {
  if(aiBusy)return toast('上一项请求还在处理中');
  const fingerprint=requestFingerprint(),generation=++searchGeneration;
  aiBusy=true;
  try {
    const result=await AgentHub.run({itemIds:selectedItems().map(i=>i.itemId),requirements:requirementRequest(),excludeReferenceIds:more?rankedOutfits().map(o=>o.referenceId):[]});
    if(generation!==searchGeneration||fingerprint!==requestFingerprint()){closeModal();return toast('选择已改变，请按新要求重新生成');}
    result.outfits.forEach(storeOutfit);
    const previous=more?state.aiOutfitIds.length:0;
    state.aiOutfitIds=[...(more?state.aiOutfitIds:[]),...result.outfits.map(o=>o.id)];
    state.aiWarnings=[...(result.warnings||[]),...(result.questions||[])];
    state.deckIndex=previous;state.generated=true;state.deckLimit=state.aiOutfitIds.length;closeModal();go('results');
    if(!result.outfits.length)toast(result.questions?.[0]||result.warnings?.[0]||'没有更多适合的真实参考');
  } catch(error) {
    if(error.name!=='AbortError'){state.intakeStep=2;go('intake');modal('协作暂未完成',`<p role="alert">${esc(error.name==='TimeoutError'?'本次任务超时，原有记录保留':error.message)}</p><button class="btn wide" onclick="closeModal()">返回修改需求</button>`);}
  } finally { aiBusy=false; }
}
loadMoreOutfits = () => AgentHub.backend?requestOutfits(true):toast('静态参考已展示；启动后端才能检索更多');
moreOutfitCard = count => `<div class="more-outfits-card"><span class="eyebrow">MORE WAYS TO WEAR</span><h2>${count?'再看看其他穿法？':'先把条件核对一下'}</h2><p>${esc((state.aiWarnings||[]).join(' ')||'保留当前单品和要求，再检索一组不同的真实参考。')}</p><button class="btn primary wide" onclick="loadMoreOutfits()">寻找更多穿搭</button><small>最多六套；真实参考不足时不会重复凑数。</small><button class="text-btn" onclick="state.intakeStep=0;go('intake')">修改我的需求</button></div>`;

const presetDetail=detail;
detail = id => {
  const o=outfits.find(x=>x.id===id);if(!isManagedOutfit(o))return presetDetail(id);
  modal(esc(o.title),`<div class="detail-hero"><img src="${o.image}" alt="真实穿搭参考"><div><h3>${esc(o.subtitle)}</h3><p>${esc(o.reason)}</p><a class="credit" href="${o.sourceUrl}" target="_blank" rel="noopener noreferrer">${esc(o.credit)} · 原始照片与署名 ↗</a>${o.licenseUrl?`<a class="credit" href="${o.licenseUrl}" target="_blank" rel="noopener noreferrer">${esc(o.license)} · 图片来源与许可 ↗</a>${o.photoChanges?`<small class="credit">${esc(o.photoChanges)}</small>`:""}`:""}</div></div><div class="notice">${esc(o.difference)}</div><section class="analysis-section"><h3>实际搭配清单</h3>${o.items.map(i=>`<div class="analysis-row"><div><strong>${esc(i.name)}</strong><p>${esc(i.tip)}</p></div></div>`).join('')}</section><section class="analysis-section"><h3>保留搭配关系</h3><p>${esc(o.keep)}</p><h3>这次先避开</h3><p>${esc(o.avoid)}</p></section><section class="analysis-section"><h3>继续问问这套搭配</h3><div class="ask-row"><input id="question-input" maxlength="1000" placeholder="比如：需要走很多路，鞋子怎么选？"><button class="btn secondary" onclick="answerQuestion(document.querySelector('#question-input').value,'${o.id}')">追问</button></div><p id="answer" class="small muted" aria-live="polite"></p><small class="muted">AI 提供搭配建议，合身与鞋履舒适度需实际试穿核对。</small></section><button class="btn primary wide" onclick="closeModal();selectOutfit('${o.id}')">选这套，核对我的衣柜</button>`);
};
answerQuestion = async (question,id) => {
  if(!question.trim())return;
  if(state.agentOffline)return staticDemo.answerQuestion(question,id);
  const target=document.querySelector('#answer');if(target)target.textContent='衣柜落地 Agent 正在处理…';
  try {const result=await AgentHub.task({task:'answer',outfitId:id,question});if(target?.isConnected)target.textContent=(result.mode==='rules'?'规则模式 · ':'衣柜落地 Agent · ')+result.answer;}
  catch(error){if(target?.isConnected)target.textContent=error.message;}
};
applyRevision = async () => {
  if(state.agentOffline)return toast('静态模式暂不分析自由调整，请返回需求页修改选项');
  const o=current(),keepIds=[...document.querySelectorAll('[name=keep]:checked')].map(e=>e.value);
  const note=document.querySelector('[name=revision-reason]:checked').value+'。'+document.querySelector('#revision-text').value;
  await aiTask('保留喜欢的部分，调整这一套',async()=>{
    const result=await AgentHub.task({task:'revise',outfitId:o.id,version:o.version,keepIds,note});
    if(result.changed===false)return modal('还需要你确认',`<p>${esc((result.questions||[]).join('；')||'当前信息不足，暂未修改方案。')}</p><p class="small muted">原方案、图片、锁定项和偏好记忆均未改变。</p><button class="btn primary wide" onclick="closeModal()">知道了</button>`);
    storeOutfit(result.outfit);delete state.revisions[o.id];delete state.substitutions[o.id];
    result.outfit.items.forEach(i=>{if(!keepIds.includes(i.id)&&!inputForItem(i,result.outfit))state.owned[o.id+'-'+i.id]='missing';});
    closeModal();render();toast(result.mode==='rules'?'规则模式：保留原方案，未智能调整':'衣柜落地 Agent 已更新清单，参考照片保持原样');
  });
};
replaceModal = id => {
  if(state.agentOffline)return toast('衣柜替换需要启动后端并确认替换单品');
  if(current().lockedItemIds?.includes(outfitItems(current()).find(i=>i.id===id)?.itemId))return toast('这件已录入单品需回到录入页修改');
  state.replaceId=id;
  const options=Object.values(state.intakeItems).filter(Boolean);
  modal('用自己的衣物替换',`<p class="small muted">为避免猜测已有衣物，需要上传并确认替换衣物，或选择衣柜中的已确认单品。原先录入的单品始终保留。</p><p><button class="btn secondary wide" onclick="closeModal();state.intakeStep=0;go('intake')">回到单品页上传并识别</button></p><p class="small">已确认的同类衣物</p><div class="replacement-options">${(state.aiWardrobe||options).filter(i=>i.confirmed&&i.slot===(id==='top'?'upper':id)).map(i=>`<label><input type="radio" name="replacement-item" value="${i.itemId}">${esc(i.name)}</label>`).join('')||'<p class="muted small">暂无可用单品。</p>'}</div><button class="btn primary wide" onclick="applyAiReplacement()">用这件替换并让 AI 调整</button>`);
};
async function applyAiReplacement() {
  const replacementItemId=document.querySelector('[name=replacement-item]:checked')?.value;
  if(!replacementItemId)return toast('请选择一件已确认的衣物');
  const o=current(),replaceSlot=state.replaceId;
  await aiTask('重新协调这件替换衣物',async()=>{
    const result=await AgentHub.task({task:'replacement',outfitId:o.id,version:o.version,note:'用我已有的替换衣物更新这一套，其他录入单品保持不变。',replacementItemId,replaceSlot});
    if(result.changed===false)return modal('还需要你确认',`<p>${esc((result.questions||[]).join('；')||'当前信息不足，暂未修改方案。')}</p><p class="small muted">原方案、图片、锁定项和偏好记忆均未改变。</p><button class="btn primary wide" onclick="closeModal()">知道了</button>`);
    storeOutfit(result.outfit);state.owned[o.id+'-'+replaceSlot]='replaced';closeModal();render();toast('已更新清单和购买缺口');
  });
}
savePlan = async () => {
  if(state.agentOffline)return staticDemo.savePlan();
  const o=current();if(!isManagedOutfit(o))return toast('请先生成 AI 方案');
  await aiTask('保存穿搭计划',async()=>{
    const result=await apiRequest('/api/plans',{outfitId:o.id,budget:state.budget,owned:Object.fromEntries(o.items.map(i=>[i.id,getStatus(o,i)]))});
    state.saved.unshift(result.plan);state.lastPlan=result.plan.id;closeModal();go('finish');
  });
};
const oldSaveFeedback=saveFeedback;
saveFeedback = async () => {
  const plan=state.saved.find(p=>p.id===state.feedbackId);if(!isManagedOutfit(plan?.outfit))return oldSaveFeedback();
  const answer=document.querySelector('[name=wear-answer]:checked').value;
  try {
    const result=await AgentHub.task({task:'review',planId:plan.id,worn:state.feedbackWorn,satisfaction:state.feedbackWorn?answer:null,reason:state.feedbackWorn?null:answer,note:document.querySelector('#wear-note').value});
    plan.feedback=result.feedback;closeModal();go('saved');
    if(result.review?.preferences?.length){state.pendingAgentMemory=[...new Set([...(state.agentPreferences||[]),...result.review.preferences])].slice(-5);modal('穿着复盘 Agent',`<p>${esc(result.review.summary)}</p><p class="small muted">是否把以下偏好用于下次搭配？</p><ul>${state.pendingAgentMemory.map(p=>`<li>${esc(p)}</li>`).join('')}</ul><button class="btn wide" onclick="confirmAgentMemory()">确认偏好记忆</button><button class="text-btn" onclick="state.pendingAgentMemory=null;closeModal()">仅保存反馈</button>`);}
    else toast(result.review?.summary||'反馈已保存');
  }catch(error){toast(error.message)}
};
const oldPersist=persist;
persist = () => {const all=state.saved;state.saved=all.filter(p=>!isManagedOutfit(p.outfit));const result=oldPersist();state.saved=all;return result;};
wardrobeView = () => AgentHub.backend?`<div class="page-heading"><div><h1>我的衣柜</h1><p>当前体验会话中已确认的衣物。</p></div><button class="btn secondary small" onclick="state.intakeStep=0;go('intake')">添加单品</button></div><p class="agent-memory"><button class="text-btn" onclick="agentMemoryModal()">查看 / 清空已确认偏好（${(state.agentPreferences||[]).length}）</button></p><div class="wardrobe-grid">${(state.aiWardrobe||[]).filter(i=>i.confirmed).map(i=>`<div class="panel"><img class="uploaded-thumb" src="${i.image}" alt="我的衣物"><h3>${esc(i.name)}</h3><p class="small muted">${esc(i.attributes.colors.join('、'))} · 已确认</p></div>`).join('')||'<p>先上传或选择一件示例单品。</p>'}</div>`:staticDemo.wardrobeView();
async function refreshAiRecords() {
  const record=await apiRequest('/api/records',undefined,'GET');
  record.outfits.forEach(storeOutfit);record.plans.forEach(p=>p.outfit&&storeOutfit(p.outfit));
  state.saved=[...record.plans,...state.saved.filter(p=>!isManagedOutfit(p.outfit))];state.aiWardrobe=record.items;state.agentPreferences=record.preferences||[];
}
function rememberItem(item) { state.aiWardrobe=[...(state.aiWardrobe||[]).filter(i=>i.itemId!==item.itemId),item]; }
(async()=>{
  try {const status=await apiRequest('/api/agent/status',undefined,'GET');state.aiReady=status.ready;state.agentMode=status.mode;AgentHub.backend=true;await refreshAiRecords();if(state.view!=='welcome')render();}
  catch {state.aiReady=false;state.agentMode='rules';AgentHub.backend=false;if(state.view!=='welcome')render();}
})();
