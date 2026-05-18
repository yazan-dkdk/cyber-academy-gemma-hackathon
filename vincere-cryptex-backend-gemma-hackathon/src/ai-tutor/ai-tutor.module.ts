import { Module } from '@nestjs/common';

import { AiTutorController } from './ai-tutor.controller';
import { AiTutorService } from './ai-tutor.service';
import { AiSafetyGuard } from './guards/ai-safety.guard';
import { GeminiProvider } from './providers/gemini.provider';
import { OllamaProvider } from './providers/ollama.provider';
import { SafeMockProvider } from './providers/safe-mock.provider';

@Module({
  controllers: [AiTutorController],
  providers: [
    AiTutorService,
    AiSafetyGuard,
    OllamaProvider,
    GeminiProvider,
    SafeMockProvider,
  ],
})
export class AiTutorModule {}
