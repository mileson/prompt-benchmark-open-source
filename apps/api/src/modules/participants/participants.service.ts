/*
## 核心功能
维护 participants.service.ts 在 Prompt Benchmark 中的实现职责，支撑 业务 API 模块。

## 输入
来自上游页面、服务、配置、用户动作、测试或构建流程的数据。

## 输出
向调用方提供函数、类型、视图、状态、配置或处理结果。

## 定位
位于 apps/api/src/modules/participants，只承担该目录约定的局部职责。

## 依赖
依赖同目录或相邻模块、项目配置以及运行时框架提供的能力。

## 维护规则
修改逻辑、输入输出、外部依赖或职责边界后，同步更新本文件说明书和所在文件夹 README。
*/
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import { CLIENT_TYPES, type ClientType, type ParticipantStatus } from '../../common/constants/domain.constants';
import { AdminAccessService } from '../../common/admin-access/admin-access.service';
import {
  BackendDataSourceService,
  type PromptBenchmarkSchemaCapabilities,
} from '../../common/data-source/data-source.service';
import { assertSupabaseNoError } from '../../common/supabase/supabase-error.util';
import { ActivitiesService } from '../activities/activities.service';
import { EvaluationsService } from '../evaluations/evaluations.service';
import { ImportParticipantsDto } from './dto/import-participants.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProductLinkDto } from './dto/update-product-link.dto';

type LeaderboardEntry = {
  rank: number;
  previousRankScore: number | null;
};

@Injectable()
export class ParticipantsService {
  constructor(
    private readonly dataSourceService: BackendDataSourceService,
    private readonly activitiesService: ActivitiesService,
    private readonly evaluationsService: EvaluationsService,
    private readonly adminAccessService: AdminAccessService,
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

  private normalizeProductUrl(rawValue: string | null | undefined) {
    if (rawValue === null || rawValue === undefined) {
      return null;
    }

    const trimmed = rawValue.trim();
    if (!trimmed) {
      return null;
    }

    const value = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new BadRequestException('请输入有效的产品地址');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException('产品地址仅支持 http 或 https');
    }

    return parsed.toString();
  }

