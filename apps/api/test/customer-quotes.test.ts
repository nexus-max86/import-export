import { PrismaClient } from '@konzia/db';
import { createTestApp, type TestContext } from './app';
import { actor, approveOrg, asOrg, createOrg, type Actor } from './fixtures';
import { quoteDraft, sendQuote, sendRequest } from './quote-fixtures';

describe('Comparaison, acceptation et commande', () => {
  let t: TestContext;
  let ruth: Actor;
  let kaseba: Actor;
  let mwamba: Actor;
  let orgK: string;
  let orgM: string;
  let slugK: string;
  let slugM: string;

  beforeAll(async () => {
    t = await createTestApp();
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
    slugK = await approveOrg(t, orgK);
    mwamba = await actor(t, 'Mwamba');
    orgM = await createOrg(mwamba, 'Mwamba Express');
    slugM = await approveOrg(t, orgM);
  });
  afterAll(async () => {
    await t.app.close();
  });

  it('le client compare les devis envoyés, jamais les brouillons', async () => {
    const r = await sendRequest(ruth, [slugK, slugM]);
    const k = await sendQuote(t, kaseba, orgK, r);
    await mwamba.agent
      .post(`/api/org/requests/${r.id}/quote`)
      .set(...asOrg(orgM))
      .expect(201); // brouillon seulement
    await kaseba.agent
      .post(`/api/org/quotes/${k.quoteId}/revise`)
      .set(...asOrg(orgK))
      .expect(201); // v2 en préparation

    const res = await ruth.agent.get(`/api/requests/${r.id}/quotes`).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      organizationName: 'Kaseba Import',
      status: 'sent',
      current: { versionNo: 1, status: 'sent', totalAmount: 13568 },
    });
  });

  it('accepter crée une commande liée à la version exacte ; les commandes de commissionnaires différents restent séparées', async () => {
    const r = await sendRequest(ruth, [slugK, slugM]);
    const k = await sendQuote(t, kaseba, orgK, r);
    await sendQuote(t, mwamba, orgM, r, 'cheaper');

    const res = await ruth.agent
      .post(`/api/quotes/${k.quoteId}/accept`, { versionId: k.versionId })
      .expect(201);
    expect(res.body.number).toMatch(/^KZ-\d{4}-\d{6}$/);

    const order = await ruth.agent.get(`/api/orders/${res.body.orderId}`).expect(200);
    expect(order.body).toMatchObject({
      organizationName: 'Kaseba Import',
      status: 'awaiting_payment',
      paymentStatus: 'unpaid',
      agreedTotalAmount: 13568,
      finalAmount: 13568,
      quoteVersionNo: 1,
    });
    expect(
      order.body.items.map(
        (i: { description: string; quantity: number }) => `${i.description}×${i.quantity}`,
      ),
    ).toEqual(['Robe midi plissée, M×2', 'Écouteurs sans fil×5']);
    expect(order.body.events[0]).toMatchObject({ type: 'created', toStatus: 'awaiting_payment' });

    const proOrders = await kaseba.agent
      .get('/api/org/orders')
      .set(...asOrg(orgK))
      .expect(200);
    expect(proOrders.body.map((o: { number: string }) => o.number)).toEqual([res.body.number]);
    expect((await mwamba.agent.get('/api/org/orders').set(...asOrg(orgM))).body).toEqual([]);
    await mwamba.agent
      .get(`/api/org/orders/${res.body.orderId}`)
      .set(...asOrg(orgM))
      .expect(404);

    expect((await ruth.agent.get(`/api/requests/${r.id}`)).body.status).toBe('converted');
    // Le même devis ne peut pas créer une seconde commande.
    await ruth.agent
      .post(`/api/quotes/${k.quoteId}/accept`, { versionId: k.versionId })
      .expect(409);
  });

  it('refuse une version remplacée, un devis expiré et le devis d’un autre client', async () => {
    const r = await sendRequest(ruth, [slugK]);
    const k = await sendQuote(t, kaseba, orgK, r);
    await kaseba.agent
      .post(`/api/org/quotes/${k.quoteId}/revise`)
      .set(...asOrg(orgK))
      .expect(201);
    await kaseba.agent
      .put(`/api/org/quotes/${k.quoteId}/draft`, quoteDraft(r.items, 'cheaper'))
      .set(...asOrg(orgK))
      .expect(200);
    const v2 = await kaseba.agent
      .post(`/api/org/quotes/${k.quoteId}/send`)
      .set(...asOrg(orgK))
      .expect(201);
    await ruth.agent
      .post(`/api/quotes/${k.quoteId}/accept`, { versionId: k.versionId })
      .expect(409);

    const intruder = await actor(t, 'Intrus');
    await intruder.agent
      .post(`/api/quotes/${k.quoteId}/accept`, { versionId: v2.body.current.id })
      .expect(404);

    // Simule le passage du temps (le déclencheur interdit toute modification d'une version envoyée).
    await t.prisma.$executeRawUnsafe(
      'ALTER TABLE quote_versions DISABLE TRIGGER quote_versions_frozen',
    );
    await t.prisma.quoteVersion.update({
      where: { id: v2.body.current.id },
      data: { validUntil: new Date(Date.now() - 1000) },
    });
    await t.prisma.$executeRawUnsafe(
      'ALTER TABLE quote_versions ENABLE TRIGGER quote_versions_frozen',
    );
    await ruth.agent
      .post(`/api/quotes/${k.quoteId}/accept`, { versionId: v2.body.current.id })
      .expect(409);
    const list = await ruth.agent.get(`/api/requests/${r.id}/quotes`);
    expect(list.body[0]).toMatchObject({ status: 'expired' });
  });

  it('demande de correction puis nouvelle version ; refus d’un devis', async () => {
    const r = await sendRequest(ruth, [slugK, slugM]);
    const k = await sendQuote(t, kaseba, orgK, r);
    const m = await sendQuote(t, mwamba, orgM, r);

    await ruth.agent
      .post(`/api/quotes/${k.quoteId}/request-changes`, {
        message: 'Pouvez-vous passer en transport maritime ?',
      })
      .expect(204);
    const seen = await kaseba.agent.get(`/api/org/quotes/${k.quoteId}`).set(...asOrg(orgK));
    expect(seen.body).toMatchObject({
      status: 'changes_requested',
      changeRequest: 'Pouvez-vous passer en transport maritime ?',
    });
    await kaseba.agent
      .post(`/api/org/quotes/${k.quoteId}/revise`)
      .set(...asOrg(orgK))
      .expect(201);
    const sent = await kaseba.agent
      .post(`/api/org/quotes/${k.quoteId}/send`)
      .set(...asOrg(orgK))
      .expect(201);
    expect(sent.body).toMatchObject({
      status: 'sent',
      changeRequest: null,
      current: { versionNo: 2 },
    });

    await ruth.agent.post(`/api/quotes/${m.quoteId}/reject`, { reason: 'Trop cher' }).expect(204);
    await ruth.agent
      .post(`/api/quotes/${m.quoteId}/accept`, { versionId: m.versionId })
      .expect(409);
  });

  it('une commande ne peut jamais être supprimée', async () => {
    const r = await sendRequest(ruth, [slugK]);
    const k = await sendQuote(t, kaseba, orgK, r);
    const res = await ruth.agent
      .post(`/api/quotes/${k.quoteId}/accept`, { versionId: k.versionId })
      .expect(201);
    await expect(
      t.prisma.$executeRaw`DELETE FROM orders WHERE id = ${res.body.orderId}::uuid`,
    ).rejects.toThrow(/suppression interdite/);
    const appRole = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
    try {
      await expect(
        appRole.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.user_id', ${kaseba.userId}, true)`;
          return tx.$executeRaw`UPDATE orders SET final_amount = 1`;
        }),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await appRole.$disconnect();
    }
  });
});
