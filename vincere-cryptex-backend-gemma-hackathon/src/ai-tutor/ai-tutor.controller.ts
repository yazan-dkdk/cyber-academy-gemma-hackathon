import { Body, Controller, ForbiddenException, Inject, Post, UseGuards } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  RateLimitPreset,
  RateLimitPresetDecorator,
} from '../common/decorators/rate-limit.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { AiTutorService } from './ai-tutor.service';
import { AskAiTutorDto } from './dto/ask-ai-tutor.dto';

@Controller('ai-tutor')
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles(UserRole.STUDENT)
export class AiTutorController {
  constructor(
    @Inject(AiTutorService)
    private readonly aiTutorService: AiTutorService,
  ) {}

  @Post('ask')
  @UseGuards(RateLimitGuard)
  @RateLimitPresetDecorator(RateLimitPreset.AI_TUTOR_ASK)
  async ask(@CurrentUser() user: AuthenticatedUser, @Body() body: AskAiTutorDto) {
    this.assertActiveStudent(user);
    return this.aiTutorService.ask(body, user.id);
  }

  private assertActiveStudent(user: AuthenticatedUser) {
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Active student account required');
    }
  }
}
