import { PrismaClient } from '@konzia/db';
import { createTestApp, type TestContext } from './app';
import { actor, addMember, approveOrg, asOrg, createOrg, makeAdmin, type Actor } from './fixtures';

describe('Devis', () => {
  let t: TestContext;
  let ruth: Actor;
  let kaseba: Actor;
  let mwamba: Actor;
  let orgK: string;
  let orgM: string;
  let slugK: string;
  let slugM: string;
  let appRole: PrismaClient;

  const inThreeDays = () => new Date(Date.now() + 3 * 86_400_000).toISOString();

  function asUser<T>(userId: string, work: (tx: PrismaClient) => Promise<T>) {
    return appRole.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
      return work(tx as unknown as PrismaClient);
    });
  }

  async function request(commissioners: string[]) {
    await ruth.agent
      .post('/api/requests/draft/items', {
        source: 'lookup',
        sourceUrl: 'https://fr.shein.com/Robe-p-1.html',
        marketplace: 'shein',
        title: 'Robe midi plissée',
        size: 'M',
        quantity: 2,
        indicativePrice: { amount: 1499, currency: 'USD' },
        priceFetchedAt: new Date().toISOString(),
      })
      .expect(201);
    const d = await ruth.agent
      .post('/api/requests/draft/items', {
        source: 'manual',
        title: 'Écouteurs sans fil',
        quantity: 5,
      })
      .expect(201);
    await ruth.agent.post(`/api/requests/${d.body.id}/send`, { commissioners }).expect(201);
    return { id: d.body.id as string, items: d.body.items as { id: string }[] };
  }

  const open = (who: Actor, org: string, requestId: string) =>
    who.agent.post(`/api/org/requests/${requestId}/quote`).set(...asOrg(org));

  function draft(items: { id: string }[], over: Record<string, unknown> = {}) {
    return {
      currency: 'USD',
      validUntil: inThreeDays(),
      leadTimeMinDays: 14,
      leadTimeMaxDays: 21,
      weightGrams: 2400,
      assumptions: 'Douane estimée sur la base de 2,4 kg.',
      lines: [
        {
          kind: 'product',
          quoteRequestItemId: items[0]!.id,
          description: 'Robe midi plissée, M',
          quantity: 2,
          unitAmount: 1549,
        },
        {
          kind: 'product',
          quoteRequestItemId: items[1]!.id,
          description: 'Écouteurs sans fil',
          quantity: 5,
          unitAmount: 1328,
        },
        { kind: 'service_fee', description: 'Commission 10 %', quantity: 1, unitAmount: 974 },
        {
          kind: 'international_shipping',
          description: '2,4 kg × 11,90',
          quantity: 1,
          unitAmount: 2856,
          isEstimate: true,
        },
        {
          kind: 'customs_estimate',
          description: 'Douane',
          quantity: 1,
          unitAmount: 900,
          isEstimate: true,
        },
        { kind: 'discount', description: 'Remise fidélité', quantity: 1, unitAmount: 100 },
      ],
      ...over,
    };
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
      .put('/api/me/profile', { displayName: 'Ruth Kabeya', cityId: lub.id })
      .expect(200);
    kaseba = await actor(t, 'Kaseba');
    orgK = await createOrg(kaseba, 'Kaseba Import');
    slugK = await approveOrg(t, orgK);
    mwamba = await actor(t, 'Mwamba');
    orgM = await createOrg(mwamba, 'Mwamba Express');
    slugM = await approveOrg(t, orgM);
    const admin = await makeAdmin(t, await actor(t, 'Admin'));
    await admin.agent
      .post('/api/admin/exchange-rates', { pair: 'USD_CDF', rate: '2850', source: 'BCC' })
      .expect(201);
  });
  afterAll(async () => {
    await appRole.$disconnect();
    await t.app.close();
  });

  it('l’assistant pré-remplit le devis avec les articles et la commission habituelle', async () => {
    await kaseba.agent
      .put('/api/org/quote-settings', {
        commissionBps: 1000,
        transportPerKg: { amount: 1190, currency: 'USD' },
      })
      .set(...asOrg(orgK))
      .expect(200);
    const r = await request([slugK]);
    const q = await open(kaseba, orgK, r.id).expect(201);
    expect(q.body.status).toBe('draft');
    expect(
      q.body.current.lines.map(
        (l: { kind: string; unitAmount: number }) => `${l.kind}:${l.unitAmount}`,
      ),
    ).toEqual([
      'product:1499',
      'product:0',
      'service_fee:300', // 10 % de 2 × 14,99
      'international_shipping:0',
      'customs_estimate:0',
    ]);
    // Ouvrir à nouveau renvoie le même devis.
    expect((await open(kaseba, orgK, r.id).expect(201)).body.id).toBe(q.body.id);
    const detail = await kaseba.agent.get(`/api/org/requests/${r.id}`).set(...asOrg(orgK));
    expect(detail.body.recipients[0].status).toBe('evaluating');
    expect(detail.body.quoteId).toBe(q.body.id);
  });

  it('le serveur recalcule les montants et les totaux', async () => {
    const r = await request([slugK]);
    const q = await open(kaseba, orgK, r.id).expect(201);
    const saved = await kaseba.agent
      .put(
        `/api/org/quotes/${q.body.id}/draft`,
        draft(r.items, { lines: draft(r.items).lines.map((l) => ({ ...l, amount: 1 })) }),
      )
      .set(...asOrg(orgK))
      .expect(200);
    // 2×15,49 + 5×13,28 = 97,38 ; + 9,74 + 28,56 + 9,00 − 1,00 = 143,68
    expect(saved.body.current).toMatchObject({
      productsAmount: 9738,
      totalAmount: 14368,
      weightGrams: 2400,
    });
    expect(saved.body.current.lines.at(-1)).toMatchObject({ kind: 'discount', amount: -100 });
  });

  it('refuse une ligne rattachée à l’article d’une autre demande', async () => {
    const r1 = await request([slugK]);
    const r2 = await request([slugK]);
    const q = await open(kaseba, orgK, r1.id).expect(201);
    await kaseba.agent
      .put(`/api/org/quotes/${q.body.id}/draft`, draft(r2.items))
      .set(...asOrg(orgK))
      .expect(400);
  });

  it('envoi : version figée, taux copiés, statuts mis à jour', async () => {
    const r = await request([slugK, slugM]);
    const q = await open(kaseba, orgK, r.id).expect(201);
    await kaseba.agent
      .put(`/api/org/quotes/${q.body.id}/draft`, draft(r.items))
      .set(...asOrg(orgK))
      .expect(200);
    const sent = await kaseba.agent
      .post(`/api/org/quotes/${q.body.id}/send`)
      .set(...asOrg(orgK))
      .expect(201);
    expect(sent.body).toMatchObject({
      status: 'sent',
      current: { versionNo: 1, status: 'sent', fxUsdCdf: '2850', fxSource: 'BCC' },
    });

    const ruthView = await ruth.agent.get(`/api/requests/${r.id}`);
    expect(ruthView.body.status).toBe('partially_quoted');
    expect(
      ruthView.body.recipients.find(
        (x: { organizationName: string }) => x.organizationName === 'Kaseba Import',
      ).status,
    ).toBe('quoted');

    // Plus aucune modification possible, même pour le rôle propriétaire de la base.
    await kaseba.agent
      .put(`/api/org/quotes/${q.body.id}/draft`, draft(r.items))
      .set(...asOrg(orgK))
      .expect(409);
    await expect(
      t.prisma.$executeRaw`UPDATE quote_lines SET unit_amount = 1, amount = 1`,
    ).rejects.toThrow(/figée/);
    await expect(t.prisma.$executeRaw`UPDATE quote_versions SET total_amount = 1`).rejects.toThrow(
      /figée/,
    );

    // Un nouveau taux ne change pas le devis envoyé.
    const admin = await makeAdmin(t, await actor(t, 'Admin2'));
    await admin.agent
      .post('/api/admin/exchange-rates', { pair: 'USD_CDF', rate: '3000', source: 'BCC' })
      .expect(201);
    expect(
      (await kaseba.agent.get(`/api/org/quotes/${q.body.id}`).set(...asOrg(orgK))).body.current
        .fxUsdCdf,
    ).toBe('2850');

    // Le second commissionnaire répond aussi : la demande a tous ses devis.
    const q2 = await open(mwamba, orgM, r.id).expect(201);
    await mwamba.agent
      .put(`/api/org/quotes/${q2.body.id}/draft`, draft(r.items))
      .set(...asOrg(orgM))
      .expect(200);
    await mwamba.agent
      .post(`/api/org/quotes/${q2.body.id}/send`)
      .set(...asOrg(orgM))
      .expect(201);
    expect((await ruth.agent.get(`/api/requests/${r.id}`)).body.status).toBe('quoted');
  });

  it('correction : version 2 en préparation, invisible du client ; la version 1 devient « remplacée » à l’envoi', async () => {
    const r = await request([slugK]);
    const q = await open(kaseba, orgK, r.id).expect(201);
    await kaseba.agent
      .put(`/api/org/quotes/${q.body.id}/draft`, draft(r.items))
      .set(...asOrg(orgK))
      .expect(200);
    await kaseba.agent
      .post(`/api/org/quotes/${q.body.id}/send`)
      .set(...asOrg(orgK))
      .expect(201);
    const v2 = await kaseba.agent
      .post(`/api/org/quotes/${q.body.id}/revise`)
      .set(...asOrg(orgK))
      .expect(201);
    expect(v2.body.current).toMatchObject({ versionNo: 2, status: 'draft', totalAmount: 14368 });
    expect(v2.body.previous.map((v: { versionNo: number }) => v.versionNo)).toEqual([1]);

    const visible = await asUser(
      ruth.userId,
      (tx) =>
        tx.$queryRaw<
          { version_no: number }[]
        >`SELECT version_no FROM quote_versions ORDER BY version_no`,
    );
    expect(visible.map((v) => v.version_no)).toEqual([1]);

    await kaseba.agent
      .put(
        `/api/org/quotes/${q.body.id}/draft`,
        draft(r.items, { lines: draft(r.items).lines.slice(0, 3) }),
      )
      .set(...asOrg(orgK))
      .expect(200);
    const sent2 = await kaseba.agent
      .post(`/api/org/quotes/${q.body.id}/send`)
      .set(...asOrg(orgK))
      .expect(201);
    expect(sent2.body.current).toMatchObject({ versionNo: 2, status: 'sent' });
    expect(sent2.body.previous[0]).toMatchObject({ versionNo: 1, status: 'superseded' });
  });

  it('refuse l’envoi sans article ou avec une validité dépassée', async () => {
    const r = await request([slugK]);
    const q = await open(kaseba, orgK, r.id).expect(201);
    const id = q.body.id;
    await kaseba.agent
      .put(
        `/api/org/quotes/${id}/draft`,
        draft(r.items, {
          lines: [{ kind: 'service_fee', description: 'Commission', quantity: 1, unitAmount: 500 }],
        }),
      )
      .set(...asOrg(orgK))
      .expect(200);
    await kaseba.agent
      .post(`/api/org/quotes/${id}/send`)
      .set(...asOrg(orgK))
      .expect(400);
    await kaseba.agent
      .put(
        `/api/org/quotes/${id}/draft`,
        draft(r.items, { validUntil: new Date(Date.now() - 1000).toISOString() }),
      )
      .set(...asOrg(orgK))
      .expect(200);
    await kaseba.agent
      .post(`/api/org/quotes/${id}/send`)
      .set(...asOrg(orgK))
      .expect(400);
  });

  it('un autre commissionnaire ne voit pas le devis ; un comptable ne peut pas l’envoyer', async () => {
    const r = await request([slugK]);
    const q = await open(kaseba, orgK, r.id).expect(201);
    await mwamba.agent
      .get(`/api/org/quotes/${q.body.id}`)
      .set(...asOrg(orgM))
      .expect(404);
    await open(mwamba, orgM, r.id).expect(404);
    const accountant = await actor(t, 'Comptable');
    await addMember(t, orgK, accountant.userId, 'accountant');
    await accountant.agent
      .post(`/api/org/quotes/${q.body.id}/send`)
      .set(...asOrg(orgK))
      .expect(403);
  });

  it('retirer un devis le rend « décliné » pour le client', async () => {
    const r = await request([slugK]);
    const q = await open(kaseba, orgK, r.id).expect(201);
    await kaseba.agent
      .put(`/api/org/quotes/${q.body.id}/draft`, draft(r.items))
      .set(...asOrg(orgK))
      .expect(200);
    await kaseba.agent
      .post(`/api/org/quotes/${q.body.id}/send`)
      .set(...asOrg(orgK))
      .expect(201);
    await kaseba.agent
      .post(`/api/org/quotes/${q.body.id}/withdraw`, { reason: 'Article en rupture' })
      .set(...asOrg(orgK))
      .expect(201);
    const view = await ruth.agent.get(`/api/requests/${r.id}`);
    expect(view.body.recipients[0]).toMatchObject({
      status: 'declined',
      declineReason: 'Article en rupture',
    });
    expect(view.body.status).toBe('sent');
  });
});
