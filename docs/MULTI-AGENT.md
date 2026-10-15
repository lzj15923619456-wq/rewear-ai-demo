# 2026-10-10 多 Agent 改造

依据用户提供的 REWEAR_多_Agent_改造_7d4cbde7.plan.md，适配当前已有后端与联网检索的版本。保留原版资源与排列，不退回旧静态工程。使用本机 Windows 工作目录，未使用文档中的示例 macOS 路径。

## 接口与文件

- GET /api/agent/status：只返回配置状态、模式、Agent 名称，不泄露地址或密钥。ready 只证明配置存在，不证明服务可调用。
- POST /api/agent/run：与现有推荐接口共享参数 itemIds、requirements、excludeReferenceIds。返回 application/x-ndjson，每行 {agent,type:start|log|done|error,data}；最终 done 的 data.result 为完整校验后的结果，最终 error 带 final=true。中间模型错误可以降级，不等同最终失败。
- POST /api/agent/task：task=answer/revise/replacement 配 outfitId，review 配 planId；参数沿用原有问答、修改、反馈接口。只访问当前会话记录，未知任务在调用模型前拒绝。
- POST /api/agent/memory：用户明确确认的 preferences（最多5条，每条200字以内）；空数组清除偏好。
- 原有 /api/items、/api/recommendations、/api/outfits、/api/plans、/api/records 兼容保留。
- agents/：llm.cjs、orchestrator.cjs、四个专业 Agent、prompts.cjs、rules.cjs。
- dist/agents.js、agents.css：注册表、过程页、NDJSON 解码、取消、确认记忆和模式标识；ai.js 负责接入现有界面。navigation/ 未改，也无需重建动画组件。

## 控制与可靠性

主理人处理任务摘要、约束与冲突，并给搭配推荐 Agent 上下文。专业 Agent 使用独立系统提示与同一个后端模型客户端；新单品和新网络参考使用单品识别 Agent 的视觉型号，搭配型号可仅支持文字。本版是受限专业编排，不宣称通用自主规划。上限：每项任务30秒、参考最多12张（每批6张、最多2批顺序核对）、方案最多6套。成功批次单独保留，失败原因如实显示；网页整个协作流程上限5分钟。Openverse 只检索 StockSnap/Wikimedia 有许可的摄影，查询必须含衣物类别和 fashion/outfit，结果元数据也须含穿搭标签；不再用泛生活照片补数量。Kimi 再检查主色/类别、至少两类可见服装、搭配亮点及干净构图，要求 referenceQuality=fashion 与具体 styleEvidence，通过后把亮点传给搭配 Agent。提示词不以人物长相或身材评审美；夜市/工作记录、随机穿着、人台、半身宣传照、杂乱场景不可用。后端还要求上衣主体可见，只有裤子/鞋履特写不算整体参考，风格和场景须与用户所选有交集。Commons 缩略图不可用时只取固定 Wikimedia 图片 CDN 的960px缩略图，不获取任意搜索结果 URL。

生产版使用 REWEAR_MODEL_MAIN / ITEM / REFERENCE / STYLIST / WARDROBE / REVIEW 六个角色字段；最终评测选型分别为 DeepSeek、千问、Kimi、千问、DeepSeek、DeepSeek，详见 MODEL-CONFIG.md。REWEAR_LLM_<角色>_BASE_URL / API_KEY 支持角色专用接口，指定接口后必须有对应密钥，不能继承共享服务的密钥。每个角色的全部备选须能从该角色的同一接口访问。每个字段最多5个英文逗号分隔型号，严格按配置顺序去重后尝试，共享30秒预算并均分每次超时时间。不重复重试同一个型号，认证失败、余额不足或取消不换型号。传输/JSON解析失败时切换，业务语义校验仍在后端执行，不接受编造引用。完整 JSON 代码块可解析，带多余正文或思考标签的输出拒绝。configuredAgents 只返回配置布尔值，不返回地址、密钥或型号。

会话隔离、Origin 校验、8MB 图片上限、解码/去EXIF、12MB请求上限、日配额、锁定项和版本校验沿用原后端。模型只能选择传入参考 ID。断开协作流会中止模型请求，提交新方案前检查取消；已经单独保存的衣物或反馈不删除。

用户反馈先保存，再提炼偏好，即使模型失败也保留原反馈。偏好提议不会自动记忆；用户确认才保存。预算进入需求与计划快照。后端会话是确认记忆来源，浏览器仅镜像，不把别的匿名会话的 localStorage 偏好自动导入。

部署默认 direct；旧 Coze 配置只有显式 REWEAR_AI_PROVIDER=coze 才使用。支持的实际模型需验证 JSON object 参数和图片输入；无真实配置时不能宣称已接通 AI。

## 验收清单

1. 欢迎页、头像、白底西装、风格/场景图仍能正常加载，排布保持原版。
2. 390px、320px 下协作页/结果页无横向溢出，底部导航不遮挡操作。
3. 未配置模型时显示规则模式；灰卫衣无适用人工参考时不套用黑西装。
4. 模拟真实协议覆盖主理人→搭配→问答→反馈，包含 profile、budget、preferences；参考和用户单品不可编造。
5. 中间模型失败能够流式降级；最终校验错误在前端可见。非法 JSON、截断、非HTTPS远程地址拒绝。
6. 复盘建议用户确认后进入下一轮，不确认只保存反馈；另一会话无法访问。
7. 真模型另测上传、图片理解、网络参考核对、主理人冲突追问、推荐、替换、修改、反馈；缺密钥则明确记未验证。

交付包排除 .env、.env.local、存储、日志、缓存、个人上传、node_modules 和内部截图；使用包内 .env.example 配置。交付包不是线上自动发布，GitHub/Render 更新需作为下一次发布验收。
