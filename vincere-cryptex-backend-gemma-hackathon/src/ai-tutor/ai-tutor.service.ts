import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';

import { AppConfigService } from '../config/app-config.service';
import {
  AdmitAiTutorProviderExecution,
  AiTutorUsageService,
} from './ai-tutor-usage.service';
import { AskAiTutorDto } from './dto/ask-ai-tutor.dto';
import { AiSafetyGuard } from './guards/ai-safety.guard';
import { GeminiProvider } from './providers/gemini.provider';
import { OllamaProvider } from './providers/ollama.provider';
import { SafeMockProvider } from './providers/safe-mock.provider';
import {
  AiTutorProviderError,
  AiTutorProviderName,
  AiTutorResponse,
  AiTutorTextProvider,
  LessonTutorContext,
  SafetyAssessment,
  responseTypeForMode,
} from './ai-tutor.types';

type NormalizedAskAiTutorDto = AskAiTutorDto & {
  lessonContent: string;
  userQuestion: string;
};

@Injectable()
export class AiTutorService {
  private readonly logger = new Logger(AiTutorService.name);

  constructor(
    @Inject(AppConfigService)
    private readonly configService: AppConfigService,
    @Inject(AiSafetyGuard)
    private readonly safetyGuard: AiSafetyGuard,
    @Inject(OllamaProvider)
    private readonly ollamaProvider: OllamaProvider,
    @Inject(GeminiProvider)
    private readonly geminiProvider: GeminiProvider,
    @Inject(SafeMockProvider)
    private readonly safeMockProvider: SafeMockProvider,
    @Inject(AiTutorUsageService)
    private readonly usageService: AiTutorUsageService,
  ) {}

  async ask(request: AskAiTutorDto, userId: string): Promise<AiTutorResponse> {
    return this.usageService.withConcurrencyProtection(
      userId,
      async (admitProviderExecution) => {
        const normalizedRequest = this.normalizeRequest(request);
        const language = this.safetyGuard.detectLanguage(normalizedRequest.userQuestion);
        const safety = this.safetyGuard.assess(normalizedRequest);
        const lessonContext = this.safetyGuard.buildLessonContext(normalizedRequest);

        if (safety.blocked) {
          return this.safetyGuard.buildRefusal(language);
        }

        const prompt = this.safetyGuard.buildTutorPrompt(
          normalizedRequest,
          language,
          lessonContext,
        );

        for (const provider of this.resolveProviders()) {
          const answer = await this.tryProvider(
            provider,
            prompt,
            userId,
            admitProviderExecution,
          );

          if (answer !== null) {
            return {
              type: responseTypeForMode(request.mode),
              answer,
              blocked: false,
              safetyLevel: this.safetyGuard.publicSafetyLevel(safety.safetyLevel),
            };
          }
        }

        return this.buildSafeFallback(normalizedRequest, safety, language, lessonContext);
      },
    );
  }

  private normalizeRequest(request: AskAiTutorDto): NormalizedAskAiTutorDto {
    const question = request.question ?? request.userQuestion ?? request.message ?? '';
    const trimmedQuestion = question.trim();

    if (!trimmedQuestion) {
      throw new BadRequestException(
        'Please enter a question so the AI Tutor can help with this lesson.',
      );
    }

    return {
      ...request,
      lessonContent: request.lessonContent ?? '',
      userQuestion: trimmedQuestion,
    };
  }

  private resolveProviders(): AiTutorTextProvider[] {
    const priority = this.configService.aiProviderPriority.trim().toLowerCase();

    if (priority === 'local-first') {
      return [this.ollamaProvider, this.geminiProvider];
    }

    return [this.ollamaProvider, this.geminiProvider];
  }

  private async tryProvider(
    provider: AiTutorTextProvider,
    prompt: string,
    userId: string,
    admitProviderExecution: AdmitAiTutorProviderExecution,
  ): Promise<string | null> {
    if (!provider.isEnabled()) {
      return null;
    }

    const startedAt = Date.now();
    const healthy = await provider.isHealthy();

    if (!healthy) {
      this.logProviderFailure(provider.name, userId, 'health', startedAt);
      return null;
    }

    await admitProviderExecution();
    this.logger.log(
      JSON.stringify({
        event: 'ai_tutor.provider.selected',
        timestamp: new Date().toISOString(),
        userId,
        provider: provider.name,
      }),
    );

    try {
      const answer = (await provider.generateText(prompt)).trim();

      if (!answer) {
        this.logProviderFailure(provider.name, userId, 'empty', startedAt);
        return null;
      }

      if (this.safetyGuard.containsUnsafeContent(answer)) {
        this.logProviderFailure(provider.name, userId, 'post-check', startedAt);
        return null;
      }

      this.logProviderSuccess(provider.name, userId, startedAt);
      return answer;
    } catch (error) {
      this.logProviderFailure(
        provider.name,
        userId,
        'generate',
        startedAt,
        this.normalizeProviderFailReason(error),
      );
      return null;
    }
  }

  private buildSafeFallback(
    request: AskAiTutorDto,
    safety: SafetyAssessment,
    language: 'en' | 'ar',
    lessonContext: LessonTutorContext,
  ): AiTutorResponse {
    this.logger.warn(
      JSON.stringify({
        event: 'ai_tutor.safe_fallback',
        timestamp: new Date().toISOString(),
      }),
    );

    return this.safeMockProvider.generate({
      request,
      language,
      safetyLevel: safety.safetyLevel,
      lessonContext,
    });
  }

  private logProviderSuccess(
    provider: AiTutorProviderName,
    userId: string,
    startedAt: number,
  ): void {
    this.logger.log(
      JSON.stringify({
        event: 'ai_tutor.provider.success',
        timestamp: new Date().toISOString(),
        userId,
        provider,
        durationMs: Date.now() - startedAt,
      }),
    );
  }

  private normalizeProviderFailReason(error: unknown): string {
    if (!(error instanceof AiTutorProviderError)) {
      return 'bad_response';
    }

    if (
      error.reason === 'timeout' ||
      error.reason === 'connection' ||
      error.reason === 'bad_response'
    ) {
      return error.reason;
    }

    return 'bad_response';
  }

  private logProviderFailure(
    provider: AiTutorProviderName,
    userId: string,
    stage: string,
    startedAt: number,
    reason?: string,
  ): void {
    this.logger.warn(
      JSON.stringify({
        event: 'ai_tutor.provider.failure',
        timestamp: new Date().toISOString(),
        userId,
        provider,
        stage,
        reason,
        durationMs: Date.now() - startedAt,
      }),
    );
  }
}
