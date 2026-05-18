import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ChallengeSubmissionQuery } from '../database/raw-queries/challenge-submission.query';
import { SessionModule } from '../session/session.module';
import { ChallengesController } from './challenges.controller';
import { ChallengesService } from './challenges.service';
import { StudentChallengesController } from './student-challenges.controller';

@Module({
  imports: [AuthModule, SessionModule],
  controllers: [ChallengesController, StudentChallengesController],
  providers: [ChallengesService, ChallengeSubmissionQuery],
})
export class ChallengesModule {}
