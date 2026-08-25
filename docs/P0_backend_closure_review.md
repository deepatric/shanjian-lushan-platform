# 山鉴 P0 功能闭环审查与后端数据库说明

更新时间：2026-05-22

## 1. P0 功能闭环审查

| 模块 | docs 要求 | 当前闭环状态 | 后端/API 支撑 |
|---|---|---:|---|
| 匿名主地图浏览 | 未登录可浏览三维专题地图 | 已闭环 | `GET /api/map/places` |
| 三类点位 | 事件点 / 遗址点 / 战斗点 | 已闭环 | `places.place_type` + 坐标字段 |
| 三维地图落位 | 点位按经纬度进入地图 | 已闭环 | `longitude / latitude / altitude / geom` |
| 搜索筛选 | 类型、区域、关键词、时间范围 | 已闭环 | `GET /api/map/places` Query + `GET /api/search` |
| 时间轴 | 1937–1945 连续时间轴、关键节点 | 已闭环 | `GET /api/events/timeline` + `timeline_keyframes` |
| 地点详情 | 简介、图片、关联地点、关联事件、来源 | 已闭环 | `GET /api/map/places/:id` |
| 图片与来源 | 网络图 / AI 图需标注、来源可追溯 | 基础闭环 | `media / sources / media_links / source_links` |
| 普通用户登录注册 | 用户注册、登录、个人中心 | 已闭环 | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/me` |
| 收藏 | 登录后收藏地点 | 后端已闭环，前端可继续接入细化 | `favorites`, `POST/DELETE /api/favorites` |
| UGC 提交 | 提交后进入审核队列 | 已闭环 | `POST /api/ugc/submissions`, `ugc_submissions` |
| 导出申请 | 登录用户发起导出申请 | 已闭环 | `POST /api/export-requests`, `export_requests` |
| 管理员登录 | 管理员独立登录 | 已闭环 | `POST /api/admin/auth/login` |
| 管理后台仪表盘 | 点位、待审、待审批、来源统计 | 已闭环 | `GET /api/admin/dashboard` |
| 数据管理 CRUD | 地点/事件/人物/区域/媒体/来源 | 已闭环 | `CRUD /api/admin/:resource` |
| UGC 审核 | 通过 / 驳回 / 记录审核人 | 已闭环 | `POST /api/admin/ugc/:id/approve|reject` |
| 导出审批 | 通过 / 驳回 / 生成下载记录预留 | 已闭环 | `POST /api/admin/export-requests/:id/approve|reject` |
| 系统配置 | 地图与展示偏好配置 | 已闭环 | `GET/PUT /api/admin/config` |
| 操作日志 | 管理行为留痕 | 已闭环 | `admin_logs`, `GET /api/admin/logs` |
| 未来扩展 | 知识库、AI、版本、通知、下载授权 | 已预留 | `dataset_versions / notifications / download_records / metadata` |

## 2. 后端工程

- 技术栈：NestJS + Prisma + SQLite 本地调试。
- 入口：`server/src/main.ts`
- Schema：`server/prisma/schema.prisma`
- 手动 SQLite 建表：`server/prisma/manual-push.ts`
- Seed：`server/prisma/seed.ts`
- 数据库：`server/data/shanjian-prisma.sqlite`

## 3. 数据库设计重点

核心实体：

- `users`：普通用户、个人设置、收藏缓存、状态。
- `admins`：管理员、权限集合、状态。
- `places`：点位主表；保留经纬度、高程、GeoJSON、时间范围、审核状态、来源可信度、扩展 metadata。
- `events`：历史事件；支持模糊原始时间与标准化时间并存。
- `persons`：人物；预留别名、生卒、职务、传记。
- `regions`：区域；预留层级、bbox、geom、中心点。
- `media`：图片/档案/AI 图；保留授权、AI prompt、credit、缩略图与存储 key。
- `sources`：来源；保留引用、URL、档案编号、可靠性等级。

关系与治理：

- `place_events`、`event_persons`：支撑地点—事件—人物知识网络。
- `media_links`、`source_links`：任意实体挂媒体和来源。
- `place_relations`：地点之间的叙事/交通/空间/档案关系。
- `timeline_keyframes`：时间轴关键节点与镜头飞跃预留。
- `ugc_submissions`：公众提交、审核状态、发布目标。
- `export_requests`、`download_records`：导出审批与下载授权。
- `admin_logs`：后台操作留痕。
- `system_configs`：系统配置。
- `dataset_versions`：未来数据集发布和回滚基础。
- `notifications`：站内消息。

## 4. Seed 数据

- 普通用户：`viewer@example.com` / `shanjian123`
- 管理员：`admin@shanjian.local` / `shanjian123`
- 点位：10 个，来自文化景观经纬度表的演示实例化。
- 事件：6 条。
- 人物：3 条。
- 来源：5 条。
- 媒体：2 条基础媒体记录，并通过 `media_links` 绑定到 10 个点位。
- 来源关系：10 条点位来源绑定。
- 地点关系：2 条演示关系。
- 时间关键帧：4 个全国抗战标志性节点。

## 5. 已执行验证

```bash
npm.cmd run server:generate
npm.cmd run server:seed
npx.cmd tsc -p server/tsconfig.json --noEmit
npm.cmd run typecheck
npm.cmd run build
```

API 冒烟验证：

- `GET /api/map/places` 返回 10 个点位。
- 普通用户登录成功。
- 管理员登录成功。
- `GET /api/admin/dashboard` 返回 4 组统计。

## 6. 下一步建议

1. 把个人中心的收藏、提交、导出列表从 mock 切到 `/api/me/*`。
2. 后台 CRUD 表单增加新增/编辑弹窗，直接写入真实 SQLite。
3. 给媒体上传补本地文件存储接口，先落 `public/uploads`，后续再切对象存储。
4. 继续补 `event_persons` 与更严谨来源引用，提升史实可信度。
