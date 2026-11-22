import { loadEnv } from './env';

const valid = {
  APP_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  APP_DATABASE_URL: 'postgresql://a:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  HASH_SALT: 'x'.repeat(32),
  FILES_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
};

describe('loadEnv', () => {
  it('un SENTRY_DSN vide laisse l’alerte d’erreurs inactive ; une valeur invalide est refusée', () => {
    expect(loadEnv({ ...valid, SENTRY_DSN: '' }).SENTRY_DSN).toBeUndefined();
    expect(() => loadEnv({ ...valid, SENTRY_DSN: 'pas-une-url' })).toThrow(/SENTRY_DSN/);
  });
  it('applique les valeurs par défaut', () => {
    expect(loadEnv(valid)).toMatchObject({ API_PORT: 3001, NODE_ENV: 'development' });
  });
  it('refuse de démarrer sans DATABASE_URL', () => {
    expect(() => loadEnv({ ...valid, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });
  it("refuse l'envoi factice d'e-mails en production", () => {
    expect(() => loadEnv({ ...valid, NODE_ENV: 'production' })).toThrow(/EMAIL_TRANSPORT/);
  });
  it('refuse le stockage local en production', () => {
    expect(() =>
      loadEnv({ ...valid, NODE_ENV: 'production', EMAIL_TRANSPORT: 'smtp', SMTP_URL: 'smtp://x' }),
    ).toThrow(/FILE_STORAGE/);
  });
  it('refuse une clé de chiffrement de mauvaise taille', () => {
    expect(() => loadEnv({ ...valid, FILES_ENCRYPTION_KEY: 'court' })).toThrow(
      /FILES_ENCRYPTION_KEY/,
    );
  });
  it('exige SMTP_URL avec le transport SMTP', () => {
    expect(() => loadEnv({ ...valid, EMAIL_TRANSPORT: 'smtp' })).toThrow(/SMTP_URL/);
  });
});
