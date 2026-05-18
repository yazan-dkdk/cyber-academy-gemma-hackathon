import { SetMetadata } from '@nestjs/common';

export enum RateLimitPreset {
  LOGIN = 'LOGIN',
  REGISTER = 'REGISTER',
  RESEND_VERIFICATION = 'RESEND_VERIFICATION',
  FORGOT_PASSWORD = 'FORGOT_PASSWORD',
  RESET_PASSWORD = 'RESET_PASSWORD',
  MFA_VERIFY = 'MFA_VERIFY',
  FLAG_SUBMISSION = 'FLAG_SUBMISSION',
  LAB_START = 'LAB_START',
  LAB_RESET = 'LAB_RESET',
  LAB_TERMINATE = 'LAB_TERMINATE',
}

export const RATE_LIMIT_PRESET_KEY = 'rate-limit-preset';

export const RateLimitPresetDecorator = (preset: RateLimitPreset) =>
  SetMetadata(RATE_LIMIT_PRESET_KEY, preset);
