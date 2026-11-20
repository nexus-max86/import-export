import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './app';

describe('GET /api/health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('répond 200 quand la base et Redis sont joignables', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', db: 'ok', redis: 'ok' });
  });

  it('ajoute les en-têtes de sécurité', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
