import { Global, Module } from '@nestjs/common';

import { SupabaseModule } from '../supabase/supabase.module';
import { BackendDataSourceService } from './data-source.service';

@Global()
@Module({
  imports: [SupabaseModule],
  providers: [BackendDataSourceService],
  exports: [BackendDataSourceService],
})
export class DataSourceModule {}
