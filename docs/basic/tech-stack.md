# 项目技术栈

## 运行环境

Prompt Benchmark 按现有仓库配置运行；构建入口、依赖管理和测试入口以项目内配置文件为准。

## 核心依赖

- npm workspaces
- Next.js
- NestJS
- TypeScript
- Supabase
- OpenAI 兼容 AI 服务

## 工具链

- npm workspaces 管理前后端应用。
- Supabase migrations 管理默认数据库结构。
- 项目内脚本负责本地开发、清理和构建入口。
- 数据源边界保留 Supabase 默认适配，也允许后续接自有 API。

## 维护规则

- 依赖、构建工具、运行环境或部署方式变化后更新本文。
- 新增外部服务前，补充服务边界、失败影响和回滚方式。
