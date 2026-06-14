/*
## 核心功能
维护 page.tsx 在 Prompt Benchmark 中的实现职责，支撑 项目核心流程。

## 输入
来自上游页面、服务、配置、用户动作、测试或构建流程的数据。

## 输出
向调用方提供函数、类型、视图、状态、配置或处理结果。

## 定位
位于 apps/web/app，只承担该目录约定的局部职责。

## 依赖
依赖同目录或相邻模块、项目配置以及运行时框架提供的能力。

## 维护规则
修改逻辑、输入输出、外部依赖或职责边界后，同步更新本文件说明书和所在文件夹 README。
*/
import { ActivityListScreen } from '@/components/activity-list-screen';
import { getActivities, getPublicApiBaseUrl } from '@/lib/api';
import type { ActivityListItem } from '@/lib/types';

import styles from './page.module.css';

export default async function HomePage() {
  let activities: ActivityListItem[] = [];
  let loadError: string | null = null;

  try {
    activities = (await getActivities()).activities;
  } catch {
    loadError = '活动列表暂时无法加载，请稍后刷新。';
  }

  return (
    <div className={styles.page}>
      <ActivityListScreen
        initialActivities={activities}
        apiBaseUrl={getPublicApiBaseUrl()}
        loadError={loadError}
      />
    </div>
  );
}
