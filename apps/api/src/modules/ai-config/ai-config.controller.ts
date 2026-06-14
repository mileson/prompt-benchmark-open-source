/*
## 核心功能
维护 ai-config.controller.ts 在 Prompt Benchmark 中的实现职责，支撑 业务 API 模块。

## 输入
来自上游页面、服务、配置、用户动作、测试或构建流程的数据。

## 输出
向调用方提供函数、类型、视图、状态、配置或处理结果。

## 定位
位于 apps/api/src/modules/ai-config，只承担该目录约定的局部职责。

## 依赖
依赖同目录或相邻模块、项目配置以及运行时框架提供的能力。

## 维护规则
修改逻辑、输入输出、外部依赖或职责边界后，同步更新本文件说明书和所在文件夹 README。
*/
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';

import { AiConfigService } from './ai-config.service';
import { TestActivityAiConfigDto } from './dto/test-activity-ai-config.dto';
import { UpdateActivityAiConfigDto } from './dto/update-activity-ai-config.dto';

@Controller('activities/:activityId/ai-config')
export class AiConfigController {
  constructor(private readonly aiConfigService: AiConfigService) {}

  @Get()
  getConfig(
    @Param('activityId', new ParseUUIDPipe()) activityId: string,
    @Headers('x-admin-password') adminPassword?: string,
  ) {
    return this.aiConfigService.getManageConfig(activityId, adminPassword);
  }

  @Patch()
  updateConfig(
    @Param('activityId', new ParseUUIDPipe()) activityId: string,
    @Body() dto: UpdateActivityAiConfigDto,
    @Headers('x-admin-password') adminPassword?: string,
  ) {
    return this.aiConfigService.updateConfig(activityId, dto, adminPassword);
  }

  @Post('test')
  testConfig(
    @Param('activityId', new ParseUUIDPipe()) activityId: string,
    @Body() dto: TestActivityAiConfigDto,
    @Headers('x-admin-password') adminPassword?: string,
  ) {
    return this.aiConfigService.testConfig(activityId, dto, adminPassword);
  }

  @Post('reveal-key')
  revealKey(
    @Param('activityId', new ParseUUIDPipe()) activityId: string,
    @Headers('x-admin-password') adminPassword?: string,
  ) {
    return this.aiConfigService.revealApiKey(activityId, adminPassword);
  }
}
