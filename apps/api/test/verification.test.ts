import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTestApp, type TestContext } from './app';
import { actor, addMember, asOrg, createOrg, PDF, PNG, type Actor } from './fixtures';

describe('Profil professionnel et vérification', () => {
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

  const upload = (who: Actor, kind: string, content = PDF, name = `${kind}.pdf`) =>
    who.agent
      .postFile('/api/org/verification/documents', { kind }, content, name)
      .set(...asOrg(orgId));

  it('le propriétaire complète son profil (marketplaces, transports, politique tarifaire)', async () => {
    await owner.agent
      .patch('/api/org', {
        marketplaces: ['shein', 'aliexpress', 'amazon', 'alibaba'],
        transportModes: ['air', 'sea'],
        pricingPolicy: 'Commission de 10 % ; transport au kilo.',
      })
      .set(...asOrg(orgId))
      .expect(204);
    const res = await owner.agent
      .get('/api/org')
      .set(...asOrg(orgId))
      .expect(200);
    expect(res.body).toMatchObject({
      marketplaces: ['shein', 'aliexpress', 'amazon', 'alibaba'],
      transportModes: ['air', 'sea'],
    });
    await owner.agent
      .patch('/api/org', { marketplaces: ['inconnue'] })
      .set(...asOrg(orgId))
      .expect(400);
  });

  it('dépose RCCM et pièce d’identité, puis soumet le dossier', async () => {
    const first = await upload(owner, 'rccm').expect(201);
    expect(first.body).toMatchObject({
      status: 'draft',
      documents: [{ kind: 'rccm', originalName: 'rccm.pdf' }],
    });
    await owner.agent
      .post('/api/org/verification/submit')
      .set(...asOrg(orgId))
      .expect(400);

    await upload(owner, 'identity', PNG, 'carte-electeur.png').expect(201);
    const submitted = await owner.agent
      .post('/api/org/verification/submit')
      .set(...asOrg(orgId))
      .expect(201);
    expect(submitted.body.status).toBe('submitted');

    // Dossier en cours d'examen : plus de modification possible.
    await upload(owner, 'rccm').expect(409);
    const actions = (
      await t.prisma.auditLog.findMany({ where: { organizationId: orgId }, orderBy: { id: 'asc' } })
    ).map((a) => a.action);
    expect(actions).toEqual([
      'org.created',
      'verification.document_uploaded',
      'verification.document_uploaded',
      'verification.submitted',
    ]);
  });

  it('remplacer un document garde un seul document par type', async () => {
    await upload(owner, 'rccm').expect(201);
    const res = await upload(owner, 'rccm', PDF, 'rccm-v2.pdf').expect(201);
    expect(res.body.documents).toEqual([
      expect.objectContaining({ kind: 'rccm', originalName: 'rccm-v2.pdf' }),
    ]);
  });

  it('refuse un format non accepté, même renommé en .pdf, et un fichier trop lourd', async () => {
    await upload(owner, 'rccm', Buffer.from('MZ exécutable déguisé'), 'rccm.pdf').expect(400);
    const big = Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]);
    await upload(owner, 'rccm', big).expect(413);
    await upload(owner, 'passeport-inconnu').expect(400);
  });

  it('stocke le document chiffré sur le disque et le restitue intact au propriétaire', async () => {
    const res = await upload(owner, 'rccm').expect(201);
    const file = await t.prisma.storedFile.findFirstOrThrow({ where: { organizationId: orgId } });
    const onDisk = await readFile(join(process.env.FILE_STORAGE_DIR!, file.storageKey));
    expect(onDisk.includes(Buffer.from('document de test Konzia'))).toBe(false);

    const download = await owner.agent
      .get(`/api/org/verification/documents/${res.body.documents[0].id}`)
      .set(...asOrg(orgId))
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(download.headers['content-type']).toBe('application/pdf');
    expect(download.headers['cache-control']).toBe('private, no-store');
    expect(Buffer.compare(download.body as Buffer, PDF)).toBe(0);
    expect(
      (await readdir(join(process.env.FILE_STORAGE_DIR!, 'verification'))).length,
    ).toBeGreaterThan(0);
  });

  it('seul le propriétaire accède au dossier ; un autre commissionnaire ne voit rien', async () => {
    const res = await upload(owner, 'rccm').expect(201);
    const docId = res.body.documents[0].id;

    const sales = await actor(t, 'Grace');
    await addMember(t, orgId, sales.userId, 'sales');
    await sales.agent
      .get('/api/org/verification')
      .set(...asOrg(orgId))
      .expect(403);
    await sales.agent
      .get(`/api/org/verification/documents/${docId}`)
      .set(...asOrg(orgId))
      .expect(403);

    const other = await actor(t, 'Mwamba');
    const otherOrg = await createOrg(other, 'Mwamba Express');
    await other.agent
      .get(`/api/org/verification/documents/${docId}`)
      .set(...asOrg(otherOrg))
      .expect(404);
  });

  it('le propriétaire ne peut pas s’approuver lui-même', async () => {
    await upload(owner, 'rccm').expect(201);
    await upload(owner, 'identity').expect(201);
    await owner.agent
      .post('/api/org/verification/submit')
      .set(...asOrg(orgId))
      .expect(201);
    const appRole = new (await import('@konzia/db')).PrismaClient({
      datasourceUrl: process.env.APP_DATABASE_URL,
    });
    try {
      const updated = await appRole.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.user_id', ${owner.userId}, true)`;
        return tx.$executeRaw`UPDATE organization_verifications SET status = 'approved' WHERE organization_id = ${orgId}::uuid`;
      });
      expect(updated).toBe(0);
    } finally {
      await appRole.$disconnect();
    }
  });
});
