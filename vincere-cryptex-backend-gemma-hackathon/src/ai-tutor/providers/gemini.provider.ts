import { Inject, Injectable } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service';
import {
  AiTutorProviderError,
  AiTutorTextProvider,
} from '../ai-tutor.types';

const GEMINI_GENERATE_CONTENT_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_REQUEST_TIMEOUT_MS = 30000;

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: unknown;
      }>;
    };
  }>;
}

@Injectable()
export class GeminiProvider implements AiTutorTextProvider {
  readonly name = 'gemini' as const;

  constructor(
    @Inject(AppConfigService)
    private readonly configService: AppConfigService,
  ) {}

  isEnabled(): boolean {
    return this.configService.geminiEnabled;
  }

  async isHealthy(): Promise<boolean> {
    return (
      this.isEnabled() &&
      this.configService.gemmaApiKey.trim() !== '' &&
      this.configService.gemmaModel.trim() !== ''
    );
  }

  async generateText(prompt: string): Promise<string> {
    const apiKey = this.configService.gemmaApiKey.trim();
    const model = this.configService.gemmaModel.trim();

    if (!this.isEnabled()) {
      throw new AiTutorProviderError(this.name, 'disabled');
    }

    if (!apiKey) {
      throw new AiTutorProviderError(this.name, 'missing key');
    }

    if (!model) {
      throw new AiTutorProviderError(this.name, 'missing model');
    }

    const requestUrlWithoutKey = `${GEMINI_GENERATE_CONTENT_BASE_URL}/${encodeURIComponent(
      model,
    )}:generateContent`;
    const requestUrlWithKey = `${requestUrlWithoutKey}?key=${encodeURIComponent(apiKey)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(requestUrlWithKey, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
        }),
        signal: controller.signal,
      });
      const responseBody = await response.text();

      if (!response.ok) {
        throw new AiTutorProviderError(this.name, 'http error');
      }

      let data: GeminiGenerateContentResponse;

      try {
        data = JSON.parse(responseBody) as GeminiGenerateContentResponse;
      } catch {
        throw new AiTutorProviderError(this.name, 'parsing error');
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (typeof text !== 'string') {
        throw new AiTutorProviderError(this.name, 'missing text');
      }

      return text;
    } catch (error) {
      if (error instanceof AiTutorProviderError) {
        throw error;
      }

      throw new AiTutorProviderError(this.name, 'network failure');
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
