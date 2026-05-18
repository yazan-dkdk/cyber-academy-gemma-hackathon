import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RateLimitPreset, RateLimitPresetDecorator } from '../common/decorators/rate-limit.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { ListChallengesQueryDto } from './dto/list-challenges-query.dto';
import { SubmitFlagDto } from './dto/submit-flag.dto';
import { ChallengesService } from './challenges.service';

@Controller('challenges')
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles(UserRole.STUDENT)
export class ChallengesController {
  constructor(private readonly challengesService: ChallengesService) {}

  @Get()
  async listPublishedChallenges(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListChallengesQueryDto,
  ) {
    return this.challengesService.listPublishedChallenges(user.id, query);
  }

  @Get(':challengeId')
  async getChallengeDetails(
    @CurrentUser() user: AuthenticatedUser,
    @Param('challengeId', new ParseUUIDPipe()) challengeId: string,
  ) {
    return this.challengesService.getChallengeDetails(user.id, challengeId);
  }

  @Get(':challengeId/download')
  async getChallengeDownload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('challengeId', new ParseUUIDPipe()) challengeId: string,
  ) {
    return this.challengesService.getChallengeDownload(user.id, challengeId);
  }

  @Post(':challengeId/hints/:position/use')
  async useHint(
    @CurrentUser() user: AuthenticatedUser,
    @Param('challengeId', new ParseUUIDPipe()) challengeId: string,
    @Param('position', ParseIntPipe) position: number,
  ) {
    return this.challengesService.useHint(user.id, challengeId, position);
  }

  @Post(':challengeId/flag-submissions')
  @UseGuards(AuthenticatedGuard, RolesGuard, RateLimitGuard)
  @RateLimitPresetDecorator(RateLimitPreset.FLAG_SUBMISSION)
  async submitFlag(
    @CurrentUser() user: AuthenticatedUser,
    @Param('challengeId', new ParseUUIDPipe()) challengeId: string,
    @Body() body: SubmitFlagDto,
  ) {
    return this.challengesService.submitFlag(user.id, challengeId, body.flag);
  }
}
