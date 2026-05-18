import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import nodemailer from 'nodemailer';

import { AppConfigService } from '../config/app-config.service';

interface SendEmailVerificationInput {
  to: string;
  token: string;
  expiresAt: Date;
}

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private warnedMissingSmtpConfig = false;

  constructor(
    @Inject(AppConfigService)
    private readonly configService: AppConfigService,
  ) {}

  onModuleInit() {
    this.logSmtpConfigurationState();
  }

  async sendEmailVerification(input: SendEmailVerificationInput) {
    const smtpConfig = this.getSmtpConfig();

    if (!smtpConfig.isConfigured) {
      this.logSmtpConfigurationState();
      this.logVerificationFallback(input, 'missing_smtp_config');
      return;
    }

    const verificationUrl = this.buildVerificationUrl(input.token);
    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: {
        user: smtpConfig.user,
        pass: smtpConfig.pass,
      },
    });

    try {
      const info = await transporter.sendMail({
        from: smtpConfig.from,
        to: input.to,
        subject: 'Verify your account',
        html: this.buildVerificationEmailHtml(verificationUrl),
      });
      this.logSanitizedSendSuccess(input.to, info);
    } catch (error) {
      this.logSanitizedSendError(input.to, error);
      this.logVerificationFallback(input, 'smtp_send_failed');
    }
  }

  private buildVerificationUrl(token: string) {
    return `${this.getFrontendUrl()}/verify-email?token=${token}`;
  }

  private buildVerificationEmailHtml(verificationUrl: string) {
    const safeVerificationUrl = this.escapeHtml(verificationUrl);

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
              Please verify your email address to finish setting up your account.
            </p>
            <a href="${safeVerificationUrl}" style="display: inline-block; padding: 12px 18px; border-radius: 6px; background: #2563eb; color: #ffffff; text-decoration: none; font-weight: 700;">
              Verify your account
            </a>
          </main>
        </body>
      </html>
    `;
  }

  private getSmtpConfig() {
    const host = process.env.MAIL_HOST?.trim() || '';
    const rawPort = process.env.MAIL_PORT?.trim() || '';
    const port = Number(rawPort);
    const user = process.env.MAIL_USER?.trim() || '';
    const pass = process.env.MAIL_PASS ?? '';
    const from = process.env.MAIL_FROM?.trim() || 'no-reply@example.com';

    return {
      host,
      port,
      rawPort,
      user,
      pass,
      from,
      secure: port === 465,
      isConfigured: Boolean(host && rawPort && Number.isInteger(port) && port > 0 && user && pass),
      hasHost: Boolean(host),
      hasPort: Boolean(rawPort),
      hasUser: Boolean(user),
      hasPass: Boolean(pass),
    };
  }

  private logSmtpConfigurationState() {
    if (this.configService.isProduction) {
      return;
    }

    const config = this.getSmtpConfig();
    this.logger.log(
      JSON.stringify({
        event: 'auth.email_verification.smtp_config',
        configured: config.isConfigured,
        host: config.host || null,
        port: config.rawPort || null,
        secure: config.secure,
        hasUser: config.hasUser,
        hasPassword: config.hasPass,
        from: config.from,
        frontendUrl: this.getFrontendUrl(),
        providerHint: config.host.includes('mailtrap') ? 'mailtrap' : 'custom',
      }),
    );
  }

  private logVerificationFallback(input: SendEmailVerificationInput, reason: string) {
    if (this.configService.isProduction) {
      this.warnProductionFallbackSuppressed(reason);
      return;
    }

    const verificationUrl = this.buildVerificationUrl(input.token);
    this.logger.log(
      JSON.stringify({
        event: 'auth.email_verification.dev_only',
        reason,
        message:
          'DEV ONLY verification link. Raw tokens must never be logged in production.',
        email: input.to,
        verificationUrl,
        token: input.token,
        expiresAt: input.expiresAt.toISOString(),
      }),
    );
  }

  private warnProductionFallbackSuppressed(reason: string) {
    if (reason === 'missing_smtp_config' && this.warnedMissingSmtpConfig) {
      return;
    }

    if (reason === 'missing_smtp_config') {
      this.warnedMissingSmtpConfig = true;
    }

    this.logger.warn(
      JSON.stringify({
        event: 'auth.email_verification.delivery_skipped',
        reason,
        message:
          'Email verification delivery could not use SMTP. Development verification link fallback is suppressed in production.',
      }),
    );
  }

  private logSanitizedSendSuccess(to: string, info: unknown) {
    const response =
      typeof info === 'object' && info !== null && 'response' in info
        ? String((info as { response: unknown }).response)
        : undefined;
    const messageId =
      typeof info === 'object' && info !== null && 'messageId' in info
        ? String((info as { messageId: unknown }).messageId)
        : undefined;

    this.logger.log(
      JSON.stringify({
        event: 'auth.email_verification.smtp_send_success',
        to: this.maskEmail(to),
        acceptedCount: this.getAddressCount(info, 'accepted'),
        rejectedCount: this.getAddressCount(info, 'rejected'),
        messageId,
        response,
      }),
    );
  }

  private logSanitizedSendError(to: string, error: unknown) {
    this.logger.warn(
      JSON.stringify({
        event: 'auth.email_verification.smtp_send_failed',
        to: this.maskEmail(to),
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorCode: this.getErrorCode(error),
        errorCommand: this.getErrorCommand(error),
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

  private getFrontendUrl() {
    return process.env.FRONTEND_URL ?? process.env.FRONTEND_ORIGIN ?? this.configService.frontendOrigin;
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
