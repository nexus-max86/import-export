import { PrismaClient } from '@konzia/db';
import { createTestApp, type TestContext } from './app';
import { actor, addMember, approveOrg, asOrg, createOrg, PNG, type Actor } from './fixtures';

describe('Demandes de devis', () => {
  let t: TestContext;
  let ruth: Actor;
  let kaseba: Actor;
  let mwamba: Actor;
  let other: Actor;
  let orgK: string;
  let orgM: string;
  let orgO: string;
  let slugK: string;
  let slugM: string;
  let appRole: PrismaClient;

  const shein = {
    source: 'lookup',
    sourceUrl: 'https://fr.shein.com/Robe-p-1.html',
    marketplace: 'shein',
    title: 'Robe midi plissée',
    size: 'M',
    color: 'Vert sauge',
    quantity: 2,
    indicativePrice: { amount: 1499, currency: 'USD' },
    priceFetchedAt: new Date().toISOString(),
  };

  function asUser<T>(userId: string, work: (tx: PrismaClient) => Promise<T>) {
    return appRole.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
      return work(tx as unknown as PrismaClient);
    });
  }

  async function sentRequest(commissioners: string[]) {
    const draft = await ruth.agent.post('/api/requests/draft/items', shein).expect(201);
    await ruth.agent.post(`/api/requests/${draft.body.id}/send`, { commissioners }).expect(201);
    return draft.body.id as string;
  }

  beforeAll(async () => {
    t = await createTestApp();
    appRole = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
  });
  beforeEach(async () => {
    await t.reset();
    ruth = await actor(t, 'Ruth');
    const lub = await t.prisma.city.findUniqueOrThrow({ where: { name: 'Lubumbashi' } });
    await ruth.agent
      .put('/api/me/profile', {
        displayName: 'Ruth Kabeya',
        cityId: lub.id,
        phoneWhatsapp: '0810000000',
      })
      .expect(200);
    kaseba = await actor(t, 'Kaseba');
    orgK = await createOrg(kaseba, 'Kaseba Import');
    slugK = await approveOrg(t, orgK);
    mwamba = await actor(t, 'Mwamba');
    orgM = await createOrg(mwamba, 'Mwamba Express');
    slugM = await approveOrg(t, orgM);
    other = await actor(t, 'Autre');
    orgO = await createOrg(other, 'Autre Import');
    await approveOrg(t, orgO);
  });
  afterAll(async () => {
    await appRole.$disconnect();
    await t.app.close();
  });

  describe('brouillon', () => {
    it('chaque article est enregistré aussitôt ; le prix reste indicatif et daté', async () => {
      const first = await ruth.agent.post('/api/requests/draft/items', shein).expect(201);
      const shot = await ruth.agent
        .postFile('/api/catalog/screenshots', {}, PNG, 'capture.png')
        .expect(201);
      const second = await ruth.agent
        .post('/api/requests/draft/items', {
          source: 'manual',
          title: 'Organiseur de cuisine',
          quantity: 1,
          screenshotFileId: shot.body.fileId,
        })
        .expect(201);
      expect(second.body.id).toBe(first.body.id);
      expect(second.body.items).toMatchObject([
        {
          title: 'Robe midi plissée',
          indicativePrice: { amount: 1499, currency: 'USD' },
          quantity: 2,
        },
        { title: 'Organiseur de cuisine', hasScreenshot: true, indicativePrice: null },
      ]);
      const draft = await ruth.agent.get('/api/requests/draft').expect(200);
      expect(draft.body.items).toHaveLength(2);
    });

    it('refuse un prix indicatif non daté et la capture d’écran d’un autre', async () => {
      await ruth.agent
        .post('/api/requests/draft/items', { ...shein, priceFetchedAt: null })
        .expect(400);
      const shot = await kaseba.agent
        .postFile('/api/catalog/screenshots', {}, PNG, 'x.png')
        .expect(201);
      await ruth.agent
        .post('/api/requests/draft/items', {
          source: 'manual',
          title: 'Article',
          quantity: 1,
          screenshotFileId: shot.body.fileId,
        })
        .expect(400);
    });

    it('le client corrige la quantité ou retire un article', async () => {
      const d = await ruth.agent.post('/api/requests/draft/items', shein).expect(201);
      const itemId = d.body.items[0].id;
      const upd = await ruth.agent
        .patch(`/api/requests/${d.body.id}/items/${itemId}`, { quantity: 3, size: 'L' })
        .expect(200);
      expect(upd.body.items[0]).toMatchObject({ quantity: 3, size: 'L' });
      const del = await ruth.agent.delete(`/api/requests/${d.body.id}/items/${itemId}`).expect(200);
      expect(del.body.items).toEqual([]);
    });
  });

  describe('envoi', () => {
    it('envoie à deux commissionnaires et crée leur fiche client', async () => {
      const id = await sentRequest([slugK, slugM]);
      const detail = await ruth.agent.get(`/api/requests/${id}`).expect(200);
      expect(detail.body.status).toBe('sent');
      expect(
        detail.body.recipients.map((r: { organizationName: string }) => r.organizationName).sort(),
      ).toEqual(['Kaseba Import', 'Mwamba Express']);
      const fiche = await t.prisma.orgCustomer.findFirstOrThrow({
        where: { organizationId: orgK, userId: ruth.userId },
      });
      expect(fiche).toMatchObject({
        source: 'signup',
        fullName: 'Ruth Kabeya',
        phoneWhatsapp: '+243810000000',
      });
    });

    it('réutilise la fiche existante du client chez le commissionnaire', async () => {
      await sentRequest([slugK]);
      await sentRequest([slugK]);
      expect(
        await t.prisma.orgCustomer.count({ where: { organizationId: orgK, userId: ruth.userId } }),
      ).toBe(1);
    });

    it('refuse un compte non confirmé, une demande vide et un commissionnaire non approuvé', async () => {
      const newbie = await actor(t, 'NonConfirme', false);
      const d = await newbie.agent.post('/api/requests/draft/items', shein).expect(201);
      await newbie.agent
        .post(`/api/requests/${d.body.id}/send`, { commissioners: [slugK] })
        .expect(403);

      const ruthDraft = await ruth.agent.post('/api/requests/draft/items', shein).expect(201);
      await ruth.agent
        .delete(`/api/requests/${ruthDraft.body.id}/items/${ruthDraft.body.items[0].id}`)
        .expect(200);
      await ruth.agent
        .post(`/api/requests/${ruthDraft.body.id}/send`, { commissioners: [slugK] })
        .expect(400);

      await ruth.agent.post('/api/requests/draft/items', shein).expect(201);
      await t.prisma.organization.update({ where: { id: orgM }, data: { status: 'suspended' } });
      await ruth.agent
        .post(`/api/requests/${ruthDraft.body.id}/send`, { commissioners: [slugM] })
        .expect(400);
    });

    it('une demande envoyée ne peut plus être modifiée ni revenir en brouillon', async () => {
      const id = await sentRequest([slugK]);
      const detail = await ruth.agent.get(`/api/requests/${id}`);
      await ruth.agent
        .patch(`/api/requests/${id}/items/${detail.body.items[0].id}`, { quantity: 9 })
        .expect(404);
      await expect(
        asUser(
          ruth.userId,
          (tx) => tx.$executeRaw`UPDATE quote_requests SET status = 'draft' WHERE id = ${id}::uuid`,
        ),
      ).rejects.toThrow(/transition de statut interdite/);
      await ruth.agent.post(`/api/requests/${id}/cancel`).expect(201);
    });
  });

  describe('côté commissionnaire', () => {
    it('chaque destinataire voit la demande, sa propre ligne seulement, et la marque « lue »', async () => {
      const id = await sentRequest([slugK, slugM]);
      const list = await kaseba.agent
        .get('/api/org/requests')
        .set(...asOrg(orgK))
        .expect(200);
      expect(list.body).toMatchObject([
        { id, status: 'sent', customerName: 'Ruth Kabeya', itemCount: 1 },
      ]);

      const detail = await kaseba.agent
        .get(`/api/org/requests/${id}`)
        .set(...asOrg(orgK))
        .expect(200);
      expect(detail.body.recipients).toEqual([
        expect.objectContaining({ organizationName: 'Kaseba Import', status: 'viewed' }),
      ]);
      expect(detail.body.customer).toMatchObject({ fullName: 'Ruth Kabeya', hasAccount: true });

      const ruthView = await ruth.agent.get(`/api/requests/${id}`);
      expect(
        ruthView.body.recipients.find(
          (r: { organizationName: string }) => r.organizationName === 'Kaseba Import',
        ).status,
      ).toBe('viewed');
    });

    it('liste paginée : onglets, compteurs, recherche, plus anciennes d’abord', async () => {
      const first = await sentRequest([slugK]);
      const second = await sentRequest([slugK]);
      const declined = await sentRequest([slugK]);
      await kaseba.agent
        .post(`/api/org/requests/${declined}/decline`, { reason: 'Article interdit à l’import' })
        .set(...asOrg(orgK))
        .expect(204);
      const page = (qs: string) =>
        kaseba.agent.get(`/api/org/requests/page?${qs}`).set(...asOrg(orgK));
      const todo = await page('').expect(200);
      expect(todo.body.counts).toEqual({ todo: 2, quoted: 0, closed: 1, all: 3 });
      expect(todo.body.items.map((r: { id: string }) => r.id)).toEqual([first, second]);
      const recent = await page('tab=all&dir=desc').expect(200);
      expect(recent.body.items[0].id).toBe(declined);
      expect((await page('tab=closed&q=kabeya').expect(200)).body.total).toBe(1);
      expect((await page('q=plissée').expect(200)).body.total).toBe(2);
      expect((await page('q=inconnu').expect(200)).body.counts.all).toBe(0);
      await page('tab=autre').expect(400);
      const theirs = await other.agent.get('/api/org/requests/page').set(...asOrg(orgO));
      expect(theirs.body.counts.all).toBe(0);
    });

    it('un commissionnaire non destinataire ne voit rien, même en SQL direct', async () => {
      const id = await sentRequest([slugK]);
      await other.agent
        .get(`/api/org/requests/${id}`)
        .set(...asOrg(orgO))
        .expect(404);
      expect((await other.agent.get('/api/org/requests').set(...asOrg(orgO))).body).toEqual([]);
      for (const table of ['quote_requests', 'quote_request_items', 'quote_request_recipients']) {
        const col = table === 'quote_requests' ? 'id' : 'quote_request_id';
        const rows = await asUser(other.userId, (tx) =>
          tx.$queryRawUnsafe<unknown[]>(`SELECT 1 FROM ${table} WHERE ${col} = $1::uuid`, id),
        );
        expect(rows).toEqual([]);
      }
    });

    it('un destinataire ne sait pas quels concurrents ont reçu la même demande', async () => {
      const id = await sentRequest([slugK, slugM]);
      const rows = await asUser(
        kaseba.userId,
        (tx) =>
          tx.$queryRaw<
            { organization_id: string }[]
          >`SELECT organization_id FROM quote_request_recipients WHERE quote_request_id = ${id}::uuid`,
      );
      expect(rows.map((r) => r.organization_id)).toEqual([orgK]);
    });

    it('les captures d’écran sont lisibles par les destinataires seulement', async () => {
      const shot = await ruth.agent
        .postFile('/api/catalog/screenshots', {}, PNG, 'capture.png')
        .expect(201);
      const d = await ruth.agent
        .post('/api/requests/draft/items', {
          source: 'manual',
          title: 'Article vu en boutique',
          quantity: 1,
          screenshotFileId: shot.body.fileId,
        })
        .expect(201);
      await ruth.agent
        .post(`/api/requests/${d.body.id}/send`, { commissioners: [slugK] })
        .expect(201);
      const count = (userId: string) =>
        asUser(
          userId,
          (tx) => tx.$queryRaw<unknown[]>`SELECT 1 FROM files WHERE id = ${shot.body.fileId}::uuid`,
        );
      expect(await count(kaseba.userId)).toHaveLength(1);
      expect(await count(other.userId)).toHaveLength(0);
    });

    it('décline avec un motif visible du client ; un livreur ne peut pas décliner', async () => {
      const id = await sentRequest([slugK]);
      const courier = await actor(t, 'Livreur');
      await addMember(t, orgK, courier.userId, 'accountant');
      await courier.agent
        .post(`/api/org/requests/${id}/decline`, { reason: 'Pas le temps' })
        .set(...asOrg(orgK))
        .expect(403);
      await kaseba.agent
        .post(`/api/org/requests/${id}/decline`, { reason: 'Article interdit à l’import' })
        .set(...asOrg(orgK))
        .expect(204);
      const view = await ruth.agent.get(`/api/requests/${id}`);
      expect(view.body.recipients[0]).toMatchObject({
        status: 'declined',
        declineReason: 'Article interdit à l’import',
      });
    });

    it('le commissionnaire saisit une demande pour un client géré', async () => {
      const c = await kaseba.agent
        .post('/api/org/customers', { fullName: 'Patrick Mbuyi', phoneWhatsapp: '0812345678' })
        .set(...asOrg(orgK))
        .expect(201);
      const res = await kaseba.agent
        .post('/api/org/requests', {
          orgCustomerId: c.body.id,
          items: [{ source: 'manual', title: 'Chaussures de sécurité', quantity: 3 }],
        })
        .set(...asOrg(orgK))
        .expect(201);
      const list = await kaseba.agent.get('/api/org/requests').set(...asOrg(orgK));
      expect(list.body).toMatchObject([
        { id: res.body.id, status: 'evaluating', customerName: 'Patrick Mbuyi' },
      ]);
      await mwamba.agent
        .get(`/api/org/requests/${res.body.id}`)
        .set(...asOrg(orgM))
        .expect(404);
      await mwamba.agent
        .post('/api/org/requests', {
          orgCustomerId: c.body.id,
          items: [{ source: 'manual', title: 'Article', quantity: 1 }],
        })
        .set(...asOrg(orgM))
        .expect(404);
    });
  });
});
