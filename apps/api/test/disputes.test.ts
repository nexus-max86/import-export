import { PrismaClient } from '@konzia/db';
import { createTestApp, type TestContext } from './app';
import {
  actor,
  addMember,
  approveOrg,
  createOrg,
  makeAdmin,
  PNG,
  asOrg,
  type Actor,
} from './fixtures';
import { receivedOrder } from './logistics-fixtures';

/** Litiges (ticket #28) : ouverture avec preuves, réponse, décision, clôture, réouverture. */
describe('Litiges', () => {
  let t: TestContext;
  let appRole: PrismaClient;
  let admin: Actor;
  let kaseba: Actor;
  let vendeuse: Actor;
  let acheteur: Actor;
  let ruth: Actor;
  let orgK: string;
  let orderId: string;

  const asK = <T extends { set: (k: string, v: string) => T }>(req: T) => req.set(...asOrg(orgK));

  async function openDispute() {
    const proof = await ruth.agent
      .postFile('/api/dispute-evidence', {}, PNG, 'robe-dechiree.png')
      .expect(201);
    const res = await ruth.agent
      .post(`/api/orders/${orderId}/disputes`, {
        category: 'damaged',
        description: 'La robe est arrivée déchirée au niveau de la couture.',
        fileIds: [proof.body.fileId],
      })
      .expect(201);
    return { id: res.body.id as string, fileId: proof.body.fileId as string };
  }

  beforeAll(async () => {
    t = await createTestApp();
    appRole = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
  });
  beforeEach(async () => {
    await t.reset();
    admin = await makeAdmin(t, await actor(t, 'Admin'));
    kaseba = await actor(t, 'Kaseba');
    orgK = await createOrg(kaseba, 'Kaseba Import');
    const slug = await approveOrg(t, orgK);
    vendeuse = await actor(t, 'Vendeuse');
    await addMember(t, orgK, vendeuse.userId, 'sales');
    acheteur = await actor(t, 'Acheteur');
    await addMember(t, orgK, acheteur.userId, 'buyer');
    ruth = await actor(t, 'Ruth');
    orderId = (await receivedOrder(t, kaseba, orgK, slug, ruth)).id;
  });
  afterAll(async () => {
    await appRole.$disconnect();
    await t.app.close();
  });

  it('parcours complet : ouverture, réponse, décision, clôture — chacun notifié', async () => {
    const { id, fileId } = await openDispute();
    const opened = await ruth.agent.get(`/api/disputes/${id}`).expect(200);
    expect(opened.body).toMatchObject({
      status: 'awaiting_commissioner',
      category: 'damaged',
      organizationName: 'Kaseba Import',
    });
    expect(opened.body.messages[0].files).toEqual([{ id: fileId, name: 'robe-dechiree.png' }]);
    // Un seul litige en cours par commande.
    await ruth.agent
      .post(`/api/orders/${orderId}/disputes`, {
        category: 'other',
        description: 'Encore un problème.',
      })
      .expect(409);

    const kasebaNotif = (await kaseba.agent.get('/api/notifications')).body.find(
      (n: { type: string }) => n.type === 'dispute_updated',
    );
    expect(kasebaNotif.link).toBe(`/pro/litiges/${id}`);
    const proof = await asK(kaseba.agent.get(`/api/org/disputes/${id}/files/${fileId}`)).expect(
      200,
    );
    expect(proof.headers['content-type']).toBe('image/png');

    const answered = await asK(
      vendeuse.agent.post(`/api/org/disputes/${id}/messages`, {
        body: 'Nous proposons un remboursement partiel de 10 $.',
      }),
    ).expect(201);
    expect(answered.body.status).toBe('under_review');
    expect(answered.body.messages[1].authorName).toBe('Vendeuse (Kaseba Import)');

    const decided = await admin.agent
      .post(`/api/admin/disputes/${id}/resolve`, {
        resolution: 'Remboursement de 10 $ par le commissionnaire, sous 7 jours.',
      })
      .expect(201);
    expect(decided.body.status).toBe('resolved');
    await admin.agent.post(`/api/admin/disputes/${id}/close`).expect(201);
    const final = await ruth.agent.get(`/api/disputes/${id}`).expect(200);
    expect(final.body).toMatchObject({
      status: 'closed',
      resolution: expect.stringMatching(/^Remboursement/),
    });
    const ruthTypes = (await ruth.agent.get('/api/notifications')).body
      .filter((n: { type: string }) => n.type === 'dispute_updated')
      .map((n: { body: string }) => n.body);
    expect(ruthTypes).toHaveLength(3); // réponse, décision, clôture
  });

  it('un litige clos est figé : seule une réouverture motivée par l’administration', async () => {
    const { id } = await openDispute();
    await admin.agent.post(`/api/admin/disputes/${id}/close`).expect(409); // pas de décision
    await admin.agent
      .post(`/api/admin/disputes/${id}/resolve`, {
        resolution: 'Échange de l’article par le commissionnaire.',
      })
      .expect(201);
    await admin.agent.post(`/api/admin/disputes/${id}/close`).expect(201);
    await ruth.agent
      .post(`/api/disputes/${id}/messages`, { body: 'Je ne suis pas d’accord.' })
      .expect(409);
    // Même en base, avec le rôle propriétaire : le déclencheur refuse toute modification.
    await expect(
      t.prisma.$executeRaw`UPDATE disputes SET resolution = 'modifiée' WHERE id = ${id}::uuid`,
    ).rejects.toThrow(/litige clos/);
    await expect(
      t.prisma.$executeRaw`DELETE FROM disputes WHERE id = ${id}::uuid`,
    ).rejects.toThrow();

    await admin.agent.post(`/api/admin/disputes/${id}/reopen`, { reason: '' }).expect(400);
    const reopened = await admin.agent
      .post(`/api/admin/disputes/${id}/reopen`, { reason: 'Nouvelles photos reçues par e-mail.' })
      .expect(201);
    expect(reopened.body).toMatchObject({
      status: 'under_review',
      reopenReason: 'Nouvelles photos reçues par e-mail.',
    });
    const audit = await t.prisma.auditLog.findMany({
      where: { entityId: id, action: { startsWith: 'dispute.' } },
      select: { action: true, actorRole: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map((a) => a.action)).toEqual([
      'dispute.opened',
      'dispute.resolved',
      'dispute.closed',
      'dispute.reopened',
    ]);
  });

  it('accès : le client et le commissionnaire (propriétaire, commercial) seulement', async () => {
    const { id, fileId } = await openDispute();
    await asK(acheteur.agent.get(`/api/org/disputes/${id}`)).expect(403);
    const intrus = await actor(t, 'Intrus');
    await intrus.agent.get(`/api/disputes/${id}`).expect(404);
    await intrus.agent.get(`/api/disputes/${id}/files/${fileId}`).expect(404);
    const autre = await actor(t, 'Mwamba');
    const orgM = await createOrg(autre, 'Mwamba Express');
    await autre.agent
      .get(`/api/org/disputes/${id}`)
      .set(...asOrg(orgM))
      .expect(404);
    await kaseba.agent.get('/api/admin/disputes').expect(403);

    const rows = await appRole.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${intrus.userId}, true)`;
      return tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM dispute_messages`;
    });
    expect(Number(rows[0]!.n)).toBe(0);
    // Une preuve d'un autre utilisateur ne peut pas être jointe.
    const other = await intrus.agent
      .postFile('/api/dispute-evidence', {}, PNG, 'x.png')
      .expect(201);
    await ruth.agent
      .post(`/api/disputes/${id}/messages`, {
        body: 'Voici une photo.',
        fileIds: [other.body.fileId],
      })
      .expect(400);
  });

  it('la console compte et liste les litiges ouverts, lecture journalisée', async () => {
    await openDispute();
    expect((await admin.agent.get('/api/admin/overview')).body.disputesOpen).toBe(1);
    const list = await admin.agent.get('/api/admin/disputes?status=open').expect(200);
    expect(list.body.total).toBe(1);
    expect(
      await t.prisma.auditLog.count({ where: { action: 'admin.read', entityType: 'disputes' } }),
    ).toBe(1);
  });
});
