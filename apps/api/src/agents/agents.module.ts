import { Module } from '@nestjs/common';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { CryptoModule } from '../crypto/crypto.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { McpModule } from '../mcp/mcp.module';

@Module({
  imports: [CryptoModule, WorkspacesModule, KnowledgeModule, McpModule],
  controllers: [AgentsController],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
