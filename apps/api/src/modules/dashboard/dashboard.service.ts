/*
## 核心功能
维护 dashboard.service.ts 在 Prompt Benchmark 中的实现职责，支撑 业务 API 模块。

## 输入
来自上游页面、服务、配置、用户动作、测试或构建流程的数据。

## 输出
向调用方提供函数、类型、视图、状态、配置或处理结果。

## 定位
位于 apps/api/src/modules/dashboard，只承担该目录约定的局部职责。

## 依赖
依赖同目录或相邻模块、项目配置以及运行时框架提供的能力。

## 维护规则
修改逻辑、输入输出、外部依赖或职责边界后，同步更新本文件说明书和所在文件夹 README。
*/
import { Injectable, NotFoundException } from '@nestjs/common';

import {
  BackendDataSourceService,
  type PromptBenchmarkSchemaCapabilities,
} from '../../common/data-source/data-source.service';
import { assertSupabaseNoError } from '../../common/supabase/supabase-error.util';
import { ActivitiesService } from '../activities/activities.service';

type PublishedLeaderboardEntry = {
  evaluation: any;
  rank: number;
  previousRankScore: number | null;
};

@Injectable()
export class DashboardService {
  constructor(
    private readonly dataSourceService: BackendDataSourceService,
    private readonly activitiesService: ActivitiesService,
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

  private getProductUrl(participant: any) {
    return typeof participant.product_url === 'string' && participant.product_url.trim().length > 0
      ? participant.product_url
      : null;
  }

  private deriveDashboardStatus(
    participant: any,
    publishedEvaluation: any,
    capabilities: PromptBenchmarkSchemaCapabilities,
  ) {
    if (participant.status === 'not_joined') {
      return 'not_joined';
    }

    const latestPublishedVersion = this.getPublishedVersion(participant, capabilities);
    if (latestPublishedVersion === 0) {
      return 'logged_in';
    }

    const isPublishedVersionEvaluating =
      Number(participant.latest_submission_version ?? 0) === latestPublishedVersion &&
      (participant.evaluation_state === 'queued' || participant.evaluation_state === 'running');

    if (isPublishedVersionEvaluating) {
      return 'evaluating';
    }

    return publishedEvaluation ? 'scored' : 'submitted';
  }

  private async getPublishedLeaderboardMap(
    activityId: string,
    participants: any[],
    capabilities: PromptBenchmarkSchemaCapabilities,
  ) {
    const publishedParticipants = participants.filter((participant) => this.getPublishedVersion(participant, capabilities) > 0);
    if (publishedParticipants.length === 0) {
      return new Map<string, PublishedLeaderboardEntry>();
    }

    const participantIds = publishedParticipants.map((participant) => participant.id);
    const participantById = new Map(publishedParticipants.map((participant) => [participant.id, participant]));

    const { data: evaluations, error } = await this.client
      .from('evaluation_results')
      .select('*')
      .eq('activity_id', activityId)
      .in('participant_id', participantIds)
      .order('created_at', { ascending: false });
    assertSupabaseNoError(error, '查询已提交点评结果失败');

    const latestEvaluationByParticipantId = new Map<string, any>();
    for (const evaluation of evaluations ?? []) {
      const participant = participantById.get(evaluation.participant_id);
      if (!participant) {
        continue;
      }

      if (this.getPublishedVersion(participant, capabilities) !== evaluation.submission_version) {
        continue;
      }

      if (!latestEvaluationByParticipantId.has(evaluation.participant_id)) {
        latestEvaluationByParticipantId.set(evaluation.participant_id, evaluation);
      }
    }

    const leaderboard = publishedParticipants
      .map((participant) => {
        const evaluation = latestEvaluationByParticipantId.get(participant.id);
        const score = evaluation ? Number(evaluation.total_score) : null;

        return {
          participantId: participant.id,
          displayName: participant.display_name,
          evaluation,
          score,
        };
      })
      .filter(
        (row): row is {
          participantId: string;
          displayName: string;
          evaluation: any;
          score: number;
        } => Boolean(row.evaluation) && typeof row.score === 'number',
      )
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return left.displayName.localeCompare(right.displayName, 'zh-Hans-CN');
      });

