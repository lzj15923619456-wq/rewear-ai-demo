const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const OPENVERSE_API = 'https://api.openverse.org/v1/images/';
const UNSPLASH_API = 'https://api.unsplash.com/search/photos';
const LICENSES = new Set(['by', 'by-sa', 'cc0', 'pdm']);
const clean = (v, max = 300) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const failure = message => Object.assign(new Error(message), { status: 502 });

const GARMENTS = [[/卫衣|hoodie|sweatshirt/i,'hoodie'],[/开衫|cardigan/i,'cardigan'],[/毛衣|针织|sweater|knit/i,'sweater'],[/牛仔裤|jeans/i,'jeans'],[/运动鞋|球鞋|sneaker/i,'sneakers'],[/西装|西服|blazer/i,'blazer'],[/连衣裙|dress/i,'dress'],[/半身裙|skirt/i,'skirt'],[/T恤|t-shirt/i,'t-shirt'],[/衬衫|shirt|blouse/i,'shirt'],[/外套|夹克|jacket|coat/i,'jacket'],[/裤|trouser|pant/i,'trousers'],[/靴|boot/i,'boots'],[/凉鞋|sandal/i,'sandals']];
const COLORS = {黑:'black',黑色:'black',白:'white',白色:'white',灰:'grey',灰色:'grey',浅灰:'light grey',深灰:'dark grey',蓝:'blue',蓝色:'blue',浅蓝:'light blue',浅蓝色:'light blue',深蓝:'dark blue',深蓝色:'dark blue',藏青:'navy',藏青色:'navy',红:'red',红色:'red',棕:'brown',棕色:'brown',米:'beige',米色:'beige',绿:'green',绿色:'green',粉:'pink',粉色:'pink'};
const STYLE_TERMS = [[/极简|简约|clean\s*fit/i,'minimal clean outfit'],[/松弛|休闲/i,'casual relaxed outfit'],[/通勤|职场|利落|商务/i,'smart casual workwear'],[/街头/i,'street style outfit'],[/运动|机能/i,'sporty utility outfit'],[/复古/i,'vintage outfit'],[/温柔|浪漫/i,'soft romantic outfit'],[/个性|混搭/i,'eclectic layered outfit']];
const SCENE_TERMS = [[/通勤|上班|职场/i,'workwear'],[/约会/i,'date outfit'],[/周末|出门|日常/i,'casual street style'],[/聚会|社交/i,'party outfit'],[/旅行|旅游/i,'travel outfit'],[/运动|步行/i,'comfortable outfit']];

function term(value, pairs, fallback) { return pairs.find(([re]) => re.test(value || ''))?.[1] || fallback; }
function searchQueries(items, requirements = {}) {
  const anchor = items.find(i => i.slot === 'upper') || items[0] || {};
  const garment = clean(anchor.attributes?.subtype || anchor.subtype || anchor.name, 60);
  const subtype = term(garment, GARMENTS, /^[a-z -]+$/i.test(garment) ? garment : 'clothing');
  const rawColor = clean((anchor.attributes?.colors || anchor.colors || [])[0], 20);
  const color = COLORS[rawColor] || (/^[a-z ]+$/i.test(rawColor) ? rawColor : '');
  const style = term((requirements.styles || [])[0], STYLE_TERMS, 'styled outfit');
  const scene = term((requirements.scenes || [])[0], SCENE_TERMS, 'street style');
  // Search providers receive clothing/style words only; personal data and free-form notes stay inside REWEAR.
  return [...new Set([`${color} ${subtype} outfit`, `${subtype} ${style}`, `${color} ${subtype} ${scene}`].map(q => q.trim()))].slice(0, 3);
}

function safeWebUrl(value, host) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port && (!host || u.hostname === host) ? u.href : null; }
  catch { return null; }
}

