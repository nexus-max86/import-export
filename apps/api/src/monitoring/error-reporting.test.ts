import type { ErrorEvent } from '@sentry/node';
import { scrub } from './error-reporting';

describe('alerte d’erreurs', () => {
  it('retire cookies, corps, utilisateur et adresses IP avant envoi', () => {
    const event = scrub({
      type: undefined,
      user: { id: 'u1', email: 'ruth@example.test' },
      request: {
        url: '/api/orders/x',
        cookies: { kz_session: 'secret' },
        data: '{"password":"x"}',
        query_string: 'jeton=abc',
        headers: {
          cookie: 'kz_session=secret',
          'x-forwarded-for': '1.2.3.4',
          'user-agent': 'Android',
        },
      },
    } as ErrorEvent);
    expect(event.user).toBeUndefined();
    expect(event.request).toEqual({ url: '/api/orders/x', headers: { 'user-agent': 'Android' } });
  });
});
