import { PrismaClient } from '@konzia/db';
import { createTestApp, type TestContext } from './app';
import { actor, addMember, approveOrg, asOrg, createOrg, type Actor } from './fixtures';
import { receivedOrder } from './logistics-fixtures';

/** Itinéraires, événements de colis et d'expédition (ticket #21). */
describe('Suivi logistique', () => {
  let t: TestContext;
  let appRole: PrismaClient;
  let kaseba: Actor;
  let logistique: Actor;
  let vendeuse: Actor;
  let ruth: Actor;
  let orgK: string;
  let slugK: string;
  let order: { id: string; robe: string; ecouteurs: string };

  const asK = <T extends { set: (k: string, v: string) => T }>(req: T) => req.set(...asOrg(orgK));

  async function parcelWith(
    items: { orderItemId: string; quantity: number }[],
    opts: { close?: boolean; routeTemplateId?: string } = {},
  ) {
    const p = await asK(
      logistique.agent.post('/api/org/parcels', { routeTemplateId: opts.routeTemplateId }),
    ).expect(201);
    await asK(logistique.agent.post(`/api/org/parcels/${p.body.id}/items`, { items })).expect(201);
    await asK(logistique.agent.patch(`/api/org/parcels/${p.body.id}`, { weightG: 1500 })).expect(
      200,
    );
    if (opts.close)
      await asK(logistique.agent.post(`/api/org/parcels/${p.body.id}/close`)).expect(201);
    return p.body as { id: string; code: string };
  }

  const event = (parcelId: string, body: object) =>
    asK(logistique.agent.post(`/api/org/parcels/${parcelId}/events`, body));

  async function shipmentWith(parcelIds: string[]) {
    const s = await asK(
      logistique.agent.post('/api/org/shipments', {
        mode: 'air',
        origin: 'Guangzhou',
        destination: 'Lubumbashi',
        carrier: 'Ethiopian Cargo',
        trackingNumber: 'ET-071-2411',
      }),
    ).expect(201);
    await asK(
      logistique.agent.post(`/api/org/shipments/${s.body.id}/parcels`, { parcelIds }),
    ).expect(201);
    return s.body.id as string;
  }

  const shipmentStep = (id: string, stepCode: string) =>
    asK(logistique.agent.post(`/api/org/shipments/${id}/events`, { kind: 'step', stepCode }));

  const orderStatus = async () =>
    (await asK(kaseba.agent.get(`/api/org/orders/${order.id}`)).expect(200)).body.status;

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
    order = await receivedOrder(t, kaseba, orgK, slugK, ruth);
  });
  afterAll(async () => {
    await appRole.$disconnect();
    await t.app.close();
  });

  describe('itinéraires', () => {
    it('le modèle global reprend les étapes de colis du cahier ; un commissionnaire crée le sien', async () => {
      const list = await asK(logistique.agent.get('/api/org/route-templates')).expect(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0].global).toBe(true);
      expect(list.body[0].steps).toHaveLength(14);
      expect(list.body[0].steps.at(-1).code).toBe('delivered');

      await asK(
        logistique.agent.post('/api/org/route-templates', {
          name: 'Sans fin',
          steps: [{ code: 'received_origin_warehouse' }, { code: 'in_transit' }],
        }),
      ).expect(400);
      const mine = await asK(
        logistique.agent.post('/api/org/route-templates', {
          name: 'Bateau puis route (Dar es Salaam)',
          mode: 'mixed',
          steps: [
            { code: 'received_origin_warehouse' },
            { code: 'shipped_to_drc', label: 'Parti de Dar es Salaam' },
            { code: 'customs', label: 'Douane de Kasumbalesa' },
            { code: 'delivered' },
          ],
        }),
      ).expect(201);
      expect(mine.body.steps[1].label).toBe('Parti de Dar es Salaam');

      const autre = await actor(t, 'Mwamba');
      const orgM = await createOrg(autre, 'Mwamba Express');
      const theirs = await autre.agent
        .get('/api/org/route-templates')
        .set(...asOrg(orgM))
        .expect(200);
      expect(theirs.body.map((x: { name: string }) => x.name)).not.toContain(
        'Bateau puis route (Dar es Salaam)',
      );
      await autre.agent
        .post('/api/org/parcels', { routeTemplateId: mine.body.id })
        .set(...asOrg(orgM))
        .expect(400);
    });

    it('le colis suit son itinéraire ; on ne le change plus une fois le suivi commencé', async () => {
      const tpl = await asK(
        logistique.agent.post('/api/org/route-templates', {
          name: 'Court',
          steps: [{ code: 'received_origin_warehouse' }, { code: 'delivered' }],
        }),
      ).expect(201);
      const p = await parcelWith([{ orderItemId: order.robe, quantity: 2 }], {
        routeTemplateId: tpl.body.id,
      });
      await event(p.id, { kind: 'step', stepCode: 'checked' }).expect(409); // absente de l'itinéraire
      await event(p.id, { kind: 'step', stepCode: 'received_origin_warehouse' }).expect(201);
      await asK(
        logistique.agent.patch(`/api/org/parcels/${p.id}`, { routeTemplateId: null }),
      ).expect(409);
    });
  });

  describe('événements de colis', () => {
    it('avancent seulement ; une correction (avec motif) revient en arrière, tout est conservé', async () => {
      const p = await parcelWith([{ orderItemId: order.robe, quantity: 2 }]);
      await event(p.id, { kind: 'step', stepCode: 'received_origin_warehouse' }).expect(201);
      const checked = await event(p.id, {
        kind: 'step',
        stepCode: 'checked',
        location: 'Guangzhou',
      }).expect(201);
      expect(checked.body.currentStepCode).toBe('checked');
      expect(checked.body.events[1]).toMatchObject({
        label: 'Contrôlé',
        location: 'Guangzhou',
        visibleToCustomer: false, // étape interne dans le modèle global
      });
      const back = await event(p.id, {
        kind: 'step',
        stepCode: 'received_origin_warehouse',
      }).expect(409);
      expect(back.body.message).toMatch(/correction/);
      await event(p.id, { kind: 'correction', stepCode: 'received_origin_warehouse' }).expect(400);
      const fixed = await event(p.id, {
        kind: 'correction',
        stepCode: 'received_origin_warehouse',
        note: 'Contrôle saisi par erreur',
      }).expect(201);
      expect(fixed.body.currentStepCode).toBe('received_origin_warehouse');
      expect(fixed.body.events.map((e: { kind: string }) => e.kind)).toEqual([
        'step',
        'step',
        'correction',
      ]);
    });

    it('un colis ouvert ne part pas vers la RDC', async () => {
      const p = await parcelWith([{ orderItemId: order.robe, quantity: 2 }]);
      const res = await event(p.id, { kind: 'step', stepCode: 'shipped_to_drc' }).expect(409);
      expect(res.body.message).toMatch(/Fermez le colis/);
    });

    it('la base refuse la modification et la suppression d’un événement', async () => {
      const p = await parcelWith([{ orderItemId: order.robe, quantity: 2 }]);
      await event(p.id, { kind: 'step', stepCode: 'received_origin_warehouse' }).expect(201);
      await expect(
        t.prisma.$executeRaw`UPDATE parcel_events SET note = 'x' WHERE parcel_id = ${p.id}::uuid`,
      ).rejects.toThrow(/insertion seule/);
      await expect(
        t.prisma.$executeRaw`DELETE FROM parcel_events WHERE parcel_id = ${p.id}::uuid`,
      ).rejects.toThrow();
    });

    it('anomalie « perdu » : colis perdu, commande bloquée ; une correction le rétablit', async () => {
      const p = await parcelWith(
        [
          { orderItemId: order.robe, quantity: 2 },
          { orderItemId: order.ecouteurs, quantity: 5 },
        ],
        { close: true },
      );
      await event(p.id, { kind: 'anomaly', anomalyType: 'lost' }).expect(400); // motif obligatoire
      const lost = await event(p.id, {
        kind: 'anomaly',
        anomalyType: 'lost',
        note: 'Introuvable à l’entrepôt',
      }).expect(201);
      expect(lost.body.status).toBe('lost');
      await event(p.id, { kind: 'step', stepCode: 'shipped_to_drc' }).expect(409);
      const found = await event(p.id, {
        kind: 'correction',
        stepCode: 'shipped_to_drc',
        note: 'Retrouvé, parti avec le vol suivant',
      }).expect(201);
      expect(found.body.status).toBe('closed');
      expect(await orderStatus()).toBe('in_transit');
    });

    it('seuls propriétaire et logistique enregistrent ; le client ne lit pas les événements bruts', async () => {
      const p = await parcelWith([{ orderItemId: order.robe, quantity: 2 }]);
      await asK(
        vendeuse.agent.post(`/api/org/parcels/${p.id}/events`, {
          kind: 'step',
          stepCode: 'received_origin_warehouse',
        }),
      ).expect(403);
      await event(p.id, { kind: 'step', stepCode: 'received_origin_warehouse' }).expect(201);
      const rows = await appRole.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.user_id', ${ruth.userId}, true)`;
        return tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM parcel_events`;
      });
      expect(Number(rows[0]!.n)).toBe(0);
    });
  });

  describe('expéditions et commandes', () => {
    it('une étape d’expédition s’applique à chaque colis et fait avancer la commande jusqu’au bout', async () => {
      const a = await parcelWith([{ orderItemId: order.robe, quantity: 2 }], { close: true });
      const b = await parcelWith([{ orderItemId: order.ecouteurs, quantity: 5 }], {
        close: true,
      });
      expect(await orderStatus()).toBe('in_logistics');
      const id = await shipmentWith([a.id, b.id]);

      const shipped = await shipmentStep(id, 'shipped_to_drc').expect(201);
      expect(shipped.body.status).toBe('in_transit');
      expect(shipped.body.departureAt).not.toBeNull();
      expect(
        shipped.body.parcels.map((p: { currentStepCode: string }) => p.currentStepCode),
      ).toEqual(['shipped_to_drc', 'shipped_to_drc']);
      expect(await orderStatus()).toBe('in_transit');
      const parcel = await asK(logistique.agent.get(`/api/org/parcels/${a.id}`)).expect(200);
      expect(parcel.body.events.at(-1).viaShipment).toBe(true);
      expect(parcel.body.shipmentId).toBe(id);

      // Une fois partie, l'expédition garde ses colis.
      await asK(
        logistique.agent.post(`/api/org/shipments/${id}/parcels/${a.id}/remove`, {
          reason: 'Erreur',
        }),
      ).expect(409);

      await shipmentStep(id, 'arrived_drc').expect(201);
      await shipmentStep(id, 'at_distribution_point').expect(201);
      expect(await orderStatus()).toBe('at_distribution_point');

      // Le colis le moins avancé fixe l'étape de la commande.
      await event(a.id, { kind: 'step', stepCode: 'ready_for_handover' }).expect(201);
      expect(await orderStatus()).toBe('at_distribution_point');
      await event(b.id, { kind: 'step', stepCode: 'ready_for_handover' }).expect(201);
      expect(await orderStatus()).toBe('ready_for_handover');
      await event(a.id, { kind: 'step', stepCode: 'delivered' }).expect(201);
      await event(b.id, { kind: 'step', stepCode: 'delivered' }).expect(201);
      expect(await orderStatus()).toBe('completed');

      const history = await ruth.agent.get(`/api/orders/${order.id}`).expect(200);
      expect(history.body.events.at(-1).note).toBe('Suivi des colis.');
    });

    it('une commande dont un article n’est pas encore en colis reste en préparation', async () => {
      const a = await parcelWith([{ orderItemId: order.robe, quantity: 2 }], { close: true });
      const id = await shipmentWith([a.id]);
      await shipmentStep(id, 'shipped_to_drc').expect(201);
      expect(await orderStatus()).toBe('in_logistics');
    });

    it('seuls les colis fermés, et dans une seule expédition à la fois', async () => {
      const open = await parcelWith([{ orderItemId: order.robe, quantity: 2 }]);
      const s = await asK(
        logistique.agent.post('/api/org/shipments', {
          mode: 'sea',
          origin: 'Dar es Salaam',
          destination: 'Lubumbashi',
          costAmount: 45000,
          currency: 'USD',
        }),
      ).expect(201);
      await asK(
        logistique.agent.post(`/api/org/shipments/${s.body.id}/parcels`, {
          parcelIds: [open.id],
        }),
      ).expect(409);
      await asK(logistique.agent.post(`/api/org/parcels/${open.id}/close`)).expect(201);
      await asK(
        logistique.agent.post(`/api/org/shipments/${s.body.id}/parcels`, {
          parcelIds: [open.id],
        }),
      ).expect(201);
      const s2 = await asK(
        logistique.agent.post('/api/org/shipments', {
          mode: 'air',
          origin: 'Guangzhou',
          destination: 'Lubumbashi',
        }),
      ).expect(201);
      await asK(
        logistique.agent.post(`/api/org/shipments/${s2.body.id}/parcels`, {
          parcelIds: [open.id],
        }),
      ).expect(409);
      // Retrait avant départ : marquage avec motif, puis le colis peut changer d'expédition.
      await asK(
        logistique.agent.post(`/api/org/shipments/${s.body.id}/parcels/${open.id}/remove`, {
          reason: 'Change de transporteur',
        }),
      ).expect(201);
      await asK(
        logistique.agent.post(`/api/org/shipments/${s2.body.id}/parcels`, {
          parcelIds: [open.id],
        }),
      ).expect(201);
    });
  });
});
