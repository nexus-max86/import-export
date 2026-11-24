import { PrismaClient } from '@konzia/db';
import { createTestApp, type TestContext } from './app';
import { actor, addMember, approveOrg, asOrg, createOrg, type Actor } from './fixtures';
import { sendQuote, sendRequest } from './quote-fixtures';

describe('Cycle de vie des commandes', () => {
  let t: TestContext;
  let ruth: Actor;
  let kaseba: Actor;
  let orgK: string;
  let slugK: string;
  let orderId: string;

  const setStatus = (status: string) =>
    t.prisma.$executeRawUnsafe(`UPDATE orders SET status = '${status}' WHERE id = '${orderId}'`);
  const move = (status: string, who = kaseba) =>
    who.agent.post(`/api/org/orders/${orderId}/status`, { status }).set(...asOrg(orgK));

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
    const r = await sendRequest(ruth, [slugK]);
    const q = await sendQuote(t, kaseba, orgK, r);
    orderId = (
      await ruth.agent
        .post(`/api/quotes/${q.quoteId}/accept`, { versionId: q.versionId })
        .expect(201)
    ).body.orderId;
  });
  afterAll(async () => {
    await t.app.close();
  });

  it('le commissionnaire fait avancer la commande, étape par étape, avec historique', async () => {
    await move('purchasing').expect(409); // règle d'achat par défaut : payée en totalité
    await setStatus('paid'); // le paiement arrive au ticket #18
    for (const s of [
      'purchasing',
      'purchased',
      'in_logistics',
      'in_transit',
      'at_distribution_point',
      'ready_for_handover',
    ]) {
      await move(s).expect(201);
    }
    // Décision D-1 : solde impayé (aucun paiement enregistré) → un motif est exigé pour terminer.
    const refused = await move('completed').expect(400);
    expect(refused.body.message).toMatch(/solde à payer/);
    await kaseba.agent
      .post(`/api/org/orders/${orderId}/status`, {
        status: 'completed',
        note: 'Client de confiance, paiera à la remise',
      })
      .set(...asOrg(orgK))
      .expect(201);
    // Le client peut encore déclarer son paiement sur la commande terminée.
    await ruth.agent
      .post(`/api/orders/${orderId}/payments`, {
        method: 'cash',
        amount: 1000,
        currency: 'USD',
        idempotencyKey: '00000000-0000-4000-8000-0000000000d1',
      })
      .expect(201);
    const o = await ruth.agent.get(`/api/orders/${orderId}`).expect(200);
    expect(o.body.status).toBe('completed');
    expect(o.body.events.map((e: { toStatus: string }) => e.toStatus).slice(-2)).toEqual([
      'ready_for_handover',
      'completed',
    ]);
  });

  it('refuse un saut d’étape, même en SQL direct', async () => {
    await setStatus('paid');
    await move('in_transit').expect(400);
    const appRole = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
    try {
      await expect(
        appRole.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.user_id', ${kaseba.userId}, true)`;
          return tx.$executeRaw`UPDATE orders SET status = 'completed' WHERE id = ${orderId}::uuid`;
        }),
      ).rejects.toThrow(/transition de commande interdite/);
    } finally {
      await appRole.$disconnect();
    }
  });

  it('un comptable ne fait pas avancer la commande ; un acheteur peut lancer l’achat', async () => {
    await setStatus('paid');
    const accountant = await actor(t, 'Comptable');
    await addMember(t, orgK, accountant.userId, 'accountant');
    await move('purchasing', accountant).expect(403);
  });

  it('annulation par le commissionnaire (motif obligatoire) ; pas après l’achat', async () => {
    await kaseba.agent
      .post(`/api/org/orders/${orderId}/cancel`, { reason: '' })
      .set(...asOrg(orgK))
      .expect(400);
    const res = await kaseba.agent
      .post(`/api/org/orders/${orderId}/cancel`, { reason: 'Article retiré de la vente' })
      .set(...asOrg(orgK))
      .expect(201);
    expect(res.body).toMatchObject({
      status: 'cancelled',
      cancelledReason: 'Article retiré de la vente',
    });
    expect(await t.prisma.auditLog.count({ where: { action: 'order.cancelled' } })).toBe(1);
  });

  it('le client annule seul tant que rien n’est payé', async () => {
    await setStatus('payment_to_verify');
    await ruth.agent
      .post(`/api/orders/${orderId}/cancel`, { reason: 'Je me suis trompée' })
      .expect(409);
    await setStatus('awaiting_payment');
    const res = await ruth.agent
      .post(`/api/orders/${orderId}/cancel`, { reason: 'Je me suis trompée' })
      .expect(201);
    expect(res.body.status).toBe('cancelled');
  });

  it('ajustement : sans accord du client, le montant ne change pas', async () => {
    const before = (await ruth.agent.get(`/api/orders/${orderId}`)).body.finalAmount as number;
    await kaseba.agent
      .post(`/api/org/orders/${orderId}/adjustments`, {
        amountDelta: 1250,
        reason: 'Douane plus élevée que prévu',
      })
      .set(...asOrg(orgK))
      .expect(201);
    await kaseba.agent
      .post(`/api/org/orders/${orderId}/adjustments`, { amountDelta: 100, reason: 'Autre' })
      .set(...asOrg(orgK))
      .expect(409);

    const pending = await ruth.agent.get(`/api/orders/${orderId}`);
    expect(pending.body.finalAmount).toBe(before);
    const adj = pending.body.adjustments[0];
    expect(adj).toMatchObject({ amountDelta: 1250, status: 'proposed' });

    // Le client avec compte répond lui-même : le commissionnaire ne peut pas le faire à sa place.
    await kaseba.agent
      .post(`/api/org/orders/${orderId}/adjustments/${adj.id}/decision`, {
        accepted: true,
        note: 'accord oral',
      })
      .set(...asOrg(orgK))
      .expect(409);
    const accepted = await ruth.agent
      .post(`/api/orders/${orderId}/adjustments/${adj.id}/decision`, { accepted: true })
      .expect(201);
    expect(accepted.body.finalAmount).toBe(before + 1250);
    expect(accepted.body.agreedTotalAmount).toBe(before);
    await ruth.agent
      .post(`/api/orders/${orderId}/adjustments/${adj.id}/decision`, { accepted: true })
      .expect(404);
  });

  it('un client refuse un ajustement ; un autre client ne peut rien décider', async () => {
    await kaseba.agent
      .post(`/api/org/orders/${orderId}/adjustments`, { amountDelta: -300, reason: 'Remise' })
      .set(...asOrg(orgK))
      .expect(201);
    const adj = (await ruth.agent.get(`/api/orders/${orderId}`)).body.adjustments[0];
    const intruder = await actor(t, 'Intrus');
    await intruder.agent
      .post(`/api/orders/${orderId}/adjustments/${adj.id}/decision`, { accepted: true })
      .expect(404);
    const res = await ruth.agent
      .post(`/api/orders/${orderId}/adjustments/${adj.id}/decision`, { accepted: false })
      .expect(201);
    expect(res.body.adjustments[0].status).toBe('rejected');
  });

  it('client géré : le commissionnaire enregistre son accord, puis ses réponses aux ajustements', async () => {
    const c = await kaseba.agent
      .post('/api/org/customers', { fullName: 'Patrick Mbuyi', phoneWhatsapp: '0812345678' })
      .set(...asOrg(orgK))
      .expect(201);
    const req = await kaseba.agent
      .post('/api/org/requests', {
        orgCustomerId: c.body.id,
        items: [{ source: 'manual', title: 'Chaussures de sécurité', quantity: 3 }],
      })
      .set(...asOrg(orgK))
      .expect(201);
    const q = await kaseba.agent
      .post(`/api/org/requests/${req.body.id}/quote`)
      .set(...asOrg(orgK))
      .expect(201);
    const itemId = q.body.current.lines[0].quoteRequestItemId;
    await kaseba.agent
      .put(`/api/org/quotes/${q.body.id}/draft`, {
        currency: 'USD',
        validUntil: new Date(Date.now() + 86_400_000).toISOString(),
        leadTimeMinDays: 7,
        leadTimeMaxDays: 10,
        lines: [
          {
            kind: 'product',
            quoteRequestItemId: itemId,
            description: 'Chaussures de sécurité',
            quantity: 3,
            unitAmount: 2500,
          },
        ],
      })
      .set(...asOrg(orgK))
      .expect(200);
    const sent = await kaseba.agent
      .post(`/api/org/quotes/${q.body.id}/send`)
      .set(...asOrg(orgK))
      .expect(201);
    await kaseba.agent
      .post(`/api/org/quotes/${q.body.id}/accept-for-customer`, {
        versionId: sent.body.current.id,
        note: '',
      })
      .set(...asOrg(orgK))
      .expect(400);
    const accepted = await kaseba.agent
      .post(`/api/org/quotes/${q.body.id}/accept-for-customer`, {
        versionId: sent.body.current.id,
        note: 'Accord par WhatsApp le 21/11',
      })
      .set(...asOrg(orgK))
      .expect(201);
    const managedOrder = accepted.body.orderId as string;
    const detail = await kaseba.agent
      .get(`/api/org/orders/${managedOrder}`)
      .set(...asOrg(orgK))
      .expect(200);
    expect(detail.body).toMatchObject({
      customerHasAccount: false,
      finalAmount: 7500,
      customerName: 'Patrick Mbuyi',
    });
    expect(detail.body.events[0].note).toBe(
      'Devis version 1 accepté · Accord par WhatsApp le 21/11',
    );

    await kaseba.agent
      .post(`/api/org/orders/${managedOrder}/adjustments`, {
        amountDelta: 500,
        reason: 'Emballage renforcé',
      })
      .set(...asOrg(orgK))
      .expect(201);
    const adjId = (await kaseba.agent.get(`/api/org/orders/${managedOrder}`).set(...asOrg(orgK)))
      .body.adjustments[0].id;
    const res = await kaseba.agent
      .post(`/api/org/orders/${managedOrder}/adjustments/${adjId}/decision`, {
        accepted: true,
        note: 'Accord par WhatsApp le 22/11',
      })
      .set(...asOrg(orgK))
      .expect(201);
    expect(res.body).toMatchObject({
      finalAmount: 8000,
      adjustments: [{ status: 'accepted', decisionNote: 'Accord par WhatsApp le 22/11' }],
    });
  });

  it('le commissionnaire ne peut pas accepter à la place d’un client qui a un compte', async () => {
    const r = await sendRequest(ruth, [slugK]);
    const q = await sendQuote(t, kaseba, orgK, r);
    await kaseba.agent
      .post(`/api/org/quotes/${q.quoteId}/accept-for-customer`, {
        versionId: q.versionId,
        note: 'Accord oral',
      })
      .set(...asOrg(orgK))
      .expect(409);
  });
});