function photoRecord(p) {
  if (!UUID.test(p?.id || '') || !LICENSES.has(p.license) || p.mature || !clean(p.creator) || !clean(p.source) || !safeWebUrl(p.foreign_landing_url)) return null;
  const tags = Array.isArray(p.tags) ? p.tags.map(t => clean(t.name, 60)).filter(Boolean).slice(0, 30) : [];
  if (/sexy|nude|nudity|lingerie|porn|bra\b|thong|underwear|fetish|handcuff|weapon|knife|second life|\bsl\b|repose|graffitiwear|soles|topless|\bbutt\b|illustration|clipart|sticker|drawing|sketch|裸体|色情/i.test(p.title || '') || p.category && p.category !== 'photograph') return null;
  const licenseUrl = safeWebUrl(p.license_url);
  if (!licenseUrl || new URL(licenseUrl).hostname !== 'creativecommons.org') return null;
  const original = safeWebUrl(p.url);
  let commonsImage = original && new URL(original).hostname === 'upload.wikimedia.org' && /^\/wikipedia\/commons\/[a-f0-9]\/[a-f0-9]{2}\/[^/]+\.(?:jpg|jpeg|png|webp)$/i.test(new URL(original).pathname) ? original : null;
  if (commonsImage && Number(p.width) > 960) {
    const u = new URL(commonsImage), file = u.pathname.split('/').at(-1);
    u.pathname = u.pathname.replace('/commons/', '/commons/thumb/') + '/960px-' + file;
    commonsImage = u.href;
  }
  return { id:'openverse-'+p.id, provider:'openverse', providerId:p.id, source:clean(p.source,60), commonsImage, title:clean(p.title), tags, sourceUrl:safeWebUrl(p.foreign_landing_url), credit:clean(p.creator), license:p.license.toUpperCase()+' '+clean(p.license_version,12), licenseUrl, changes:'Resized and recompressed for preview', width:Number(p.width)||0, height:Number(p.height)||0 };
}

function unsplashRecord(p) {
  const id = clean(p?.id, 64), imageUrl = safeWebUrl(p?.urls?.small, 'images.unsplash.com'), sourceUrl = safeWebUrl(p?.links?.html), credit = clean(p?.user?.name, 120);
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(id) || !imageUrl || !sourceUrl || new URL(sourceUrl).hostname !== 'unsplash.com' || !credit) return null;
  return { id:'unsplash-'+id, provider:'unsplash', providerId:id, source:'unsplash', imageUrl, title:clean(p.alt_description || p.description || 'Unsplash outfit photo'), tags:[], sourceUrl, credit, license:'Unsplash License', licenseUrl:'https://unsplash.com/license', changes:'Displayed from the Unsplash image CDN; resized in memory for visual inspection', width:Number(p.width)||0, height:Number(p.height)||0 };
}

async function limitedBytes(response, maximum) {
  if (!response.ok) throw failure(response.status === 429 ? '图片搜索暂时达到频率限制，请稍后再试' : '图片搜索服务暂时不可用');
  if (Number(response.headers.get('content-length')) > maximum) throw failure('搜索结果过大');
  let size = 0; const chunks = [];
  for await (const chunk of response.body) { size += chunk.length; if (size > maximum) throw failure('搜索结果过大'); chunks.push(Buffer.from(chunk)); }
  return Buffer.concat(chunks);
}

async function hashImage(bytes) {
  const pixels = await sharp(bytes).resize(9, 8, { fit:'fill' }).greyscale().raw().toBuffer();
  let hash = 0n;
  for (let y=0;y<8;y++) for (let x=0;x<8;x++) hash = (hash<<1n)|BigInt(pixels[y*9+x] > pixels[y*9+x+1]);
  return hash;
}
function similarHash(a,b) { let bits=a^b,count=0; while(bits){bits&=bits-1n;if(++count>4)return false;} return true; }

