const prompts = require('./prompts.cjs');
module.exports = (llm, payload, context) => llm.call(payload.action === 'inspect_references' ? prompts.inspect : prompts.stylist, payload, { agent:payload.action==='inspect_references'?'reference':'stylist', vision: payload.action === 'inspect_references', ...context });
