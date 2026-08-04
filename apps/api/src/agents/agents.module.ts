import { Module } from '@nestjs/common';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { CredentialsModule } from '../credentials/credentials.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { McpModule } from '../mcp/mcp.module';

@Module({
  imports: [CredentialsModule, WorkspacesModule, KnowledgeModule, McpModule],
  controllers: [AgentsController],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
