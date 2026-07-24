import { Module } from '@nestjs/common';
import { EngineService } from './engine.service';
import { ExecutionEventsService } from '../execution-events/execution-events.service';
import { CryptoModule } from '../crypto/crypto.module';
import { AgentsModule } from '../agents/agents.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { McpModule } from '../mcp/mcp.module';

@Module({
  imports: [CryptoModule, AgentsModule, KnowledgeModule, McpModule],
  providers: [EngineService, ExecutionEventsService],
  exports: [EngineService, ExecutionEventsService],
})
export class EngineModule {}
