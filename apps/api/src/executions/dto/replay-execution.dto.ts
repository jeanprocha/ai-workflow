import { IsOptional, IsString } from 'class-validator';

export class ReplayExecutionDto {
  @IsOptional()
  input?: unknown;

  @IsOptional()
  @IsString()
  fromNodeId?: string;
}
