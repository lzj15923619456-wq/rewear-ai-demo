const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const sharp = require('sharp');

const slots = ['upper', 'bottom', 'shoes'];
const text = (value, max = 1000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const fail = (status, message) => Object.assign(new Error(message), { status });
function requireValue(condition, message) { if (!condition) throw fail(400, message); }
const list = (value, max = 20) => Array.isArray(value) ? value.slice(0, max).map(v => text(v, 80)).filter(Boolean) : [];
function optionalNumber(value, min, max) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  requireValue(Number.isFinite(number) && number >= min && number <= max, '个人信息数值超出范围');
  return number;
}
function normalizeRequirements(input) {
  requireValue(input && typeof input === 'object', '请提交搭配要求');
  const p = input.personal || {};
  const gender = p['性别'];
  requireValue(['女性', '男性', '其他'].includes(gender), '请选择性别');
  const age = optionalNumber(p['年龄'], 1, 120);
  requireValue(age === null || Number.isInteger(age), '年龄必须为整数');
  const exploration = optionalNumber(input.changeAmount, 0, 100);
  requireValue(exploration !== null, '请选择尝试程度');
  const scenes = list(input.scenes, 6), styles = list(input.styles, 12);
  requireValue(scenes.length && styles.length, '至少选择一个场景和一种风格');
  return {
    profile: { gender, age, heightCm: optionalNumber(p['身高（cm）'], 80, 230), weightKg: optionalNumber(p['体重（kg）'], 20, 250), bodyType: text(p['体型'], 40) || null },
    requirements: { scenes, styles, avoid: list(input.avoids, 6), exploration, styleReference: text(p['风格参考'], 80) || null, note: text(input.note) }
  };
}
function scoreReference(reference, requirements) {
  const styleHits = requirements.styles.filter(s => reference.styles.includes(s));
  const sceneHits = requirements.scenes.filter(s => reference.scenes.includes(s));
  const conflicts = requirements.avoid.filter(s => reference.effects.includes(s));
  const style = Math.round(40 * styleHits.length / requirements.styles.length);
  const scene = Math.round(30 * sceneHits.length / requirements.scenes.length);
  const degree = Math.round(20 * (1 - Math.abs(requirements.exploration - reference.exploration) / 100));
  const avoid = requirements.avoid.length ? Math.round(10 * (1 - conflicts.length / requirements.avoid.length)) : 10;
  return { percent: style + scene + degree + avoid, style, scene, degree, avoid, styleHits, sceneHits, conflicts };
}
function validateOutfits(result, candidates, lockedItems, count) {
  requireValue(result && typeof result === 'object', 'AI 返回了无效结果');
  if (result.status === 'needs_confirmation') return [];
  const rows = result.outfits;
  if (!Array.isArray(rows)) throw fail(502, 'AI 返回的方案格式不正确');
  if (rows.length > count) throw fail(502, 'AI 返回数量超出请求范围');
  const seen = new Set();
  return rows.map(row => {
    const reference = candidates.find(c => c.id === row.referenceId);
    if (!reference || seen.has(reference.id)) throw fail(502, 'AI 引用了无效或重复的参考图片');
    seen.add(reference.id);
    const locked = list(row.lockedItemIds, 3);
    if (lockedItems.some(item => !locked.includes(item.itemId))) throw fail(502, 'AI 未保留全部录入单品，请重试');
    if (!text(row.title, 80) || !text(row.reason, 1500) || !Array.isArray(row.items)) throw fail(502, 'AI 方案缺少必要字段');
    const used = new Set();
    const suggestions = row.items.map(item => {
      if (!['upper', 'top', 'bottom', 'shoes', 'bag'].includes(item.id) || used.has(item.id)) throw fail(502, 'AI 单品分类无效或重复');
      used.add(item.id);
      return { id: item.id, name: text(item.name, 80), role: item.id === 'bag' ? '可选' : '核心', tip: text(item.tip, 600), color: '#777777' };
    });
    if (suggestions.some(item => !item.name)) throw fail(502, 'AI 单品名称为空');
    // Uploaded clothing is authoritative; the model cannot replace or rename it.
    const items = [...lockedItems.map(item => ({ id: item.slot, name: item.name, role: '核心', tip: '保留这件已确认的衣物。', color: '#777777', itemId: item.itemId })), ...suggestions.filter(item => !lockedItems.some(own => own.slot === item.id))];
    return { reference, title: text(row.title, 80), subtitle: text(row.subtitle, 150), style: text(row.style, 80) || reference.styles[0], reason: text(row.reason, 1500), difference: text(row.difference, 1500), keep: text(row.keep, 800), avoid: text(row.avoid, 800), items };
  });
}
async function decodeImage(dataUrl) {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  requireValue(match, '仅支持 JPG、PNG 和 WEBP 图片');
  const bytes = Buffer.from(match[2], 'base64');
  requireValue(bytes.length > 0 && bytes.length <= 8 * 1024 * 1024, '每张图片最大 8 MB');
  try {
    const metadata = await sharp(bytes, { limitInputPixels: 25000000 }).metadata();
    requireValue(['jpeg', 'png', 'webp'].includes(metadata.format) && metadata.width >= 32 && metadata.height >= 32, '图片格式或尺寸无效');
    return await sharp(bytes, { limitInputPixels: 25000000 }).rotate().resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  } catch (error) { throw fail(400, error.status ? error.message : '图片无法解码，请重新选择'); }
}

