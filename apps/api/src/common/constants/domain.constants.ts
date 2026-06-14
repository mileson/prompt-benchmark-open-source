/*
## 核心功能
维护 domain.constants.ts 在 Prompt Benchmark 中的实现职责，支撑 公共基础设施。

## 输入
来自上游页面、服务、配置、用户动作、测试或构建流程的数据。

## 输出
向调用方提供函数、类型、视图、状态、配置或处理结果。

## 定位
位于 apps/api/src/common/constants，只承担该目录约定的局部职责。

## 依赖
依赖同目录或相邻模块、项目配置以及运行时框架提供的能力。

## 维护规则
修改逻辑、输入输出、外部依赖或职责边界后，同步更新本文件说明书和所在文件夹 README。
*/
export const CLIENT_TYPES = ['mobile', 'desktop', 'unknown'] as const;
export const SOURCE_TYPES = ['mobile', 'desktop', 'unknown'] as const;
export const PARTICIPANT_STATUSES = [
  'not_joined',
  'logged_in',
  'submitted',
  'evaluating',
  'scored',
] as const;
export const EVALUATION_STATES = [
  'idle',
  'queued',
  'running',
  'completed',
  'stale',
  'failed',
] as const;
export const THEME_MODES = ['dark', 'light'] as const;
export const PARTICIPATION_MODES = ['allowlist', 'anonymous'] as const;
export const EVALUATION_TRIGGER_MODES = ['auto', 'manual'] as const;
export const COLOR_LEVELS = ['excellent', 'good', 'fair', 'weak'] as const;
export const TASTE_KEYS = ['task', 'audience', 'structure', 'tone', 'example'] as const;
export const ALIGN_KEYS = ['aim', 'level', 'input', 'guidelines', 'novelty'] as const;
export const STANDARD_AI_MODE = 'standard' as const;
export const DEFAULT_AI_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';
export const DEFAULT_AI_MODEL = 'glm-5.1';

export const RUNTIME_CORRELATION_FIELDS = [
  'trace_id',
  'span_id',
  'request_id',
  'task_id',
  'user_session_id',
  'error_id',
] as const;

export const ACTIVITY_BUSINESS_GUARDRAILS = [
  'quota',
  'usage limit',
  'rate limit',
  'daily limit',
  'monthly limit',
  'allowance',
  'free tier',
  'abuse',
  'bypass',
  'replay',
  'concurrent',
  'unauthorized',
  'negative test',
  'usage metric',
  'cost metric',
  'billing metric',
  'tokens_used',
  'cost_usd',
  'dashboard',
  'monitor',
  'alert',
  'threshold',
  'budget',
  'anomaly',
  'kill switch',
  'feature flag',
  'circuit breaker',
  'disable',
  'degrade',
  'pause',
  'shutdown',
] as const;

export type ClientType = (typeof CLIENT_TYPES)[number];
export type SourceType = (typeof SOURCE_TYPES)[number];
export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];
export type EvaluationState = (typeof EVALUATION_STATES)[number];
export type ThemeMode = (typeof THEME_MODES)[number];
export type ParticipationMode = (typeof PARTICIPATION_MODES)[number];
export type EvaluationTriggerMode = (typeof EVALUATION_TRIGGER_MODES)[number];
export type ColorLevel = (typeof COLOR_LEVELS)[number];
export type RuntimeCorrelationField = (typeof RUNTIME_CORRELATION_FIELDS)[number];
export type ActivityBusinessGuardrail = (typeof ACTIVITY_BUSINESS_GUARDRAILS)[number];