function createPhotoSearch({ db, dataDir, fetcher=fetch, unsplashKey='' }) {
  const directory = path.join(dataDir,'reference-images'); fs.mkdirSync(directory,{recursive:true});
  db.exec('CREATE TABLE IF NOT EXISTS photo_search_cache (query TEXT PRIMARY KEY, updated INTEGER NOT NULL, data TEXT NOT NULL)');
  const cached = key => { const row=db.prepare('SELECT updated,data FROM photo_search_cache WHERE query=?').get(key); return row&&Date.now()-row.updated<86400000?JSON.parse(row.data):null; };
  const save = (key,data) => db.prepare('INSERT INTO photo_search_cache VALUES (?,?,?) ON CONFLICT(query) DO UPDATE SET updated=excluded.updated,data=excluded.data').run(key,Date.now(),JSON.stringify(data));

  async function openverse(queries,page) {
    const photos = new Map();
    for (const query of queries) {
      const key=`openverse-v2:${query}:${page}`; let results=cached(key);
      if (!results) {
        const url=new URL(OPENVERSE_API);url.search=new URLSearchParams({q:query,license:[...LICENSES].join(','),page_size:'20',page:String(page),mature:'false',filter_dead:'true'}).toString();
        const response=await fetcher(url,{signal:AbortSignal.timeout(30000),redirect:'error',headers:{'User-Agent':'REWEAR-outfit-demo/1.0'}});
        const json=JSON.parse((await limitedBytes(response,1000000)).toString());
        if(!Array.isArray(json.results))throw failure('图片搜索返回格式无效');
        results=json.results.map(photoRecord).filter(Boolean);save(key,results);
      }
      for(const photo of results)photos.set(photo.id,photo);
    }
    return [...photos.values()];
  }

  async function unsplash(queries) {
    if(!unsplashKey)return [];
    const photos=new Map();
    for(const query of queries.slice(0,2)) {
      const key=`unsplash-v1:${query}`;let results=cached(key);
      if(!results){
        const url=new URL(UNSPLASH_API);url.search=new URLSearchParams({query,per_page:'20',orientation:'portrait',content_filter:'high'}).toString();
        const response=await fetcher(url,{signal:AbortSignal.timeout(30000),redirect:'error',headers:{Authorization:`Client-ID ${unsplashKey}`,'Accept-Version':'v1'}});
        const json=JSON.parse((await limitedBytes(response,1000000)).toString());
        if(!Array.isArray(json.results))throw failure('Unsplash 返回格式无效');
        results=json.results.map(unsplashRecord).filter(Boolean);save(key,results);
      }
      for(const photo of results)photos.set(photo.id,photo);
    }
    return [...photos.values()];
  }

  const priority = photo => 4*Number(/\b(?:woman|women|man|men|wearing|outfit|streetwear|person|fashion|style|look)\b/i.test([photo.title,...photo.tags].join(' ')))+Number(photo.height>photo.width)-2*Number(/\b(?:closeup|detail|textile|texture|macro)\b/i.test(photo.tags.join(' ')));
  async function load(candidates, loaded, excludedHashes) {
    for(let start=0;start<candidates.length&&loaded.length<16;start+=4){
      const batch=await Promise.all(candidates.slice(start,start+4).map(async photo=>{
        try{
          let bytes,image;
          if(photo.provider==='openverse'){
            const filename=path.join(directory,photo.providerId+'.jpg');
            if(fs.existsSync(filename))bytes=fs.readFileSync(filename);
            else{
              let response=await fetcher(OPENVERSE_API+photo.providerId+'/thumb/',{signal:AbortSignal.timeout(10000),redirect:'error'});
              if(!response.ok&&photo.commonsImage)response=await fetcher(photo.commonsImage,{signal:AbortSignal.timeout(10000),redirect:'error'});
              const original=await limitedBytes(response,4000000),meta=await sharp(original,{limitInputPixels:25000000}).metadata();
              if(!['jpeg','png','webp'].includes(meta.format)||meta.width<96||meta.height<96)return null;
              bytes=await sharp(original,{limitInputPixels:25000000}).rotate().resize({width:640,height:900,fit:'inside',withoutEnlargement:true}).jpeg({quality:75}).toBuffer();fs.writeFileSync(filename,bytes);
            }
            image='/api/reference-images/'+photo.providerId+'.jpg';
          }else{
            const original=await limitedBytes(await fetcher(photo.imageUrl,{signal:AbortSignal.timeout(10000),redirect:'error'}),4000000),meta=await sharp(original,{limitInputPixels:25000000}).metadata();
            if(!['jpeg','png','webp'].includes(meta.format)||meta.width<96||meta.height<96)return null;
            bytes=await sharp(original,{limitInputPixels:25000000}).rotate().resize({width:640,height:900,fit:'inside',withoutEnlargement:true}).jpeg({quality:75}).toBuffer();image=photo.imageUrl;
          }
          return {...photo,image,imageData:'data:image/jpeg;base64,'+bytes.toString('base64'),hash:await hashImage(bytes)};
        }catch{return null;}
      }));
      for(const photo of batch.filter(Boolean))if(!loaded.some(previous=>similarHash(previous.hash,photo.hash))&&!excludedHashes.some(hash=>similarHash(hash,photo.hash))&&loaded.length<16)loaded.push(photo);
    }
  }

  async function search(items,requirements,exclude=[]){
    const page=Math.min(5,1+Math.floor(exclude.filter(id=>id.startsWith('openverse-')).length/16)),queries=searchQueries(items,requirements),report={queries,providers:['openverse'],openverseCandidates:0,unsplashCandidates:0,loaded:0,warnings:[]};
    const excludedHashes=[];
    for(const id of exclude){const uuid=id.replace(/^openverse-/,'');const filename=UUID.test(uuid)?path.join(directory,uuid+'.jpg'):null;if(filename&&fs.existsSync(filename))excludedHashes.push(await hashImage(fs.readFileSync(filename)));}
    const open=(await openverse(queries,page)).filter(photo=>!exclude.includes(photo.id)).sort((a,b)=>priority(b)-priority(a)).slice(0,40);report.openverseCandidates=open.length;
    const loaded=[];await load(open.slice(0,unsplashKey?10:16),loaded,excludedHashes);
    if(unsplashKey){
      report.providers.push('unsplash');
      try{const fallback=(await unsplash(queries.slice(1))).filter(photo=>!exclude.includes(photo.id)).sort((a,b)=>priority(b)-priority(a));report.unsplashCandidates=fallback.length;await load(fallback,loaded,excludedHashes);}
      catch(error){report.warnings.push(error.message||'Unsplash 兜底暂不可用');}
    }
    report.loaded=loaded.length;
    const output=loaded.map(({hash,...photo})=>photo);Object.defineProperty(output,'report',{value:report,enumerable:false});return output;
  }
  function image(id){return UUID.test(id)?path.join(directory,id+'.jpg'):null;}
  return {search,image};
}

