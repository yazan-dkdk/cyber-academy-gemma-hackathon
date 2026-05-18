import { IsString, MaxLength } from 'class-validator';

export class ValidateProxyAccessDto {
  @IsString()
  @MaxLength(255)
  proxyToken!: string;
}
