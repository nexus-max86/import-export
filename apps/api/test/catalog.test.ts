import request from 'supertest';
import { createTestApp, type TestContext } from './app';
import { actor } from './fixtures';

describe('Analyse de lien produit', () => {
  let t: TestContext;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await t.reset();
  });
  afterAll(async () => {
    await t.app.close();
  });

  it('reconnaît la marketplace et nettoie le lien', async () => {
    const ruth = await actor(t, 'Ruth');
    const res = await ruth.agent
      .post('/api/catalog/analyze', {
        url: 'https://m.shein.com/fr/Robe-p-123.html?utm_source=whatsapp',
      })
      .expect(200);
    expect(res.body).toEqual({
      ok: true,
      url: 'https://m.shein.com/fr/Robe-p-123.html',
      marketplace: 'shein',
      host: 'm.shein.com',
    });
  });

  it('refuse une adresse locale avec un message clair', async () => {
    const ruth = await actor(t, 'Ruth');
    const res = await ruth.agent
      .post('/api/catalog/analyze', { url: 'http://127.0.0.1:6379/' })
      .expect(200);
    expect(res.body).toEqual({ ok: false, reason: 'Seuls les liens https:// sont acceptés.' });
  });

  it('exige d’être connecté', async () => {
    await request(t.app.getHttpServer())
      .post('/api/catalog/analyze')
      .set('x-konzia-csrf', '1')
      .send({ url: 'https://shein.com' })
      .expect(401);
  });
});
