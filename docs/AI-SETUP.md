# AI 接入逻辑与配置

## 接口为什么这样分工

API 是程序约定的请求和返回格式。网页用同源 JSON 调用 /api；浏览器不接触 Coze Token。Node 验证会话、图片、衣物与选择，再用私密 Bearer 请求 Coze /run。Coze 接收 {payload:{...}}，返回 {result:{...}}；Node 再验证来源 ID、锁定衣物、版本和所有权，才保存并交给页面。

### 五个动作

| action | 输入 | 用途 |
|---|---|---|
| analyze | 单件 JPEG、类别 | 识别衣物，返回 needs_confirmation |
| inspect_references | 最多12张候选图片、锁定单品、要求 | 看图筛选与描述，不输出新图片地址 |
| recommend | 筛选后的参考元数据、要求 | 最多六套搭配清单 |
| answer | 已保存方案、问题 | 不修改方案的追问 |
| revise | 原方案、保留位置、调整要求 | 原图不变，更新清单与版本 |

每个 action 一次模型调用。一次推荐网页操作通常先 inspect_references 再 recommend，共两次。模型输出只当作建议，不能赋予用户所有权或访问权限。

## 最少准备项

1. 安装 Node24 和根目录依赖，复制 .env.example 为私有 .env。
2. 两组 COZE_*_BASE_URL 填部署的基础域名，两组 COZE_*_TOKEN 填对应 Token。
3. Coze 生产环境 REWEAR_API_TOKEN 与后端 Token 一致；保留 WorkflowAuth 入口保护。
4. 部署 coze/graph.py 与 coze/output_guard.py 对应业务代码；完整平台入口/部署脚手架使用 Coze 当前项目。替换鉴权保护是错误做法。
5. 重启网页后端并测试。/api/status 的 Ready 只证明配置存在，不能证明调用成功。

Openverse 无需新增 API Key。Pexels 申请页当前暂停发放新密钥，本版本不依赖 PEXELS_API_KEY。可设置 PHOTO_SEARCH_ENABLED=0 关闭检索用于回归；默认开启。

## 搜索链路

用主单品（上衣优先，否则第一件）的类别、颜色及风格标签形成两个查询。结果按许可、来源、标题风险过滤；只从固定 Openverse /thumb/ 接口取缩图，限制大小与像素，清除 EXIF，以照片 ID 和感知哈希去重。元数据缓存24小时，缩图缓存于 DATA_DIR/reference-images。

最多12张图片交给 Coze。候选 ID 不能编造，matchedItemIds 必须引用用户的衣物；主单品必须有同类别、相近颜色的可见参考。通过后交给规划模型，其他衣物没出现在照片里时明确差异，仍保留用户原单品名称与 ID。

图片经本服务同源提供，网页无需直接访问境外图库域名。图片失败、频率限制、模型格式错误时明确报错或返回不足，不重复照片补满六套。开放许可索引和视觉模型均不能保证任意组合都有照片。

## 安全与运行限制

识图支持 JPEG/PNG/WEBP，最大8MB、2500万像素，缩到1400px内并清除 EXIF；结果必须用户确认。后端限制跨站写请求，照片/记录属于各自匿名会话。严格 JSON 与二次 ID 校验阻止编造 URL 或替换锁定衣物。日志不记录图片、Token、请求正文或原始模型回复；解析失败只记异常类别、长度、行列与 finish_reason。

[Openverse 官方认证与频率说明](https://docs.openverse.org/api/reference/authentication_and_throttling.html)。无认证也有频率上限；缓存减少请求，429 不自动循环重试。新增检索无需购买服务，Coze 模型用量仍会消耗账户额度。

免费 Render 文件系统是临时的，缓存与匿名记录会随重启丢失。用户的大陆手机移动网络已验证旧版欢迎页可打开；新检索图片与其他运营商仍需实际验证。不要把单个网络样本写成全面保证。
