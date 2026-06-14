/*
## 核心功能
维护 page.tsx 在 Prompt Benchmark 中的实现职责，支撑 项目核心流程。

## 输入
来自上游页面、服务、配置、用户动作、测试或构建流程的数据。

## 输出
向调用方提供函数、类型、视图、状态、配置或处理结果。

## 定位
位于 apps/web/app/join/[slug]，只承担该目录约定的局部职责。

## 依赖
依赖同目录或相邻模块、项目配置以及运行时框架提供的能力。

## 维护规则
修改逻辑、输入输出、外部依赖或职责边界后，同步更新本文件说明书和所在文件夹 README。
*/
import { notFound, redirect } from 'next/navigation';

import { JoinScreen } from '@/components/join/join-screen';
import { getActivityBySlug, getPublicApiBaseUrl } from '@/lib/api';

export default async function JoinPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  if (slug === 'prompt-benchmark-demo') {
    redirect('/join/1');
  }

  try {
    const activity = await getActivityBySlug(slug);

    return (
      <JoinScreen
        activity={activity}
        apiBaseUrl={getPublicApiBaseUrl()}
      />
    );
  } catch {
    notFound();
  }
}
