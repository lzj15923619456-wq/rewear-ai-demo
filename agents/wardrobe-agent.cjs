const prompts = require('./prompts.cjs');
module.exports = (llm, payload, context) => llm.call(prompts.wardrobe, payload, { agent:'wardrobe', ...context });
