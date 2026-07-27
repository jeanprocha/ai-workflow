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

function assertNotRateLimited(req: Request) {
  if (isChatRateLimited(req.ip ?? 'unknown')) {
    throw new HttpException(
      'Muitas mensagens em pouco tempo. Aguarde um instante.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/** Chat publico do visitante — sem autenticacao, identificado pelo chatToken do node trigger.chat. */
@Controller('public/chat/:chatToken')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Public()
  @Post('conversations')
  createConversation(
    @Param('chatToken') chatToken: string,
    @Req() req: Request,
  ) {
    assertNotRateLimited(req);
    return this.chat.createConversation(chatToken);
  }

  @Public()
  @Post('conversations/:conversationId/messages')
  postMessage(
    @Param('chatToken') chatToken: string,
    @Param('conversationId') conversationId: string,
    @Body() dto: PostMessageDto,
    @Req() req: Request,
  ) {
    assertNotRateLimited(req);
    return this.chat.postVisitorMessage(chatToken, conversationId, dto.content);
  }

  // Sem rate limit: e o polling de leitura (a cada ~2.5s), nao dispara execucao.
  @Public()
  @Get('conversations/:conversationId/messages')
  listMessages(
    @Param('chatToken') chatToken: string,
    @Param('conversationId') conversationId: string,
  ) {
    return this.chat.listMessages(chatToken, conversationId);
  }
}
