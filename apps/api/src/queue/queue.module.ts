import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

export const EXECUTIONS_QUEUE = 'executions';
export const INGESTION_QUEUE = 'ingestion';
export const MCP_HEALTH_QUEUE = 'mcp-health';
export const SCHEDULES_QUEUE = 'schedules';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL ?? 'redis://localhost:6379',
        maxRetriesPerRequest: null,
      },
      // Sem isso, job completo/falho fica no Redis pra sempre (nunca tinha
      // sido configurado) — o OrphanRecoveryService le so o Postgres, entao
      // e seguro descartar jobs velhos aqui sem afetar a recuperacao de
      // execucoes orfas. removeOnFail com prazo maior (7 dias) pra dar
      // margem de investigar falhas antes de sumirem.
      defaultJobOptions: {
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    }),
    BullModule.registerQueue({ name: EXECUTIONS_QUEUE }),
    BullModule.registerQueue({ name: INGESTION_QUEUE }),
    BullModule.registerQueue({ name: MCP_HEALTH_QUEUE }),
    BullModule.registerQueue({ name: SCHEDULES_QUEUE }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
