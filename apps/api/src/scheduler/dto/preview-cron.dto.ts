import { IsOptional, IsString, MinLength } from 'class-validator';

export class PreviewCronDto {
  @IsString()
  @MinLength(1)
  cronExpression!: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}
