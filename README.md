# REWEAR · AI 辅助穿搭 Demo

从 1–3 件已有单品开始，结合场景、风格与补充要求，检索真实图片并生成穿搭清单。

- [点击体验](https://rewear-ai-demo.onrender.com/)
- [iPhone 预览](https://rewear-ai-demo.onrender.com/iphone-preview.html)
- [源码](https://github.com/lzj15923619456-wq/rewear-ai-demo)

## 当前版本

界面图片与排列恢复自用户提供的 REWEAR-deploy-2026-10-05(2).zip。欢迎页、风格选项、场景与示例单品保留原设计；这些界面素材与实时 AI 参考图片分别管理。原设计摄影来源保留在 dist/assets/reference-photos.json、selection-photos.json；其再分发许可未独立核验，不能把它们标成新的授权图库。

2026-10-09：原版图片和 Openverse 检索已发布到现有在线 Demo。真实灰色卫衣联调完成1套动态参考、追问、修改与保存；公开 Demo 复测出现模型 JSON 格式错误。随后 Coze 提示积分耗尽、已部署服务停服，AI 功能暂时不可用，不能宣称线上 AI 已完整验收。网页与示例可浏览；最新实测结果见 [验收记录](docs/AI-ACCEPTANCE.md)。未上线微信小程序。

## 如何运行

需要 Node.js 24.x 与 pnpm 11.25.0。安装并启动：

```sh
pnpm install --frozen-lockfile
# 将 .env.example 复制为私有 .env，并填 Coze 配置
pnpm start
```

打开 http://127.0.0.1:4174/iphone-preview.html 。两组 COZE_*_BASE_URL 与 COZE_*_TOKEN 可共用同一个工作流。后端请求基础域名下的 /run。不要把实际 Token 放在网页、GitHub、截图或 ZIP。Openverse 公开检索无需新增密钥；PHOTO_SEARCH_ENABLED=0 可关闭检索进行离线回归。

## 功能与架构

网页负责交互；Node 后端负责会话、校验、保存、图片检索与缓存；Coze 负责识图、核对参考图、规划、追问与调整。调用链见 [接入说明](docs/AI-SETUP.md)。

上传照片 → Coze analyze → 用户确认衣物 → 后端检索/授权过滤/去重 → Coze inspect_references 看图核对 → Coze recommend 生成清单 → 后端检查引用与锁定衣物 → 用户核对、追问、调整、保存。

每个有效 Coze action 调用模型一次；一次网页推荐通常有两次模型调用（看图和规划）。无效请求不调用模型，不自动重试、不生成试穿图片、不执行模型代码。建议无法满足时返回问题或少量方案。

## 图片与匹配边界

Openverse 是开放许可图片索引，检索限定 CC BY、CC BY-SA、CC0、Public Domain；保留作者、原图页、许可与缩图改动声明。只向搜索服务发送衣物与风格标签，不发送年龄、身高、体重或私密备注。服务端从固定 Openverse 缩图接口取图并缓存，再同源提供给网页。

模型必须核对主单品类别与相近颜色，拒绝看不清、无关或非人物搭配图。它仍可能看错，来源平台也可能有错误元数据；图片不代表用户已经穿上这些衣物。其他录入衣物与照片的差异必须说明。

在线检索失败或没有可靠候选时，仅在适用的女性黑西装场景使用 references-new.json 中 8 张已人工核对的备用参考；其他类别不会硬套这批图片。不足六套不会重复凑数。查看更多排除已有图片 ID 与相似缩图。

匹配百分比是标签规则分（风格40、场景30、尝试程度20、避免效果10），不是置信度或合身保证。鞋履舒适度与尺码需试穿。

## 部署与限制

现有免费 Render 服务在新加坡，使用 Node 后端，GitHub Pages 不能单独运行。部署步骤见 [发布说明](docs/PUBLISH.md)。免费实例冷启动可能约一分钟，重启或重新部署会丢失本地数据库、上传照片与缓存；持久记录需持久存储。匿名 Cookie 隔离访客，清除 Cookie 后无法找回会话，没有微信登录或跨设备同步。

AI 体验限额为每会话每天12次、每连接IP每天24次、全站每天60次网页操作；一次推荐可能调用模型两次。代理可能使多用户共用 IP 限额。模型用量与搜索服务频率均有各自限制。

pnpm test 运行本地模拟回归。真实验收须显式运行 scripts/test-live-ai.cjs --run --image 本机清晰单品照片路径，会产生模型用量；不自动重试。发布排除 .env、storage、.runtime、日志、node_modules 和个人上传照片。
