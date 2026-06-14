# Prompt Benchmark

> 面向教学现场的开源活动工具，用来收集学员提示词、触发 AI 评分，并展示现场排行榜。

![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-%3E%3D20-blue)
![Data Source](https://img.shields.io/badge/data%20source-Supabase%20or%20custom%20API-purple)

[English](README.md)

## 功能

- 创建教学活动，并生成数字编号参与入口。
- 支持“准入名单”和“匿名参与”两种同学参加方式。
- 收集提示词草稿、发布提交内容，并导出学员作品。
- 接入 OpenAI 兼容的聊天补全接口做 AI 评分。
- 展示现场大屏，包括状态、排名、分数、优点和改进建议。
- 后端数据源有独立边界，默认保留 Supabase，也预留自定义 API 接入点。
- 提供 Supabase 迁移和合成示例名单，方便本地启动。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | Next.js, React, TypeScript |
| 后端 | NestJS, TypeScript |
| 默认存储 | Supabase Postgres |
| AI 评分 | OpenAI 兼容的聊天补全接口 |

## 快速开始

### 准备

- Node.js 20 或更新版本
- npm 10 或更新版本
- Supabase 项目，或你自己的数据 API 适配器
- 一个 OpenAI 兼容接口的 AI 服务密钥

### 安装

```bash
npm install
```

### 配置

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

把 `apps/api/.env` 中的 Supabase 和 AI 服务配置替换成你自己的值。不要提交 `.env` 文件。

### 准备 Supabase

在你的 Supabase 数据库中执行 `supabase/migrations/` 下的 SQL 文件；如需示例数据，再执行 `supabase/seed.sql`。这个 seed 只包含合成学员名，不含真实学生数据。

### 本地运行

```bash
npm run dev
```

- 前端：`http://localhost:3000`
- 后端：`http://localhost:3001/api`

## 数据源接入

默认数据源是 Supabase。公开副本把数据源边界放在 `apps/api/src/common/data-source/`。

- `DATA_SOURCE_PROVIDER=supabase`：使用内置 Supabase 适配。
- `DATA_SOURCE_PROVIDER=custom_api`：预留给自有 API 或其他存储。
- 具体接入方式见 [docs/data-source-adapters.md](docs/data-source-adapters.md)。

## 脱敏说明

这个公开副本使用全新的 Git 历史，不包含私有工作流资产、本地构建产物、部署状态、截图、历史评审报告或真实学员名单。示例数据全部为合成数据。

## 目录结构

```text
apps/web     Next.js 前端
apps/api     NestJS 后端
supabase     数据库迁移和合成 seed
scripts      本地开发脚本
docs         配置、数据源和隐私说明
```

## 贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 安全

安全问题请私下披露，见 [SECURITY.md](SECURITY.md)。

## 许可证

MIT

## 作者

- SoulCard: [超级峰](https://soulcard.me/card/chaojifeng)
- X: [Mileson07](https://x.com/Mileson07)
- 小红书: [超级峰](https://www.xiaohongshu.com/user/profile/58b798d050c4b4193c8111c7)
- 抖音: [超级峰](https://www.douyin.com/user/MS4wLjABAAAA2I1fDroAQZrM8Tdz6MZfd28MCaRizKmD2-lr7UQP-a0)
- 快手: [超级峰](https://www.kuaishou.com/profile/3xeqsssav5aif84)
- 即刻: [超级峰](https://web.okjike.com/u/E769500F-3283-4BAE-B2F3-D1F0E944CB70)
