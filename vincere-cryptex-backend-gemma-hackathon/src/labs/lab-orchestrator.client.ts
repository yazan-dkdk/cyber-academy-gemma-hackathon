import { Injectable, Logger } from '@nestjs/common';

import { AppConfigService } from '../config/app-config.service';

type LabOrchestratorOperation = 'spawn' | 'reset' | 'terminate';
const LAB_ORCHESTRATOR_API_KEY_HEADER = 'x-internal-api-key';

export interface LabInstancePayload {
  id: string;
  labId: string;
  proxyToken: string;
  status: string;
  startedAt: Date;
  expiresAt: Date;
  containerId?: string | null;
  networkId?: string | null;
  resetCount: number;
}

export interface LabPayload {
  id: string;
  title: string;
  category: string;
  difficulty: string;
  type: string;
  imageReference?: string | null;
  templateReference?: string | null;
  ttlMinutes: number;
}

export interface SpawnOrResetPayload {
  userId: string;
  lab: LabPayload;
  instance: LabInstancePayload;
}

export interface TerminatePayload {
  userId: string;
  instance: {
    id: string;
    labId: string;
    containerId?: string | null;
    networkId?: string | null;
    proxyToken: string;
    status: string;
  };
}

export interface OrchestratorInstanceResponse {
  containerId?: string | null;
  networkId?: string | null;
  status?: 'STARTING' | 'ACTIVE';
  expiresAt?: string | null;
}

export class LabOrchestratorError extends Error {
  constructor(
    message: string,
    readonly operation: LabOrchestratorOperation,
    readonly retryable: boolean,
    readonly statusCode?: number,
    readonly code?: string,
    readonly responseBody?: string,
  ) {
    super(message);
    this.name = 'LabOrchestratorError';
  }
}

export abstract class LabOrchestratorClient {
  abstract spawn(payload: SpawnOrResetPayload): Promise<OrchestratorInstanceResponse>;
  abstract reset(payload: SpawnOrResetPayload): Promise<OrchestratorInstanceResponse>;
  abstract terminate(payload: TerminatePayload): Promise<void>;
}

@Injectable()
export class HttpLabOrchestratorClient extends LabOrchestratorClient {
  private static readonly TRANSIENT_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
  private readonly logger = new Logger(HttpLabOrchestratorClient.name);

  constructor(private readonly configService: AppConfigService) {
    super();
  }

  async spawn(payload: SpawnOrResetPayload) {
    return this.sendRequest<OrchestratorInstanceResponse>('spawn', payload);
  }

  async reset(payload: SpawnOrResetPayload) {
    return this.sendRequest<OrchestratorInstanceResponse>('reset', payload);
  }

  async terminate(payload: TerminatePayload) {
    await this.sendRequest('terminate', payload);
  }

  private async sendRequest<T>(path: LabOrchestratorOperation, payload: unknown): Promise<T> {
    try {
      const response = await fetch(`${this.configService.labOrchestratorBaseUrl}/${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [LAB_ORCHESTRATOR_API_KEY_HEADER]: this.configService.labOrchestratorApiKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.configService.labOrchestratorTimeoutMs),
      });

      if (!response.ok) {
        const body = await this.safeReadBody(response);
        throw this.createHttpError(path, response.status, body);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      throw this.normalizeError(path, error);
    }
  }

  private async safeReadBody(response: Response) {
    try {
      return await response.text();
    } catch {
      return '';
    }
  }

  private createHttpError(
    operation: LabOrchestratorOperation,
    statusCode: number,
    body: string,
  ) {
    const retryable = HttpLabOrchestratorClient.TRANSIENT_STATUS_CODES.has(statusCode);
    this.logger.error(
      JSON.stringify({
        event: 'labs.orchestrator_http_error',
        operation,
        statusCode,
        retryable,
      }),
    );
    // Keep thrown error messages free of raw orchestrator response bodies so
    // upstream 500 logging cannot leak internal infrastructure details.
    const message = `Lab orchestrator ${operation} failed with status ${statusCode}`;

    return new LabOrchestratorError(
      message,
      operation,
      retryable,
      statusCode,
      undefined,
      body || undefined,
    );
  }

  private normalizeError(operation: LabOrchestratorOperation, error: unknown) {
    if (error instanceof LabOrchestratorError) {
      return error;
    }

    if (error instanceof Error) {
      const code =
        'code' in error && typeof error.code === 'string' ? error.code : undefined;
      const timeoutLike =
        error.name === 'AbortError' ||
        code === 'UND_ERR_CONNECT_TIMEOUT' ||
        code === 'UND_ERR_HEADERS_TIMEOUT' ||
        code === 'ETIMEDOUT';
      const transientNetworkLike =
        timeoutLike ||
        code === 'ECONNRESET' ||
        code === 'ECONNREFUSED' ||
        code === 'EAI_AGAIN' ||
        error.name === 'TypeError';

      this.logger.error(
        JSON.stringify({
          event: 'labs.orchestrator_request_failed',
          operation,
          errorName: error.name,
          code,
          retryable: transientNetworkLike,
        }),
      );

      return new LabOrchestratorError(
        `Lab orchestrator ${operation} request failed: ${error.message}`,
        operation,
        transientNetworkLike,
        undefined,
        code,
      );
    }

    this.logger.error(
      JSON.stringify({
        event: 'labs.orchestrator_request_failed',
        operation,
        errorName: 'UnknownError',
        retryable: false,
      }),
    );

    return new LabOrchestratorError(
      `Lab orchestrator ${operation} request failed`,
      operation,
      false,
    );
  }
}
