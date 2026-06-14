/*
## 核心功能
维护 use-flip-grid.ts 在 Prompt Benchmark 中的实现职责，支撑 组件化界面或服务。

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

import { useCallback, useEffect, useRef } from 'react';

type RefreshableCard = {
  participantId: string;
  updatedAt: string;
  status: string;
  currentScore: number | null;
  currentRank: number | null;
  previewText: string | null;
};

export function useFlipGrid(cards: RefreshableCard[]) {
  const nodesRef = useRef(new Map<string, HTMLElement>());
  const signaturesRef = useRef(new Map<string, string>());

  const registerNode = useCallback(
    (key: string) => (node: HTMLElement | null) => {
      if (node) {
        nodesRef.current.set(key, node);
      } else {
        nodesRef.current.delete(key);
      }
    },
    [],
  );

  useEffect(() => {
    for (const card of cards) {
      const signature = [
        card.updatedAt,
        card.status,
        card.currentScore ?? '',
        card.currentRank ?? '',
        card.previewText ?? '',
      ].join('|');

      const previousSignature = signaturesRef.current.get(card.participantId);
      signaturesRef.current.set(card.participantId, signature);

      if (!previousSignature || previousSignature === signature) {
        continue;
      }

      if (card.status !== 'logged_in') {
        continue;
      }

      const node = nodesRef.current.get(card.participantId);
      if (!node) {
        continue;
      }

      node.classList.remove('card-refresh-wave');
      void node.offsetWidth;
      node.classList.add('card-refresh-wave');

      const handleAnimationEnd = () => {
        node.classList.remove('card-refresh-wave');
      };

      node.addEventListener('animationend', handleAnimationEnd, { once: true });
    }
  }, [cards]);

  return registerNode;
}
