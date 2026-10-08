// Real reference photos and preset plans. Percentages describe this demo's rules.
const outfitProfiles={
  denim:{family:'denim',degree:35,scenes:['日常通勤','周末出门','朋友聚会','旅行','看展'],effects:['不想露肤']},
  mono:{family:'mono',degree:40,scenes:['日常通勤','朋友聚会','约会','看展'],effects:['太正式']},
  skirt:{family:'skirt',degree:45,scenes:['日常通勤','朋友聚会','约会','看展'],effects:['过于甜美']},
  whiteDenim:{family:'mono',degree:30,scenes:['日常通勤','周末出门','旅行','看展'],effects:[]},
  warmSkirt:{family:'skirt',degree:55,scenes:['日常通勤','朋友聚会','约会','看展'],effects:['过于甜美']},
  airySkirt:{family:'skirt',degree:65,scenes:['周末出门','朋友聚会','约会','旅行','看展'],effects:['过于甜美']},
  color:{family:'denim',degree:90,scenes:['周末出门','朋友聚会','约会','看展'],effects:['太过张扬']},
  black:{family:'mono',degree:50,scenes:['日常通勤','朋友聚会','约会','看展'],effects:['显得沉闷']},
  mini:{family:'skirt',degree:80,scenes:['周末出门','朋友聚会','约会','看展'],effects:['不想露肤']},
  preppy:{family:'skirt',degree:65,scenes:['周末出门','朋友聚会','约会','看展'],effects:['不想露肤','过于甜美']},
  leather:{family:'skirt',degree:85,scenes:['朋友聚会','约会','看展'],effects:['显得沉闷','不想露肤']},
  slouchy:{family:'denim',degree:60,scenes:['周末出门','朋友聚会','看展'],effects:['显得沉闷','不够利落']}
};
const extraLooks=[
  {id:'whiteDenim',base:'mono',styleName:'黑白通勤',title:'白色牛仔，让通勤更轻快',subtitle:'黑色西装 × 白色直筒牛仔',reason:'用白色牛仔提亮黑西装，鞋履保持简洁，通勤也能轻松一点。',bottom:'白色直筒牛仔裤',difference:'参考图为深色内搭、白色破洞牛仔和黑色踝靴。本方案改用浅色内搭、少破洞的白色直筒牛仔与简洁运动鞋。'},
  {id:'warmSkirt',base:'skirt',styleName:'暖调知性',title:'用暖棕色，柔化黑西装',subtitle:'黑色西装 × 暖棕中长裙',reason:'暖棕裙装与黑西装形成柔和层次，日常、看展和聚会都能尝试。',bottom:'暖棕色中长半裙',difference:'参考照片只用于色彩和轮廓参考；本方案保留录入单品，鞋履可沿用轻便平底款。'},
  {id:'airySkirt',base:'skirt',styleName:'轻盈裙装',title:'白裙和黑西装的轻盈平衡',subtitle:'黑色西装 × 白色中长裙',reason:'黑色外套压住白裙的甜度，搭平底鞋，让轻盈和利落同时出现。',bottom:'白色中长半裙',difference:'参考图为泡泡裙。本方案以好活动的白色中长裙替代，检查裙长和实际透光程度。'},
  {id:'color',base:'denim',styleName:'彩色混搭',title:'给基础搭配一点亮色',subtitle:'黑色西装 × 彩色内搭',reason:'以黑西装为基础，只用一处亮色内搭或包袋表达个性。',difference:'原照有多处彩色细节。本方案只留一处亮色，其他单品沿用基础款。'},
  {id:'black',base:'mono',styleName:'收腰精致',title:'全黑搭配，也留出层次',subtitle:'黑色西装 × 深色下装',reason:'用材质和松量变化区分深色单品，配饰保持轻巧。',bottom:'深色直筒裤',difference:'参考图为收腰西装。本方案保留录入的西装，通过敞开外套和内搭比例调整层次。'},
  {id:'mini',base:'skirt',styleName:'短裙酷感',title:'短裙与长靴的利落组合',subtitle:'黑色西装 × 简洁短裙',reason:'直线条短裙配长靴，把西装穿出更鲜明的轮廓。',bottom:'简洁黑色短裙',shoes:'舒适低跟长靴',difference:'参考图的裙长与鞋跟高度需要结合实际穿着调整，露肤偏好需另外核对。'},
  {id:'preppy',base:'skirt',styleName:'学院风',title:'百褶裙，让西装轻快起来',subtitle:'黑色西装 × 百褶短裙',reason:'百褶裙、白袜和乐福鞋带来学院感，外套保留干净肩线。',bottom:'深色百褶短裙',shoes:'黑色乐福鞋',difference:'参考照片含短裙和白袜，若不想露肤可换长裙或裤装，照片不会自动改变。'},
  {id:'leather',base:'skirt',styleName:'复古皮革',title:'一点皮革质感，更有个性',subtitle:'黑色西装 × 皮革质感下装',reason:'用一件皮革质感单品增加复古感，其他配饰尽量简洁。',bottom:'简洁皮革质感半裙',shoes:'低跟长靴',difference:'参考图为皮革西装；本方案保留你的外套，将皮革质感放在下装。'},
  {id:'slouchy',base:'denim',image:'assets/avoid-slouchy.jpg',credit:'@emmarosestyle',sourceUrl:'https://www.whowhatwear.com/uk/chunky-sandal-outfits',styleName:'松弛休闲',title:'宽松轮廓，穿得自在一些',subtitle:'黑色西装 × 宽松牛仔',reason:'以宽松牛仔放松西装轮廓，日常走动时注意收好裤脚长度。',bottom:'宽松蓝色牛仔裤',difference:'参考图裤脚有堆积。本方案建议调整裤长，避免拖地；仍需实际试穿核对。'}
];
extraLooks.forEach((look,index)=>{
  const base=outfits.find(o=>o.id===look.base),photo=styleOptions.find(s=>s.name===look.styleName);
  outfits.push({...base,...look,style:look.styleName,image:look.image||photo.image,credit:look.credit||photo.credit,sourceUrl:look.sourceUrl||photo.sourceUrl,tag:String(index+4).padStart(2,'0')+' / NEW PERSPECTIVE',...(look.id==='black'?{keep:'用不同材质与松量区分深色单品；内搭和外套之间保留清晰层次。',avoid:'避免所有深色单品都使用相同质感；若不喜欢沉闷，可以用浅色内搭或包袋提亮。'}:{}),items:base.items.map(item=>({...item,...(item.id==='bottom'&&look.bottom?{name:look.bottom,tip:'结合实际身形选择舒适松量，检查腰臀与裤裙长度，走动时不拖地。'}:{}),...(item.id==='shoes'&&look.shoes?{name:look.shoes,tip:'优先舒适鞋底与合适尺码，结合步行时间核对鞋跟和鞋筒高度。'}:{})}))});
});

