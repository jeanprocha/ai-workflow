import { Module } from '@nestjs/common';
import { CopilotController } from './copilot.controller';
import { CopilotService } from './copilot.service';
import { CredentialsModule } from '../credentials/credentials.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { AiSuggestionsModule } from '../ai-suggestions/ai-suggestions.module';

@Module({
  imports: [
    CredentialsModule,
    WorkspacesModule,
    WorkflowsModule,
    AiSuggestionsModule,
  ],
  controllers: [CopilotController],
  providers: [CopilotService],
})
export class CopilotModule {}
