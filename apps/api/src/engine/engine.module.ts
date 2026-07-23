import { Module } from '@nestjs/common';
import { EngineService } from './engine.service';
import { ExecutionEventsService } from '../execution-events/execution-events.service';
import { CryptoModule } from '../crypto/crypto.module';

@Module({
  imports: [CryptoModule],
  providers: [EngineService, ExecutionEventsService],
  exports: [EngineService, ExecutionEventsService],
})
export class EngineModule {}
