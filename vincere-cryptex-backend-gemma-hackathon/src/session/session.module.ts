import { Global, Module } from '@nestjs/common';

import { AppConfigModule } from '../config/app-config.module';
import { RedisModule } from '../redis/redis.module';
import { SessionService } from './session.service';

@Global()
@Module({
  imports: [AppConfigModule, RedisModule],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
