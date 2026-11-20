export interface AuthContext {
  userId: string;
  sessionId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Renseigné par AuthGuard quand le cookie de session est valide. */
      auth?: AuthContext;
    }
  }
}

export const SESSION_COOKIE = 'kz_session';
