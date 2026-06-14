/*
## 核心功能
维护 participant-card.tsx 在 Prompt Benchmark 中的实现职责，支撑 组件化界面或服务。

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
import type { CSSProperties, MouseEvent } from 'react';

import type { DashboardCard } from '@/lib/types';

import styles from './participant-card.module.css';

type Props = {
  card: DashboardCard;
  rankingVisible: boolean;
  registerNode: (node: HTMLDivElement | null) => void;
  onOpen: (participantId: string) => void;
  lotteryState?: 'rolling' | 'winner' | null;
};

function auraForCard(card: DashboardCard): CSSProperties {
  if (card.creatorPromoted) {
    return { '--aura-primary': 'rgba(255, 216, 118, 0.48)', '--aura-secondary': 'rgba(106, 244, 224, 0.34)' } as CSSProperties;
  }
  if (card.status === 'not_joined') {
    return { '--aura-primary': 'rgba(255,255,255,0)', '--aura-secondary': 'rgba(255,255,255,0)' } as CSSProperties;
  }
  if (card.status === 'logged_in') {
    return { '--aura-primary': 'rgba(255, 226, 108, 0.56)', '--aura-secondary': 'rgba(255, 184, 72, 0.28)' } as CSSProperties;
  }
  if (card.status === 'submitted') {
    return { '--aura-primary': 'rgba(98, 255, 170, 0.5)', '--aura-secondary': 'rgba(96, 255, 214, 0.26)' } as CSSProperties;
  }
  if (card.status === 'evaluating') {
    return { '--aura-primary': 'rgba(126, 164, 255, 0.38)', '--aura-secondary': 'rgba(184, 114, 255, 0.28)' } as CSSProperties;
  }
  if (card.status === 'scored') {
    if ((card.currentScore ?? 0) >= 90) {
      return { '--aura-primary': 'rgba(255, 226, 132, 0.42)', '--aura-secondary': 'rgba(118, 255, 220, 0.34)' } as CSSProperties;
    }
    if ((card.currentScore ?? 0) >= 75) {
      return { '--aura-primary': 'rgba(122, 255, 212, 0.36)', '--aura-secondary': 'rgba(136, 240, 255, 0.28)' } as CSSProperties;
    }
    return { '--aura-primary': 'rgba(255, 180, 110, 0.36)', '--aura-secondary': 'rgba(255, 126, 170, 0.24)' } as CSSProperties;
  }
  return { '--aura-primary': 'rgba(255,255,255,0)', '--aura-secondary': 'rgba(255,255,255,0)' } as CSSProperties;
}

export function ParticipantCard({ card, rankingVisible, registerNode, onOpen, lotteryState = null }: Props) {
  const isScored = card.status === 'scored' && card.currentScore !== null;
  const isOffline = card.status === 'not_joined';
  const isLearning = card.status === 'logged_in';
  const isEvaluating = card.status === 'evaluating';
  const hasLiveStatus = isLearning || isEvaluating;
  const hasStatusPill = hasLiveStatus || isOffline;
  const showCreatorDock = card.creatorPromoted && Boolean(card.productUrl);
  const displayName = card.creatorPromoted ? `${card.displayName} 🎉` : card.displayName;
  const showTopPill = isScored && rankingVisible && card.currentRank && card.currentRank <= 3;
  const showRankNumber = isScored && rankingVisible && card.currentRank && card.currentRank > 3;
  const scorePillClassName =
    isScored
      ? `${styles.scorePill} ${styles.scorePillScored}`
      : hasLiveStatus
        ? `${styles.scorePill} ${styles.scorePillLearning} ${isEvaluating ? styles.scorePillEvaluating : ''}`
        : isOffline
          ? `${styles.scorePill} ${styles.scorePillOffline}`
          : styles.scorePill;
  const cardClassName = [
    styles.card,
    hasLiveStatus ? styles.cardLearning : '',
    showCreatorDock ? styles.cardCreator : '',
    lotteryState === 'rolling' ? styles.cardLotteryRolling : '',
    lotteryState === 'winner' ? styles.cardLotteryWinner : '',
  ].filter(Boolean).join(' ');

  function handleOpenProduct(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (!card.productUrl) {
      return;
    }

    window.open(card.productUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <div
      className={cardClassName}
      style={auraForCard(card)}
      ref={registerNode}
      data-participant-id={card.participantId}
    >
      <span className={styles.refreshWave} aria-hidden="true" />
      <span className={styles.lotteryMist} aria-hidden="true" />
      <span className={styles.lotteryRim} aria-hidden="true" />
      <button type="button" className={styles.cardSurface} onClick={() => onOpen(card.participantId)}>
        <div className={styles.content}>
          {isScored ? (
            <>
              <div className={styles.topRow}>
                <div>
                  {showTopPill ? (
                    <span className={styles.rankPill}>{`Top ${card.currentRank}`}</span>
                  ) : showRankNumber ? (
                    <span className={styles.numberBadge}>#{card.currentRank}</span>
                  ) : (
                    <span className={styles.rankPlaceholder} aria-hidden="true" />
                  )}
                </div>
                <div className={scorePillClassName}>
                  AI评分
                  <span className={styles.scoreValue}>{Math.round(card.currentScore ?? 0)}</span>
                </div>
              </div>

              <div className={styles.middleRow}>
                <h3 className={styles.name}>{displayName}</h3>
              </div>
            </>
          ) : hasStatusPill ? (
            <>
              <div className={styles.topRowLiveStatus}>
                <div className={scorePillClassName}>
                  {isOffline ? (
                    '未上线'
                  ) : (
                    <>
                      <span className={styles.learningDot} aria-hidden="true" />
                      {isEvaluating ? '点评中' : '学习中'}
                      <span className={styles.learningSignal} aria-hidden="true">
                        <span />
                        <span />
                        <span />
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className={styles.middleRow}>
                <h3 className={styles.name}>{displayName}</h3>
              </div>
            </>
          ) : (
            <>
              <div className={styles.topRowEmpty} aria-hidden="true" />
              <div className={styles.middleRow}>
                <h3 className={styles.name}>{displayName}</h3>
              </div>
            </>
          )}

          <div style={{ display: 'grid', gap: 10 }}>
            {card.previewText ? <p className={styles.preview}>{card.previewText}</p> : null}
          </div>
        </div>
      </button>

      {showCreatorDock ? (
        <div className={styles.creatorDock}>
          <span className={styles.creatorBadge}>晋升创造者</span>
          <button type="button" className={styles.creatorAction} onClick={handleOpenProduct}>
            查看作品
          </button>
        </div>
      ) : null}
    </div>
  );
}
