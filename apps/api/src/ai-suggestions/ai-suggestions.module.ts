import { Module } from '@nestjs/common';
import { AiSuggestionsController } from './ai-suggestions.controller';
import { AiSuggestionsService } from './ai-suggestions.service';
import { WorkspacesModule } from '../workspaces/workspaces.module';

@Module({
  imports: [WorkspacesModule],
  controllers: [AiSuggestionsController],
  providers: [AiSuggestionsService],
  exports: [AiSuggestionsService],
})
export class AiSuggestionsModule {}
