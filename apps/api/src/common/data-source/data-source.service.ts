import { Injectable, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  type PromptBenchmarkSchemaCapabilities,
  SupabaseService,
} from '../supabase/supabase.service';

export type { PromptBenchmarkSchemaCapabilities };

export type BackendDataSourceProvider = 'supabase' | 'custom_api';

@Injectable()
export class BackendDataSourceService {
  constructor(
    private readonly configService: ConfigService,
    private readonly supabaseService: SupabaseService,
  ) {}

  get provider(): BackendDataSourceProvider {
    return (this.configService.get<string>('DATA_SOURCE_PROVIDER') ?? 'supabase') as BackendDataSourceProvider;
  }

  get client() {
    if (this.provider === 'supabase') {
      return this.supabaseService.client;
    }

    throw new NotImplementedException(
      'DATA_SOURCE_PROVIDER=custom_api is reserved for open-source adapters. Implement the data source contract in apps/api/src/common/data-source before enabling it.',
    );
  }

  async getPromptBenchmarkSchemaCapabilities(): Promise<PromptBenchmarkSchemaCapabilities> {
    if (this.provider === 'supabase') {
      return this.supabaseService.getPromptBenchmarkSchemaCapabilities();
    }

    throw new NotImplementedException(
      'Custom API data source adapters must expose schema capability metadata before business modules can use them.',
    );
  }
}
