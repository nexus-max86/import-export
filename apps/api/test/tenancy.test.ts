import { PrismaClient } from '@konzia/db';
import { createTestApp, tokenFrom, type TestContext } from './app';
import { actor, addMember, asOrg, createOrg, type Actor } from './fixtures';
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
