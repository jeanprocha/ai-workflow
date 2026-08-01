import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { ApprovalsService } from './approvals.service';
import { DecidePublicApprovalDto } from './dto/decide-public-approval.dto';
import { isApprovalRateLimited } from './approval-rate-limit';

function assertNotRateLimited(req: Request) {
  if (isApprovalRateLimited(req.ip ?? 'unknown')) {
    throw new HttpException(
      'Muitas tentativas em pouco tempo. Aguarde um instante.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/**
 * Pagina publica de decisao (H2-06, C3 consome isto): sem conta, o token de
 * 32 bytes na URL e a unica prova de posse. GET so LE estado (nunca decide —
 * scanner de link de e-mail/preview que bate o GET em loop nao pode aprovar
 * nada sozinho); a decisao em si e sempre POST.
 */
@Controller('approve/:token')
export class ApprovePublicController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Public()
  @Get()
  status(@Param('token') token: string, @Req() req: Request) {
    assertNotRateLimited(req);
    return this.approvals.findByToken(token);
  }

  /**
   * Mensagem unica pra qualquer recusa (token invalido, ja decidido ou
   * expirado) — mesmo principio do FlowApiKeyGuard: diferenciar os casos
   * aqui nao ajuda ninguem a agir diferente, e so aumenta a superficie de
   * observacao. O GET (acima) e quem informa o estado real pra pagina
   * decidir o que mostrar ANTES do usuario clicar em decidir.
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('decide')
  async decide(
    @Param('token') token: string,
    @Body() dto: DecidePublicApprovalDto,
    @Req() req: Request,
  ) {
    assertNotRateLimited(req);
    try {
      await this.approvals.decideByToken(token, dto.decision, dto.comment);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException) {
        throw new ConflictException(
          'Este link de aprovacao e invalido, ja foi decidido ou expirou.',
        );
      }
      throw error;
    }
  }
}
