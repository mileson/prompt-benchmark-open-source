/*
## 核心功能
维护 ai-config.service.ts 在 Prompt Benchmark 中的实现职责，支撑 业务 API 模块。

## 输入
来自上游页面、服务、配置、用户动作、测试或构建流程的数据。

## 输出
向调用方提供函数、类型、视图、状态、配置或处理结果。

## 定位
位于 apps/api/src/modules/ai-config，只承担该目录约定的局部职责。

## 依赖
依赖同目录或相邻模块、项目配置以及运行时框架提供的能力。

## 维护规则
修改逻辑、输入输出、外部依赖或职责边界后，同步更新本文件说明书和所在文件夹 README。
*/
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

import {
  DEFAULT_AI_BASE_URL,
  DEFAULT_AI_MODEL,
  STANDARD_AI_MODE,
} from '../../common/constants/domain.constants';
import { AdminAccessService } from '../../common/admin-access/admin-access.service';
import { BackendDataSourceService } from '../../common/data-source/data-source.service';
import { assertSupabaseNoError } from '../../common/supabase/supabase-error.util';
import { ActivitiesService } from '../activities/activities.service';
import { TestActivityAiConfigDto } from './dto/test-activity-ai-config.dto';
import { UpdateActivityAiConfigDto } from './dto/update-activity-ai-config.dto';
import {
  StandardAiClientService,
  type StandardAiRuntimeConfig,
} from './standard-ai-client.service';

type ActivityAiConfigRow = {
  activity_id: string;
  base_url: string;
  model_name: string;
  api_key_encrypted: string | null;
  api_key_masked: string | null;
};

@Injectable()
export class AiConfigService {
  constructor(
    private readonly dataSourceService: BackendDataSourceService,
    private readonly activitiesService: ActivitiesService,
    private readonly configService: ConfigService,
    private readonly adminAccessService: AdminAccessService,
    private readonly standardAiClientService: StandardAiClientService,
  ) {}

  private get client() {
    return this.dataSourceService.client;
  }

  async getManageConfig(activityId: string, adminPassword?: string) {
    this.adminAccessService.assertAccess(adminPassword);
    await this.activitiesService.getByIdOrThrow(activityId);

    const row = await this.readStoredConfig(activityId);
    const fallbackApiKey = this.getFallbackApiKey();

    return this.buildManageConfigResponse(row, fallbackApiKey.length > 0);
  }

  async updateConfig(activityId: string, dto: UpdateActivityAiConfigDto, adminPassword?: string) {
    this.adminAccessService.assertAccess(adminPassword);
    await this.activitiesService.getByIdOrThrow(activityId);
    await this.ensureAiConfigStorageReady();

    const existing = await this.readStoredConfig(activityId);
    const baseUrl = dto.baseUrl !== undefined
      ? this.normalizeBaseUrl(dto.baseUrl)
      : (existing?.base_url ?? this.getDefaultBaseUrl());
    const model = dto.model !== undefined
      ? this.normalizeModel(dto.model)
      : (existing?.model_name ?? this.getDefaultModel());

    let apiKeyEncrypted = existing?.api_key_encrypted ?? null;
    let apiKeyMasked = existing?.api_key_masked ?? null;
    if (dto.apiKeyChanged) {
      const apiKey = this.normalizeApiKey(dto.apiKey ?? '');
      if (apiKey.length > 0) {
        apiKeyEncrypted = this.encrypt(apiKey);
        apiKeyMasked = this.maskApiKey(apiKey);
      } else {
        apiKeyEncrypted = null;
        apiKeyMasked = null;
      }
    }

    const { error } = await this.client
      .from('activity_ai_configs')
      .upsert(
        {
          activity_id: activityId,
          base_url: baseUrl,
          model_name: model,
          api_key_encrypted: apiKeyEncrypted,
          api_key_masked: apiKeyMasked,
        },
        { onConflict: 'activity_id' },
      );
    assertSupabaseNoError(error, '保存 AI 配置失败');

    return this.buildManageConfigResponse(
      {
        activity_id: activityId,
        base_url: baseUrl,
        model_name: model,
        api_key_encrypted: apiKeyEncrypted,
        api_key_masked: apiKeyMasked,
      },
      this.getFallbackApiKey().length > 0,
    );
  }

  async revealApiKey(activityId: string, adminPassword?: string) {
    this.adminAccessService.assertAccess(adminPassword);
    await this.activitiesService.getByIdOrThrow(activityId);

    const row = await this.readStoredConfig(activityId);
    if (!row?.api_key_encrypted) {
      throw new NotFoundException('尚未配置自定义 API Key');
    }

    return {
      apiKey: this.decrypt(row.api_key_encrypted),
    };
  }

  async testConfig(activityId: string, dto: TestActivityAiConfigDto, adminPassword?: string) {
    this.adminAccessService.assertAccess(adminPassword);
    await this.activitiesService.getByIdOrThrow(activityId);

    const runtimeConfig = await this.resolveRuntimeConfig(activityId, dto);
    return this.standardAiClientService.testConnection(runtimeConfig);
  }

  async getRuntimeConfigForActivity(activityId: string): Promise<StandardAiRuntimeConfig> {
    return this.resolveRuntimeConfig(activityId);
  }

