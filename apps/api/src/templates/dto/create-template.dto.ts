import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateTemplateDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @MinLength(1)
  category!: string;

  @IsString()
  @MinLength(1)
  workflowId!: string;

  /** Versao especifica do fluxo; default = currentVersion. */
  @IsOptional()
  @IsString()
  versionId?: string;
}
