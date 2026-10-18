<a id="prompt-benchmark"></a>

<div align="center">

# Prompt Benchmark · 教学现场提示词评测

**收集学员提示词，触发 AI 评分并展示现场排行。**

提示词提交 · AI 评分 · 现场排行 · 活动管理

[![中文说明](https://img.shields.io/badge/%E8%AF%B4%E6%98%8E-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-059669)](#readme-detail-12)
[![项目类型](https://img.shields.io/badge/%E9%A1%B9%E7%9B%AE-%E5%BA%94%E7%94%A8-6366f1)](#readme-detail-12)

[✨ 核心特性](#readme-detail-12) · [✅ 适用场景](#readme-detail-audience) · [🚀 快速开始](#readme-detail-14) · [🔒 脱敏说明](#readme-detail-20) · [🏗️ 技术栈](#readme-detail-16) · [🔌 数据源接入](#readme-detail-18)

</div>

---

> 面向教学现场的开源活动工具，用来收集学员提示词、触发 AI 评分，并展示现场排行榜。

![许可证](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-%3E%3D20-blue)
![Data Source](https://img.shields.io/badge/data%20source-Supabase%20or%20custom%20API-purple)

<a id="readme-section-1"></a>

<a id="功能"></a>

<a id="readme-detail-12"></a>

## ✨ 核心特性

- 创建教学活动，并生成数字编号参与入口。
- 支持“准入名单”和“匿名参与”两种同学参加方式。
- 收集提示词草稿、发布提交内容，并导出学员作品。
- 接入 OpenAI 兼容的聊天补全接口做 AI 评分。
- 展示现场大屏，包括状态、排名、分数、优点和改进建议。
- 后端数据源有独立边界，默认保留 Supabase，也预留自定义 API 接入点。
- 提供 Supabase 迁移和合成示例名单，方便本地启动。

<a id="readme-detail-audience"></a>

## ✅ 适用场景

适合组织提示词练习与教学活动的读者。

<a id="readme-section-2"></a>

<a id="快速开始"></a>

<a id="readme-detail-14"></a>

## 🚀 快速开始

从下面的现有入口开始，按顺序准备环境、配置并完成首次运行。

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

<a id="readme-section-3"></a>

<a id="技术栈"></a>

<a id="readme-detail-16"></a>

## 🏗️ 技术栈

Prompt Benchmark 的实现按下列技术与模块组织，接入和维护时可据此定位。

| 层级 | 技术 |
| --- | --- |
| 前端 | Next.js, React, TypeScript |
| 后端 | NestJS, TypeScript |
| 默认存储 | Supabase Postgres |
| AI 评分 | OpenAI 兼容的聊天补全接口 |

<a id="readme-section-4"></a>

<a id="数据源接入"></a>

<a id="readme-detail-18"></a>

## 🔌 数据源接入

默认数据源是 Supabase。公开副本把数据源边界放在 `apps/api/src/common/data-source/`。

- `DATA_SOURCE_PROVIDER=supabase`：使用内置 Supabase 适配。
- `DATA_SOURCE_PROVIDER=custom_api`：预留给自有 API 或其他存储。
- 具体接入方式见 [docs/data-source-adapters.md](docs/data-source-adapters.md)。

<a id="readme-section-5"></a>

<a id="脱敏说明"></a>

<a id="readme-detail-20"></a>

## 🔒 脱敏说明

这个公开副本使用全新的 Git 历史，不包含私有工作流资产、本地构建产物、部署状态、截图、历史评审报告或真实学员名单。示例数据全部为合成数据。

<a id="readme-section-6"></a>

<a id="目录结构"></a>

<a id="readme-detail-22"></a>

## 📁 目录结构

下面按实现职责列出目录位置，便于把修改放回对应模块。

```text
apps/web     Next.js 前端
apps/api     NestJS 后端
supabase     数据库迁移和合成 seed
scripts      本地开发脚本
docs         配置、数据源和隐私说明
```

<a id="readme-section-7"></a>

<a id="安全"></a>

<a id="readme-detail-24"></a>

## 🔒 安全

安全问题请私下披露，见 [SECURITY.md](SECURITY.md)。

<a id="readme-section-8"></a>

<a id="贡献"></a>

<a id="readme-detail-26"></a>

## 🤝 贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)。

<a id="readme-section-9"></a>

<a id="许可证"></a>

<a id="readme-detail-28"></a>

## 📄 许可证

MIT

<a id="readme-section-10"></a>

<a id="作者"></a>

<a id="readme-detail-30"></a>

## 👤 作者

- SoulCard: [超级峰](https://soulcard.me/card/chaojifeng)
- X: [Mileson07](https://x.com/Mileson07)
- 小红书: [超级峰](https://www.xiaohongshu.com/user/profile/58b798d050c4b4193c8111c7)
- 抖音: [超级峰](https://www.douyin.com/user/MS4wLjABAAAA2I1fDroAQZrM8Tdz6MZfd28MCaRizKmD2-lr7UQP-a0)
- 快手: [超级峰](https://www.kuaishou.com/profile/3xeqsssav5aif84)
- 即刻: [超级峰](https://web.okjike.com/u/E769500F-3283-4BAE-B2F3-D1F0E944CB70)
