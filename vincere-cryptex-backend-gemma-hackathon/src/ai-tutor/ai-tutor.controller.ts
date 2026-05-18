import { Body, Controller, Inject, Post } from '@nestjs/common';

import { AiTutorService } from './ai-tutor.service';
import { AskAiTutorDto } from './dto/ask-ai-tutor.dto';

@Controller('ai-tutor')
export class AiTutorController {
  constructor(
    @Inject(AiTutorService)
    private readonly aiTutorService: AiTutorService,
  ) {}

  @Post('ask')
  async ask(@Body() body: AskAiTutorDto) {
    return this.aiTutorService.ask(body);
  }
}
