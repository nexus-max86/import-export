import ExcelJS from 'exceljs';
import type { ImportField } from '@konzia/shared';

/** Tableau brut : en-têtes + lignes (texte), quel que soit le format d'origine. */
export interface Sheet {
  headers: string[];
  rows: { line: number; cells: string[] }[];
}

const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export async function readSheet(buf: Buffer): Promise<Sheet> {
  return buf.subarray(0, 4).equals(ZIP_MAGIC) ? readXlsx(buf) : readCsv(decodeText(buf));
}

async function readXlsx(buf: Buffer): Promise<Sheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = workbook.worksheets[0];
  if (!ws) return { headers: [], rows: [] };
  const all: { line: number; cells: string[] }[] = [];
  ws.eachRow({ includeEmpty: false }, (row, line) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cells[col - 1] = cellText(cell.value);
    });
    all.push({ line, cells: Array.from(cells, (c) => c ?? '') });
  });
  const [head, ...rows] = all;
  return { headers: head?.cells ?? [], rows };
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  if (typeof v === 'string') return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object' && 'text' in v) return String(v.text);
  if (typeof v === 'object' && 'result' in v) return v.result === undefined ? '' : String(v.result);
  if (typeof v === 'object' && 'richText' in v) return v.richText.map((r) => r.text).join('');
  return String(v);
}

/** Excel en français exporte souvent en Windows-1252 : repli si l'UTF-8 est invalide. */
function decodeText(buf: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^\uFEFF/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

/** CSV avec séparateur détecté (« ; » chez Excel français, « , » ou tabulation), guillemets gérés. */
export function readCsv(text: string): Sheet {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const sep = [';', ',', '\t'].reduce(
    (best, s) => (firstLine.split(s).length > firstLine.split(best).length ? s : best),
    ';',
  );
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      record.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  const [head, ...rows] = records;
  return {
    headers: head ?? [],
    rows: rows
      .map((cells, i) => ({ line: i + 2, cells }))
      .filter((r) => r.cells.some((c) => c.trim() !== '')),
  };
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const ALIASES: Record<ImportField | 'firstName', string[]> = {
  fullName: [
    'nom',
    'nomcomplet',
    'nometprenom',
    'prenometnom',
    'client',
    'nomduclient',
    'name',
    'fullname',
  ],
  firstName: ['prenom', 'firstname'],
  phone: [
    'telephone',
    'tel',
    'whatsapp',
    'numero',
    'numerowhatsapp',
    'numerodetelephone',
    'phone',
    'contact',
    'gsm',
  ],
  email: ['email', 'mail', 'adresseemail', 'adressemail', 'courriel'],
  zone: ['commune', 'quartier', 'zone'],
  address: ['adresse', 'avenue', 'address'],
  landmark: ['repere', 'pointderepere', 'reference'],
  notes: ['note', 'notes', 'remarque', 'remarques', 'commentaire', 'commentaires'],
};

/** Associe chaque champ Konzia à l'index de la colonne correspondante. */
export function mapColumns(headers: string[]): Partial<Record<ImportField | 'firstName', number>> {
  const map: Partial<Record<ImportField | 'firstName', number>> = {};
  headers.forEach((h, i) => {
    const key = norm(h);
    for (const [field, aliases] of Object.entries(ALIASES) as [
      ImportField | 'firstName',
      string[],
    ][]) {
      if (map[field] === undefined && aliases.includes(key)) {
        map[field] = i;
        return;
      }
    }
  });
  return map;
}

export { norm as normalizeLabel };
