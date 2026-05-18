import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RateLimitPreset, RateLimitPresetDecorator } from '../common/decorators/rate-limit.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { OpaqueIdParamPipe } from '../common/pipes/opaque-id-param.pipe';
import { ChallengesService } from './challenges.service';
import { ListChallengesQueryDto } from './dto/list-challenges-query.dto';
import { SubmitFlagDto } from './dto/submit-flag.dto';

@Controller('student/challenges')
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles(UserRole.STUDENT)
export class StudentChallengesController {
  constructor(
    @Inject(ChallengesService)
    private readonly challengesService: ChallengesService,
  ) {}

  @Get()
  async listStudentChallenges(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListChallengesQueryDto,
  ) {
    this.assertActiveStudent(user);
    return this.challengesService.listPublishedChallenges(user.id, query);
  }

  @Get(':challengeId')
  async getStudentChallenge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('challengeId', new OpaqueIdParamPipe()) challengeId: string,
  ) {
    this.assertActiveStudent(user);
    return this.challengesService.getChallengeDetails(user.id, challengeId);
  }

  @Post(':challengeId/submit')
  @UseGuards(RateLimitGuard)
  @RateLimitPresetDecorator(RateLimitPreset.FLAG_SUBMISSION)
  async submitStudentChallenge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('challengeId', new OpaqueIdParamPipe()) challengeId: string,
    @Body() body: SubmitFlagDto,
  ) {
    this.assertActiveStudent(user);
    return this.challengesService.submitFlag(user.id, challengeId, body.flag);
  }

  private assertActiveStudent(user: AuthenticatedUser) {
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Active student account required');
    }
  }
}
