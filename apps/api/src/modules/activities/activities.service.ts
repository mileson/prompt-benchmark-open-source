/*
## 核心功能
维护 activities.service.ts 在 Prompt Benchmark 中的实现职责，支撑 业务 API 模块。

## 输入
来自上游页面、服务、配置、用户动作、测试或构建流程的数据。

## 输出
向调用方提供函数、类型、视图、状态、配置或处理结果。

## 定位
位于 apps/api/src/modules/activities，只承担该目录约定的局部职责。

## 依赖
依赖同目录或相邻模块、项目配置以及运行时框架提供的能力。

## 维护规则
修改逻辑、输入输出、外部依赖或职责边界后，同步更新本文件说明书和所在文件夹 README。
*/
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { AdminAccessService } from '../../common/admin-access/admin-access.service';
import { PARTICIPATION_MODES, type ParticipationMode } from '../../common/constants/domain.constants';
import { BackendDataSourceService } from '../../common/data-source/data-source.service';
import { assertSupabaseNoError } from '../../common/supabase/supabase-error.util';
import { stripUndefined } from '../../common/utils/object.util';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivitySettingsDto } from './dto/update-activity-settings.dto';

type ActivityRow = {
  id: string;
  title: string;
  slug: string;
  status: 'draft' | 'live' | 'archived';
  direct_entry_url: string | null;
  auto_evaluate_enabled: boolean;
  ranking_visible: boolean;
  polling_interval_ms: number;
  theme_mode: 'dark' | 'light';
  participation_mode?: ParticipationMode | null;
  rubric_version: string;
  created_at: string;
  updated_at: string;
};

type ActivityCounts = {
  participantCount: number;
  submittedCount: number;
  scoredCount: number;
};

