import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateNodePresetDto {
  @IsString()
  @MinLength(1)
  nodeType!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** Config parcial do node — mesclada por cima do config atual ao aplicar (ver PresetBar no editor). */
  @IsObject()
  config!: Record<string, unknown>;
}
