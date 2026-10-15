const prompts = require('./prompts.cjs');
module.exports = (llm, payload, context) => llm.call(prompts.item, payload, { agent:'item', vision: true, ...context });