const DEFAULT_PARTICIPATION_MODE: ParticipationMode = 'allowlist';

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly dataSourceService: BackendDataSourceService,
    private readonly adminAccessService: AdminAccessService,
  ) {}

  private get client() {
    return this.dataSourceService.client;
  }

  getParticipationMode(activity: { participation_mode?: string | null }): ParticipationMode {
    return PARTICIPATION_MODES.includes(activity.participation_mode as ParticipationMode)
      ? activity.participation_mode as ParticipationMode
      : DEFAULT_PARTICIPATION_MODE;
  }

  private toActivitySummary(activity: ActivityRow, publicSlug = activity.slug) {
    return {
      id: activity.id,
      slug: publicSlug,
      title: activity.title,
      status: activity.status,
      directEntryUrl: `/join/${publicSlug}`,
      autoEvaluateEnabled: activity.auto_evaluate_enabled,
      rankingVisible: activity.ranking_visible,
      pollingIntervalMs: activity.polling_interval_ms,
      themeMode: activity.theme_mode,
      participationMode: this.getParticipationMode(activity),
      rubricVersion: activity.rubric_version,
    };
  }

  private async listActivityRowsAscending() {
    const { data, error } = await this.client
      .from('activities')
      .select('*')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    assertSupabaseNoError(error, '查询活动列表失败');

    return (data ?? []) as ActivityRow[];
  }

  private publicSlugForIndex(index: number) {
    return String(index + 1);
  }

  private withPublicRoute(activity: ActivityRow, index: number, preferredSlug?: string) {
    const publicSlug = preferredSlug ?? this.publicSlugForIndex(index);

    return {
      ...activity,
      slug: publicSlug,
      direct_entry_url: `/join/${publicSlug}`,
    };
  }

  private parsePublicActivityIndex(value: string) {
    if (!/^[1-9]\d*$/.test(value)) {
      return null;
    }

    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
      return null;
    }

    return parsed - 1;
  }

  private async generateNextActivitySlug() {
    const rows = await this.listActivityRowsAscending();
    const usedSlugs = new Set(rows.map((activity) => activity.slug));

    for (let nextNumber = rows.length + 1; nextNumber < rows.length + 100; nextNumber += 1) {
      const slug = String(nextNumber);
      if (!usedSlugs.has(slug)) {
        return slug;
      }
    }

    return Date.now().toString(36);
  }

  private async getActivityCounts(activityId: string): Promise<ActivityCounts> {
    const [participants, submitted, scored] = await Promise.all([
      this.client
        .from('participants')
        .select('id', { count: 'exact', head: true })
        .eq('activity_id', activityId),
      this.client
        .from('participants')
        .select('id', { count: 'exact', head: true })
        .eq('activity_id', activityId)
        .in('status', ['submitted', 'evaluating', 'scored']),
      this.client
        .from('participants')
        .select('id', { count: 'exact', head: true })
        .eq('activity_id', activityId)
        .eq('status', 'scored'),
    ]);

    assertSupabaseNoError(participants.error, '统计活动人数失败');
    assertSupabaseNoError(submitted.error, '统计活动提交失败');
    assertSupabaseNoError(scored.error, '统计活动评分失败');

    return {
      participantCount: participants.count ?? 0,
      submittedCount: submitted.count ?? 0,
      scoredCount: scored.count ?? 0,
    };
  }

  async listActivities() {
    const rows = await this.listActivityRowsAscending();
    const items = await Promise.all(
      rows.map(async (activity, index) => {
        const counts = await this.getActivityCounts(activity.id);
        const publicSlug = this.publicSlugForIndex(index);

        return {
          ...this.toActivitySummary(activity, publicSlug),
          ...counts,
          createdAt: activity.created_at,
          updatedAt: activity.updated_at,
        };
      }),
    );

    return { activities: items.reverse() };
  }

  async getByIdOrThrow(activityId: string) {
    const { data, error } = await this.client
      .from('activities')
      .select('*')
      .eq('id', activityId)
      .maybeSingle();

    assertSupabaseNoError(error, '查询活动失败');

    if (!data) {
      throw new NotFoundException('活动不存在');
    }

    return data;
  }

  async createActivity(dto: CreateActivityDto, adminPassword?: string) {
    this.adminAccessService.assertAccess(adminPassword);

    const title = dto.title.trim();
    if (!title) {
      throw new BadRequestException('活动名称不能为空');
    }

    const capabilities = await this.dataSourceService.getPromptBenchmarkSchemaCapabilities();
    const participationMode = dto.participationMode ?? DEFAULT_PARTICIPATION_MODE;
    const slug = await this.generateNextActivitySlug();
    const { data, error } = await this.client
      .from('activities')
      .insert(stripUndefined({
        title,
        slug,
        status: 'live',
        direct_entry_url: `/join/${slug}`,
        auto_evaluate_enabled: true,
        ranking_visible: true,
        polling_interval_ms: 2000,
        theme_mode: 'dark',
        participation_mode: capabilities.hasActivityParticipationMode ? participationMode : undefined,
        rubric_version: 'v1',
      }))
      .select('*')
      .single();
    assertSupabaseNoError(error, '创建活动失败');

    const activity = data as ActivityRow;

    return {
      ...this.toActivitySummary(activity, slug),
      participantCount: 0,
      submittedCount: 0,
      scoredCount: 0,
      createdAt: activity.created_at,
      updatedAt: activity.updated_at,
    };
  }

  async getBySlugOrThrow(slug: string) {
    const rows = await this.listActivityRowsAscending();
    const exactIndex = rows.findIndex((activity) => activity.slug === slug);
    if (exactIndex >= 0) {
      const preferredSlug = this.parsePublicActivityIndex(slug) === null
        ? undefined
        : slug;
      return this.withPublicRoute(rows[exactIndex], exactIndex, preferredSlug);
    }

    const publicIndex = this.parsePublicActivityIndex(slug);
    if (publicIndex !== null && rows[publicIndex]) {
      return this.withPublicRoute(rows[publicIndex], publicIndex, slug);
    }

    throw new NotFoundException('活动不存在');
  }

  async updateSettings(activityId: string, dto: UpdateActivitySettingsDto, adminPassword?: string) {
    this.adminAccessService.assertAccess(adminPassword);
    const capabilities = await this.dataSourceService.getPromptBenchmarkSchemaCapabilities();
    await this.getByIdOrThrow(activityId);

    const title = dto.title === undefined ? undefined : dto.title.trim();
    if (dto.title !== undefined && !title) {
      throw new BadRequestException('活动名称不能为空');
    }

    if (dto.participationMode !== undefined && !capabilities.hasActivityParticipationMode) {
      throw new BadRequestException('当前环境暂不支持同学参加方式，请先完成数据库升级');
    }

    const payload = stripUndefined({
      title,
      auto_evaluate_enabled: dto.autoEvaluateEnabled,
      ranking_visible: dto.rankingVisible,
      polling_interval_ms: dto.pollingIntervalMs,
      theme_mode: dto.themeMode,
      participation_mode: dto.participationMode,
    });

    const { error } = await this.client.from('activities').update(payload).eq('id', activityId);
    assertSupabaseNoError(error, '更新活动设置失败');

    return { ok: true };
  }
}
