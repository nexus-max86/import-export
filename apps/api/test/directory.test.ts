import request from 'supertest';
import { createTestApp, type TestContext } from './app';
import { actor, createOrg, asOrg, type Actor } from './fixtures';

describe('Annuaire public des commissionnaires', () => {
  let t: TestContext;
  let kaseba: Actor;
  let kasebaOrg: string;
  let mwambaOrg: string;

  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await t.reset();
    kaseba = await actor(t, 'Kaseba');
    kasebaOrg = await createOrg(kaseba, 'Kaseba Import');
    const mwamba = await actor(t, 'Mwamba');
    mwambaOrg = await createOrg(mwamba, 'Mwamba Express');

    const kampemba = await t.prisma.serviceZone.findFirstOrThrow({ where: { name: 'Kampemba' } });
    await kaseba.agent
      .patch('/api/org', {
        marketplaces: ['shein', 'alibaba'],
        transportModes: ['air'],
        pricingPolicy: '10 % + transport au kilo',
      })
      .set(...asOrg(kasebaOrg))
      .expect(204);
    await kaseba.agent
      .put('/api/org/service-zones', {
        zones: [
          { serviceZoneId: kampemba.id, handoverModes: ['pickup', 'delivery'], localFee: null },
        ],
      })
      .set(...asOrg(kasebaOrg))
      .expect(200);
    await mwamba.agent
      .patch('/api/org', { marketplaces: ['amazon'] })
      .set(...asOrg(mwambaOrg))
      .expect(204);
    await kaseba.agent
      .post('/api/org/customers', { fullName: 'Client secret', phoneWhatsapp: '0810000009' })
      .set(...asOrg(kasebaOrg));
  });
  afterAll(async () => {
    await t.app.close();
  });

  const approve = (id: string, verifiedAt = new Date()) =>
    t.prisma.organization.update({ where: { id }, data: { status: 'approved', verifiedAt } });

  it('n’affiche que les commissionnaires approuvés, sans connexion', async () => {
    expect((await http().get('/api/commissioners').expect(200)).body).toEqual([]);
    await approve(kasebaOrg);
    const res = await http().get('/api/commissioners').expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      name: 'Kaseba Import',
      marketplaces: ['shein', 'alibaba'],
      isNew: true,
      zones: [
        { cityName: 'Lubumbashi', zoneName: 'Kampemba', handoverModes: ['pickup', 'delivery'] },
      ],
    });
  });

  it('ne publie aucune donnée interne', async () => {
    await approve(kasebaOrg);
    const body = JSON.stringify((await http().get('/api/commissioners')).body);
    for (const secret of ['Client secret', 'kaseba@example.test', 'status', '"id"'])
      expect(body).not.toContain(secret);
  });

  it('filtre par site d’achat et par ville', async () => {
    await approve(kasebaOrg);
    await approve(mwambaOrg, new Date(Date.now() - 90 * 86_400_000));
    const shein = await http().get('/api/commissioners?site=shein').expect(200);
    expect(shein.body.map((c: { name: string }) => c.name)).toEqual(['Kaseba Import']);

    const lubumbashi = await t.prisma.city.findUniqueOrThrow({ where: { name: 'Lubumbashi' } });
    const inCity = await http().get(`/api/commissioners?ville=${lubumbashi.id}`).expect(200);
    expect(inCity.body.map((c: { name: string }) => c.name)).toEqual(['Kaseba Import']);

    const all = await http().get('/api/commissioners').expect(200);
    expect(all.body.find((c: { name: string }) => c.name === 'Mwamba Express').isNew).toBe(false);
    await http().get('/api/commissioners?site=inconnu').expect(400);
  });

  it('une fiche suspendue disparaît de l’annuaire et de sa page', async () => {
    await approve(kasebaOrg);
    const slug = (await http().get('/api/commissioners')).body[0].slug as string;
    await http().get(`/api/commissioners/${slug}`).expect(200);
    await t.prisma.organization.update({ where: { id: kasebaOrg }, data: { status: 'suspended' } });
    await http().get(`/api/commissioners/${slug}`).expect(404);
    expect((await http().get('/api/commissioners')).body).toEqual([]);
  });
});
