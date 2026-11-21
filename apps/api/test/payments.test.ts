import { PrismaClient } from '@konzia/db';
import { randomUUID } from 'node:crypto';
import { createTestApp, type TestContext } from './app';
import {
  actor,
  addMember,
  approveOrg,
  asOrg,
  createOrg,
  makeAdmin,
  PNG,
  type Actor,
} from './fixtures';
import { sendQuote, sendRequest } from './quote-fixtures';

describe('Paiements directs', () => {
  let t: TestContext;
  let ruth: Actor;
  let kaseba: Actor;
  let comptable: Actor;
  let orgK: string;
  let slugK: string;
  let orderId: string;
  const TOTAL = 13568; // total du devis des fixtures (USD)

  const declare = (over: Record<string, unknown> = {}) =>
    ruth.agent.post(`/api/orders/${orderId}/payments`, {
      method: 'mobile_money',
      provider: 'M-Pesa',
      amount: TOTAL,
      currency: 'USD',
      reference: 'MP241121.1042.K93811',
      idempotencyKey: randomUUID(),
      ...over,
    });
  const order = () => ruth.agent.get(`/api/orders/${orderId}`).then((r) => r.body);

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
    comptable = await actor(t, 'Comptable');
    await addMember(t, orgK, comptable.userId, 'accountant');
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

  it('le client voit les instructions de paiement de son commissionnaire', async () => {
    await kaseba.agent
      .put('/api/org/payment-instructions', {
        instructions: [
          {
            method: 'mobile_money',
            provider: 'M-Pesa',
            accountName: 'Kaseba Mukendi',
            accountNumber: '+243810000000',
          },
          { method: 'cash', accountName: 'Kaseba Import', details: 'Avenue Lumumba, 9h–17h' },
        ],
      })
      .set(...asOrg(orgK))
      .expect(200);
    const res = await ruth.agent.get(`/api/orders/${orderId}/payment-instructions`).expect(200);
    expect(res.body.organizationName).toBe('Kaseba Import');
    expect(res.body.instructions.map((i: { method: string }) => i.method)).toEqual([
      'mobile_money',
      'cash',
    ]);
  });

  it('un paiement déclaré reste « à vérifier » ; un renvoi après coupure ne crée pas de doublon', async () => {
    const key = randomUUID();
    const first = await declare({ idempotencyKey: key }).expect(201);
    const again = await declare({ idempotencyKey: key }).expect(201);
    expect(again.body.id).toBe(first.body.id);
    expect(first.body.status).toBe('pending_verification');
    expect(await t.prisma.payment.count({ where: { orderId } })).toBe(1);
    const o = await order();
    expect(o).toMatchObject({ status: 'payment_to_verify', paymentStatus: 'unpaid' });
  });

  it('confirmation par le comptable : auteur et date tracés, commande payée', async () => {
    const p = await declare().expect(201);
    await kaseba.agent
      .post(`/api/org/payments/${p.body.id}/confirm`)
      .set(...asOrg(orgK))
      .expect(201);
    const row = await t.prisma.payment.findUniqueOrThrow({ where: { id: p.body.id } });
    expect(row.confirmedBy).toBe(kaseba.userId);
    expect(row.confirmedAt).toBeInstanceOf(Date);
    expect(await order()).toMatchObject({ status: 'paid', paymentStatus: 'paid' });
    expect(await t.prisma.auditLog.count({ where: { action: 'payment.confirmed' } })).toBe(1);
  });

  it('un acompte laisse la commande partiellement payée ; le solde la paie', async () => {
    const deposit = await declare({ amount: 5000 }).expect(201);
    await comptable.agent
      .post(`/api/org/payments/${deposit.body.id}/confirm`)
      .set(...asOrg(orgK))
      .expect(201);
    expect(await order()).toMatchObject({
      status: 'awaiting_payment',
      paymentStatus: 'partially_paid',
    });
    const rest = await declare({ amount: TOTAL - 5000 }).expect(201);
    await comptable.agent
      .post(`/api/org/payments/${rest.body.id}/confirm`)
      .set(...asOrg(orgK))
      .expect(201);
    expect(await order()).toMatchObject({ status: 'paid', paymentStatus: 'paid' });
  });

  it('un refus exige un motif et remet la commande en attente de paiement', async () => {
    const p = await declare().expect(201);
    await comptable.agent
      .post(`/api/org/payments/${p.body.id}/reject`, { reason: '' })
      .set(...asOrg(orgK))
      .expect(400);
    const res = await comptable.agent
      .post(`/api/org/payments/${p.body.id}/reject`, {
        reason: 'Référence introuvable sur notre relevé M-Pesa',
      })
      .set(...asOrg(orgK))
      .expect(201);
    expect(res.body).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Référence introuvable sur notre relevé M-Pesa',
    });
    expect(await order()).toMatchObject({ status: 'awaiting_payment', paymentStatus: 'unpaid' });
    await comptable.agent
      .post(`/api/org/payments/${p.body.id}/confirm`)
      .set(...asOrg(orgK))
      .expect(409);
  });

  it('un commercial ne confirme pas ; un autre commissionnaire ne voit rien', async () => {
    const p = await declare().expect(201);
    const sales = await actor(t, 'Commercial');
    await addMember(t, orgK, sales.userId, 'sales');
    await sales.agent
      .post(`/api/org/payments/${p.body.id}/confirm`)
      .set(...asOrg(orgK))
      .expect(403);
    const other = await actor(t, 'Autre');
    const orgO = await createOrg(other, 'Autre Import');
    await other.agent
      .post(`/api/org/payments/${p.body.id}/confirm`)
      .set(...asOrg(orgO))
      .expect(404);
    expect((await other.agent.get('/api/org/payments').set(...asOrg(orgO))).body).toEqual([]);
  });

  it('paiement en francs congolais converti au taux en vigueur, taux conservé', async () => {
    const admin = await makeAdmin(t, await actor(t, 'Admin'));
    await admin.agent
      .post('/api/admin/exchange-rates', { pair: 'USD_CDF', rate: '2850', source: 'BCC' })
      .expect(201);
    const p = await declare({ amount: TOTAL * 2850, currency: 'CDF' }).expect(201);
    expect(p.body).toMatchObject({
      currency: 'CDF',
      orderAmount: TOTAL,
      orderCurrency: 'USD',
      fxRate: '2850',
    });
    await comptable.agent
      .post(`/api/org/payments/${p.body.id}/confirm`)
      .set(...asOrg(orgK))
      .expect(201);
    expect((await order()).paymentStatus).toBe('paid');
  });

  it('un paiement confirmé ne peut plus être modifié ni supprimé, même par le rôle propriétaire', async () => {
    const p = await declare().expect(201);
    await comptable.agent
      .post(`/api/org/payments/${p.body.id}/confirm`)
      .set(...asOrg(orgK))
      .expect(201);
    await expect(
      t.prisma.$executeRaw`UPDATE payments SET note = 'x' WHERE id = ${p.body.id}::uuid`,
    ).rejects.toThrow(/paiement clos/);
    await expect(t.prisma.$executeRaw`DELETE FROM payments`).rejects.toThrow(
      /suppression interdite/,
    );
    const appRole = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
    try {
      await expect(
        appRole.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.user_id', ${kaseba.userId}, true)`;
          return tx.$executeRaw`UPDATE payments SET status = 'confirmed'`;
        }),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await appRole.$disconnect();
    }
  });

  it('paiement reçu hors application puis remboursement distinct', async () => {
    const cash = await comptable.agent
      .post(`/api/org/orders/${orderId}/payments`, {
        method: 'cash',
        amount: TOTAL,
        currency: 'USD',
        note: 'Payé en boutique',
        idempotencyKey: randomUUID(),
      })
      .set(...asOrg(orgK))
      .expect(201);
    expect(cash.body).toMatchObject({ status: 'confirmed', declaredByCustomer: false });
    expect((await order()).paymentStatus).toBe('paid');

    await comptable.agent
      .post(`/api/org/orders/${orderId}/refunds`, {
        method: 'cash',
        amount: TOTAL + 1,
        currency: 'USD',
        note: 'Trop',
        idempotencyKey: randomUUID(),
      })
      .set(...asOrg(orgK))
      .expect(400);
    const refund = await comptable.agent
      .post(`/api/org/orders/${orderId}/refunds`, {
        method: 'mobile_money',
        provider: 'M-Pesa',
        amount: 2000,
        currency: 'USD',
        note: 'Article manquant',
        idempotencyKey: randomUUID(),
      })
      .set(...asOrg(orgK))
      .expect(201);
    expect(refund.body.kind).toBe('refund');
    expect((await order()).paymentStatus).toBe('partially_refunded');
    const history = await ruth.agent.get(`/api/orders/${orderId}/payments`).expect(200);
    expect(
      history.body.map((p: { kind: string; status: string }) => `${p.kind}:${p.status}`),
    ).toEqual(['payment:confirmed', 'refund:confirmed']);
  });

  it('« qui doit combien » : solde par client', async () => {
    const p = await declare({ amount: 4000 }).expect(201);
    await comptable.agent
      .post(`/api/org/payments/${p.body.id}/confirm`)
      .set(...asOrg(orgK))
      .expect(201);
    await declare({ amount: 1000 }).expect(201); // en attente
    const res = await comptable.agent
      .get('/api/org/balances')
      .set(...asOrg(orgK))
      .expect(200);
    expect(res.body).toEqual([
      expect.objectContaining({
        customerName: 'Ruth Kabeya',
        currency: 'USD',
        due: TOTAL,
        paid: 4000,
        outstanding: TOTAL - 4000,
        pendingVerification: 1000,
      }),
    ]);
  });

  it('preuve de paiement : lisible par le commissionnaire, jamais par un autre', async () => {
    const proof = await ruth.agent
      .postFile('/api/payments/proofs', {}, PNG, 'capture-mpesa.png')
      .expect(201);
    const p = await declare({ proofFileId: proof.body.fileId }).expect(201);
    expect(p.body.hasProof).toBe(true);
    const dl = await comptable.agent
      .get(`/api/org/payments/${p.body.id}/proof`)
      .set(...asOrg(orgK))
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(Buffer.compare(dl.body as Buffer, PNG)).toBe(0);
    const intruder = await actor(t, 'Intrus');
    const proofOther = await intruder.agent
      .postFile('/api/payments/proofs', {}, PNG, 'x.png')
      .expect(201);
    await declare({ proofFileId: proofOther.body.fileId }).expect(400);
  });

  it('le client annule une déclaration encore à vérifier', async () => {
    const p = await declare().expect(201);
    const res = await ruth.agent.post(`/api/payments/${p.body.id}/cancel`).expect(201);
    expect(res.body.status).toBe('cancelled');
    expect((await order()).status).toBe('awaiting_payment');
  });
});
