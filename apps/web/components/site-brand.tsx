/*
## 核心功能
维护 site-brand.tsx 在 Prompt Benchmark 中的实现职责，支撑 组件化界面或服务。

## 输入
来自上游页面、服务、配置、用户动作、测试或构建流程的数据。

## 输出
向调用方提供函数、类型、视图、状态、配置或处理结果。

## 定位
位于 apps/web/components，只承担该目录约定的局部职责。

## 依赖
依赖同目录或相邻模块、项目配置以及运行时框架提供的能力。

## 维护规则
修改逻辑、输入输出、外部依赖或职责边界后，同步更新本文件说明书和所在文件夹 README。
*/
import Image from 'next/image';

import styles from './site-brand.module.css';

export function SiteBrand() {
  return (
    <div className={styles.brand}>
      <Image
        src="/activity-logo.png"
        alt="本次活动标识"
        width={150}
        height={44}
        className={styles.logo}
        priority
      />
    </div>
  );
}
