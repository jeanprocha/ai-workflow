import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Corpo capado (MaxLength) — endpoint publico e sem autenticacao, um client
 * comprometido/bugado nao pode usar isto pra mandar payloads arbitrariamente
 * grandes e inflar os logs do servidor.
 */
export class ReportClientErrorDto {
  @IsIn(['error', 'unhandledrejection'])
  kind!: 'error' | 'unhandledrejection';

  @IsString()
  @MaxLength(500)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  stack?: string;

  @IsString()
  @MaxLength(500)
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  userAgent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  requestId?: string;
}
