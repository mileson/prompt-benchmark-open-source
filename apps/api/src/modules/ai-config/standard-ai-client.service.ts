/*
## 核心功能
维护 standard-ai-client.service.ts 在 Prompt Benchmark 中的实现职责，支撑 业务 API 模块。

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
import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';

export interface StandardAiRuntimeConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface StandardAiEvaluationInput {
  participantId: string;
  name: string;
  promptText: string;
  submissionVersion: number;
}

export interface StandardAiEvaluationOutput {
  participantId: string;
  name: string;
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
  rawJson: unknown;
}

@Injectable()
export class StandardAiClientService {
  async evaluateBatch(
    config: StandardAiRuntimeConfig,
    activityTitle: string,
    items: StandardAiEvaluationInput[],
  ): Promise<StandardAiEvaluationOutput[]> {
    const systemPrompt = [
      '你是培训现场的提示词点评助手。',
      '请严格根据给定评分维度对每位同学的提示词做结构化评估。',
      '必须返回 JSON 对象，不能输出额外解释。',
      '请保持公平、具体、鼓励式表达。',
    ].join(' ');

    const userPayload = {
      task: 'evaluate_prompt_batch',
      activityTitle,
      rubric: {
        structuralCompleteness: {
          max: 25,
          description:
            '是否具有清晰模块结构，能区分指令、上下文、输入与期望输出，结构是否稳定。',
        },
        precisionClarity: {
          max: 25,
          description:
            '任务目标是否具体明确，意图表达是否精准，动词是否清晰，是否避免模糊和歧义。',
        },
        exemplarGuidance: {
          max: 15,
          description: '是否提供高质量示例、格式样例或正向模式，帮助模型收束输出。',
        },
        contextBoundaryControl: {
          max: 20,
          description:
            '是否给出角色、人设、边界、输出格式、语气、长度或事实锚点等约束。',
        },
        taskDecomposition: {
          max: 15,
          description:
            '复杂任务是否做了分解，是否体现步骤、规划、链式思考或先分析后输出。',
        },
      },
      auxiliaryFrameworks: {
        TASTE: ['task', 'audience', 'structure', 'tone', 'example'],
        ALIGN: ['aim', 'level', 'input', 'guidelines', 'novelty'],
      },
      outputRequirements: {
        results: [
          {
            participantId: 'uuid',
            name: 'string',
            dimensionScores: {
              structuralCompleteness: '0-25 integer',
              precisionClarity: '0-25 integer',
              exemplarGuidance: '0-15 integer',
              contextBoundaryControl: '0-20 integer',
              taskDecomposition: '0-15 integer',
            },
            taste: {
              task: 'strong|medium|weak',
              audience: 'strong|medium|weak',
              structure: 'strong|medium|weak',
              tone: 'strong|medium|weak',
              example: 'strong|medium|weak',
            },
            align: {
              aim: 'strong|medium|weak',
              level: 'strong|medium|weak',
              input: 'strong|medium|weak',
              guidelines: 'strong|medium|weak',
              novelty: 'strong|medium|weak',
            },
            strengths: ['string', 'string'],
            weaknesses: ['string', 'string'],
            strengthEvidenceQuotes: ['必须直接摘自原提示词的原句或原片段'],
            weaknessEvidenceQuotes: ['必须直接摘自原提示词的原句或原片段'],
            improvementSuggestions: ['string', 'string'],
            summary: 'string',
          },
        ],
      },
      instructions: [
        '维度分数必须是整数，并且不能超过各维度最大值。',
        '优点、不足、改进建议要短句化、可用于卡片展示。',
        'strengthEvidenceQuotes 和 weaknessEvidenceQuotes 必须返回原提示词中的精确原句或连续原片段，不能改写。',
        'summary 控制在 1-2 句话。',
        '不要遗漏任何 participantId。',
      ],
      participants: items.map((item) => ({
        participantId: item.participantId,
        name: item.name,
        submissionVersion: item.submissionVersion,
        promptText: item.promptText,
      })),
    };

    const content = await this.requestChatCompletion(config, {
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(userPayload) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: items.length === 1 ? 1800 : 4000,
      stream: false,
    });

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new BadGatewayException('AI 服务未返回合法 JSON');
    }

    return this.validateResults(parsed, items);
  }

  async testConnection(config: StandardAiRuntimeConfig) {
    const content = await this.requestChatCompletion(config, {
      model: config.model,
      messages: [
        {
          role: 'system',
          content: '你是连接测试助手。',
        },
        {
          role: 'user',
          content: '请只回复“连接成功”四个字。',
        },
      ],
      temperature: 0,
      max_tokens: 32,
      stream: false,
    });

    return {
      ok: true,
      message: '连接成功',
      preview: content.trim().slice(0, 80),
    };
  }

  private async requestChatCompletion(config: StandardAiRuntimeConfig, payload: Record<string, unknown>) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new BadGatewayException(`AI 服务请求失败: ${response.status} ${text}`);
      }

      const responsePayload = (await response.json()) as any;
      const content = responsePayload?.choices?.[0]?.message?.content;
      if (!content || typeof content !== 'string') {
        throw new BadGatewayException('AI 服务返回内容为空');
      }

      return content;
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      throw new ServiceUnavailableException(
        error instanceof Error ? `AI 服务不可用: ${error.message}` : 'AI 服务不可用',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private validateResults(parsed: any, items: StandardAiEvaluationInput[]) {
    if (!parsed || !Array.isArray(parsed.results)) {
      throw new BadGatewayException('AI 服务返回结果缺少 results 数组');
    }

    const expectedIds = new Set(items.map((item) => item.participantId));
    const outputs = parsed.results.map((result: any) => {
      const participantId = typeof result?.participantId === 'string' ? result.participantId : '';
      if (!expectedIds.has(participantId)) {
        throw new BadGatewayException('AI 服务返回了未知的 participantId');
      }

      const dimensionScores = {
        structuralCompleteness: this.ensureIntegerInRange(
          result?.dimensionScores?.structuralCompleteness,
          0,
          25,
          'structuralCompleteness',
        ),
        precisionClarity: this.ensureIntegerInRange(
          result?.dimensionScores?.precisionClarity,
          0,
          25,
          'precisionClarity',
        ),
        exemplarGuidance: this.ensureIntegerInRange(
          result?.dimensionScores?.exemplarGuidance,
          0,
          15,
          'exemplarGuidance',
        ),
        contextBoundaryControl: this.ensureIntegerInRange(
          result?.dimensionScores?.contextBoundaryControl,
          0,
          20,
          'contextBoundaryControl',
        ),
        taskDecomposition: this.ensureIntegerInRange(
          result?.dimensionScores?.taskDecomposition,
          0,
          15,
          'taskDecomposition',
        ),
      };

      return {
        participantId,
        name: typeof result?.name === 'string' ? result.name : '',
        dimensionScores,
        taste: this.normalizeRecord(result?.taste),
        align: this.normalizeRecord(result?.align),
        strengths: this.normalizeStringArray(result?.strengths),
        weaknesses: this.normalizeStringArray(result?.weaknesses),
        strengthEvidenceQuotes: this.normalizeStringArray(result?.strengthEvidenceQuotes),
        weaknessEvidenceQuotes: this.normalizeStringArray(result?.weaknessEvidenceQuotes),
        improvementSuggestions: this.normalizeStringArray(result?.improvementSuggestions),
        summary: typeof result?.summary === 'string' ? result.summary.trim() : '',
        rawJson: result,
      } satisfies StandardAiEvaluationOutput;
    });

    if (outputs.length !== items.length) {
      throw new BadGatewayException('AI 点评返回人数与任务快照不一致');
    }

    return outputs;
  }

  private ensureIntegerInRange(value: unknown, min: number, max: number, label: string) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
      throw new BadGatewayException(`AI 服务返回的 ${label} 非法`);
    }

    return value;
  }

  private normalizeRecord(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(value)
        .filter((entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string')
        .map(([key, item]) => [key, item.trim()]),
    );
  }

  private normalizeStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }
}
