const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const API = 'https://api.openverse.org/v1/images/';
const LICENSES = new Set(['by', 'by-sa', 'cc0', 'pdm']);
const clean = (v, max = 300) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const failure = message => Object.assign(new Error(message), { status: 502 });

function searchQueries(items, requirements) {
  const anchor = items.find(i => i.slot === 'upper') || items[0];
  const garment = clean(anchor.attributes?.subtype || anchor.subtype || anchor.name, 60);
  const names = [[/卫衣|hoodie|sweatshirt/i,'hoodie'],[/开衫|cardigan/i,'cardigan'],[/毛衣|针织|sweater|knit/i,'sweater'],[/牛仔裤|jeans/i,'jeans'],[/运动鞋|球鞋|sneaker/i,'sneakers'],[/西装|西服|blazer/i,'blazer'],[/连衣裙|dress/i,'dress'],[/半身裙|skirt/i,'skirt'],[/T恤|t-shirt/i,'t-shirt'],[/衬衫|shirt|blouse/i,'shirt'],[/外套|夹克|jacket|coat/i,'jacket'],[/裤|trouser|pant/i,'trousers'],[/靴|boot/i,'boots'],[/凉鞋|sandal/i,'sandals']];
  const subtype = names.find(([re]) => re.test(garment))?.[1] || garment;
  const colorNames = {黑:'black',黑色:'black',白:'white',白色:'white',灰:'grey',灰色:'grey',浅灰:'light grey',深灰:'dark grey',蓝:'blue',蓝色:'blue',浅蓝:'light blue',浅蓝色:'light blue',深蓝:'dark blue',深蓝色:'dark blue',藏青:'navy',藏青色:'navy',红:'red',红色:'red',棕色:'brown',米色:'beige',绿色:'green',粉色:'pink'};
  const color = clean((anchor.attributes?.colors || anchor.colors || [])[0], 20);
  const translatedColor = colorNames[color] || (/^[a-z ]+$/i.test(color) ? color : '');
  // Only garment/search tags go to the search provider; body measurements and private notes stay with model tasks.
  const style = requirements.styles?.some(s => /运动|街头/.test(s)) ? ' streetwear' : ' outfit';
  return [...new Set([`${translatedColor} ${subtype}`.trim(), `${translatedColor.replace(/^(light|dark) /,'')} ${subtype}`.trim(), `${subtype}${style}`])].filter(Boolean);
}

function safeWebUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port ? u.href : null; }
  catch { return null; }
}

function photoRecord(p) {
  if (!UUID.test(p?.id || '') || !LICENSES.has(p.license) || p.mature || !clean(p.creator) || !safeWebUrl(p.foreign_landing_url)) return null;
  const tags = Array.isArray(p.tags) ? p.tags.map(t=>clean(t.name,60)).filter(Boolean).slice(0,30) : [];
  // shortcut: licensed fashion photos in two indexed sources; add an authorized provider when coverage is insufficient.
  if (!['stocksnap','wikimedia'].includes(p.source) || !/\b(?:fashion|outfit|streetwear|street style|lookbook)\b/i.test([p.title,...tags].join(' '))) return null;
  if (/sexy|nude|nudity|lingerie|porn|bra\b|thong|underwear|fetish|handcuff|weapon|knife|second life|\bsl\b|repose|graffitiwear|soles|topless|\bbutt\b|illustration|clipart|sticker|drawing|sketch|裸体|色情/i.test(p.title || '') || p.category && p.category !== 'photograph') return null;
  const licenseUrl = safeWebUrl(p.license_url);
  if (!licenseUrl || new URL(licenseUrl).hostname !== 'creativecommons.org') return null;
  const original=safeWebUrl(p.url);
  let commonsImage=original && new URL(original).hostname==='upload.wikimedia.org' && /^\/wikipedia\/commons\/[a-f0-9]\/[a-f0-9]{2}\/[^/]+\.(?:jpg|jpeg|png|webp)$/i.test(new URL(original).pathname) ? original : null;
  if(commonsImage && Number(p.width)>960) {
    const u=new URL(commonsImage),file=u.pathname.split('/').at(-1);
    u.pathname=u.pathname.replace('/commons/','/commons/thumb/')+'/960px-'+file;
    commonsImage=u.href;
  }
  return { id: 'openverse-' + p.id, providerId: p.id, source: p.source, commonsImage, title: clean(p.title), tags, sourceUrl: safeWebUrl(p.foreign_landing_url), credit: clean(p.creator), license: p.license.toUpperCase() + ' ' + clean(p.license_version, 12), licenseUrl, changes: 'Resized and recompressed for preview', width: Number(p.width) || 0, height: Number(p.height) || 0 };
}

