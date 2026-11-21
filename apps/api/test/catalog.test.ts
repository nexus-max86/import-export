import request from 'supertest';
import { createTestApp, type TestContext } from './app';
import { actor, PDF, PNG } from './fixtures';

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

  it('lit un lien SHEIN : prix indicatif, daté', async () => {
    const ruth = await actor(t, 'Ruth');
    const res = await ruth.agent
      .post('/api/catalog/lookup', { url: 'https://fr.shein.com/Robe-p-1.html?utm_source=wa' })
      .expect(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      marketplace: 'shein',
      url: 'https://fr.shein.com/Robe-p-1.html',
      price: { amount: 1499, currency: 'USD' },
    });
    expect(new Date(res.body.fetchedAt).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it('propose la saisie manuelle pour un site inconnu ou une page bloquée', async () => {
    const ruth = await actor(t, 'Ruth');
    const unknown = await ruth.agent
      .post('/api/catalog/lookup', { url: 'https://boutique.example.com/p/1' })
      .expect(200);
    expect(unknown.body).toMatchObject({ status: 'not_supported', marketplace: null });
    const blocked = await ruth.agent
      .post('/api/catalog/lookup', { url: 'https://www.temu.com/bloque.html' })
      .expect(200);
    expect(blocked.body.status).toBe('failed');
    expect(blocked.body.message).toMatch(/à la main|Indiquez/);
  });

  it('refuse de lire un lien dangereux', async () => {
    const ruth = await actor(t, 'Ruth');
    const res = await ruth.agent
      .post('/api/catalog/lookup', { url: 'https://169.254.169.254/latest' })
      .expect(400);
    expect(res.body.message).toMatch(/adresse IP/);
  });

  it('accepte une capture d’écran (image) et refuse un PDF', async () => {
    const ruth = await actor(t, 'Ruth');
    const ok = await ruth.agent
      .postFile('/api/catalog/screenshots', {}, PNG, 'capture.png')
      .expect(201);
    expect(ok.body.fileId).toMatch(/^[0-9a-f-]{36}$/);
    await ruth.agent.postFile('/api/catalog/screenshots', {}, PDF, 'capture.pdf').expect(400);
  });
});
