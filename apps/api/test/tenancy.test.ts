import { PrismaClient } from '@konzia/db';
import { createTestApp, tokenFrom, type TestContext } from './app';
import { actor, addMember, approveOrg, asOrg, createOrg, PDF, PNG, type Actor } from './fixtures';
import { SYSTEM_ONLY_TABLES, TENANT_TABLES } from './tenancy-tables';

/**
 * Isolation multi-tenant (ticket #3, décision D1). Le commissionnaire B ne doit rien voir ni modifier
 * chez A — y compris en SQL direct avec le rôle applicatif, donc même si l'API avait un bug.
 */
describe('Isolation entre commissionnaires', () => {
  let t: TestContext;
  let appRole: PrismaClient;
  let a: Actor;
  let b: Actor;
  let orgA: string;
  let orgB: string;

  /** Exécute du SQL brut avec le rôle konzia_app, en tant qu'utilisateur `userId`. */
  function asUser<T>(
    userId: string,
    work: (
      tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>,
    ) => Promise<T>,
  ) {
    return appRole.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
      return work(tx);
    });
  }

  beforeAll(async () => {
    t = await createTestApp();
    appRole = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
  });
  beforeEach(async () => {
    await t.reset();
    a = await actor(t, 'Kaseba');
    b = await actor(t, 'Mwamba');
    orgA = await createOrg(a, 'Kaseba Import');
    orgB = await createOrg(b, 'Mwamba Express');
    // Données chez A dans chaque table : une invitation en attente, une zone desservie.
    const zone = await t.prisma.serviceZone.findFirstOrThrow({ where: { name: 'Kampemba' } });
    await a.agent
      .put('/api/org/service-zones', {
        zones: [{ serviceZoneId: zone.id, handoverModes: ['pickup'], localFee: null }],
      })
      .set(...asOrg(orgA))
      .expect(200);
    await a.agent
      .postFile('/api/org/verification/documents', { kind: 'rccm' }, PDF, 'rccm.pdf')
      .set(...asOrg(orgA))
      .expect(201);
    // Une demande de devis reçue par A (A approuvée le temps de l'envoi).
    const slugA = await approveOrg(t, orgA);
    const buyer = await actor(t, 'Acheteuse');
    const lub = await t.prisma.city.findUniqueOrThrow({ where: { name: 'Lubumbashi' } });
    await buyer.agent
      .put('/api/me/profile', { displayName: 'Acheteuse', cityId: lub.id })
      .expect(200);
    const draft = await buyer.agent
      .post('/api/requests/draft/items', { source: 'manual', title: 'Article test', quantity: 1 })
      .expect(201);
    await buyer.agent
      .post(`/api/requests/${draft.body.id}/send`, { commissioners: [slugA] })
      .expect(201);
    const quote = await a.agent
      .post(`/api/org/requests/${draft.body.id}/quote`)
      .set(...asOrg(orgA))
      .expect(201);
    await a.agent
      .put(`/api/org/quotes/${quote.body.id}/draft`, {
        currency: 'USD',
        validUntil: new Date(Date.now() + 86_400_000).toISOString(),
        leadTimeMinDays: 7,
        leadTimeMaxDays: 14,
        lines: [
          {
            kind: 'product',
            quoteRequestItemId: draft.body.items[0].id,
            description: 'Article test',
            quantity: 1,
            unitAmount: 1000,
          },
        ],
      })
      .set(...asOrg(orgA))
      .expect(200);
    const sentQ = await a.agent
      .post(`/api/org/quotes/${quote.body.id}/send`)
      .set(...asOrg(orgA))
      .expect(201);
    const accepted = await buyer.agent
      .post(`/api/quotes/${quote.body.id}/accept`, { versionId: sentQ.body.current.id })
      .expect(201);
    await a.agent
      .post(`/api/org/orders/${accepted.body.orderId}/adjustments`, {
        amountDelta: 500,
        reason: 'Hausse du transport',
      })
      .set(...asOrg(orgA))
      .expect(201);
    await buyer.agent
      .post(`/api/orders/${accepted.body.orderId}/payments`, {
        method: 'mobile_money',
        provider: 'M-Pesa',
        amount: 500,
        currency: 'USD',
        reference: 'MP-TEST',
        idempotencyKey: '00000000-0000-4000-8000-000000000001',
      })
      .expect(201);
    // Un achat fournisseur (coûts réels) avec sa preuve, sur fonds propres.
    await a.agent
      .put(`/api/org/orders/${accepted.body.orderId}/purchase-rule`, { rule: 'own_funds' })
      .set(...asOrg(orgA))
      .expect(200);
    const proof = await a.agent
      .postFile('/api/org/purchase-proofs', {}, PDF, 'achat.pdf')
      .set(...asOrg(orgA))
      .expect(201);
    const orderA = await a.agent
      .get(`/api/org/orders/${accepted.body.orderId}`)
      .set(...asOrg(orgA))
      .expect(200);
    const so = await a.agent
      .post('/api/org/supplier-orders', {
        marketplace: 'shein',
        storeName: 'SHEIN',
        purchasedAt: new Date().toISOString(),
        amount: 700,
        currency: 'USD',
        proofFileId: proof.body.fileId,
        items: [{ orderItemId: orderA.body.items[0].id, quantity: 1 }],
      })
      .set(...asOrg(orgA))
      .expect(201);
    // Un colis avec cet article reçu, et sa photo.
    await a.agent
      .post(`/api/org/supplier-orders/${so.body.id}/receive`, {
        items: [{ orderItemId: orderA.body.items[0].id, qtyReceived: 1 }],
      })
      .set(...asOrg(orgA))
      .expect(201);
    const parcel = await a.agent
      .post('/api/org/parcels', {})
      .set(...asOrg(orgA))
      .expect(201);
    await a.agent
      .post(`/api/org/parcels/${parcel.body.id}/items`, {
        items: [{ orderItemId: orderA.body.items[0].id, quantity: 1 }],
      })
      .set(...asOrg(orgA))
      .expect(201);
    await a.agent
      .postFile(`/api/org/parcels/${parcel.body.id}/photos`, {}, PNG, 'colis.png')
      .set(...asOrg(orgA))
      .expect(201);
    // Un itinéraire propre à A, une étape, une expédition avec ce colis.
    await a.agent
      .post('/api/org/route-templates', {
        name: 'Avion direct',
        mode: 'air',
        steps: [
          { code: 'received_origin_warehouse' },
          { code: 'shipped_to_drc' },
          { code: 'delivered' },
        ],
      })
      .set(...asOrg(orgA))
      .expect(201);
    await a.agent
      .patch(`/api/org/parcels/${parcel.body.id}`, { weightG: 1200 })
      .set(...asOrg(orgA))
      .expect(200);
    await a.agent
      .post(`/api/org/parcels/${parcel.body.id}/events`, {
        kind: 'step',
        stepCode: 'received_origin_warehouse',
      })
      .set(...asOrg(orgA))
      .expect(201);
    await a.agent
      .post(`/api/org/parcels/${parcel.body.id}/close`)
      .set(...asOrg(orgA))
      .expect(201);
    const shipment = await a.agent
      .post('/api/org/shipments', { mode: 'air', origin: 'Guangzhou', destination: 'Lubumbashi' })
      .set(...asOrg(orgA))
      .expect(201);
    await a.agent
      .post(`/api/org/shipments/${shipment.body.id}/parcels`, { parcelIds: [parcel.body.id] })
      .set(...asOrg(orgA))
      .expect(201);
    await a.agent
      .post(`/api/org/shipments/${shipment.body.id}/events`, {
        kind: 'step',
        stepCode: 'shipped_to_drc',
      })
      .set(...asOrg(orgA))
      .expect(201);
    await t.prisma.organization.update({ where: { id: orgA }, data: { status: 'pending' } });
    await a.agent
      .postFile(
        '/api/org/customers/import',
        {},
        Buffer.from('Nom;Téléphone\nImporté;0810000002\n'),
        'clients.csv',
      )
      .set(...asOrg(orgA))
      .expect(201);
    await a.agent
      .post('/api/org/customers', { fullName: 'Client de A', phoneWhatsapp: '0810000001' })
      .set(...asOrg(orgA))
      .expect(201);
    await a.agent
      .post('/api/org/invitations', { email: 'agent@example.test', role: 'sales' })
      .set(...asOrg(orgA))
      .expect(204);
  });
  afterAll(async () => {
    await appRole.$disconnect();
    await t.app.close();
  });

  describe('en SQL direct, avec le rôle applicatif', () => {
    it.each(TENANT_TABLES)(
      'B ne lit aucune ligne de A dans $table',
      async ({ table, orgColumn }) => {
        const asA = await asUser(a.userId, (tx) =>
          tx.$queryRawUnsafe<{ n: bigint }[]>(
            `SELECT count(*) AS n FROM ${table} WHERE ${orgColumn} = $1::uuid`,
            orgA,
          ),
        );
        expect(Number(asA[0]?.n)).toBeGreaterThan(0);

        const asB = await asUser(b.userId, (tx) =>
          tx.$queryRawUnsafe<{ n: bigint }[]>(
            `SELECT count(*) AS n FROM ${table} WHERE ${orgColumn} = $1::uuid`,
            orgA,
          ),
        );
        expect(Number(asB[0]?.n)).toBe(0);
      },
    );

    it.each(TENANT_TABLES)(
      'sans utilisateur fixé, aucune ligne de $table n’est visible',
      async ({ table, orgColumn }) => {
        const rows = await appRole.$queryRawUnsafe<{ n: bigint }[]>(
          `SELECT count(*) AS n FROM ${table} WHERE ${orgColumn} = $1::uuid`,
          orgA,
        );
        expect(Number(rows[0]?.n)).toBe(0);
      },
    );

    it('B ne peut ni renommer A, ni s’y ajouter, ni modifier ses membres ou invitations', async () => {
      const renamed = await asUser(
        b.userId,
        (tx) => tx.$executeRaw`UPDATE organizations SET name = 'piraté' WHERE id = ${orgA}::uuid`,
      );
      expect(renamed).toBe(0);

      await expect(
        asUser(
          b.userId,
          (tx) =>
            tx.$executeRaw`INSERT INTO organization_members (id, organization_id, user_id, role, updated_at)
                         VALUES (gen_random_uuid(), ${orgA}::uuid, ${b.userId}::uuid, 'owner', now())`,
        ),
      ).rejects.toThrow(/row-level security/);

      const roles = await asUser(
        b.userId,
        (tx) =>
          tx.$executeRaw`UPDATE organization_members SET role = 'courier' WHERE organization_id = ${orgA}::uuid`,
      );
      expect(roles).toBe(0);

      await expect(
        asUser(
          b.userId,
          (tx) =>
            tx.$executeRaw`INSERT INTO invitations (id, organization_id, email, role, token_hash, invited_by, expires_at)
                         VALUES (gen_random_uuid(), ${orgA}::uuid, 'x@example.test', 'owner', 'h', ${b.userId}::uuid, now() + interval '1 day')`,
        ),
      ).rejects.toThrow(/row-level security/);
    });

    it('un propriétaire ne peut pas approuver lui-même son organisation', async () => {
      await expect(
        asUser(
          a.userId,
          (tx) =>
            tx.$executeRaw`UPDATE organizations SET status = 'approved' WHERE id = ${orgA}::uuid`,
        ),
      ).rejects.toThrow(/permission denied/);
    });

    it.each(SYSTEM_ONLY_TABLES)('le rôle applicatif n’a aucun accès à %s', async (table) => {
      await expect(
        asUser(a.userId, (tx) => tx.$queryRawUnsafe(`SELECT 1 FROM ${table} LIMIT 1`)),
      ).rejects.toThrow(/permission denied/);
    });

    it('le rôle applicatif ne lit jamais les mots de passe', async () => {
      await expect(
        asUser(a.userId, (tx) => tx.$queryRaw`SELECT password_hash FROM users`),
      ).rejects.toThrow(/permission denied/);
    });

    it('B ne voit pas les comptes de l’équipe de A', async () => {
      const rows = await asUser(
        b.userId,
        (tx) => tx.$queryRaw<{ id: string }[]>`SELECT id FROM users WHERE id = ${a.userId}::uuid`,
      );
      expect(rows).toHaveLength(0);
    });

    it('une organisation approuvée devient visible dans l’annuaire, sans ses membres', async () => {
      await t.prisma.organization.update({ where: { id: orgA }, data: { status: 'approved' } });
      const orgs = await asUser(
        b.userId,
        (tx) =>
          tx.$queryRaw<{ id: string }[]>`SELECT id FROM organizations WHERE id = ${orgA}::uuid`,
      );
      expect(orgs).toHaveLength(1);
      const members = await asUser(
        b.userId,
        (tx) =>
          tx.$queryRaw<
            { id: string }[]
          >`SELECT id FROM organization_members WHERE organization_id = ${orgA}::uuid`,
      );
      expect(members).toHaveLength(0);
    });
  });

  describe('par l’API', () => {
    it('B reçoit 403 en se présentant comme membre de A', async () => {
      await b.agent
        .get('/api/org')
        .set(...asOrg(orgA))
        .expect(403);
      await b.agent
        .get('/api/org/members')
        .set(...asOrg(orgA))
        .expect(403);
      await b.agent
        .post('/api/org/invitations', { email: 'x@example.test', role: 'sales' })
        .set(...asOrg(orgA))
        .expect(403);
    });

    it('chacun ne voit que ses propres organisations', async () => {
      const mineA = await a.agent.get('/api/organizations/mine').expect(200);
      expect(mineA.body.map((o: { organizationId: string }) => o.organizationId)).toEqual([orgA]);
      const mineB = await b.agent.get('/api/organizations/mine').expect(200);
      expect(mineB.body.map((o: { organizationId: string }) => o.organizationId)).toEqual([orgB]);
    });

    it('exige l’en-tête d’organisation', async () => {
      await a.agent.get('/api/org').expect(400);
    });
  });
});

