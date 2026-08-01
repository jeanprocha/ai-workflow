import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Corpo do POST /approvals/:id/approve e /approvals/:id/reject (autenticado). */
export class DecideApprovalDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
