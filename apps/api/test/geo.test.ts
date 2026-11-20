import request from 'supertest';
import { createTestApp, type TestContext } from './app';
import { actor, addMember, asOrg, createOrg, makeAdmin, type Actor } from './fixtures';

describe('Villes, zones et zones desservies', () => {
  let t: TestContext;
  let admin: Actor;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await t.reset();
    admin = await makeAdmin(t, await actor(t, 'Admin'));
  });
  afterAll(async () => {
    await t.app.close();
  });

  it('au démarrage, seule Lubumbashi est ouverte, avec ses 7 communes', async () => {
    const res = await request(t.app.getHttpServer()).get('/api/cities').expect(200);
    expect(res.body.map((c: { name: string }) => c.name)).toEqual(['Lubumbashi']);
    expect(res.body[0].zones.map((z: { name: string }) => z.name)).toEqual([
      'Annexe',
      'Kamalondo',
      'Kampemba',
      'Katuba',
      'Kenya',
      'Lubumbashi',
      'Rwashi',
    ]);
  });

  it('l’administrateur ouvre une nouvelle ville et ses zones sans modifier le code', async () => {
    const city = await admin.agent.post('/api/admin/cities', { name: 'Kolwezi' }).expect(201);
    expect(city.body.isActive).toBe(false);
    await admin.agent
      .post(`/api/admin/cities/${city.body.id}/zones`, { name: 'Dilala' })
      .expect(204);
    await admin.agent.patch(`/api/admin/cities/${city.body.id}`, { isActive: true }).expect(200);

    const res = await request(t.app.getHttpServer()).get('/api/cities');
    expect(res.body.map((c: { name: string }) => c.name)).toEqual(['Kolwezi', 'Lubumbashi']);

    const audit = await t.prisma.auditLog.findMany({
      where: { actorUserId: admin.userId },
      orderBy: { id: 'asc' },
    });
    expect(audit.map((a) => a.action)).toEqual([
      'geo.city.created',
      'geo.zone.created',
      'geo.city.updated',
    ]);
  });

  it('refuse les doublons de ville', async () => {
    await admin.agent.post('/api/admin/cities', { name: 'Likasi' }).expect(409);
  });

  it('une zone fermée disparaît de la liste publique', async () => {
    const kenya = await t.prisma.serviceZone.findFirstOrThrow({ where: { name: 'Kenya' } });
    await admin.agent.patch(`/api/admin/zones/${kenya.id}`, { isActive: false }).expect(204);
    const res = await request(t.app.getHttpServer()).get('/api/cities');
    expect(res.body[0].zones.map((z: { name: string }) => z.name)).not.toContain('Kenya');
  });

  it('un utilisateur ordinaire n’accède pas à l’administration des villes', async () => {
    const user = await actor(t, 'Ruth');
    await user.agent.get('/api/admin/cities').expect(403);
    await user.agent.post('/api/admin/cities', { name: 'Kolwezi' }).expect(403);
  });

  describe('zones desservies par un commissionnaire', () => {
    let owner: Actor;
    let orgId: string;
    let kampemba: string;
    let katuba: string;

    beforeEach(async () => {
      owner = await actor(t, 'Kaseba');
      orgId = await createOrg(owner, 'Kaseba Import');
      kampemba = (await t.prisma.serviceZone.findFirstOrThrow({ where: { name: 'Kampemba' } })).id;
      katuba = (await t.prisma.serviceZone.findFirstOrThrow({ where: { name: 'Katuba' } })).id;
    });

    it('le propriétaire définit ses zones, modes de remise et frais (en centimes)', async () => {
      const res = await owner.agent
        .put('/api/org/service-zones', {
          zones: [
            {
              serviceZoneId: kampemba,
              handoverModes: ['pickup', 'delivery'],
              localFee: { amount: 300, currency: 'USD' },
            },
            { serviceZoneId: katuba, handoverModes: ['pickup'], localFee: null },
          ],
        })
        .set(...asOrg(orgId))
        .expect(200);
      expect(res.body).toEqual([
        {
          serviceZoneId: kampemba,
          zoneName: 'Kampemba',
          cityName: 'Lubumbashi',
          handoverModes: ['pickup', 'delivery'],
          localFee: { amount: 300, currency: 'USD' },
        },
        {
          serviceZoneId: katuba,
          zoneName: 'Katuba',
          cityName: 'Lubumbashi',
          handoverModes: ['pickup'],
          localFee: null,
        },
      ]);
      const audit = await t.prisma.auditLog.findFirstOrThrow({
        where: { action: 'org.service_zones.updated' },
      });
      expect(audit.organizationId).toBe(orgId);
    });

    it('refuse une zone d’une ville fermée, un montant à virgule ou aucun mode de remise', async () => {
      const likasi = await admin.agent.post('/api/admin/cities', { name: 'Kolwezi' });
      await admin.agent.post(`/api/admin/cities/${likasi.body.id}/zones`, { name: 'Dilala' });
      const dilala = await t.prisma.serviceZone.findFirstOrThrow({ where: { name: 'Dilala' } });
      await owner.agent
        .put('/api/org/service-zones', {
          zones: [{ serviceZoneId: dilala.id, handoverModes: ['pickup'], localFee: null }],
        })
        .set(...asOrg(orgId))
        .expect(404);
      await owner.agent
        .put('/api/org/service-zones', {
          zones: [
            {
              serviceZoneId: kampemba,
              handoverModes: ['pickup'],
              localFee: { amount: 2.5, currency: 'USD' },
            },
          ],
        })
        .set(...asOrg(orgId))
        .expect(400);
      await owner.agent
        .put('/api/org/service-zones', {
          zones: [{ serviceZoneId: kampemba, handoverModes: [], localFee: null }],
        })
        .set(...asOrg(orgId))
        .expect(400);
    });

    it('un commercial consulte les zones mais ne les modifie pas', async () => {
      const sales = await actor(t, 'Grace');
      await addMember(t, orgId, sales.userId, 'sales');
      await sales.agent
        .get('/api/org/service-zones')
        .set(...asOrg(orgId))
        .expect(200);
      await sales.agent
        .put('/api/org/service-zones', { zones: [] })
        .set(...asOrg(orgId))
        .expect(403);
    });
  });
});
