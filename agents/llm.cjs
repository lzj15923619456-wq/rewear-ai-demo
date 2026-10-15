const error = (status, message) => Object.assign(new Error(message), { status });
function createLlm(config, fetcher = fetch) {
  const roles = ['main','item','reference','stylist','wardrobe','review'];
  function modelsFor(agent, vision) {
    const value = config['REWEAR_MODEL_' + agent.toUpperCase()] || (vision ? config.REWEAR_LLM_VISION_MODEL || config.REWEAR_LLM_MODEL : config.REWEAR_LLM_MODEL) || '';
    return [...new Set(value.split(',').map(v=>v.trim()).filter(Boolean))];
  }
  function endpointFor(agent) {
    const prefix = 'REWEAR_LLM_' + agent.toUpperCase();
    const ownBase = config[prefix + '_BASE_URL'];
    return { base: ownBase || config.REWEAR_LLM_BASE_URL,
      // Never send the shared provider's key to a different explicitly configured endpoint.
      key: config[prefix + '_API_KEY'] || (ownBase ? '' : config.REWEAR_LLM_API_KEY) };
  }
  const readyFor = agent => {
    const endpoint = endpointFor(agent);
    return Boolean(endpoint.base && endpoint.key && modelsFor(agent,['item','reference'].includes(agent)).length);
  };
  const configured = Object.fromEntries(roles.map(role=>[role,readyFor(role)]));
  const ready = configured.main && configured.stylist;
  async function call(prompt, payload, { agent = 'main', vision = false, signal, onFallback } = {}) {
    if (!roles.includes(agent) || !readyFor(agent)) throw error(503, '当前 Agent 模型未配置，将使用规则模式');
    const models = modelsFor(agent,vision);
    if(models.length>5)throw error(503,'每个 Agent 最多配置五个模型');
    const endpoint = endpointFor(agent);
    const base = new URL(endpoint.base);
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname);
    if (base.protocol !== 'https:' && !(base.protocol === 'http:' && local)) throw error(503, '模型地址须使用 HTTPS；本机代理可用 HTTP');
    if (base.username || base.password || base.search || base.hash) throw error(503, '模型基础地址格式不正确');
    const data = { ...payload }; delete data.imageUrl; delete data.imageCandidates;
    let content = JSON.stringify(data);
    if (content.length > 150000) throw error(413, '模型上下文过大');
    if (vision) {
      content = [{ type: 'text', text: content }];
      const images = payload.imageCandidates || [{ imageUrl: payload.imageUrl }];
      for (const image of images) {
        if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(image.imageUrl || '')) throw error(400, '视觉模型只接受后端处理的图片');
        if (image.referenceId) content.push({ type: 'text', text: 'referenceId=' + image.referenceId });
        content.push({ type: 'image_url', image_url: { url: image.imageUrl } });
      }
    }
    const timeout = AbortSignal.timeout(30000);
    for(let attempt=0;attempt<models.length;attempt++) {
      if(signal?.aborted)throw error(499,'任务已停止');
      const attemptTimeout=AbortSignal.timeout(Math.floor(30000/models.length));
      try {
        const kimi = ['api.moonshot.cn','api.moonshot.ai'].includes(base.hostname) && models[attempt] === 'kimi-k2.6';
        const qwen = /(?:maas|dashscope)\.aliyuncs\.com$/.test(base.hostname);
        const response = await fetcher(new URL(base.pathname.replace(/\/$/, '') + '/chat/completions', base), {
          method: 'POST', redirect: 'error', signal: AbortSignal.any([timeout,attemptTimeout,...(signal?[signal]:[])]),
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + endpoint.key },
          body: JSON.stringify({ model: models[attempt],
            messages: [{ role: 'system', content: prompt }, { role: 'user', content }],
            temperature: kimi ? 0.6 : 0.2,
            max_tokens: vision ? 1800 : 6500, response_format: { type: 'json_object' },
            // Interactive tasks have a 30-second budget; use supported non-thinking modes.
            ...(base.hostname === 'api.deepseek.com' || kimi ? { thinking: { type: 'disabled' } } : {}),
            ...(qwen ? { enable_thinking: false } : {}) })
        });
        if (!response.ok) throw Object.assign(error(502, response.status === 402 ? '模型服务账户余额不足，请检查对应服务的 API 额度' : response.status === 401 || response.status === 403 ? '模型授权失败，检查服务端配置' : response.status === 429 ? '模型服务达到频率或并发限制，请稍后重试' : '模型服务暂时不可用（HTTP '+response.status+'）'),{noFallback:[401,402,403].includes(response.status)});
        // Bound responses before parsing, including chunked responses without Content-Length.
        let raw = '', size = 0; const decoder = new TextDecoder();
        for await (const chunk of response.body) { size += chunk.length; if (size > 500000) throw error(502, '模型响应过大'); raw += decoder.decode(chunk, { stream: true }); }
        raw += decoder.decode();
        const reply = JSON.parse(raw), choice = reply.choices?.[0];
        if (!choice || choice.finish_reason !== 'stop') throw error(502, '模型输出未完整完成');
        // Accept an entire JSON code block, never extract JSON from arbitrary prose.
        const text=choice.message?.content;
        if(typeof text!=='string')throw error(502,'模型输出格式不正确');
        const fenced=/^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(text.trim());
        const value = JSON.parse(fenced ? fenced[1] : text);
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw error(502, '模型输出格式不正确');
        return value;
      } catch (cause) {
        if (signal?.aborted) throw error(499, '任务已停止');
        const failure=cause.status?cause:error(502,cause.name==='TimeoutError'?'模型请求超时':'模型返回格式不正确或连接失败');
        if(timeout.aborted)throw error(502,'当前 Agent 超过30秒');
        if(failure.noFallback||attempt===models.length-1)throw failure;
        onFallback?.({attempt:attempt+2,total:models.length,message:'首选或备选未完成，尝试下一备选模型（'+(attempt+2)+'/'+models.length+'）'});
      }
    }
  }
  return { ready, readyFor, configured, call };
}
module.exports = { createLlm };
