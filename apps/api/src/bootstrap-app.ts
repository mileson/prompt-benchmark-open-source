/*
## 核心功能
维护 bootstrap-app.ts 在 Prompt Benchmark 中的实现职责，支撑 项目核心流程。

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
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { AbstractHttpAdapter } from '@nestjs/core/adapters/http-adapter';

import { AppModule } from './app.module';

export async function createConfiguredApp(adapter?: AbstractHttpAdapter): Promise<INestApplication> {
  const app = adapter
    ? await NestFactory.create(AppModule, adapter)
    : await NestFactory.create(AppModule);

  const corsOrigin = process.env.APP_CORS_ORIGIN
    ? process.env.APP_CORS_ORIGIN.split(',').map((item) => item.trim())
    : true;

  app.enableCors({ origin: corsOrigin });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  await app.init();
  return app;
}
