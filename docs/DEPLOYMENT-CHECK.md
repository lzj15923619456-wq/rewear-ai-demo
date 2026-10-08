# 部署接入记录 · 2026-10-09

用户确认已部署。截图已确认实际 API 地址为 https://zxnvd98xvd.coze.site/run。本机私有 .env 已保存并同步识图和规划两组配置，凭证未输出。

两个不触发模型的请求结果：

- 无 Authorization 的 POST /run，action=unknown：HTTP 200，业务返回 invalid_action。
- 使用故意错误的 Bearer 凭证的 POST /run，action=analyze 且 imageUrl 无效：HTTP 200，业务返回 invalid_image。

这说明该地址没有在工作流校验之前拒绝这两种未授权请求。暂不把该地址作为已验证安全的正式 AI 接入地址。先核对部署总览提供的实际 API 地址和鉴权，再配置私密凭证。

配置后运行 `node scripts/verify-coze.cjs`。脚本先断言缺失和错误凭证均返回 401/403，再验证合法凭证的 payload/result 协议；全部请求都使用无效 action，不上传照片，不调用付费模型。鉴权通过后再执行衣物识别和搭配生成的真实验收。

如果平台提供的是已带网关鉴权的另一个 API 域名，应使用那个域名。如果实际地址仍未鉴权，需要修复平台项目类型或在服务入口强制校验生产环境中的私密凭证，并覆盖所有可执行模型的接口；只在网页端判断凭证无效。

私密配置与测试日志均不得包含在源码发布包里；不要在聊天或截图中展示凭证。

## 真实测试与修复补丁

2026-10-09 的真实识图已进入 call_model，但 json.loads(raw) 报 JSONDecodeError，HTTP 400 被本机后端映射为 502。本轮后续生成、追问、调整没有执行，不能称为已接通。

补丁位于 outputs/releases/REWEAR-Coze-fix-2026-10-09：仅替换 graph.py，新增 output_guard.py、auth_guard.py，并在现有 main.py 注册 WorkflowAuth。保留远端已修好的依赖和数据库降级。入口需生产环境 REWEAR_API_TOKEN，与本机 COZE_ANALYZE_TOKEN 一致；未配置503，缺失/错误Token401。严格输出解析不自动修复或执行模型文本，格式不合法返回 invalid_model_output，后端拒绝保存。

新增五组标准库测试通过，覆盖所有执行路径保护、缺失环境变量、重复鉴权头、不合法模型 JSON 和受控错误；三组 Node 回归也通过。2026-10-09 用户确认该补丁已应用、环境变量已配置并重新部署。

远端修复后先运行 node scripts/verify-coze.cjs，成功再运行 node scripts/test-live-ai.cjs --run --image "本机清晰单品照片路径"。第二条会实际调用模型且使用独立临时数据库，最多一轮，不自动重试。测试报告保存在被忽略的 .runtime 目录。

## 修复后的部署结果

2026-10-09：node scripts/verify-coze.cjs 退出码0。缺失和错误 Bearer 均被拒绝，正确凭证的 /run 返回 invalid_action，未调用模型。

真实主链路测试已通过。第一次使用旧/新混合图库返回6套；随后将AI图库切换为8张已核对许可的真实照片，重新验收返回2套，识图、推荐、追问、保留下装的调整、保存、反馈、访客照片隔离全部通过。图库边界不同不能把两次结果混写成任意情况都能生成6套。详细报告见 AI-ACCEPTANCE.md。
