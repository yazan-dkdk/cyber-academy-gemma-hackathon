import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { UserRole } from '@prisma/client';

import { RequireAdminMfa } from '../common/decorators/admin-mfa.decorator';
import { CurrentSession } from '../common/decorators/current-session.decorator';
import { RateLimitPreset, RateLimitPresetDecorator } from '../common/decorators/rate-limit.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminMfaGuard } from '../common/guards/admin-mfa.guard';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { RequestAuthContext } from '../common/interfaces/authenticated-user.interface';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyAdminMfaDto } from './dto/verify-admin-mfa.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { AuthService } from './auth.service';
import { SessionService } from '../session/session.service';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(SessionService)
    private readonly sessionService: SessionService,
  ) {}

  @Post('register')
  @UseGuards(RateLimitGuard)
  @RateLimitPresetDecorator(RateLimitPreset.REGISTER)
  async register(@Body() body: RegisterDto) {
    return this.authService.register(body.email, body.password);
  }

  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(@Body() body: VerifyEmailDto) {
    return this.authService.verifyEmail(body.token);
  }

  @Post('resend-verification')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @RateLimitPresetDecorator(RateLimitPreset.RESEND_VERIFICATION)
  async resendVerification(@Body() body: ResendVerificationDto) {
    return this.authService.resendVerification(body.email);
  }

  @Get('dev/email-verification-token')
  async getDevelopmentEmailVerificationToken(@Query('email') email: string) {
    return this.authService.getDevelopmentEmailVerificationToken(email);
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @RateLimitPresetDecorator(RateLimitPreset.LOGIN)
  async login(
    @Body() body: LoginDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.authService.login(body.email, body.password, request);
    this.sessionService.setSessionCookie(reply, result.session.sessionId);

    return result.response;
  }

  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const sessionId = this.sessionService.extractSignedSessionId(request);
    this.sessionService.clearSessionCookie(reply);
    return this.authService.logout(sessionId);
  }

  @Get('me')
  @UseGuards(AuthenticatedGuard)
  async me(@CurrentSession() auth: RequestAuthContext) {
    const result = await this.authService.getCurrentUser(auth);

    return {
      success: true,
      authenticated: true,
      user: result.user,
      session: result.session,
      data: result,
    };
  }

  @Post('forgot-password')
  @UseGuards(RateLimitGuard)
  @RateLimitPresetDecorator(RateLimitPreset.FORGOT_PASSWORD)
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.createPasswordReset(body.email);
  }

  @Post('reset-password')
  @UseGuards(RateLimitGuard)
  @RateLimitPresetDecorator(RateLimitPreset.RESET_PASSWORD)
  async resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body.token, body.password);
  }

  @Post('admin-mfa/setup')
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async setupAdminMfa(@CurrentSession() auth: RequestAuthContext) {
    return this.authService.setupAdminMfa(auth);
  }

  @Post('admin-mfa/verify')
  @UseGuards(AuthenticatedGuard, RolesGuard, RateLimitGuard)
  @Roles(UserRole.ADMIN)
  @RateLimitPresetDecorator(RateLimitPreset.MFA_VERIFY)
  async verifyAdminMfa(
    @CurrentSession() auth: RequestAuthContext,
    @Body() body: VerifyAdminMfaDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.authService.verifyAdminMfa(auth, body.code);
    this.sessionService.setSessionCookie(reply, result.session.sessionId);

    return result.response;
  }

  @Post('admin-mfa/disable')
  @UseGuards(AuthenticatedGuard, RolesGuard, AdminMfaGuard, RateLimitGuard)
  @Roles(UserRole.ADMIN)
  @RequireAdminMfa()
  @RateLimitPresetDecorator(RateLimitPreset.MFA_VERIFY)
  async disableAdminMfa(
    @CurrentSession() auth: RequestAuthContext,
    @Body() body: VerifyAdminMfaDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.authService.disableAdminMfa(auth, body.code);
    this.sessionService.setSessionCookie(reply, result.session.sessionId);

    return result.response;
  }
}
