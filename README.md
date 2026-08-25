# 山鉴

庐山抗战文化景观数字平台。公众可以通过地图、时间线和点位档案浏览历史地点，并使用收藏、资料补充与导出申请等功能。

## 本地运行

```bash
npm install
npm run dev
```

## GitHub Pages

线上页面由 GitHub Actions 自动构建并部署。GitHub Pages 版本使用前端演示数据；PostgreSQL 与 NestJS 服务需要独立部署后，再通过 `VITE_API_BASE_URL` 接入。
