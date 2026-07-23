import { IsObject, IsOptional } from 'class-validator';

export class RunWorkflowDto {
  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>;
}
