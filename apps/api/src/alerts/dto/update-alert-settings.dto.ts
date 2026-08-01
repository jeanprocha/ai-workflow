import { IsBoolean, IsOptional, IsUrl, ValidateIf } from 'class-validator';

export class UpdateAlertSettingsDto {
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  // null limpa o webhook — so valida formato de URL quando um valor de
  // verdade foi enviado (ausente ou null pulam a validacao).
  @ValidateIf(
    (dto: UpdateAlertSettingsDto) =>
      dto.webhookUrl !== null && dto.webhookUrl !== undefined,
  )
  @IsUrl({ require_tld: false }, { message: 'URL de webhook invalida.' })
  webhookUrl?: string | null;
}
