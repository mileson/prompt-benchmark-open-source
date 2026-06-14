/*
## 核心功能
维护 detail-modal.tsx 在 Prompt Benchmark 中的实现职责，支撑 组件化界面或服务。

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
import { Sparkle, TrendUp, WarningCircle } from '@phosphor-icons/react';
import { useEffect, useMemo } from 'react';

import type { ParticipantDetail } from '@/lib/types';

import { PromptMarkdown } from './prompt-markdown';
import styles from './detail-modal.module.css';

type Props = {
  detail: ParticipantDetail | null;
  loading: boolean;
  onClose: () => void;
};

const metricMeta = [
  ['structuralCompleteness', '结构完整度', 25],
  ['precisionClarity', '意图表达精准度', 25],
  ['exemplarGuidance', '示例与模式引导力', 15],
  ['contextBoundaryControl', '上下文与边界控制力', 20],
  ['taskDecomposition', '复杂任务逻辑拆解度', 15],
] as const;

export function DetailModal({ detail, loading, onClose }: Props) {
  const totalScore = detail?.evaluation?.totalScore ?? null;
  const showAnalysisPanel = !(loading && !detail);
  const displayName = detail?.creatorPromoted ? `${detail.displayName} 🎉` : (detail?.displayName ?? '正在载入同学内容');
  const metrics = useMemo(() => {
    if (!detail?.evaluation) {
      return [];
    }

    return metricMeta.map(([key, label, max]) => ({
      key,
      label,
      max,
      value: detail.evaluation!.dimensionScores[key],
    }));
  }, [detail]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div className={styles.modal} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <div className={styles.titleWrap}>
            <h2 className={styles.title}>{displayName}</h2>
            <div className={styles.metaRow}>
              <span className={styles.chip}>{detail?.status === 'evaluating' ? 'AI点评中' : 'AI评分'}</span>
              <span className={styles.chip}>{totalScore === null ? '分数待生成' : `AI评分 ${Math.round(totalScore)}`}</span>
              <span className={styles.chip}>
                {detail?.evaluation?.rank ? `Top ${detail.evaluation.rank}` : '排名待生成'}
              </span>
              <span className={styles.chip}>AI评分仅用于现场互动与教学参考</span>
            </div>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            关闭
          </button>
        </div>

        <div className={`${styles.body} ${!showAnalysisPanel ? styles.bodySingleColumn : ''}`}>
          <div className={styles.column}>
            <div className={styles.promptPanel}>
              <h3 className={styles.sectionTitle}>提示词全文</h3>
              <div className={styles.promptBox}>
                {loading && !detail ? (
                  <div className={styles.empty}>正在读取同学内容…</div>
                ) : detail?.promptText ? (
                  <PromptMarkdown
                    markdown={detail.promptText}
                    strengthQuotes={detail.evaluation?.strengthEvidenceQuotes ?? []}
                    weaknessQuotes={detail.evaluation?.weaknessEvidenceQuotes ?? []}
                  />
                ) : (
                  <div className={styles.empty}>这位同学还没有提交内容。</div>
                )}
              </div>
            </div>
          </div>

          {showAnalysisPanel ? (
            <div className={styles.column}>
              <div className={styles.analysisPanel}>
                <h3 className={styles.sectionTitle}>AI 点评结果</h3>
                {detail?.evaluation ? (
                  <>
                    <div className={styles.insightGrid}>
                      <div className={styles.listBox}>
                        <h4 className={`${styles.sectionTitle} ${styles.listTitle}`}>
                          <span className={`${styles.titleIcon} ${styles.titleIconGood}`}>
                            <Sparkle size={18} weight="fill" />
                          </span>
                          <span>优点</span>
                        </h4>
                        <ul className={styles.list}>
                          {detail.evaluation.strengths.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>

                      <div className={styles.listBox}>
                        <h4 className={`${styles.sectionTitle} ${styles.listTitle}`}>
                          <span className={`${styles.titleIcon} ${styles.titleIconWarn}`}>
                            <WarningCircle size={18} weight="fill" />
                          </span>
                          <span>可改进点</span>
                        </h4>
                        <ul className={styles.list}>
                          {detail.evaluation.weaknesses.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className={styles.listBox}>
                      <h4 className={`${styles.sectionTitle} ${styles.listTitle}`}>
                        <span className={`${styles.titleIcon} ${styles.titleIconNext}`}>
                          <TrendUp size={18} weight="fill" />
                        </span>
                        <span>建议下一步怎么改</span>
                      </h4>
                      <ul className={styles.list}>
                        {detail.evaluation.improvementSuggestions.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>

                    <div className={styles.analysisDividerWrap}>
                      <div className={styles.analysisDivider} />
                      <div className={styles.analysisDividerTitle}>指标分析</div>
                    </div>

                    <div className={styles.analysisBox}>
                      <div className={styles.scoreRows}>
                        {metrics.map((metric) => (
                          <div key={metric.key} className={styles.scoreRow}>
                            <div className={styles.scoreLabel}>
                              <span>{metric.label}</span>
                              <strong>{metric.value}/{metric.max}</strong>
                            </div>
                            <div className={styles.track}>
                              <div className={styles.fill} style={{ width: `${(metric.value / metric.max) * 100}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                  </>
                ) : (
                  <div className={styles.analysisBox}>
                    <div className={styles.empty}>
                      {detail?.status === 'evaluating'
                        ? 'AI 正在生成点评，完成后这里会自动更新。'
                        : '还没有可展示的 AI 点评结果。'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
