import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '7d';
const SALT_ROUNDS = 12;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mailer: MailerService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Ja existe uma conta com este email.');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const user = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: { email: dto.email, name: dto.name, passwordHash },
      });
      const workspace = await tx.workspace.create({
        data: { name: `Workspace de ${dto.name}` },
      });
      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: createdUser.id,
          role: 'owner',
        },
      });
      return createdUser;
    });

    return this.issueTokens(user.id, user.email);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw new UnauthorizedException('Email ou senha invalidos.');
    }
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Email ou senha invalidos.');
    }
    return this.issueTokens(user.id, user.email);
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        email: string;
      }>(refreshToken, {
        secret: this.refreshSecret,
      });
      return this.issueTokens(payload.sub, payload.email);
    } catch {
      throw new UnauthorizedException('Refresh token invalido ou expirado.');
    }
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuario nao encontrado.');
    }
    return { id: user.id, email: user.email, name: user.name };
  }

  /**
   * H1.5: sempre resolve, exista ou nao o email — nao vaza pro cliente qual
   * conta existe. Token bruto so vive no link enviado; o banco guarda so o
   * hash (sha256), pra um dump nunca dar reset de senha de graca.
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    const resetUrl = `${this.webUrl}/reset-password?token=${rawToken}`;
    await this.mailer.send({
      to: user.email,
      subject: 'Redefinir sua senha',
      html:
        `<p>Ola, ${user.name}.</p>` +
        `<p>Clique no link abaixo para redefinir sua senha (valido por 30 minutos):</p>` +
        `<p><a href="${resetUrl}">${resetUrl}</a></p>` +
        `<p>Se voce nao pediu isso, ignore este email.</p>`,
      text: `Redefina sua senha em: ${resetUrl} (valido por 30 minutos)`,
    });
  }

  /**
   * Token de uso unico: alem de marcar ESTE token como usado, invalida os
   * demais tokens ainda validos do mesmo usuario (pedir reset 2x e so o
   * segundo link deveria funcionar). Refresh tokens (JWT stateless) NAO sao
   * revogados por um reset de senha — limitacao conhecida, documentada em
   * docs/deploy/railway.md; revogacao de sessao fica pro RBAC (H3).
   */
  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new BadRequestException('Token invalido ou expirado.');
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: now },
      }),
      this.prisma.passwordResetToken.updateMany({
        where: {
          userId: resetToken.userId,
          usedAt: null,
          id: { not: resetToken.id },
        },
        data: { usedAt: now },
      }),
    ]);
  }

  private get webUrl(): string {
    return process.env.WEB_URL ?? 'http://localhost:3000';
  }

  private get refreshSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET nao configurado.');
    }
    return `${secret}.refresh`;
  }

  private async issueTokens(userId: string, email: string): Promise<TokenPair> {
    const payload = { sub: userId, email };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, { expiresIn: ACCESS_TOKEN_TTL }),
      this.jwt.signAsync(payload, {
        secret: this.refreshSecret,
        expiresIn: REFRESH_TOKEN_TTL,
      }),
    ]);
    return { accessToken, refreshToken };
  }
}
