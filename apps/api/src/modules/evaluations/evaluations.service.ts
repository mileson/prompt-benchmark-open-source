/*
## 核心功能
维护 evaluations.service.ts 在 Prompt Benchmark 中的实现职责，支撑 业务 API 模块。

## 输入
来自上游页面、服务、配置、用户动作、测试或构建流程的数据。

## 输出
向调用方提供函数、类型、视图、状态、配置或处理结果。

## 定位
位于 apps/api/src/modules/evaluations，只承担该目录约定的局部职责。

## 依赖
依赖同目录或相邻模块、项目配置以及运行时框架提供的能力。

## 维护规则
修改逻辑、输入输出、外部依赖或职责边界后，同步更新本文件说明书和所在文件夹 README。
*/
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { type ColorLevel, type EvaluationTriggerMode } from '../../common/constants/domain.constants';
import { AdminAccessService } from '../../common/admin-access/admin-access.service';
import {
  BackendDataSourceService,
  type PromptBenchmarkSchemaCapabilities,
} from '../../common/data-source/data-source.service';
import { assertSupabaseNoError } from '../../common/supabase/supabase-error.util';
import { ActivitiesService } from '../activities/activities.service';
import { AiConfigService } from '../ai-config/ai-config.service';
import {
  StandardAiClientService,
  type StandardAiEvaluationInput,
  type StandardAiEvaluationOutput,
} from '../ai-config/standard-ai-client.service';
import { TriggerEvaluationDto } from './dto/trigger-evaluation.dto';

type SubmissionScope = 'published' | 'latest_submission';

type EvaluationCandidate = {
  participant: any;
  submission: any;
};

type EvaluationJobContext = {
  submissionScope: SubmissionScope;
  participantIds?: string[];
};

type EnqueueOptions = {
  submissionScope: SubmissionScope;
  participantIds?: string[];
};

type EnqueueResult = {
  jobId: string;
  jobStatus: 'queued' | 'running' | 'completed' | 'failed';
  participantCount: number;
  reused: boolean;
  queuedCount?: number;
  runningCount?: number;
  completedCount?: number;
  reusedCount?: number;
};

type RankedEvaluationResult = StandardAiEvaluationOutput & {
  totalScore: number;
  rank: number;
  colorLevel: ColorLevel;
};

const MAX_PARALLEL_JOBS = 4;

@Injectable()
export class EvaluationsService implements OnModuleInit {
  private readonly logger = new Logger(EvaluationsService.name);
  private readonly activeJobIds = new Set<string>();
  private readonly queuedJobIds = new Set<string>();
  private readonly pendingJobIds: string[] = [];
  private readonly forceFullReevaluateByJobId = new Map<string, boolean>();
  private readonly jobContextById = new Map<string, EvaluationJobContext>();

