import { Module } from '@nestjs/common';
import { HooksController } from './hooks.controller';
import { ExecutionsModule } from '../executions/executions.module';

@Module({
  imports: [ExecutionsModule],
  controllers: [HooksController],
})
export class HooksModule {}
