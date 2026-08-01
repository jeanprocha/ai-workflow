import { PartialType, PickType } from '@nestjs/mapped-types';
import { CreateTemplateDto } from './create-template.dto';

/**
 * PATCH e so de metadados: PickType exclui workflowId/versionId antes do
 * PartialType, senao o DTO aceitaria (e o contrato mentiria) reapontar o
 * template pra outro fluxo/versao via PATCH.
 */
export class UpdateTemplateDto extends PartialType(
  PickType(CreateTemplateDto, ['name', 'description', 'category'] as const),
) {}
