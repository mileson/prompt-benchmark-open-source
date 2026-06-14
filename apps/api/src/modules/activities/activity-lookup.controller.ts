/*
## 核心功能
维护 activity-lookup.controller.ts 在 Prompt Benchmark 中的实现职责，支撑 业务 API 模块。

## 输入
来自上游页面、服务、配置、用户动作、测试或构建流程的数据。

## 输出
向调用方提供函数、类型、视图、状态、配置或处理结果。

## 定位
位于 apps/api/src/modules/activities，只承担该目录约定的局部职责。

## 依赖
依赖同目录或相邻模块、项目配置以及运行时框架提供的能力。

## 维护规则
修改逻辑、输入输出、外部依赖或职责边界后，同步更新本文件说明书和所在文件夹 README。
*/
import { Body, Controller, Get, Headers, HttpCode, Param, Post } from '@nestjs/common';

import { ActivitiesService } from './activities.service';
import { CreateActivityDto } from './dto/create-activity.dto';

@Controller('activities')
export class ActivityLookupController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get()
  listActivities() {
    return this.activitiesService.listActivities();
  }

  @Post()
  @HttpCode(201)
  createActivity(
    @Body() dto: CreateActivityDto,
    @Headers('x-admin-password') adminPassword?: string,
  ) {
    return this.activitiesService.createActivity(dto, adminPassword);
  }

  @Get('slug/:slug')
  async getBySlug(@Param('slug') slug: string) {
    const activity = await this.activitiesService.getBySlugOrThrow(slug);

    return {
      id: activity.id,
      slug: activity.slug,
      title: activity.title,
      status: activity.status,
      directEntryUrl: activity.direct_entry_url,
      autoEvaluateEnabled: activity.auto_evaluate_enabled,
      rankingVisible: activity.ranking_visible,
      pollingIntervalMs: activity.polling_interval_ms,
      themeMode: activity.theme_mode,
      participationMode: this.activitiesService.getParticipationMode(activity),
      rubricVersion: activity.rubric_version,
    };
  }
}
