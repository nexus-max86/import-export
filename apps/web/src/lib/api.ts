import { CSRF_HEADER, CSRF_HEADER_VALUE, ORG_HEADER } from '@konzia/shared';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

const NETWORK_MESSAGE = 'Connexion impossible. Vérifiez votre réseau et réessayez.';

/** Appel à l'API Konzia (même origine). Ajoute l'en-tête CSRF sur les écritures. */
export async function api<T = void>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    /** Organisation au nom de laquelle on agit (espace professionnel). */
    org?: string;
  } = {},
): Promise<T> {
  const method = options.method ?? (options.body === undefined ? 'GET' : 'POST');
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        ...(method === 'GET' ? {} : { [CSRF_HEADER]: CSRF_HEADER_VALUE }),
        ...(options.org ? { [ORG_HEADER]: options.org } : {}),
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(NETWORK_MESSAGE, 0);
  }
  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const body = (data ?? {}) as { message?: unknown; fields?: Record<string, string> };
    const message =
      typeof body.message === 'string' ? body.message : 'Une erreur est survenue. Réessayez.';
    throw new ApiError(message, res.status, body.fields ?? {});
  }
  return data as T;
}

/** Transforme les erreurs Zod d'un formulaire en messages par champ. */
export function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  return Object.fromEntries(issues.map((i) => [i.path.join('.'), i.message]));
}

/** Chemin interne sûr pour une redirection après connexion (jamais vers un autre site). */
export function safeNext(value: string | null): string | null {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : null;
}
