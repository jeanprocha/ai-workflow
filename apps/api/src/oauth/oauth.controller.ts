import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceGuard } from '../workspaces/guards/workspace.guard';
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';
import { OAuthService } from './oauth.service';
import { StartOAuthDto } from './dto/start-oauth.dto';
import { isOAuthCallbackRateLimited } from './oauth-rate-limit';

@Controller('oauth')
export class OAuthController {
  constructor(private readonly oauth: OAuthService) {}

  @Get('providers')
  listProviders() {
    return this.oauth.listProviders();
  }

  @Post(':provider/start')
  @UseGuards(WorkspaceGuard)
  start(
    @CurrentWorkspace() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('provider') provider: string,
    @Body() dto: StartOAuthDto,
  ) {
    return this.oauth.start(workspaceId, user.userId, provider, dto.name);
  }

  /**
   * Publico — chega direto do redirect do provedor, sem JWT. O state (nao
   * o guard) e quem prova a que workspace/usuario isto pertence.
   */
  @Public()
  @Get('callback')
  async callback(
    @Query() query: Record<string, string>,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (isOAuthCallbackRateLimited(req.ip ?? 'unknown')) {
      throw new HttpException(
        'Muitas tentativas em pouco tempo. Aguarde um instante.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const redirectUrl = await this.oauth.handleCallback(query);
    res.redirect(redirectUrl);
  }
}
