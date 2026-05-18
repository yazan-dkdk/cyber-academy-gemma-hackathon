import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ActivityModule } from './activity/activity.module';
import { AiTutorModule } from './ai-tutor/ai-tutor.module';
import { AuditModule } from './audit/audit.module';
import { ChallengesModule } from './challenges/challenges.module';
import { AppConfigModule } from './config/app-config.module';
import { validateEnvironment } from './config/environment';
import { CoursesModule } from './courses/courses.module';
import { LabsModule } from './labs/labs.module';
import { PrismaModule } from './prisma/prisma.module';
import { QuizzesModule } from './quizzes/quizzes.module';
import { SessionModule } from './session/session.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
    AppConfigModule,
    PrismaModule,
    SessionModule,
    AuditModule,
    ActivityModule,
    AiTutorModule,
    AuthModule,
    UsersModule,
    CoursesModule,
    QuizzesModule,
    ChallengesModule,
    LabsModule,
  ],
})
export class AppModule {}
