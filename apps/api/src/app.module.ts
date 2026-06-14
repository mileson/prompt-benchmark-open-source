/*
## 核心功能
维护 app.module.ts 在 Prompt Benchmark 中的实现职责，支撑 项目核心流程。

## 输入
来自上游页面、服务、配置、用户动作、测试或构建流程的数据。

## 输出
向调用方提供函数、类型、视图、状态、配置或处理结果。

## 定位
位于 apps/api/src，只承担该目录约定的局部职责。

## 依赖
依赖同目录或相邻模块、项目配置以及运行时框架提供的能力。

## 维护规则
修改逻辑、输入输出、外部依赖或职责边界后，同步更新本文件说明书和所在文件夹 README。
*/
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AdminAccessModule } from './common/admin-access/admin-access.module';
import { envValidationSchema } from './config/env.validation';
import { DataSourceModule } from './common/data-source/data-source.module';
import { ActivitiesModule } from './modules/activities/activities.module';
import { AiConfigModule } from './modules/ai-config/ai-config.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { EvaluationsModule } from './modules/evaluations/evaluations.module';
import { HealthModule } from './modules/health/health.module';
import { ParticipantsModule } from './modules/participants/participants.module';
import { SubmissionsModule } from './modules/submissions/submissions.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    AdminAccessModule,
    DataSourceModule,
    HealthModule,
    ActivitiesModule,
    AiConfigModule,
    ParticipantsModule,
    DashboardModule,
    EvaluationsModule,
    SubmissionsModule,
  ],
})
export class AppModule {}
