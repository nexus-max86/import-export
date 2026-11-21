import { PrismaClient } from '@konzia/db';
import { randomUUID } from 'node:crypto';
import { createTestApp, type TestContext } from './app';
import { actor, addMember, approveOrg, asOrg, createOrg, type Actor } from './fixtures';
import { receivedOrder } from './logistics-fixtures';

/** Suivi côté client dans un colis partagé (EF-84) et exports CSV (ticket #22). */
describe('Suivi client et exports', () => {
  let t: TestContext;
  let appRole: PrismaClient;
  let kaseba: Actor;
  let vendeuse: Actor;
  let ruth: Actor;
  let orgK: string;
  let slugK: string;
  let ruthOrder: { id: string; robe: string; ecouteurs: string };
  let patrick: { customerId: string; orderId: string; itemId: string };
  let parcelId: string;

  const asK = <T extends { set: (k: string, v: string) => T }>(req: T) => req.set(...asOrg(orgK));

  /** Client géré (sans compte) : demande saisie, accord WhatsApp, payé, acheté, reçu. */
  async function managedOrder(fullName: string, phone = '0812345678') {
    const c = await asK(
      kaseba.agent.post('/api/org/customers', { fullName, phoneWhatsapp: phone }),
    ).expect(201);
    const req = await asK(
      kaseba.agent.post('/api/org/requests', {
        orgCustomerId: c.body.id,
        items: [{ source: 'manual', title: 'Chaussures de sécurité', quantity: 3 }],
      }),
    ).expect(201);
    const q = await asK(kaseba.agent.post(`/api/org/requests/${req.body.id}/quote`)).expect(201);
    await asK(
      kaseba.agent.put(`/api/org/quotes/${q.body.id}/draft`, {
        currency: 'USD',
        validUntil: new Date(Date.now() + 86_400_000).toISOString(),
        leadTimeMinDays: 7,
        leadTimeMaxDays: 10,
        lines: [
          {
            kind: 'product',
            quoteRequestItemId: q.body.current.lines[0].quoteRequestItemId,
            description: 'Chaussures de sécurité',
            quantity: 3,
            unitAmount: 2500,
          },
        ],
      }),
    ).expect(200);
    const sent = await asK(kaseba.agent.post(`/api/org/quotes/${q.body.id}/send`)).expect(201);
    const accepted = await asK(
      kaseba.agent.post(`/api/org/quotes/${q.body.id}/accept-for-customer`, {
        versionId: sent.body.current.id,
        note: 'Accord par WhatsApp',
      }),
    ).expect(201);
    const orderId = accepted.body.orderId as string;
    await asK(
      kaseba.agent.post(`/api/org/orders/${orderId}/payments`, {
        method: 'cash',
        amount: 7500,
        currency: 'USD',
        idempotencyKey: randomUUID(),
      }),
    ).expect(201);
    const detail = await asK(kaseba.agent.get(`/api/org/orders/${orderId}`)).expect(200);
    const itemId = detail.body.items[0].id as string;
    const so = await asK(
      kaseba.agent.post('/api/org/supplier-orders', {
        storeName: 'Alibaba',
        purchasedAt: new Date().toISOString(),
        amount: 5000,
        currency: 'USD',
        items: [{ orderItemId: itemId, quantity: 3 }],
      }),
    ).expect(201);
    await asK(
      kaseba.agent.post(`/api/org/supplier-orders/${so.body.id}/receive`, {
        items: [{ orderItemId: itemId, qtyReceived: 3 }],
      }),
    ).expect(201);
    return { customerId: c.body.id as string, orderId, itemId };
  }

  const event = (body: object) =>
    asK(kaseba.agent.post(`/api/org/parcels/${parcelId}/events`, body)).expect(201);

  const viewCount = (userId: string | null) =>
    appRole.$transaction(async (tx) => {
      if (userId) await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
      const [a] = await tx.$queryRaw<
        { n: bigint }[]
      >`SELECT count(*) AS n FROM customer_parcel_tracking`;
      const [b] = await tx.$queryRaw<
        { n: bigint }[]
      >`SELECT count(*) AS n FROM customer_parcel_events`;
      return [Number(a!.n), Number(b!.n)];
    });

  beforeAll(async () => {
    t = await createTestApp();
    appRole = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
  });
  beforeEach(async () => {
    await t.reset();
    kaseba = await actor(t, 'Kaseba');
    orgK = await createOrg(kaseba, 'Kaseba Import');
    slugK = await approveOrg(t, orgK);
    vendeuse = await actor(t, 'Vendeuse');
    await addMember(t, orgK, vendeuse.userId, 'sales');
    ruth = await actor(t, 'Ruth');
    ruthOrder = await receivedOrder(t, kaseba, orgK, slugK, ruth);
    patrick = await managedOrder('Patrick Mbuyi');

    // Un colis partagé : la robe de Ruth et les chaussures de Patrick.
    const p = await asK(kaseba.agent.post('/api/org/parcels', {})).expect(201);
    parcelId = p.body.id;
    await asK(
      kaseba.agent.post(`/api/org/parcels/${parcelId}/items`, {
        items: [
          { orderItemId: ruthOrder.robe, quantity: 2 },
          { orderItemId: patrick.itemId, quantity: 3 },
        ],
      }),
    ).expect(201);
    await event({ kind: 'step', stepCode: 'received_origin_warehouse', location: 'Guangzhou' });
    await event({ kind: 'step', stepCode: 'checked', note: 'Note interne secrète' });
    await event({ kind: 'anomaly', anomalyType: 'damaged', note: 'Carton abîmé, client Patrick' });
  });
  afterAll(async () => {
    await appRole.$disconnect();
    await t.app.close();
  });

  it('le client ne voit que ses articles et les étapes visibles, sans notes ni autres clients', async () => {
    const res = await ruth.agent.get(`/api/orders/${ruthOrder.id}/tracking`).expect(200);
    expect(res.body).toHaveLength(1);
    const [parcel] = res.body;
    expect(parcel.parcelCode).toMatch(/^KZ-P-/);
    expect(parcel.items).toEqual([
      expect.objectContaining({ description: 'Robe midi plissée, M', quantity: 2 }),
    ]);
    expect(parcel.events.map((e: { label: string }) => e.label)).toEqual([
      'Reçu à l’entrepôt d’origine',
      'Anomalie : Endommagé',
    ]);
    expect(parcel.currentLabel).toBe('Reçu à l’entrepôt d’origine');
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/Patrick|Chaussures|secrète|Carton|Contrôlé/);
  });

  it('un autre utilisateur, ou une requête sans utilisateur, ne voit rien', async () => {
    const intrus = await actor(t, 'Intrus');
    await intrus.agent.get(`/api/orders/${ruthOrder.id}/tracking`).expect(404);
    expect(await viewCount(intrus.userId)).toEqual([0, 0]);
    expect(await viewCount(null)).toEqual([0, 0]);
    expect(await viewCount(kaseba.userId)).toEqual([0, 0]); // le commissionnaire passe par ses écrans
    expect(await viewCount(ruth.userId)).toEqual([1, 2]);
  });

  it('un article retiré du colis disparaît du suivi du client', async () => {
    const detail = await asK(kaseba.agent.get(`/api/org/parcels/${parcelId}`)).expect(200);
    const robeLine = detail.body.items.find(
      (i: { orderItemId: string }) => i.orderItemId === ruthOrder.robe,
    );
    await asK(
      kaseba.agent.post(`/api/org/parcels/${parcelId}/items/${robeLine.id}/remove`, {
        reason: 'Mis dans un autre colis',
      }),
    ).expect(201);
    const res = await ruth.agent.get(`/api/orders/${ruthOrder.id}/tracking`).expect(200);
    expect(res.body).toEqual([]);
  });

  it('un client géré qui réclame son compte retrouve sa commande et son suivi', async () => {
    const link = await asK(
      kaseba.agent.post(`/api/org/customers/${patrick.customerId}/claim-link`),
    ).expect(201);
    const token = new URL(link.body.link).searchParams.get('jeton');
    const user = await actor(t, 'Patrick');
    await user.agent.post('/api/customers/claim', { token }).expect(201);

    const orders = await user.agent.get('/api/orders').expect(200);
    expect(orders.body.map((o: { id: string }) => o.id)).toEqual([patrick.orderId]);
    const order = await user.agent.get(`/api/orders/${patrick.orderId}`).expect(200);
    expect(order.body.paymentStatus).toBe('paid');
    const payments = await user.agent.get(`/api/orders/${patrick.orderId}/payments`).expect(200);
    expect(payments.body).toHaveLength(1);
    const tracking = await user.agent.get(`/api/orders/${patrick.orderId}/tracking`).expect(200);
    expect(tracking.body[0].items).toEqual([
      expect.objectContaining({ description: 'Chaussures de sécurité', quantity: 3 }),
    ]);
    expect(JSON.stringify(tracking.body)).not.toMatch(/Robe|Ruth/);
  });

  it('fusion à la réclamation : un client avec un paiement confirmé garde tout son historique', async () => {
    // Ruth a déjà une fiche (commande payée) ; le commissionnaire lui avait aussi créé une fiche gérée.
    const other = await managedOrder('Ruth (WhatsApp)', '0997000000');
    const link = await asK(
      kaseba.agent.post(`/api/org/customers/${other.customerId}/claim-link`),
    ).expect(201);
    const token = new URL(link.body.link).searchParams.get('jeton');
    await ruth.agent.post('/api/customers/claim', { token }).expect(201);
    const orders = await ruth.agent.get('/api/orders').expect(200);
    expect(orders.body.map((o: { id: string }) => o.id).sort()).toEqual(
      [ruthOrder.id, other.orderId].sort(),
    );
    const tracking = await ruth.agent.get(`/api/orders/${ruthOrder.id}/tracking`).expect(200);
    expect(tracking.body[0].items).toHaveLength(1);
  });

  describe('exports CSV', () => {
    it('commandes et colis, pour le propriétaire, journalisés', async () => {
      const orders = await asK(kaseba.agent.get('/api/org/exports/orders.csv')).expect(200);
      expect(orders.headers['content-type']).toMatch(/text\/csv/);
      expect(orders.headers['content-disposition']).toMatch(/konzia-commandes-/);
      const lines = orders.text.replace('﻿', '').trim().split('\r\n');
      expect(lines[0]).toBe(
        'Commande;Client;Téléphone;Statut;Paiement;Devise;Montant;Payé;Reste;Créée le',
      );
      expect(lines).toHaveLength(3);
      expect(lines.some((l) => /Patrick Mbuyi;081 234 5678;.*;USD;75,00;75,00;0,00;/.test(l))).toBe(
        true,
      );

      const parcels = await asK(kaseba.agent.get('/api/org/exports/parcels.csv')).expect(200);
      const rows = parcels.text.replace('﻿', '').trim().split('\r\n');
      expect(rows).toHaveLength(3);
      expect(rows[1]).toMatch(/^KZ-P-[0-9A-Z]{6};Ouvert;Contrôlé;KZ-/);

      const audit = await t.prisma.auditLog.count({
        where: { action: { in: ['export.orders_csv', 'export.parcels_csv'] } },
      });
      expect(audit).toBe(2);
    });

    it('neutralise une formule glissée dans un nom de client', async () => {
      await managedOrder('=HYPERLINK("http://evil")', '0819999999');
      const res = await asK(kaseba.agent.get('/api/org/exports/orders.csv')).expect(200);
      expect(res.text).toContain(`"'=HYPERLINK(""http://evil"")"`);
    });

    it('réservés au propriétaire et à la comptabilité', async () => {
      await asK(vendeuse.agent.get('/api/org/exports/orders.csv')).expect(403);
      await asK(vendeuse.agent.get('/api/org/exports/parcels.csv')).expect(403);
    });
  });
});
