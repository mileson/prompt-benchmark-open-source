/*
## 核心功能
维护 submissions.service.ts 在 Prompt Benchmark 中的实现职责，支撑 业务 API 模块。

## 输入
来自上游页面、服务、配置、用户动作、测试或构建流程的数据。

## 输出
向调用方提供函数、类型、视图、状态、配置或处理结果。

## 定位
位于 apps/api/src/modules/submissions，只承担该目录约定的局部职责。

## 依赖
依赖同目录或相邻模块、项目配置以及运行时框架提供的能力。

## 维护规则
修改逻辑、输入输出、外部依赖或职责边界后，同步更新本文件说明书和所在文件夹 README。
*/
import { BadRequestException, Injectable } from '@nestjs/common';

import { type SourceType } from '../../common/constants/domain.constants';
import {
  BackendDataSourceService,
  type PromptBenchmarkSchemaCapabilities,
} from '../../common/data-source/data-source.service';
import { assertSupabaseNoError } from '../../common/supabase/supabase-error.util';
import { ActivitiesService } from '../activities/activities.service';
import { EvaluationsService } from '../evaluations/evaluations.service';
import { ParticipantsService } from '../participants/participants.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';

@Injectable()
export class SubmissionsService {
  constructor(
    private readonly dataSourceService: BackendDataSourceService,
    private readonly activitiesService: ActivitiesService,
    private readonly participantsService: ParticipantsService,
    private readonly evaluationsService: EvaluationsService,
  ) {}

  private get client() {
    return this.dataSourceService.client;
  }

  private async getSchemaCapabilities() {
    return this.dataSourceService.getPromptBenchmarkSchemaCapabilities();
  }

  private getPublishedVersion(participant: any, capabilities: PromptBenchmarkSchemaCapabilities) {
    if (capabilities.hasLatestPublishedVersion) {
      return Number(participant.latest_published_version ?? 0);
    }

    if (
      participant.status === 'submitted' ||
      participant.status === 'evaluating' ||
      participant.status === 'scored'
    ) {
      return Number(participant.latest_submission_version ?? 0);
    }

    return 0;
  }

  private resolveDraftSaveStatus(participant: any, capabilities: PromptBenchmarkSchemaCapabilities) {
    return this.getPublishedVersion(participant, capabilities) > 0 ? participant.status : 'logged_in';
  }

  private resolvePublishedStatus(
    participant: any,
    publishVersion: number,
    capabilities: PromptBenchmarkSchemaCapabilities,
  ) {
    const isCurrentVersionEvaluating =
      participant.latest_submission_version === publishVersion &&
      (participant.evaluation_state === 'queued' || participant.evaluation_state === 'running');

    if (isCurrentVersionEvaluating) {
      return 'evaluating';
    }

    if (
      participant.latest_evaluated_version === publishVersion
    ) {
      return 'scored';
    }

    return 'submitted';
  }

  async saveSubmission(activityId: string, authorization: string | undefined, dto: CreateSubmissionDto) {
    const { participant } = await this.participantsService.getSessionContext(activityId, authorization);
    const capabilities = await this.getSchemaCapabilities();

    if (dto.participantId && dto.participantId !== participant.id) {
      throw new BadRequestException('participantId 与当前登录同学不一致');
    }

    const nextVersion = Number(participant.latest_submission_version ?? 0) + 1;
    const now = new Date().toISOString();
    const source: SourceType = dto.source ?? 'unknown';

    const { error: insertError } = await this.client.from('submissions').insert({
      activity_id: activityId,
      participant_id: participant.id,
      version: nextVersion,
      prompt_text: dto.promptText,
      is_latest: false,
      source,
    });
    assertSupabaseNoError(insertError, '保存新提交失败');

    if ((participant.latest_submission_version ?? 0) > 0) {
      const { error: markOldError } = await this.client
        .from('submissions')
        .update({ is_latest: false })
        .eq('participant_id', participant.id)
        .eq('is_latest', true);
      assertSupabaseNoError(markOldError, '标记旧提交失败');
    }

    const { error: markNewError } = await this.client
      .from('submissions')
      .update({ is_latest: true })
      .eq('participant_id', participant.id)
      .eq('version', nextVersion);
    assertSupabaseNoError(markNewError, '标记最新提交失败');

    const { error: updateParticipantError } = await this.client
      .from('participants')
      .update({
        latest_submission_version: nextVersion,
        status: this.resolveDraftSaveStatus(participant, capabilities),
        evaluation_state: participant.latest_evaluated_version ? 'stale' : 'idle',
      })
      .eq('id', participant.id);
    assertSupabaseNoError(updateParticipantError, '更新同学提交状态失败');

    return {
      participantId: participant.id,
      status: this.resolveDraftSaveStatus(participant, capabilities),
      version: nextVersion,
      latestPublishedVersion: this.getPublishedVersion(participant, capabilities),
      evaluationState: participant.latest_evaluated_version ? 'stale' : 'idle',
      savedAt: now,
    };
  }

  async publishSubmission(activityId: string, authorization: string | undefined) {
    const { participant } = await this.participantsService.getSessionContext(activityId, authorization);
    const activity = await this.activitiesService.getByIdOrThrow(activityId);
    const capabilities = await this.getSchemaCapabilities();

    const publishVersion = Number(participant.latest_submission_version ?? 0);
    if (publishVersion === 0) {
      throw new BadRequestException('请先保存提示词，再提交到大屏');
    }

    const now = new Date().toISOString();
    const nextStatus = this.resolvePublishedStatus(participant, publishVersion, capabilities);

    const updatePayload: Record<string, unknown> = {
      status: nextStatus,
    };

    if (capabilities.hasLatestPublishedVersion) {
      updatePayload.latest_published_version = publishVersion;
    }

    const { error } = await this.client
      .from('participants')
      .update(updatePayload)
      .eq('id', participant.id);
    assertSupabaseNoError(error, '更新大屏提交状态失败');

    if (activity.auto_evaluate_enabled) {
      await this.evaluationsService.enqueueForPublishedParticipant(activityId, participant.id, 'auto', false);
    }

    const { data: refreshedParticipant, error: refreshedParticipantError } = await this.client
      .from('participants')
      .select('*')
      .eq('id', participant.id)
      .single();
    assertSupabaseNoError(refreshedParticipantError, '刷新大屏提交后的同学状态失败');

    return {
      participantId: refreshedParticipant.id,
      status: refreshedParticipant.status,
      version: publishVersion,
      latestPublishedVersion: publishVersion,
      evaluationState: refreshedParticipant.evaluation_state,
      savedAt: now,
    };
  }
}
