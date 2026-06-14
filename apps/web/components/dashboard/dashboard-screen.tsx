/*
## 核心功能
维护 dashboard-screen.tsx 在 Prompt Benchmark 中的实现职责，支撑 组件化界面或服务。

## 输入
来自上游页面、服务、配置、用户动作、测试或构建流程的数据。

## 输出
向调用方提供函数、类型、视图、状态、配置或处理结果。

## 定位
位于 apps/web/components/dashboard，只承担该目录约定的局部职责。

## 依赖
依赖同目录或相邻模块、项目配置以及运行时框架提供的能力。

## 维护规则
修改逻辑、输入输出、外部依赖或职责边界后，同步更新本文件说明书和所在文件夹 README。
*/
'use client';

    import Image from 'next/image';
    import Link from 'next/link';
    import { useEffect, useMemo, useRef, useState } from 'react';
    import { ArrowLeft, ArrowsInSimple, ArrowsOutSimple, DownloadSimple, Gift, QrCode, X } from '@phosphor-icons/react';
    import JSZip from 'jszip';

    import {
      getDashboardClient,
      getDetailClient,
      importParticipants,
      patchSettings,
      triggerEvaluation,
    } from '@/lib/api';
    import type { ActivitySummary, DashboardPayload, ParticipantDetail } from '@/lib/types';

    import { DetailModal } from './detail-modal';
    import { ParticipantCard } from './participant-card';
    import { useFlipGrid } from './use-flip-grid';
    import styles from './dashboard-screen.module.css';

    type Props = {
      activity: ActivitySummary;
      initialDashboard: DashboardPayload;
      apiBaseUrl: string;
      joinUrl: string;
      qrDataUrl: string;
    };

type NoticeState = {
  tone: 'success' | 'error';
  message: string;
} | null;

type FilterKey = 'all' | 'not_joined' | 'logged_in' | 'submitted' | 'evaluating';
type LotteryMode = 'prompt' | 'product' | 'question';
type DetailEvaluation = NonNullable<ParticipantDetail['evaluation']>;

const onlineStatusWeight: Record<string, number> = {
  evaluating: 0,
  submitted: 1,
  logged_in: 2,
  not_joined: 3,
};

const promptLotteryStatuses: DashboardPayload['cards'][number]['status'][] = ['submitted', 'evaluating', 'scored'];

const metricMeta = [
  ['structuralCompleteness', '结构完整度', 25],
  ['precisionClarity', '意图表达精准度', 25],
  ['exemplarGuidance', '示例与模式引导力', 15],
  ['contextBoundaryControl', '上下文与边界控制力', 20],
  ['taskDecomposition', '复杂任务逻辑拆解度', 15],
] as const;

const lotteryModeCopy: Record<LotteryMode, { title: string }> = {
  prompt: {
    title: '提示词抽奖',
  },
  product: {
    title: '作品抽奖',
  },
  question: {
    title: '问答抽奖',
  },
};

function sortCards(cards: DashboardPayload['cards']) {
      const next = [...cards];

      next.sort((left, right) => {
        const leftHasScore = left.currentScore !== null;
        const rightHasScore = right.currentScore !== null;

        if (leftHasScore && rightHasScore) {
          if (right.currentScore !== left.currentScore) {
            return (right.currentScore ?? 0) - (left.currentScore ?? 0);
          }
          return left.displayName.localeCompare(right.displayName, 'zh-Hans-CN');
        }

        if (leftHasScore !== rightHasScore) {
          return leftHasScore ? -1 : 1;
        }

        const leftIsOnline = left.status !== 'not_joined';
        const rightIsOnline = right.status !== 'not_joined';

        if (leftIsOnline !== rightIsOnline) {
          return leftIsOnline ? -1 : 1;
        }

        if (left.status !== right.status) {
          return (onlineStatusWeight[left.status] ?? 99) - (onlineStatusWeight[right.status] ?? 99);
        }

        return left.displayName.localeCompare(right.displayName, 'zh-Hans-CN');
      });

  return next;
}

function formatStatusLabel(status: DashboardPayload['cards'][number]['status']) {
  return (
    {
      scored: '已评测',
      evaluating: 'AI点评中',
      submitted: '已提交',
      logged_in: '学习中',
      not_joined: '未上线',
    }[status]
    ?? status
  );
}

function formatDisplayDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function formatSummaryScore(score: number | null) {
  return typeof score === 'number' ? `${Math.round(score)}/100` : '未评分';
}

function pushMarkdownList(lines: string[], items: string[]) {
  const values = items.map((item) => item.trim()).filter(Boolean);
  if (values.length === 0) {
    lines.push('- 暂无');
    return;
  }

  for (const item of values) {
    lines.push(`- ${item}`);
  }
}

function pushMetricRows(lines: string[], evaluation: DetailEvaluation | null) {
  if (!evaluation) {
    lines.push('- 暂无');
    return;
  }

  for (const [key, label, max] of metricMeta) {
    const value = evaluation.dimensionScores[key];
    lines.push(`- ${label}：${value}/${max}`);
  }
}

function isAdminPasswordError(message: string) {
  return message.includes('管理密码');
}

