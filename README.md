# 山鉴

庐山抗战文化景观数字平台。公众可以通过地图、时间线和点位档案浏览历史地点，并使用收藏、资料补充与导出申请等功能。

## 本地运行

```bash
npm install
npm run dev
```

## GitHub Pages

线上页面由 GitHub Actions 自动构建并部署，并通过 `VITE_API_BASE_URL` 连接 Render 后端。

## 后端部署

- 境内部署平台：Sealos 杭州区。
- 后端镜像：`ghcr.io/deepatric/shanjian-lushan-api:latest`，由 GitHub Actions 自动构建。
- 数据库：Sealos PostgreSQL，容器启动时由 `server/scripts/init-production.mjs` 幂等建表、填充点位并初始化管理员。
- 服务端口：`4000`；健康检查：`GET /api/health`。

应用环境变量必须配置 `DATABASE_URL`、`ADMIN_ACCOUNTS_JSON` 和 `CORS_ORIGINS=https://deepatric.github.io`。管理员密码只保存为部署密钥和数据库哈希，不得提交到仓库。
