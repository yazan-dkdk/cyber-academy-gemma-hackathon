import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RateLimitPreset, RateLimitPresetDecorator } from '../common/decorators/rate-limit.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { ListLabsQueryDto } from './dto/list-labs-query.dto';
import { ValidateProxyAccessDto } from './dto/validate-proxy-access.dto';
import { LabsService } from './labs.service';

@Controller('labs')
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles(UserRole.STUDENT)
export class LabsController {
  constructor(private readonly labsService: LabsService) {}

  @Get()
  async listPublishedLabs(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListLabsQueryDto,
  ) {
    return this.labsService.listPublishedLabs(user.id, query);
  }

  @Get(':labId')
  async getPublishedLabById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('labId', new ParseUUIDPipe()) labId: string,
  ) {
    return this.labsService.getPublishedLabById(user.id, labId);
  }

  @Get(':labId/instance')
  async getCurrentLabInstance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('labId', new ParseUUIDPipe()) labId: string,
  ) {
    return this.labsService.getCurrentLabInstance(user.id, labId);
  }

  @Post(':labId/start')
  @UseGuards(RateLimitGuard)
  @RateLimitPresetDecorator(RateLimitPreset.LAB_START)
  async startLab(
    @CurrentUser() user: AuthenticatedUser,
    @Param('labId', new ParseUUIDPipe()) labId: string,
  ) {
    return this.labsService.startLab(user.id, labId);
  }

  @Post(':labId/reset')
  @UseGuards(RateLimitGuard)
  @RateLimitPresetDecorator(RateLimitPreset.LAB_RESET)
  async resetLab(
    @CurrentUser() user: AuthenticatedUser,
    @Param('labId', new ParseUUIDPipe()) labId: string,
  ) {
    return this.labsService.resetLab(user.id, labId);
  }

  @Post(':labId/terminate')
  @UseGuards(RateLimitGuard)
  @RateLimitPresetDecorator(RateLimitPreset.LAB_TERMINATE)
  async terminateLab(
    @CurrentUser() user: AuthenticatedUser,
    @Param('labId', new ParseUUIDPipe()) labId: string,
  ) {
    return this.labsService.terminateLab(user.id, labId);
  }

  @Post('proxy-access/validate')
  async validateProxyAccess(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: ValidateProxyAccessDto,
  ) {
    return this.labsService.validateProxyAccess(user.id, body.proxyToken);
  }
}
