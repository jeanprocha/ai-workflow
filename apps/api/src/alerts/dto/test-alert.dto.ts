import { IsOptional, IsUrl } from 'class-validator';

export class TestAlertDto {
  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'URL de webhook invalida.' })
  webhookUrl?: string;
}
