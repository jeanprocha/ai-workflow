import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

export const EXECUTIONS_QUEUE = 'executions';
export const INGESTION_QUEUE = 'ingestion';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL ?? 'redis://localhost:6379',
        maxRetriesPerRequest: null,
      },
    }),
    BullModule.registerQueue({ name: EXECUTIONS_QUEUE }),
    BullModule.registerQueue({ name: INGESTION_QUEUE }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
