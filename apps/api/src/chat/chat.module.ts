import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatInboxController } from './chat-inbox.controller';
import { ChatService } from './chat.service';
import { ExecutionsModule } from '../executions/executions.module';

@Module({
  imports: [ExecutionsModule],
  controllers: [ChatController, ChatInboxController],
  providers: [ChatService],
})
export class ChatModule {}
