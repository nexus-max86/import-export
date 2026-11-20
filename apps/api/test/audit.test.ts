import { PrismaClient } from '@konzia/db';
import { createTestApp, tokenFrom, type TestContext } from './app';
import { actor, addMember, asOrg, createOrg, type Actor } from './fixtures';

describe('Journal d’audit', () => {
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

  const actions = async () =>
    (
      await t.prisma.auditLog.findMany({ where: { organizationId: orgId }, orderBy: { id: 'asc' } })
    ).map((e) => e.action);

  it('trace la création de l’organisation', async () => {
    expect(await actions()).toEqual(['org.created']);
  });

  it('trace un changement de rôle avec l’acteur, l’ancienne et la nouvelle valeur', async () => {
    const grace = await actor(t, 'Grace');
    const member = await addMember(t, orgId, grace.userId, 'sales');
    await owner.agent
      .patch(`/api/org/members/${member.id}`, { role: 'accountant' })
      .set(...asOrg(orgId))
      .expect(204);

    const entry = await t.prisma.auditLog.findFirstOrThrow({
      where: { action: 'org.member.role_changed' },
    });
    expect(entry).toMatchObject({
      actorUserId: owner.userId,
      actorRole: 'owner',
      organizationId: orgId,
      entityId: member.id,
      before: { role: 'sales' },
      after: { role: 'accountant' },
    });
  });

  it('trace la modification du profil (avant/après) et le parcours d’invitation complet', async () => {
    await owner.agent
      .patch('/api/org', { name: 'Kaseba Import SARL' })
      .set(...asOrg(orgId))
      .expect(204);
    await owner.agent
      .post('/api/org/invitations', { email: 'patrick@example.test', role: 'sales' })
      .set(...asOrg(orgId))
      .expect(204);
    // Lire le lien d'invitation avant l'inscription de Patrick (qui reçoit ensuite un autre e-mail).
    const token = tokenFrom(t.outbox.lastTo('patrick@example.test')?.text);
    const patrick = await actor(t, 'Patrick');
    await patrick.agent.post('/api/invitations/accept', { token }).expect(201);
    const members = await owner.agent.get('/api/org/members').set(...asOrg(orgId));
    const pm = members.body.find((m: { email: string }) => m.email === 'patrick@example.test');
    await owner.agent
      .delete(`/api/org/members/${pm.id}`)
      .set(...asOrg(orgId))
      .expect(204);

    expect(await actions()).toEqual([
      'org.created',
      'org.updated',
      'org.member.invited',
      'org.member.joined',
      'org.member.removed',
    ]);
    const updated = await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'org.updated' } });
    expect(updated.before).toMatchObject({ name: 'Kaseba Import' });
    expect(updated.after).toMatchObject({ name: 'Kaseba Import SARL' });
  });

  it('trace la réinitialisation d’un mot de passe', async () => {
    await t.agent().post('/api/auth/password/forgot', { email: owner.email }).expect(204);
    const token = tokenFrom(t.outbox.lastTo(owner.email)?.text);
    await t
      .agent()
      .post('/api/auth/password/reset', { token, password: 'nouveau-mot-de-passe-99' })
      .expect(204);
    const entry = await t.prisma.auditLog.findFirstOrThrow({
      where: { action: 'auth.password_reset' },
    });
    expect(entry.actorUserId).toBe(owner.userId);
  });

  it('est immuable, même pour le rôle propriétaire de la base', async () => {
    await expect(t.prisma.$executeRaw`UPDATE audit_logs SET action = 'falsifié'`).rejects.toThrow(
      /insertion seule/,
    );
    await expect(t.prisma.$executeRaw`DELETE FROM audit_logs`).rejects.toThrow(/insertion seule/);
  });

  it('le rôle applicatif ne peut ni modifier ni écrire au nom d’un autre', async () => {
    const appRole = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
    try {
      const run = <T>(work: (tx: PrismaClient) => Promise<T>) =>
        appRole.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.user_id', ${owner.userId}, true)`;
          return work(tx as unknown as PrismaClient);
        });
      await expect(run((tx) => tx.$executeRaw`UPDATE audit_logs SET reason = 'x'`)).rejects.toThrow(
        /permission denied/,
      );
      await expect(run((tx) => tx.$executeRaw`DELETE FROM audit_logs`)).rejects.toThrow(
        /permission denied/,
      );
      const other = await actor(t, 'Autre');
      await expect(
        run(
          (
            tx,
          ) => tx.$executeRaw`INSERT INTO audit_logs (id, actor_user_id, actor_role, organization_id, action, entity_type)
                                 VALUES (gen_random_uuid(), ${other.userId}::uuid, 'owner', ${orgId}::uuid, 'faux', 'x')`,
        ),
      ).rejects.toThrow(/row-level security/);
    } finally {
      await appRole.$disconnect();
    }
  });

  it('le propriétaire lit le journal de son organisation ; un commercial ne le peut pas', async () => {
    const res = await owner.agent
      .get('/api/org/audit')
      .set(...asOrg(orgId))
      .expect(200);
    expect(res.body.items.map((i: { action: string }) => i.action)).toEqual(['org.created']);
    expect(res.body.next).toBeNull();

    const grace = await actor(t, 'Grace');
    await addMember(t, orgId, grace.userId, 'sales');
    await grace.agent
      .get('/api/org/audit')
      .set(...asOrg(orgId))
      .expect(403);
  });
});
