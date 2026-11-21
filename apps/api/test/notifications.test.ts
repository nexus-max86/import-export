import { PrismaClient } from '@konzia/db';
import { randomUUID } from 'node:crypto';
import { NotificationsService } from '../src/notifications/notifications.service';
import { createTestApp, type TestContext } from './app';
import { actor, addMember, approveOrg, asOrg, createOrg, type Actor } from './fixtures';
import { receivedOrder } from './logistics-fixtures';
import { sendQuote, sendRequest } from './quote-fixtures';

/** Centre de notifications (ticket #23) : les bons destinataires, et seulement eux. */
describe('Notifications', () => {
  let t: TestContext;
  let appRole: PrismaClient;
  let kaseba: Actor;
  let vendeuse: Actor;
  let acheteur: Actor;
  let comptable: Actor;
  let ruth: Actor;
  let orgK: string;
  let slugK: string;

  const asK = <T extends { set: (k: string, v: string) => T }>(req: T) => req.set(...asOrg(orgK));
  const types = async (who: Actor) =>
    ((await who.agent.get('/api/notifications').expect(200)).body as { type: string }[])
      .map((n) => n.type)
      .sort();

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
    acheteur = await actor(t, 'Acheteur');
    await addMember(t, orgK, acheteur.userId, 'buyer');
    comptable = await actor(t, 'Comptable');
    await addMember(t, orgK, comptable.userId, 'accountant');
    ruth = await actor(t, 'Ruth');
    const lub = await t.prisma.city.findUniqueOrThrow({ where: { name: 'Lubumbashi' } });
    await ruth.agent.put('/api/me/profile', { displayName: 'Ruth K.', cityId: lub.id }).expect(200);
  });
  afterAll(async () => {
    await appRole.$disconnect();
    await t.app.close();
  });

  it('demande, devis, paiement : chaque fait atteint ses seuls destinataires', async () => {
    const autre = await actor(t, 'Mwamba');
    await approveOrg(t, await createOrg(autre, 'Mwamba Express'));

    const r = await sendRequest(ruth, [slugK]);
    expect(await types(kaseba)).toEqual(['request_received']);
    expect(await types(vendeuse)).toEqual(['request_received']);
    expect(await types(acheteur)).toEqual([]);
    expect(await types(autre)).toEqual([]);
    const [n] = (await kaseba.agent.get('/api/notifications')).body;
    expect(n).toMatchObject({
      title: 'Nouvelle demande de devis',
      body: 'Ruth K. vous demande un devis (2 article(s)).',
      link: `/pro/demandes/${r.id}`,
      read: false,
    });

    const q = await sendQuote(t, kaseba, orgK, r);
    const quoteNotif = (await ruth.agent.get('/api/notifications')).body[0];
    expect(quoteNotif).toMatchObject({ type: 'quote_received', link: `/demandes/${r.id}` });
    expect(quoteNotif.body).toMatch(/^Kaseba Import vous propose 135,68 USD, valable jusqu’au /);

    const orderId = (
      await ruth.agent
        .post(`/api/quotes/${q.quoteId}/accept`, { versionId: q.versionId })
        .expect(201)
    ).body.orderId;
    const key = randomUUID();
    const declare = () =>
      ruth.agent.post(`/api/orders/${orderId}/payments`, {
        method: 'mobile_money',
        provider: 'M-Pesa',
        amount: 13568,
        currency: 'USD',
        reference: 'MP-1',
        idempotencyKey: key,
      });
    const p = await declare().expect(201);
    await declare().expect(201); // même clé : pas de seconde notification
    expect(await types(comptable)).toEqual(['payment_to_confirm']);
    expect(await types(kaseba)).toEqual(['payment_to_confirm', 'request_received']);
    expect(await types(vendeuse)).toEqual(['request_received']);

    await asK(kaseba.agent.post(`/api/org/payments/${p.body.id}/confirm`)).expect(201);
    const mine = (await ruth.agent.get('/api/notifications')).body;
    expect(mine[0]).toMatchObject({
      type: 'payment_confirmed',
      link: `/commandes/${orderId}`,
    });
  });

  it('achat, réception, expédition, arrivée, commande terminée : le client suit sans rien demander', async () => {
    const order = await receivedOrder(t, kaseba, orgK, slugK, ruth);
    expect(await types(ruth)).toEqual(
      expect.arrayContaining([
        'quote_received',
        'payment_confirmed',
        'purchase_done',
        'items_received',
      ]),
    );
    await t.prisma.notification.deleteMany({ where: { recipientUserId: ruth.userId } });

    const parcel = await asK(kaseba.agent.post('/api/org/parcels', {})).expect(201);
    const id = parcel.body.id;
    await asK(
      kaseba.agent.post(`/api/org/parcels/${id}/items`, {
        items: [
          { orderItemId: order.robe, quantity: 2 },
          { orderItemId: order.ecouteurs, quantity: 5 },
        ],
      }),
    ).expect(201);
    await asK(kaseba.agent.patch(`/api/org/parcels/${id}`, { weightG: 900 })).expect(200);
    const step = (stepCode: string) =>
      asK(kaseba.agent.post(`/api/org/parcels/${id}/events`, { kind: 'step', stepCode })).expect(
        201,
      );
    await step('received_origin_warehouse');
    await step('checked'); // étape interne : aucune notification
    expect(await types(ruth)).toEqual([]);
    await asK(kaseba.agent.post(`/api/org/parcels/${id}/close`)).expect(201);

    const s = await asK(
      kaseba.agent.post('/api/org/shipments', {
        mode: 'air',
        origin: 'Guangzhou',
        destination: 'Lubumbashi',
      }),
    ).expect(201);
    await asK(
      kaseba.agent.post(`/api/org/shipments/${s.body.id}/parcels`, { parcelIds: [id] }),
    ).expect(201);
    await asK(
      kaseba.agent.post(`/api/org/shipments/${s.body.id}/events`, {
        kind: 'step',
        stepCode: 'shipped_to_drc',
      }),
    ).expect(201);
    expect(await types(ruth)).toEqual(['parcel_shipped']);
    await asK(
      kaseba.agent.post(`/api/org/parcels/${id}/events`, {
        kind: 'anomaly',
        anomalyType: 'blocked',
        note: 'Retenu en douane, documents manquants',
      }),
    ).expect(201);
    await step('arrived_drc');
    await step('ready_for_handover');
    await step('delivered');
    expect(await types(ruth)).toEqual([
      'order_completed',
      'parcel_anomaly',
      'parcel_arrived',
      'parcel_available',
      'parcel_shipped',
    ]);
    const all = (await ruth.agent.get('/api/notifications')).body as { body: string }[];
    // La note interne de l'anomalie ne sort jamais vers le client.
    expect(JSON.stringify(all)).not.toMatch(/documents manquants/);
  });

  it('rappel « devis bientôt expiré », une seule fois', async () => {
    const r = await sendRequest(ruth, [slugK]);
    await sendQuote(t, kaseba, orgK, r);
    const version = await t.prisma.quoteVersion.findFirstOrThrow({ where: { status: 'sent' } });
    const service = t.app.get(NotificationsService);
    const twelveHoursBefore = new Date(version.validUntil.getTime() - 12 * 3_600_000);
    expect(
      await service.remindExpiringQuotes(new Date(version.validUntil.getTime() - 48 * 3_600_000)),
    ).toBe(0);
    expect(await service.remindExpiringQuotes(twelveHoursBefore)).toBe(1);
    expect(await service.remindExpiringQuotes(twelveHoursBefore)).toBe(0);
    expect((await ruth.agent.get('/api/notifications')).body[0].type).toBe('quote_expiring');
  });

  it('lecture : compteur, marquer lu, tout lire ; personne d’autre n’y accède', async () => {
    await sendRequest(ruth, [slugK]);
    await sendRequest(ruth, [slugK]);
    expect((await kaseba.agent.get('/api/notifications/unread-count')).body.count).toBe(2);
    const [first] = (await kaseba.agent.get('/api/notifications')).body;
    await vendeuse.agent.post(`/api/notifications/${first.id}/read`).expect(204); // pas la sienne : sans effet
    expect((await kaseba.agent.get('/api/notifications/unread-count')).body.count).toBe(2);
    await kaseba.agent.post(`/api/notifications/${first.id}/read`).expect(204);
    expect((await kaseba.agent.get('/api/notifications/unread-count')).body.count).toBe(1);
    await kaseba.agent.post('/api/notifications/read-all').expect(204);
    expect((await kaseba.agent.get('/api/notifications/unread-count')).body.count).toBe(0);

    const seen = await appRole.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${ruth.userId}, true)`;
      return tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM notifications`;
    });
    expect(Number(seen[0]!.n)).toBe(0);
    await expect(
      appRole.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.user_id', ${ruth.userId}, true)`;
        await tx.$executeRaw`INSERT INTO notifications (id, recipient_user_id, type, title, body)
          VALUES (gen_random_uuid(), ${kaseba.userId}::uuid, 'x', 'Faux', 'Faux')`;
      }),
    ).rejects.toThrow();
  });

  it('préférences e-mail par type, activées par défaut', async () => {
    const prefs = await ruth.agent.get('/api/me/notification-preferences').expect(200);
    expect(prefs.body).toHaveLength(14);
    expect(prefs.body.every((p: { email: boolean }) => p.email)).toBe(true);
    const updated = await ruth.agent
      .put('/api/me/notification-preferences', {
        preferences: [{ type: 'quote_received', email: false }],
      })
      .expect(200);
    expect(updated.body.find((p: { type: string }) => p.type === 'quote_received').email).toBe(
      false,
    );
    await ruth.agent
      .put('/api/me/notification-preferences', { preferences: [{ type: 'inconnu', email: false }] })
      .expect(400);
  });
});
