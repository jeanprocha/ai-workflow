import { Module } from '@nestjs/common';
import { EngineService } from './engine.service';
import { NodeSandboxRunner } from './sandbox/node-sandbox-runner';
import { CryptoModule } from '../crypto/crypto.module';
import { AgentsModule } from '../agents/agents.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { McpModule } from '../mcp/mcp.module';

@Module({
  imports: [CryptoModule, AgentsModule, KnowledgeModule, McpModule],
  providers: [EngineService, NodeSandboxRunner],
  exports: [EngineService],
})
export class EngineModule {}
