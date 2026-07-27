import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { ChatService } from './chat.service';
import { PostMessageDto } from './dto/post-message.dto';
import { isChatRateLimited } from './chat-rate-limit';

/**
 * Inbox publica do operador — segundo link do fluxo de chat (inboxToken,
 * diferente do chatToken do visitante). Lista TODAS as conversas do fluxo e
 * permite responder manualmente, sem disparar o fluxo de novo.
 */
@Controller('public/chat-inbox/:inboxToken')
export class ChatInboxController {
  constructor(private readonly chat: ChatService) {}

  @Public()
  @Get('conversations')
  list(@Param('inboxToken') inboxToken: string) {
    return this.chat.listConversations(inboxToken);
  }

  @Public()
  @Get('conversations/:conversationId')
  getOne(
    @Param('inboxToken') inboxToken: string,
    @Param('conversationId') conversationId: string,
  ) {
    return this.chat.getConversation(inboxToken, conversationId);
  }

  @Public()
  @Post('conversations/:conversationId/messages')
  postMessage(
    @Param('inboxToken') inboxToken: string,
    @Param('conversationId') conversationId: string,
    @Body() dto: PostMessageDto,
    @Req() req: Request,
  ) {
    if (isChatRateLimited(req.ip ?? 'unknown')) {
      throw new HttpException(
        'Muitas mensagens em pouco tempo. Aguarde um instante.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return this.chat.postOperatorMessage(
      inboxToken,
      conversationId,
      dto.content,
    );
  }
}
