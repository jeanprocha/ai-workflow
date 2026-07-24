import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { CacheModule } from './cache/cache.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { CredentialsModule } from './credentials/credentials.module';
import { VariablesModule } from './variables/variables.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { ExecutionsModule } from './executions/executions.module';
import { HooksModule } from './hooks/hooks.module';
import { AgentsModule } from './agents/agents.module';
import { TemplatesModule } from './templates/templates.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { McpModule } from './mcp/mcp.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { SearchModule } from './search/search.module';

@Module({
  imports: [
    PrismaModule,
    CacheModule,
    AuthModule,
    WorkspacesModule,
    CredentialsModule,
    VariablesModule,
    WorkflowsModule,
    ExecutionsModule,
    HooksModule,
    AgentsModule,
    TemplatesModule,
    AnalyticsModule,
    KnowledgeModule,
    McpModule,
    SchedulerModule,
    SearchModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