function createApi(options = {}) {
  const config = options.config || process.env;
  const dataDir = options.dataDir || path.resolve(__dirname, config.DATA_DIR || 'storage');
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'rewear.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS quota (key TEXT PRIMARY KEY, count INTEGER NOT NULL);');
  const references = options.references || JSON.parse(fs.readFileSync(path.join(__dirname, 'references.json'), 'utf8'));
  const busy = new Set();
  const read = id => JSON.parse(db.prepare('SELECT data FROM users WHERE id=?').get(id)?.data || '{"items":[],"outfits":[],"plans":[]}');
  const write = (id, data) => db.prepare('INSERT INTO users VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(id, JSON.stringify(data));
  const ready = kind => Boolean(config[`COZE_${kind}_BASE_URL`] && config[`COZE_${kind}_TOKEN`]);
  const fetcher = options.fetch || fetch;
  async function run(kind, payload) {
    if (!ready(kind)) throw fail(503, 'Coze 工作流尚未配置完成，请稍后重试');
    const base = new URL(config[`COZE_${kind}_BASE_URL`]);
    if (base.protocol !== 'https:' && !options.allowHttp) throw fail(503, '工作流地址必须使用 HTTPS');
    try {
      const response = await fetcher(new URL('/run', base), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config[`COZE_${kind}_TOKEN`]}` }, body: JSON.stringify(payload), signal: AbortSignal.timeout(65000), redirect: 'error' });
      if (!response.ok) throw fail(502, response.status === 401 || response.status === 403 ? 'Coze 授权失败，请检查后端配置' : 'Coze 暂时无法完成请求，请重试');
      const raw = await response.text();
      if (raw.length > 250000) throw fail(502, '工作流结果过大');
      const result = JSON.parse(raw);
      const output = result?.result || result?.output || result;
      if (!output || typeof output !== 'object' || Array.isArray(output)) throw fail(502, '工作流返回格式不正确');
      if (output.status === 'error') throw fail(502, output.warnings?.includes('invalid_model_output') ? 'AI 返回格式不正确，本次结果未保存，请重试' : '工作流未能完成本次请求');
      return output;
    } catch (error) {
      if (error.status) throw error;
      throw fail(502, error.name === 'TimeoutError' ? 'AI 请求超时，请稍后重试' : '工作流响应无效或连接失败');
    }
  }
  function quota(user, ip) {
    const day = new Date().toISOString().slice(0, 10);
    const ipHash = crypto.createHash('sha256').update(ip || 'local').digest('hex').slice(0, 20);
    const limits = [[`${day}:user:${user}`, Number(config.AI_USER_DAILY_LIMIT) || 12], [`${day}:ip:${ipHash}`, 24], [`${day}:all`, Number(config.AI_GLOBAL_DAILY_LIMIT) || 60]];
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const [key, limit] of limits) {
        const count = db.prepare('SELECT count FROM quota WHERE key=?').get(key)?.count || 0;
        if (count >= limit) throw fail(429, '今天的 AI 体验额度已用完，请明天再试');
      }
      for (const [key] of limits) db.prepare('INSERT INTO quota VALUES (?,1) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(body)); };
  async function body(req) {
    requireValue((req.headers['content-type'] || '').startsWith('application/json'), '请求必须使用 JSON');
    let raw = '', size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 12 * 1024 * 1024) throw fail(413, '请求过大'); raw += chunk; }
    try { return JSON.parse(raw); } catch { throw fail(400, '请求 JSON 无效'); }
  }
  async function handle(req, res, pathname) {
    if (!pathname.startsWith('/api/')) return false;
    try {
      const origin = req.headers.origin;
      const expectedOrigin = config.PUBLIC_ORIGIN || `http://${req.headers.host}`;
      if (origin && origin !== expectedOrigin || !['GET', 'HEAD'].includes(req.method) && config.PUBLIC_ORIGIN && origin !== expectedOrigin) throw fail(403, '请求来源不被允许');
      let user = /(?:^|;\s*)rewear_session=([a-f0-9]{48})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
      if (!user || !db.prepare('SELECT id FROM users WHERE id=?').get(user)) {
        user = crypto.randomBytes(24).toString('hex');
        write(user, { items: [], outfits: [], plans: [] });
        res.setHeader('Set-Cookie', `rewear_session=${user}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${expectedOrigin.startsWith('https:') ? '; Secure' : ''}`);
      }
      const data = read(user);
      if (pathname === '/api/status' && req.method === 'GET') {
        send(res, 200, { analyzeReady: ready('ANALYZE'), stylistReady: ready('STYLIST'), referenceCount: references.length, mode: 'coze', identity: 'anonymous-session', uploadProcessing: 'coze', storage: 'sqlite' }); return true;
      }
      if (pathname === '/api/records' && req.method === 'GET') {
        send(res, 200, { plans: data.plans, items: data.items.map(({ imageData, ...item }) => item), outfits: data.outfits }); return true;
      }
      if (pathname.startsWith('/api/items/') && pathname.endsWith('/image') && req.method === 'GET') {
        const item = data.items.find(i => i.itemId === pathname.split('/')[3]);
        if (!item) throw fail(404, '衣物不存在');
        const bytes = Buffer.from(item.imageData, 'base64');
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(bytes); return true;
      }
      if (req.method === 'GET') throw fail(404, '接口不存在');
      const input = await body(req);
      if (pathname === '/api/items' && req.method === 'POST') {
        if (busy.has(user)) throw fail(409, '上一项 AI 任务还在处理中');
        requireValue(slots.includes(input.slot), '衣物类别无效');
        if (!ready('ANALYZE') && !input.sample) throw fail(503, '识别工作流尚未配置');
        if (data.items.length >= 60) throw fail(409, '衣柜已达到本次 Demo 的保存上限');
        const image = input.sample ? await sharp(path.join(__dirname, 'dist/assets/reference-commons-denim.jpg')).resize({ width: 1000, withoutEnlargement: true }).jpeg().toBuffer() : await decodeImage(input.imageData);
        requireValue(!input.sample || input.slot === 'upper', '示例仅支持上衣');
        const itemId = crypto.randomUUID();
        let result;
        if (input.sample) result = { status: 'needs_confirmation', suggestedName: '黑色宽松西装', attributes: { slot: 'upper', subtype: 'blazer', layer: 'outer', colors: ['black'], fit: 'relaxed', material: null }, uncertainFields: ['material'], warnings: ['示例衣物属性由人工标注'] };
        else {
          busy.add(user);
          try { quota(user, req.socket.remoteAddress); result = await run('ANALYZE', { payload: { schemaVersion: 1, requestId: crypto.randomUUID(), action:'analyze', itemId, slot: input.slot, imageUrl: 'data:image/jpeg;base64,' + image.toString('base64'), userLabel: text(input.name, 80) } }); }
          finally { busy.delete(user); }
        }
        if (result.status !== 'needs_confirmation' || !result.attributes || !slots.includes(result.attributes.slot)) throw fail(422, '无法可靠识别这张衣物图片，请换一张清晰单品照片');
        const item = { itemId, slot: input.slot, name: text(result.suggestedName, 80) || text(input.name, 80) || '我的衣物', attributes: { slot: result.attributes.slot, subtype: text(result.attributes.subtype, 60) || null, layer: text(result.attributes.layer, 30) || null, colors: list(result.attributes.colors, 5), fit: text(result.attributes.fit, 50) || null, material: text(result.attributes.material, 80) || null }, uncertainFields: list(result.uncertainFields), warnings: list(result.warnings), confirmed: false, imageData: image.toString('base64'), image: `/api/items/${itemId}/image`, sample: Boolean(input.sample) };
        const latest = read(user); latest.items.push(item); write(user, latest);
        const { imageData, ...publicItem } = item; send(res, 201, publicItem); return true;
      }
      if (pathname.startsWith('/api/items/') && req.method === 'PATCH') {
        const item = data.items.find(i => i.itemId === pathname.split('/')[3]);
        if (!item) throw fail(404, '衣物不存在');
        requireValue(text(input.name, 80), '请输入单品名称');
        if (input.attributes) {
          requireValue(slots.includes(input.attributes.slot), '请确认衣物类别');
          item.slot = input.attributes.slot;
          item.attributes = { ...item.attributes, slot: item.slot, subtype: text(input.attributes.subtype, 60) || null, colors: list(input.attributes.colors, 5), fit: text(input.attributes.fit, 50) || null };
        }
        requireValue(item.slot === item.attributes.slot, '图片识别类别与录入类别不同，请确认分类');
        item.name = text(input.name, 80); item.confirmed = true; write(user, data);
        const { imageData, ...publicItem } = item; send(res, 200, publicItem); return true;
      }
      if (pathname === '/api/recommendations' && req.method === 'POST') {
        if (!ready('STYLIST')) throw fail(503, '规划工作流尚未配置');
        if (busy.has(user)) throw fail(409, '上一项 AI 任务还在处理中');
        const request = normalizeRequirements(input.requirements);
        const itemIds = list(input.itemIds, 4);
        requireValue(itemIds.length >= 1 && itemIds.length <= 3 && new Set(itemIds).size === itemIds.length, '请录入 1–3 件不同单品');
        const lockedItems = itemIds.map(id => data.items.find(i => i.itemId === id && i.confirmed));
        requireValue(lockedItems.every(Boolean) && new Set(lockedItems.map(i => i.slot)).size === lockedItems.length, '请先确认所有单品，每类最多一件');
        const exclude = list(input.excludeReferenceIds, 80);
        let candidates = references.filter(ref => !exclude.includes(ref.id) && !(request.requirements.avoid.includes('不想露肤') && ref.effects.includes('不想露肤')));
        // ponytail: first release's photo index covers black blazers; expand verified garment tags before widening this gate.
        const upper = lockedItems.find(i => i.slot === 'upper');
        if (request.profile.gender !== '女性' || upper && (!/blazer|西装|西服/.test(upper.attributes.subtype || '') || !upper.attributes.colors.some(c => ['black', '黑色', '黑'].includes(c)))) candidates = [];
        candidates.sort((a, b) => scoreReference(b, request.requirements).percent - scoreReference(a, request.requirements).percent);
        candidates = candidates.slice(0, 24);
        if (!candidates.length) { send(res, 200, { status: 'insufficient_references', outfits: [], warnings: ['当前真实图库没有适配这些条件的参考，请调整条件或等待图库扩充。'] }); return true; }
        const count = Math.min(6, candidates.length);
        busy.add(user);
        try {
          quota(user, req.socket.remoteAddress);
          const snapshot = { ...request, lockedItems: lockedItems.map(i => ({ itemId: i.itemId, slot: i.slot, name: i.name, ...i.attributes })) };
          const payload = { schemaVersion: 1, requestId: crypto.randomUUID(), action: 'recommend', ...snapshot, referenceCandidates: candidates.map(({ id, styles, scenes, exploration, effects, description }) => ({ referenceId: id, styles, scenes, exploration, effects, description })), count };
          const result = await run('STYLIST', { payload });
          const rows = validateOutfits(result, candidates, lockedItems, count);
          const generated = rows.map(row => ({ id: crypto.randomUUID(), referenceId: row.reference.id, ai: true, version: 1, tag: 'REWEAR / AI', title: row.title, subtitle: row.subtitle, style: row.style, reason: row.reason, difference: row.difference || '真实参考照片未换成你的衣物，请以保留单品和搭配清单为准。', keep: row.keep, avoid: row.avoid, items: row.items, image: row.reference.image, sourceUrl: row.reference.sourceUrl, credit: row.reference.credit, license: row.reference.license, licenseUrl: row.reference.licenseUrl, match: scoreReference(row.reference, request.requirements), requirementsSnapshot: snapshot, lockedItemIds: itemIds, inputItems: lockedItems.map(({ imageData, ...i }) => i) }));
          const latest = read(user); latest.outfits.push(...generated); latest.outfits = latest.outfits.slice(-120); write(user, latest);
          const status = (!result.status || result.status === 'completed') && generated.length < 6 ? 'insufficient_references' : result.status || 'completed';
          const warnings = list(result.warnings);
          if (generated.length > 0 && generated.length < 6) warnings.push(`当前条件下本轮提供 ${generated.length} 套真实参考方案，不足六套时不会重复凑数。`);
          send(res, 200, { status, outfits: generated, questions: list(result.questions), warnings, requirementsSnapshot: snapshot });
        } finally { busy.delete(user); }
        return true;
      }
      const outfitRoute = /^\/api\/outfits\/([^/]+)\/(questions|revisions)$/.exec(pathname);
      if (outfitRoute && req.method === 'POST') {
        if (busy.has(user)) throw fail(409, '上一项 AI 任务还在处理中');
        const outfit = data.outfits.find(o => o.id === outfitRoute[1]);
        if (!outfit) throw fail(404, '方案不存在');
        const action = outfitRoute[2] === 'questions' ? 'answer' : 'revise';
        const message = text(input.question || input.note);
        requireValue(message, '请填写问题或调整要求');
        if (action === 'revise' && input.version !== outfit.version) throw fail(409, '方案已更新，请重新打开再调整');
        const keep = list(input.keepIds, 5);
        requireValue(keep.every(id => outfit.items.some(i => i.id === id)), '保留位置无效');
        const replacement = input.replacementItemId ? data.items.find(i => i.itemId === input.replacementItemId && i.confirmed) : null;
        requireValue(!input.replacementItemId || replacement, '请先确认替换衣物');
        const lockIds = new Set([...outfit.requirementsSnapshot.lockedItems.map(i=>i.slot), ...keep]);
        if (replacement) {
          requireValue(outfit.items.some(i=>i.id===input.replaceSlot) && !lockIds.has(input.replaceSlot), '替换位置不存在或已锁定');
          requireValue(replacement.slot === (input.replaceSlot === 'top' ? 'upper' : input.replaceSlot), '替换衣物类别不一致');
        }
        busy.add(user);
        try {
          quota(user, req.socket.remoteAddress);
          const payload = { schemaVersion: 1, requestId: crypto.randomUUID(), action, ...outfit.requirementsSnapshot, originalOutfit: outfit, question: action === 'answer' ? message : null, revision: action === 'revise' ? { note: message, keepIds: keep, replacement: replacement ? { itemId: replacement.itemId, slot: replacement.slot, name: replacement.name, attributes: replacement.attributes } : null } : null };
          const result = await run('STYLIST', { payload });
          if (action === 'answer') { requireValue(text(result.answer, 3000), 'AI 未返回回答'); send(res, 200, { answer: text(result.answer, 3000) }); }
          else {
            const candidate = references.filter(ref => ref.id === outfit.referenceId);
            const lockedItems = outfit.requirementsSnapshot.lockedItems;
            const rows = validateOutfits(result, candidate, lockedItems, 1);
            requireValue(rows.length === 1, 'AI 未返回有效调整');
            const next = rows[0];
            const keepIds = new Set([...lockedItems.map(i => i.slot), ...keep]);
            next.items = next.items.map(i => keepIds.has(i.id) ? outfit.items.find(old => old.id === i.id) || i : i);
            for (const old of outfit.items) if (keepIds.has(old.id) && !next.items.some(i=>i.id===old.id)) next.items.push(old);
            if (replacement) {
              requireValue(slots.includes(input.replaceSlot) || input.replaceSlot === 'top' || input.replaceSlot === 'bag', '替换位置无效');
              requireValue(!keepIds.has(input.replaceSlot), '已锁定单品不能被替换');
              const target = next.items.find(i => i.id === input.replaceSlot);
              requireValue(target, '替换位置不存在');
              target.name = replacement.name; target.itemId = replacement.itemId;
            }
            const updated = { ...outfit, ...Object.fromEntries(['title','subtitle','style','reason','difference','keep','avoid','items'].map(k => [k,next[k]])), version: outfit.version + 1 };
            const latest = read(user), index = latest.outfits.findIndex(o => o.id === outfit.id);
            if (latest.outfits[index]?.version !== input.version) throw fail(409, '方案已更新，请重新打开');
            latest.outfits[index] = updated; write(user, latest); send(res, 200, { outfit: updated });
          }
        } finally { busy.delete(user); }
        return true;
      }
      if (pathname === '/api/plans' && req.method === 'POST') {
        const outfit = data.outfits.find(o => o.id === input.outfitId);
        requireValue(outfit, '方案不存在');
        const owned = input.owned || {};
        const items = outfit.items.map(i => ({ ...i, status: outfit.lockedItemIds.includes(i.itemId) ? 'owned' : ['owned','missing','skip','replaced'].includes(owned[i.id]) ? owned[i.id] : i.role === '可选' ? 'skip' : 'missing' }));
        const {profile,requirements:r}=outfit.requirementsSnapshot;
        const plan = { id: crypto.randomUUID(), outfitId: outfit.id, title: outfit.title, date: new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }), scene: r.scenes.join('、'), ...r, avoids:r.avoid, changeAmount:r.exploration,change:r.exploration<34?'贴近日常':r.exploration<67?'稍作尝试':'大胆尝试',personal:{'性别':profile.gender,'年龄':profile.age??'','身高（cm）':profile.heightCm??'','体重（kg）':profile.weightKg??'','体型':profile.bodyType??''}, item: outfit.inputItems.map(i => i.name).join('、'), items, outfit: structuredClone(outfit), sourceUrl: outfit.sourceUrl, feedback: null };
        data.plans.unshift(plan); data.plans = data.plans.slice(0, 100); write(user, data); send(res, 201, { plan }); return true;
      }
      if (/^\/api\/plans\/[^/]+\/feedback$/.test(pathname) && req.method === 'POST') {
        const plan = data.plans.find(p => p.id === pathname.split('/')[3]);
        if (!plan) throw fail(404, '计划不存在');
        requireValue(typeof input.worn === 'boolean', '穿着状态无效');
        plan.feedback = { worn: input.worn, satisfaction: input.worn ? text(input.satisfaction, 80) : null, reason: !input.worn ? text(input.reason, 80) : null, note: text(input.note) };
        write(user, data); send(res, 200, { feedback: plan.feedback }); return true;
      }
      throw fail(404, '接口不存在');
    } catch (error) { send(res, error.status || 500, { error: error.status ? error.message : '服务暂时异常，请稍后重试' }); }
    return true;
  }
  return { handle, close: () => db.close(), run };
}
module.exports = { createApi, normalizeRequirements, scoreReference, validateOutfits, decodeImage };
