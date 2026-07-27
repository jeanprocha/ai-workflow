import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Tipos suportados num campo de conexao — decide a coercao antes de virar JSON. */
export const CREDENTIAL_FIELD_TYPES = ['text', 'number', 'boolean'] as const;
export type CredentialFieldType = (typeof CREDENTIAL_FIELD_TYPES)[number];

export class CredentialFieldDto {
  @IsString()
  @MinLength(1)
  key!: string;

  @IsString()
  value!: string;

  @IsIn(CREDENTIAL_FIELD_TYPES)
  type!: CredentialFieldType;
}

/**
 * Duas formas de conexao, discriminadas por `kind`:
 *
 * - `secret` (padrao): um valor unico — token de API, webhook URL, connection
 *   string. E o formato historico; omitir `kind` mantem o corpo antigo
 *   `{provider, name, value}` valido, entao nada que ja chamava esta rota muda.
 * - `fields`: varios pares chave/valor tipados, guardados como um objeto JSON.
 *   E o que o node HTTP expoe como `{{ $auth.<chave> }}`.
 *
 * A exigencia de `value` XOR `fields` conforme o `kind` e validada no service
 * (class-validator nao expressa uniao discriminada de forma legivel).
 */
export class CreateCredentialDto {
  @IsString()
  @MinLength(1)
  provider!: string;

  @IsString()
  @MinLength(1)
  name!: string;

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
