import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext } from './auth.types';

export const IS_PUBLIC = 'isPublic';
/** Route accessible sans session. Par défaut, toute route exige une session valide. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Contexte d'authentification de la requête (garanti présent hors routes @Public). */
export const Auth = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthContext => {
  const req = ctx.switchToHttp().getRequest<Request>();
  if (!req.auth) throw new Error('Contexte d’authentification absent sur une route protégée.');
  return req.auth;
});
