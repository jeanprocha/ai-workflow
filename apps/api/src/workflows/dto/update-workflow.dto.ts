import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateWorkflowDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['draft', 'active', 'archived'])
  status?: 'draft' | 'active' | 'archived';

  /**
   * H2-05: fluxo disparado quando este falha. `null` limpa o ponteiro —
   * @IsOptional() ja pula a validacao pra null/undefined (nao so undefined),
   * entao nenhum decorator extra e necessario pro caso de limpar.
   */
  @IsOptional()
  @IsString()
  errorWorkflowId?: string | null;
}
