/*
## 核心功能
维护 api.ts 在 Prompt Benchmark 中的实现职责，支撑 项目核心流程。

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
import type {
  ActivityAiConfig,
  ActivityAiConfigRevealResponse,
  ActivityAiConfigTestResponse,
  ActivityListItem,
  ActivityListResponse,
  ActivitySummary,
  DashboardPayload,
  EvaluationTriggerResponse,
  ImportParticipantsResponse,
  LoginResponse,
  MeResponse,
  ParticipantDetail,
  ParticipantHistoryResponse,
  ParticipationMode,
  ProductLinkResponse,
  SubmissionResponse,
} from './types';

function trimTrailingSlash(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function buildAdminHeaders(adminPassword?: string) {
  if (!adminPassword) {
    return {} as Record<string, string>;
  }

  return {
    'x-admin-password': adminPassword,
  } satisfies Record<string, string>;
}

function parseApiErrorText(text: string, fallback: string) {
  if (!text) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(text) as { message?: string | string[] };
    if (Array.isArray(parsed.message)) {
      return parsed.message.join('，');
    }
    if (typeof parsed.message === 'string' && parsed.message.trim()) {
      return parsed.message;
    }
  } catch {
    // ignore JSON parse failures and fall back to raw text
  }

  return text;
}

async function throwApiError(response: Response, fallback: string): Promise<never> {
  const text = await response.text();
  throw new ApiError(parseApiErrorText(text, fallback), response.status);
}

export function getServerApiBaseUrl() {
  return trimTrailingSlash(
    process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api',
  );
}

export function getPublicApiBaseUrl() {
  return trimTrailingSlash(
    process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.API_BASE_URL ?? 'http://localhost:3001/api',
  );
}

export function getAppOrigin() {
  return trimTrailingSlash(process.env.NEXT_PUBLIC_APP_ORIGIN ?? 'http://localhost:3000');
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getServerApiBaseUrl()}${path}`, {
    cache: 'no-store',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `API request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export function createPublicApiUrl(path: string) {
  return `${getPublicApiBaseUrl()}${path}`;
}

export async function getActivityBySlug(slug: string) {
  return fetchJson<ActivitySummary>(`/activities/slug/${encodeURIComponent(slug)}`);
}

export async function getActivities() {
  return fetchJson<ActivityListResponse>('/activities');
}

export async function createActivity(
  apiBaseUrl: string,
  body: { title: string; participationMode?: ParticipationMode },
  adminPassword?: string,
) {
  const response = await fetch(`${trimTrailingSlash(apiBaseUrl)}/activities`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(adminPassword ? { 'x-admin-password': adminPassword } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    await throwApiError(response, '创建活动失败');
  }
  return (await response.json()) as ActivityListItem;
}

export async function getDashboard(activityId: string) {
  return fetchJson<DashboardPayload>(`/activities/${activityId}/dashboard`);
}

export async function getParticipantDetail(activityId: string, participantId: string) {
  return fetchJson<ParticipantDetail>(`/activities/${activityId}/participants/${participantId}/detail`);
}

export async function postLogin(
  apiBaseUrl: string,
  activityId: string,
  body: { name: string; clientType: 'mobile' | 'desktop' | 'unknown' },
) {
  const response = await fetch(`${trimTrailingSlash(apiBaseUrl)}/activities/${activityId}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    await throwApiError(response, '登录失败');
  }
  return (await response.json()) as LoginResponse;
}

export async function getMe(apiBaseUrl: string, activityId: string, sessionToken: string) {
  const response = await fetch(`${trimTrailingSlash(apiBaseUrl)}/activities/${activityId}/me`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
    cache: 'no-store',
  });
  if (!response.ok) {
    await throwApiError(response, '读取登录状态失败');
  }
  return (await response.json()) as MeResponse;
}

export async function getMeDetail(apiBaseUrl: string, activityId: string, sessionToken: string) {
  const response = await fetch(`${trimTrailingSlash(apiBaseUrl)}/activities/${activityId}/me/detail`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
    cache: 'no-store',
  });
  if (!response.ok) {
    await throwApiError(response, '读取 AI 评测详情失败');
  }
  return (await response.json()) as ParticipantDetail;
}

export async function getMeHistory(apiBaseUrl: string, activityId: string, sessionToken: string) {
  const response = await fetch(`${trimTrailingSlash(apiBaseUrl)}/activities/${activityId}/me/history`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
    cache: 'no-store',
  });
  if (!response.ok) {
    await throwApiError(response, '读取历史记录失败');
  }
  return (await response.json()) as ParticipantHistoryResponse;
}

export async function postSubmission(
  apiBaseUrl: string,
  activityId: string,
  sessionToken: string,
  body: { participantId?: string; promptText: string; source: 'mobile' | 'desktop' | 'unknown' },
) {
  const response = await fetch(`${trimTrailingSlash(apiBaseUrl)}/activities/${activityId}/submissions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    await throwApiError(response, '保存失败');
  }
  return (await response.json()) as SubmissionResponse;
}

export async function postPublishSubmission(apiBaseUrl: string, activityId: string, sessionToken: string) {
  const response = await fetch(`${trimTrailingSlash(apiBaseUrl)}/activities/${activityId}/submissions/publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
  });
  if (!response.ok) {
    await throwApiError(response, '提交失败');
  }
  return (await response.json()) as SubmissionResponse;
}

export async function postSelfEvaluation(apiBaseUrl: string, activityId: string, sessionToken: string) {
  const response = await fetch(`${trimTrailingSlash(apiBaseUrl)}/activities/${activityId}/me/evaluate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
  });
  if (!response.ok) {
    await throwApiError(response, '发起 AI 自测失败');
  }
  return (await response.json()) as EvaluationTriggerResponse;
}

export async function patchMyProductLink(
  apiBaseUrl: string,
  activityId: string,
  sessionToken: string,
  body: { productUrl: string | null },
) {
  const response = await fetch(`${trimTrailingSlash(apiBaseUrl)}/activities/${activityId}/me/product-link`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    await throwApiError(response, '保存产品地址失败');
  }
  return (await response.json()) as ProductLinkResponse;
}

export async function patchSettings(
  apiBaseUrl: string,
  activityId: string,
  body: Partial<{
    title: string;
    autoEvaluateEnabled: boolean;
    rankingVisible: boolean;
    pollingIntervalMs: number;
    themeMode: 'dark' | 'light';
    participationMode: ParticipationMode;
  }>,
  adminPassword?: string,
) {
  const response = await fetch(`${trimTrailingSlash(apiBaseUrl)}/activities/${activityId}/settings`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...buildAdminHeaders(adminPassword),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(parseApiErrorText(text, '更新设置失败'));
  }
  return (await response.json()) as { ok: true };
}

export async function triggerEvaluation(
  apiBaseUrl: string,
  activityId: string,
  body: { triggerMode: 'auto' | 'manual'; forceFullReevaluate: boolean; participantIds?: string[] },
  adminPassword?: string,
) {
  const response = await fetch(`${trimTrailingSlash(apiBaseUrl)}/activities/${activityId}/evaluations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAdminHeaders(adminPassword),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(parseApiErrorText(text, '触发 AI 点评失败'));
  }
  return (await response.json()) as EvaluationTriggerResponse;
}

export async function importParticipants(
  apiBaseUrl: string,
  activityId: string,
  participants: Array<{ displayName: string }>,
  adminPassword?: string,
) {
  const response = await fetch(`${trimTrailingSlash(apiBaseUrl)}/activities/${activityId}/participants/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAdminHeaders(adminPassword),
    },
    body: JSON.stringify({ participants }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(parseApiErrorText(text, '导入名单失败'));
  }
  return (await response.json()) as ImportParticipantsResponse;
}

export async function getActivityAiConfig(
  apiBaseUrl: string,
  activityId: string,
  adminPassword?: string,
) {
  const response = await fetch(`${trimTrailingSlash(apiBaseUrl)}/activities/${activityId}/ai-config`, {
    cache: 'no-store',
    headers: {
      ...buildAdminHeaders(adminPassword),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(parseApiErrorText(text, '读取 AI 配置失败'));
  }
  return (await response.json()) as ActivityAiConfig;
}

export async function patchActivityAiConfig(
  apiBaseUrl: string,
  activityId: string,
  body: {
    baseUrl: string;
    model: string;
    apiKey?: string;
    apiKeyChanged: boolean;
  },
  adminPassword?: string,
) {
  const response = await fetch(`${trimTrailingSlash(apiBaseUrl)}/activities/${activityId}/ai-config`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...buildAdminHeaders(adminPassword),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(parseApiErrorText(text, '保存 AI 配置失败'));
  }
  return (await response.json()) as ActivityAiConfig;
}

export async function testActivityAiConfig(
  apiBaseUrl: string,
  activityId: string,
  body: {
    baseUrl: string;
    model: string;
    apiKey?: string;
  },
  adminPassword?: string,
) {
  const response = await fetch(`${trimTrailingSlash(apiBaseUrl)}/activities/${activityId}/ai-config/test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAdminHeaders(adminPassword),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(parseApiErrorText(text, '测试连接失败'));
  }
  return (await response.json()) as ActivityAiConfigTestResponse;
}

export async function revealActivityAiKey(
  apiBaseUrl: string,
  activityId: string,
  adminPassword?: string,
) {
  const response = await fetch(`${trimTrailingSlash(apiBaseUrl)}/activities/${activityId}/ai-config/reveal-key`, {
    method: 'POST',
    headers: {
      ...buildAdminHeaders(adminPassword),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(parseApiErrorText(text, '读取 API Key 失败'));
  }
  return (await response.json()) as ActivityAiConfigRevealResponse;
}

export async function getDetailClient(apiBaseUrl: string, activityId: string, participantId: string) {
  const response = await fetch(
    `${trimTrailingSlash(apiBaseUrl)}/activities/${activityId}/participants/${participantId}/detail`,
    { cache: 'no-store' },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || '读取同学详情失败');
  }
  return (await response.json()) as ParticipantDetail;
}

export async function getDashboardClient(apiBaseUrl: string, activityId: string) {
  const response = await fetch(`${trimTrailingSlash(apiBaseUrl)}/activities/${activityId}/dashboard`, {
    cache: 'no-store',
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || '读取大屏数据失败');
  }
  return (await response.json()) as DashboardPayload;
}
