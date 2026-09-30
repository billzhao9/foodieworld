# FoodieWorld

手机友好的中英文魔法料理实验室：选择真实食材，生成原创料理的开场图和实时视频，再连续加入真实或幻想材料。支持共享密码、60 种真实食材、8 种幻想材料、实际视频录制与下载。视频以可见的烹饪融合、连续加料和可爱料理反应为目标。

作品画廊展示已录制的视频。登录访客可为作品创建随机分享链接；持有该链接的朋友只能观看这一件作品，无需厨房密码，不能生成或查看完整画廊。作品默认不公开，只有点击分享才生成链接。本地链接只能在本机访问，公开访问需部署后使用站点域名分享。

## 本地运行

需要 Node.js 22.12+、pnpm 和 PostgreSQL。

```sh
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

在 `.env` 配置 `DATABASE_URL` 和 `MMLONE_API_KEY`。MML ONE 本地开发服务默认地址为 `http://127.0.0.1:3000`。浏览器打开 `http://localhost:5174`，API 使用端口 4174。首次启动生成随机试玩密码，保存在本机 `.data/access.json`；也可设置 `APP_PASSWORD` 和 `APP_SESSION_SECRET`。

本地与云端需要填写指向同一 PostgreSQL 数据库的连接串。本地可通过 SSH 隧道连接远程数据库，无需公开数据库端口。应用启动时创建所需表。收藏元数据、开场图、录制视频保存在 PostgreSQL；浏览器临时直播地址不会被当作永久作品。

MML ONE 需要支持企业文字生成、图片任务和实时会话接口，并为企业服务账户授权所用模型：`gpt-5.4-mini`、`og-image2-5-flare-low` 和 `visko-orbis-stable`。实际模型是否可用以企业目录与调用结果为准。

## 验证与构建

```sh
pnpm typecheck
TEST_DATABASE_URL=postgresql://USER:PASSWORD@localhost/TEST_DATABASE pnpm test
pnpm build
pnpm start
```

集成测试在独立临时 schema 中运行；未配置测试数据库时跳过这些测试。生产运行需先构建，服务端同时提供网页和 API。HTTPS 环境设置 `SECURE_COOKIES=true`；可信额外来源可通过逗号分隔的 `APP_ORIGINS` 指定。

每位访客最多一轮实时会话，全站最多两轮，每轮最多 60 秒。退出、断网或页面进入后台会停止，服务端另有超时回收。浏览器支持 MediaRecorder 时保存真实视频，不支持时明确提示。

## 仓库内容

仅提交应用源码、测试、依赖锁文件与运行说明。密钥、密码、数据库凭据、SSH 文件、生成媒体、日志、AI 设计文档和本地代理配置不提交。`.env.example` 仅含占位值。

## 参考

食材选择交互参考 [what-to-eat](https://github.com/liu-ziting/what-to-eat)，界面与目录独立实现。实时变化遵循 [Visko Orbis Stable 提示指南](https://docs.reactor.inc/model-api-reference/visko-orbis-stable/prompt-guide)，通过 Reactor SDK 接收视频。
