# 发布源码与在线 Demo

2026-10-09：重新连接GitHub后恢复写入权限，本仓库提供公开源码与本地运行说明。仓库：https://github.com/lzj15923619456-wq/rewear-ai-demo 。公开在线 Demo 尚未部署。

## GitHub 上传

优先重新连接 Codex 中的 GitHub，并在授权页允许访问 rewear-ai-demo。账号拥有仓库不代表连接器能够写入。

如果连接器仍无法写入，可以在空仓库页面选择 uploading an existing file。打开解压后的 REWEAR-AI-source-2026-10-09 文件夹，把里面的文件和文件夹拖入上传区域；保留 dist、coze、navigation 等目录结构。提交后根目录应该能看到 README.md、server.cjs、api.cjs、package.json 和 render.yaml。

不要只上传 ZIP：GitHub 不会替你解压并建立目录。交付包只带空值的 .env.example；实际 .env、storage、运行日志、node_modules 和用户上传照片都不应上传。公开包已经替换未经核对的旧摄影素材；用户提供的头像单独标注，不代表项目取得其他人的肖像或摄影许可。

## 免费临时 Demo：Render

这是可选的免费演示部署配置，尚未实际创建或验收 Render 服务。不是持久保存方案。免费实例无请求15分钟后休眠；首次唤醒可能需要约一分钟；休眠、重启或重新部署会丢失本地 SQLite 数据及上传图片。用演示衣物体验即可，保留记录需要后续配置持久磁盘或迁移外部数据库/对象存储。[官方免费限制](https://render.com/docs/free)

1. 登录 [Render Dashboard](https://dashboard.render.com)，选择 New → Blueprint，关联已有 GitHub 仓库。
2. 选择 rewear-ai-demo，使用根目录的 render.yaml。确认只有一个 plan: free 的 Web Service，没有数据库、付费磁盘或其他付费服务。
3. 页面提示填写四个环境变量。两组 BASE_URL 都填现有 Coze 工作流基础域名（不带 /run）；两组 TOKEN 都填本机私有 .env 的对应值。这些值只在托管平台的环境变量页面填写，不写回源码。
4. 创建部署并等待成功。Render 自动提供 RENDER_EXTERNAL_URL；启动命令将它作为 PUBLIC_ORIGIN，确保网页与 API 使用同源地址。监听 0.0.0.0，端口使用平台 PORT；Node 固定为本机验收版本24.19.0。
5. 打开 Render 实际显示的 HTTPS 地址，追加 /iphone-preview.html。把这个公开地址发回，才能继续线上验收；不要根据服务名称猜网址。

[Blueprint 配置说明](https://render.com/docs/blueprint-spec)，[Node 版本配置](https://render.com/docs/node-version)，[平台域名环境变量](https://render.com/docs/environment-variables)。免费方案不代表 AI 模型免费；有效识别、推荐、追问和调整仍消耗 Coze 用量。若页面要求付费升级，不需要为完成本方案购买。

如果不用 Blueprint：新建 Web Service，语言 Node，构建命令 `npx --yes pnpm@11.25.0 install --prod --frozen-lockfile`，启动命令 `PUBLIC_ORIGIN=$RENDER_EXTERNAL_URL node server.cjs`，其余环境变量照 render.yaml 填写。不要选择 Static Site。

## 持久部署

若已有支持 Node24 的服务器，安装根目录依赖，配置私有环境变量，设置 HOST=0.0.0.0、平台端口、实际 HTTPS PUBLIC_ORIGIN 和持久 DATA_DIR，然后运行 node server.cjs。HTTPS 由可信反向代理或托管平台提供。SQLite 只运行一个实例，保留并备份整个 DATA_DIR，图片与数据库不可分开丢弃。代理下本版本按连接 IP 限额，多人可能共用限额；修改为真实访客 IP 前必须核对平台可信代理规则。

## 上线后的验收

先读取 /__rewear_health 和 /api/status。Ready 仅说明服务端配置存在，不能代替真实测试。网页完成一次上传并同意发送 Coze、核对识别属性、选择要求、推荐、追问、保留单品调整、保存和反馈；另开独立浏览器会话检查看不到原记录和照片。确认不足六套的说明、错误提示及卡片动画。不要反复点击来触发模型重试。

此前通过的是本机后端对真实 Coze 的 API 主链路和回归测试；Render 构建、公开地址、移动端浏览器及微信真机还没有验收。