    return new Map<string, PublishedLeaderboardEntry>(
      leaderboard.map((row, index) => [
        row.participantId,
        {
          evaluation: row.evaluation,
          rank: index + 1,
          previousRankScore: index > 0 ? leaderboard[index - 1]?.score ?? null : null,
        },
      ]),
    );
  }

  async getDashboard(activityId: string) {
    const activity = await this.activitiesService.getByIdOrThrow(activityId);
    const capabilities = await this.getSchemaCapabilities();

    const { data: participants, error: participantsError } = await this.client
      .from('participants')
      .select('*')
      .eq('activity_id', activityId)
      .order('display_name', { ascending: true });
    assertSupabaseNoError(participantsError, '查询面板同学失败');

    const { data: previews, error: previewsError } = await this.client
      .from('v_dashboard_latest_submission_preview')
      .select('*')
      .eq('activity_id', activityId);
    assertSupabaseNoError(previewsError, '查询提交预览失败');

    const rows = participants ?? [];
    const previewMap = new Map((previews ?? []).map((row) => [row.participant_id, row.preview_text]));
    const publishedLeaderboardMap = await this.getPublishedLeaderboardMap(activityId, rows, capabilities);

    const cards = rows.map((row) => {
      const leaderboardEntry = publishedLeaderboardMap.get(row.id);
      const publishedEvaluation = leaderboardEntry?.evaluation ?? null;
      const status = this.deriveDashboardStatus(row, publishedEvaluation, capabilities);
      const latestPublishedVersion = this.getPublishedVersion(row, capabilities);

      return {
        participantId: row.id,
        displayName: row.display_name,
        status,
        evaluationState: row.evaluation_state,
        currentScore: publishedEvaluation ? Number(publishedEvaluation.total_score) : null,
        currentRank: leaderboardEntry?.rank ?? null,
        previewText: latestPublishedVersion > 0 ? (previewMap.get(row.id) ?? null) : null,
        productUrl: this.getProductUrl(row),
        creatorPromoted: this.getProductUrl(row) !== null,
        updatedAt: row.updated_at,
      };
    });

    return {
      activity: {
        id: activity.id,
        title: activity.title,
        themeMode: activity.theme_mode,
        autoEvaluateEnabled: activity.auto_evaluate_enabled,
        rankingVisible: activity.ranking_visible,
        pollingIntervalMs: activity.polling_interval_ms,
        participationMode: this.activitiesService.getParticipationMode(activity),
      },
      summary: {
        total: cards.length,
        loggedIn: cards.filter((row) => row.status === 'logged_in').length,
        submitted: cards.filter((row) => row.status === 'submitted').length,
        evaluating: cards.filter((row) => row.status === 'evaluating').length,
        scored: cards.filter((row) => row.status === 'scored').length,
        lastRefreshedAt: new Date().toISOString(),
      },
      cards,
    };
  }

  async getParticipantDetail(activityId: string, participantId: string) {
    await this.activitiesService.getByIdOrThrow(activityId);
    const capabilities = await this.getSchemaCapabilities();
    const { data: participants, error: participantsError } = await this.client
      .from('participants')
      .select('*')
      .eq('activity_id', activityId);
    assertSupabaseNoError(participantsError, '查询排行榜同学失败');

    const participantRows = participants ?? [];
    const publishedLeaderboardMap = await this.getPublishedLeaderboardMap(activityId, participantRows, capabilities);

    const { data: participant, error: participantError } = await this.client
      .from('participants')
      .select('*')
      .eq('activity_id', activityId)
      .eq('id', participantId)
      .maybeSingle();
    assertSupabaseNoError(participantError, '查询同学详情失败');

    if (!participant) {
      throw new NotFoundException('同学不存在');
    }

    const latestPublishedVersion = this.getPublishedVersion(participant, capabilities);

    const latestSubmission = latestPublishedVersion > 0
      ? await this.client
          .from('submissions')
          .select('prompt_text, version, created_at')
          .eq('activity_id', activityId)
          .eq('participant_id', participantId)
          .eq('version', latestPublishedVersion)
          .maybeSingle()
      : { data: null, error: null };
    assertSupabaseNoError(latestSubmission.error, '查询同学最新提交失败');

    const evaluationResult = latestPublishedVersion > 0
      ? await this.client
          .from('evaluation_results')
          .select('*')
          .eq('activity_id', activityId)
          .eq('participant_id', participantId)
          .eq('submission_version', latestPublishedVersion)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null, error: null };
    assertSupabaseNoError(evaluationResult.error, '查询 AI 点评详情失败');

    const detailEvaluation = evaluationResult.data;
    const status = this.deriveDashboardStatus(participant, detailEvaluation, capabilities);
    const leaderboardEntry = detailEvaluation
      ? publishedLeaderboardMap.get(participant.id) ?? null
      : null;

    return {
      participantId: participant.id,
      displayName: participant.display_name,
      status,
      promptText: latestSubmission.data?.prompt_text ?? null,
      latestSubmissionVersion: participant.latest_submission_version,
      latestPublishedVersion,
      latestEvaluatedVersion: participant.latest_evaluated_version,
      productUrl: this.getProductUrl(participant),
      creatorPromoted: this.getProductUrl(participant) !== null,
      evaluation: detailEvaluation
        ? {
            totalScore: Number(detailEvaluation.total_score),
            rank: leaderboardEntry?.rank ?? detailEvaluation.rank,
            previousRankScore: leaderboardEntry?.previousRankScore ?? null,
            colorLevel: detailEvaluation.color_level,
            dimensionScores: {
              structuralCompleteness: detailEvaluation.structural_completeness,
              precisionClarity: detailEvaluation.precision_clarity,
              exemplarGuidance: detailEvaluation.exemplar_guidance,
              contextBoundaryControl: detailEvaluation.context_boundary_control,
              taskDecomposition: detailEvaluation.task_decomposition,
            },
            taste: detailEvaluation.taste,
            align: detailEvaluation.align,
            strengths: detailEvaluation.strengths,
            weaknesses: detailEvaluation.weaknesses,
            strengthEvidenceQuotes: Array.isArray(detailEvaluation.raw_json?.strengthEvidenceQuotes)
              ? detailEvaluation.raw_json.strengthEvidenceQuotes
              : [],
            weaknessEvidenceQuotes: Array.isArray(detailEvaluation.raw_json?.weaknessEvidenceQuotes)
              ? detailEvaluation.raw_json.weaknessEvidenceQuotes
              : [],
            improvementSuggestions: detailEvaluation.improvement_suggestions,
            summary: detailEvaluation.summary,
          }
        : null,
    };
  }
}
