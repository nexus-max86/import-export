import { createTestApp, type TestContext } from './app';
import { actor, approveOrg, asOrg, createOrg, makeAdmin, PDF, type Actor } from './fixtures';
import { receivedOrder } from './logistics-fixtures';

/** Console d'administration en lecture (ticket #26) : toute lecture est journalisée. */
describe('Console d’administration', () => {
  let t: TestContext;
  let admin: Actor;
  let kaseba: Actor;
  let ruth: Actor;
  let orgK: string;

  const reads = () =>
    t.prisma.auditLog.findMany({
      where: { actorUserId: admin.userId },
      select: { action: true, entityType: true, entityId: true, organizationId: true },
      orderBy: { createdAt: 'asc' },
    });

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await t.reset();
    admin = await makeAdmin(t, await actor(t, 'Admin'));
    kaseba = await actor(t, 'Kaseba');
    orgK = await createOrg(kaseba, 'Kaseba Import');
    const slug = await approveOrg(t, orgK);
    ruth = await actor(t, 'Ruth');
    await receivedOrder(t, kaseba, orgK, slug, ruth);
  });
  afterAll(async () => {
    await t.app.close();
  });

  it('réservée à l’administration', async () => {
    await kaseba.agent.get('/api/admin/overview').expect(403);
    await ruth.agent.get('/api/admin/orders').expect(403);
  });

  it('vue globale et listes paginées', async () => {
    const o = await admin.agent.get('/api/admin/overview').expect(200);
    expect(o.body).toMatchObject({
      users: 3,
      organizations: { approved: 1, pending: 0 },
      ordersActive: 1,
      paymentsToVerify: 0,
    });
    const users = await admin.agent.get('/api/admin/users?page=1&pageSize=2').expect(200);
    expect(users.body).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(users.body.items).toHaveLength(2);
    const found = await admin.agent.get('/api/admin/users?q=ruth').expect(200);
    expect(found.body.items.map((u: { email: string }) => u.email)).toEqual(['ruth@example.test']);

    const orgs = await admin.agent.get('/api/admin/organizations').expect(200);
    expect(orgs.body.items[0]).toMatchObject({ name: 'Kaseba Import', members: 1, orders: 1 });
    const orders = await admin.agent.get(`/api/admin/orders?organizationId=${orgK}`).expect(200);
    expect(orders.body.items[0]).toMatchObject({
      organizationName: 'Kaseba Import',
      finalAmount: 13568,
    });
    const payments = await admin.agent.get('/api/admin/payments').expect(200);
    expect(payments.body.total).toBe(1);
    await admin.agent.get('/api/admin/parcels').expect(200);
    await admin.agent.get('/api/admin/orders?pageSize=500').expect(400);
  });

  it('chaque lecture est journalisée, avec l’organisation consultée', async () => {
    await admin.agent.get('/api/admin/overview').expect(200);
    await admin.agent.get(`/api/admin/orders?organizationId=${orgK}`).expect(200);
    await admin.agent.get(`/api/admin/organizations/${orgK}`).expect(200);
    await admin.agent.get('/api/admin/audit').expect(200);
    expect(await reads()).toEqual([
      { action: 'admin.read', entityType: 'overview', entityId: null, organizationId: null },
      { action: 'admin.read', entityType: 'orders', entityId: null, organizationId: orgK },
      { action: 'admin.read', entityType: 'organization', entityId: orgK, organizationId: orgK },
      { action: 'admin.read', entityType: 'audit_logs', entityId: null, organizationId: null },
    ]);
  });

  it('dossier de vérification : pièces consultables, chaque ouverture journalisée', async () => {
    for (const kind of ['rccm', 'identity'])
      await kaseba.agent
        .postFile('/api/org/verification/documents', { kind }, PDF, `${kind}.pdf`)
        .set(...asOrg(orgK))
        .expect(201);
    await kaseba.agent
      .post('/api/org/verification/submit')
      .set(...asOrg(orgK))
      .expect(201);
    const pending = await admin.agent.get('/api/admin/organizations?status=to_review').expect(200);
    expect(pending.body.items.map((o: { id: string }) => o.id)).toEqual([orgK]);
    const detail = await admin.agent.get(`/api/admin/organizations/${orgK}`).expect(200);
    expect(detail.body.verification.status).toBe('submitted');
    expect(detail.body.owners).toEqual([{ displayName: 'Kaseba', email: 'kaseba@example.test' }]);
    const doc = detail.body.verification.documents[0];
    const file = await admin.agent.get(`/api/admin/verification-documents/${doc.id}`).expect(200);
    expect(file.headers['content-type']).toBe('application/pdf');
    const opened = (await reads()).filter((r) => r.action === 'admin.document_opened');
    expect(opened).toEqual([
      {
        action: 'admin.document_opened',
        entityType: 'verification_document',
        entityId: doc.id,
        organizationId: orgK,
      },
    ]);
  });
});
