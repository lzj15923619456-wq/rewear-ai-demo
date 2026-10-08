// Mobile-first shell. Keep scroll and keyboard focus when a choice re-renders.
function render(){
  const welcoming=state.view==='welcome';
  document.documentElement.classList.toggle('is-welcome',welcoming);
  if(window.parent!==window)window.parent.postMessage({type:'rewear-view',view:state.view},location.origin);
  if(welcoming){window.RewearProgress.unmount();document.querySelector('#app').innerHTML=welcomePage();return}
  const previous=document.querySelector('.shell');
  const navigation=document.querySelector('#navigation-root');
  if(navigation)navigation.remove();
  const stepNavigation=document.querySelector('#intake-progress-root');
  if(stepNavigation)stepNavigation.remove();
  const outfitCarousel=document.querySelector('#outfit-carousel-root');
  if(outfitCarousel)outfitCarousel.remove();
  const workflowProgress=document.querySelector('#workflow-progress-root');
  if(workflowProgress)workflowProgress.remove();
  const screenKey=state.view+(state.view==='intake'?'-'+(state.intakeStep||0):'');
  const sameScreen=previous?.dataset.screen===screenKey;
  const scrollTop=sameScreen?(document.querySelector('#page-scroll')?.scrollTop||0):0;
  const carouselLeft=sameScreen?(document.querySelector('.outfit-grid')?.scrollLeft||0):0;
  const focusKey=document.activeElement?.dataset.focus;
  const preferenceStep=state.view==='intake'&&[1,2].includes(state.intakeStep);
  document.querySelector('#app').innerHTML=`<div class="shell view-${state.view} ${preferenceStep?'has-preference-dock':''}" data-screen="${screenKey}">
    <header class="site-header">${selectionBackButton()}<a class="brand" href="#" onclick="state.intakeStep=0;go('intake');return false" aria-label="再穿首页"><span>REWEAR</span></a></header>
    <main class="content" id="page-scroll" aria-label="${({intake:'开始搭配',results:'搭配方案',build:'核对衣柜',wardrobe:'我的衣柜',saved:'穿搭记录',finish:'穿搭计划'})[state.view]||'搭配'}">${view()}</main>
    ${preferenceStep?(state.intakeStep===2?comfortDock():preferenceDock()):''}
    <div class="nav-space"><nav id="navigation-root" class="nav rewear-nav-host" aria-label="主导航"></nav></div>
  </div>`;
  if(navigation)document.querySelector('#navigation-root').replaceWith(navigation);
  window.RewearNavigation.render(document.querySelector('#navigation-root'),state.view==='wardrobe'?'wardrobe':state.view==='saved'?'saved':'outfits',value=>go(value==='outfits'?(state.generated?'results':'intake'):value));
  const stepContainer=document.querySelector('#intake-progress-root');
  if(stepContainer){
    if(stepNavigation)stepContainer.replaceWith(stepNavigation);
    window.RewearSteps.render(stepNavigation||stepContainer,state.intakeStep||0,intakeNext);
  }else window.RewearSteps.unmount();
  const workflowContainer=document.querySelector('#workflow-progress-root');
  if(workflowContainer){
    const stage=Number(workflowContainer.dataset.stage);
    if(workflowProgress){workflowProgress.dataset.stage=stage;workflowContainer.replaceWith(workflowProgress)}
    window.RewearProgress.render(workflowProgress||workflowContainer,stage);
  }else window.RewearProgress.unmount();
  document.querySelector('#page-scroll').scrollTop=scrollTop;
  const carousel=document.querySelector('.outfit-grid');if(carousel)carousel.scrollLeft=carouselLeft;
  if(state.view==='results'){
    if(outfitCarousel)document.querySelector('#outfit-carousel-root').replaceWith(outfitCarousel);
    bindOutfitDeck();
  }else window.RewearDeck.unmount();
  if(sameScreen&&focusKey){const e=[...document.querySelectorAll('[data-focus]')].find(el=>el.dataset.focus===focusKey);e?.focus({preventScroll:true})}
}
function selectionBackButton(){
  if(!['intake','results','build','finish'].includes(state.view))return '';
  const destination=state.view==='intake'?['进入页','选择单品','选择场景与风格'][state.intakeStep||0]:{results:'填写偏好',build:'选择穿搭方案',finish:'核对衣柜'}[state.view];
  return `<button class="selection-back" type="button" onclick="previousSelection()" aria-label="上一步：${destination}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg><span>上一步</span></button>`;
}
function previousSelection(){
  if(state.view==='intake'){
    if((state.intakeStep||0)>0){state.intakeStep--;go('intake')}
    else go('welcome');
  }else if(state.view==='results'){state.intakeStep=2;go('intake')}
  else if(state.view==='build')go('results');
  else if(state.view==='finish')go(state.previousView==='saved'?'saved':state.selected?'build':'saved');
  document.querySelector('.selection-back, .welcome-enter')?.focus({preventScroll:true});
}
function welcomePage(){
  const photos=['style-leather.jpg','blazer-model.jpg','style-black.jpg','outfit-monochrome.jpg','style-preppy.jpg','style-leather.jpg','outfit-skirt.jpg','style-black.jpg','outfit-denim.jpg'];
  const photoGroup=copy=>`<div class="welcome-photo-group">${photos.map((photo,index)=>`<div class="welcome-photo welcome-photo-${index}"><img src="assets/${photo}" alt="" decoding="async" ${index===4&&copy===0?'fetchpriority="high"':''}></div>`).join('')}</div>`;
  return `<main class="welcome-page" aria-labelledby="welcome-title"><div class="welcome-art" aria-hidden="true"><div class="welcome-collage"><div class="welcome-photo-track">${photoGroup(0)}${photoGroup(1)}</div></div></div><section class="welcome-copy"><h1 id="welcome-title">REWEAR</h1><p>让闲置单品重新出场。<br>从你的衣柜出发，找到更像你的穿搭。</p><button class="welcome-enter" onclick="enterRewear()">进入</button></section></main>`;
}
function enterRewear(){state.intakeStep=0;go('intake');document.querySelector('.brand')?.focus({preventScroll:true})}
function intakeNext(step){
  if(step>0&&!validateProfile())return false;
  if(step>0&&!selectedItems().length){toast('请至少录入一件上衣、裤装或鞋类');return false}
  if(step>1&&!state.scenes.length){toast('至少选一个使用场景');return false}
  if(step>1&&!state.styles.length){toast('至少选一种喜欢的风格');return false}
  state.intakeStep=step;render();document.querySelector('.intro-row h1')?.focus({preventScroll:true});
  return true;
}