  constructor(
    private readonly dataSourceService: BackendDataSourceService,
    private readonly activitiesService: ActivitiesService,
    private readonly adminAccessService: AdminAccessService,
    private readonly aiConfigService: AiConfigService,
    private readonly standardAiClientService: StandardAiClientService,
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

  async onModuleInit() {
    try {
      const { data: openJobs, error } = await this.client
        .from('evaluation_jobs')
        .select('id')
        .in('job_status', ['queued', 'running'])
        .order('created_at', { ascending: true })
        .limit(200);
      assertSupabaseNoError(error, '启动时恢复点评任务失败');

      for (const job of openJobs ?? []) {
        this.ensureProcessingJob(job.id, false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.error(`启动时恢复点评任务失败，已跳过自动恢复：${message}`);
    }
  }

  async triggerManual(activityId: string, dto: TriggerEvaluationDto, adminPassword?: string) {
    this.adminAccessService.assertAccess(adminPassword);
    return this.enqueueForActivity(
      activityId,
      dto.triggerMode ?? 'manual',
      dto.forceFullReevaluate ?? false,
      dto.participantIds,
    );
  }

  async enqueueForActivity(
    activityId: string,
    triggerMode: EvaluationTriggerMode,
    forceFullReevaluate: boolean,
    participantIds?: string[],
  ) {
    await this.activitiesService.getByIdOrThrow(activityId);
    const capabilities = await this.getSchemaCapabilities();

    if (!capabilities.hasEvaluationJobScope) {
      return this.enqueueLegacyBatchForScope(
        activityId,
        triggerMode,
        forceFullReevaluate,
        { submissionScope: 'published', participantIds },
        capabilities,
      );
    }

    return this.enqueueTargetedJobsForScope(
      activityId,
      triggerMode,
      forceFullReevaluate,
      { submissionScope: 'published', participantIds },
      capabilities,
    );
  }

  async enqueueForPublishedParticipant(
    activityId: string,
    participantId: string,
    triggerMode: EvaluationTriggerMode = 'auto',
    forceFullReevaluate = false,
  ) {
    await this.activitiesService.getByIdOrThrow(activityId);
    const capabilities = await this.getSchemaCapabilities();

    if (!capabilities.hasEvaluationJobScope) {
      return this.enqueueLegacyBatchForScope(
        activityId,
        triggerMode,
        forceFullReevaluate,
        { submissionScope: 'published', participantIds: [participantId] },
        capabilities,
      );
    }

    return this.enqueueTargetedJobsForScope(
      activityId,
      triggerMode,
      forceFullReevaluate,
      { submissionScope: 'published', participantIds: [participantId] },
      capabilities,
    );
  }

  async enqueueForParticipant(activityId: string, participantId: string) {
    await this.activitiesService.getByIdOrThrow(activityId);
    const capabilities = await this.getSchemaCapabilities();

    if (!capabilities.hasEvaluationJobScope) {
      return this.enqueueLegacyBatchForScope(
        activityId,
        'manual',
        true,
        { submissionScope: 'latest_submission', participantIds: [participantId] },
        capabilities,
      );
    }

    return this.enqueueTargetedJobsForScope(
      activityId,
      'manual',
      true,
      { submissionScope: 'latest_submission', participantIds: [participantId] },
      capabilities,
    );
  }

  private async enqueueTargetedJobsForScope(
    activityId: string,
    triggerMode: EvaluationTriggerMode,
    forceFullReevaluate: boolean,
    options: EnqueueOptions,
    capabilities: PromptBenchmarkSchemaCapabilities,
  ): Promise<EnqueueResult> {
    const modelName = await this.aiConfigService.getModelNameForActivity(activityId);
    const candidates = await this.getEvaluationCandidates(activityId, forceFullReevaluate, options, capabilities);

    if (candidates.length === 0) {
      return this.createEmptyJobResult(activityId, triggerMode, modelName, options, capabilities);
    }

    let jobId: string | null = null;
    let queuedCount = 0;
    let runningCount = 0;
    let completedCount = 0;
    let reusedCount = 0;

    for (const candidate of candidates) {
      const nextResult = await this.enqueueCandidateJob(
        activityId,
        triggerMode,
        modelName,
        options.submissionScope,
        candidate,
        forceFullReevaluate,
        capabilities,
      );

      jobId ??= nextResult.jobId;
      reusedCount += nextResult.reused ? 1 : 0;

      if (nextResult.jobStatus === 'queued') {
        queuedCount += 1;
      } else if (nextResult.jobStatus === 'running') {
        runningCount += 1;
      } else if (nextResult.jobStatus === 'completed') {
        completedCount += 1;
      }
    }

    return {
      jobId: jobId!,
      jobStatus: queuedCount > 0 ? 'queued' : runningCount > 0 ? 'running' : 'completed',
      participantCount: candidates.length,
      reused: reusedCount === candidates.length,
      queuedCount,
      runningCount,
      completedCount,
      reusedCount,
    };
  }

  private async enqueueLegacyBatchForScope(
    activityId: string,
    triggerMode: EvaluationTriggerMode,
    forceFullReevaluate: boolean,
    options: EnqueueOptions,
    capabilities: PromptBenchmarkSchemaCapabilities,
  ): Promise<EnqueueResult> {
    const modelName = await this.aiConfigService.getModelNameForActivity(activityId);
    const targetParticipantId = options.participantIds?.length === 1 ? options.participantIds[0] : undefined;
    const openJob = await this.findOpenJob(
      activityId,
      options.submissionScope,
      targetParticipantId,
      undefined,
      capabilities,
    );

    if (openJob) {
      this.jobContextById.set(openJob.id, {
        submissionScope: options.submissionScope,
        participantIds: options.participantIds,
      });
      this.ensureProcessingJob(openJob.id, forceFullReevaluate);
      return {
        jobId: openJob.id,
        jobStatus: openJob.job_status,
        participantCount: openJob.participant_count,
        reused: true,
        reusedCount: openJob.participant_count,
      };
    }

    const candidates = await this.getEvaluationCandidates(activityId, forceFullReevaluate, options, capabilities);
    if (candidates.length === 0) {
      return this.createEmptyJobResult(activityId, triggerMode, modelName, options, capabilities);
    }

    const insertPayload: Record<string, unknown> = {
      activity_id: activityId,
      trigger_mode: triggerMode,
      job_status: 'queued',
      model_name: modelName,
      participant_count: candidates.length,
    };

    if (capabilities.hasEvaluationJobScope) {
      insertPayload.submission_scope = options.submissionScope;

      if (targetParticipantId) {
        insertPayload.target_participant_id = targetParticipantId;
      }

      if (capabilities.hasEvaluationJobTargetVersion && candidates.length === 1) {
        insertPayload.target_submission_version = candidates[0]?.submission.version;
      }
    }

    const { data: job, error: jobError } = await this.client
      .from('evaluation_jobs')
      .insert(insertPayload)
      .select('*')
      .single();
    assertSupabaseNoError(jobError, '创建点评任务失败');

    await this.markCandidatesQueued(candidates, capabilities);
    this.jobContextById.set(job.id, {
      submissionScope: options.submissionScope,
      participantIds: options.participantIds,
    });
    this.ensureProcessingJob(job.id, forceFullReevaluate);

    return {
      jobId: job.id,
      jobStatus: job.job_status,
      participantCount: candidates.length,
      reused: false,
      queuedCount: candidates.length,
    };
  }

  private async enqueueCandidateJob(
    activityId: string,
    triggerMode: EvaluationTriggerMode,
    modelName: string,
    submissionScope: SubmissionScope,
    candidate: EvaluationCandidate,
    forceFullReevaluate: boolean,
    capabilities: PromptBenchmarkSchemaCapabilities,
  ) {
    const targetSubmissionVersion = capabilities.hasEvaluationJobTargetVersion
      ? Number(candidate.submission.version)
      : undefined;

    const shouldReuseOpenJob = submissionScope !== 'latest_submission' || capabilities.hasEvaluationJobTargetVersion;
    const openJob = shouldReuseOpenJob
      ? await this.findOpenJob(
          activityId,
          submissionScope,
          candidate.participant.id,
          targetSubmissionVersion,
          capabilities,
        )
      : null;

    if (openJob) {
      this.jobContextById.set(openJob.id, {
        submissionScope,
        participantIds: [candidate.participant.id],
      });
      this.ensureProcessingJob(openJob.id, forceFullReevaluate);

      return {
        jobId: openJob.id,
        jobStatus: openJob.job_status,
        reused: true,
      };
    }

    const insertPayload: Record<string, unknown> = {
      activity_id: activityId,
      trigger_mode: triggerMode,
      job_status: 'queued',
      model_name: modelName,
      participant_count: 1,
      submission_scope: submissionScope,
      target_participant_id: candidate.participant.id,
    };

    if (capabilities.hasEvaluationJobTargetVersion) {
      insertPayload.target_submission_version = candidate.submission.version;
    }

    const { data: job, error: jobError } = await this.client
      .from('evaluation_jobs')
      .insert(insertPayload)
      .select('*')
      .single();
    assertSupabaseNoError(jobError, '创建逐卡点评任务失败');

    await this.markCandidatesQueued([candidate], capabilities);
    this.jobContextById.set(job.id, {
      submissionScope,
      participantIds: [candidate.participant.id],
    });
    this.ensureProcessingJob(job.id, forceFullReevaluate);

    return {
      jobId: job.id,
      jobStatus: job.job_status,
      reused: false,
    };
  }

  private async createEmptyJobResult(
    activityId: string,
    triggerMode: EvaluationTriggerMode,
    modelName: string,
    options: EnqueueOptions,
    capabilities: PromptBenchmarkSchemaCapabilities,
  ): Promise<EnqueueResult> {
    const insertPayload: Record<string, unknown> = {
      activity_id: activityId,
      trigger_mode: triggerMode,
      job_status: 'completed',
      model_name: modelName,
      participant_count: 0,
      completed_at: new Date().toISOString(),
    };

    if (capabilities.hasEvaluationJobScope) {
      insertPayload.submission_scope = options.submissionScope;

      if (options.participantIds?.length === 1) {
        insertPayload.target_participant_id = options.participantIds[0];
      }
    }

    const { data: job, error } = await this.client
      .from('evaluation_jobs')
      .insert(insertPayload)
      .select('*')
      .single();
    assertSupabaseNoError(error, '创建空点评任务失败');

    return {
      jobId: job.id,
      jobStatus: job.job_status,
      participantCount: 0,
      reused: false,
      completedCount: 0,
    };
  }

  private getIdleStatus(participant: any, capabilities: PromptBenchmarkSchemaCapabilities) {
    return this.getPublishedVersion(participant, capabilities) > 0 ? 'submitted' : 'logged_in';
  }

  private getEvaluatingStatus(
    participant: any,
    submissionVersion: number,
    capabilities: PromptBenchmarkSchemaCapabilities,
  ) {
    return this.getPublishedVersion(participant, capabilities) === submissionVersion
      ? 'evaluating'
      : this.getIdleStatus(participant, capabilities);
  }

  private isCurrentVersionForScope(
    participant: any,
    submissionScope: SubmissionScope,
    submissionVersion: number,
    capabilities: PromptBenchmarkSchemaCapabilities,
  ) {
    if (submissionScope === 'published') {
      return this.getPublishedVersion(participant, capabilities) === submissionVersion;
    }

    return Number(participant.latest_submission_version ?? 0) === submissionVersion;
  }

  private getStatusAfterSuccessfulEvaluation(
    participant: any,
    submissionVersion: number,
    capabilities: PromptBenchmarkSchemaCapabilities,
  ) {
    return this.getPublishedVersion(participant, capabilities) === submissionVersion
      ? 'scored'
      : this.getIdleStatus(participant, capabilities);
  }

  private async markCandidatesQueued(
    candidates: EvaluationCandidate[],
    capabilities?: PromptBenchmarkSchemaCapabilities,
  ) {
    const nextCapabilities = capabilities ?? await this.getSchemaCapabilities();
    await Promise.all(
      candidates.map((candidate) =>
        this.client
          .from('participants')
          .update({
            status: this.getEvaluatingStatus(candidate.participant, candidate.submission.version, nextCapabilities),
            evaluation_state: 'queued',
          })
          .eq('id', candidate.participant.id),
      ),
    ).then((results) => {
      for (const result of results) {
        assertSupabaseNoError(result.error, '标记点评排队状态失败');
      }
    });
  }

  private async markCandidatesRunning(
    candidates: EvaluationCandidate[],
    capabilities?: PromptBenchmarkSchemaCapabilities,
  ) {
    const nextCapabilities = capabilities ?? await this.getSchemaCapabilities();
    await Promise.all(
      candidates.map((candidate) =>
        this.client
          .from('participants')
          .update({
            status: this.getEvaluatingStatus(candidate.participant, candidate.submission.version, nextCapabilities),
            evaluation_state: 'running',
          })
          .eq('id', candidate.participant.id),
      ),
    ).then((results) => {
      for (const result of results) {
        assertSupabaseNoError(result.error, '标记同学点评中失败');
      }
    });
  }

  private async resetCandidatesFailed(
    participantIds: string[],
    capabilities?: PromptBenchmarkSchemaCapabilities,
  ) {
    if (participantIds.length === 0) {
      return;
    }

    const nextCapabilities = capabilities ?? await this.getSchemaCapabilities();
    const { data: participants, error } = await this.client
      .from('participants')
      .select('*')
      .in('id', participantIds);
    assertSupabaseNoError(error, '查询失败回滚状态失败');

    await Promise.all(
      (participants ?? []).map((participant) =>
        this.client
          .from('participants')
          .update({
            status: this.getIdleStatus(participant, nextCapabilities),
            evaluation_state: 'failed',
          })
          .eq('id', participant.id),
      ),
    ).then((results) => {
      for (const result of results) {
        assertSupabaseNoError(result.error, '更新同学失败状态失败');
      }
    });
  }

  private async processJob(jobId: string, forceFullReevaluate: boolean) {
    try {
      const capabilities = await this.getSchemaCapabilities();
      const { data: job, error: jobError } = await this.client
        .from('evaluation_jobs')
        .select('*')
        .eq('id', jobId)
        .single();
      assertSupabaseNoError(jobError, '读取点评任务失败');

      if (job.job_status === 'completed') {
        return;
      }

      const activity = await this.activitiesService.getByIdOrThrow(job.activity_id);
      const runtimeContext = this.jobContextById.get(jobId);
      const submissionScope = (
        capabilities.hasEvaluationJobScope
          ? (job.submission_scope ?? runtimeContext?.submissionScope ?? 'published')
          : (runtimeContext?.submissionScope ?? 'published')
      ) as SubmissionScope;
      const targetParticipantId = capabilities.hasEvaluationJobScope
        ? (job.target_participant_id ?? runtimeContext?.participantIds?.[0])
        : runtimeContext?.participantIds?.[0];
      const targetSubmissionVersion = capabilities.hasEvaluationJobTargetVersion
        ? (typeof job.target_submission_version === 'number' ? job.target_submission_version : undefined)
        : undefined;

      const candidates = targetParticipantId && targetSubmissionVersion
        ? await this.getJobCandidatesByTargetVersion(
            job.activity_id,
            targetParticipantId,
            submissionScope,
            targetSubmissionVersion,
            forceFullReevaluate,
            capabilities,
          )
        : await this.getEvaluationCandidates(
            job.activity_id,
            forceFullReevaluate,
            {
              submissionScope,
              participantIds: targetParticipantId ? [targetParticipantId] : undefined,
            },
            capabilities,
          );

      if (candidates.length === 0) {
        const { error } = await this.client
          .from('evaluation_jobs')
          .update({ job_status: 'completed', completed_at: new Date().toISOString(), participant_count: 0 })
          .eq('id', jobId);
        assertSupabaseNoError(error, '更新空点评任务状态失败');
        return;
      }

      const participantIdsToProcess = candidates.map((candidate) => candidate.participant.id);
      const now = new Date().toISOString();

      const { error: markRunningError } = await this.client
        .from('evaluation_jobs')
        .update({
          job_status: 'running',
          started_at: job.started_at ?? now,
          participant_count: candidates.length,
        })
        .eq('id', jobId);
      assertSupabaseNoError(markRunningError, '标记点评任务运行中失败');

      await this.markCandidatesRunning(candidates, capabilities);

      try {
        const runtimeConfig = await this.aiConfigService.getRuntimeConfigForActivity(job.activity_id);
        const standardAiInput: StandardAiEvaluationInput[] = candidates.map((candidate) => ({
          participantId: candidate.participant.id,
          name: candidate.participant.display_name,
          promptText: candidate.submission.prompt_text,
          submissionVersion: candidate.submission.version,
        }));

        const aiResults = await this.standardAiClientService.evaluateBatch(
          runtimeConfig,
          activity.title,
          standardAiInput,
        );
        const rankedResults = candidates.length > 1
          ? this.rankResults(
              aiResults,
              candidates,
              await this.getNextRankBase(job.activity_id, participantIdsToProcess),
            )
          : aiResults.map((result) => this.rankSingleResult(result));
        const candidateByParticipantId = new Map(
          candidates.map((candidate) => [candidate.participant.id, candidate]),
        );

        const { data: insertedRows, error: insertResultsError } = await this.client
          .from('evaluation_results')
          .insert(
            rankedResults.map((result) => {
              const candidate = candidateByParticipantId.get(result.participantId)!;
              return {
                job_id: jobId,
                activity_id: job.activity_id,
                participant_id: result.participantId,
                submission_version: candidate.submission.version,
                total_score: result.totalScore,
                rank: result.rank,
                color_level: result.colorLevel,
                structural_completeness: result.dimensionScores.structuralCompleteness,
                precision_clarity: result.dimensionScores.precisionClarity,
                exemplar_guidance: result.dimensionScores.exemplarGuidance,
                context_boundary_control: result.dimensionScores.contextBoundaryControl,
                task_decomposition: result.dimensionScores.taskDecomposition,
                taste: result.taste,
                align: result.align,
                strengths: result.strengths,
                weaknesses: result.weaknesses,
                improvement_suggestions: result.improvementSuggestions,
                summary: result.summary,
                raw_json: result.rawJson,
              };
            }),
          )
          .select('id, participant_id');
        assertSupabaseNoError(insertResultsError, '写入 AI 点评结果失败');

        const insertedRowIdByParticipantId = new Map(
          (insertedRows ?? []).map((row) => [row.participant_id, row.id]),
        );

        const { data: freshParticipants, error: freshParticipantsError } = await this.client
          .from('participants')
          .select('*')
          .in('id', participantIdsToProcess);
        assertSupabaseNoError(freshParticipantsError, '刷新同学版本状态失败');

        const freshParticipantMap = new Map((freshParticipants ?? []).map((row) => [row.id, row]));

        for (const result of rankedResults) {
          const candidate = candidateByParticipantId.get(result.participantId)!;
          const freshParticipant = freshParticipantMap.get(result.participantId) ?? candidate.participant;

          if (this.isCurrentVersionForScope(freshParticipant, submissionScope, candidate.submission.version, capabilities)) {
            const updatePayload: Record<string, unknown> = {
              current_score: result.totalScore,
              latest_evaluated_version: candidate.submission.version,
              evaluation_state: 'completed',
              status: this.getStatusAfterSuccessfulEvaluation(freshParticipant, candidate.submission.version, capabilities),
            };

            if (candidates.length === 1) {
              updatePayload.current_rank = null;
            } else {
              updatePayload.current_rank = result.rank;
            }

            const { error } = await this.client
              .from('participants')
              .update(updatePayload)
              .eq('id', result.participantId);
            assertSupabaseNoError(error, '回写同学点评结果失败');
          } else {
            const { error } = await this.client
              .from('participants')
              .update({
                current_score: null,
                current_rank: null,
                evaluation_state: 'stale',
                status: this.getIdleStatus(freshParticipant, capabilities),
              })
              .eq('id', result.participantId);
            assertSupabaseNoError(error, '标记陈旧点评结果失败');
          }

          if (candidates.length === 1) {
            const storedRank = await this.getStoredRankForParticipant(
              job.activity_id,
              result.participantId,
              submissionScope,
              capabilities,
            );

            const insertedResultId = insertedRowIdByParticipantId.get(result.participantId);
            if (insertedResultId && storedRank !== null && storedRank !== result.rank) {
              const { error } = await this.client
                .from('evaluation_results')
                .update({ rank: storedRank })
                .eq('id', insertedResultId);
              assertSupabaseNoError(error, '更新逐卡点评排名失败');
            }
          }
        }

        const { error: completeJobError } = await this.client
          .from('evaluation_jobs')
          .update({ job_status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', jobId);
        assertSupabaseNoError(completeJobError, '更新点评任务完成状态失败');

        if (activity.auto_evaluate_enabled && submissionScope === 'published') {
          await this.enqueueFollowUpIfNeeded(job.activity_id, participantIdsToProcess);
        }
      } catch (error) {
        const { error: failJobError } = await this.client
          .from('evaluation_jobs')
          .update({
            job_status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: error instanceof Error ? error.message : 'Unknown error',
          })
          .eq('id', jobId);
        assertSupabaseNoError(failJobError, '更新点评任务失败状态失败');

        await this.resetCandidatesFailed(participantIdsToProcess, capabilities);
        throw error;
      }
    } finally {
      this.jobContextById.delete(jobId);
    }
  }

  private async getJobCandidatesByTargetVersion(
    activityId: string,
    participantId: string,
    submissionScope: SubmissionScope,
    targetSubmissionVersion: number,
    forceFullReevaluate: boolean,
    capabilities?: PromptBenchmarkSchemaCapabilities,
  ) {
    const nextCapabilities = capabilities ?? await this.getSchemaCapabilities();
    const { data: participant, error: participantError } = await this.client
      .from('participants')
      .select('*')
      .eq('activity_id', activityId)
      .eq('id', participantId)
      .maybeSingle();
    assertSupabaseNoError(participantError, '查询任务目标同学失败');

    if (!participant) {
      return [];
    }

    if (!forceFullReevaluate) {
      const { data: existingEvaluation, error: evaluationError } = await this.client
        .from('evaluation_results')
        .select('id')
        .eq('activity_id', activityId)
        .eq('participant_id', participantId)
        .eq('submission_version', targetSubmissionVersion)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      assertSupabaseNoError(evaluationError, '查询任务快照已有点评失败');

      if (existingEvaluation) {
        return [];
      }
    }

    const submissionQuery = this.client
      .from('submissions')
      .select('*')
      .eq('activity_id', activityId)
      .eq('participant_id', participantId)
      .eq('version', targetSubmissionVersion)
      .maybeSingle();

    const { data: submission, error: submissionError } = await submissionQuery;
    assertSupabaseNoError(submissionError, '查询任务快照提交失败');

    if (!submission) {
      return [];
    }

    if (submissionScope === 'published' && this.getPublishedVersion(participant, nextCapabilities) === 0) {
      return [];
    }

    return [{ participant, submission }];
  }

  private async findOpenJob(
    activityId: string,
    submissionScope: SubmissionScope,
    targetParticipantId?: string,
    targetSubmissionVersion?: number,
    capabilities?: PromptBenchmarkSchemaCapabilities,
  ) {
    const nextCapabilities = capabilities ?? await this.getSchemaCapabilities();
    let query = this.client
      .from('evaluation_jobs')
      .select('*')
      .eq('activity_id', activityId)
      .in('job_status', ['queued', 'running'])
      .order('created_at', { ascending: false })
      .limit(1);

    if (nextCapabilities.hasEvaluationJobScope) {
      query = query.eq('submission_scope', submissionScope);

      if (targetParticipantId) {
        query = query.eq('target_participant_id', targetParticipantId);
      } else {
        query = query.is('target_participant_id', null);
      }
    }

    if (nextCapabilities.hasEvaluationJobTargetVersion && typeof targetSubmissionVersion === 'number') {
      query = query.eq('target_submission_version', targetSubmissionVersion);
    }

    const { data, error } = await query.maybeSingle();
    assertSupabaseNoError(error, '查询开放点评任务失败');
    return data;
  }

  private async getEvaluationCandidates(
    activityId: string,
    forceFullReevaluate: boolean,
    options: EnqueueOptions,
    capabilities?: PromptBenchmarkSchemaCapabilities,
  ) {
    const nextCapabilities = capabilities ?? await this.getSchemaCapabilities();
    let participantsQuery = this.client
      .from('participants')
      .select('*')
      .eq('activity_id', activityId);

    if (options.participantIds && options.participantIds.length > 0) {
      participantsQuery = participantsQuery.in('id', options.participantIds);
    }

    const { data: participants, error: participantsError } = await participantsQuery;
    assertSupabaseNoError(participantsError, '查询可点评同学失败');

    const targetParticipants = (participants ?? []).filter((participant) => {
      const targetVersion =
        options.submissionScope === 'published'
          ? this.getPublishedVersion(participant, nextCapabilities)
          : Number(participant.latest_submission_version ?? 0);
      return targetVersion > 0;
    });

    if (targetParticipants.length === 0) {
      return [];
    }

    const participantIds = targetParticipants.map((participant) => participant.id);
    const targetVersionByParticipantId = new Map(
      targetParticipants.map((participant) => [
        participant.id,
        options.submissionScope === 'published'
          ? this.getPublishedVersion(participant, nextCapabilities)
          : Number(participant.latest_submission_version ?? 0),
      ]),
    );

    const submissionsQuery =
      options.submissionScope === 'latest_submission'
        ? this.client
            .from('submissions')
            .select('*')
            .eq('activity_id', activityId)
            .eq('is_latest', true)
            .in('participant_id', participantIds)
        : this.client
            .from('submissions')
            .select('*')
            .eq('activity_id', activityId)
            .in('participant_id', participantIds)
            .in('version', [...new Set([...targetVersionByParticipantId.values()])]);

    const { data: submissions, error: submissionsError } = await submissionsQuery;
    assertSupabaseNoError(submissionsError, '查询可点评提交失败');

    const submissionByParticipantId = new Map<string, any>();
    for (const submission of submissions ?? []) {
      if (targetVersionByParticipantId.get(submission.participant_id) !== submission.version) {
        continue;
      }

      if (!submissionByParticipantId.has(submission.participant_id)) {
        submissionByParticipantId.set(submission.participant_id, submission);
      }
    }

    let evaluationByParticipantId = new Map<string, any>();
    if (!forceFullReevaluate) {
      const { data: evaluations, error: evaluationsError } = await this.client
        .from('evaluation_results')
        .select('participant_id, submission_version, created_at')
        .eq('activity_id', activityId)
        .in('participant_id', participantIds)
        .order('created_at', { ascending: false });
      assertSupabaseNoError(evaluationsError, '查询已有点评结果失败');

      for (const evaluation of evaluations ?? []) {
        if (targetVersionByParticipantId.get(evaluation.participant_id) !== evaluation.submission_version) {
          continue;
        }
        if (!evaluationByParticipantId.has(evaluation.participant_id)) {
          evaluationByParticipantId.set(evaluation.participant_id, evaluation);
        }
      }
    }

    return targetParticipants
      .filter((participant) => forceFullReevaluate || !evaluationByParticipantId.has(participant.id))
      .map((participant) => ({
        participant,
        submission: submissionByParticipantId.get(participant.id),
      }))
      .filter((row): row is EvaluationCandidate => Boolean(row.submission));
  }

  private rankSingleResult(result: StandardAiEvaluationOutput): RankedEvaluationResult {
    const totalScore =
      result.dimensionScores.structuralCompleteness +
      result.dimensionScores.precisionClarity +
      result.dimensionScores.exemplarGuidance +
      result.dimensionScores.contextBoundaryControl +
      result.dimensionScores.taskDecomposition;

    return {
      ...result,
      totalScore,
      rank: 1,
      colorLevel: this.getColorLevel(totalScore),
    };
  }

  private rankResults(
    aiResults: StandardAiEvaluationOutput[],
    candidates: EvaluationCandidate[],
    baseRank: number,
  ) {
    const candidateNameMap = new Map(
      candidates.map((candidate) => [candidate.participant.id, candidate.participant.display_name]),
    );

    const ranked = aiResults
      .map((result) => {
        const totalScore =
          result.dimensionScores.structuralCompleteness +
          result.dimensionScores.precisionClarity +
          result.dimensionScores.exemplarGuidance +
          result.dimensionScores.contextBoundaryControl +
          result.dimensionScores.taskDecomposition;

        return {
          ...result,
          totalScore,
        };
      })
      .sort((left, right) => {
        if (right.totalScore !== left.totalScore) {
          return right.totalScore - left.totalScore;
        }

        const leftName = candidateNameMap.get(left.participantId) ?? left.name;
        const rightName = candidateNameMap.get(right.participantId) ?? right.name;
        return leftName.localeCompare(rightName, 'zh-Hans-CN');
      })
      .map((result, index) => ({
        ...result,
        rank: baseRank + index + 1,
        colorLevel: this.getColorLevel(result.totalScore),
      }));

    if (ranked.length !== candidates.length) {
      throw new Error('AI 点评返回人数与任务快照不一致');
    }

    return ranked;
  }

  private getColorLevel(totalScore: number): ColorLevel {
    if (totalScore >= 90) {
      return 'excellent';
    }
    if (totalScore >= 75) {
      return 'good';
    }
    if (totalScore >= 60) {
      return 'fair';
    }
    return 'weak';
  }

  private async getStoredRankForParticipant(
    activityId: string,
    participantId: string,
    submissionScope: SubmissionScope,
    capabilities: PromptBenchmarkSchemaCapabilities,
  ) {
    return submissionScope === 'published'
      ? this.getPublishedRank(activityId, participantId, capabilities)
      : this.getLatestEvaluatedRank(activityId, participantId);
  }

  private async getPublishedRank(
    activityId: string,
    participantId: string,
    capabilities: PromptBenchmarkSchemaCapabilities,
  ) {
    const { data: participants, error: participantsError } = await this.client
      .from('participants')
      .select('*')
      .eq('activity_id', activityId);
    assertSupabaseNoError(participantsError, '查询逐卡公开排名失败');

    const publishedParticipants = (participants ?? []).filter((participant) => this.getPublishedVersion(participant, capabilities) > 0);
    if (publishedParticipants.length === 0) {
      return null;
    }

    const versionByParticipantId = new Map(
      publishedParticipants.map((participant) => [
        participant.id,
        this.getPublishedVersion(participant, capabilities),
      ]),
    );
    const participantIds = publishedParticipants.map((participant) => participant.id);

    const { data: evaluations, error: evaluationsError } = await this.client
      .from('evaluation_results')
      .select('participant_id, submission_version, total_score, created_at')
      .eq('activity_id', activityId)
      .in('participant_id', participantIds)
      .order('created_at', { ascending: false });
    assertSupabaseNoError(evaluationsError, '查询逐卡公开点评结果失败');

    const scoreByParticipantId = new Map<string, number>();
    for (const evaluation of evaluations ?? []) {
      if (versionByParticipantId.get(evaluation.participant_id) !== evaluation.submission_version) {
        continue;
      }

      if (!scoreByParticipantId.has(evaluation.participant_id)) {
        scoreByParticipantId.set(evaluation.participant_id, Number(evaluation.total_score));
      }
    }

    const leaderboard = publishedParticipants
      .map((participant) => ({
        participantId: participant.id,
        displayName: participant.display_name,
        score: scoreByParticipantId.get(participant.id),
      }))
      .filter((row): row is { participantId: string; displayName: string; score: number } => typeof row.score === 'number')
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return left.displayName.localeCompare(right.displayName, 'zh-Hans-CN');
      });

    const index = leaderboard.findIndex((row) => row.participantId === participantId);
    return index >= 0 ? index + 1 : null;
  }

  private async getLatestEvaluatedRank(activityId: string, participantId: string) {
    const { data: participants, error: participantsError } = await this.client
      .from('participants')
      .select('id, display_name, latest_evaluated_version')
      .eq('activity_id', activityId);
    assertSupabaseNoError(participantsError, '查询逐卡最新排名失败');

    const evaluatedParticipants = (participants ?? []).filter(
      (participant) => Number(participant.latest_evaluated_version ?? 0) > 0,
    );
    if (evaluatedParticipants.length === 0) {
      return null;
    }

    const versionByParticipantId = new Map(
      evaluatedParticipants.map((participant) => [participant.id, Number(participant.latest_evaluated_version ?? 0)]),
    );
    const participantIds = evaluatedParticipants.map((participant) => participant.id);

    const { data: evaluations, error: evaluationsError } = await this.client
      .from('evaluation_results')
      .select('participant_id, submission_version, total_score, created_at')
      .eq('activity_id', activityId)
      .in('participant_id', participantIds)
      .order('created_at', { ascending: false });
    assertSupabaseNoError(evaluationsError, '查询逐卡最新点评结果失败');

    const scoreByParticipantId = new Map<string, number>();
    for (const evaluation of evaluations ?? []) {
      if (versionByParticipantId.get(evaluation.participant_id) !== evaluation.submission_version) {
        continue;
      }

      if (!scoreByParticipantId.has(evaluation.participant_id)) {
        scoreByParticipantId.set(evaluation.participant_id, Number(evaluation.total_score));
      }
    }

    const leaderboard = evaluatedParticipants
      .map((participant) => ({
        participantId: participant.id,
        displayName: participant.display_name,
        score: scoreByParticipantId.get(participant.id),
      }))
      .filter((row): row is { participantId: string; displayName: string; score: number } => typeof row.score === 'number')
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return left.displayName.localeCompare(right.displayName, 'zh-Hans-CN');
      });

    const index = leaderboard.findIndex((row) => row.participantId === participantId);
    return index >= 0 ? index + 1 : null;
  }

  private async enqueueFollowUpIfNeeded(activityId: string, participantIds?: string[]) {
    const capabilities = await this.getSchemaCapabilities();
    const options: EnqueueOptions = {
      submissionScope: 'published',
      participantIds,
    };

    if (!capabilities.hasEvaluationJobScope) {
      const candidates = await this.getEvaluationCandidates(activityId, false, options, capabilities);
      if (candidates.length > 0) {
        await this.enqueueLegacyBatchForScope(activityId, 'auto', false, options, capabilities);
      }
      return;
    }

    const candidates = await this.getEvaluationCandidates(activityId, false, options, capabilities);
    if (candidates.length > 0) {
      await this.enqueueTargetedJobsForScope(activityId, 'auto', false, options, capabilities);
    }
  }

  private async getNextRankBase(activityId: string, pendingParticipantIds: string[]) {
    const exclusionList = `(${pendingParticipantIds.map((id) => `"${id}"`).join(',')})`;
    const { data, error } = await this.client
      .from('participants')
      .select('current_rank')
      .eq('activity_id', activityId)
      .not('current_rank', 'is', null)
      .not('id', 'in', exclusionList);
    assertSupabaseNoError(error, '查询已点评排名失败');

    const existingRanks = (data ?? [])
      .map((row) => row.current_rank)
      .filter((rank): rank is number => typeof rank === 'number');

    if (existingRanks.length === 0) {
      return 0;
    }

    return Math.max(...existingRanks);
  }

  private ensureProcessingJob(jobId: string, forceFullReevaluate: boolean) {
    const previousForceFlag = this.forceFullReevaluateByJobId.get(jobId) ?? false;
    this.forceFullReevaluateByJobId.set(jobId, previousForceFlag || forceFullReevaluate);

    if (this.activeJobIds.has(jobId) || this.queuedJobIds.has(jobId)) {
      return;
    }

    this.pendingJobIds.push(jobId);
    this.queuedJobIds.add(jobId);
    this.pumpJobQueue();
  }

  private pumpJobQueue() {
    while (this.activeJobIds.size < MAX_PARALLEL_JOBS && this.pendingJobIds.length > 0) {
      const nextJobId = this.pendingJobIds.shift();
      if (!nextJobId) {
        continue;
      }

      this.queuedJobIds.delete(nextJobId);
      if (this.activeJobIds.has(nextJobId)) {
        continue;
      }

      this.activeJobIds.add(nextJobId);
      const forceFullReevaluate = this.forceFullReevaluateByJobId.get(nextJobId) ?? false;

      void this.processJob(nextJobId, forceFullReevaluate)
        .catch((error) => {
          this.logger.error(
            error instanceof Error ? error.message : '未知错误',
            error instanceof Error ? error.stack : undefined,
          );
        })
        .finally(() => {
          this.activeJobIds.delete(nextJobId);
          this.forceFullReevaluateByJobId.delete(nextJobId);
          this.pumpJobQueue();
        });
    }
  }
}
