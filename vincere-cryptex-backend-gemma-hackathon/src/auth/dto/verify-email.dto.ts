import { IsString, Matches } from 'class-validator';

export class VerifyEmailDto {
  @IsString({ message: 'Invalid or expired verification token' })
  @Matches(/^[a-fA-F0-9]{64}$/, {
    message: 'Invalid or expired verification token',
  })
  token!: string;
}
