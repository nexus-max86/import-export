import { createTestApp, type TestContext } from './app';
import { actor, addMember, approveOrg, asOrg, createOrg, type Actor } from './fixtures';
import { sendQuote, sendRequest } from './quote-fixtures';

/** Vue générale Business : chiffres tirés des données réelles, montants réservés aux rôles habilités. */
describe('Vue générale Business', () => {
  let t: TestContext;
  let ruth: Actor;
  let kaseba: Actor;
  let orgK: string;
  let orderId: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(async () => {
    await t.reset();
    ruth = await actor(t, 'Ruth');
    const lub = await t.prisma.city.findUniqueOrThrow({ where: { name: 'Lubumbashi' } });
    await ruth.agent
      .put('/api/me/profile', { displayName: 'Ruth Kabeya', cityId: lub.id })
      .expect(200);
    kaseba = await actor(t, 'Kaseba');
    orgK = await createOrg(kaseba, 'Kaseba Import');
    const slugK = await approveOrg(t, orgK);
    await sendRequest(ruth, [slugK]); // une demande encore à traiter
    const r = await sendRequest(ruth, [slugK]);
    const q = await sendQuote(t, kaseba, orgK, r);
    orderId = (
      await ruth.agent
        .post(`/api/quotes/${q.quoteId}/accept`, { versionId: q.versionId })
        .expect(201)
    ).body.orderId;
  });

  it('compte demandes, commandes et soldes ; la série couvre 8 semaines', async () => {
    const o = await kaseba.agent
      .get('/api/org/overview')
      .set(...asOrg(orgK))
      .expect(200);
    expect(o.body.requestsToHandle).toBe(1);
    expect(o.body.activeOrders).toBe(1);
    expect(o.body.ordersPerWeek).toHaveLength(8);
    expect(o.body.ordersPerWeek.at(-1).count).toBe(1);
    expect(o.body.finance.paymentsToVerify).toBe(0);
    expect(o.body.finance.owed).toEqual([{ currency: 'USD', amount: expect.any(Number) }]);
    expect(o.body.finance.owed[0].amount).toBeGreaterThan(0);
  });

  it('signale une commande dont le délai annoncé est dépassé (alerte à règle)', async () => {
    await t.prisma.$executeRawUnsafe(
      `UPDATE orders SET created_at = now() - interval '90 days' WHERE id = '${orderId}'`,
    );
    const o = await kaseba.agent
      .get('/api/org/overview')
      .set(...asOrg(orgK))
      .expect(200);
    expect(o.body.lateOrders).toBe(1);
    expect(o.body.alerts[0]).toMatchObject({
      kind: 'late_order',
      href: `/pro/commandes/${orderId}`,
    });
  });

  it('un acheteur voit les opérations, jamais les montants ; un étranger rien', async () => {
    const buyer = await actor(t, 'Acheteur');
    await addMember(t, orgK, buyer.userId, 'buyer');
    const o = await buyer.agent
      .get('/api/org/overview')
      .set(...asOrg(orgK))
      .expect(200);
    expect(o.body.activeOrders).toBe(1);
    expect(o.body.finance).toBeNull();
    const stranger = await actor(t, 'Inconnu');
    await stranger.agent
      .get('/api/org/overview')
      .set(...asOrg(orgK))
      .expect(403);
  });
});
