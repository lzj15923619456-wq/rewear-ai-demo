const prompts = require('./prompts.cjs');
module.exports = async (llm, payload, context) => {
  const result = await llm.call(prompts.review, payload, { agent:'review', ...context });
  if (typeof result.summary !== 'string' || !Array.isArray(result.preferences) || result.preferences.some(p => typeof p !== 'string')) throw Object.assign(new Error('复盘结果格式不正确'), { status: 502 });
  return { summary: result.summary.slice(0, 800), preferences: result.preferences.slice(0, 5).map(p => p.slice(0, 200)), mode: 'ai' };
};
