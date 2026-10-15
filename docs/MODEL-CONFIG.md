# 模型与生产配置

最终组合依据 2026-10-16 的离线、开发／验证和封存评测选出。它是当前证据下的相对配置，不是对所有衣物或真实用户的通用质量保证。

| 角色变量 | 模型 ID | 专用连接 |
|---|---|---|
| `REWEAR_MODEL_MAIN` | `deepseek-flash` | 共享 DeepSeek |
| `REWEAR_MODEL_ITEM` | `qwen3.5-plus-2026-02-15` | `ITEM` 百炼 |
| `REWEAR_MODEL_REFERENCE` | `kimi-k2.6` | `REFERENCE` Kimi |
| `REWEAR_MODEL_STYLIST` | `qwen3.5-plus-2026-02-15` | `STYLIST` 百炼 |
| `REWEAR_MODEL_WARDROBE` | `deepseek-flash` | 共享 DeepSeek |
| `REWEAR_MODEL_REVIEW` | `deepseek-flash` | 共享 DeepSeek |

## 环境变量

本机：项目根目录 `.env.local`。线上：Render Dashboard → `rewear-ai-demo` → **Environment**。密钥不可提交 Git。

```dotenv
REWEAR_AI_PROVIDER=direct
REWEAR_LLM_BASE_URL=https://api.deepseek.com
REWEAR_LLM_API_KEY=
REWEAR_MODEL_MAIN=deepseek-flash
REWEAR_MODEL_ITEM=qwen3.5-plus-2026-02-15
REWEAR_MODEL_REFERENCE=kimi-k2.6
REWEAR_MODEL_STYLIST=qwen3.5-plus-2026-02-15
REWEAR_MODEL_WARDROBE=deepseek-flash
REWEAR_MODEL_REVIEW=deepseek-flash
REWEAR_LLM_ITEM_BASE_URL=
REWEAR_LLM_ITEM_API_KEY=
REWEAR_LLM_REFERENCE_BASE_URL=https://api.moonshot.cn/v1
REWEAR_LLM_REFERENCE_API_KEY=
REWEAR_LLM_STYLIST_BASE_URL=
REWEAR_LLM_STYLIST_API_KEY=
PHOTO_SEARCH_ENABLED=1
```

百炼基础地址使用控制台所示 OpenAI 兼容地域地址，填写到 `/v1`，不要追加 `/chat/completions`。单独配置角色地址时必须同时配置该角色 Key；代码不会把共享 DeepSeek Key 发给其他供应商。

## 固定参数

- 每项模型调用 30 秒；并发 1。
- 文本 `max_tokens=6500`，视觉 `max_tokens=1800`。
- DeepSeek／千问温度 0.2，Kimi 非思考温度 0.6。
- DeepSeek、Kimi、千问关闭思考；响应格式为 JSON Object。
- 生产每个角色只配置一个模型，不跨模型自动降级；错误、超时和非法 JSON 明确转规则模式。

## 运维检查

`GET /api/agent/status` 只返回角色是否配置，不返回地址或密钥。真实验收必须检查模型输出没有降级；仅看到 `configured=true` 不能证明余额、网络和响应质量正常。

已知限制：千问搭配在 30 秒上限下可能超时；实时检索可能取得图片但视觉核对全部拒绝；Kimi 参考核对相对最佳但仍受搜索候选质量约束；匿名偏好只保存在当前会话，免费 Render 重启会丢失临时数据。
