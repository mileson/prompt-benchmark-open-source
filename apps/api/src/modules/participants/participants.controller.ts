/*
## 核心功能
维护 participants.controller.ts 在 Prompt Benchmark 中的实现职责，支撑 业务 API 模块。

## 输入
来自上游页面、服务、配置、用户动作、测试或构建流程的数据。

## 输出
向调用方提供函数、类型、视图、状态、配置或处理结果。

## 定位
位于 apps/api/src/modules/participants，只承担该目录约定的局部职责。

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
  HttpCode,
  Patch,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';

import { ImportParticipantsDto } from './dto/import-participants.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProductLinkDto } from './dto/update-product-link.dto';
import { ParticipantsService } from './participants.service';

@Controller('activities/:activityId')
export class ParticipantsController {
  constructor(private readonly participantsService: ParticipantsService) {}

  @Post('login')
  @HttpCode(200)
  login(
    @Param('activityId', new ParseUUIDPipe()) activityId: string,
    @Body() dto: LoginDto,
  ) {
    return this.participantsService.login(activityId, dto);
  }

  @Get('me')
  getMe(
    @Param('activityId', new ParseUUIDPipe()) activityId: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.participantsService.getMe(activityId, authorization);
  }

  @Get('me/detail')
  getMyDetail(
    @Param('activityId', new ParseUUIDPipe()) activityId: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.participantsService.getMyDetail(activityId, authorization);
  }

  @Get('me/history')
  getMyHistory(
    @Param('activityId', new ParseUUIDPipe()) activityId: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.participantsService.getMyHistory(activityId, authorization);
  }

  @Post('me/evaluate')
  @HttpCode(202)
  triggerMyEvaluation(
    @Param('activityId', new ParseUUIDPipe()) activityId: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.participantsService.triggerSelfEvaluation(activityId, authorization);
  }

  @Patch('me/product-link')
  updateMyProductLink(
    @Param('activityId', new ParseUUIDPipe()) activityId: string,
    @Headers('authorization') authorization?: string,
    @Body() dto?: UpdateProductLinkDto,
  ) {
    return this.participantsService.updateMyProductLink(activityId, authorization, dto);
  }

  @Post('participants/import')
  importParticipants(
    @Param('activityId', new ParseUUIDPipe()) activityId: string,
    @Body() dto: ImportParticipantsDto,
    @Headers('x-admin-password') adminPassword?: string,
  ) {
    return this.participantsService.importParticipants(activityId, dto, adminPassword);
  }
}
