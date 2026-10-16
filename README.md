# REWEAR · 多 Agent 衣橱搭配 Demo

REWEAR 从用户已有衣物出发，完成单品识别、真实参考图检索与视觉核对、搭配推荐、衣柜局部修改、穿着复盘和经用户确认的偏好记忆。

- 在线 Demo：https://rewear-ai-demo.onrender.com/
- GitHub：https://github.com/lzj15923619456-wq/rewear-ai-demo

本项目的模型组合依据独立的离线、开发／验证和封存评测选出。评测证明的是当前数据与约束下的相对选择，不代表已经适用于所有衣物、审美或真实用户场景。

## 最终模型组合

| 角色 | 生产模型 | 服务商 | 输入 |
|---|---|---|---|
| 主 Agent：需求整理与总结 | `deepseek-flash` | DeepSeek | 文本 |
| 单品识别 | `qwen3.5-plus-2026-02-15` | 阿里云百炼 | 文本、图片 |
| 参考图核对 | `kimi-k2.6` | Moonshot / Kimi | 文本、图片 |
| 搭配推荐 | `qwen3.5-plus-2026-02-15` | 阿里云百炼 | 文本 |
| 衣柜问答与局部修改 | `deepseek-flash` | DeepSeek | 文本 |
| 穿着复盘与偏好提取 | `deepseek-flash` | DeepSeek | 文本 |

参数保持评测口径：并发 1、每项任务 30 秒、文本 `max_tokens=6500`、视觉 `max_tokens=1800`、温度 0.2；Kimi 非思考模式温度 0.6；DeepSeek、Kimi 和千问关闭思考；要求 JSON Object。生产不配置跨模型自动降级，失败会明确进入规则模式。

当前已知限制：单品识别绝对通过率仍低；联网检索和视觉接受率受授权图片、搜索词及照片质量影响；完整流程封存样本有限；搭配审美存在主观性；免费 Render 的冷启动与临时存储会影响速度和数据持久性。

## 本机运行

需要 Node.js 24.x、pnpm 11.25.0。

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm start
```

打开 `http://127.0.0.1:4174/iphone-preview.html`。真实模型测试会产生用量：

```sh
node scripts/test-live-ai.cjs --run --image 你有权使用的清晰单品照片路径 --slot upper
node scripts/test-live-ai.cjs --run --network --image 你有权使用的清晰单品照片路径 --slot upper
```

## 私密配置

复制 `.env.example` 为 `.env.local`。密钥只保存在本机 `.env.local` 或 Render 服务的 **Environment** 页面；不要写入源码、日志、截图或 Git。

必须配置：

- `REWEAR_LLM_API_KEY`：DeepSeek Key。
- `REWEAR_LLM_ITEM_BASE_URL`、`REWEAR_LLM_ITEM_API_KEY`：百炼 OpenAI 兼容地址与 Key。
- `REWEAR_LLM_REFERENCE_BASE_URL`、`REWEAR_LLM_REFERENCE_API_KEY`：Kimi 地址与 Key。
- `REWEAR_LLM_STYLIST_BASE_URL`、`REWEAR_LLM_STYLIST_API_KEY`：百炼 OpenAI 兼容地址与 Key。

模型 ID、非私密参数和全部变量见 [模型与生产配置](docs/MODEL-CONFIG.md)。服务端会把上传图片压缩为 JPEG Base64 后发给视觉模型；搜索服务只收到衣物类别、颜色、场景与风格标签，不接收个人身材或自由备注。

## 实际编排

后端按固定流程调度角色与工具，不把它描述为模型自由规划：

1. 用户上传单品，识别 Agent 给出属性，用户确认后保存。
2. 主 Agent 整理需求；硬条件不清楚时先追问。
3. 后端先检索 Openverse 中许可明确的多来源图片并去重、缓存；候选不足且配置 `UNSPLASH_ACCESS_KEY` 时，再调用 Unsplash 兜底。搜索只接收衣物、颜色、风格和场景词，不接收个人资料或自由备注；Unsplash 图片按其要求从官方 CDN 展示并保留作者、来源和许可链接。
4. 参考图 Agent 核对锁定衣物、完整穿搭和参考价值。
5. 搭配 Agent 只使用通过核对的候选 ID；后端再次验证 ID、锁定衣物和数量。
6. 衣柜 Agent 回答问题或局部修改；需要确认时保留原方案和记忆。
7. 复盘 Agent 只提出偏好候选；用户点击确认后才写入当前匿名会话记忆。

模型不可用时页面会明确显示规则降级。规则结果不算真实 AI 成功；无合格参考时返回不足，不重复图片凑数。

## 验证范围与资料

`pnpm test` 覆盖六角色路由、各供应商请求参数、联网图片安全与去重、锁定项、衣柜版本、追问保留、记忆确认、会话隔离和前端转义。生产迁移证据见 [生产迁移与验证记录](docs/PRODUCTION-MIGRATION-2026-10-16.md)，架构见 [多 Agent 架构](docs/MULTI-AGENT.md)。

评测原始数据和封存结果保留在本机独立评测目录，没有复制进生产仓库；生产迁移没有修改冻结金标、评分或封存指纹。

## 部署

仓库包含 `render.yaml`。Render 服务使用 `pnpm install --prod --frozen-lockfile` 和 `node server.cjs`，健康检查为 `/__rewear_health`。推送 `main` 后由现有服务自动部署；私密变量需在 Render Dashboard → `rewear-ai-demo` → **Environment** 设置。

免费实例使用 `/tmp/rewear-demo`，重启或重新部署可能丢失匿名记录、上传图片和缓存。中国大陆访问受运营商、跨境网络和 Render 可用性影响，需用关闭代理的移动网络做发布后实测。
