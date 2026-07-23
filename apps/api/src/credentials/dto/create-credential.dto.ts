import { IsString, MinLength } from 'class-validator';

export class CreateCredentialDto {
  @IsString()
  @MinLength(1)
  provider!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  value!: string;
}
