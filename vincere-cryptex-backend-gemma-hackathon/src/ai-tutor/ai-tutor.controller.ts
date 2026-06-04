import { Body, Controller, ForbiddenException, Inject, Post, UseGuards } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
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
  async ask(@CurrentUser() user: AuthenticatedUser, @Body() body: AskAiTutorDto) {
    this.assertActiveStudent(user);
    return this.aiTutorService.ask(body);
  }

  private assertActiveStudent(user: AuthenticatedUser) {
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Active student account required');
    }
  }
}