  getModelNameForActivity(activityId: string) {
    return this.readStoredConfig(activityId).then((row) => row?.model_name ?? this.getDefaultModel());
  }

  private async resolveRuntimeConfig(activityId: string, overrides?: TestActivityAiConfigDto) {
    const row = await this.readStoredConfig(activityId);
    const storedApiKey = row?.api_key_encrypted ? this.decrypt(row.api_key_encrypted) : '';
    const fallbackApiKey = this.getFallbackApiKey();
    const overrideApiKey = overrides?.apiKey !== undefined ? this.normalizeApiKey(overrides.apiKey) : null;

    const baseUrl = overrides?.baseUrl !== undefined
      ? this.normalizeBaseUrl(overrides.baseUrl)
      : (row?.base_url ?? this.getDefaultBaseUrl());
    const model = overrides?.model !== undefined
      ? this.normalizeModel(overrides.model)
      : (row?.model_name ?? this.getDefaultModel());
    const apiKey = overrideApiKey !== null
      ? overrideApiKey
      : (storedApiKey || fallbackApiKey);

    if (!apiKey) {
      throw new BadRequestException('请先配置 API Key');
    }

    return {
      baseUrl,
      model,
      apiKey,
    } satisfies StandardAiRuntimeConfig;
  }

  private buildManageConfigResponse(row: ActivityAiConfigRow | null, hasFallbackApiKey: boolean) {
    return {
      mode: STANDARD_AI_MODE,
      baseUrl: row?.base_url ?? this.getDefaultBaseUrl(),
      model: row?.model_name ?? this.getDefaultModel(),
      apiKeyMasked: row?.api_key_masked ?? null,
      hasStoredApiKey: Boolean(row?.api_key_encrypted),
      hasFallbackApiKey: !row?.api_key_encrypted && hasFallbackApiKey,
    };
  }

  private async readStoredConfig(activityId: string): Promise<ActivityAiConfigRow | null> {
    const capabilities = await this.dataSourceService.getPromptBenchmarkSchemaCapabilities();
    if (!capabilities.hasActivityAiConfig) {
      return null;
    }

    const { data, error } = await this.client
      .from('activity_ai_configs')
      .select('activity_id, base_url, model_name, api_key_encrypted, api_key_masked')
      .eq('activity_id', activityId)
      .maybeSingle();
    assertSupabaseNoError(error, '读取 AI 配置失败');

    if (!data) {
      return null;
    }

    return data as ActivityAiConfigRow;
  }

  private async ensureAiConfigStorageReady() {
    const capabilities = await this.dataSourceService.getPromptBenchmarkSchemaCapabilities();
    if (!capabilities.hasActivityAiConfig) {
      throw new BadRequestException('当前环境尚未启用 AI 配置，请先执行数据库迁移');
    }
  }

  private getDefaultBaseUrl() {
    return this.normalizeBaseUrl(
      this.configService.get<string>('AI_BASE_URL')
      ?? this.configService.get<string>('STANDARD_AI_BASE_URL')
      ?? this.configService.get<string>('SILICONFLOW_BASE_URL')
      ?? DEFAULT_AI_BASE_URL,
    );
  }

  private getDefaultModel() {
    return this.normalizeModel(
      this.configService.get<string>('AI_MODEL')
      ?? this.configService.get<string>('STANDARD_AI_MODEL')
      ?? this.configService.get<string>('SILICONFLOW_MODEL')
      ?? DEFAULT_AI_MODEL,
    );
  }

  private getFallbackApiKey() {
    return this.normalizeApiKey(
      this.configService.get<string>('AI_API_KEY')
      ?? this.configService.get<string>('STANDARD_AI_API_KEY')
      ?? this.configService.get<string>('SILICONFLOW_API_KEY')
      ?? '',
    );
  }

  private normalizeBaseUrl(value: string) {
    const normalized = value.trim().replace(/\/+$/, '');
    if (!normalized) {
      throw new BadRequestException('Base URL 不能为空');
    }

    return normalized;
  }

  private normalizeModel(value: string) {
    const normalized = value.trim();
    if (!normalized) {
      throw new BadRequestException('Model 不能为空');
    }

    return normalized;
  }

  private normalizeApiKey(value: string) {
    return value.trim();
  }

  private maskApiKey(value: string) {
    if (value.length <= 8) {
      return '*'.repeat(Math.max(value.length, 4));
    }

    return `${value.slice(0, 3)}${'*'.repeat(Math.max(value.length - 7, 8))}${value.slice(-4)}`;
  }

  private encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.getEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
  }

  private decrypt(payload: string) {
    const [ivBase64, tagBase64, encryptedBase64] = payload.split('.');
    if (!ivBase64 || !tagBase64 || !encryptedBase64) {
      throw new BadRequestException('API Key 加密数据损坏');
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.getEncryptionKey(),
      Buffer.from(ivBase64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagBase64, 'base64'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedBase64, 'base64')),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }

  private getEncryptionKey() {
    const secret = this.configService.get<string>('AI_CONFIG_ENCRYPTION_SECRET')
      ?? this.configService.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY');

    return createHash('sha256').update(secret).digest();
  }
}
