import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Public } from './decorators/public.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from './decorators/current-user.decorator';

// H1.1: limite bem mais apertado que o default global (app.module.ts) —
// login/register/refresh sao os alvos naturais de forca bruta/credential
// stuffing. Mesma janela do default (THROTTLE_TTL_MS), limite proprio.
const AUTH_THROTTLE = {
  default: {
    limit: Number(
      process.env.THROTTLE_AUTH_LIMIT ??
        (process.env.NODE_ENV === 'production' ? 5 : 1000),
    ),
    ttl: Number(process.env.THROTTLE_TTL_MS ?? 60_000),
  },
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user.userId);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  // Sempre 200 (mesmo mensagem de "conta nao existe" seria oraculo de
  // enumeracao de email) — a UI do web mostra sua propria copy de sucesso
  // (i18n local), independente do corpo desta resposta.
  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.password);
  }
}
