import { IsOptional, IsString, MinLength } from 'class-validator';

export class StartOAuthDto {
  /** Nome da credencial a criar/reconectar — default e o proprio provedor. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}
