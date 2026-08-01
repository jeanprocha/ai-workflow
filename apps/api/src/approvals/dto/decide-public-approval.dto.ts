import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** Corpo do POST /approve/:token/decide (publico, sem conta). */
export class DecidePublicApprovalDto {
  @IsIn(['approved', 'rejected'])
  decision!: 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
