/*
## 核心功能
维护 join-screen.tsx 在 Prompt Benchmark 中的实现职责，支撑 组件化界面或服务。

## 输入
来自上游页面、服务、配置、用户动作、测试或构建流程的数据。

## 输出
向调用方提供函数、类型、视图、状态、配置或处理结果。

## 定位
位于 apps/web/components/join，只承担该目录约定的局部职责。

## 依赖
依赖同目录或相邻模块、项目配置以及运行时框架提供的能力。

## 维护规则
修改逻辑、输入输出、外部依赖或职责边界后，同步更新本文件说明书和所在文件夹 README。
*/
'use client';

import {
  ArrowClockwise,
  ArrowLeft,
  ArrowRight,
  ArrowSquareOut,
  ClockCounterClockwise,
  FingerprintSimple,
  Lightning,
  LinkSimple,
  Sparkle,
  User,
  WarningCircle,
} from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  ApiError,
  getMe,
  getMeDetail,
  getMeHistory,
  patchMyProductLink,
  postLogin,
  postPublishSubmission,
  postSelfEvaluation,
  postSubmission,
} from '@/lib/api';
import tutorialDocs from '@/config/tutorial-docs.json';
import { getScoreTone } from '@/lib/score-tone';
import type { ActivitySummary, MeResponse, ParticipantDetail, ParticipantHistoryResponse } from '@/lib/types';

import { PromptMarkdown } from '../dashboard/prompt-markdown';
import { SiteBrand } from '../site-brand';
import { HistoryDialog } from './history-dialog';
import styles from './join-screen.module.css';

type Props = {
  activity: ActivitySummary;
  apiBaseUrl: string;
};

type Notice = {
  tone: 'success' | 'error';
  message: string;
} | null;

type LoginMessage = string | null;

type SessionPayload = {
  sessionToken: string;
  participantId: string;
  displayName: string;
};

type DraftPayload = {
  participantId: string;
  promptText: string;
  updatedAt: string;
};

const dimensionMeta = [
  { key: 'structuralCompleteness', label: '结构完整度', max: 25 },
  { key: 'precisionClarity', label: '清晰准确度', max: 25 },
  { key: 'exemplarGuidance', label: '示例引导', max: 15 },
  { key: 'contextBoundaryControl', label: '边界控制', max: 20 },
  { key: 'taskDecomposition', label: '任务拆解', max: 15 },
] as const;

