import { Body, Controller, Param, Post } from '@nestjs/common';
import { ExecutionsService } from '../executions/executions.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('hooks')
export class HooksController {
  constructor(private readonly executionsService: ExecutionsService) {}

  @Public()
  @Post(':webhookId')
  trigger(@Param('webhookId') webhookId: string, @Body() body: unknown) {
    return this.executionsService.triggerByWebhook(webhookId, body);
  }
}
