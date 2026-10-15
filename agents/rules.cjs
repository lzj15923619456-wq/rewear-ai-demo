// Rule mode never treats an uninspected internet photo as a verified outfit.
function ruleResult(payload) {
  const warnings = ['规则模式：未由大模型分析自由描述或身形，仅提供可核对的参考与清单。'];
  if (payload.action === 'analyze') return { status: 'needs_confirmation', mode: 'rules', suggestedName: payload.userLabel || '我的衣物', attributes: { slot: payload.slot, subtype: null, colors: [], fit: null, material: null, layer: null }, uncertainFields: ['subtype', 'colors', 'fit', 'material'], warnings: ['识别未完成，请手动填写并确认衣物属性。'] };
  if (payload.action === 'answer') return { status: 'completed', mode: 'rules', answer: '规则模式：当前清单为' + payload.originalOutfit.items.map(i => i.name).join('、') + '。参考照片未替换成你的衣物；尺码和舒适度需实际核对。暂不能理解并回答新的自由问题。', warnings };
  if (payload.action === 'revise') {
    const o = payload.originalOutfit;
    return { status: 'completed', mode: 'rules', warnings: [...warnings, '保留原方案；未进行自由要求的智能调整。'], outfits: [{ ...o, lockedItemIds: payload.lockedItems.map(i => i.itemId), reason: o.reason, difference: '规则模式：清单保留原方案；指定的已确认同类替换由后端应用，尚未智能评估。参考照片未改变。' }] };
  }
  if (payload.action === 'inspect_references') return { status: 'insufficient_references', mode: 'rules', references: [], warnings: ['视觉核对不可用，本轮网络候选未用于推荐。'] };
  // Partial photo annotations cannot prove that an outfit checklist is complete.
  const outfits = (payload.referenceCandidates || []).filter(ref => ['bottom','shoes'].every(slot => payload.lockedItems.some(i => i.slot === slot) || ref.garments?.some(g => g.slot === slot))).slice(0, payload.count).map(ref => {
    const names = { blazer: '西装', jeans: '牛仔裤', trousers: '裤装', skirt: '半裙', romper: '连体裤', 'short romper':'短连体裤', 'platform heels':'厚底高跟鞋', 'pointed flats':'尖头平底鞋', dress: '连衣裙', heels: '高跟鞋', sneakers: '运动鞋', sandals: '凉鞋', boots: '靴子', shoes: '鞋履', bag: '包袋' };
    const colors = { black: '黑色', white: '白色', blue: '蓝色', brown: '棕色', grey: '灰色', beige: '米色' };
    const items = (ref.garments || []).filter(g => ['upper', 'bottom', 'shoes', 'bag'].includes(g.slot)).map(g => ({ id: g.slot, name: (g.colors || []).map(c => colors[c] || c).join('、') + (names[g.subtype] || g.subtype || '参考单品'), tip: '按真实参考核对衣柜；实际版型和尺码需试穿。' }));
    return { referenceId: ref.referenceId, lockedItemIds: payload.lockedItems.map(i => i.itemId), title: '按参考搭配已有单品', subtitle: ref.styles?.[0] || '规则参考', style: ref.styles?.[0] || '基础搭配', reason: '按已选择的风格、场景和尝试程度排序；未进行个性化模型分析。', difference: ref.description + '。你的锁定单品以实际清单为准，照片未合成。', keep: '保留已确认的录入单品。', avoid: '核对照片差异和实际穿着舒适度。', items };
  });
  return { status: outfits.length ? 'completed' : 'insufficient_references', mode: 'rules', outfits, questions: [], warnings };
}
module.exports = { ruleResult };
