import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class DiagnoseExecutionDto {
  @IsIn(['openai', 'anthropic', 'gemini', 'ollama'])
  provider!: string;

  @IsString()
  @MinLength(1)
  model!: string;

  @IsOptional()
  @IsString()
  credential?: string;
}
