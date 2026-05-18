import { Inject, Injectable } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service';
import {
  AiTutorProviderError,
  AiTutorTextProvider,
} from '../ai-tutor.types';

interface OllamaGenerateResponse {
  response?: unknown;
}

const OLLAMA_HEALTH_TIMEOUT_MS = 1000;
const HEALTH_CACHE_TTL_MS = 30000;

@Injectable()
export class OllamaProvider implements AiTutorTextProvider {
  readonly name = 'ollama' as const;

  private lastHealthCheckAt = 0;
  private lastHealthOk = false;

  constructor(
    @Inject(AppConfigService)
    private readonly configService: AppConfigService,
  ) {}

  isEnabled(): boolean {
    return this.configService.ollamaEnabled;
  }

  async isHealthy(): Promise<boolean> {
    if (!this.isEnabled()) {
      return false;
    }

    const now = Date.now();
    if (now - this.lastHealthCheckAt < HEALTH_CACHE_TTL_MS) {
      return this.lastHealthOk;
    }

    try {
      const response = await this.fetchWithTimeout(
        this.buildUrl('/api/tags'),
        {
          method: 'GET',
        },
        OLLAMA_HEALTH_TIMEOUT_MS,
      );

      this.lastHealthOk = response.ok;
      return this.lastHealthOk;
    } catch {
      this.lastHealthOk = false;
      return false;
    } finally {
      this.lastHealthCheckAt = now;
    }
  }

  async generateText(prompt: string): Promise<string> {
    const model = this.configService.ollamaModel.trim();

    if (!this.isEnabled()) {
      throw new AiTutorProviderError(this.name, 'disabled');
    }

    if (!model) {
      throw new AiTutorProviderError(this.name, 'bad_response');
    }

    const response = await this.fetchWithTimeout(
      this.buildUrl('/api/generate'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
        }),
      },
      this.configService.ollamaTimeoutMs,
    );

    const responseBody = await response.text();

    if (!response.ok) {
      throw new AiTutorProviderError(this.name, 'bad_response');
    }

    let data: OllamaGenerateResponse;

    try {
      data = JSON.parse(responseBody) as OllamaGenerateResponse;
    } catch {
      throw new AiTutorProviderError(this.name, 'bad_response');
    }

    if (typeof data.response !== 'string') {
      throw new AiTutorProviderError(this.name, 'bad_response');
    }

    return data.response;
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AiTutorProviderError(this.name, 'timeout');
      }

      throw new AiTutorProviderError(this.name, 'connection');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private buildUrl(path: string): string {
    const baseUrl = this.configService.ollamaBaseUrl.trim().replace(/\/+$/, '');
    return `${baseUrl}${path}`;
  }
}
