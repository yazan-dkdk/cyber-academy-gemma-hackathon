import { Matches } from 'class-validator';

export class VerifyAdminMfaDto {
  @Matches(/^\d{6}$/)
  code!: string;
}
