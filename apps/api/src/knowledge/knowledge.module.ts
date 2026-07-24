import { Module } from '@nestjs/common';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { QueueModule } from '../queue/queue.module';
import { CryptoModule } from '../crypto/crypto.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';

/**
 * So produtor (enfileira ingestao). O consumo roda no worker (Fase 10) —
 * ver IngestionProcessor, registrado em apps/api/src/worker/worker.module.ts.
 */
@Module({
  imports: [QueueModule, CryptoModule, WorkspacesModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
