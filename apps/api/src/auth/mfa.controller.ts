import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import { ZodBody } from '../common/zod-body.pipe';
import type { AuthContext } from './auth.types';
import { Auth } from './decorators';
import { MfaService } from './mfa.service';

const CodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Code à 6 chiffres.'),
});

@Controller('auth/mfa')
export class MfaController {
  constructor(private readonly mfa: MfaService) {}

  @Get()
  status(@Auth() auth: AuthContext) {
    return this.mfa.status(auth.userId, auth.sessionId);
  }

  @Post('setup')
  setup(@Auth() auth: AuthContext) {
    return this.mfa.setup(auth.userId);
  }

  @Post('enable')
  @HttpCode(204)
  enable(@Auth() auth: AuthContext, @Body(new ZodBody(CodeSchema)) body: { code: string }) {
    return this.mfa.enable(auth.userId, auth.sessionId, body.code);
  }

  @Post('verify')
  @HttpCode(204)
  verify(@Auth() auth: AuthContext, @Body(new ZodBody(CodeSchema)) body: { code: string }) {
    return this.mfa.verify(auth.userId, auth.sessionId, body.code);
  }
}
