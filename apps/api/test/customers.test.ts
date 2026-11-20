import { PrismaClient } from '@konzia/db';
import { createTestApp, type TestContext } from './app';
import { actor, addMember, asOrg, createOrg, type Actor } from './fixtures';

describe('Clients du commissionnaire', () => {
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

  const patrick = {
    fullName: 'Patrick Mbuyi',
    phoneWhatsapp: '081 234 5678',
    notesPrivate: 'Paie toujours en retard',
  };

  async function createPatrick() {
    const res = await owner.agent
      .post('/api/org/customers', patrick)
      .set(...asOrg(orgId))
      .expect(201);
    return res.body as { id: string; phoneWhatsapp: string; hasAccount: boolean; source: string };
  }

  async function claimToken(customerId: string) {
    const res = await owner.agent
      .post(`/api/org/customers/${customerId}/claim-link`)
      .set(...asOrg(orgId))
      .expect(201);
    const token = new URL(res.body.link).searchParams.get('jeton');
    if (!token) throw new Error('jeton absent');
    return { token, body: res.body as { whatsapp: string | null } };
  }

  it('crée un client géré, sans compte, avec numéro normalisé, et l’audite', async () => {
    const c = await createPatrick();
    expect(c).toMatchObject({
      phoneWhatsapp: '+243812345678',
      hasAccount: false,
      source: 'manual',
    });
    const audit = await t.prisma.auditLog.findFirstOrThrow({
      where: { action: 'customer.created' },
    });
    expect(audit.entityId).toBe(c.id);
  });

  it('exige un numéro ou un e-mail, et refuse un numéro déjà utilisé', async () => {
    await owner.agent
      .post('/api/org/customers', { fullName: 'Sans contact' })
      .set(...asOrg(orgId))
      .expect(400);
    await createPatrick();
    await owner.agent
      .post('/api/org/customers', { fullName: 'Autre', phoneWhatsapp: '+243812345678' })
      .set(...asOrg(orgId))
      .expect(409);
  });

  it('recherche par nom ou par numéro', async () => {
    await createPatrick();
    await owner.agent
      .post('/api/org/customers', { fullName: 'Grace Ilunga', email: 'grace@example.test' })
      .set(...asOrg(orgId));
    const byName = await owner.agent
      .get('/api/org/customers?q=mbuyi')
      .set(...asOrg(orgId))
      .expect(200);
    expect(byName.body.items.map((c: { fullName: string }) => c.fullName)).toEqual([
      'Patrick Mbuyi',
    ]);
    const byPhone = await owner.agent
      .get('/api/org/customers?q=2345678')
      .set(...asOrg(orgId))
      .expect(200);
    expect(byPhone.body.items).toHaveLength(1);
  });

  it('un comptable consulte les clients mais ne les modifie pas', async () => {
    const c = await createPatrick();
    const accountant = await actor(t, 'Comptable');
    await addMember(t, orgId, accountant.userId, 'accountant');
    await accountant.agent
      .get(`/api/org/customers/${c.id}`)
      .set(...asOrg(orgId))
      .expect(200);
    await accountant.agent
      .post('/api/org/customers', patrick)
      .set(...asOrg(orgId))
      .expect(403);
    await accountant.agent
      .patch(`/api/org/customers/${c.id}`, patrick)
      .set(...asOrg(orgId))
      .expect(403);
  });

  describe('réclamation du compte par le client', () => {
    it('le lien prépare un message WhatsApp ; le client réclame sa fiche une seule fois', async () => {
      const c = await createPatrick();
      const { token, body } = await claimToken(c.id);
      expect(body.whatsapp).toMatch(/^https:\/\/wa\.me\/243812345678\?text=/);

      const client = await actor(t, 'Patrick');
      const res = await client.agent.post('/api/customers/claim', { token }).expect(201);
      expect(res.body).toEqual({ organizationName: 'Kaseba Import', merged: false });

      const fiche = await owner.agent
        .get(`/api/org/customers/${c.id}`)
        .set(...asOrg(orgId))
        .expect(200);
      expect(fiche.body.hasAccount).toBe(true);
      await client.agent.post('/api/customers/claim', { token }).expect(400);
      await owner.agent
        .post(`/api/org/customers/${c.id}/claim-link`)
        .set(...asOrg(orgId))
        .expect(409);
    });

    it('refuse un lien expiré et un compte dont l’e-mail n’est pas confirmé', async () => {
      const c = await createPatrick();
      const { token } = await claimToken(c.id);
      const unverified = await actor(t, 'NonVerifie', false);
      await unverified.agent.post('/api/customers/claim', { token }).expect(403);

      await t.prisma.orgCustomer.update({
        where: { id: c.id },
        data: { claimTokenExpiresAt: new Date(Date.now() - 1000) },
      });
      const client = await actor(t, 'Patrick');
      await client.agent.post('/api/customers/claim', { token }).expect(400);
    });

    it('fusionne sans doublon la fiche créée à l’inscription dans la fiche réclamée', async () => {
      const c = await createPatrick();
      const client = await actor(t, 'Patrick');
      // Fiche créée automatiquement quand le client a écrit à ce commissionnaire depuis son compte.
      const signup = await t.prisma.orgCustomer.create({
        data: {
          organizationId: orgId,
          userId: client.userId,
          fullName: 'Patrick',
          email: client.email,
          source: 'signup',
        },
      });
      const { token } = await claimToken(c.id);
      const res = await client.agent.post('/api/customers/claim', { token }).expect(201);
      expect(res.body.merged).toBe(true);

      const active = await t.prisma.orgCustomer.findMany({
        where: { organizationId: orgId, userId: client.userId, status: 'active' },
      });
      expect(active.map((r) => r.id)).toEqual([c.id]);
      const old = await t.prisma.orgCustomer.findUniqueOrThrow({ where: { id: signup.id } });
      expect(old).toMatchObject({ status: 'merged', mergedIntoId: c.id });
      const list = await owner.agent.get('/api/org/customers').set(...asOrg(orgId));
      expect(list.body.items).toHaveLength(1);
    });

    it('le client ne lit jamais sa fiche ni les notes privées du commissionnaire', async () => {
      const c = await createPatrick();
      const client = await actor(t, 'Patrick');
      await client.agent
        .post('/api/customers/claim', { token: (await claimToken(c.id)).token })
        .expect(201);
      await client.agent
        .get(`/api/org/customers/${c.id}`)
        .set(...asOrg(orgId))
        .expect(403);
      const appRole = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
      try {
        const rows = await appRole.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.user_id', ${client.userId}, true)`;
          return tx.$queryRaw<{ notes_private: string }[]>`SELECT notes_private FROM org_customers`;
        });
        expect(rows).toEqual([]);
      } finally {
        await appRole.$disconnect();
      }
    });
  });
});
