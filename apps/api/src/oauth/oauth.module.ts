import { Module } from '@nestjs/common';
import { OAuthController } from './oauth.controller';
import { OAuthService } from './oauth.service';
import { CryptoModule } from '../crypto/crypto.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';

@Module({
  imports: [CryptoModule, WorkspacesModule],
  controllers: [OAuthController],
  providers: [OAuthService],
})
export class OAuthModule {}
