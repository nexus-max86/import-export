import { ArgumentsHost, Catch, HttpException, type HttpServer } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import * as Sentry from '@sentry/node';
import type { Env } from '../config/env';

let enabled = false;

/**
 * Alerte d'erreurs (Sentry, offre gratuite). Inactive sans SENTRY_DSN : rien n'est envoyé.
 * Aucune donnée personnelle : ni cookies, ni corps de requête, ni utilisateur, ni adresse IP.
 */
export function initErrorReporting(env: Env): void {
  if (!env.SENTRY_DSN || enabled) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    defaultIntegrations: false,
    beforeSend(event) {
      return scrub(event);
    },
  });
  enabled = true;
}

/** Retire de l'événement tout ce qui pourrait identifier une personne. */
export function scrub<T extends Sentry.ErrorEvent>(event: T): T {
  delete event.user;
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
    if (event.request.headers) {
      for (const h of Object.keys(event.request.headers)) {
        if (/cookie|authorization|x-forwarded-for|x-real-ip/i.test(h))
          delete event.request.headers[h];
      }
    }
  }
  return event;
}

/** Signale les seules erreurs serveur (500) ; les erreurs de saisie (4xx) ne sont pas des incidents. */
@Catch()
export class ErrorReportingFilter extends BaseExceptionFilter {
  constructor(adapter: HttpServer) {
    super(adapter);
  }

  override catch(exception: unknown, host: ArgumentsHost): void {
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    if (enabled && status >= 500) {
      const req = host.switchToHttp().getRequest<{ method?: string; route?: { path?: string } }>();
      Sentry.withScope((scope) => {
        // La route générique (/api/orders/:id), jamais l'URL réelle avec ses identifiants.
        scope.setTag('route', `${req?.method ?? ''} ${req?.route?.path ?? 'inconnue'}`);
        Sentry.captureException(exception);
      });
    }
    super.catch(exception, host);
  }
}
