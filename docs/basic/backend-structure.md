# 后端架构设计

## 适用范围

NestJS API 按 activities、ai-config、participants、submissions、evaluations、dashboard、health 模块组织，并通过 Supabase 访问数据。

## 服务边界

- 页面或入口层负责收集用户动作和展示状态。
- 服务、工具或 API 层负责数据读取、处理、校验和结果返回。
- 日志、缓存、持久化或监控模块用于支撑排障和恢复。

## 数据流

- 输入来自用户操作、本地配置、远程服务或测试脚本。
- 业务模块完成校验、转换、处理和状态更新。
- 输出回到界面、导出结果、日志、缓存或 API 响应。

## CLI 接入面

- 根目录通过 npm workspace 暴露本地开发、构建、检查和清理入口。
- `npm run dev` 同时启动 API 与 Web，本地默认 API 端口为 3001，Web 端口为 3000。
- `npm run dev:api` 只启动 NestJS API，并从环境变量解析 Supabase、自定义数据源与 AI 服务配置。
- `npm run dev:web` 只启动前端，并把 API 基础地址写入前端运行时环境。
- `npm run build` 和 `npm run lint` 按 workspace 执行各应用自己的构建和静态检查脚本。
- `npm run test:smoke` 顺序执行 lint 与 build，作为发布前最小冒烟入口。
- `npm run clean` 清理依赖安装目录、前端构建缓存和 API 构建产物。

## API 接入面

- NestJS API 在启动时统一设置 `/api` 前缀、CORS 和请求参数校验。
- 本地服务入口为 `apps/api/src/main.ts`，部署到 Vercel 时通过 `apps/api/api/[...path].ts` 复用同一套应用配置。
- 健康检查入口为 `GET /api/health`。
- 活动与管理相关入口覆盖活动列表、活动创建、活动查询、活动设置、AI 配置、参与者导入、提交发布、评估触发和看板统计。
- 活动设置接口可保存用户可见的活动名称和同学参加方式；活动公开入口按创建顺序映射为数字编号，不随名称修改自动变更，并继续兼容历史 slug。
- 同学登录按活动参加方式分流：准入名单模式只匹配预设名单，匿名模式在姓名不存在时创建新的同学记录，同名登录会连接到原数据。
- 活动是数据聚合根；参与者、会话、提交、评测、AI 配置和看板查询都通过活动维度隔离。
- 参与者相关入口覆盖活动登录、个人信息、提交历史、单次评估和作品链接更新。
- 新增或调整 API 时，需要同步 controller、DTO、服务逻辑、模块 README 和本文的接入面说明。

## 可观测性与脱敏

- 发布前最小追踪字段为 `trace_id`、`span_id`、`request_id`、`task_id`、`user_session_id` 和 `error_id`。
- 本地与线上排障证据需要能把用户动作、后端入口、异步任务和错误结果串到同一条链路。
- Secret、token、API key、service role、管理密码和个人敏感字段不得写入日志、报告或用户界面；需要展示时只记录已脱敏状态或存在性。

## 业务成本与用量护栏

- 涉及 AI 评估、模型调用、第三方 API、导入名单或批量任务时，需要说明 quota、usage limit、rate limit、daily limit、monthly limit、allowance、free tier、额度、用量限制、限流、每日上限、月度上限和免费额度的边界。
- 需要覆盖 abuse、bypass、replay、concurrent、unauthorized、滥用、绕过、并发、重复请求和越权场景，避免低权限入口触发高成本操作。
- 需要保留 usage metric、cost metric、billing metric、tokens_used、cost_usd、spend、dashboard、monitor、监控、指标、用量、成本和看板类信号。
- 需要明确 alert、threshold、budget、anomaly、报警、告警、阈值、预算和异常增长的处理标准。
- 需要准备 kill switch、feature flag、circuit breaker、disable、degrade、pause、shutdown、止损、关闭、降级、暂停和熔断动作。

## 维护规则

- 新增远程接口、持久化结构、错误处理或监控链路时更新本文。
- 第三方依赖升级、替换或移除时同步更新 tech-stack.md。