function piecePanel(slot,index){
  const item=state.intakeItems[slot.id],uploaded=item&&!item.sample;
  const outlines={bottom:'<path d="M20 12h40l-3 56H42l-2-35-2 35H23Z"/><path d="M20 21h40M40 12v21"/>',shoes:'<path d="M14 42c10 1 18-5 20-18l12 5c2 10 6 15 15 17 8 2 10 7 8 14H12V47Z"/><path d="M12 54h57M40 36l9-2m-6 8 9-2"/>'};
  return `<section class="piece-panel" aria-labelledby="piece-title-${slot.id}"><div class="piece-category"><h2 id="piece-title-${slot.id}"><span>${String(index+1).padStart(2,'0')}</span> ${slot.label}</h2><small>${item?'已录入':'按需添加'}</small></div>
    ${item||slot.id==='upper'?`<div class="piece-photo ${uploaded?'is-uploaded':'is-product'}"><img src="${item?.image||UPPER_SAMPLE_IMAGE}" alt="${uploaded?'你上传的'+slot.label+'照片':'黑色宽松西装白底单品展示图'}"><span class="photo-label">${uploaded?'你的'+slot.label:item?'已选择示例':'示例单品'}</span></div>`:`<div class="piece-photo piece-empty"><svg viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">${outlines[slot.id]}</svg><p>把想一起穿的${slot.label}放进来</p></div>`}
    <div class="piece-bottom"><div><h3 id="piece-name-${slot.id}">${item?esc(selectedItemName(slot.id)):slot.id==='upper'?'黑色宽松西装':slot.empty}</h3><p>${item?'搭配时保留这件单品':slot.id==='upper'?'不知道怎么搭，又舍不得闲置':'可选 · 也可以只录入其他品类'}</p></div>${item?`<span class="chosen">${icon('check')} 已选</span>`:slot.id==='upper'?'<button class="btn secondary small" onclick="useSample()">体验示例</button>':''}</div>
    ${item?`<label class="piece-name">单品名称<input aria-label="${slot.label}名称" type="text" maxlength="80" value="${esc(item.name)}" oninput="renameItem('${slot.id}',this.value)"></label>`:''}
    <button class="upload-trigger" onclick="document.getElementById('item-file-${slot.id}').click()">${icon('upload')} ${item?'更换':'上传'}${slot.label}照片</button><input id="item-file-${slot.id}" type="file" accept="image/jpeg,image/png,image/webp" hidden onchange="uploadItem(this.files[0],'${slot.id}')">
    ${item?`<button class="text-btn remove-item" data-focus="remove-${slot.id}" onclick="removeItem('${slot.id}')" aria-label="移除${slot.label}">移除这件</button>`:''}
  </section>`;
}
function preferenceDock(){return `<div class="preference-dock"><div class="preference-selection-status"><span id="preference-counts" role="status">已选 ${state.scenes.length} 个场景 · ${state.styles.length} 种风格</span><small>可以多选</small></div><div class="preference-dock-actions"><button class="btn secondary" onclick="intakeNext(0)">上一步</button><button class="btn primary" onclick="intakeNext(2)">继续，说说偏好 <span aria-hidden="true">→</span></button></div></div>`}
function refreshPreferenceSelection(){
  if(!document.querySelector('.preference-picker'))return false;
  document.querySelectorAll('[data-preference-type]').forEach(button=>{
    const selected=state[button.dataset.preferenceType].includes(button.dataset.value);
    button.setAttribute('aria-pressed',String(selected));
    button.querySelector('.choice-indicator').textContent=selected?'✓':'+';
  });
  document.querySelector('#scene-count').textContent=`已选 ${state.scenes.length} 个`;
  document.querySelector('#style-count').textContent=`已选 ${state.styles.length} 种`;
  document.querySelector('#preference-counts').textContent=`已选 ${state.scenes.length} 个场景 · ${state.styles.length} 种风格`;
  return true;
}
function preferencePicker(){return `<section class="preference-picker" aria-labelledby="scene-picker-title"><div class="picker-heading"><h2 id="scene-picker-title">这次，准备穿去哪里？</h2><small id="scene-count">已选 ${state.scenes.length} 个</small></div><p class="picker-hint">场景可以多选，把会穿去的地方都选上。</p><div class="scene-grid">${sceneOptions.map(scene=>`<button class="scene-choice" data-preference-type="scenes" data-value="${scene.name}" data-focus="scene-${scene.name}" aria-label="${scene.name}" aria-pressed="${state.scenes.includes(scene.name)}" onclick="choose('scenes','${scene.name}')"><div class="scene-photo"><img src="${scene.image}" alt="${scene.name}场景示意" decoding="async"><span class="choice-indicator" aria-hidden="true">${state.scenes.includes(scene.name)?'✓':'+'}</span></div><span class="scene-name">${scene.name}</span><small>${scene.hint}</small></button>`).join('')}</div><details class="scene-credits"><summary>查看场景图片来源</summary>${sceneOptions.map(scene=>`<a href="${scene.sourceUrl}" target="_blank" rel="noopener noreferrer">${scene.name} · ${esc(scene.credit)} / Pexels ↗</a>`).join('')}</details></section>
  <section class="style-feed-section" aria-labelledby="style-feed-title"><div class="picker-heading"><h2 id="style-feed-title">找到更像你的风格</h2><small id="style-count">已选 ${state.styles.length} 种</small></div><p class="picker-hint">每张都是黑西装真实穿搭，喜欢的都可以选。</p><div class="style-feed" aria-label="12 种风格帖子">${styleOptions.map(style=>`<article class="style-post-card"><button class="style-post" data-preference-type="styles" data-value="${style.name}" data-focus="style-${style.name}" aria-label="${style.name}风格" aria-pressed="${state.styles.includes(style.name)}" onclick="choose('styles','${style.name}')"><div class="style-post-photo"><img src="${style.image}" alt="${style.name}：黑西装真实穿搭照片" width="${style.width}" height="${style.height}" loading="lazy" decoding="async"><span class="choice-indicator" aria-hidden="true">${state.styles.includes(style.name)?'✓':'+'}</span></div><div class="style-post-copy"><h3>${style.name}</h3><p>${style.caption}</p><div class="style-post-tags">${style.tags.map(tag=>`<span>#${tag}</span>`).join('')}</div><span class="style-post-action">${icon('heart')} <span>喜欢这个风格</span></span></div></button><a class="photo-source" href="${style.sourceUrl}" target="_blank" rel="noopener noreferrer" aria-label="${style.name}照片来源，${esc(style.credit)}，Who What Wear">图源 ${esc(style.credit)} · WWW ↗</a></article>`).join('')}</div><p class="feed-end">12 种风格都在这里，也可以同时喜欢几种。</p></section>`}

function comfortDock(){return `<div class="preference-dock"><div class="preference-selection-status"><span id="avoid-dock-status" role="status">避开 ${state.avoids.length} 种效果 · 尝试 ${state.changeAmount}%</span><small>按自己的感觉来</small></div><div class="preference-dock-actions"><button class="btn secondary" onclick="intakeNext(1)">上一步</button><button class="btn primary" onclick="startSearch()">${icon('spark')} 找到我的搭配 <span aria-hidden="true">→</span></button></div></div>`}
function personalChoiceValue(field){
  const value=state.personal[field.key];
  return `<span class="${value?'':'is-empty'}">${value?esc(value)+(field.unit?' '+field.unit:''):'选填'}</span><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="m5 6 3-3 3 3m-6 4 3 3 3-3"/></svg>`;
}
function personalChoices(){return personalWheelFields.map(field=>`<div class="personal-choice-field"><span>${field.key}</span><button id="personal-${field.id}" class="personal-choice-trigger" type="button" data-personal-picker="${field.id}" onclick="openPersonalPicker('${field.id}')" aria-label="${field.key}，${esc(state.personal[field.key]||'未填写')}，选填" aria-haspopup="dialog" aria-expanded="false">${personalChoiceValue(field)}</button></div>`).join('')}
function comfortPreferences(){return `<section class="panel preference-panel comfort-panel">
  <div class="field"><div class="field-title"><span>这次不想要</span><small id="avoid-count">已选 ${state.avoids.length} 项 / 可不选</small></div><p class="picker-hint">选中图片，表示这次想避开这个效果。</p><div class="avoid-grid">${avoidOptions.map(option=>`<button class="avoid-choice" data-avoid-value="${option.name}" data-focus="avoid-${option.name}" aria-label="避开${option.name}" aria-pressed="${state.avoids.includes(option.name)}" onclick="choose('avoids','${option.name}')"><div class="avoid-photo"><img src="${option.image}" alt="${option.hint}的黑西装穿搭示意" decoding="async"><span class="choice-indicator" aria-hidden="true">${state.avoids.includes(option.name)?'✓':'+'}</span></div><strong>${option.name}</strong><small>${option.hint}</small></button>`).join('')}</div><details class="scene-credits"><summary>查看示意图片来源</summary>${avoidOptions.map(option=>`<a href="${option.sourceUrl}" target="_blank" rel="noopener noreferrer">${option.name} · ${esc(option.credit)} / Who What Wear ↗</a>`).join('')}</details></div>
  <div class="field change-field"><div class="field-title"><label for="change-range">给新风格留多少空间？</label><output id="change-value" for="change-range">${changeSummary()}</output></div><input id="change-range" class="change-range" data-focus="change-range" type="range" min="0" max="100" step="1" value="${state.changeAmount}" style="--change-progress:${state.changeAmount}%" aria-valuetext="${changeSummary()}" aria-describedby="change-description" oninput="setChangeAmount(this.value)"><div class="change-scale" aria-hidden="true"><span>贴近日常</span><span>稍作尝试</span><span>大胆尝试</span></div><p id="change-description" class="change-description">${changeDescription()}</p></div>
  <details class="optional-fields" open><summary>个人信息与补充要求 <span>选填 <b class="optional-toggle" aria-hidden="true"></b></span></summary><div class="profile-recap"><span>${esc(profileSummary())}</span><button class="text-btn" onclick="intakeNext(0)">修改信息</button></div><div class="fields-grid">${personalChoices()}</div><label class="other-needs" for="other-needs">还有什么想告诉我？<textarea id="other-needs" oninput="state.note=this.value" placeholder="比如：要走很多路，不喜欢露腰">${esc(state.note)}</textarea></label></details></section><p class="privacy-note">AI 提供搭配建议；真实照片用作参考，合身程度请以实际试穿为准。</p>`}


function profileAgeLabel(){return `<span class="age-trigger-label" aria-hidden="true">年龄 · 选填</span><strong>${esc(state.personal['年龄']||'—')}</strong>${state.personal['年龄']?'<span aria-hidden="true">岁</span>':''}<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="m5 6 3-3 3 3m-6 4 3 3 3-3"/></svg>`}
function profilePicker(){
  const genderGlyphs={女性:'<circle cx="12" cy="8" r="5"/><path d="M12 13v8m-4-4h8"/>',男性:'<circle cx="9" cy="15" r="5"/><path d="m13 11 7-7m-6 0h6v6"/>',其他:'<circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>'};
  return `<section class="profile-picker" aria-labelledby="profile-title"><div class="profile-identity"><div class="profile-avatar"><img src="assets/profile-avatar-user.jpg" alt="用户提供的彩色头像" width="46" height="46" decoding="async"></div><div class="profile-identity-copy"><h2 id="profile-title">Emma Wilson</h2><p>Your style, your way</p></div><button id="profile-age" class="age-control age-trigger" type="button" onclick="openAgePicker()" aria-label="年龄，${state.personal['年龄']?esc(state.personal['年龄'])+' 岁':'暂不填写'}，选填" aria-haspopup="dialog" aria-expanded="false" aria-describedby="profile-error">${profileAgeLabel()}</button></div><div class="profile-fields"><fieldset class="profile-gender"><legend>性别 <small>必填</small></legend><div class="gender-options">${genderOptions.map(gender=>`<label class="gender-option"><input type="radio" name="profile-gender" value="${gender}" required ${state.personal['性别']===gender?'checked':''} onchange="setProfileGender(this.value)"><span><svg class="gender-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${genderGlyphs[gender]}</svg><b>${gender}</b></span></label>`).join('')}</div></fieldset></div><p id="profile-error" class="profile-error" role="alert" hidden></p></section>`;
}

function intake(){
  const step=state.intakeStep||0,count=selectedItems().length;
  const titles=['选择你要搭配的单品','想穿出什么感觉？','按你舒服的方式来'];
  const subtitles=['上衣、裤装、鞋类，选 1～3 件都可以。','围绕你录入的单品，选好场景与风格。','留下偏好，避开你不喜欢的效果。'];
  return `<div class="intake-page ${step===1?'style-step':''}">
  <div id="intake-progress-root" class="intake-progress" aria-label="录入进度"></div>
  ${step===0?profilePicker():''}
  <div class="intro-row"><h1 tabindex="-1">${titles[step]}</h1><p>${subtitles[step]}</p></div>
  ${step===0?`<p class="item-count" role="status">已录入 ${count} / 3 件<span>至少 1 件，每类最多 1 件</span></p><div class="piece-stack">${itemSlots.map(piecePanel).join('')}</div><p class="privacy-note">${icon('shield')} 确认后将衣物照片发送给 Coze 识别 · 每张最大 8 MB</p>`:`<p class="selected-summary">本次单品 · ${esc(inputSummary())}</p>`}
  ${step===1?preferencePicker():''}
  ${step===2?`<div class="preference-summary"><p>场景 · ${esc(sceneSummary())}</p><p>风格 · ${state.styles.map(esc).join('、')}</p></div>`:''}
  ${step===2?comfortPreferences():''}
  ${step===0?`<div class="intake-actions">${step>0?`<button class="btn secondary" onclick="intakeNext(${step-1})">上一步</button>`:''}<button class="btn primary" onclick="${step===2?'startSearch()':`intakeNext(${step+1})`}">${step===2?icon('spark')+' 找到我的搭配':(count?`用这 ${count} 件，继续`:'录入单品后继续')}<span aria-hidden="true">→</span></button></div>`:''}
  </div>`;
}
