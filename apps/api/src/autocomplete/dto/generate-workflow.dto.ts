import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class GenerateWorkflowDto {
  @IsString()
  @MinLength(3)
  prompt!: string;

  @IsIn(['openai', 'anthropic', 'gemini', 'ollama'])
  provider!: string;

  @IsString()
  @MinLength(1)
  model!: string;

  @IsOptional()
  @IsString()
  credential?: string;

  /** Se informado, a sugestao fica associada a este fluxo (telemetria). */
  @IsOptional()
  @IsString()
  workflowId?: string;
}
