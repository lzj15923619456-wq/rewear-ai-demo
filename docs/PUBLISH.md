# 发布与更新

- [GitHub源码](https://github.com/lzj15923619456-wq/rewear-ai-demo)
- [在线Demo](https://rewear-ai-demo.onrender.com/)
- [Render现有服务](https://dashboard.render.com/web/srv-db48ulbtqb8s73egd7qg)

## 当前服务

已有免费Web Service，在新加坡；无需新建或购买服务。构建命令：npx --yes pnpm@11.25.0 install --prod --frozen-lockfile。启动命令：PUBLIC_ORIGIN=$RENDER_EXTERNAL_URL node server.cjs。健康检查：/__rewear_health。Node24.19.0，HOST=0.0.0.0，DATA_DIR=/tmp/rewear-demo。

Coze两组基础地址/Token只放生产环境变量，Coze的REWEAR_API_TOKEN与之匹配。Openverse默认开启，不需新密钥。不要将.env、storage、.runtime、node_modules、日志或上传照片提交到GitHub或ZIP。

## 更新步骤

先部署兼容5个action的Coze工作流并验证，再把源码追加提交至GitHub main。现有服务由公开GitURL创建，推送不一定自动部署：Render选择 Manual Deploy → Deploy latest commit。确认部署SHA对应本次提交；保留旧Git提交以便回退。部署后核对 /api/status、原版界面照片和真实非黑西装推荐，测试不足数量提示、作者/许可、追问、修改及保存。

免费实例空闲后休眠、冷启动可能约一分钟，重启/部署会丢失本地记录、上传照片、图片缓存；不能作为持久保存方案。[Render官方免费限制](https://render.com/docs/free)。长期保存需要后续持久存储，此次没有新增付费服务。

用户曾用大陆手机移动数据直连打开旧版欢迎页；新图片经同源缓存提供，仍需手机网络复测。不要承诺所有地区和运营商都稳定可访问。

原版界面素材根据用户明确要求恢复，其原来源元数据保留；再分发许可未独立核验。动态参考使用受筛选的开放许可图片，作者、许可和缩图改动在详情页展示。
