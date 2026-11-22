import { createTestApp, type TestContext } from './app';
import {
  actor,
  approveOrg,
  asOrg,
  createOrg,
  makeAdmin,
  PASSWORD,
  PDF,
  totpNow,
  type Actor,
} from './fixtures';

/** MFA des administrateurs et décisions motivées (ticket #27). */
describe('Administration : MFA et décisions', () => {
  let t: TestContext;
  let kaseba: Actor;
  let orgK: string;

  async function submitDossier() {
    for (const kind of ['rccm', 'identity'])
      await kaseba.agent
        .postFile('/api/org/verification/documents', { kind }, PDF, `${kind}.pdf`)
        .set(...asOrg(orgK))
        .expect(201);
    await kaseba.agent
      .post('/api/org/verification/submit')
      .set(...asOrg(orgK))
      .expect(201);
  }

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await t.reset();
    kaseba = await actor(t, 'Kaseba');
    orgK = await createOrg(kaseba, 'Kaseba Import');
  });
  afterAll(async () => {
    await t.app.close();
  });

  describe('double authentification', () => {
    it('admin sans MFA : 403 ; activation avec un code valide, puis accès', async () => {
      const admin = await makeAdmin(t, await actor(t, 'Admin'), false);
      const denied = await admin.agent.get('/api/admin/overview').expect(403);
      expect(denied.body.message).toMatch(/Double authentification requise/);
      const setup = await admin.agent.post('/api/auth/mfa/setup').expect(201);
      expect(setup.body.otpauthUrl).toMatch(
        /^otpauth:\/\/totp\/Konzia%3Aadmin%40example\.test\?secret=/,
      );
      await admin.agent.post('/api/auth/mfa/enable', { code: '000000' }).expect(400);
      await admin.agent
        .post('/api/auth/mfa/enable', { code: totpNow(setup.body.secret) })
        .expect(204);
      await admin.agent.get('/api/admin/overview').expect(200);
      const stored = await t.prisma.user.findUniqueOrThrow({ where: { id: admin.userId } });
      expect(stored.mfaSecretEnc).not.toContain(setup.body.secret); // secret chiffré au repos
    });

    it('chaque nouvelle session redemande un code, qui ne sert qu’une fois', async () => {
      const admin = await makeAdmin(t, await actor(t, 'Admin'));
      const laptop = t.agent();
      await laptop.post('/api/auth/login', { email: admin.email, password: PASSWORD }).expect(204);
      await laptop.get('/api/admin/overview').expect(403);
      // Le code déjà utilisé à l'activation est refusé (rejeu).
      await laptop.post('/api/auth/mfa/verify', { code: totpNow(admin.mfaSecret!) }).expect(400);
      await laptop.post('/api/auth/mfa/verify', { code: totpNow(admin.mfaSecret!, 1) }).expect(204);
      await laptop.get('/api/admin/overview').expect(200);
      expect((await laptop.get('/api/auth/mfa')).body).toEqual({ enabled: true, verified: true });
    });

    it('limite les essais de code', async () => {
      const admin = await makeAdmin(t, await actor(t, 'Admin'));
      const other = t.agent();
      await other.post('/api/auth/login', { email: admin.email, password: PASSWORD }).expect(204);
      for (let i = 0; i < 5; i++)
        await other.post('/api/auth/mfa/verify', { code: '111111' }).expect(400);
      await other.post('/api/auth/mfa/verify', { code: '111111' }).expect(429);
    });

    it('un non-administrateur reste refusé même avec MFA', async () => {
      const setup = await kaseba.agent.post('/api/auth/mfa/setup').expect(201);
      await kaseba.agent
        .post('/api/auth/mfa/enable', { code: totpNow(setup.body.secret) })
        .expect(204);
      await kaseba.agent.get('/api/admin/overview').expect(403);
    });
  });

  describe('décisions sur un commissionnaire', () => {
    let admin: Actor;
    beforeEach(async () => {
      admin = await makeAdmin(t, await actor(t, 'Admin'));
    });

    it('approbation du dossier : profil public, responsable notifié, audit', async () => {
      await admin.agent.post(`/api/admin/organizations/${orgK}/approve`, {}).expect(409); // rien à examiner
      await submitDossier();
      await admin.agent.post(`/api/admin/organizations/${orgK}/approve`, {}).expect(204);
      const org = await t.prisma.organization.findUniqueOrThrow({ where: { id: orgK } });
      expect(org.status).toBe('approved');
      expect(org.verifiedAt).not.toBeNull();
      const directory = await t.agent().get('/api/commissioners').expect(200);
      expect(JSON.stringify(directory.body)).toContain('Kaseba Import');
      const notif = (await kaseba.agent.get('/api/notifications')).body[0];
      expect(notif).toMatchObject({ type: 'organization_status', link: '/pro/profil' });
      const audit = await t.prisma.auditLog.findFirst({
        where: { action: 'admin.organization_approved' },
      });
      expect(audit).toMatchObject({ before: { status: 'pending' }, after: { status: 'approved' } });
    });

    it('refus motivé ; le commissionnaire corrige et soumet à nouveau', async () => {
      await submitDossier();
      await admin.agent.post(`/api/admin/organizations/${orgK}/reject`, { reason: '' }).expect(400);
      await admin.agent
        .post(`/api/admin/organizations/${orgK}/reject`, {
          reason: 'RCCM illisible, renvoyez un scan net.',
        })
        .expect(204);
      const v = await kaseba.agent
        .get('/api/org/verification')
        .set(...asOrg(orgK))
        .expect(200);
      expect(v.body).toMatchObject({
        status: 'rejected',
        reason: 'RCCM illisible, renvoyez un scan net.',
      });
      const notif = (await kaseba.agent.get('/api/notifications')).body[0];
      expect(notif.body).toContain('Motif : RCCM illisible');
      await submitDossier();
      await admin.agent.post(`/api/admin/organizations/${orgK}/approve`, {}).expect(204);
    });

    it('suspension : consultation seulement, invisible des clients ; réactivation', async () => {
      await approveOrg(t, orgK);
      await admin.agent
        .post(`/api/admin/organizations/${orgK}/suspend`, {
          reason: 'Plaintes répétées de clients.',
        })
        .expect(204);
      await kaseba.agent
        .get('/api/org/customers')
        .set(...asOrg(orgK))
        .expect(200);
      const blocked = await kaseba.agent
        .post('/api/org/customers', { fullName: 'Client', phoneWhatsapp: '0812345678' })
        .set(...asOrg(orgK))
        .expect(403);
      expect(blocked.body.message).toMatch(/suspendue/);
      const directory = await t.agent().get('/api/commissioners').expect(200);
      expect(JSON.stringify(directory.body)).not.toContain('Kaseba Import');

      await admin.agent
        .post(`/api/admin/organizations/${orgK}/reactivate`, { reason: 'Explications reçues.' })
        .expect(204);
      await kaseba.agent
        .post('/api/org/customers', { fullName: 'Client', phoneWhatsapp: '0812345678' })
        .set(...asOrg(orgK))
        .expect(201);
      const actions = await t.prisma.auditLog.findMany({
        where: { organizationId: orgK, action: { startsWith: 'admin.organization_' } },
        select: { action: true, reason: true },
        orderBy: { createdAt: 'asc' },
      });
      expect(actions).toEqual([
        { action: 'admin.organization_suspended', reason: 'Plaintes répétées de clients.' },
        { action: 'admin.organization_reactivated', reason: 'Explications reçues.' },
      ]);
    });
  });

  describe('décisions sur un utilisateur', () => {
    it('suspension : toutes ses sessions révoquées, connexion refusée ; réactivation', async () => {
      const admin = await makeAdmin(t, await actor(t, 'Admin'));
      await admin.agent
        .post(`/api/admin/users/${kaseba.userId}/suspend`, { reason: 'Fraude signalée.' })
        .expect(204);
      await kaseba.agent.get('/api/auth/me').expect(401);
      await t
        .agent()
        .post('/api/auth/login', { email: kaseba.email, password: PASSWORD })
        .expect(401);
      await admin.agent
        .post(`/api/admin/users/${kaseba.userId}/reactivate`, { reason: 'Vérification faite.' })
        .expect(204);
      await t
        .agent()
        .post('/api/auth/login', { email: kaseba.email, password: PASSWORD })
        .expect(204);
      await admin.agent
        .post(`/api/admin/users/${admin.userId}/suspend`, { reason: 'Test sur soi-même.' })
        .expect(400);
    });
  });
});
