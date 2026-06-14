/*
## 核心功能
维护 history-dialog.tsx 在 Prompt Benchmark 中的实现职责，支撑 组件化界面或服务。

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

import { ClockCounterClockwise, DownloadSimple, Sparkle, WarningCircle, X } from '@phosphor-icons/react';
import { useEffect } from 'react';

import { getScoreTone } from '@/lib/score-tone';
import type { ParticipantHistoryResponse } from '@/lib/types';

import { PromptMarkdown } from '../dashboard/prompt-markdown';
import styles from './join-screen.module.css';

type Props = {
  history: ParticipantHistoryResponse | null;
  loading: boolean;
  open: boolean;
  onClose: () => void;
  onExport: () => void;
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function HistoryDialog({ history, loading, open, onClose, onExport }: Props) {
  useEffect(() => {
    if (!open) {
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
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className={styles.historyOverlay} role="dialog" aria-modal="true" aria-label="查看历史对话">
      <div className={styles.historyDialog}>
        <div className={styles.historyHeader}>
          <div>
            <div className={styles.sectionTag}>History</div>
            <h2 className={styles.sectionTitle}>
              <span className={styles.historyTitleIcon}>
                <ClockCounterClockwise size={18} weight="fill" />
              </span>
              <span>查看历史对话</span>
            </h2>
          </div>
          <div className={styles.historyActions}>
            <button type="button" className={styles.secondaryButton} onClick={onExport} disabled={!history || history.items.length === 0}>
              <DownloadSimple size={18} />
              <span>导出 Markdown</span>
            </button>
            <button type="button" className={styles.ghostIconButton} onClick={onClose} aria-label="关闭历史记录">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className={styles.historyBody}>
          {loading ? (
            <div className={styles.historyEmpty}>正在读取历史记录…</div>
          ) : history && history.items.length > 0 ? (
            <div className={styles.historyList}>
              {history.items.map((item) => {
                const rawScore = item.evaluation?.totalScore ?? null;
                const roundedScore = rawScore === null ? null : Math.round(rawScore);
                const scoreTone = rawScore === null ? null : getScoreTone(rawScore);

                return (
                  <article key={item.version} className={styles.historyCard}>
                    <div className={styles.historyCardTop}>
                      <div>
                        <div className={styles.historyVersion}>第 {item.version} 版</div>
                        <div className={styles.historyTime}>{formatTime(item.createdAt)}</div>
                      </div>
                      <div className={styles.historyScore} data-score-tone={scoreTone ?? undefined}>
                        {roundedScore === null ? '未评测' : `${roundedScore} 分`}
                      </div>
                    </div>

                    <div className={styles.historySection}>
                      <div className={styles.historySectionTitle}>提示词</div>
                      <div className={styles.historyPrompt}>
                        <PromptMarkdown
                          markdown={item.promptText}
                          strengthQuotes={item.evaluation?.strengthEvidenceQuotes ?? []}
                          weaknessQuotes={item.evaluation?.weaknessEvidenceQuotes ?? []}
                        />
                      </div>
                    </div>

                    <div className={styles.historyMetaGrid}>
                      <div className={styles.historyMetaCard}>
                        <div className={`${styles.historySectionTitle} ${styles.historyMetaTitle}`}>
                          <Sparkle size={16} weight="fill" className={styles.feedbackIconGood} />
                          <span>亮点</span>
                        </div>
                        <ul>
                          {(item.evaluation?.strengths?.length ? item.evaluation.strengths : ['暂无']).map((point) => (
                            <li key={point}>{point}</li>
                          ))}
                        </ul>
                      </div>
                      <div className={styles.historyMetaCard}>
                        <div className={`${styles.historySectionTitle} ${styles.historyMetaTitle}`}>
                          <WarningCircle size={16} weight="fill" className={styles.feedbackIconWarn} />
                          <span>建议优化</span>
                        </div>
                        <ul>
                          {(
                            item.evaluation?.improvementSuggestions?.length
                              ? item.evaluation.improvementSuggestions
                              : item.evaluation?.weaknesses?.length
                                ? item.evaluation.weaknesses
                                : ['暂无']
                          ).map((point) => (
                            <li key={point}>{point}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className={styles.historyEmpty}>还没有可查看的历史记录。</div>
          )}
        </div>
      </div>
    </div>
  );
}
