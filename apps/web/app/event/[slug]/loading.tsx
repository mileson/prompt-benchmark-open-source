/*
## 核心功能
维护 loading.tsx 在 Prompt Benchmark 中的实现职责，支撑 项目核心流程。

## 输入
来自上游页面、服务、配置、用户动作、测试或构建流程的数据。

## 输出
向调用方提供函数、类型、视图、状态、配置或处理结果。

## 定位
位于 apps/web/app/event/[slug]，只承担该目录约定的局部职责。

## 依赖
依赖同目录或相邻模块、项目配置以及运行时框架提供的能力。

## 维护规则
修改逻辑、输入输出、外部依赖或职责边界后，同步更新本文件说明书和所在文件夹 README。
*/
import dashboardStyles from '@/components/dashboard/dashboard-screen.module.css';

import styles from './loading.module.css';

export default function Loading() {
  return (
    <main className={`pageShell ${dashboardStyles.screen} ${styles.page}`} data-theme="dark">
      <section className={styles.shell}>
        <div className={`glass ${styles.card}`}>
          <div className={styles.topRow}>
            <div className={styles.badge}>正在进入学员大屏</div>
            <div className={styles.signal} aria-hidden="true">
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
            </div>
          </div>

          <div className={styles.description}>正在同步活动配置、学员状态与最新点评结果</div>

          <div className={styles.track} aria-hidden="true" />

          <div className={styles.steps}>
            <div className={styles.step}>
              <div className={styles.stepLabel}>活动配置已接入</div>
              <div className={styles.stepBar} aria-hidden="true" />
            </div>
            <div className={styles.step}>
              <div className={styles.stepLabel}>学员状态同步中</div>
              <div className={styles.stepBar} aria-hidden="true" />
            </div>
            <div className={styles.step}>
              <div className={styles.stepLabel}>点评结果整理中</div>
              <div className={styles.stepBar} aria-hidden="true" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
