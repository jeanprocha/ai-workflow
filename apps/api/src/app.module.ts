import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { SentryModule } from '@sentry/nestjs/setup';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ObservabilityModule } from './observability/observability.module';
import { AuthContextInterceptor } from './observability/auth-context.interceptor';
import { HttpMetricsInterceptor } from './observability/http-metrics.interceptor';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { CacheModule } from './cache/cache.module';
import { ExecutionEventsModule } from './execution-events/execution-events.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { CredentialsModule } from './credentials/credentials.module';
import { VariablesModule } from './variables/variables.module';
import { NodePresetsModule } from './node-presets/node-presets.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { ExecutionsModule } from './executions/executions.module';
import { HooksModule } from './hooks/hooks.module';
import { ChatModule } from './chat/chat.module';
import { AgentsModule } from './agents/agents.module';
import { TemplatesModule } from './templates/templates.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { McpModule } from './mcp/mcp.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { SearchModule } from './search/search.module';
import { AiSuggestionsModule } from './ai-suggestions/ai-suggestions.module';
import { AutocompleteModule } from './autocomplete/autocomplete.module';
import { DebuggerModule } from './debugger/debugger.module';
import { CostOptimizerModule } from './cost-optimizer/cost-optimizer.module';
import { CopilotModule } from './copilot/copilot.module';
import { TelemetryModule } from './telemetry/telemetry.module';
import { AlertsModule } from './alerts/alerts.module';
import { FlowApiModule } from './flow-api/flow-api.module';
import { ApprovalsModule } from './approvals/approvals.module';

/**
 * H1.1 (hardening): limite generoso por padrao (protege contra flood/DoS
 * acidental), apertado por rota via @Throttle nos endpoints de auth
 * (auth.controller.ts). Fora de producao o default e bem mais folgado —
 * sem isso a suite E2E (que registra/loga dezenas de usuarios em minutos)
 * tomaria 429 no meio dos testes.
 */
function throttlerConfig() {
  const isProd = process.env.NODE_ENV === 'production';
  return [
    {
      name: 'default',
      ttl: Number(process.env.THROTTLE_TTL_MS ?? 60_000),
      limit: Number(process.env.THROTTLE_LIMIT ?? (isProd ? 100 : 2000)),
    },
  ];
}

@Module({
  imports: [
    SentryModule.forRoot(),
    ThrottlerModule.forRoot(throttlerConfig()),
    ObservabilityModule,
    PrismaModule,
    CacheModule,
    ExecutionEventsModule,
    HealthModule,
    AuthModule,
    WorkspacesModule,
    CredentialsModule,
    VariablesModule,
    NodePresetsModule,
    WorkflowsModule,
    ExecutionsModule,
    HooksModule,
    ChatModule,
    AgentsModule,
    TemplatesModule,
    AnalyticsModule,
    KnowledgeModule,
    McpModule,
    SchedulerModule,
    SearchModule,
    AiSuggestionsModule,
    AutocompleteModule,
    DebuggerModule,
    CostOptimizerModule,
    CopilotModule,
    AlertsModule,
    TelemetryModule,
    FlowApiModule,
    ApprovalsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // ThrottlerGuard antes do JwtAuthGuard: uma request que estoura o limite
    // leva 429 sem gastar verificacao de JWT.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: AuthContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
})
export class AppModule {}
