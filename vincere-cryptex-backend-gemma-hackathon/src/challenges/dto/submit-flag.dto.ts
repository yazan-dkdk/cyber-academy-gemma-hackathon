import { IsString, MaxLength } from 'class-validator';

export class SubmitFlagDto {
  @IsString()
  @MaxLength(512)
  flag!: string;
}
