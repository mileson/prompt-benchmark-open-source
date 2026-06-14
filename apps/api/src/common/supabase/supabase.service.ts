/*
## 核心功能
维护 supabase.service.ts 在 Prompt Benchmark 中的实现职责，支撑 公共基础设施。

## 输入
来自上游页面、服务、配置、用户动作、测试或构建流程的数据。

## 输出
向调用方提供函数、类型、视图、状态、配置或处理结果。

## 定位
位于 apps/api/src/common/supabase，只承担该目录约定的局部职责。

## 依赖
依赖同目录或相邻模块、项目配置以及运行时框架提供的能力。

## 维护规则
修改逻辑、输入输出、外部依赖或职责边界后，同步更新本文件说明书和所在文件夹 README。
*/
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { stripUndefined } from '../utils/object.util';

export type PromptBenchmarkSchemaCapabilities = {
  hasLatestPublishedVersion: boolean;
  hasEvaluationJobScope: boolean;
  hasEvaluationJobTargetVersion: boolean;
  hasProductUrl: boolean;
  hasActivityAiConfig: boolean;
  hasActivityParticipationMode: boolean;
};

@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  readonly client: SupabaseClient;
  private schemaCapabilitiesPromise: Promise<PromptBenchmarkSchemaCapabilities> | null = null;

  constructor(private readonly configService: ConfigService) {
    const provider = this.configService.get<string>('DATA_SOURCE_PROVIDER') ?? 'supabase';
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL')?.trim();
    const supabaseServiceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')?.trim();

    if (provider !== 'supabase' && (!supabaseUrl || !supabaseServiceRoleKey)) {
      this.client = this.createUnconfiguredClient();
      return;
    }

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required when DATA_SOURCE_PROVIDER=supabase.');
    }

    this.client = createClient(
      supabaseUrl,
      supabaseServiceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        global: {
          fetch: this.fetchWithDiagnostics.bind(this),
        },
      },
    );
  }

  private createUnconfiguredClient(): SupabaseClient {
    return new Proxy({}, {
      get() {
        throw new Error('Supabase is not configured because DATA_SOURCE_PROVIDER is not supabase.');
      },
    }) as SupabaseClient;
  }

  private async fetchWithDiagnostics(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    try {
      return await fetch(input, init);
    } catch (error) {
      this.logger.error(`Supabase fetch failed: ${this.describeFetchFailure(input, error)}`);
      throw error;
    }
  }

  private describeFetchFailure(input: RequestInfo | URL, error: unknown) {
    const target = this.describeFetchTarget(input);
    const base = error instanceof Error
      ? { name: error.name, message: error.message }
      : { name: typeof error, message: String(error) };
    const cause = error instanceof Error && 'cause' in error
      ? this.describeErrorCause((error as Error & { cause?: unknown }).cause)
      : undefined;

    return JSON.stringify(stripUndefined({ target, ...base, cause }));
  }

  private describeFetchTarget(input: RequestInfo | URL) {
    const rawUrl = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

    try {
      const url = new URL(rawUrl);
      return { protocol: url.protocol, host: url.host, pathname: url.pathname };
    } catch {
      return { rawType: typeof input };
    }
  }

  private describeErrorCause(cause: unknown) {
    if (!cause || typeof cause !== 'object') {
      return undefined;
    }

    const record = cause as Record<string, unknown>;

    return stripUndefined({
      name: typeof record.name === 'string' ? record.name : undefined,
      message: typeof record.message === 'string' ? record.message : undefined,
      code: typeof record.code === 'string' ? record.code : undefined,
      errno: typeof record.errno === 'number' ? record.errno : undefined,
      syscall: typeof record.syscall === 'string' ? record.syscall : undefined,
      hostname: typeof record.hostname === 'string' ? record.hostname : undefined,
    });
  }

  async getPromptBenchmarkSchemaCapabilities(): Promise<PromptBenchmarkSchemaCapabilities> {
    if (!this.schemaCapabilitiesPromise) {
      this.schemaCapabilitiesPromise = this.detectPromptBenchmarkSchemaCapabilities();
    }

    return this.schemaCapabilitiesPromise;
  }

  private async detectPromptBenchmarkSchemaCapabilities(): Promise<PromptBenchmarkSchemaCapabilities> {
    const [
      hasLatestPublishedVersion,
      hasSubmissionScope,
      hasTargetParticipantId,
      hasTargetSubmissionVersion,
      hasProductUrl,
      hasActivityAiConfig,
      hasActivityParticipationMode,
    ] = await Promise.all([
      this.hasColumn('participants', 'latest_published_version'),
      this.hasColumn('evaluation_jobs', 'submission_scope'),
      this.hasColumn('evaluation_jobs', 'target_participant_id'),
      this.hasColumn('evaluation_jobs', 'target_submission_version'),
      this.hasColumn('participants', 'product_url'),
      this.hasTable('activity_ai_configs'),
      this.hasColumn('activities', 'participation_mode'),
    ]);

    return {
      hasLatestPublishedVersion,
      hasEvaluationJobScope: hasSubmissionScope && hasTargetParticipantId,
      hasEvaluationJobTargetVersion: hasTargetSubmissionVersion,
      hasProductUrl,
      hasActivityAiConfig,
      hasActivityParticipationMode,
    };
  }

  private async hasTable(table: string) {
    const { error } = await this.client.from(table).select('*').limit(1);

    if (!error) {
      return true;
    }

    const message = error.message ?? '';
    if (
      message.includes(table) &&
      (
        /does not exist/i.test(message) ||
        /schema cache/i.test(message) ||
        /Could not find/i.test(message) ||
        /relation/i.test(message)
      )
    ) {
      return false;
    }

    return true;
  }

  private async hasColumn(table: string, column: string) {
    const { error } = await this.client.from(table).select(column).limit(1);

    if (!error) {
      return true;
    }

    const message = error.message ?? '';
    if (
      message.includes(column) &&
      (
        /does not exist/i.test(message) ||
        /schema cache/i.test(message) ||
        /Could not find/i.test(message)
      )
    ) {
      return false;
    }

    return true;
  }
}