describe('Rôles et invitations dans une organisation', () => {
  let t: TestContext;
  let owner: Actor;
  let orgId: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await t.reset();
    owner = await actor(t, 'Kaseba');
    orgId = await createOrg(owner, 'Kaseba Import');
  });
  afterAll(async () => {
    await t.app.close();
  });

  it('un compte non vérifié ne peut pas créer d’organisation', async () => {
    const newbie = await actor(t, 'Nouveau', false);
    await newbie.agent
      .post('/api/organizations', { name: 'Test', type: 'independent' })
      .expect(403);
  });

  it('une nouvelle organisation est « en attente » et son créateur en est propriétaire', async () => {
    const res = await owner.agent
      .get('/api/org')
      .set(...asOrg(orgId))
      .expect(200);
    expect(res.body.status).toBe('pending');
    const members = await owner.agent
      .get('/api/org/members')
      .set(...asOrg(orgId))
      .expect(200);
    expect(members.body).toMatchObject([{ displayName: 'Kaseba', role: 'owner' }]);
  });

  it('un commercial voit l’équipe mais ne peut ni inviter ni modifier le profil', async () => {
    const sales = await actor(t, 'Grace');
    await addMember(t, orgId, sales.userId, 'sales');
    await sales.agent
      .get('/api/org/members')
      .set(...asOrg(orgId))
      .expect(200);
    await sales.agent
      .post('/api/org/invitations', { email: 'x@example.test', role: 'sales' })
      .set(...asOrg(orgId))
      .expect(403);
    await sales.agent
      .patch('/api/org', { name: 'Renommé' })
      .set(...asOrg(orgId))
      .expect(403);
    await owner.agent
      .patch('/api/org', { name: 'Kaseba Import SARL' })
      .set(...asOrg(orgId))
      .expect(204);
  });

  it('invitation : la bonne personne rejoint l’équipe avec le rôle prévu ; le lien ne sert qu’une fois', async () => {
    await owner.agent
      .post('/api/org/invitations', { email: 'patrick@example.test', role: 'accountant' })
      .set(...asOrg(orgId))
      .expect(204);
    const token = tokenFrom(t.outbox.lastTo('patrick@example.test')?.text);

    const intruder = await actor(t, 'Intrus');
    await intruder.agent.post('/api/invitations/accept', { token }).expect(403);

    const patrick = await actor(t, 'Patrick');
    const res = await patrick.agent.post('/api/invitations/accept', { token }).expect(201);
    expect(res.body).toMatchObject({ organizationId: orgId, role: 'accountant' });
    await patrick.agent
      .get('/api/org/members')
      .set(...asOrg(orgId))
      .expect(200);

    await patrick.agent.post('/api/invitations/accept', { token }).expect(400);
  });

  it('l’organisation garde toujours au moins un propriétaire', async () => {
    const members = await owner.agent.get('/api/org/members').set(...asOrg(orgId));
    const self = members.body[0].id as string;
    await owner.agent
      .delete(`/api/org/members/${self}`)
      .set(...asOrg(orgId))
      .expect(409);
  });

  it('un membre retiré perd immédiatement l’accès', async () => {
    const sales = await actor(t, 'Grace');
    const m = await addMember(t, orgId, sales.userId, 'sales');
    await owner.agent
      .delete(`/api/org/members/${m.id}`)
      .set(...asOrg(orgId))
      .expect(204);
    await sales.agent
      .get('/api/org')
      .set(...asOrg(orgId))
      .expect(403);
  });
});