  private async getLatestEvaluatedLeaderboardEntry(
    activityId: string,
    participantId: string,
  ): Promise<LeaderboardEntry | null> {
    const { data: participants, error: participantsError } = await this.client
      .from('participants')
      .select('id, display_name, latest_evaluated_version')
      .eq('activity_id', activityId);
    assertSupabaseNoError(participantsError, '查询排行榜同学失败');

    const evaluatedParticipants = (participants ?? []).filter(
      (row) => Number(row.latest_evaluated_version ?? 0) > 0,
    );

    if (evaluatedParticipants.length === 0) {
      return null;
    }

    const participantIds = evaluatedParticipants.map((row) => row.id);
    const evaluatedVersionMap = new Map(
      evaluatedParticipants.map((row) => [row.id, Number(row.latest_evaluated_version ?? 0)]),
    );

    const { data: evaluations, error: evaluationsError } = await this.client
      .from('evaluation_results')
      .select('participant_id, submission_version, total_score')
      .eq('activity_id', activityId)
      .in('participant_id', participantIds)
      .order('created_at', { ascending: false });
    assertSupabaseNoError(evaluationsError, '查询排行榜点评结果失败');

    const evaluationMap = new Map<string, number>();
    for (const row of evaluations ?? []) {
      if (evaluatedVersionMap.get(row.participant_id) !== row.submission_version) {
        continue;
      }
      if (!evaluationMap.has(row.participant_id)) {
        evaluationMap.set(row.participant_id, Number(row.total_score));
      }
    }

    const leaderboard = evaluatedParticipants
      .map((row) => ({
        participantId: row.id,
        displayName: row.display_name,
        score: evaluationMap.get(row.id),
      }))
      .filter((row): row is { participantId: string; displayName: string; score: number } => typeof row.score === 'number')
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        return left.displayName.localeCompare(right.displayName, 'zh-Hans-CN');
      });

    const index = leaderboard.findIndex((row) => row.participantId === participantId);
    if (index < 0) {
      return null;
    }

    return {
      rank: index + 1,
      previousRankScore: index > 0 ? leaderboard[index - 1]?.score ?? null : null,
    };
  }

  async importParticipants(activityId: string, dto: ImportParticipantsDto, adminPassword?: string) {
    this.adminAccessService.assertAccess(adminPassword);
    await this.activitiesService.getByIdOrThrow(activityId);

    const uniqueNames = [...new Set(dto.participants.map((item) => item.displayName.trim()))].filter(Boolean);
    const { data: existingRows, error: existingError } = await this.client
      .from('participants')
      .select('display_name')
      .eq('activity_id', activityId)
      .in('display_name', uniqueNames);

    assertSupabaseNoError(existingError, '查询已存在同学失败');

    const existingNames = new Set((existingRows ?? []).map((row) => row.display_name));
    const toInsert = uniqueNames
      .filter((displayName) => !existingNames.has(displayName))
      .map((displayName) => ({
        activity_id: activityId,
        display_name: displayName,
        status: 'not_joined',
        evaluation_state: 'idle',
      }));

    if (toInsert.length > 0) {
      const { error } = await this.client.from('participants').insert(toInsert);
      assertSupabaseNoError(error, '导入同学失败');
    }

    return {
      inserted: toInsert.length,
      skipped: uniqueNames.length - toInsert.length,
    };
  }

  private async findParticipantByName(activityId: string, displayName: string) {
    const { data, error } = await this.client
      .from('participants')
      .select('*')
      .eq('activity_id', activityId)
      .eq('display_name', displayName)
      .maybeSingle();

    assertSupabaseNoError(error, '匹配同学失败');
    return data;
  }

  private async createAnonymousParticipant(activityId: string, displayName: string) {
    const { data, error } = await this.client
      .from('participants')
      .insert({
        activity_id: activityId,
        display_name: displayName,
        status: 'not_joined',
        evaluation_state: 'idle',
      })
      .select('*')
      .single();

    if (error && error.code === '23505') {
      const participant = await this.findParticipantByName(activityId, displayName);
      if (participant) {
        return participant;
      }
    }

    assertSupabaseNoError(error, '创建匿名同学失败');
    return data;
  }

  async login(activityId: string, dto: LoginDto) {
    const activity = await this.activitiesService.getByIdOrThrow(activityId);
    const capabilities = await this.getSchemaCapabilities();
    const displayName = dto.name.trim();
    const participationMode = this.activitiesService.getParticipationMode(activity);

    const clientType: ClientType = dto.clientType && CLIENT_TYPES.includes(dto.clientType)
      ? dto.clientType
      : 'unknown';

    let participant = await this.findParticipantByName(activityId, displayName);

    if (!participant) {
      if (participationMode !== 'anonymous') {
        throw new BadRequestException('姓名与名单不一致，请重新输入');
      }

      participant = await this.createAnonymousParticipant(activityId, displayName);
    }

    const sessionToken = randomBytes(24).toString('hex');
    const now = new Date().toISOString();

    const { error: deactivateError } = await this.client
      .from('participant_sessions')
      .update({ is_active: false })
      .eq('participant_id', participant.id)
      .eq('is_active', true);
    assertSupabaseNoError(deactivateError, '关闭旧会话失败');

    const { error: sessionError } = await this.client.from('participant_sessions').insert({
      activity_id: activityId,
      participant_id: participant.id,
      session_token: sessionToken,
      client_type: clientType,
      is_active: true,
      last_seen_at: now,
    });
    assertSupabaseNoError(sessionError, '创建会话失败');

    const nextStatus = this.resolveStatusAfterLogin(participant.status, this.getPublishedVersion(participant, capabilities));

    const { data: updatedParticipant, error: updateError } = await this.client
      .from('participants')
      .update({
        login_name: displayName,
        last_seen_at: now,
        status: nextStatus,
      })
      .eq('id', participant.id)
      .select('*')
      .single();
    assertSupabaseNoError(updateError, '更新同学状态失败');

    return {
      participantId: updatedParticipant.id,
      displayName: updatedParticipant.display_name,
      status: updatedParticipant.status,
      sessionToken,
    };
  }

  async getMe(activityId: string, authorization?: string) {
    const { participant } = await this.getSessionContext(activityId, authorization);
    const capabilities = await this.getSchemaCapabilities();

    const { data: latestSubmission, error: submissionError } = await this.client
      .from('submissions')
      .select('version, prompt_text')
      .eq('activity_id', activityId)
      .eq('participant_id', participant.id)
      .eq('is_latest', true)
      .maybeSingle();
    assertSupabaseNoError(submissionError, '查询最新提交失败');

    let evaluationResult = null as any;
    if (participant.latest_evaluated_version) {
      const { data, error } = await this.client
        .from('evaluation_results')
        .select('total_score, rank')
        .eq('activity_id', activityId)
        .eq('participant_id', participant.id)
        .eq('submission_version', participant.latest_evaluated_version)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      assertSupabaseNoError(error, '查询当前 AI 评分失败');
      evaluationResult = data;
    }

    const leaderboardEntry = evaluationResult
      ? await this.getLatestEvaluatedLeaderboardEntry(activityId, participant.id)
      : null;

    return {
      participantId: participant.id,
      displayName: participant.display_name,
      status: participant.status,
      latestSubmissionVersion: participant.latest_submission_version,
      latestPublishedVersion: this.getPublishedVersion(participant, capabilities),
      latestEvaluatedVersion: participant.latest_evaluated_version,
      promptText: latestSubmission?.prompt_text ?? null,
      evaluationState: participant.evaluation_state,
      currentScore: evaluationResult ? Number(evaluationResult.total_score) : null,
      currentRank: leaderboardEntry?.rank ?? evaluationResult?.rank ?? null,
      productUrl: this.getProductUrl(participant),
      creatorPromoted: this.getProductUrl(participant) !== null,
    };
  }

  async getMyDetail(activityId: string, authorization?: string) {
    const { participant } = await this.getSessionContext(activityId, authorization);
    const capabilities = await this.getSchemaCapabilities();

    const { data: latestSubmission, error: submissionError } = await this.client
      .from('submissions')
      .select('prompt_text, version')
      .eq('activity_id', activityId)
      .eq('participant_id', participant.id)
      .eq('is_latest', true)
      .maybeSingle();
    assertSupabaseNoError(submissionError, '查询最新提交详情失败');

    let evaluationResult = null as any;
    if (participant.latest_evaluated_version) {
      const { data, error } = await this.client
        .from('evaluation_results')
        .select('*')
        .eq('activity_id', activityId)
        .eq('participant_id', participant.id)
        .eq('submission_version', participant.latest_evaluated_version)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      assertSupabaseNoError(error, '查询 AI 点评详情失败');
      evaluationResult = data;
    }

    const leaderboardEntry = evaluationResult
      ? await this.getLatestEvaluatedLeaderboardEntry(activityId, participant.id)
      : null;

    return {
      participantId: participant.id,
      displayName: participant.display_name,
      status: participant.status,
      promptText: latestSubmission?.prompt_text ?? null,
      latestSubmissionVersion: participant.latest_submission_version,
      latestPublishedVersion: this.getPublishedVersion(participant, capabilities),
      latestEvaluatedVersion: participant.latest_evaluated_version,
      productUrl: this.getProductUrl(participant),
      creatorPromoted: this.getProductUrl(participant) !== null,
      evaluation: evaluationResult
        ? {
            totalScore: Number(evaluationResult.total_score),
            rank: leaderboardEntry?.rank ?? evaluationResult.rank,
            previousRankScore: leaderboardEntry?.previousRankScore ?? null,
            colorLevel: evaluationResult.color_level,
            dimensionScores: {
              structuralCompleteness: evaluationResult.structural_completeness,
              precisionClarity: evaluationResult.precision_clarity,
              exemplarGuidance: evaluationResult.exemplar_guidance,
              contextBoundaryControl: evaluationResult.context_boundary_control,
              taskDecomposition: evaluationResult.task_decomposition,
            },
            taste: evaluationResult.taste,
            align: evaluationResult.align,
            strengths: evaluationResult.strengths,
            weaknesses: evaluationResult.weaknesses,
            strengthEvidenceQuotes: Array.isArray(evaluationResult.raw_json?.strengthEvidenceQuotes)
              ? evaluationResult.raw_json.strengthEvidenceQuotes
              : [],
            weaknessEvidenceQuotes: Array.isArray(evaluationResult.raw_json?.weaknessEvidenceQuotes)
              ? evaluationResult.raw_json.weaknessEvidenceQuotes
              : [],
            improvementSuggestions: evaluationResult.improvement_suggestions,
            summary: evaluationResult.summary,
          }
        : null,
    };
  }

  async getMyHistory(activityId: string, authorization?: string) {
    const { participant } = await this.getSessionContext(activityId, authorization);

    const { data: submissions, error: submissionsError } = await this.client
      .from('submissions')
      .select('version, prompt_text, created_at')
      .eq('activity_id', activityId)
      .eq('participant_id', participant.id)
      .order('version', { ascending: false });
    assertSupabaseNoError(submissionsError, '查询历史提示词失败');

    const versions = (submissions ?? []).map((item) => item.version);
    let evaluationMap = new Map<number, any>();

    if (versions.length > 0) {
      const { data: evaluations, error: evaluationsError } = await this.client
        .from('evaluation_results')
        .select('*')
        .eq('activity_id', activityId)
        .eq('participant_id', participant.id)
        .in('submission_version', versions)
        .order('created_at', { ascending: false });
      assertSupabaseNoError(evaluationsError, '查询历史 AI 评测失败');

      evaluationMap = new Map<number, any>();
      for (const evaluation of evaluations ?? []) {
        if (!evaluationMap.has(evaluation.submission_version)) {
          evaluationMap.set(evaluation.submission_version, evaluation);
        }
      }
    }

    return {
      participantId: participant.id,
      displayName: participant.display_name,
      items: (submissions ?? []).map((submission) => {
        const evaluation = evaluationMap.get(submission.version);

        return {
          version: submission.version,
          promptText: submission.prompt_text,
          createdAt: submission.created_at,
          evaluation: evaluation
            ? {
                totalScore: Number(evaluation.total_score),
                rank: evaluation.rank,
                colorLevel: evaluation.color_level,
                dimensionScores: {
                  structuralCompleteness: evaluation.structural_completeness,
                  precisionClarity: evaluation.precision_clarity,
                  exemplarGuidance: evaluation.exemplar_guidance,
                  contextBoundaryControl: evaluation.context_boundary_control,
                  taskDecomposition: evaluation.task_decomposition,
                },
                strengths: evaluation.strengths,
                weaknesses: evaluation.weaknesses,
                strengthEvidenceQuotes: Array.isArray(evaluation.raw_json?.strengthEvidenceQuotes)
                  ? evaluation.raw_json.strengthEvidenceQuotes
                  : [],
                weaknessEvidenceQuotes: Array.isArray(evaluation.raw_json?.weaknessEvidenceQuotes)
                  ? evaluation.raw_json.weaknessEvidenceQuotes
                  : [],
                improvementSuggestions: evaluation.improvement_suggestions,
                summary: evaluation.summary,
              }
            : null,
        };
      }),
    };
  }

  async triggerSelfEvaluation(activityId: string, authorization?: string) {
    const { participant } = await this.getSessionContext(activityId, authorization);

    if ((participant.latest_submission_version ?? 0) === 0) {
      throw new BadRequestException('请先保存提示词，再开始 AI 自测');
    }

    return this.evaluationsService.enqueueForParticipant(activityId, participant.id);
  }

  async updateMyProductLink(activityId: string, authorization?: string, dto?: UpdateProductLinkDto) {
    const { participant } = await this.getSessionContext(activityId, authorization);
    const capabilities = await this.getSchemaCapabilities();

    if (this.getPublishedVersion(participant, capabilities) === 0) {
      throw new BadRequestException('请先提交到大屏，再填写产品地址');
    }

    const nextProductUrl = this.normalizeProductUrl(dto?.productUrl);

    const { data: updatedParticipant, error } = await this.client
      .from('participants')
      .update({ product_url: nextProductUrl })
      .eq('id', participant.id)
      .select('*')
      .single();
    if (error) {
      const message = error.message ?? '';
      if (
        message.includes('product_url') &&
        (
          /does not exist/i.test(message) ||
          /schema cache/i.test(message) ||
          /Could not find/i.test(message)
        )
      ) {
        throw new BadRequestException('当前环境缺少 product_url 字段，请先执行数据库迁移');
      }
      assertSupabaseNoError(error, '保存产品地址失败');
    }

    const productUrl = this.getProductUrl(updatedParticipant);

    return {
      participantId: updatedParticipant.id,
      productUrl,
      creatorPromoted: productUrl !== null,
      updatedAt: updatedParticipant.updated_at,
    };
  }

  async getSessionContext(activityId: string, authorization?: string) {
    const sessionToken = this.extractSessionToken(authorization);
    const now = new Date().toISOString();

    const { data: session, error: sessionError } = await this.client
      .from('participant_sessions')
      .select('*')
      .eq('activity_id', activityId)
      .eq('session_token', sessionToken)
      .eq('is_active', true)
      .maybeSingle();
    assertSupabaseNoError(sessionError, '查询会话失败');

    if (!session) {
      throw new UnauthorizedException('登录状态已失效，请重新进入');
    }

    const { data: participant, error: participantError } = await this.client
      .from('participants')
      .select('*')
      .eq('id', session.participant_id)
      .eq('activity_id', activityId)
      .maybeSingle();
    assertSupabaseNoError(participantError, '查询同学失败');

    if (!participant) {
      throw new UnauthorizedException('同学信息不存在，请重新进入');
    }

    const updates = [
      this.client.from('participant_sessions').update({ last_seen_at: now }).eq('id', session.id),
      this.client.from('participants').update({ last_seen_at: now }).eq('id', participant.id),
    ] as const;

    const [sessionUpdateResult, participantUpdateResult] = await Promise.all(updates);
    assertSupabaseNoError(sessionUpdateResult.error, '刷新会话时间失败');
    assertSupabaseNoError(participantUpdateResult.error, '刷新同学时间失败');

    return {
      sessionToken,
      session,
      participant,
    };
  }

  private extractSessionToken(authorization?: string) {
    if (!authorization) {
      throw new UnauthorizedException('缺少登录凭证');
    }

    if (authorization.startsWith('Bearer ')) {
      const token = authorization.slice('Bearer '.length).trim();
      if (!token) {
        throw new UnauthorizedException('登录凭证无效');
      }
      return token;
    }

    return authorization.trim();
  }

  private resolveStatusAfterLogin(
    currentStatus: string | null,
    latestPublishedVersion: number | null,
  ): ParticipantStatus {
    if ((latestPublishedVersion ?? 0) === 0) {
      return 'logged_in';
    }

    if (
      currentStatus === 'submitted' ||
      currentStatus === 'evaluating' ||
      currentStatus === 'scored'
    ) {
      return currentStatus;
    }

    return 'submitted';
  }
}
