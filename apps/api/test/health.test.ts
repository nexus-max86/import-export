import request from 'supertest';
import { createTestApp, type TestContext } from './app';

describe('GET /api/health', () => {
  let t: TestContext;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.app.close();
  });

  it('répond 200 sans session quand la base et Redis sont joignables', async () => {
    const res = await request(t.app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', db: 'ok', redis: 'ok' });
  });

  it('ajoute les en-têtes de sécurité', async () => {
    const res = await request(t.app.getHttpServer()).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
