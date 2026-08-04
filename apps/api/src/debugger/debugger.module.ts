import { Module } from '@nestjs/common';
import { DebuggerController } from './debugger.controller';
import { DebuggerService } from './debugger.service';
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
  controllers: [DebuggerController],
  providers: [DebuggerService],
})
export class DebuggerModule {}
