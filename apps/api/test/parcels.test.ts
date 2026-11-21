import { PrismaClient } from '@konzia/db';
import { PARCEL_CODE_PATTERN } from '@konzia/shared';
import { randomUUID } from 'node:crypto';
import { createTestApp, type TestContext } from './app';
import { actor, addMember, approveOrg, asOrg, createOrg, PDF, PNG, type Actor } from './fixtures';
import { sendQuote, sendRequest } from './quote-fixtures';

/** Colis multi-commandes et multi-clients (ticket #20). */
describe('Colis', () => {
  let t: TestContext;
  let appRole: PrismaClient;
  let kaseba: Actor;
  let logistique: Actor;
  let vendeuse: Actor;
  let ruth: Actor;
  let orgK: string;
  let slugK: string;
  let ruthOrder: { id: string; robe: string; ecouteurs: string; so: string };
  let patrickOrder: { id: string; robe: string; ecouteurs: string; so: string };

  const asK = <T extends { set: (k: string, v: string) => T }>(req: T) => req.set(...asOrg(orgK));

  /** Commande acceptée, payée, achetée en totalité ; renvoie ses articles et l'achat. */
  async function boughtOrder(customer: Actor) {
    const lub = await t.prisma.city.findUniqueOrThrow({ where: { name: 'Lubumbashi' } });
    await customer.agent
      .put('/api/me/profile', { displayName: customer.email.split('@')[0], cityId: lub.id })
      .expect(200);
    const r = await sendRequest(customer, [slugK]);
    const q = await sendQuote(t, kaseba, orgK, r);
    const id = (
      await customer.agent
        .post(`/api/quotes/${q.quoteId}/accept`, { versionId: q.versionId })
        .expect(201)
    ).body.orderId as string;
    await asK(
      kaseba.agent.post(`/api/org/orders/${id}/payments`, {
        method: 'cash',
        amount: 13568,
        currency: 'USD',
        idempotencyKey: randomUUID(),
      }),
    ).expect(201);
    const detail = await asK(kaseba.agent.get(`/api/org/orders/${id}`)).expect(200);
    const [robe, ecouteurs] = detail.body.items.map((i: { id: string }) => i.id);
    const so = await asK(
      kaseba.agent.post('/api/org/supplier-orders', {
        storeName: 'SHEIN',
        purchasedAt: new Date().toISOString(),
        amount: 9000,
        currency: 'USD',
        items: [
          { orderItemId: robe, quantity: 2 },
          { orderItemId: ecouteurs, quantity: 5 },
        ],
      }),
    ).expect(201);
    return { id, robe, ecouteurs, so: so.body.id as string };
  }

  const receive = (so: string, items: { orderItemId: string; qtyReceived: number }[]) =>
    asK(kaseba.agent.post(`/api/org/supplier-orders/${so}/receive`, { items })).expect(201);

  const newParcel = async (body = {}) =>
    (await asK(logistique.agent.post('/api/org/parcels', body)).expect(201)).body;

  const add = (parcelId: string, items: { orderItemId: string; quantity: number }[]) =>
    asK(logistique.agent.post(`/api/org/parcels/${parcelId}/items`, { items }));

  beforeAll(async () => {
    t = await createTestApp();
    appRole = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
  });
  beforeEach(async () => {
    await t.reset();
    kaseba = await actor(t, 'Kaseba');
    orgK = await createOrg(kaseba, 'Kaseba Import');
    slugK = await approveOrg(t, orgK);
    logistique = await actor(t, 'Logistique');
    await addMember(t, orgK, logistique.userId, 'logistics');
    vendeuse = await actor(t, 'Vendeuse');
    await addMember(t, orgK, vendeuse.userId, 'sales');
    ruth = await actor(t, 'Ruth');
    ruthOrder = await boughtOrder(ruth);
    patrickOrder = await boughtOrder(await actor(t, 'Patrick'));
  });
  afterAll(async () => {
    await appRole.$disconnect();
    await t.app.close();
  });

  it('un colis mélange des articles de deux clients ; les commandes passent « en logistique »', async () => {
    await receive(ruthOrder.so, [{ orderItemId: ruthOrder.robe, qtyReceived: 2 }]);
    await receive(patrickOrder.so, [{ orderItemId: patrickOrder.ecouteurs, qtyReceived: 5 }]);
    const parcel = await newParcel({ locationLabel: 'Entrepôt Guangzhou' });
    expect(parcel.code).toMatch(PARCEL_CODE_PATTERN);
    expect(parcel.status).toBe('open');

    const res = await add(parcel.id, [
      { orderItemId: ruthOrder.robe, quantity: 2 },
      { orderItemId: patrickOrder.ecouteurs, quantity: 5 },
    ]).expect(201);
    expect(res.body.itemCount).toBe(7);
    expect(res.body.customerCount).toBe(2);
    expect(res.body.items.map((i: { orderNumber: string }) => i.orderNumber)).toEqual([
      expect.stringMatching(/^KZ-/),
      expect.stringMatching(/^KZ-/),
    ]);

    const order = await asK(kaseba.agent.get(`/api/org/orders/${ruthOrder.id}`)).expect(200);
    expect(order.body.status).toBe('in_logistics');
    expect(order.body.events.at(-1).note).toBe(`Mis en colis (${parcel.code}).`);
  });

  it('ne met jamais en colis plus que reçu, même réparti sur plusieurs colis', async () => {
    await receive(ruthOrder.so, [{ orderItemId: ruthOrder.ecouteurs, qtyReceived: 3 }]);
    const first = await newParcel();
    const second = await newParcel();
    const tooMany = await add(first.id, [{ orderItemId: ruthOrder.ecouteurs, quantity: 4 }]).expect(
      400,
    );
    expect(tooMany.body.message).toMatch(/seulement 3 reçu/);
    await add(first.id, [{ orderItemId: ruthOrder.ecouteurs, quantity: 3 }]).expect(201);
    await add(second.id, [{ orderItemId: ruthOrder.ecouteurs, quantity: 1 }]).expect(400);
    // Déjà dans ce colis : on retire puis on rajoute, jamais de modification en place.
    await add(first.id, [{ orderItemId: ruthOrder.ecouteurs, quantity: 1 }]).expect(409);

    const list = await asK(logistique.agent.get('/api/org/packable-items')).expect(200);
    expect(list.body).toHaveLength(0);
  });

  it('un retrait est un marquage audité, avec motif ; l’article redevient disponible', async () => {
    await receive(ruthOrder.so, [{ orderItemId: ruthOrder.robe, qtyReceived: 2 }]);
    const first = await newParcel();
    const second = await newParcel();
    const added = await add(first.id, [{ orderItemId: ruthOrder.robe, quantity: 2 }]).expect(201);
    const itemId = added.body.items[0].id;
    await asK(
      logistique.agent.post(`/api/org/parcels/${first.id}/items/${itemId}/remove`, {
        reason: 'x',
      }),
    ).expect(400);
    const removed = await asK(
      logistique.agent.post(`/api/org/parcels/${first.id}/items/${itemId}/remove`, {
        reason: 'Mauvais colis',
      }),
    ).expect(201);
    expect(removed.body.itemCount).toBe(0);
    expect(removed.body.items[0]).toMatchObject({ removedReason: 'Mauvais colis', quantity: 2 });
    expect(removed.body.items[0].removedAt).not.toBeNull();
    await add(second.id, [{ orderItemId: ruthOrder.robe, quantity: 2 }]).expect(201);

    const audit = await t.prisma.auditLog.findMany({
      where: { entityId: first.id },
      select: { action: true, reason: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map((a) => a.action)).toEqual([
      'parcel.created',
      'parcel.items_added',
      'parcel.item_removed',
    ]);
    expect(audit[2]!.reason).toBe('Mauvais colis');
  });

  it('la base refuse suppression, modification en place et dépassement des quantités reçues', async () => {
    await receive(ruthOrder.so, [{ orderItemId: ruthOrder.robe, qtyReceived: 1 }]);
    const parcel = await newParcel();
    const added = await add(parcel.id, [{ orderItemId: ruthOrder.robe, quantity: 1 }]).expect(201);
    const asLogistics = <T>(work: (tx: Omit<PrismaClient, '$transaction'>) => Promise<T>) =>
      appRole.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.user_id', ${logistique.userId}, true)`;
        return work(tx as never);
      });
    const itemId = added.body.items[0].id as string;
    await expect(
      asLogistics((tx) => tx.$executeRaw`DELETE FROM parcel_items WHERE id = ${itemId}::uuid`),
    ).rejects.toThrow();
    await expect(
      asLogistics(
        (tx) => tx.$executeRaw`UPDATE parcel_items SET quantity = 2 WHERE id = ${itemId}::uuid`,
      ),
    ).rejects.toThrow();
    const second = await newParcel();
    await expect(
      asLogistics(
        (tx) => tx.$executeRaw`
          INSERT INTO parcel_items (id, parcel_id, order_item_id, organization_id, org_customer_id, quantity, added_by)
          SELECT gen_random_uuid(), ${second.id}::uuid, id, organization_id,
                 (SELECT org_customer_id FROM orders WHERE orders.id = order_items.order_id), 1, ${logistique.userId}::uuid
          FROM order_items WHERE id = ${ruthOrder.robe}::uuid`,
      ),
    ).rejects.toThrow(/supérieure aux articles reçus/);
  });

  it('poids, dimensions et poids volumétrique ; fermeture puis réouverture', async () => {
    await receive(ruthOrder.so, [{ orderItemId: ruthOrder.robe, qtyReceived: 2 }]);
    const parcel = await newParcel({ volumetricDivisor: 6000 });
    await add(parcel.id, [{ orderItemId: ruthOrder.robe, quantity: 2 }]).expect(201);
    await asK(logistique.agent.post(`/api/org/parcels/${parcel.id}/close`)).expect(409); // pas pesé
    const measured = await asK(
      logistique.agent.patch(`/api/org/parcels/${parcel.id}`, {
        weightG: 2500,
        lengthMm: 300,
        widthMm: 200,
        heightMm: 300,
        condition: 'ok',
      }),
    ).expect(200);
    expect(measured.body.volumetricWeightG).toBe(3000); // 30 × 20 × 30 ÷ 6000 = 3,0 kg

    const closed = await asK(logistique.agent.post(`/api/org/parcels/${parcel.id}/close`)).expect(
      201,
    );
    expect(closed.body.status).toBe('closed');
    await receive(ruthOrder.so, [
      { orderItemId: ruthOrder.robe, qtyReceived: 2 },
      { orderItemId: ruthOrder.ecouteurs, qtyReceived: 1 },
    ]);
    await add(parcel.id, [{ orderItemId: ruthOrder.ecouteurs, quantity: 1 }]).expect(409);
    await asK(logistique.agent.post(`/api/org/parcels/${parcel.id}/reopen`)).expect(201);
    await add(parcel.id, [{ orderItemId: ruthOrder.ecouteurs, quantity: 1 }]).expect(201);
  });

  it('photos : images seulement, chiffrées, lisibles par l’organisation', async () => {
    const parcel = await newParcel();
    await asK(
      logistique.agent.postFile(`/api/org/parcels/${parcel.id}/photos`, {}, PDF, 'colis.pdf'),
    ).expect(400);
    const withPhoto = await asK(
      logistique.agent.postFile(`/api/org/parcels/${parcel.id}/photos`, {}, PNG, 'colis.png'),
    ).expect(201);
    expect(withPhoto.body.photoFileIds).toHaveLength(1);
    const read = await asK(
      vendeuse.agent.get(`/api/org/parcels/${parcel.id}/photos/${withPhoto.body.photoFileIds[0]}`),
    ).expect(200);
    expect(read.headers['content-type']).toBe('image/png');
  });

  it('seuls le propriétaire et la logistique préparent les colis ; ni client ni autre organisation', async () => {
    await receive(ruthOrder.so, [{ orderItemId: ruthOrder.robe, qtyReceived: 2 }]);
    await asK(vendeuse.agent.post('/api/org/parcels', {})).expect(403);
    const parcel = await newParcel();
    await asK(vendeuse.agent.get(`/api/org/parcels/${parcel.id}`)).expect(200);

    const autre = await actor(t, 'Mwamba');
    const orgM = await createOrg(autre, 'Mwamba Express');
    await autre.agent
      .get(`/api/org/parcels/${parcel.id}`)
      .set(...asOrg(orgM))
      .expect(404);
    const theirs = await autre.agent
      .post('/api/org/parcels', {})
      .set(...asOrg(orgM))
      .expect(201);
    await autre.agent
      .post(`/api/org/parcels/${theirs.body.id}/items`, {
        items: [{ orderItemId: ruthOrder.robe, quantity: 1 }],
      })
      .set(...asOrg(orgM))
      .expect(400);

    const rows = await appRole.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${ruth.userId}, true)`;
      return tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM parcels`;
    });
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it('un colis vide peut être annulé ; un colis avec articles, non', async () => {
    await receive(ruthOrder.so, [{ orderItemId: ruthOrder.robe, qtyReceived: 2 }]);
    const full = await newParcel();
    await add(full.id, [{ orderItemId: ruthOrder.robe, quantity: 2 }]).expect(201);
    await asK(logistique.agent.post(`/api/org/parcels/${full.id}/cancel`)).expect(409);
    const empty = await newParcel();
    const res = await asK(logistique.agent.post(`/api/org/parcels/${empty.id}/cancel`)).expect(201);
    expect(res.body.status).toBe('cancelled');
  });
});
