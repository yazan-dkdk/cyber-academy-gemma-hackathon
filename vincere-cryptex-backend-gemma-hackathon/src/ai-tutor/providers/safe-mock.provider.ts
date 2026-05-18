import { Inject, Injectable } from '@nestjs/common';

import { AiSafetyGuard } from '../guards/ai-safety.guard';
import {
  AiTutorResponse,
  SafeFallbackInput,
} from '../ai-tutor.types';

@Injectable()
export class SafeMockProvider {
  constructor(
    @Inject(AiSafetyGuard)
    private readonly safetyGuard: AiSafetyGuard,
  ) {}

  generate(input: SafeFallbackInput): AiTutorResponse {
    return this.safetyGuard.buildSafeFallback(
      input.request,
      input.language,
      input.safetyLevel,
      input.lessonContext,
    );
  }
}
