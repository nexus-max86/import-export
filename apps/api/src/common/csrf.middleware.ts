import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from '@konzia/shared';
import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Exige un en-tête personnalisé sur toute requête d'écriture. Un site tiers ne peut pas
 * l'ajouter sans requête CORS préalable, refusée (une seule origine). Complète SameSite=Lax.
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    if (!SAFE_METHODS.has(req.method) && req.get(CSRF_HEADER) !== CSRF_HEADER_VALUE) {
      throw new ForbiddenException('Requête refusée (protection CSRF).');
    }
    next();
  }
}
