import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';

import { AppConfigService } from '../config/app-config.service';
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
  ) {}

  async ask(request: AskAiTutorDto): Promise<AiTutorResponse> {
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
      const answer = await this.tryProvider(provider, prompt);

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
  ): Promise<string | null> {
    if (!provider.isEnabled()) {
      return null;
    }

    const healthy = await provider.isHealthy();

    if (!healthy) {
      this.logProviderFail(provider.name, 'health');
      return null;
    }

    this.logger.log(`[AI_PROVIDER_SELECTED] provider=${provider.name}`);

    try {
      const answer = (await provider.generateText(prompt)).trim();

      if (!answer) {
        this.logProviderFail(provider.name, 'empty');
        return null;
      }

      if (this.safetyGuard.containsUnsafeContent(answer)) {
        this.logProviderFail(provider.name, 'post-check');
        return null;
      }

      this.logProviderOk(provider.name);
      return answer;
    } catch (error) {
      this.logProviderFail(
        provider.name,
        'generate',
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
    this.logger.warn('[AI_SAFE_FALLBACK]');

    return this.safeMockProvider.generate({
      request,
      language,
      safetyLevel: safety.safetyLevel,
      lessonContext,
    });
  }

  private logProviderOk(providerName: AiTutorProviderName): void {
    if (providerName === 'ollama') {
      this.logger.log('[OLLAMA_PROVIDER_OK]');
      return;
    }

    this.logger.log('[GEMINI_PROVIDER_OK]');
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

  private logProviderFail(
    providerName: AiTutorProviderName,
    stage: string,
    reason?: string,
  ): void {
    if (providerName === 'ollama') {
      const reasonLog = reason ? ` reason=${reason}` : '';
      this.logger.warn(`[OLLAMA_PROVIDER_FAIL] stage=${stage}${reasonLog}`);
      return;
    }

    this.logger.warn(`[GEMINI_PROVIDER_FAIL] stage=${stage}`);
  }
}
