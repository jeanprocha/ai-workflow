import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CredentialFieldDto } from './create-credential.dto';

/**
 * Todo campo e opcional: renomear sem tocar no segredo e o caso principal.
 * Mandar `value`/`fields` SUBSTITUI o segredo inteiro — nao existe atualizacao
 * parcial de um campo isolado, porque o valor salvo nunca volta pro cliente
 * (nao ha rota que devolva isso, de proposito) e portanto nao ha o que mesclar.
 */
export class UpdateCredentialDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  provider?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsIn(['secret', 'fields'])
  kind?: 'secret' | 'fields';

  @IsOptional()
  @IsString()
  @MinLength(1)
  value?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CredentialFieldDto)
  fields?: CredentialFieldDto[];
}
