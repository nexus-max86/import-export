import ExcelJS from 'exceljs';
import { mapColumns, readCsv, readSheet } from './spreadsheet';

describe('lecture des fichiers clients', () => {
  it('lit un CSV « Excel français » (point-virgule, guillemets, accents)', () => {
    const sheet = readCsv(
      'Nom;Téléphone;Commune\r\n"Mbuyi; Patrick";081 234 5678;Kampemba\r\n\r\nGrace;0997001122;Kenya\r\n',
    );
    expect(sheet.headers).toEqual(['Nom', 'Téléphone', 'Commune']);
    expect(sheet.rows).toEqual([
      { line: 2, cells: ['Mbuyi; Patrick', '081 234 5678', 'Kampemba'] },
      { line: 4, cells: ['Grace', '0997001122', 'Kenya'] },
    ]);
  });

  it('décode un CSV en Windows-1252', async () => {
    const buf = Buffer.from([0x4e, 0x6f, 0x6d, 0x0a, 0x4a, 0xe9, 0x72, 0xf4, 0x6d, 0x65, 0x0a]); // Nom\nJérôme
    const sheet = await readSheet(buf);
    expect(sheet.rows[0]?.cells[0]).toBe('Jérôme');
  });

  it('lit un fichier .xlsx, y compris un numéro saisi comme nombre (zéro initial perdu)', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Clients');
    ws.addRow(['Nom du client', 'Numéro WhatsApp']);
    ws.addRow(['Patrick Mbuyi', 812345678]);
    const sheet = await readSheet(Buffer.from(await wb.xlsx.writeBuffer()));
    expect(sheet.headers).toEqual(['Nom du client', 'Numéro WhatsApp']);
    expect(sheet.rows[0]?.cells).toEqual(['Patrick Mbuyi', '812345678']);
  });

  it('reconnaît les variantes d’en-têtes', () => {
    expect(
      mapColumns(['Prénom', 'NOM', 'Tél.', 'Courriel', 'Quartier', 'Point de repère', 'Remarques']),
    ).toEqual({
      firstName: 0,
      fullName: 1,
      phone: 2,
      email: 3,
      zone: 4,
      landmark: 5,
      notes: 6,
    });
  });
});
