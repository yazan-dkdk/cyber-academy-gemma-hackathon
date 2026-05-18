import { Global, Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AppConfigModule } from '../config/app-config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { SessionModule } from '../session/session.module';
import { AuthStateService } from './auth-state.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailService } from './email.service';
import { MfaAttemptService } from './mfa-attempt.service';

@Global()
@Module({
  imports: [AppConfigModule, PrismaModule, RedisModule, SessionModule, AuditModule],
  controllers: [AuthController],
  providers: [AuthService, AuthStateService, EmailService, MfaAttemptService],
  exports: [AuthService, AuthStateService],
})
export class AuthModule {}
