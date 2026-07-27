import { Module } from '@nestjs/common';
import { NodePresetsController } from './node-presets.controller';
import { NodePresetsService } from './node-presets.service';
import { WorkspacesModule } from '../workspaces/workspaces.module';

@Module({
  imports: [WorkspacesModule],
  controllers: [NodePresetsController],
  providers: [NodePresetsService],
})
export class NodePresetsModule {}
