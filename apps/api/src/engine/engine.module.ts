import { Module } from '@nestjs/common';
import { EngineService } from './engine.service';
import { ExecutionEventsService } from '../execution-events/execution-events.service';
import { CryptoModule } from '../crypto/crypto.module';
import { AgentsModule } from '../agents/agents.module';

@Module({
  imports: [CryptoModule, AgentsModule],
  providers: [EngineService, ExecutionEventsService],
  exports: [EngineService, ExecutionEventsService],
})
export class EngineModule {}
