import ExcelJS from 'exceljs';
import { createTestApp, type TestContext } from './app';
import { actor, addMember, asOrg, createOrg, type Actor } from './fixtures';

const CSV = [
  'Nom;Téléphone;Commune;Adresse;Remarques',
  'Patrick Mbuyi;081 234 5678;Kampemba;Av. Lumumba 12;Paie en retard',
  'Grace Ilunga;0997001122;Golf;Av. Kasaï 3;',
  'Doublon fichier;+243 81 234 5678;;;',
  'Déjà client;0810000001;;;',
  ';0820000000;;;',
  'Numéro faux;12345;;;',
  '',
].join('\r\n');

describe('Import des clients depuis Excel', () => {
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
    await owner.agent
      .post('/api/org/customers', { fullName: 'Déjà client', phoneWhatsapp: '0810000001' })
      .set(...asOrg(orgId))
      .expect(201);
  });
  afterAll(async () => {
    await t.app.close();
  });

  const send = (path: 'preview' | 'commit', content: Buffer, name = 'clients.csv', who = owner) =>
    who.agent
      .postFile(
        `/api/org/customers/import${path === 'preview' ? '/preview' : ''}`,
        {},
        content,
        name,
      )
      .set(...asOrg(orgId));

  it('l’aperçu classe chaque ligne sans rien enregistrer', async () => {
    const res = await send('preview', Buffer.from(CSV)).expect(201);
    expect(res.body.columns).toMatchObject({
      fullName: 'Nom',
      phone: 'Téléphone',
      zone: 'Commune',
      notes: 'Remarques',
    });
    expect(res.body.counts).toEqual({ ok: 2, duplicate: 2, error: 2 });
    expect(
      res.body.rows.map((r: { line: number; status: string }) => `${r.line}:${r.status}`),
    ).toEqual(['2:ok', '3:ok', '4:duplicate', '5:duplicate', '6:error', '7:error']);
    expect(res.body.rows[1].message).toMatch(/Commune non reconnue/);
    expect(await t.prisma.orgCustomer.count({ where: { organizationId: orgId } })).toBe(1);
  });

  it('importe seulement les lignes valides, avec commune reconnue, et garde un résumé sans données personnelles', async () => {
    const res = await send('commit', Buffer.from(CSV)).expect(201);
    expect(res.body).toEqual({ imported: 2, skipped: 4 });

    const patrick = await t.prisma.orgCustomer.findFirstOrThrow({
      where: { fullName: 'Patrick Mbuyi' },
      include: { serviceZone: true },
    });
    expect(patrick).toMatchObject({
      phoneWhatsapp: '+243812345678',
      source: 'import',
      notesPrivate: 'Paie en retard',
    });
    expect(patrick.serviceZone?.name).toBe('Kampemba');
    const grace = await t.prisma.orgCustomer.findFirstOrThrow({
      where: { fullName: 'Grace Ilunga' },
    });
    expect(grace.addressLine).toBe('Av. Kasaï 3, Golf');

    const summary = await t.prisma.customerImport.findFirstOrThrow({
      where: { organizationId: orgId },
    });
    expect(summary).toMatchObject({ rowsTotal: 6, rowsImported: 2, rowsSkipped: 4 });
    expect(JSON.stringify(summary.issues)).not.toContain('Doublon fichier');
    expect(
      (await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'customer.imported' } })).after,
    ).toMatchObject({ imported: 2 });

    // Réimporter le même fichier ne crée aucun doublon.
    expect((await send('commit', Buffer.from(CSV)).expect(201)).body).toEqual({
      imported: 0,
      skipped: 6,
    });
  });

  it('accepte un fichier .xlsx avec prénom et nom séparés', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Feuil1');
    ws.addRow(['Prénom', 'Nom', 'Numéro WhatsApp']);
    ws.addRow(['Ruth', 'Kabeya', 851234567]);
    const res = await send(
      'commit',
      Buffer.from(await wb.xlsx.writeBuffer()),
      'clients.xlsx',
    ).expect(201);
    expect(res.body).toEqual({ imported: 1, skipped: 0 });
    expect(
      await t.prisma.orgCustomer.findFirst({
        where: { fullName: 'Ruth Kabeya', phoneWhatsapp: '+243851234567' },
      }),
    ).not.toBeNull();
  });

  it('explique clairement un fichier sans colonne Nom ou illisible', async () => {
    const noName = await send('preview', Buffer.from('Téléphone\n0810000000\n')).expect(400);
    expect(noName.body.message).toMatch(/Colonne « Nom » introuvable/);
    await send('preview', Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), 'abime.xlsx').expect(400);
  });

  it('un comptable ne peut pas importer', async () => {
    const accountant = await actor(t, 'Comptable');
    await addMember(t, orgId, accountant.userId, 'accountant');
    await send('commit', Buffer.from(CSV), 'clients.csv', accountant).expect(403);
  });
});