function analyzedReferences(result,photos,lockedItems){
  if(!Array.isArray(result?.references)||result.references.length>photos.length)throw failure('AI 参考图分析格式不正确');
  const anchor=lockedItems.find(i=>i.slot==='upper')||lockedItems[0],seen=new Set(),references=[];
  for(const row of result.references){
    const photo=photos.find(p=>p.id===row.referenceId);if(!photo||seen.has(row.referenceId))throw failure('AI 引用了无效或重复的搜索图片');seen.add(row.referenceId);
    if(row.usable!==true||!Array.isArray(row.matchedItemIds)||lockedItems.some(item=>!row.matchedItemIds.includes(item.itemId)))continue;
    if(row.matchedItemIds.some(id=>!lockedItems.some(item=>item.itemId===id)))throw failure('AI 参考图引用了未知衣物');
    const slots=row.visibleSlots;
    const slotPass=anchor.slot==='upper' ? slots?.includes('upper')&&slots.length>1
      : anchor.slot==='bottom' ? slots?.includes('bottom')&&slots.includes('upper')
      : anchor.slot==='shoes' ? slots?.includes('shoes')&&(slots.includes('upper')||slots.includes('bottom'))
      : slots?.includes(anchor.slot)&&slots.length>1;
    if(!Array.isArray(slots)||slots.some(slot=>!['upper','bottom','shoes'].includes(slot))||new Set(slots).size!==slots.length||!slotPass)continue;
    if(row.referenceQuality!=='fashion'||!clean(row.styleEvidence))continue;
    if(!clean(row.description)||!Array.isArray(row.styles)||!Array.isArray(row.scenes)||!Array.isArray(row.effects)||!Number.isFinite(row.exploration)||row.exploration<0||row.exploration>100)throw failure('AI 参考图描述缺少必要信息');
    const {imageData,...source}=photo;
    references.push({...source,description:clean(row.description,1200),styleEvidence:clean(row.styleEvidence,200),styles:row.styles.filter(v=>typeof v==='string').slice(0,12),scenes:row.scenes.filter(v=>typeof v==='string').slice(0,6),effects:row.effects.filter(v=>typeof v==='string').slice(0,8),exploration:row.exploration,matchedItemIds:row.matchedItemIds,visualAnalysis:true});
  }
  return references;
}
module.exports={createPhotoSearch,searchQueries,photoRecord,unsplashRecord,analyzedReferences,similarHash};
