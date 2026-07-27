import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Corpo capado (MaxLength) — endpoint publico e sem autenticacao, ninguem
 * pode usar isto pra inflar execucoes/mensagens com payloads arbitrarios.
 */
export class PostMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content!: string;
}
