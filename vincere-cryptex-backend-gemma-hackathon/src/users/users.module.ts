import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { SessionModule } from '../session/session.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule, SessionModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
