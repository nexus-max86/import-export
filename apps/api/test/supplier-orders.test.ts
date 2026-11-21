import { PrismaClient } from '@konzia/db';
import { randomUUID } from 'node:crypto';
import { createTestApp, type TestContext } from './app';
import { actor, addMember, approveOrg, asOrg, createOrg, PDF, type Actor } from './fixtures';
import { sendQuote, sendRequest } from './quote-fixtures';

/** Achats fournisseurs et règle d'achat (ticket #19, retour terrain R3). */
describe('Achats fournisseurs', () => {
  let t: TestContext;
  let appRole: PrismaClient;
  let ruth: Actor;
  let kaseba: Actor;
  let acheteur: Actor;
  let vendeuse: Actor;
  let comptable: Actor;
  let orgK: string;
  let slugK: string;
  let orderId: string;
  let robe: string; // article × 2
  let ecouteurs: string; // article × 5
  const TOTAL = 13568;

  const asK = <T extends { set: (k: string, v: string) => T }>(req: T) => req.set(...asOrg(orgK));

  async function acceptedOrder(customer: Actor) {
    const r = await sendRequest(customer, [slugK]);
    const q = await sendQuote(t, kaseba, orgK, r);
    const id = (
      await customer.agent
        .post(`/api/quotes/${q.quoteId}/accept`, { versionId: q.versionId })
        .expect(201)
    ).body.orderId as string;
    const detail = await asK(kaseba.agent.get(`/api/org/orders/${id}`)).expect(200);
    return { id, items: detail.body.items as { id: string; quantity: number }[] };
  }

  const purchase = (who: Actor, items: { orderItemId: string; quantity: number }[], over = {}) =>
    asK(
      who.agent.post('/api/org/supplier-orders', {
        marketplace: 'shein',
        storeName: 'SHEIN',
        externalRef: 'GSH24112100123',
        purchasedAt: new Date().toISOString(),
        amount: 21000,
        currency: 'CNY',
        conversionFeeAmount: 150,
        items,
        ...over,
      }),
    );

  const pay = (amount: number) =>
    asK(
      kaseba.agent.post(`/api/org/orders/${orderId}/payments`, {
        method: 'cash',
        amount,
        currency: 'USD',
        idempotencyKey: randomUUID(),
      }),
    ).expect(201);

  const orgOrder = async () => (await asK(kaseba.agent.get(`/api/org/orders/${orderId}`))).body;

  beforeAll(async () => {
    t = await createTestApp();
    appRole = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
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
    acheteur = await actor(t, 'Acheteur');
    await addMember(t, orgK, acheteur.userId, 'buyer');
    vendeuse = await actor(t, 'Vendeuse');
    await addMember(t, orgK, vendeuse.userId, 'sales');
    comptable = await actor(t, 'Comptable');
    await addMember(t, orgK, comptable.userId, 'accountant');
    const o = await acceptedOrder(ruth);
    orderId = o.id;
    robe = o.items[0]!.id;
    ecouteurs = o.items[1]!.id;
  });
  afterAll(async () => {
    await appRole.$disconnect();
    await t.app.close();
  });

  describe('règle d’achat', () => {
    it('par défaut, l’achat attend le paiement complet', async () => {
      expect((await orgOrder()).purchaseRule).toBe('full_payment');
      const res = await purchase(acheteur, [{ orderItemId: robe, quantity: 2 }]).expect(409);
      expect(res.body.message).toMatch(/payée en totalité/);
      await asK(
        kaseba.agent.post(`/api/org/orders/${orderId}/status`, { status: 'purchasing' }),
      ).expect(409);
      await pay(TOTAL);
      await purchase(acheteur, [{ orderItemId: robe, quantity: 2 }]).expect(201);
    });

    it('acompte : l’achat démarre dès que le pourcentage convenu est confirmé', async () => {
      await asK(
        vendeuse.agent.put(`/api/org/orders/${orderId}/purchase-rule`, {
          rule: 'deposit',
          depositBps: 5000,
        }),
      ).expect(200);
      await pay(6000); // < 50 % de 135,68 $
      const refused = await purchase(acheteur, [{ orderItemId: robe, quantity: 1 }]).expect(409);
      expect(refused.body.message).toMatch(/acompte de 50 %/);
      await pay(784); // 67,84 $ = 50 % exactement
      await purchase(acheteur, [{ orderItemId: robe, quantity: 1 }]).expect(201);
      const order = await orgOrder();
      expect(order.status).toBe('partially_purchased');
      expect(order.paymentStatus).toBe('partially_paid');
      // Les paiements suivants ne font plus reculer l'état de la commande.
      await pay(TOTAL - 6784);
      expect((await orgOrder()).status).toBe('partially_purchased');
    });

    it('fonds propres : achat possible sans paiement, choix tracé dans l’historique et l’audit', async () => {
      await asK(
        kaseba.agent.put(`/api/org/orders/${orderId}/purchase-rule`, { rule: 'own_funds' }),
      ).expect(200);
      await asK(
        kaseba.agent.post(`/api/org/orders/${orderId}/status`, { status: 'purchasing' }),
      ).expect(201);
      const order = await orgOrder();
      expect(order.status).toBe('purchasing');
      expect(order.events.map((e: { type: string }) => e.type)).toContain('purchase_rule_changed');
      const audit = await t.prisma.auditLog.findFirst({
        where: { action: 'order.purchase_rule_changed', entityId: orderId },
      });
      expect(audit?.after).toEqual({ rule: 'own_funds', depositBps: null });
      const seen = await ruth.agent.get(`/api/orders/${orderId}`).expect(200);
      expect(seen.body.events.map((e: { type: string }) => e.type)).not.toContain(
        'purchase_rule_changed',
      );
      // Une fois l'achat commencé, la règle est figée.
      await asK(
        kaseba.agent.put(`/api/org/orders/${orderId}/purchase-rule`, { rule: 'full_payment' }),
      ).expect(409);
    });

    it('un acompte sans pourcentage est refusé ; l’acheteur ne change pas la règle', async () => {
      await asK(
        kaseba.agent.put(`/api/org/orders/${orderId}/purchase-rule`, { rule: 'deposit' }),
      ).expect(400);
      await asK(
        acheteur.agent.put(`/api/org/orders/${orderId}/purchase-rule`, { rule: 'own_funds' }),
      ).expect(403);
    });

    it('la base refuse aussi le passage en achat quand la règle n’est pas satisfaite', async () => {
      await expect(
        appRole.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.user_id', ${kaseba.userId}, true)`;
          await tx.$executeRaw`UPDATE orders SET status = 'purchasing' WHERE id = ${orderId}::uuid`;
        }),
      ).rejects.toThrow(/règle d'achat non satisfaite/);
    });

    it('le total payé d’une commande n’est pas lisible par une autre organisation', async () => {
      await pay(TOTAL);
      const autre = await actor(t, 'Mwamba');
      await createOrg(autre, 'Mwamba Express');
      const rows = await appRole.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.user_id', ${autre.userId}, true)`;
        return tx.$queryRaw<{ paid: bigint }[]>`SELECT order_net_paid(${orderId}::uuid) AS paid`;
      });
      expect(Number(rows[0]!.paid)).toBe(0);
    });
  });

  describe('achat groupé et quantités', () => {
    beforeEach(async () => {
      await pay(TOTAL);
    });

    it('un achat couvre des articles de plusieurs commandes et fait avancer chacune', async () => {
      const patrick = await actor(t, 'Patrick');
      const lub = await t.prisma.city.findUniqueOrThrow({ where: { name: 'Lubumbashi' } });
      await patrick.agent
        .put('/api/me/profile', { displayName: 'Patrick', cityId: lub.id })
        .expect(200);
      const other = await acceptedOrder(patrick);
      await asK(
        kaseba.agent.put(`/api/org/orders/${other.id}/purchase-rule`, { rule: 'own_funds' }),
      ).expect(200);

      const so = await purchase(acheteur, [
        { orderItemId: robe, quantity: 2 },
        { orderItemId: ecouteurs, quantity: 5 },
        { orderItemId: other.items[0]!.id, quantity: 2 },
      ]).expect(201);
      expect(so.body.status).toBe('placed');
      expect(so.body.items).toHaveLength(3);
      expect(so.body.amount).toBe(21000);

      const mine = await orgOrder();
      expect(mine.status).toBe('purchased');
      expect(mine.items.map((i: { qtyPurchased: number }) => i.qtyPurchased)).toEqual([2, 5]);
      expect(
        mine.events
          .filter((e: { type: string }) => e.type === 'status_changed')
          .map((e: { toStatus: string }) => e.toStatus),
      ).toEqual(['purchasing', 'purchased']);

      const theirs = await asK(kaseba.agent.get(`/api/org/orders/${other.id}`)).expect(200);
      expect(theirs.body.status).toBe('partially_purchased');

      const list = await asK(
        kaseba.agent.get(`/api/org/supplier-orders?commande=${other.id}`),
      ).expect(200);
      expect(list.body).toHaveLength(1);
    });

    it('refuse d’acheter plus que le reste à acheter, et un article en double', async () => {
      await purchase(acheteur, [{ orderItemId: ecouteurs, quantity: 3 }]).expect(201);
      const res = await purchase(acheteur, [{ orderItemId: ecouteurs, quantity: 3 }]).expect(400);
      expect(res.body.message).toMatch(/reste à acheter \(2\)/);
      await purchase(acheteur, [
        { orderItemId: robe, quantity: 1 },
        { orderItemId: robe, quantity: 1 },
      ]).expect(400);
      // Rien n'a été enregistré pour l'achat refusé.
      expect(await t.prisma.supplierOrder.count()).toBe(1);
    });

    it('la liste « à acheter » montre le reste et la règle appliquée', async () => {
      await purchase(acheteur, [{ orderItemId: ecouteurs, quantity: 3 }]).expect(201);
      const res = await asK(acheteur.agent.get('/api/org/purchasable-items')).expect(200);
      expect(
        res.body.map((i: { description: string; qtyPurchased: number; canPurchase: boolean }) => [
          i.description,
          i.qtyPurchased,
          i.canPurchase,
        ]),
      ).toEqual([
        ['Robe midi plissée, M', 0, true],
        ['Écouteurs sans fil', 3, true],
      ]);
    });

    it('réception à l’entrepôt : partielle puis complète, quantités reportées sur la commande', async () => {
      const so = await purchase(acheteur, [
        { orderItemId: robe, quantity: 2 },
        { orderItemId: ecouteurs, quantity: 5 },
      ]).expect(201);
      await asK(
        acheteur.agent.patch(`/api/org/supplier-orders/${so.body.id}`, {
          status: 'shipped_by_seller',
          sellerTrackingNumber: 'YT2411210001',
        }),
      ).expect(200);
      const partial = await asK(
        acheteur.agent.post(`/api/org/supplier-orders/${so.body.id}/receive`, {
          items: [{ orderItemId: ecouteurs, qtyReceived: 4 }],
        }),
      ).expect(201);
      expect(partial.body.status).toBe('partially_received');
      expect(partial.body.sellerTrackingNumber).toBe('YT2411210001');
      await asK(
        acheteur.agent.post(`/api/org/supplier-orders/${so.body.id}/receive`, {
          items: [{ orderItemId: ecouteurs, qtyReceived: 6 }],
        }),
      ).expect(400);
      const full = await asK(
        acheteur.agent.post(`/api/org/supplier-orders/${so.body.id}/receive`, {
          items: [
            { orderItemId: robe, qtyReceived: 2 },
            { orderItemId: ecouteurs, qtyReceived: 5 },
          ],
        }),
      ).expect(201);
      expect(full.body.status).toBe('received');
      const order = await orgOrder();
      expect(order.items.map((i: { qtyReceived: number }) => i.qtyReceived)).toEqual([2, 5]);
    });

    it('la preuve d’achat est stockée chiffrée et relue par l’organisation seulement', async () => {
      const proof = await asK(
        acheteur.agent.postFile('/api/org/purchase-proofs', {}, PDF, 'facture-shein.pdf'),
      ).expect(201);
      const so = await purchase(acheteur, [{ orderItemId: robe, quantity: 2 }], {
        proofFileId: proof.body.fileId,
      }).expect(201);
      expect(so.body.hasProof).toBe(true);
      const read = await asK(
        comptable.agent.get(`/api/org/supplier-orders/${so.body.id}/proof`),
      ).expect(200);
      expect(Buffer.from(read.body).subarray(0, 5).toString()).toBe('%PDF-');
      await asK(vendeuse.agent.get(`/api/org/supplier-orders/${so.body.id}/proof`)).expect(403);
    });
  });

  describe('confidentialité des coûts réels', () => {
    let soId: string;
    beforeEach(async () => {
      await pay(TOTAL);
      soId = (await purchase(acheteur, [{ orderItemId: robe, quantity: 2 }]).expect(201)).body.id;
    });

    it('le client ne voit ni l’achat ni son montant, seulement l’avancement', async () => {
      const order = await ruth.agent.get(`/api/orders/${orderId}`).expect(200);
      expect(order.body.status).toBe('partially_purchased');
      expect(JSON.stringify(order.body)).not.toMatch(/21000|SHEIN|GSH24112100123/);
      const rows = await appRole.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.user_id', ${ruth.userId}, true)`;
        return tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM supplier_orders`;
      });
      expect(Number(rows[0]!.n)).toBe(0);
    });

    it('le rôle commercial n’accède pas aux achats ; le comptable lit sans modifier', async () => {
      await asK(vendeuse.agent.get('/api/org/supplier-orders')).expect(403);
      const rows = await appRole.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.user_id', ${vendeuse.userId}, true)`;
        return tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM supplier_orders`;
      });
      expect(Number(rows[0]!.n)).toBe(0);

      const list = await asK(comptable.agent.get('/api/org/supplier-orders')).expect(200);
      expect(list.body[0].amount).toBe(21000);
      await purchase(comptable, [{ orderItemId: ecouteurs, quantity: 1 }]).expect(403);
      await asK(comptable.agent.patch(`/api/org/supplier-orders/${soId}`, { note: 'test' })).expect(
        403,
      );
    });

    it('une autre organisation ne voit pas l’achat et ne peut pas y rattacher ses articles', async () => {
      const autre = await actor(t, 'Mwamba');
      const orgM = await createOrg(autre, 'Mwamba Express');
      await autre.agent
        .get(`/api/org/supplier-orders/${soId}`)
        .set(...asOrg(orgM))
        .expect(404);
      await autre.agent
        .post('/api/org/supplier-orders', {
          storeName: 'Vol',
          purchasedAt: new Date().toISOString(),
          amount: 100,
          currency: 'USD',
          items: [{ orderItemId: ecouteurs, quantity: 1 }],
        })
        .set(...asOrg(orgM))
        .expect(400);
    });

    it('un achat n’est jamais supprimé', async () => {
      await expect(
        t.prisma.$executeRaw`DELETE FROM supplier_orders WHERE id = ${soId}::uuid`,
      ).rejects.toThrow();
    });
  });
});
