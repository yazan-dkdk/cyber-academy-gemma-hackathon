import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import nodemailer from 'nodemailer';

import { AppConfigService } from '../config/app-config.service';

type AuthEmailKind = 'email_verification' | 'password_reset';
type EmailProviderName = 'smtp' | 'resend';

interface SendEmailVerificationInput {
  to: string;
  token: string;
  expiresAt: Date;
}

interface SendPasswordResetEmailInput {
  to: string;
  token: string;
  expiresAt: Date;
}

interface AuthEmailInput {
  kind: AuthEmailKind;
  to: string;
  subject: string;
  html: string;
  tokenRoute: string;
  expiresAt: Date;
}

interface EmailDeliveryResult {
  acceptedCount?: number;
  rejectedCount?: number;
  messageId?: string;
  response?: string;
}

interface EmailDeliveryProvider {
  name: EmailProviderName;
  isConfigured: boolean;
  state: Record<string, unknown>;
  send(input: AuthEmailInput): Promise<EmailDeliveryResult>;
}

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private readonly warnedProductionDeliveryIssues = new Set<string>();

  constructor(
    @Inject(AppConfigService)
    private readonly configService: AppConfigService,
  ) {}

  onModuleInit() {
    this.logEmailConfigurationState();
  }

  async sendEmailVerification(input: SendEmailVerificationInput) {
    const verificationUrl = this.buildFrontendTokenUrl('/verify-email', input.token);

    await this.sendAuthEmail({
      kind: 'email_verification',
      to: input.to,
      subject: `Verify your ${this.configService.appName} account`,
      html: this.buildVerificationEmailHtml(verificationUrl),
      tokenRoute: '/verify-email',
      expiresAt: input.expiresAt,
    });
  }

  async sendPasswordResetEmail(input: SendPasswordResetEmailInput) {
    const resetUrl = this.buildFrontendTokenUrl('/reset-password', input.token);

    await this.sendAuthEmail({
      kind: 'password_reset',
      to: input.to,
      subject: `Reset your ${this.configService.appName} password`,
      html: this.buildPasswordResetEmailHtml(resetUrl, input.expiresAt),
      tokenRoute: '/reset-password',
      expiresAt: input.expiresAt,
    });
  }

  private async sendAuthEmail(input: AuthEmailInput) {
    const provider = this.getDeliveryProvider();

    if (!provider.isConfigured) {
      this.logEmailConfigurationState();
      this.logDevelopmentDeliveryFallback(input, provider.name, 'missing_email_provider_config');
      return;
    }

    try {
      const result = await provider.send(input);
      this.logSanitizedSendSuccess(input, provider.name, result);
    } catch (error) {
      this.logSanitizedSendError(input, provider.name, error);
      this.logDevelopmentDeliveryFallback(input, provider.name, 'email_send_failed');
    }
  }

  private getDeliveryProvider(): EmailDeliveryProvider {
    if (this.configService.emailProvider === 'resend') {
      return this.buildResendProvider();
    }

    return this.buildSmtpProvider();
  }

  private buildSmtpProvider(): EmailDeliveryProvider {
    const host = this.configService.mailHost;
    const port = this.configService.mailPort;
    const user = this.configService.mailUser;
    const pass = this.configService.mailPass;
    const secure = port === 465;
    const isConfigured = Boolean(host && port && port > 0 && user && pass);

    return {
      name: 'smtp',
      isConfigured,
      state: {
        host: host || null,
        port,
        secure,
        hasUser: Boolean(user),
        hasPassword: Boolean(pass),
        from: this.configService.mailFrom,
        providerHint: host.includes('mailtrap') ? 'mailtrap' : 'custom',
      },
      send: async (input) => {
        const transporter = nodemailer.createTransport({
          host,
          port: port ?? 587,
          secure,
          auth: {
            user,
            pass,
          },
        });

        const info = await transporter.sendMail({
          from: this.configService.mailFrom,
          to: input.to,
          subject: input.subject,
          html: input.html,
        });

        return this.normalizeSmtpResult(info);
      },
    };
  }

  private buildResendProvider(): EmailDeliveryProvider {
    const apiKey = this.configService.resendApiKey;

    return {
      name: 'resend',
      isConfigured: Boolean(apiKey && this.configService.mailFrom),
      state: {
        hasApiKey: Boolean(apiKey),
        from: this.configService.mailFrom,
      },
      send: async (input) => {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: this.configService.mailFrom,
            to: input.to,
            subject: input.subject,
            html: input.html,
          }),
        });

        const body = await this.safeReadResendJson(response);
        if (!response.ok) {
          throw new ResendDeliveryError(response.status, this.readResendErrorName(body));
        }

        return {
          messageId: this.readResendMessageId(body),
          response: `HTTP ${response.status}`,
        };
      },
    };
  }

  private normalizeSmtpResult(info: unknown): EmailDeliveryResult {
    const response =
      typeof info === 'object' && info !== null && 'response' in info
        ? String((info as { response: unknown }).response)
        : undefined;
    const messageId =
      typeof info === 'object' && info !== null && 'messageId' in info
        ? String((info as { messageId: unknown }).messageId)
        : undefined;

    return {
      acceptedCount: this.getAddressCount(info, 'accepted'),
      rejectedCount: this.getAddressCount(info, 'rejected'),
      messageId,
      response,
    };
  }

  private async safeReadResendJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  private readResendMessageId(body: unknown) {
    if (typeof body === 'object' && body !== null && 'id' in body) {
      return String((body as { id: unknown }).id);
    }

    return undefined;
  }

  private readResendErrorName(body: unknown) {
    if (typeof body === 'object' && body !== null && 'name' in body) {
      return String((body as { name: unknown }).name);
    }

    return undefined;
  }

  private buildFrontendTokenUrl(path: string, token: string) {
    const url = new URL(path, `${this.configService.frontendUrl}/`);
    url.searchParams.set('token', token);
    return url.toString();
  }

  private buildVerificationEmailHtml(verificationUrl: string) {
    const safeVerificationUrl = this.escapeHtml(verificationUrl);
    const safeAppName = this.escapeHtml(this.configService.appName);

    return `
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <title>Verify your account</title>
        </head>
        <body style="font-family: Arial, sans-serif; margin: 0; padding: 24px; color: #111827; background: #f9fafb;">
          <main style="max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 32px;">
            <h1 style="margin: 0 0 16px; font-size: 24px; line-height: 1.25;">Verify your account</h1>
            <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.5;">
              Please verify your email address to finish setting up your ${safeAppName} account.
            </p>
            <a href="${safeVerificationUrl}" style="display: inline-block; padding: 12px 18px; border-radius: 6px; background: #2563eb; color: #ffffff; text-decoration: none; font-weight: 700;">
              Verify your account
            </a>
          </main>
        </body>
      </html>
    `;
  }

  private buildPasswordResetEmailHtml(resetUrl: string, expiresAt: Date) {
    const safeResetUrl = this.escapeHtml(resetUrl);
    const safeAppName = this.escapeHtml(this.configService.appName);

    return `
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <title>Reset your password</title>
        </head>
        <body style="font-family: Arial, sans-serif; margin: 0; padding: 24px; color: #111827; background: #f9fafb;">
          <main style="max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 32px;">
            <h1 style="margin: 0 0 16px; font-size: 24px; line-height: 1.25;">Reset your password</h1>
            <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.5;">
              Use this link to set a new password for your ${safeAppName} account.
            </p>
            <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.5; color: #4b5563;">
              This link expires at ${this.escapeHtml(expiresAt.toISOString())}.
            </p>
            <a href="${safeResetUrl}" style="display: inline-block; padding: 12px 18px; border-radius: 6px; background: #2563eb; color: #ffffff; text-decoration: none; font-weight: 700;">
              Reset password
            </a>
          </main>
        </body>
      </html>
    `;
  }

  private logEmailConfigurationState() {
    if (this.configService.isProduction) {
      return;
    }

    const provider = this.getDeliveryProvider();
    this.logger.log(
      JSON.stringify({
        event: 'auth.email.provider_config',
        provider: provider.name,
        configured: provider.isConfigured,
        frontendUrl: this.configService.frontendUrl,
        appName: this.configService.appName,
        ...provider.state,
      }),
    );
  }

  private logDevelopmentDeliveryFallback(
    input: AuthEmailInput,
    provider: EmailProviderName,
    reason: string,
  ) {
    if (this.configService.isProduction) {
      this.warnProductionFallbackSuppressed(input.kind, provider, reason);
      return;
    }

    this.logger.log(
      JSON.stringify({
        event: `auth.${input.kind}.delivery_skipped_dev`,
        provider,
        reason,
        message:
          'Development email delivery skipped. Configure SMTP/Mailtrap or Resend to receive the link; raw tokens are not logged.',
        email: this.maskEmail(input.to),
        tokenRoute: input.tokenRoute,
        expiresAt: input.expiresAt.toISOString(),
      }),
    );
  }

  private warnProductionFallbackSuppressed(
    kind: AuthEmailKind,
    provider: EmailProviderName,
    reason: string,
  ) {
    const warningKey = `${kind}:${provider}:${reason}`;
    if (this.warnedProductionDeliveryIssues.has(warningKey)) {
      return;
    }

    this.warnedProductionDeliveryIssues.add(warningKey);
    this.logger.warn(
      JSON.stringify({
        event: `auth.${kind}.delivery_skipped`,
        provider,
        reason,
        message:
          'Email delivery failed or provider configuration is incomplete. Raw token fallback is suppressed.',
      }),
    );
  }

  private logSanitizedSendSuccess(
    input: AuthEmailInput,
    provider: EmailProviderName,
    result: EmailDeliveryResult,
  ) {
    this.logger.log(
      JSON.stringify({
        event: `auth.${input.kind}.send_success`,
        provider,
        to: this.maskEmail(input.to),
        acceptedCount: result.acceptedCount,
        rejectedCount: result.rejectedCount,
        messageId: result.messageId,
        response: result.response,
      }),
    );
  }

  private logSanitizedSendError(
    input: AuthEmailInput,
    provider: EmailProviderName,
    error: unknown,
  ) {
    this.logger.warn(
      JSON.stringify({
        event: `auth.${input.kind}.send_failed`,
        provider,
        to: this.maskEmail(input.to),
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorCode: this.getErrorCode(error),
        errorCommand: this.getErrorCommand(error),
        statusCode: error instanceof ResendDeliveryError ? error.statusCode : undefined,
        providerErrorName: error instanceof ResendDeliveryError ? error.providerErrorName : undefined,
      }),
    );
  }

  private getErrorCode(error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      return String((error as { code: unknown }).code);
    }

    return undefined;
  }

  private getErrorCommand(error: unknown) {
    if (typeof error === 'object' && error !== null && 'command' in error) {
      return String((error as { command: unknown }).command);
    }

    return undefined;
  }

  private getAddressCount(info: unknown, key: 'accepted' | 'rejected') {
    if (typeof info !== 'object' || info === null || !(key in info)) {
      return undefined;
    }

    const value = (info as Record<typeof key, unknown>)[key];
    return Array.isArray(value) ? value.length : undefined;
  }

  private maskEmail(email: string) {
    const [localPart, domain] = email.split('@');

    if (!localPart || !domain) {
      return '[invalid-email]';
    }

    return `${localPart.slice(0, 2)}***@${domain}`;
  }

  private escapeHtml(value: string) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }
}

class ResendDeliveryError extends Error {
  constructor(
    readonly statusCode: number,
    readonly providerErrorName?: string,
  ) {
    super('Resend email delivery failed');
    this.name = 'ResendDeliveryError';
  }
}
