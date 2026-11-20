import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ForgotPasswordSchema,
  LoginSchema,
  RegisterSchema,
  ResetPasswordSchema,
  TokenSchema,
  type LoginInput,
  type MeResponse,
  type RegisterInput,
  type SessionInfo,
} from '@konzia/shared';
import type { Request, Response } from 'express';
import { Inject } from '@nestjs/common';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { RateLimitService } from '../common/rate-limit.service';
import { ZodBody } from '../common/zod-body.pipe';
import { AuthService } from './auth.service';
import { SESSION_COOKIE, type AuthContext } from './auth.types';
import { Auth, Public } from './decorators';
import { SessionService } from './session.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly rateLimit: RateLimitService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(201)
  async register(
    @Req() req: Request,
    @Body(new ZodBody(RegisterSchema)) body: RegisterInput,
  ): Promise<void> {
    await this.rateLimit.consume(`register:${req.ip}`, 10, 3600);
    await this.auth.register(body);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(204)
  async verifyEmail(@Body(new ZodBody(TokenSchema)) body: { token: string }): Promise<void> {
    await this.auth.verifyEmail(body.token);
  }

  @Post('verify-email/resend')
  @HttpCode(204)
  async resend(@Auth() auth: AuthContext): Promise<void> {
    await this.rateLimit.consume(`resend:${auth.userId}`, 3, 3600);
    await this.auth.resendVerification(auth.userId);
  }

  @Public()
  @Post('login')
  @HttpCode(204)
  async login(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodBody(LoginSchema)) body: LoginInput,
  ): Promise<void> {
    await this.rateLimit.consume(`login:ip:${req.ip}`, 30, 900);
    await this.rateLimit.consume(`login:email:${body.email}`, 10, 900);
    const { token, expiresAt } = await this.auth.login(body, req.get('user-agent'), req.ip);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: this.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Auth() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.sessions.revoke(auth.userId, auth.sessionId);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Post('logout-all')
  @HttpCode(204)
  async logoutAll(
    @Auth() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.sessions.revokeAll(auth.userId);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Public()
  @Post('password/forgot')
  @HttpCode(204)
  async forgot(
    @Req() req: Request,
    @Body(new ZodBody(ForgotPasswordSchema)) body: { email: string },
  ): Promise<void> {
    await this.rateLimit.consume(`forgot:ip:${req.ip}`, 10, 3600);
    await this.rateLimit.consume(`forgot:email:${body.email}`, 3, 3600);
    await this.auth.requestPasswordReset(body.email);
  }

  @Public()
  @Post('password/reset')
  @HttpCode(204)
  async reset(
    @Body(new ZodBody(ResetPasswordSchema)) body: { token: string; password: string },
  ): Promise<void> {
    await this.auth.resetPassword(body.token, body.password);
  }

  @Get('me')
  me(@Auth() auth: AuthContext): Promise<MeResponse> {
    return this.auth.me(auth.userId);
  }

  @Get('sessions')
  listSessions(@Auth() auth: AuthContext): Promise<SessionInfo[]> {
    return this.sessions.list(auth);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  async revokeSession(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    if (!(await this.sessions.revoke(auth.userId, id)))
      throw new NotFoundException('Session introuvable.');
  }
}
