const { createLlm } = require('./llm.cjs');
const prompts = require('./prompts.cjs');
const item = require('./item-agent.cjs'), stylist = require('./stylist-agent.cjs');
const wardrobe = require('./wardrobe-agent.cjs'), review = require('./review-agent.cjs');
const names = { main: '再穿主理人', item: '单品识别 Agent', reference: '参考图核对 Agent', stylist: '搭配推荐 Agent', wardrobe: '衣柜落地 Agent', review: '穿着复盘 Agent' };
function createAgents(config, fetcher) {
  const llm = createLlm(config, fetcher);
  async function execute(agent, task, context = {}) {
    const emit = context.emit || (() => {});
    emit({ agent, type: 'start', data: { message: names[agent] + '开始处理', mode: llm.readyFor(agent) ? 'ai' : 'rules' } });
    try {
      if (context.signal?.aborted) throw Object.assign(new Error('任务已停止'), { status: 499 });
      const result = await task();
      emit({ agent, type: 'done', data: { message: names[agent] + '完成', mode: result.mode || 'ai' } });
      return result;
    } catch (error) { emit({ agent, type: 'error', data: { message: error.message } }); throw error; }
  }
  const callContext=(agent,context)=>({signal:context.signal,onFallback:data=>context.emit?.({agent,type:'log',data})});
  async function prepare(payload, context = {}) {
    return execute('main', async () => {
      if (!llm.readyFor('main')) return { status: 'completed', summary: '规则模式：按已确认单品与标签排序参考，不分析身体信息和自由描述。', constraints: [], questions: [], mode: 'rules' };
      const result = await llm.call(prompts.main, payload, { agent:'main', ...callContext('main',context) });
      if (!['completed', 'needs_confirmation'].includes(result.status) || typeof result.summary !== 'string' || !Array.isArray(result.constraints) || !Array.isArray(result.questions) || [...result.constraints, ...result.questions].some(v => typeof v !== 'string') || result.status === 'needs_confirmation' && !result.questions.length) throw Object.assign(new Error('主理人返回格式不正确'), { status: 502 });
      return { status: result.status, summary: result.summary.slice(0, 1000), constraints: result.constraints.slice(0, 12).map(v => v.slice(0, 200)), questions: result.questions.slice(0, 5).map(v => v.slice(0, 300)), mode: 'ai' };
    }, context);
  }
  async function run(payload, context = {}) {
    const agent = payload.action === 'analyze' ? 'item' : payload.action === 'inspect_references' ? 'reference' : ['answer', 'revise'].includes(payload.action) ? 'wardrobe' : payload.action === 'review' ? 'review' : 'stylist';
    const task = payload.action === 'inspect_references' ? stylist : { item, stylist, wardrobe, review }[agent];
    return execute(agent, async () => ({ ...await task(llm, payload, callContext(agent,context)), mode: 'ai' }), context);
  }
  async function summarize(payload, context = {}) {
    return execute('main', async()=>{
      const result=await llm.call(prompts.summary,payload,{agent:'main',...callContext('main',context)});
      if(typeof result.summary!=='string'||!result.summary.trim())throw Object.assign(new Error('主理人总结格式不正确'),{status:502});
      return {summary:result.summary.slice(0,1000),mode:'ai'};
    },context);
  }
  return { ready: llm.ready, readyFor:llm.readyFor, configured:llm.configured, prepare, run, summarize, names };
}
module.exports = { createAgents };
