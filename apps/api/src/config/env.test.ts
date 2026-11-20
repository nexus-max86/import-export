import { loadEnv } from './env';

const valid = {
  APP_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  HASH_SALT: 'x'.repeat(32),
};

describe('loadEnv', () => {
  it('applique les valeurs par défaut', () => {
    expect(loadEnv(valid)).toMatchObject({ API_PORT: 3001, NODE_ENV: 'development' });
  });
  it('refuse de démarrer sans DATABASE_URL', () => {
    expect(() => loadEnv({ ...valid, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });
  it("refuse l'envoi factice d'e-mails en production", () => {
    expect(() => loadEnv({ ...valid, NODE_ENV: 'production' })).toThrow(/EMAIL_TRANSPORT/);
  });
  it('exige SMTP_URL avec le transport SMTP', () => {
    expect(() => loadEnv({ ...valid, EMAIL_TRANSPORT: 'smtp' })).toThrow(/SMTP_URL/);
  });
});
