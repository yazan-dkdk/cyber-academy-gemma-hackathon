import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CoursesModule } from '../courses/courses.module';
import { QuizSubmissionQuery } from '../database/raw-queries/quiz-submission.query';
import { SessionModule } from '../session/session.module';
import { QuizzesController } from './quizzes.controller';
import { QuizzesService } from './quizzes.service';

@Module({
  imports: [AuthModule, CoursesModule, SessionModule],
  controllers: [QuizzesController],
  providers: [QuizzesService, QuizSubmissionQuery],
})
export class QuizzesModule {}
