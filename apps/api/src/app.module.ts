import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
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

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    WorkspacesModule,
    CredentialsModule,
    VariablesModule,
    WorkflowsModule,
    ExecutionsModule,
    HooksModule,
    AgentsModule,
    TemplatesModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
