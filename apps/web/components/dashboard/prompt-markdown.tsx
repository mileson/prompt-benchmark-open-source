/*
## 核心功能
维护 prompt-markdown.tsx 在 Prompt Benchmark 中的实现职责，支撑 组件化界面或服务。

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
import { useMemo } from 'react';
import { marked } from 'marked';

import styles from './detail-modal.module.css';

type Props = {
  markdown: string;
  strengthQuotes: string[];
  weaknessQuotes: string[];
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function injectHighlights(html: string, quotes: string[], className: string) {
  const uniqueQuotes = [...new Set(quotes.map((item) => item.trim()).filter(Boolean))].sort(
    (left, right) => right.length - left.length,
  );

  return uniqueQuotes.reduce((currentHtml, quote) => {
    const pattern = new RegExp(escapeRegExp(quote), 'g');
    return currentHtml.replace(pattern, `<mark class="${styles.promptHighlight} ${className}">${quote}</mark>`);
  }, html);
}

export function PromptMarkdown({ markdown, strengthQuotes, weaknessQuotes }: Props) {
  const html = useMemo(() => {
    const baseHtml = marked.parse(markdown, {
      breaks: true,
      gfm: true,
    }) as string;

    const normalizedStrengths = [...new Set(strengthQuotes.map((item) => item.trim()).filter(Boolean))];
    const normalizedWeaknesses = [...new Set(weaknessQuotes.map((item) => item.trim()).filter(Boolean))];
    const overlap = new Set(normalizedStrengths.filter((item) => normalizedWeaknesses.includes(item)));
    const safeStrengths = normalizedStrengths.filter((item) => !overlap.has(item));
    const safeWeaknesses = normalizedWeaknesses.filter((item) => !overlap.has(item));

    const withStrengths = injectHighlights(baseHtml, safeStrengths, styles.promptHighlightStrength);
    return injectHighlights(withStrengths, safeWeaknesses, styles.promptHighlightWeakness);
  }, [markdown, strengthQuotes, weaknessQuotes]);

  return <div className={styles.promptMarkdown} dangerouslySetInnerHTML={{ __html: html }} />;
}
