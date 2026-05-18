import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export enum AiTutorMode {
  LESSON = 'lesson',
  HINT = 'hint',
  SAFETY_CHECK = 'safety_check',
  NEXT_STEP = 'next_step',
}

export class AskAiTutorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  lessonTitle!: string;

  @IsOptional()
  @IsString()
  @MaxLength(12000)
  lessonContent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  courseTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  lessonType?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  currentProgressPercent?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  question?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  userQuestion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;

  @IsOptional()
  @IsEnum(AiTutorMode)
  mode?: AiTutorMode;
}
