import { createTestApp, type TestContext } from './app';
import { actor, makeAdmin } from './fixtures';

describe('Taux de change', () => {
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

  it('l’administrateur publie un taux ; le plus récent est en vigueur ; l’historique est gardé', async () => {
    const admin = await makeAdmin(t, await actor(t, 'Admin'));
    await admin.agent
      .post('/api/admin/exchange-rates', {
        pair: 'USD_CDF',
        rate: '2 850',
        source: 'Marché de Lubumbashi',
      })
      .expect(201);
    await admin.agent
      .post('/api/admin/exchange-rates', {
        pair: 'USD_CDF',
        rate: '2860,5',
        source: 'Marché de Lubumbashi',
      })
      .expect(201);
    await admin.agent
      .post('/api/admin/exchange-rates', { pair: 'USD_CNY', rate: '7.12', source: 'Banque' })
      .expect(201);

    const current = await admin.agent.get('/api/exchange-rates/current').expect(200);
    expect(current.body.map((r: { pair: string; rate: string }) => `${r.pair}=${r.rate}`)).toEqual([
      'USD_CDF=2860.5',
      'USD_CNY=7.12',
    ]);
    const history = await admin.agent.get('/api/admin/exchange-rates').expect(200);
    expect(history.body).toHaveLength(3);
    expect(await t.prisma.auditLog.count({ where: { action: 'fx.rate_published' } })).toBe(3);
  });

  it('un taux publié ne peut être ni modifié ni supprimé', async () => {
    const admin = await makeAdmin(t, await actor(t, 'Admin'));
    await admin.agent
      .post('/api/admin/exchange-rates', { pair: 'USD_CDF', rate: '2850', source: 'BCC' })
      .expect(201);
    await expect(t.prisma.$executeRaw`UPDATE exchange_rates SET rate = 1`).rejects.toThrow(
      /insertion seule/,
    );
    await expect(t.prisma.$executeRaw`DELETE FROM exchange_rates`).rejects.toThrow(
      /insertion seule/,
    );
  });

  it('refuse un taux invalide et un utilisateur ordinaire', async () => {
    const admin = await makeAdmin(t, await actor(t, 'Admin'));
    await admin.agent
      .post('/api/admin/exchange-rates', { pair: 'USD_CDF', rate: '-1', source: 'BCC' })
      .expect(400);
    await admin.agent
      .post('/api/admin/exchange-rates', { pair: 'EUR_CDF', rate: '3000', source: 'BCC' })
      .expect(400);
    const user = await actor(t, 'Ruth');
    await user.agent
      .post('/api/admin/exchange-rates', { pair: 'USD_CDF', rate: '2850', source: 'BCC' })
      .expect(403);
  });
});
