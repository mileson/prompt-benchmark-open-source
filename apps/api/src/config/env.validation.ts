/*
## 核心功能
维护 env.validation.ts 在 Prompt Benchmark 中的实现职责，支撑 项目核心流程。

## 输入
来自上游页面、服务、配置、用户动作、测试或构建流程的数据。

## 输出
向调用方提供函数、类型、视图、状态、配置或处理结果。

## 定位
位于 apps/api/src/config，只承担该目录约定的局部职责。

## 依赖
依赖同目录或相邻模块、项目配置以及运行时框架提供的能力。

## 维护规则
修改逻辑、输入输出、外部依赖或职责边界后，同步更新本文件说明书和所在文件夹 README。
*/
import * as Joi from 'joi';

import {
  DEFAULT_AI_BASE_URL,
  DEFAULT_AI_MODEL,
} from '../common/constants/domain.constants';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().port().default(3001),
  APP_CORS_ORIGIN: Joi.string().optional().allow(''),
  DATA_SOURCE_PROVIDER: Joi.string().valid('supabase', 'custom_api').default('supabase'),
  SUPABASE_URL: Joi.when('DATA_SOURCE_PROVIDER', {
    is: 'supabase',
    then: Joi.string().uri().required(),
    otherwise: Joi.string().uri().optional().allow(''),
  }),
  SUPABASE_SERVICE_ROLE_KEY: Joi.when('DATA_SOURCE_PROVIDER', {
    is: 'supabase',
    then: Joi.string().min(20).required(),
    otherwise: Joi.string().optional().allow(''),
  }),
  SUPABASE_ANON_KEY: Joi.string().optional().allow(''),
  SUPABASE_DATABASE_URL: Joi.string().optional().allow(''),
  CUSTOM_DATA_API_BASE_URL: Joi.when('DATA_SOURCE_PROVIDER', {
    is: 'custom_api',
    then: Joi.string().uri().required(),
    otherwise: Joi.string().uri().optional().allow(''),
  }),
  CUSTOM_DATA_API_TOKEN: Joi.string().optional().allow(''),
  AI_API_KEY: Joi.string().min(20).optional().allow(''),
  AI_BASE_URL: Joi.string().uri().default(DEFAULT_AI_BASE_URL),
  AI_MODEL: Joi.string().default(DEFAULT_AI_MODEL),
  STANDARD_AI_API_KEY: Joi.string().min(20).optional().allow(''),
  STANDARD_AI_BASE_URL: Joi.string().uri().default(DEFAULT_AI_BASE_URL),
  STANDARD_AI_MODEL: Joi.string().default(DEFAULT_AI_MODEL),
  AI_CONFIG_ENCRYPTION_SECRET: Joi.string().min(16).optional().allow(''),
  ADMIN_PASSWORD: Joi.string().min(4).optional().allow(''),
  SILICONFLOW_API_KEY: Joi.string().min(20).optional().allow(''),
  SILICONFLOW_BASE_URL: Joi.string().uri().default(DEFAULT_AI_BASE_URL),
  SILICONFLOW_MODEL: Joi.string().default(DEFAULT_AI_MODEL),
});
