import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

// Mirror manual de ExecutionStatus (@workflow/shared) — literal, nao import,
// pra nao exigir mock de @workflow/shared nos specs que passam por aqui
// (ver H2-06 e a familia de jest.mock ESM ja usada no engine/graph.schema).
const STATUSES = ['queued', 'running', 'waiting_approval', 'success', 'failed', 'canceled'];

export class ListExecutionsQueryDto {
  @IsOptional()
  @IsString()
  workflowId?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
