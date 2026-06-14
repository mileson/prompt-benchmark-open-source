/*
## 核心功能
维护 types.ts 在 Prompt Benchmark 中的实现职责，支撑 项目核心流程。

## 输入
来自上游页面、服务、配置、用户动作、测试或构建流程的数据。

## 输出
向调用方提供函数、类型、视图、状态、配置或处理结果。

## 定位
位于 apps/web/lib，只承担该目录约定的局部职责。

## 依赖
依赖同目录或相邻模块、项目配置以及运行时框架提供的能力。

## 维护规则
修改逻辑、输入输出、外部依赖或职责边界后，同步更新本文件说明书和所在文件夹 README。
*/
export type ThemeMode = 'dark' | 'light';
export type ParticipationMode = 'allowlist' | 'anonymous';
export type ParticipantStatus = 'not_joined' | 'logged_in' | 'submitted' | 'evaluating' | 'scored';
export type EvaluationState = 'idle' | 'queued' | 'running' | 'completed' | 'stale' | 'failed';
export type ColorLevel = 'excellent' | 'good' | 'fair' | 'weak';

export interface ActivitySummary {
  id: string;
  slug: string;
  title: string;
  status: 'draft' | 'live' | 'archived';
  directEntryUrl: string | null;
  autoEvaluateEnabled: boolean;
  rankingVisible: boolean;
  pollingIntervalMs: number;
  themeMode: ThemeMode;
  participationMode: ParticipationMode;
  rubricVersion: string;
}

export interface ActivityListItem extends ActivitySummary {
  participantCount: number;
  submittedCount: number;
  scoredCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityListResponse {
  activities: ActivityListItem[];
}

export interface DashboardCard {
  participantId: string;
  displayName: string;
  status: ParticipantStatus;
  evaluationState: EvaluationState;
  currentScore: number | null;
  currentRank: number | null;
  previewText: string | null;
  productUrl: string | null;
  creatorPromoted: boolean;
  updatedAt: string;
}

export interface DashboardPayload {
  activity: {
    id: string;
    title: string;
    themeMode: ThemeMode;
    autoEvaluateEnabled: boolean;
    rankingVisible: boolean;
    pollingIntervalMs: number;
    participationMode: ParticipationMode;
  };
  summary: {
    total: number;
    loggedIn: number;
    submitted: number;
    evaluating: number;
    scored: number;
    lastRefreshedAt: string;
  };
  cards: DashboardCard[];
}

export interface ParticipantDetail {
  participantId: string;
  displayName: string;
  status: ParticipantStatus;
  promptText: string | null;
  latestSubmissionVersion: number;
  latestPublishedVersion: number;
  latestEvaluatedVersion: number | null;
  productUrl: string | null;
  creatorPromoted: boolean;
  evaluation: {
    totalScore: number;
    rank: number;
    previousRankScore: number | null;
    colorLevel: ColorLevel;
    dimensionScores: {
      structuralCompleteness: number;
      precisionClarity: number;
      exemplarGuidance: number;
      contextBoundaryControl: number;
      taskDecomposition: number;
    };
    taste: Record<string, string>;
    align: Record<string, string>;
    strengths: string[];
    weaknesses: string[];
    strengthEvidenceQuotes: string[];
    weaknessEvidenceQuotes: string[];
    improvementSuggestions: string[];
    summary: string;
  } | null;
}

export interface ParticipantHistoryEntry {
  version: number;
  promptText: string;
  createdAt: string;
  evaluation: {
    totalScore: number;
    rank: number;
    colorLevel: ColorLevel;
    dimensionScores: {
      structuralCompleteness: number;
      precisionClarity: number;
      exemplarGuidance: number;
      contextBoundaryControl: number;
      taskDecomposition: number;
    };
    strengths: string[];
    weaknesses: string[];
    strengthEvidenceQuotes: string[];
    weaknessEvidenceQuotes: string[];
    improvementSuggestions: string[];
    summary: string | null;
  } | null;
}

export interface ParticipantHistoryResponse {
  participantId: string;
  displayName: string;
  items: ParticipantHistoryEntry[];
}

export interface LoginResponse {
  participantId: string;
  displayName: string;
  status: ParticipantStatus;
  sessionToken: string;
}

export interface MeResponse {
  participantId: string;
  displayName: string;
  status: ParticipantStatus;
  latestSubmissionVersion: number;
  latestPublishedVersion: number;
  latestEvaluatedVersion: number | null;
  promptText: string | null;
  evaluationState: EvaluationState;
  currentScore: number | null;
  currentRank: number | null;
  productUrl: string | null;
  creatorPromoted: boolean;
}

export interface SubmissionResponse {
  participantId: string;
  status: ParticipantStatus;
  version: number;
  latestPublishedVersion: number;
  evaluationState: EvaluationState;
  savedAt: string;
}

export interface EvaluationTriggerResponse {
  jobId: string;
  jobStatus: 'queued' | 'running' | 'completed' | 'failed';
  participantCount?: number;
  reused?: boolean;
  queuedCount?: number;
  runningCount?: number;
  completedCount?: number;
  reusedCount?: number;
}

export interface ProductLinkResponse {
  participantId: string;
  productUrl: string | null;
  creatorPromoted: boolean;
  updatedAt: string;
}

export interface ImportParticipantsResponse {
  inserted: number;
  skipped: number;
}

export interface ActivityAiConfig {
  mode: 'standard';
  baseUrl: string;
  model: string;
  apiKeyMasked: string | null;
  hasStoredApiKey: boolean;
  hasFallbackApiKey: boolean;
}

export interface ActivityAiConfigRevealResponse {
  apiKey: string;
}

export interface ActivityAiConfigTestResponse {
  ok: boolean;
  message: string;
  preview: string;
}
