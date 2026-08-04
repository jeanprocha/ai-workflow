import { Module } from '@nestjs/common';
import { EngineService } from './engine.service';
import { NodeSandboxRunner } from './sandbox/node-sandbox-runner';
import { CredentialsModule } from '../credentials/credentials.module';
import { AgentsModule } from '../agents/agents.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { McpModule } from '../mcp/mcp.module';
import { AlertsModule } from '../alerts/alerts.module';
import { ExecutionsModule } from '../executions/executions.module';
import { ApprovalsModule } from '../approvals/approvals.module';

@Module({
  imports: [
    CredentialsModule,
    AgentsModule,
    KnowledgeModule,
    McpModule,
    AlertsModule,
    ExecutionsModule,
    ApprovalsModule,
  ],
  providers: [EngineService, NodeSandboxRunner],
  exports: [EngineService],
})
export class EngineModule {}