// Give the added directions their own actual checklist, not only a new caption.
const extraItemChoices={color:{top:{name:'低饱和亮色基础内搭',color:'#bd764b'}},black:{top:{name:'深色基础内搭',color:'#343431'},bottom:{color:'#353532'},shoes:{name:'简洁黑色平底鞋',color:'#292d28'}},slouchy:{top:{name:'深色基础内搭',color:'#343431'}},whiteDenim:{bottom:{color:'#f0eee6'}},warmSkirt:{bottom:{color:'#937655'}},airySkirt:{bottom:{color:'#f4f1e9'}},mini:{bottom:{color:'#292d28'}},preppy:{bottom:{color:'#454940'}},leather:{bottom:{color:'#38332d'}}};
outfits.forEach(o=>{const choices=extraItemChoices[o.id];if(choices)o.items=o.items.map(item=>choices[item.id]?{...item,...choices[item.id],tip:item.id==='top'?'选择舒适、不透的基础内搭，按实际穿着决定领口和长度。':item.tip}:item)});

function matchOutfit(o){
  const profile=outfitProfiles[o.id];
  const styleHits=state.styles.filter(name=>name===o.style||styleOptions.find(s=>s.name===name)?.outfits.includes(profile.family));
  const sceneHits=state.scenes.filter(scene=>profile.scenes.includes(scene));
  const conflicts=state.avoids.filter(avoid=>profile.effects.includes(avoid));
  const style=state.styles.length?Math.round(40*styleHits.length/state.styles.length):0;
  const scene=state.scenes.length?Math.round(30*sceneHits.length/state.scenes.length):0;
  const degree=Math.round(20*(1-Math.abs(state.changeAmount-profile.degree)/100));
  const avoid=state.avoids.length?Math.round(10*(1-conflicts.length/state.avoids.length)):10;
  return {percent:style+scene+degree+avoid,style,scene,degree,avoid,styleHits,sceneHits,conflicts};
}
function rankedOutfits(){let list=[...outfits].sort((a,b)=>matchOutfit(b).percent-matchOutfit(a).percent);if(state.relaxed.includes('搭配方向'))list.reverse();return list}
function visibleOutfits(){return rankedOutfits().slice(0,state.deckLimit||6)}
function requirementSummary(){
  const personal=Object.entries(state.personal).filter(([key,value])=>!['性别','年龄'].includes(key)&&String(value).trim());
  return `<section class="requirements-summary" aria-labelledby="requirements-title"><div class="summary-heading"><h2 id="requirements-title">你的搭配需求</h2><span>已记录全部选择</span></div><dl class="requirement-rows"><div><dt>个人信息</dt><dd>${esc(profileSummary())}${personal.length?`<small>${personal.map(([key,value])=>esc(key)+'：'+esc(value)).join(' · ')}</small>`:''}</dd></div><div><dt>保留单品</dt><dd class="summary-pieces">${selectedItems().map(item=>`<span><img src="${item.image}" alt="已录入的${item.label}"><b>${esc(selectedItemName(item.category))}</b><small>${item.label}</small></span>`).join('')}</dd></div><div><dt>穿搭场景</dt><dd>${state.scenes.map(esc).join('、')}</dd></div><div><dt>喜欢风格</dt><dd>${state.styles.map(esc).join('、')}</dd></div><div><dt>这次避开</dt><dd>${state.avoids.length?state.avoids.map(esc).join('、'):'未选择限制'}</dd></div><div><dt>尝试程度</dt><dd>${esc(changeSummary())}</dd></div><div><dt>补充要求</dt><dd>${state.note.trim()?esc(state.note):'未填写'}</dd></div>${state.relaxed.length?`<div><dt>已放宽项</dt><dd>${state.relaxed.map(esc).join('、')}</dd></div>`:''}</dl><p class="summary-demo-note">已确认单品会保留在清单中；AI 根据个人信息、场景、风格和补充要求规划搭配。百分比按参考图标签计算，不代表 AI 置信度或实际合身概率。</p></section>`;
}
function results(){
  return `${steps(1)}<div class="page-heading results-heading"><div><h1>找到你的穿法</h1><p>从你的选择出发，看看不同穿法。</p></div><button class="btn secondary small" onclick="state.intakeStep=0;go('intake')">修改需求</button></div>${requirementSummary()}<section class="outfit-deck-section" aria-label="穿搭卡片"><div class="deck-section-heading"><h2>为你挑选的穿搭</h2><span>真实照片 · AI 辅助方案</span></div><p class="deck-hint">左右滑动卡片，或点击箭头来回翻看</p><div id="deck-slot">${outfitDeck()}</div></section><p class="next-hint">${icon('closet')} 先用已有的衣服凑，再决定要不要买。</p>`;
}
function outfitCardHtml(o,index){
  const match=o?matchOutfit(o):null;
  return `<article class="outfit-card deck-card">${o?`
    <button class="photo-button deck-photo" onclick="detail('${o.id}')" aria-label="查看${esc(o.title)}"><img src="${o.image}" alt="${esc(o.subtitle)}真实穿搭参考" draggable="false"><span class="photo-label">${String(index+1).padStart(2,'0')} · ${esc(o.style)}</span><span class="match-badge"><strong>${match.percent}%</strong><small>参考匹配</small></span><span class="photo-open">查看搭配分析</span></button>
    <div class="outfit-copy"><h2>${esc(o.title)}</h2><p class="outfit-sub">${esc(o.subtitle)}</p><p class="reason">${esc(o.reason)}</p><div class="mini-items">${outfitItems(o).filter(i=>i.role==='核心').map(i=>`<span class="${inputForItem(i,o)?'input-kept':''}">${esc(itemName(o,i))}${inputForItem(i,o)?' · 已录入':''}</span>`).join('')}</div>${match.conflicts.length?`<p class="match-adjustment">参考图需调整：${match.conflicts.map(esc).join('、')}。请查看方案差异。</p>`:''}
    <details class="match-details"><summary>匹配依据与参考差异 <span>＋</span></summary><div class="score-breakdown"><span>风格 ${match.style}/40</span><span>场景 ${match.scene}/30</span><span>尝试 ${match.degree}/20</span><span>避开 ${match.avoid}/10</span></div><p>${esc(o.difference)}</p><p>百分比按风格、场景、尝试程度和避开效果的标签计算。AI 使用完整需求生成说明；评分不能验证尺码或合身程度，照片未替换为你录入的单品。</p><a class="credit" href="${o.sourceUrl||SOURCE}" target="_blank" rel="noopener noreferrer">图源 ${esc(o.credit)} · 查看真实照片来源 ↗</a>${o.licenseUrl?`<a class="credit" href="${o.licenseUrl}" target="_blank" rel="noopener noreferrer">${esc(o.license)} · 图片许可（原文件未改动） ↗</a>`:""}</details><div class="card-actions"><button class="btn secondary" onclick="detail('${o.id}')">详细分析</button><button class="btn primary" onclick="selectOutfit('${o.id}')">选这套</button></div></div>`:moreOutfitCard(visibleOutfits().length)}</article>`;
}
function outfitDeck(){
  return '<div id="outfit-carousel-root"></div><div class="deck-controls"><button id="deck-prev" class="deck-arrow" aria-label="上一套穿搭" onclick="flipOutfit(-1)">←</button><div role="status" class="deck-page-status"></div><button id="deck-next" class="deck-arrow" aria-label="下一套穿搭" onclick="flipOutfit(1)">→</button></div>';
}
function syncDeckControls(){
  const count=visibleOutfits().length,index=state.deckIndex||0;
  const prev=document.querySelector('#deck-prev'),next=document.querySelector('#deck-next'),status=document.querySelector('.deck-page-status');
  if(prev)prev.disabled=index===0;
  if(next){next.disabled=index===count;next.setAttribute('aria-label',index===count-1?'查看更多穿搭':'下一套穿搭')}
  if(status)status.innerHTML=index<count?'<strong>'+String(index+1).padStart(2,'0')+'</strong> / '+String(count).padStart(2,'0')+'<small>按你的需求比较</small>':'更多灵感<small>保留当前所有要求</small>';
}
function moreOutfitCard(count){const available=count<outfits.length;return `<div class="more-outfits-card"><span class="eyebrow">MORE WAYS TO WEAR</span><div class="more-photo-strip" aria-hidden="true">${rankedOutfits().slice(0,3).map(o=>`<img src="${o.image}" alt="">`).join('')}</div><h2>${available?'还想看看其他穿法？':'这一轮示例，已经看完了'}</h2><p>${available?'保留你选好的单品与偏好，再看一组不同的搭配方向。':'当前演示池的 12 套穿搭已全部展示。可以重新比较，或调整需求再选。'}</p>${available?`<button class="btn primary wide" onclick="loadMoreOutfits()">${icon('spark')} 生成更多穿搭</button><small>演示：增加现有参考池中的 3 套方案</small>`:`<button class="btn primary wide" onclick="goFirstOutfit()">重新比较这 ${count} 套</button>`}<button class="text-btn" onclick="state.intakeStep=0;go('intake')">修改我的需求</button></div>`}
function updateOutfitDeck(){bindOutfitDeck()}
function flipOutfit(delta){
  const count=visibleOutfits().length,previous=state.deckIndex||0,next=Math.max(0,Math.min(count,previous+delta));
  if(previous!==next)window.RewearDeck.goTo(next);
}
function loadMoreOutfits(){const oldCount=visibleOutfits().length;if(oldCount>=outfits.length)return;state.deckLimit=Math.min(outfits.length,oldCount+3);state.deckIndex=oldCount;updateOutfitDeck();toast('已保留当前需求，新增 '+(state.deckLimit-oldCount)+' 套示例穿搭')}
function goFirstOutfit(){window.RewearDeck.goTo(0)}
function bindOutfitDeck(){
  const container=document.querySelector('#outfit-carousel-root');if(!container)return;
  const list=visibleOutfits(),items=list.map((o,index)=>({...o,html:outfitCardHtml(o,index)}));
  items.push({id:'more',html:outfitCardHtml(null,list.length)});
  window.RewearDeck.render(container,items,state.deckIndex||0,index=>{state.deckIndex=index;syncDeckControls()});
  syncDeckControls();
}
