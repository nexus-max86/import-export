import { PrismaClient } from '@konzia/db';
import { createTestApp, type TestContext } from './app';
import { actor, type Actor } from './fixtures';
import { USER_TABLES } from './tenancy-tables';

describe('Profil client et adresses', () => {
  let t: TestContext;
  let ruth: Actor;
  let lubumbashi: string;
  let kampemba: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await t.reset();
    ruth = await actor(t, 'Ruth');
    lubumbashi = (await t.prisma.city.findUniqueOrThrow({ where: { name: 'Lubumbashi' } })).id;
    kampemba = (await t.prisma.serviceZone.findFirstOrThrow({ where: { name: 'Kampemba' } })).id;
  });
  afterAll(async () => {
    await t.app.close();
  });

  const home = () => ({
    label: 'Maison',
    cityId: lubumbashi,
    serviceZoneId: kampemba,
    line: 'Av. Lumumba 12',
    landmark: 'En face de la paroisse',
  });

  it('met à jour le profil et normalise le numéro WhatsApp', async () => {
    const res = await ruth.agent
      .put('/api/me/profile', {
        displayName: 'Ruth Kabeya',
        phoneWhatsapp: '081 000 0000',
        cityId: lubumbashi,
        serviceZoneId: kampemba,
        deliveryInstructions: 'Appeler avant de venir',
      })
      .expect(200);
    expect(res.body).toMatchObject({
      displayName: 'Ruth Kabeya',
      phoneWhatsapp: '+243810000000',
      cityId: lubumbashi,
      serviceZoneId: kampemba,
    });
  });

  it('refuse un numéro invalide et une ville fermée', async () => {
    await ruth.agent
      .put('/api/me/profile', { displayName: 'Ruth', phoneWhatsapp: '12' })
      .expect(400);
    const likasi = await t.prisma.city.findUniqueOrThrow({ where: { name: 'Likasi' } });
    await ruth.agent.put('/api/me/profile', { displayName: 'Ruth', cityId: likasi.id }).expect(400);
  });

  it('la première adresse devient l’adresse par défaut ; une seule à la fois', async () => {
    const first = await ruth.agent.post('/api/me/addresses', home()).expect(201);
    expect(first.body).toMatchObject({
      isDefault: true,
      cityName: 'Lubumbashi',
      zoneName: 'Kampemba',
    });

    const office = await ruth.agent
      .post('/api/me/addresses', { ...home(), label: 'Bureau', isDefault: true })
      .expect(201);
    const list = await ruth.agent.get('/api/me/addresses').expect(200);
    expect(
      list.body.filter((a: { isDefault: boolean }) => a.isDefault).map((a: { id: string }) => a.id),
    ).toEqual([office.body.id]);
  });

  it('supprimer l’adresse par défaut en désigne une autre', async () => {
    const first = await ruth.agent.post('/api/me/addresses', home()).expect(201);
    await ruth.agent.post('/api/me/addresses', { ...home(), label: 'Bureau' }).expect(201);
    await ruth.agent.delete(`/api/me/addresses/${first.body.id}`).expect(204);
    const list = await ruth.agent.get('/api/me/addresses');
    expect(list.body).toMatchObject([{ label: 'Bureau', isDefault: true }]);
  });

  it('refuse une commune qui n’appartient pas à la ville', async () => {
    const city = await t.prisma.city.update({
      where: { name: 'Likasi' },
      data: { isActive: true },
    });
    await ruth.agent.post('/api/me/addresses', { ...home(), cityId: city.id }).expect(400);
  });

  it('limite le nombre d’adresses', async () => {
    for (let i = 0; i < 10; i++)
      await ruth.agent.post('/api/me/addresses', { ...home(), label: `A${i}` }).expect(201);
    await ruth.agent.post('/api/me/addresses', { ...home(), label: 'Trop' }).expect(409);
  });

  describe('confidentialité', () => {
    it('un autre utilisateur ne peut ni lire, ni modifier, ni supprimer les adresses de Ruth', async () => {
      const address = await ruth.agent.post('/api/me/addresses', home()).expect(201);
      const other = await actor(t, 'Patrick');
      expect((await other.agent.get('/api/me/addresses')).body).toEqual([]);
      await other.agent.patch(`/api/me/addresses/${address.body.id}`, home()).expect(404);
      await other.agent.delete(`/api/me/addresses/${address.body.id}`).expect(404);
    });

    it.each(USER_TABLES)(
      'en SQL direct, un autre utilisateur ne voit aucune ligne de $table',
      async ({ table, userColumn }) => {
        await ruth.agent
          .put('/api/me/profile', { displayName: 'Ruth', cityId: lubumbashi })
          .expect(200);
        await ruth.agent.post('/api/me/addresses', home()).expect(201);
        const other = await actor(t, 'Patrick');
        const appRole = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
        try {
          const count = (userId: string) =>
            appRole.$transaction(async (tx) => {
              await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
              const rows = await tx.$queryRawUnsafe<{ n: bigint }[]>(
                `SELECT count(*) AS n FROM ${table} WHERE ${userColumn} = $1::uuid`,
                ruth.userId,
              );
              return Number(rows[0]?.n);
            });
          expect(await count(ruth.userId)).toBe(1);
          expect(await count(other.userId)).toBe(0);
        } finally {
          await appRole.$disconnect();
        }
      },
    );
  });
});
