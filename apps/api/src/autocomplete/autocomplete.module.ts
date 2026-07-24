import { Module } from '@nestjs/common';
import { AutocompleteController } from './autocomplete.controller';
import { AutocompleteService } from './autocomplete.service';
import { CryptoModule } from '../crypto/crypto.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { AiSuggestionsModule } from '../ai-suggestions/ai-suggestions.module';

@Module({
  imports: [CryptoModule, WorkspacesModule, AiSuggestionsModule],
  controllers: [AutocompleteController],
  providers: [AutocompleteService],
})
export class AutocompleteModule {}
