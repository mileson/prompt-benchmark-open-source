/*
## 核心功能
维护 dashboard.controller.ts 在 Prompt Benchmark 中的实现职责，支撑 业务 API 模块。

## 输入
来自上游页面、服务、配置、用户动作、测试或构建流程的数据。

## 输出
向调用方提供函数、类型、视图、状态、配置或处理结果。

## 定位
位于 apps/api/src/modules/dashboard，只承担该目录约定的局部职责。

## 依赖
依赖同目录或相邻模块、项目配置以及运行时框架提供的能力。

## 维护规则
修改逻辑、输入输出、外部依赖或职责边界后，同步更新本文件说明书和所在文件夹 README。
*/
import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';

import { DashboardService } from './dashboard.service';

@Controller('activities/:activityId')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('dashboard')
  getDashboard(@Param('activityId', new ParseUUIDPipe()) activityId: string) {
    return this.dashboardService.getDashboard(activityId);
  }

  @Get('participants/:participantId/detail')
  getParticipantDetail(
    @Param('activityId', new ParseUUIDPipe()) activityId: string,
    @Param('participantId', new ParseUUIDPipe()) participantId: string,
  ) {
    return this.dashboardService.getParticipantDetail(activityId, participantId);
  }
}
