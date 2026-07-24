import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class CallMcpToolDto {
  @IsString()
  @MinLength(1)
  toolName!: string;

  @IsOptional()
  @IsObject()
  args?: Record<string, unknown>;
}
