import { Module } from '@nestjs/common';
import { VariablesController } from './variables.controller';
import { VariablesService } from './variables.service';
import { CryptoModule } from '../crypto/crypto.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';

@Module({
  imports: [CryptoModule, WorkspacesModule],
  controllers: [VariablesController],
  providers: [VariablesService],
})
export class VariablesModule {}
