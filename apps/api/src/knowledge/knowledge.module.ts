import { Module } from '@nestjs/common';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { IngestionProcessor } from './ingestion.processor';
import { QueueModule } from '../queue/queue.module';
import { CryptoModule } from '../crypto/crypto.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';

@Module({
  imports: [QueueModule, CryptoModule, WorkspacesModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeService, IngestionProcessor],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
