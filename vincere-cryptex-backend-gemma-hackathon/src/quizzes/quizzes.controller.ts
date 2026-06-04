import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { SubmitQuizAttemptDto } from './dto/submit-quiz-attempt.dto';
import { QuizzesService } from './quizzes.service';

@Controller()
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles(UserRole.STUDENT)
export class QuizzesController {
  constructor(
    @Inject(QuizzesService)
    private readonly quizzesService: QuizzesService,
  ) {}

  @Get('quizzes/:quizId')
  async getQuizForStudent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('quizId', new ParseUUIDPipe()) quizId: string,
  ) {
    return this.quizzesService.getQuizForStudent(user.id, quizId);
  }

  @Post('quizzes/:quizId/attempts/start')
  async startAttempt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('quizId', new ParseUUIDPipe()) quizId: string,
  ) {
    return this.quizzesService.startAttempt(user.id, quizId);
  }

  @Post('quiz-attempts/:attemptId/submit')
  async submitAttempt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
    @Body() body: SubmitQuizAttemptDto,
  ) {
    return this.quizzesService.submitAttempt(user.id, attemptId, body.answers);
  }

  @Get('quiz-attempts/:attemptId/result')
  async getSubmittedAttemptResult(
    @CurrentUser() user: AuthenticatedUser,
    @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
  ) {
    return this.quizzesService.getSubmittedAttemptResult(user.id, attemptId);
  }
}
