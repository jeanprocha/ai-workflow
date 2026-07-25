import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AutocompleteService } from './autocomplete.service';
import { GenerateWorkflowDto } from './dto/generate-workflow.dto';
import { WorkspaceGuard } from '../workspaces/guards/workspace.guard';
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';
import { Lang } from '../i18n/lang.decorator';
import type { Locale } from '../i18n/pt-to-en';

@Controller('autocomplete')
@UseGuards(WorkspaceGuard)
export class AutocompleteController {
  constructor(private readonly autocomplete: AutocompleteService) {}

  @Post('generate')
  generate(
    @CurrentWorkspace() workspaceId: string,
    @Body() dto: GenerateWorkflowDto,
    @Lang() lang: Locale,
  ) {
    return this.autocomplete.generate(workspaceId, dto, lang);
  }
}