export function JoinScreen({ activity, apiBaseUrl }: Props) {
  const storageKey = useMemo(() => `prompt-benchmark:${activity.id}`, [activity.id]);
  const draftStorageKey = useMemo(() => `${storageKey}:draft`, [storageKey]);
  const [name, setName] = useState('');
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [sessionResolved, setSessionResolved] = useState(false);
  const [initialSyncPending, setInitialSyncPending] = useState(false);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [detail, setDetail] = useState<ParticipantDetail | null>(null);
  const [promptText, setPromptText] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [submitPending, setSubmitPending] = useState(false);
  const [evaluatePending, setEvaluatePending] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [loginMessage, setLoginMessage] = useState<LoginMessage>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState<ParticipantHistoryResponse | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [productLinkDialogOpen, setProductLinkDialogOpen] = useState(false);
  const [tutorialDialogOpen, setTutorialDialogOpen] = useState(false);
  const [productLinkValue, setProductLinkValue] = useState('');
  const [productLinkPending, setProductLinkPending] = useState(false);
  const sessionTokenRef = useRef<string | null>(null);
  const hydratedSessionTokenRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const promptTextRef = useRef('');

  useEffect(() => {
    sessionTokenRef.current = session?.sessionToken ?? null;
  }, [session]);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    promptTextRef.current = promptText;
  }, [promptText]);

  useEffect(() => {
    if (!session || !promptText.trim()) {
      return;
    }

    const draft: DraftPayload = {
      participantId: session.participantId,
      promptText,
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
  }, [draftStorageKey, promptText, session]);

  function getLocalDraft(participantId: string) {
    try {
      const raw = window.localStorage.getItem(draftStorageKey);
      const parsed = raw ? (JSON.parse(raw) as DraftPayload) : null;
      if (parsed?.participantId === participantId && parsed.promptText.trim()) {
        return parsed.promptText;
      }
    } catch {
      return null;
    }

    return null;
  }

  useEffect(() => {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      setSessionResolved(true);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as SessionPayload;
      setSession(parsed);
    } catch {
      window.localStorage.removeItem(storageKey);
    } finally {
      setSessionResolved(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (session) {
      return;
    }

    const { body, documentElement } = document;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlOverflow = documentElement.style.overflow;
    const prevBodyOverscroll = body.style.overscrollBehavior;
    const prevHtmlOverscroll = documentElement.style.overscrollBehavior;

    body.style.overflow = 'hidden';
    documentElement.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    documentElement.style.overscrollBehavior = 'none';

    return () => {
      body.style.overflow = prevBodyOverflow;
      documentElement.style.overflow = prevHtmlOverflow;
      body.style.overscrollBehavior = prevBodyOverscroll;
      documentElement.style.overscrollBehavior = prevHtmlOverscroll;
    };
  }, [session]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function normalizeApiErrorMessage(rawMessage: string) {
    try {
      const parsed = JSON.parse(rawMessage);
      if (typeof parsed?.message === 'string' && parsed.message.trim()) {
        return parsed.message.trim();
      }
    } catch {
      // noop
    }
    return rawMessage;
  }

  function friendlyLoginErrorMessage(rawMessage: string) {
    const message = normalizeApiErrorMessage(rawMessage).trim();

    if (!message) {
      return '进入失败，请稍后再试。';
    }

    if (/姓名与名单不一致/.test(message)) {
      return '未找到该姓名，请确认你填写的名字与活动名单一致。';
    }

    if (/participantId.*不一致/.test(message) || /与当前登录同学不一致/.test(message)) {
      return '登录信息与当前会话不一致，请返回重新登录。';
    }

    return message;
  }

  function friendlyErrorMessage(rawMessage: string, fallback = '操作失败，请稍后再试。') {
    const message = normalizeApiErrorMessage(rawMessage).trim();

    if (!message) {
      return fallback;
    }

    if (/participantId.*不一致/.test(message) || /与当前登录同学不一致/.test(message)) {
      return '当前身份信息不一致，请返回登录页重新进入。';
    }

    return message;
  }

  function isAuthExpiredError(error: unknown) {
    return error instanceof ApiError && (error.status === 401 || error.status === 403);
  }

  useEffect(() => {
    if (!session) {
      setInitialSyncPending(false);
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;

    const scheduleNext = () => {
      timeoutId = window.setTimeout(() => {
        void pull();
      }, 3000);
    };

    const pull = async () => {
      const needsInitialSync = hydratedSessionTokenRef.current !== session.sessionToken;
      if (needsInitialSync && !cancelled) {
        setInitialSyncPending(true);
      }

      try {
        const [nextMe, nextDetail] = await Promise.all([
          getMe(apiBaseUrl, activity.id, session.sessionToken),
          getMeDetail(apiBaseUrl, activity.id, session.sessionToken),
        ]);

        if (cancelled) {
          return;
        }

        setMe(nextMe);
        setDetail(nextDetail);
        hydratedSessionTokenRef.current = session.sessionToken;

        if (!dirtyRef.current && typeof nextMe.promptText === 'string') {
          const localDraft = getLocalDraft(session.participantId);
          const nextPromptText = nextMe.promptText.trim() ? nextMe.promptText : (localDraft ?? nextMe.promptText);
          setPromptText(nextPromptText);
          if ((nextMe.latestSubmissionVersion ?? 0) > 0 && !promptTextRef.current.trim()) {
            setPreviewMode(true);
          }
        }
      } catch (error) {
        if (!cancelled) {
          if (isAuthExpiredError(error)) {
            clearSessionState(true, session.sessionToken);
            setNotice({ tone: 'error', message: '登录状态已失效，请重新输入姓名。' });
          } else if (needsInitialSync) {
            setNotice({ tone: 'error', message: '暂时无法同步最新内容，请检查网络后重试。' });
          }
        }
      } finally {
        if (!cancelled && needsInitialSync) {
          setInitialSyncPending(false);
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
  }, [activity.id, apiBaseUrl, session, storageKey]);

  async function handleLogin() {
    setBusy(true);
    setLoginMessage(null);

    try {
      const response = await postLogin(apiBaseUrl, activity.id, {
        name: name.trim(),
        clientType: window.innerWidth > 900 ? 'desktop' : 'mobile',
      });

      const nextSession = {
        sessionToken: response.sessionToken,
        participantId: response.participantId,
        displayName: response.displayName,
      };

      window.localStorage.setItem(storageKey, JSON.stringify(nextSession));
      const localDraft = getLocalDraft(nextSession.participantId);
      setSession(nextSession);
      setMe(null);
      setDetail(null);
      setPromptText(localDraft ?? '');
      setDirty(Boolean(localDraft));
      setPreviewMode(false);
      setNotice(null);
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : '进入失败';
      setLoginMessage(friendlyLoginErrorMessage(rawMessage));
    } finally {
      setBusy(false);
    }
  }

  async function persistPrompt({ silent = false }: { silent?: boolean } = {}) {
    if (!session) {
      throw new Error('请先输入姓名');
    }

    const trimmedPrompt = promptText.trim();
    if (!trimmedPrompt) {
      throw new Error('请先输入提示词');
    }

    const response = await postSubmission(apiBaseUrl, activity.id, session.sessionToken, {
      participantId: session.participantId,
      promptText: trimmedPrompt,
      source: window.innerWidth > 900 ? 'desktop' : 'mobile',
    });

    setPromptText(trimmedPrompt);
    setDirty(false);
    setPreviewMode(true);
    setDetail((current) =>
      current
        ? {
            ...current,
            promptText: trimmedPrompt,
            latestSubmissionVersion: response.version,
            latestPublishedVersion: response.latestPublishedVersion,
          }
        : current,
    );
    setMe((current) =>
      current
        ? {
            ...current,
            status: response.status,
            latestSubmissionVersion: response.version,
            latestPublishedVersion: response.latestPublishedVersion,
            promptText: trimmedPrompt,
            evaluationState: response.evaluationState,
          }
        : current,
    );

    if (!silent) {
      setNotice({ tone: 'success', message: '提示词已保存。' });
    }

    return response;
  }

  async function handleSave() {
    setSavePending(true);
    try {
      await persistPrompt();
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : '保存失败';
      setNotice({ tone: 'error', message: friendlyErrorMessage(rawMessage, '保存失败。') });
    } finally {
      setSavePending(false);
    }
  }

  async function handleSelfEvaluation() {
    if (!session) {
      return;
    }

    const hasSavedPrompt =
      (me?.latestSubmissionVersion ?? 0) > 0 &&
      Boolean((detail?.promptText ?? me?.promptText ?? promptText).trim());

    if (!previewMode || dirty || !hasSavedPrompt) {
      setNotice({ tone: 'error', message: '请先保存当前提示词，再进行 AI 自测。' });
      return;
    }

    setEvaluatePending(true);
    try {
      await postSelfEvaluation(apiBaseUrl, activity.id, session.sessionToken);
      setPreviewMode(true);

      setMe((current) =>
        current
          ? {
              ...current,
              status:
                current.latestSubmissionVersion > 0 &&
                current.latestSubmissionVersion === current.latestPublishedVersion
                  ? 'evaluating'
                  : current.status,
              evaluationState: 'queued',
            }
          : current,
      );

    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : '发起 AI 自测失败';
      setNotice({ tone: 'error', message: friendlyErrorMessage(rawMessage, '发起 AI 自测失败。') });
    } finally {
      setEvaluatePending(false);
    }
  }

  async function handlePublishSubmission() {
    if (!session) {
      return;
    }

    if (dirty || (me?.latestSubmissionVersion ?? 0) === 0) {
      setNotice({ tone: 'error', message: '请先保存当前提示词，再提交到大屏。' });
      setSubmitConfirmOpen(false);
      return;
    }

    setSubmitPending(true);
    try {
      const response = await postPublishSubmission(apiBaseUrl, activity.id, session.sessionToken);
      const hadPublishedVersion = (me?.latestPublishedVersion ?? 0) > 0;

      setSubmitConfirmOpen(false);
      setMe((current) =>
        current
          ? {
              ...current,
              status: response.status,
              latestPublishedVersion: response.latestPublishedVersion,
              evaluationState: response.evaluationState,
            }
          : current,
      );
      setDetail((current) =>
        current
          ? {
              ...current,
              status: response.status,
              latestPublishedVersion: response.latestPublishedVersion,
            }
          : current,
      );

      setNotice({
        tone: 'success',
        message: hadPublishedVersion ? '已更新大屏展示内容。' : '已提交到大屏展示。',
      });
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : '提交失败';
      setNotice({ tone: 'error', message: friendlyErrorMessage(rawMessage, '提交失败。') });
    } finally {
      setSubmitPending(false);
    }
  }

  function openProductLinkDialog() {
    setProductLinkValue((detail?.productUrl ?? me?.productUrl ?? '').trim());
    setProductLinkDialogOpen(true);
  }

  function openProductInNewWindow(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function handleSaveProductLink() {
    if (!session) {
      return;
    }

    const hadProductLink = Boolean((detail?.productUrl ?? me?.productUrl ?? '').trim());

    setProductLinkPending(true);
    try {
      const response = await patchMyProductLink(apiBaseUrl, activity.id, session.sessionToken, {
        productUrl: productLinkValue.trim() || null,
      });

      setMe((current) =>
        current
          ? {
              ...current,
              productUrl: response.productUrl,
              creatorPromoted: response.creatorPromoted,
            }
          : current,
      );
      setDetail((current) =>
        current
          ? {
              ...current,
              productUrl: response.productUrl,
              creatorPromoted: response.creatorPromoted,
            }
          : current,
      );

      setProductLinkDialogOpen(false);
      setNotice({
        tone: 'success',
        message: response.creatorPromoted
          ? hadProductLink
            ? '产品地址已更新，大屏卡片已同步。'
            : '已晋升创造者，大屏卡片已更新。'
          : '已清空产品地址。',
      });
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : '保存产品地址失败';
      setNotice({ tone: 'error', message: friendlyErrorMessage(rawMessage, '保存产品地址失败。') });
    } finally {
      setProductLinkPending(false);
    }
  }

  async function openHistoryDialog() {
    if (!session) {
      return;
    }

    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const nextHistory = await getMeHistory(apiBaseUrl, activity.id, session.sessionToken);
      setHistory(nextHistory);
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : '读取历史记录失败';
      setNotice({ tone: 'error', message: friendlyErrorMessage(rawMessage, '读取历史记录失败。') });
    } finally {
      setHistoryLoading(false);
    }
  }

  function formatTime(value: string) {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }

  function createHistoryMarkdown() {
    const lines = [
      `# ${activity.title} · 历史自测回顾`,
      '',
      `- 同学：${history?.displayName ?? session?.displayName ?? '未命名同学'}`,
      `- 导出时间：${new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date())}`,
      '',
    ];

    for (const item of history?.items ?? []) {
      lines.push(`## 第 ${item.version} 版 · ${formatTime(item.createdAt)}`);
      lines.push('');
      lines.push('### 提示词');
      lines.push(item.promptText);
      lines.push('');

      if (item.evaluation) {
        lines.push('### AI 评分');
        lines.push(`- 总分：${Math.round(item.evaluation.totalScore)}`);
        lines.push(`- 排名：${item.evaluation.rank}`);
        if (item.evaluation.summary) {
          lines.push(`- 总结：${item.evaluation.summary}`);
        }
        lines.push('');
        lines.push('### 亮点');
        for (const point of item.evaluation.strengths) {
          lines.push(`- ${point}`);
        }
        lines.push('');
        lines.push('### 建议优化');
        for (const point of item.evaluation.improvementSuggestions.length > 0
          ? item.evaluation.improvementSuggestions
          : item.evaluation.weaknesses) {
          lines.push(`- ${point}`);
        }
      } else {
        lines.push('### AI 评分');
        lines.push('- 本版尚未完成评测');
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  function exportHistoryMarkdown() {
    if (!history || history.items.length === 0) {
      setNotice({ tone: 'error', message: '还没有可导出的历史记录。' });
      return;
    }

    const blob = new Blob([createHistoryMarkdown()], { type: 'text/markdown;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${session?.displayName ?? 'prompt-benchmark'}-history.md`;
    anchor.click();
    window.URL.revokeObjectURL(url);
    setNotice({ tone: 'success', message: 'Markdown 已导出。' });
  }

  function clearSessionState(removeStorage = false, expectedSessionToken?: string) {
    if (expectedSessionToken && sessionTokenRef.current !== expectedSessionToken) {
      return;
    }

    if (removeStorage) {
      if (!expectedSessionToken) {
        window.localStorage.removeItem(storageKey);
      } else {
        try {
          const raw = window.localStorage.getItem(storageKey);
          const parsed = raw ? (JSON.parse(raw) as SessionPayload) : null;
          if (parsed?.sessionToken === expectedSessionToken) {
            window.localStorage.removeItem(storageKey);
          }
        } catch {
          window.localStorage.removeItem(storageKey);
        }
      }
    }
    setSession(null);
    setMe(null);
    setDetail(null);
    setHistory(null);
    setHistoryOpen(false);
    setPromptText('');
    setDirty(false);
    setPreviewMode(false);
    setSubmitConfirmOpen(false);
    setProductLinkDialogOpen(false);
    setProductLinkValue('');
    hydratedSessionTokenRef.current = null;
  }

  function clearSession() {
    clearSessionState(true);
    setNotice(null);
  }

  const hasPrompt = promptText.trim().length > 0;
  const hasEvaluation = Boolean(detail?.evaluation);
  const isEvaluating = me?.evaluationState === 'queued' || me?.evaluationState === 'running';
  const showEvaluationLoading = evaluatePending || isEvaluating;
  const hasUnsyncedChanges =
    dirty || (me?.latestSubmissionVersion ?? 0) > (me?.latestEvaluatedVersion ?? 0);
  const savedPromptText = (detail?.promptText ?? me?.promptText ?? '').trim();
  const hasSavedPrompt = (me?.latestSubmissionVersion ?? 0) > 0 && Boolean(savedPromptText);
  const canEvaluate = previewMode && !dirty && hasSavedPrompt;
  const canSubmitCurrentVersion =
    previewMode &&
    !dirty &&
    (me?.latestSubmissionVersion ?? 0) > 0 &&
    (me?.latestSubmissionVersion ?? 0) > (me?.latestPublishedVersion ?? 0);
  const reviewButtonLabel = hasEvaluation ? '重新自测' : 'AI自测';
  const currentProductUrl = detail?.productUrl ?? me?.productUrl ?? null;
  const creatorPromoted = detail?.creatorPromoted ?? me?.creatorPromoted ?? false;
  const canManageProductLink = (me?.latestPublishedVersion ?? 0) > 0;
  const creatorDescription = currentProductUrl
    ? creatorPromoted
      ? '产品地址已保存。你已晋升创造者，现在可以继续修改地址或查看作品。'
      : '产品地址已保存，现在可以继续修改地址或查看作品。'
    : '如果你的产品也已经开发完成，请补充产品地址。';
  const overallSummary = isEvaluating
    ? 'AI 正在评测你的当前提示词，结果生成后会自动刷新显示。'
    : hasUnsyncedChanges
      ? '你刚刚调整了提示词。右侧暂时显示上一版结果，点击“重新自测”即可刷新评分。'
      : detail?.evaluation?.summary ?? '完成 AI 自测后，这里会显示整体评价。';
  const currentRank = detail?.evaluation?.rank ?? null;
  const showTopRankPill = typeof currentRank === 'number' && currentRank <= 3;
  const showRankNumber = typeof currentRank === 'number' && currentRank > 3;
  const previousRankScore = detail?.evaluation?.previousRankScore ?? null;
  const chaseTargetScore =
    typeof currentRank === 'number' && currentRank > 1 && previousRankScore !== null
      ? Math.round(previousRankScore)
      : null;
  const currentScoreRaw = detail?.evaluation?.totalScore ?? null;
  const currentScore = currentScoreRaw === null ? null : Math.round(currentScoreRaw);
  const currentScoreTone = currentScoreRaw === null ? null : getScoreTone(currentScoreRaw);
  const waitingForInitialSync = Boolean(session && hydratedSessionTokenRef.current !== session.sessionToken);
  const showWorkbenchBootLoading = Boolean(session && (waitingForInitialSync || initialSyncPending));
  const showEditorCancel = hasSavedPrompt;
  const anonymousEntry = activity.participationMode === 'anonymous';
  const loginTitle = anonymousEntry ? '输入名字进入' : '请进行身份验证';
  const loginPlaceholder = anonymousEntry ? '请输入你的名字' : '请输入与名单一致的姓名';
  const loginHint = anonymousEntry
    ? '第一次使用这个名字会创建你的提交空间，下次输入同名可以继续操作。'
    : '请使用活动名单中的姓名进入提交页。';

  function handleCancelEdit() {
    if (!showEditorCancel) {
      return;
    }

    setPromptText(savedPromptText);
    setDirty(false);
    setPreviewMode(true);
  }

  return (
    <main
      className={`pageShell ${!session ? styles.loginShell : ''}`}
      data-login-shell={!session ? 'true' : undefined}
    >
      <div className={styles.screen}>
        {notice ? (
          <div className={`${styles.notice} ${notice.tone === 'error' ? styles.noticeError : styles.noticeSuccess}`}>
            {notice.message}
          </div>
        ) : null}

        {!session ? (
          <section className={styles.loginStage}>
            <div className={styles.loginBrand}>
              <SiteBrand />
            </div>
            <div className={styles.loginContent}>
              <div className={styles.loginIntro}>
                <div className={styles.loginIconShell}>
                  <FingerprintSimple size={44} weight="duotone" />
                </div>
                <h1 className={styles.loginTitle}>{loginTitle}</h1>
              </div>

              <div className={styles.loginCard}>
                <div className={styles.fieldLabel}>
                  <input
                    autoFocus
                    aria-label="姓名"
                    className={styles.input}
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      setLoginMessage(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && name.trim() && !busy) {
                        void handleLogin();
                      }
                    }}
                    placeholder={loginPlaceholder}
                  />
                  <p className={styles.loginModeHint}>{loginHint}</p>
                  {loginMessage ? <div className={styles.loginErrorText}>{loginMessage}</div> : null}
                </div>

                <div className={styles.buttonColumn}>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={busy || !name.trim()}
                    onClick={() => void handleLogin()}
                  >
                    <span>{busy ? '进入中…' : '进入提交页'}</span>
                    <ArrowRight size={18} weight="bold" />
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className={styles.workbenchStage}>
            <header className={styles.workbenchHeader}>
              <button
                type="button"
                className={`${styles.secondaryButton} ${styles.backButton}`}
                onClick={clearSession}
              >
                <ArrowLeft size={18} weight="bold" />
                <span>更换名字</span>
              </button>
              <button
                type="button"
                className={`${styles.secondaryButton} ${styles.tutorialButton}`}
                onClick={() => setTutorialDialogOpen(true)}
              >
                <LinkSimple size={18} weight="bold" />
                <span>学习教程</span>
              </button>
            </header>

            <div className={styles.workbenchGrid}>
              <section className={styles.editorPanel}>
                <div className={styles.editorTop}>
                  <div>
                    <h2 className={styles.sectionTitle}>提示词编辑区</h2>
                  </div>
                  <div className={styles.nameChip}>
                    <User size={16} />
                    <span>{session.displayName}</span>
                  </div>
                </div>

                {previewMode ? (
                  <>
                    <div className={`${styles.editorField} ${styles.previewField}`}>
                      {hasPrompt ? (
                        <div className={styles.previewBox}>
                          <PromptMarkdown
                            markdown={promptText}
                            strengthQuotes={detail?.evaluation?.strengthEvidenceQuotes ?? []}
                            weaknessQuotes={detail?.evaluation?.weaknessEvidenceQuotes ?? []}
                          />
                        </div>
                      ) : (
                        <div className={styles.previewEmpty}>还没有可预览的提示词内容。</div>
                      )}
                    </div>

                    <div className={`${styles.actionRow} ${styles.previewActionRow}`}>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => setPreviewMode(false)}
                      >
                        <span>修改提示词</span>
                      </button>
                      <div className={styles.previewActionGroup}>
                        {canSubmitCurrentVersion ? (
                          <button
                            type="button"
                            className={styles.primaryButton}
                            disabled={submitPending}
                            onClick={() => setSubmitConfirmOpen(true)}
                          >
                            <span>
                              {submitPending ? '提交中…' : (me?.latestPublishedVersion ?? 0) > 0 ? '更新大屏内容' : '提交到大屏'}
                            </span>
                            <ArrowRight size={18} weight="bold" />
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {canManageProductLink ? (
                      <div className={styles.creatorPanel}>
                        <div className={styles.creatorCopy}>
                          <div className={styles.creatorTitleRow}>
                            <span className={styles.linkLabel}>
                              <LinkSimple size={14} weight="bold" />
                              <span>晋升创造者</span>
                            </span>
                            {creatorPromoted ? <span className={styles.creatorStatus}>已晋升创造者</span> : null}
                          </div>
                          <div className={styles.creatorDescription}>{creatorDescription}</div>
                          {currentProductUrl ? (
                            <div className={styles.creatorLinkValue}>{currentProductUrl}</div>
                          ) : null}
                        </div>

                        <div className={styles.creatorActions}>
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={openProductLinkDialog}
                          >
                            <LinkSimple size={16} weight="bold" />
                            <span>{currentProductUrl ? '修改产品地址' : '填写产品地址'}</span>
                          </button>
                          {currentProductUrl ? (
                            <button
                              type="button"
                              className={styles.secondaryButton}
                              onClick={() => openProductInNewWindow(currentProductUrl)}
                            >
                              <ArrowSquareOut size={16} weight="bold" />
                              <span>查看作品</span>
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  showWorkbenchBootLoading ? (
                    <div className={styles.editorBootLoading} role="status" aria-live="polite">
                      <div className={styles.editorBootBadge}>正在同步内容</div>
                      <div className={styles.editorBootTitle}>正在加载提示词内容</div>
                      <div className={styles.editorBootTrack} aria-hidden="true">
                        <span className={styles.editorBootTrackFill} />
                      </div>
                    </div>
                  ) : (
                  <>
                    <div className={styles.editorField}>
                      <textarea
                        className={styles.textarea}
                        value={promptText}
                        onChange={(event) => {
                          setPromptText(event.target.value);
                          setDirty(true);
                        }}
                        placeholder="请直接输入你要提交的提示词内容…"
                      />
                    </div>

                    <div className={`${styles.actionRow} ${styles.editorActionRow}`}>
                      {showEditorCancel ? (
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          disabled={savePending}
                          onClick={handleCancelEdit}
                        >
                          <span>取消</span>
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={styles.primaryButton}
                        disabled={savePending || !hasPrompt}
                        onClick={() => void handleSave()}
                      >
                        <span>{savePending ? '保存中…' : '保存提示词'}</span>
                        <ArrowRight size={18} weight="bold" />
                      </button>
                    </div>
                  </>
                  )
                )}
              </section>

              <aside className={styles.reviewPanel}>
                <div className={styles.reviewFrame}>
                  <div className={styles.reviewHeader}>
                    <div>
                      <h2 className={styles.sectionTitle}>AI 评分区</h2>
                    </div>
                    <div className={styles.reviewHeaderActions}>
                      {canEvaluate || isEvaluating ? (
                        <button
                          type="button"
                          className={`${styles.primaryButton} ${styles.reviewHeaderPrimaryAction}`}
                          disabled={evaluatePending || isEvaluating || !canEvaluate}
                          onClick={() => void handleSelfEvaluation()}
                        >
                          {hasEvaluation ? <ArrowClockwise size={16} weight="bold" /> : <Lightning size={16} weight="fill" />}
                          <span>{evaluatePending || isEvaluating ? 'AI自测中…' : reviewButtonLabel}</span>
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={`${styles.secondaryButton} ${styles.reviewHistoryButton}`}
                        onClick={() => void openHistoryDialog()}
                      >
                        <ClockCounterClockwise size={16} className={styles.historyActionIcon} />
                        <span>查看历史对话</span>
                      </button>
                    </div>
                  </div>

                  {showWorkbenchBootLoading ? (
                    <div className={styles.loadingState} role="status" aria-live="polite">
                      <div className={styles.loadingCard}>
                        <div className={styles.loadingTextBlock}>
                          <div className={styles.loadingTitle}>正在准备评分面板</div>
                          <div className={styles.loadingDescription}>
                            正在同步你的活动信息、提示词内容和 AI 评分状态。
                          </div>
                        </div>

                        <div className={styles.loadingTrack} aria-hidden="true">
                          <span className={styles.loadingTrackFill} />
                        </div>

                        <div className={styles.loadingSteps}>
                          <div className={styles.loadingStep}>
                            <span>恢复会话</span>
                          </div>
                          <div className={styles.loadingStep}>
                            <span>同步提示词</span>
                          </div>
                          <div className={styles.loadingStep}>
                            <span>准备评分面板</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : showEvaluationLoading ? (
                    <div className={styles.loadingState} role="status" aria-live="polite">
                      <div className={styles.loadingCard}>
                        <div className={styles.loadingIconShell}>
                          <ArrowClockwise size={34} weight="bold" className={styles.loadingSpinnerIcon} />
                        </div>

                        <div className={styles.loadingTextBlock}>
                          <div className={styles.loadingTitle}>
                            {hasEvaluation ? 'AI正在重新测评' : 'AI 正在评测当前提示词'}
                          </div>
                          {hasEvaluation ? null : (
                            <div className={styles.loadingDescription}>
                              评分、亮点和优化建议正在生成中，完成后会自动刷新显示。
                            </div>
                          )}
                        </div>

                        <div className={styles.loadingTrack} aria-hidden="true">
                          <span className={styles.loadingTrackFill} />
                        </div>

                        <div className={styles.loadingSteps}>
                          <div className={styles.loadingStep}>
                            <span>分析提示词结构</span>
                          </div>
                          <div className={styles.loadingStep}>
                            <span>生成评分结果</span>
                          </div>
                          <div className={styles.loadingStep}>
                            <span>整理优化建议</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : !hasEvaluation ? (
                    <div className={styles.placeholderState}>
                      <div className={styles.placeholderText}>
                        {canEvaluate ? 'AI评测后将显示内容在此' : '先保存提示词，再开始 AI 自测'}
                      </div>
                      {canEvaluate ? (
                        <button
                          type="button"
                          className={`${styles.primaryButton} ${styles.reviewPlaceholderButton}`}
                          disabled={evaluatePending}
                          onClick={() => void handleSelfEvaluation()}
                        >
                          <Lightning size={22} weight="fill" />
                          <span>{evaluatePending ? 'AI自测中…' : 'AI自测'}</span>
                        </button>
                      ) : (
                        <div className={styles.placeholderHint}>
                          保存后会切换到预览区；确认无误后，你可以先自测，再决定是否提交到大屏。
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className={styles.scoreHeroRow}>
                        <div className={styles.scoreHero} data-score-tone={currentScoreTone ?? undefined}>
                          <div className={styles.scoreHeroMain}>
                            <div className={styles.scoreValue} data-score-tone={currentScoreTone ?? undefined}>
                              {currentScore ?? '…'}
                              <span className={styles.scoreUnit}>/100</span>
                            </div>
                          </div>

                          <div
                            className={styles.scoreRankWrap}
                            data-has-target={chaseTargetScore !== null ? 'true' : undefined}
                          >
                            <div className={styles.rankBadgeShell}>
                              {showTopRankPill ? (
                                <span className={styles.rankPillLarge}>{`Top ${currentRank}`}</span>
                              ) : showRankNumber ? (
                                <span className={styles.numberBadgeLarge}>#{currentRank}</span>
                              ) : (
                                <span className={styles.rankPlaceholder}>未排名</span>
                              )}
                            </div>
                            {chaseTargetScore !== null ? (
                              <div className={styles.rankTargetRow} aria-label={`上一名：${chaseTargetScore}分`}>
                                <span className={styles.rankTargetLabel}>上一名：</span>
                                <span className={styles.rankTargetValue}>{chaseTargetScore}分</span>
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div className={styles.scoreSummarySide}>
                          <div className={styles.scoreHeroSummaryTitle}>整体评价</div>
                          <div className={styles.scoreHeroSummary}>{overallSummary}</div>
                        </div>
                      </div>

                      {detail?.evaluation ? (
                        <div className={styles.feedbackGrid}>
                          <section className={styles.feedbackCard}>
                            <div className={styles.feedbackTitle}>
                              <Sparkle size={18} weight="fill" className={styles.feedbackIconGood} />
                              <span>亮点</span>
                            </div>
                            <ul>
                              {(detail.evaluation.strengths.length > 0
                                ? detail.evaluation.strengths
                                : ['结构已经具备基础可读性，可以继续细化。']
                              ).map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </section>

                          <section className={styles.feedbackCard}>
                            <div className={styles.feedbackTitle}>
                              <WarningCircle size={18} weight="fill" className={styles.feedbackIconWarn} />
                              <span>建议优化</span>
                            </div>
                            <ul>
                              {(detail.evaluation.improvementSuggestions.length > 0
                                ? detail.evaluation.improvementSuggestions
                                : detail.evaluation.weaknesses.length > 0
                                  ? detail.evaluation.weaknesses
                                  : ['可以补充更多输出格式、边界条件和示例。']
                              ).map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </section>
                        </div>
                      ) : null}

                      {detail?.evaluation ? (
                        <div className={styles.analysisSectionHeader}>
                          <div className={styles.analysisSectionDivider} />
                          <div className={styles.analysisSectionTitle}>指标分析</div>
                        </div>
                      ) : null}

                      {detail?.evaluation ? (
                        <div className={styles.dimensionGrid}>
                          {dimensionMeta.map((item) => {
                            const value = detail.evaluation?.dimensionScores[item.key] ?? 0;
                            const ratio = Math.max(0, Math.min(100, (value / item.max) * 100));
                            return (
                              <div key={item.key} className={styles.dimensionCard}>
                                <div className={styles.dimensionHeader}>
                                  <span>{item.label}</span>
                                  <strong>
                                    {value}/{item.max}
                                  </strong>
                                </div>
                                <div className={styles.dimensionTrack}>
                                  <span className={styles.dimensionFill} style={{ width: `${ratio}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}

                      {!canEvaluate && !isEvaluating ? (
                        <div className={styles.reviewFooter}>
                          <div className={styles.reviewHintBanner}>当前有未保存修改，请先保存后再进行 AI 自测。</div>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </aside>
            </div>
          </section>
        )}
      </div>

      <HistoryDialog
        history={history}
        loading={historyLoading}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onExport={exportHistoryMarkdown}
      />

      {submitConfirmOpen ? (
        <div className={styles.confirmOverlay} role="presentation" onClick={() => setSubmitConfirmOpen(false)}>
          <div
            className={styles.confirmDialog}
            role="dialog"
            aria-modal="true"
            aria-label="提交到大屏"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.confirmTitle}>确认提交到大屏？</div>
            <div className={styles.confirmBody}>
              这版提示词会显示到现场大屏。提交后你仍然可以继续修改，修改后重新保存并再次提交，就能更新大屏内容。
            </div>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={submitPending}
                onClick={() => setSubmitConfirmOpen(false)}
              >
                先不提交
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={submitPending}
                onClick={() => void handlePublishSubmission()}
              >
                {submitPending ? '提交中…' : '确认提交'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {productLinkDialogOpen ? (
        <div className={styles.confirmOverlay} role="presentation" onClick={() => setProductLinkDialogOpen(false)}>
          <div
            className={styles.confirmDialog}
            role="dialog"
            aria-modal="true"
            aria-label="填写产品地址"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.confirmTitle}>填写产品地址</div>
            <div className={styles.dialogField}>
              <div className={styles.dialogLabel}>产品地址</div>
              <input
                className={`${styles.input} ${styles.dialogInput}`}
                value={productLinkValue}
                onChange={(event) => setProductLinkValue(event.target.value)}
                placeholder="例如：https://demo.example.com"
                autoFocus
              />
            </div>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={productLinkPending}
                onClick={() => setProductLinkDialogOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={productLinkPending}
                onClick={() => void handleSaveProductLink()}
              >
                {productLinkPending ? '保存中…' : '保存地址'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {tutorialDialogOpen ? (
        <div className={styles.confirmOverlay} role="presentation" onClick={() => setTutorialDialogOpen(false)}>
          <div
            className={`${styles.confirmDialog} ${styles.tutorialDialog}`}
            role="dialog"
            aria-modal="true"
            aria-label="学习教程"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.confirmTitle}>学习教程</div>
            <div className={styles.tutorialList}>
              {tutorialDocs.map((doc) => (
                <button
                  key={doc.url}
                  type="button"
                  className={styles.tutorialItem}
                  onClick={() => openProductInNewWindow(doc.url)}
                >
                  <span>{doc.title}</span>
                  <ArrowSquareOut size={18} weight="bold" />
                </button>
              ))}
            </div>
            <div className={styles.confirmActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setTutorialDialogOpen(false)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
