import { AiTutorMode, AskAiTutorDto } from './dto/ask-ai-tutor.dto';

export type AiTutorResponseType = 'explanation' | 'hint' | 'refusal' | 'next_step';
export type AiTutorSafetyLevel = 'safe' | 'caution' | 'blocked';
export type AiTutorLanguage = 'en' | 'ar';
export type AiTutorProviderName = 'ollama' | 'gemini';

export interface AiTutorResponse {
  type: AiTutorResponseType;
  answer: string;
  blocked: boolean;
  safetyLevel: AiTutorSafetyLevel;
}

export interface SafetyAssessment {
  blocked: boolean;
  safetyLevel: AiTutorSafetyLevel;
  educationalHintOverride?: boolean;
}

export interface LessonTutorContext {
  courseTitle: string;
  lessonTitle: string;
  lessonType: string;
  lessonExcerpt: string;
  currentProgressPercent: number | null;
}

export interface AiTutorTextProvider {
  readonly name: AiTutorProviderName;
  isEnabled(): boolean;
  isHealthy(): Promise<boolean>;
  generateText(prompt: string): Promise<string>;
}

export class AiTutorProviderError extends Error {
  constructor(
    readonly provider: AiTutorProviderName,
    readonly reason: string,
  ) {
    super(`${provider} provider failed`);
  }
}

export const responseTypeForMode = (
  mode: AiTutorMode | undefined,
): AiTutorResponseType => {
  if (mode === AiTutorMode.HINT) {
    return 'hint';
  }

  if (mode === AiTutorMode.NEXT_STEP) {
    return 'next_step';
  }

  return 'explanation';
};

export interface SafeFallbackInput {
  request: AskAiTutorDto;
  language: AiTutorLanguage;
  safetyLevel: AiTutorSafetyLevel;
  lessonContext: LessonTutorContext;
}