async function limitedBytes(response, maximum) {
  if (!response.ok) throw failure(response.status === 429 ? '图片搜索暂时达到频率限制，请稍后再试' : '图片搜索服务暂时不可用');
  if (Number(response.headers.get('content-length')) > maximum) throw failure('搜索结果过大');
  let size = 0; const chunks = [];
  for await (const chunk of response.body) { size += chunk.length; if (size > maximum) throw failure('搜索结果过大'); chunks.push(Buffer.from(chunk)); }
  return Buffer.concat(chunks);
}

async function hashImage(bytes) {
  const pixels = await sharp(bytes).resize(9, 8, { fit: 'fill' }).greyscale().raw().toBuffer();
  let hash = 0n;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) hash = (hash << 1n) | BigInt(pixels[y * 9 + x] > pixels[y * 9 + x + 1]);
  return hash;
}
function similarHash(a, b) {
  let bits = a ^ b, count = 0;
  while (bits) { bits &= bits - 1n; if (++count > 4) return false; }
  return true;
}

function createPhotoSearch({ db, dataDir, fetcher = fetch }) {
  const directory = path.join(dataDir, 'reference-images'); fs.mkdirSync(directory, { recursive: true });
  db.exec('CREATE TABLE IF NOT EXISTS photo_search_cache (query TEXT PRIMARY KEY, updated INTEGER NOT NULL, data TEXT NOT NULL)');
  async function search(items, requirements, exclude = []) {
    const page = Math.min(5, 1 + Math.floor(exclude.filter(id => id.startsWith('openverse-')).length / 12));
    const photos = new Map();
    const queries=searchQueries(items,requirements);
    const subtype=queries.at(-1).replace(/ (outfit|streetwear)$/,''),color=queries[0].slice(0,-subtype.length).trim();
    const searches=[...queries.slice(0,-1).map(query=>({query,genre:'fashion'})),{query:subtype,genre:'outfit',color},{query:subtype==='t-shirt'?'shirt':subtype,genre:'fashion'}];
    for (const {query,genre,color:queryColor} of searches) {
      const q=(queryColor?queryColor+' AND ':'')+'"'+query.replace(/"/g,'')+'" AND '+genre;
      const key = 'fashion-v1:' + q + ':' + page;
      const cached = db.prepare('SELECT updated,data FROM photo_search_cache WHERE query=?').get(key);
      let results;
      if (cached && Date.now() - cached.updated < 86400000) results = JSON.parse(cached.data);
      else {
        // Commons photographs have category=null; genre and source gates replace the category filter.
        const url = new URL(API); url.search = new URLSearchParams({ q, source:'stocksnap,wikimedia', license: [...LICENSES].join(','), page_size: '20', page: String(page), mature: 'false', filter_dead: 'true' }).toString();
        const response = await fetcher(url, { signal: AbortSignal.timeout(12000), redirect: 'error', headers: { 'User-Agent': 'REWEAR-outfit-demo/1.0' } });
        const json = JSON.parse((await limitedBytes(response, 1000000)).toString());
        if (!Array.isArray(json.results)) throw failure('图片搜索返回格式无效');
        results = json.results.map(photoRecord).filter(Boolean);
        db.prepare('INSERT INTO photo_search_cache VALUES (?,?,?) ON CONFLICT(query) DO UPDATE SET updated=excluded.updated,data=excluded.data').run(key, Date.now(), JSON.stringify(results));
      }
      for (const photo of results) if (!exclude.includes(photo.id)) photos.set(photo.id, {...photo,searchPriority:Math.max(photos.get(photo.id)?.searchPriority||0,photo.source==='stocksnap'?3:0)});
    }
    const priority=photo=>(photo.searchPriority||0)+4*Number(/\b(?:woman|women|man|men|wearing|outfit|streetwear|person|fashion)\b/i.test(photo.title))+2*Number(/\b(?:woman|women|man|men|wearing|portrait|person)\b/i.test(photo.tags.join(' ')))+Number(photo.height>photo.width)-2*Number(/\b(?:closeup|detail|textile|texture|macro)\b/i.test(photo.tags.join(' ')));
    const candidates = [...photos.values()].sort((a,b)=>priority(b)-priority(a)).slice(0,12);
    const loaded = [];
    const excludedHashes = [];
    for (const id of exclude) {
      const uuid = id.replace(/^openverse-/, '');
      const filename = UUID.test(uuid) ? path.join(directory, uuid + '.jpg') : null;
      if (filename && fs.existsSync(filename)) excludedHashes.push(await hashImage(fs.readFileSync(filename)));
    }
    // Bounded batches keep image downloads and memory within the free demo's limits.
    for (let start = 0; start < candidates.length && loaded.length < 12; start += 4) {
      const batch = await Promise.all(candidates.slice(start, start + 4).map(async photo => {
        try {
          const filename = path.join(directory, photo.providerId + '.jpg');
          let bytes;
          if (fs.existsSync(filename)) bytes = fs.readFileSync(filename);
          else {
            // Build the provider's proxy URL from a validated UUID; never fetch an arbitrary result URL.
            let response = await fetcher(API + photo.providerId + '/thumb/', { signal: AbortSignal.timeout(10000), redirect: 'error' });
            // Openverse thumbnails can return 424 for Commons; only its fixed public image CDN may be used as fallback.
            if (!response.ok && photo.commonsImage) response=await fetcher(photo.commonsImage,{signal:AbortSignal.timeout(10000),redirect:'error'});
            const original = await limitedBytes(response, 4000000);
            const meta = await sharp(original, { limitInputPixels: 25000000 }).metadata();
            if (!['jpeg','png','webp'].includes(meta.format) || meta.width < 96 || meta.height < 96) return null;
            bytes = await sharp(original, { limitInputPixels: 25000000 }).rotate().resize({ width: 640, height: 900, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer();
            fs.writeFileSync(filename, bytes);
          }
          return { ...photo, image: '/api/reference-images/' + photo.providerId + '.jpg', imageData: 'data:image/jpeg;base64,' + bytes.toString('base64'), hash: await hashImage(bytes) };
        } catch { return null; }
      }));
      for (const photo of batch.filter(Boolean)) if (!loaded.some(previous => similarHash(previous.hash, photo.hash)) && !excludedHashes.some(hash => similarHash(hash, photo.hash)) && loaded.length < 12) loaded.push(photo);
    }
    return loaded.map(({ hash, ...photo }) => photo);
  }
  function image(id) { return UUID.test(id) ? path.join(directory, id + '.jpg') : null; }
  return { search, image };
}

function analyzedReferences(result, photos, lockedItems, requirements = {}) {
  if (!Array.isArray(result?.references) || result.references.length > photos.length) throw failure('AI 参考图分析格式不正确');
  const anchor = lockedItems.find(i => i.slot === 'upper') || lockedItems[0];
  const seen = new Set();
  const references = [];
  for (const row of result.references) {
    const photo = photos.find(p => p.id === row.referenceId);
    if (!photo || seen.has(row.referenceId)) throw failure('AI 引用了无效或重复的搜索图片');
    seen.add(row.referenceId);
    if (row.usable !== true || !Array.isArray(row.matchedItemIds) || !row.matchedItemIds.includes(anchor.itemId)) continue;
    if (row.matchedItemIds.some(id => !lockedItems.some(item => item.itemId === id))) throw failure('AI 参考图引用了未知衣物');
    if (!Array.isArray(row.visibleSlots) || row.visibleSlots.some(slot=>!['upper','bottom','shoes'].includes(slot)) || new Set(row.visibleSlots).size<2 || !row.visibleSlots.includes(anchor.slot) || !row.visibleSlots.includes('upper')) continue;
    if (row.referenceQuality !== 'fashion' || !clean(row.styleEvidence)) continue;
    if (!clean(row.description) || !Array.isArray(row.styles) || !Array.isArray(row.scenes) || !Array.isArray(row.effects) || !Number.isFinite(row.exploration) || row.exploration < 0 || row.exploration > 100) throw failure('AI 参考图描述缺少必要信息');
    if (['styles','scenes'].some(key => requirements[key]?.length && !row[key].some(tag=>requirements[key].includes(tag)))) continue;
    const { imageData, ...source } = photo;
    references.push({ ...source, description: clean(row.description, 1200), styleEvidence:clean(row.styleEvidence,200), styles: row.styles.filter(v => typeof v === 'string').slice(0, 12), scenes: row.scenes.filter(v => typeof v === 'string').slice(0, 6), effects: row.effects.filter(v => typeof v === 'string').slice(0, 6), exploration: row.exploration, matchedItemIds: row.matchedItemIds, visualAnalysis: true });
  }
  return references;
}
module.exports = { createPhotoSearch, searchQueries, photoRecord, analyzedReferences, similarHash };