function summarizeDashboardToMarkdown(
  dashboard: DashboardPayload,
  participants: Array<{
    participantId: string;
    displayName: string;
    status: DashboardPayload['cards'][number]['status'];
    currentScore: number | null;
    currentRank: number | null;
    evaluation: DetailEvaluation | null;
    productUrl: string | null;
    creatorPromoted: boolean;
    updatedAt: string;
  }>,
) {
  const statusGroups = [
    ['not_joined', dashboard.cards.filter((card) => card.status === 'not_joined').length],
    ['logged_in', dashboard.cards.filter((card) => card.status === 'logged_in').length],
    ['submitted', dashboard.cards.filter((card) => card.status === 'submitted').length],
    ['evaluating', dashboard.cards.filter((card) => card.status === 'evaluating').length],
    ['scored', dashboard.cards.filter((card) => card.status === 'scored').length],
  ];
  const scoredCount = participants.filter((participant) => typeof participant.currentScore === 'number').length;
  const unscoredCount = Math.max(participants.length - scoredCount, 0);
  const ordered = [...participants].sort((left, right) => {
    if (left.currentScore !== null && right.currentScore !== null) {
      if (left.currentRank !== right.currentRank) {
        return (left.currentRank ?? Number.MAX_SAFE_INTEGER) - (right.currentRank ?? Number.MAX_SAFE_INTEGER);
      }
      return (right.currentScore ?? 0) - (left.currentScore ?? 0);
    }
    if (left.currentScore !== null) return -1;
    if (right.currentScore !== null) return 1;

    return left.displayName.localeCompare(right.displayName, 'zh-Hans-CN');
  });

  const lines = [
    `# ${dashboard.activity.title} 同学大屏汇总`,
    '',
    `- 导出时间：${new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date())}`,
    `- 参与人数：${dashboard.summary.total}`,
    `- 已评测人数：${scoredCount}`,
    `- 未评测人数：${unscoredCount}`,
    `- 最近刷新：${formatDisplayDate(dashboard.summary.lastRefreshedAt)}`,
    '',
    '## 实时状态分布',
  ];

  for (const [status, value] of statusGroups) {
    const label = formatStatusLabel(status as DashboardPayload['cards'][number]['status']);
    lines.push(`- ${label}：${value}`);
  }

  lines.push('', '## 同学汇总清单');

  for (const [index, participant] of ordered.entries()) {
    const evaluation = participant.evaluation;
    lines.push(
      `${index + 1}. ${participant.displayName}`,
      `   - 状态：${formatStatusLabel(participant.status)}`,
      `   - 分数：${formatSummaryScore(participant.currentScore)}`,
      `   - 排名：${participant.currentRank === null ? '暂无' : participant.currentRank}`,
      `   - 创造者状态：${participant.creatorPromoted ? '晋升创造者' : '未晋升'}`,
      `   - 产品地址：${participant.productUrl ?? '暂无'}`,
      `   - 最新更新时间：${formatDisplayDate(participant.updatedAt)}`,
      '',
    );

    if (!evaluation) {
      lines.push('   - AI 点评：暂无', '');
      continue;
    }

    lines.push('   - 优点：');
    for (const item of evaluation.strengths.length > 0 ? evaluation.strengths : ['暂无']) {
      lines.push(`     - ${item}`);
    }
    lines.push('   - 可改进点：');
    for (const item of evaluation.weaknesses.length > 0 ? evaluation.weaknesses : ['暂无']) {
      lines.push(`     - ${item}`);
    }
    lines.push('   - 建议下一步怎么改：');
    for (const item of evaluation.improvementSuggestions.length > 0 ? evaluation.improvementSuggestions : ['暂无']) {
      lines.push(`     - ${item}`);
    }
    lines.push('   - 指标分析：');
    for (const [key, label, max] of metricMeta) {
      lines.push(`     - ${label}：${evaluation.dimensionScores[key]}/${max}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

    export function DashboardScreen({
      activity,
      initialDashboard,
      apiBaseUrl,
      joinUrl,
      qrDataUrl,
    }: Props) {
      const [dashboard, setDashboard] = useState(initialDashboard);
      const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
      const [detail, setDetail] = useState<ParticipantDetail | null>(null);
      const [detailLoading, setDetailLoading] = useState(false);
      const [notice, setNotice] = useState<NoticeState>(null);
      const [showImport, setShowImport] = useState(false);
      const [importValue, setImportValue] = useState('');
      const [importPending, setImportPending] = useState(false);
      const [exportPending, setExportPending] = useState(false);
      const [actionPending, setActionPending] = useState(false);
      const [showAdminPrompt, setShowAdminPrompt] = useState(false);
      const [adminPassword, setAdminPassword] = useState('');
      const [adminPending, setAdminPending] = useState(false);
      const [isFullscreen, setIsFullscreen] = useState(false);
      const [qrFullscreenOpen, setQrFullscreenOpen] = useState(false);
      const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
      const [showLotteryPicker, setShowLotteryPicker] = useState(false);
      const [questionLotteryOpen, setQuestionLotteryOpen] = useState(false);
      const [questionRollingName, setQuestionRollingName] = useState('');
      const [questionWinner, setQuestionWinner] = useState<DashboardPayload['cards'][number] | null>(null);
      const [questionLotteryRevealed, setQuestionLotteryRevealed] = useState(false);
      const [lotteryMode, setLotteryMode] = useState<LotteryMode | null>(null);
      const [rollingParticipantId, setRollingParticipantId] = useState<string | null>(null);
      const [lotteryWinnerId, setLotteryWinnerId] = useState<string | null>(null);
      const [lotteryPending, setLotteryPending] = useState(false);
      const [lotteryTriggerHovered, setLotteryTriggerHovered] = useState(false);
      const [lotteryCountdownMs, setLotteryCountdownMs] = useState<number | null>(null);
      const gridWrapRef = useRef<HTMLElement | null>(null);
      const adminRetryActionRef = useRef<((password?: string) => Promise<void>) | null>(null);
      const lotteryTimerIdsRef = useRef<number[]>([]);
      const lotteryAudioRef = useRef<HTMLAudioElement | null>(null);
      const lotteryWinnerAudioRef = useRef<HTMLAudioElement | null>(null);
      const passwordStorageKey = useMemo(
        () => `prompt-benchmark-admin-password:${activity.id}`,
        [activity.id],
      );

      const sortedCards = useMemo(
        () => sortCards(dashboard.cards),
        [dashboard.cards],
      );
      const visibleCards = useMemo(() => {
        if (activeFilter === 'all') {
          return sortedCards;
        }

        return sortedCards.filter((card) => card.status === activeFilter);
      }, [activeFilter, sortedCards]);
      const promptLotteryCards = useMemo(
        () => sortedCards.filter((card) => promptLotteryStatuses.includes(card.status)),
        [sortedCards],
      );
      const productLotteryCards = useMemo(
        () => sortedCards.filter((card) => Boolean(card.productUrl)),
        [sortedCards],
      );
      const pendingEvaluationCardIds = useMemo(
        () =>
          dashboard.cards
            .filter((card) => card.status === 'submitted')
            .map((card) => card.participantId),
        [dashboard.cards],
      );
      const hasPendingEvaluationCards = pendingEvaluationCardIds.length > 0;
      const activeDetail = detail?.participantId === selectedParticipantId ? detail : null;
      const registerNode = useFlipGrid(visibleCards);
      const activeLotteryParticipantId = lotteryWinnerId ?? rollingParticipantId;
      const hasOverlayOpen = Boolean(
        selectedParticipantId
        || showImport
        || showLotteryPicker
        || questionLotteryOpen
        || showAdminPrompt
        || qrFullscreenOpen,
      );
      const lotteryCountdownSeconds = lotteryCountdownMs === null ? null : Math.max(0, Math.ceil(lotteryCountdownMs / 1000));

      useEffect(() => {
        setAdminPassword(window.sessionStorage.getItem(passwordStorageKey) ?? '');
      }, [passwordStorageKey]);

      useEffect(() => {
        const timer = window.setTimeout(() => setNotice(null), 2600);
        return () => window.clearTimeout(timer);
      }, [notice]);

      useEffect(() => {
        const handleFullscreenChange = () => {
          setIsFullscreen(document.fullscreenElement === gridWrapRef.current);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => {
          document.removeEventListener('fullscreenchange', handleFullscreenChange);
        };
      }, []);

      useEffect(() => {
        if (!hasOverlayOpen) {
          return;
        }

        const previousBodyOverflow = document.body.style.overflow;
        const previousHtmlOverflow = document.documentElement.style.overflow;

        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';

        return () => {
          document.body.style.overflow = previousBodyOverflow;
          document.documentElement.style.overflow = previousHtmlOverflow;
        };
      }, [hasOverlayOpen]);

      useEffect(() => {
        return () => {
          for (const timerId of lotteryTimerIdsRef.current) {
            window.clearTimeout(timerId);
          }
          lotteryTimerIdsRef.current = [];
          stopLotterySound();
          stopLotteryWinnerSound();
        };
      }, []);

      useEffect(() => {
        if (!activeLotteryParticipantId) {
          return;
        }

        const cardNode = gridWrapRef.current?.querySelector<HTMLElement>(
          `[data-participant-id="${activeLotteryParticipantId}"]`,
        );

        cardNode?.scrollIntoView({
          block: 'nearest',
          inline: 'nearest',
          behavior: 'smooth',
        });
      }, [activeLotteryParticipantId]);

      useEffect(() => {
        let disposed = false;

        let timeoutId: number | null = null;
        const scheduleNext = (delay: number) => {
          timeoutId = window.setTimeout(() => {
            void pull();
          }, delay);
        };

        const pull = async () => {
          try {
            const next = await getDashboardClient(apiBaseUrl, activity.id);
            if (!disposed) {
              setDashboard(next);
            }
          } catch (error) {
            if (!disposed) {
              setNotice({
                tone: 'error',
                message: error instanceof Error ? error.message : '刷新大屏失败',
              });
            }
          } finally {
            if (!disposed) {
              scheduleNext(dashboard.activity.pollingIntervalMs);
            }
          }
        };

        void pull();

        return () => {
          disposed = true;
          if (timeoutId !== null) {
            window.clearTimeout(timeoutId);
          }
        };
      }, [activity.id, apiBaseUrl, dashboard.activity.pollingIntervalMs]);

      useEffect(() => {
        if (!selectedParticipantId) {
          setDetail(null);
          return;
        }

        let cancelled = false;
        let timeoutId: number | null = null;
        const detailPollingDelay = Math.max(dashboard.activity.pollingIntervalMs, 2400);

        const scheduleNext = () => {
          timeoutId = window.setTimeout(() => {
            void pull();
          }, detailPollingDelay);
        };

        const pull = async () => {
          setDetailLoading(true);
          try {
            const next = await getDetailClient(apiBaseUrl, activity.id, selectedParticipantId);
            if (!cancelled) {
              setDetail(next);
            }
          } catch (error) {
            if (!cancelled) {
              setNotice({
                tone: 'error',
                message: error instanceof Error ? error.message : '读取卡片详情失败',
              });
            }
          } finally {
            if (!cancelled) {
              setDetailLoading(false);
            }
            if (!cancelled) {
              scheduleNext();
            }
          }
        };

        void pull();

        return () => {
          cancelled = true;
          if (timeoutId !== null) {
            window.clearTimeout(timeoutId);
          }
        };
      }, [activity.id, apiBaseUrl, dashboard.activity.pollingIntervalMs, selectedParticipantId]);

      async function runAction(action: () => Promise<void>) {
        setActionPending(true);
        try {
          await action();
        } catch (error) {
          setNotice({
            tone: 'error',
            message: error instanceof Error ? error.message : '操作失败',
          });
        } finally {
          setActionPending(false);
        }
      }

      async function refreshDashboard() {
        const next = await getDashboardClient(apiBaseUrl, activity.id);
        setDashboard(next);
      }

      async function runAdminProtectedAction(action: (password?: string) => Promise<void>) {
        try {
          await action(adminPassword || undefined);
        } catch (error) {
          const message = error instanceof Error ? error.message : '管理操作失败';
          if (isAdminPasswordError(message)) {
            adminRetryActionRef.current = action;
            setShowAdminPrompt(true);
            return;
          }

          throw error;
        }
      }

      async function confirmAdminPassword() {
        if (!adminPassword.trim()) {
          setNotice({ tone: 'error', message: '请输入管理密码' });
          return;
        }

        const retryAction = adminRetryActionRef.current;
        if (!retryAction) {
          setShowAdminPrompt(false);
          return;
        }

        setAdminPending(true);
        try {
          await retryAction(adminPassword.trim());
          window.sessionStorage.setItem(passwordStorageKey, adminPassword.trim());
          setShowAdminPrompt(false);
          adminRetryActionRef.current = null;
        } catch (error) {
          const message = error instanceof Error ? error.message : '管理操作失败';
          setNotice({ tone: 'error', message });

          if (!isAdminPasswordError(message)) {
            window.sessionStorage.setItem(passwordStorageKey, adminPassword.trim());
            setShowAdminPrompt(false);
            adminRetryActionRef.current = null;
          }
        } finally {
          setAdminPending(false);
        }
      }

      function sanitizeFileName(value: string) {
        return value.replace(/[\\\\/:*?\"<>|]/g, '-').trim() || '未命名同学';
      }

      function formatFileDate(value: Date) {
        const parts = new Intl.DateTimeFormat('zh-CN', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).formatToParts(value);
        const datePart = (type: 'year' | 'month' | 'day') => parts.find((part) => part.type === type)?.value ?? '';

        return `${datePart('year')}${datePart('month')}${datePart('day')}`;
      }

      function buildParticipantMarkdown(detail: ParticipantDetail) {
        const scoreText = detail.evaluation ? `${Math.round(detail.evaluation.totalScore)}/100` : '未评分';
      const lines = [
        `# ${detail.displayName} - AI测评`,
        '',
        `- 同学名称：${detail.displayName}`,
        `- AI评分：${scoreText}`,
        `- 创造者状态：${detail.creatorPromoted ? '晋升创造者' : '未晋升'}`,
        `- 产品地址：${detail.productUrl ?? '暂无'}`,
        '',
        '## 提示词',
        '',
          detail.promptText?.trim() ? detail.promptText : '暂无提示词内容。',
          '',
          '## AI 点评结果',
          '',
        ];

        if (!detail.evaluation) {
          lines.push('暂无 AI 点评结果。');
          return lines.join('\n');
        }

        lines.push('### 优点');
        pushMarkdownList(lines, detail.evaluation.strengths);
        lines.push('');

        lines.push('### 可改进点');
        pushMarkdownList(lines, detail.evaluation.weaknesses);
        lines.push('');

        lines.push('### 建议下一步怎么改');
        pushMarkdownList(lines, detail.evaluation.improvementSuggestions);
        lines.push('');

        lines.push('### 指标分析');
        pushMetricRows(lines, detail.evaluation);

        return lines.join('\n');
      }

      async function downloadZipFile(fileName: string, files: Array<{ name: string; content: string }>) {
        const zip = new JSZip();
        for (const file of files) {
          zip.file(file.name, file.content);
        }

        const blob = await zip.generateAsync({ type: 'blob' });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
        window.URL.revokeObjectURL(url);
      }

      async function exportParticipantMarkdownFiles() {
        setExportPending(true);

	        try {
	          const participants = sortCards(dashboard.cards);
	          const files: Array<{ name: string; content: string }> = [];
	          const summaries: Array<{
	            participantId: string;
	            displayName: string;
	            status: DashboardPayload['cards'][number]['status'];
	            currentScore: number | null;
	            currentRank: number | null;
	            evaluation: DetailEvaluation | null;
	            productUrl: string | null;
	            creatorPromoted: boolean;
	            updatedAt: string;
	          }> = [];

	          for (const participant of participants) {
	            const detail = await getDetailClient(apiBaseUrl, activity.id, participant.participantId);
	            const fileName = `${sanitizeFileName(detail.displayName)}-AI测评.md`;

	            files.push({
	              name: fileName,
	              content: buildParticipantMarkdown(detail),
	            });

	            summaries.push({
	              participantId: detail.participantId,
	              displayName: detail.displayName,
	              status: detail.status,
	              currentScore: detail.evaluation ? detail.evaluation.totalScore : null,
	              currentRank: detail.evaluation ? detail.evaluation.rank : null,
	              evaluation: detail.evaluation,
	              productUrl: detail.productUrl,
	              creatorPromoted: detail.creatorPromoted,
	              updatedAt: participant.updatedAt,
	            });
	          }

          if (files.length === 0) {
            setNotice({ tone: 'error', message: '当前没有可导出的同学内容。' });
            return;
          }

          files.push({
            name: `${sanitizeFileName(activity.title)}-同学大屏汇总.md`,
            content: summarizeDashboardToMarkdown(dashboard, summaries),
          });

          await downloadZipFile(`测评数据包_${formatFileDate(new Date())}.zip`, files);
          setNotice({ tone: 'success', message: '已导出同学 Markdown 压缩包（含大屏汇总）。' });
        } catch (error) {
          setNotice({
            tone: 'error',
            message: error instanceof Error ? error.message : '导出失败',
          });
        } finally {
          setExportPending(false);
        }
      }

      async function togglePanelFullscreen() {
        if (!gridWrapRef.current) {
          return;
        }

        if (document.fullscreenElement === gridWrapRef.current) {
          await document.exitFullscreen();
          return;
        }

        await gridWrapRef.current.requestFullscreen();
      }

      function queueLotteryTimeout(callback: () => void, delay: number) {
        const timerId = window.setTimeout(() => {
          lotteryTimerIdsRef.current = lotteryTimerIdsRef.current.filter((value) => value !== timerId);
          callback();
        }, delay);
        lotteryTimerIdsRef.current.push(timerId);
      }

      function clearLotteryTimers() {
        for (const timerId of lotteryTimerIdsRef.current) {
          window.clearTimeout(timerId);
        }
        lotteryTimerIdsRef.current = [];
      }

      function cancelLottery() {
        clearLotteryTimers();
        stopLotterySound();
        stopLotteryWinnerSound();
        setLotteryPending(false);
        setLotteryCountdownMs(null);
        setRollingParticipantId(null);
        setLotteryWinnerId(null);
        setLotteryMode(null);
        setLotteryTriggerHovered(false);
        setQuestionWinner(null);
        setQuestionLotteryRevealed(false);
        setQuestionRollingName('');
        setNotice({ tone: 'success', message: '已停止抽奖。' });
      }

      function playLotterySound() {
        const audio = lotteryAudioRef.current;
        if (!audio) {
          return;
        }

        audio.currentTime = 0;
        audio.volume = 0.34;
        void audio.play().catch(() => {
          // Browsers may block audio if the draw is not started from a direct user gesture.
        });
      }

      function stopLotterySound() {
        const audio = lotteryAudioRef.current;
        if (!audio) {
          return;
        }

        audio.pause();
        audio.currentTime = 0;
      }

      function playLotteryWinnerSound() {
        const audio = lotteryWinnerAudioRef.current;
        if (!audio) {
          return;
        }

        audio.currentTime = 0;
        audio.volume = 0.46;
        void audio.play().catch(() => {
          // Browsers may block audio if the draw is not started from a direct user gesture.
        });
      }

      function stopLotteryWinnerSound() {
        const audio = lotteryWinnerAudioRef.current;
        if (!audio) {
          return;
        }

        audio.pause();
        audio.currentTime = 0;
      }

      function closeQuestionLottery() {
        if (lotteryPending) {
          return;
        }

        setQuestionLotteryOpen(false);
        setQuestionWinner(null);
        setQuestionRollingName('');
        setQuestionLotteryRevealed(false);
        setLotteryWinnerId((current) => (lotteryMode === 'question' ? null : current));
        setLotteryMode((current) => (current === 'question' ? null : current));
      }

      function finishLottery(
        mode: LotteryMode,
        winner: DashboardPayload['cards'][number],
      ) {
        stopLotterySound();
        playLotteryWinnerSound();
        setLotteryPending(false);
        setLotteryCountdownMs(null);
        setRollingParticipantId(null);
        setLotteryWinnerId(winner.participantId);
        setLotteryMode(mode);

        if (mode === 'prompt') {
          queueLotteryTimeout(() => {
            setSelectedParticipantId(winner.participantId);
          }, 420);
        } else if (mode === 'product') {
          queueLotteryTimeout(() => {
            if (winner.productUrl) {
              const openedWindow = window.open(winner.productUrl, '_blank', 'noopener,noreferrer');
              if (!openedWindow) {
                setNotice({
                  tone: 'error',
                  message: `作品抽奖已停在 ${winner.displayName}，但浏览器拦截了新窗口，请允许弹窗后重试。`,
                });
                return;
              }
            }
          }, 420);
        } else {
          setQuestionWinner(winner);
          setQuestionRollingName(winner.displayName);
          setQuestionLotteryRevealed(false);
          queueLotteryTimeout(() => {
            setQuestionLotteryRevealed(true);
          }, 80);
        }

        if (mode !== 'question') {
          queueLotteryTimeout(() => {
            setLotteryWinnerId((current) => (current === winner.participantId ? null : current));
            setLotteryMode((current) => (current === mode ? null : current));
          }, 5200);
        }
      }

      function startLottery(mode: LotteryMode) {
        if (lotteryPending) {
          return;
        }

        const pool =
          mode === 'prompt'
            ? promptLotteryCards
            : mode === 'product'
              ? productLotteryCards
              : sortedCards;
        if (pool.length === 0) {
          setNotice({
            tone: 'error',
            message:
              mode === 'prompt'
                ? '当前还没有已提交提示词的学员。'
                : mode === 'product'
                  ? '当前还没有可抽取的作品链接。'
                  : '当前卡片列表里还没有可抽取的学员。',
          });
          return;
        }

        clearLotteryTimers();
        stopLotteryWinnerSound();
        playLotterySound();
        setShowLotteryPicker(false);
        setSelectedParticipantId(null);
        setActiveFilter('all');
        setLotteryMode(mode);
        setRollingParticipantId(null);
        setLotteryWinnerId(null);
        setLotteryPending(true);
        setLotteryCountdownMs(10000);

        if (mode === 'question') {
          setQuestionLotteryOpen(true);
          setQuestionWinner(null);
          setQuestionLotteryRevealed(false);
          setQuestionRollingName(pool[Math.floor(Math.random() * pool.length)]?.displayName ?? '');
        } else {
          setQuestionLotteryOpen(false);
          setQuestionWinner(null);
          setQuestionLotteryRevealed(false);
          setQuestionRollingName('');
        }

        const winner = pool[Math.floor(Math.random() * pool.length)] ?? pool[0];
        const winnerIndex = Math.max(pool.findIndex((card) => card.participantId === winner.participantId), 0);
        const startIndex = Math.floor(Math.random() * pool.length);
        const totalDurationMs = 10000;
        const roundCount = Math.max(5, Math.ceil(40 / Math.max(pool.length, 1)));
        const stepsToWinner = (winnerIndex - startIndex + pool.length) % pool.length;
        const totalSteps = roundCount * pool.length + stepsToWinner;
        let stepIndex = 0;
        let elapsedMs = 0;

        const step = () => {
          const nextCard = pool[(startIndex + stepIndex) % pool.length] ?? winner;
          const progress = totalSteps === 0 ? 1 : stepIndex / totalSteps;

          setRollingParticipantId(nextCard.participantId);
          if (mode === 'question') {
            setQuestionRollingName(nextCard.displayName);
          }
          setLotteryCountdownMs(Math.max(totalDurationMs - elapsedMs, 0));

          if (stepIndex >= totalSteps) {
            finishLottery(mode, winner);
            return;
          }

          stepIndex += 1;

          const easedProgress = progress ** 2.18;
          const stepsRemaining = Math.max(totalSteps - stepIndex + 1, 1);
          const remainingBudget = Math.max(totalDurationMs - elapsedMs, 0);
          const targetAverageDelay = remainingBudget / stepsRemaining;
          const shapedDelay = 58 + easedProgress * 300;
          const nextDelay = Math.round(Math.max(42, Math.min(shapedDelay, targetAverageDelay * 1.2)));
          elapsedMs += nextDelay;
          queueLotteryTimeout(step, nextDelay);
        };

        step();
      }

      return (
        <main className={`pageShell ${styles.screen}`} data-theme={dashboard.activity.themeMode}>
          <audio ref={lotteryAudioRef} src="/sounds/lottery-draw-bed.wav" preload="auto" aria-hidden="true" />
          <audio ref={lotteryWinnerAudioRef} src="/sounds/lottery-winner-reveal.wav" preload="auto" aria-hidden="true" />
          <div className={styles.layout}>
            <section className={styles.headerBar}>
              <div className={styles.headerLeft}>
                <Link href="/" className={styles.backButton}>
                  <ArrowLeft size={18} weight="bold" />
                  <span>返回</span>
                </Link>
              </div>
            </section>

            <section className={styles.toolbar}>
              <div className={styles.toolbarLeft}>
                <button
                  type="button"
                  className={styles.actionButton}
                  disabled={actionPending || !hasPendingEvaluationCards}
                  onClick={() =>
                    void runAction(async () => {
                      if (!hasPendingEvaluationCards) {
                        setNotice({ tone: 'success', message: '当前没有已提交但未 AI 点评的卡片。' });
                        return;
                      }

                      await runAdminProtectedAction(async (password) => {
                        const result = await triggerEvaluation(
                          apiBaseUrl,
                          activity.id,
                          {
                            triggerMode: 'manual',
                            forceFullReevaluate: false,
                            participantIds: pendingEvaluationCardIds,
                          },
                          password,
                        );
                        const participantCount = result.participantCount ?? 0;
                        setNotice({
                          tone: 'success',
                          message: participantCount > 0
                            ? `已开始点评 ${participantCount} 张已提交未点评卡片。`
                            : '当前没有已提交但未 AI 点评的卡片。',
                        });
                        await refreshDashboard();
                      });
                    })
                  }
                >
                  开始AI点评
                </button>
                <button
                  type="button"
                  className={`${styles.switchButton} ${dashboard.activity.autoEvaluateEnabled ? styles.switchActive : ''}`}
                  disabled={actionPending}
                  onClick={() =>
                    void runAction(async () => {
                      await runAdminProtectedAction(async (password) => {
                        const nextAutoEvaluateEnabled = !dashboard.activity.autoEvaluateEnabled;

                        await patchSettings(
                          apiBaseUrl,
                          activity.id,
                          {
                            autoEvaluateEnabled: nextAutoEvaluateEnabled,
                          },
                          password,
                        );

                        if (nextAutoEvaluateEnabled && pendingEvaluationCardIds.length > 0) {
                          await triggerEvaluation(
                            apiBaseUrl,
                            activity.id,
                            {
                              triggerMode: 'auto',
                              forceFullReevaluate: false,
                              participantIds: pendingEvaluationCardIds,
                            },
                            password,
                          );
                        }

                        await refreshDashboard();
                        setNotice({
                          tone: 'success',
                          message: nextAutoEvaluateEnabled
                            ? pendingEvaluationCardIds.length > 0
                              ? `已开启自动点评，当前会处理 ${pendingEvaluationCardIds.length} 张已提交未点评卡片。`
                              : '已开启自动点评，后续只会处理已提交但未 AI 点评的卡片。'
                            : '已关闭自动点评',
                        });
                      });
                    })
                  }
                >
                  <span className={styles.switchLabel}>自动点评</span>
                  <span className={styles.switchTrack} aria-hidden="true">
                    <span className={styles.switchThumb} />
                  </span>
                </button>
              </div>
              <div className={styles.toolbarRight}>
                <div className={styles.qrHover}>
                  <button type="button" className={styles.ghostButton} onClick={() => setQrFullscreenOpen(true)}>
                    <QrCode size={16} weight="bold" />
                    <span>扫码查看</span>
                  </button>
                  <div className={styles.qrPopover}>
                    <div className={styles.qrPopoverInner}>
                      <div className={styles.qrFrame}>
                        <Image src={qrDataUrl} alt="同学入口二维码" width={198} height={198} unoptimized />
                      </div>
                      <div className={styles.qrLink}>{joinUrl}</div>
                      <div className={styles.qrHint}>手机扫码或电脑直接打开都可以进入提交页</div>
                    </div>
                  </div>
                </div>
                <button type="button" className={styles.ghostButton} onClick={() => setShowImport(true)}>
                  导入名单
                </button>
                <Link href={`/event/${activity.slug}/manage`} className={styles.ghostButton}>
                  AI配置
                </Link>
                <button
                  type="button"
                  className={styles.ghostButton}
                  disabled={exportPending}
                  onClick={() => void exportParticipantMarkdownFiles()}
                >
                  <DownloadSimple size={16} weight="bold" />
                  <span>{exportPending ? '导出中…' : '导出'}</span>
                </button>
              </div>
            </section>

            {notice ? (
              <section
                className={`${styles.notice} ${notice.tone === 'error' ? styles.noticeError : styles.noticeSuccess}`}
              >
                {notice.message}
              </section>
            ) : null}

            <section
              ref={gridWrapRef}
              className={`${styles.gridWrap} ${isFullscreen ? styles.gridWrapFullscreen : ''} ${hasOverlayOpen ? styles.gridWrapLocked : ''}`}
            >
              <div className={styles.gridHeader}>
                <div className={styles.gridHeaderMain}>
                  <h2 className={styles.gridTitle}>实时学习面板</h2>
                  <button
                    type="button"
                    className={`${styles.fullscreenButton} ${isFullscreen ? styles.fullscreenButtonHoverReveal : ''}`}
                    onClick={() => void togglePanelFullscreen()}
                  >
                    {isFullscreen ? <ArrowsInSimple size={16} weight="bold" /> : <ArrowsOutSimple size={16} weight="bold" />}
                    <span>{isFullscreen ? '退出全屏' : '全屏显示'}</span>
                  </button>
                </div>
                <div className={styles.metricsDock}>
                  {lotteryPending && lotteryCountdownSeconds !== null ? (
                    <div className={`${styles.lotteryStatus} ${styles.lotteryStatusRolling}`}>
                      <Gift size={16} weight="fill" />
                      <span className={styles.lotteryCountdownValue}>{lotteryCountdownSeconds}</span>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className={`${styles.lotteryTrigger} ${lotteryPending ? styles.lotteryTriggerVisible : ''} ${
                      lotteryPending && lotteryTriggerHovered ? styles.lotteryTriggerStop : ''
                    }`}
                    onMouseEnter={() => setLotteryTriggerHovered(true)}
                    onMouseLeave={() => setLotteryTriggerHovered(false)}
                    onFocus={() => setLotteryTriggerHovered(true)}
                    onBlur={() => setLotteryTriggerHovered(false)}
                    onClick={() => {
                      if (lotteryPending) {
                        cancelLottery();
                        return;
                      }

                      setShowLotteryPicker(true);
                    }}
                  >
                    <Gift size={16} weight="fill" />
                    <span>{lotteryPending && lotteryTriggerHovered ? '停止抽奖' : lotteryPending ? '抽奖中…' : '随机抽奖'}</span>
                  </button>
                  {[
                    ['all', '总人数', dashboard.summary.total],
                    ['not_joined', '未上线', dashboard.cards.filter((card) => card.status === 'not_joined').length],
                    ['logged_in', '学习中', dashboard.summary.loggedIn],
                    ['submitted', '已提交', dashboard.summary.submitted],
                    ['evaluating', 'AI点评中', dashboard.summary.evaluating],
                  ].map(([key, label, value]) => (
                    <button
                      key={String(key)}
                      type="button"
                      className={`${styles.metricCard} ${activeFilter === key ? styles.metricCardActive : ''}`}
                      disabled={lotteryPending}
                      onClick={() => setActiveFilter(key as FilterKey)}
                    >
                      <span className={styles.metricLabel}>{label}</span>
                      <span className={styles.metricValue}>{value}</span>
                      <span className={styles.metricSlider} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </div>

              {visibleCards.length > 0 ? (
                <div className={styles.grid}>
                  {visibleCards.map((card) => (
                    <ParticipantCard
                      key={card.participantId}
                      card={card}
                      rankingVisible={dashboard.activity.rankingVisible}
                      registerNode={registerNode(card.participantId)}
                      onOpen={setSelectedParticipantId}
                      lotteryState={
                        lotteryWinnerId === card.participantId
                          ? 'winner'
                          : rollingParticipantId === card.participantId
                            ? 'rolling'
                            : null
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  {activeFilter === 'all' ? '名单还没有导入，点击上方“导入名单”即可开始。' : '当前筛选下还没有同学。'}
                </div>
              )}
              {showImport ? (
                <div className={styles.importBackdrop} onClick={() => setShowImport(false)} role="presentation">
                  <div className={styles.importModal} onClick={(event) => event.stopPropagation()}>
                    <h3 className={styles.importTitle}>导入同学名单</h3>
                    <div style={{ color: 'var(--text-soft)', lineHeight: 1.8 }}>
                      每行一个名字。系统会自动跳过已存在的名字。
                    </div>
                    <textarea
                      className={styles.textarea}
                      value={importValue}
                      onChange={(event) => setImportValue(event.target.value)}
                      placeholder={'例如：\n张三\n李四\n王五'}
                    />
                    <div className={styles.importActions}>
                      <button type="button" className={styles.ghostButton} onClick={() => setShowImport(false)}>
                        取消
                      </button>
                      <button
                        type="button"
                        className={styles.actionButton}
                        disabled={importPending}
                        onClick={async () => {
                          const names = importValue
                            .split(/\n+/)
                            .map((name) => name.trim())
                            .filter(Boolean)
                            .map((displayName) => ({ displayName }));
                          if (names.length === 0) {
                            setNotice({ tone: 'error', message: '请先输入至少一个姓名' });
                            return;
                          }

                          setImportPending(true);
                          try {
                            await runAdminProtectedAction(async (password) => {
                              const result = await importParticipants(apiBaseUrl, activity.id, names, password);
                              await refreshDashboard();
                              setNotice({
                                tone: 'success',
                                message: `已导入 ${result.inserted} 人，跳过 ${result.skipped} 人。`,
                              });
                              setImportValue('');
                              setShowImport(false);
                            });
                          } catch (error) {
                            setNotice({
                              tone: 'error',
                              message: error instanceof Error ? error.message : '导入失败',
                            });
                          } finally {
                            setImportPending(false);
                          }
                        }}
                      >
                        {importPending ? '导入中…' : '确认导入'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {selectedParticipantId ? (
                <DetailModal detail={activeDetail} loading={detailLoading} onClose={() => setSelectedParticipantId(null)} />
              ) : null}

              {showLotteryPicker ? (
                <div className={styles.importBackdrop} onClick={() => setShowLotteryPicker(false)} role="presentation">
                  <div className={`${styles.importModal} ${styles.lotteryModal}`} onClick={(event) => event.stopPropagation()}>
                    <div className={styles.lotteryModalHeader}>
                      <div>
                        <h3 className={styles.importTitle}>随机抽奖</h3>
                      </div>
                      <button type="button" className={styles.ghostButton} onClick={() => setShowLotteryPicker(false)}>
                        取消
                      </button>
                    </div>
                    <div className={styles.lotteryOptionGrid}>
                      {([
                        ['prompt', promptLotteryCards.length],
                        ['product', productLotteryCards.length],
                        ['question', sortedCards.length],
                      ] as Array<[LotteryMode, number]>).map(([mode, count]) => (
                        <button
                          key={mode}
                          type="button"
                          className={`${styles.lotteryOptionCard} ${count === 0 ? styles.lotteryOptionCardDisabled : ''}`}
                          disabled={count === 0}
                          onClick={() => startLottery(mode)}
                        >
                          <div className={styles.lotteryOptionEyebrow}>
                            {mode === 'prompt' ? 'Prompt Draw' : mode === 'product' ? 'Product Draw' : 'Q&A Draw'}
                          </div>
                          <div className={styles.lotteryOptionTitle}>{lotteryModeCopy[mode].title}</div>
                          <div className={styles.lotteryOptionFoot}>
                            <span className={styles.lotteryOptionCount}>{count}</span>
                            <span>{count === 0 ? '当前暂无可抽取对象' : '位可参与抽奖学员'}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {questionLotteryOpen ? (
                <div
                  className={`${styles.importBackdrop} ${styles.questionLotteryBackdrop}`}
                  onClick={closeQuestionLottery}
                  role="presentation"
                >
                  <div
                    className={`${styles.importModal} ${styles.questionLotteryModal} ${
                      questionWinner && questionLotteryRevealed ? styles.questionLotteryModalRevealed : ''
                    }`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <span className={styles.questionLotteryAura} aria-hidden="true" />
                    <span className={styles.questionLotterySweep} aria-hidden="true" />
                    <div className={styles.questionLotteryHeader}>
                      <div>
                        <div className={styles.questionLotteryEyebrow}>Q&A Lucky Draw</div>
                        <h3 className={styles.questionLotteryTitle}>问答抽奖</h3>
                      </div>
                      <button
                        type="button"
                        className={styles.ghostButton}
                        disabled={lotteryPending}
                        onClick={closeQuestionLottery}
                      >
                        关闭
                      </button>
                    </div>

                    <div className={styles.questionLotteryStage} aria-live="polite">
                      <div className={styles.questionLotteryTicker}>
                        <span className={styles.questionLotteryTicketTop} aria-hidden="true" />
                        <div
                          className={`${styles.questionLotteryName} ${
                            lotteryPending ? styles.questionLotteryNameRolling : styles.questionLotteryNameWinner
                          }`}
                        >
                          {questionRollingName || questionWinner?.displayName || '等待开始'}
                        </div>
                        <span className={styles.questionLotteryTicketBottom} aria-hidden="true" />
                      </div>
                      <div className={styles.questionLotteryMeta}>
                        {lotteryPending && lotteryCountdownSeconds !== null ? (
                          <>
                            <span className={styles.questionLotteryCountdown}>{lotteryCountdownSeconds}</span>
                            <span>秒后开奖</span>
                          </>
                        ) : (
                          <span>彩蛋已揭晓，请准备迎接全场聚光灯。</span>
                        )}
                      </div>
                    </div>

                    <div className={styles.questionLotteryActions}>
                      <button
                        type="button"
                        className={styles.actionButton}
                        disabled={lotteryPending || sortedCards.length === 0}
                        onClick={() => startLottery('question')}
                      >
                        {questionWinner ? '再抽一次' : '开始问答抽奖'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {showAdminPrompt ? (
                <div className={styles.importBackdrop} onClick={() => setShowAdminPrompt(false)} role="presentation">
                  <div className={styles.importModal} onClick={(event) => event.stopPropagation()}>
                    <h3 className={styles.importTitle}>输入管理密码</h3>
                    <input
                      className={styles.passwordInput}
                      type="password"
                      value={adminPassword}
                      onChange={(event) => setAdminPassword(event.target.value)}
                      placeholder="管理密码"
                    />
                    <div className={styles.importActions}>
                      <button type="button" className={styles.ghostButton} onClick={() => setShowAdminPrompt(false)}>
                        取消
                      </button>
                      <button
                        type="button"
                        className={styles.actionButton}
                        disabled={adminPending}
                        onClick={() => void confirmAdminPassword()}
                      >
                        {adminPending ? '验证中…' : '继续'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {qrFullscreenOpen ? (
                <div className={styles.qrFullscreenBackdrop} onClick={() => setQrFullscreenOpen(false)} role="presentation">
                  <div className={styles.qrFullscreenCard} onClick={(event) => event.stopPropagation()}>
                    <button type="button" className={styles.qrFullscreenClose} onClick={() => setQrFullscreenOpen(false)}>
                      <X size={18} weight="bold" />
                      <span>退出查看</span>
                    </button>
                    <div className={styles.qrFullscreenTitle}>扫码查看</div>
                    <div className={styles.qrFullscreenFrame}>
                      <Image src={qrDataUrl} alt="同学入口二维码" width={360} height={360} unoptimized />
                    </div>
                    <div className={styles.qrFullscreenLink}>{joinUrl}</div>
                    <div className={styles.qrFullscreenHint}>手机扫码或电脑直接打开都可以进入提交页</div>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        </main>
      );
    }
