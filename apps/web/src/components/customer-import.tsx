'use client';

import {
  IMPORT_FIELD_LABELS,
  type ImportField,
  type ImportPreview,
  type ImportReport,
} from '@konzia/shared';
import { useState } from 'react';
import { Button, Card, Notice } from '@/components/ui';
import { ApiError, apiUpload } from '@/lib/api';

const STATUS = {
  ok: { label: 'À importer', cls: 'bg-ok-soft text-ok' },
  duplicate: { label: 'Doublon', cls: 'bg-copper-soft' },
  error: { label: 'À corriger', cls: 'bg-danger-soft text-danger' },
} as const;

/** Import de clients : choix du fichier → aperçu ligne par ligne → confirmation. */
export function CustomerImport({
  org,
  onDone,
  onCancel,
}: {
  org: string;
  onDone: (r: ImportReport) => void;
  onCancel: () => void;
}) {
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<ImportPreview>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const form = (f: File) => {
    const fd = new FormData();
    fd.set('file', f);
    return fd;
  };

  async function choose(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setPreview(undefined);
    setError(undefined);
    setBusy(true);
    try {
      setPreview(await apiUpload<ImportPreview>('/org/customers/import/preview', form(f), org));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Lecture impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!file) return;
    setBusy(true);
    setError(undefined);
    try {
      onDone(await apiUpload<ImportReport>('/org/customers/import', form(file), org));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'L’import a échoué.');
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="font-display text-lg font-bold">Importer vos clients depuis Excel</h2>
      <p className="text-sm text-muted">
        Fichier .xlsx ou .csv. La première ligne doit contenir les titres des colonnes, par exemple
        : Nom, Téléphone, Commune, Adresse, Note. Rien n’est enregistré avant votre confirmation.
      </p>
      <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-line px-4 font-semibold focus-within:ring-2 focus-within:ring-copper">
        {busy && !preview
          ? 'Lecture…'
          : file
            ? `Fichier : ${file.name} (changer)`
            : 'Choisir le fichier'}
        <input
          type="file"
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          aria-label="Choisir le fichier de clients"
          onChange={(e) => choose(e.target.files?.[0])}
        />
      </label>
      {error && <Notice tone="error">{error}</Notice>}
      {preview && (
        <>
          <p className="text-sm">
            Colonnes reconnues :{' '}
            {(Object.entries(preview.columns) as [ImportField, string][])
              .map(([f, col]) => `${IMPORT_FIELD_LABELS[f]} ← « ${col} »`)
              .join(' · ')}
          </p>
          <Notice tone={preview.counts.ok > 0 ? 'ok' : 'info'}>
            {preview.counts.ok} client(s) à importer · {preview.counts.duplicate} doublon(s)
            ignoré(s) · {preview.counts.error} ligne(s) à corriger dans le fichier
          </Notice>
          <div className="max-h-96 overflow-auto rounded-lg border border-line">
            <table className="w-full min-w-[32rem] text-sm">
              <thead className="sticky top-0 bg-surface text-left text-muted">
                <tr>
                  <th className="px-2 py-1 font-medium">Ligne</th>
                  <th className="px-2 py-1 font-medium">Nom</th>
                  <th className="px-2 py-1 font-medium">Téléphone</th>
                  <th className="px-2 py-1 font-medium">État</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.line} className="border-t border-line align-top">
                    <td className="px-2 py-1 tabular-nums">{r.line}</td>
                    <td className="px-2 py-1">
                      {r.fullName || <span className="text-muted">—</span>}
                    </td>
                    <td className="px-2 py-1 tabular-nums">{r.phoneWhatsapp ?? r.email ?? '—'}</td>
                    <td className="px-2 py-1">
                      <span
                        className={`rounded-full px-2 text-xs font-semibold ${STATUS[r.status].cls}`}
                      >
                        {STATUS[r.status].label}
                      </span>
                      {r.message && <span className="block text-xs text-muted">{r.message}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {preview && preview.counts.ok > 0 && (
          <Button busy={busy} onClick={confirm}>
            Importer {preview.counts.ok} client(s)
          </Button>
        )}
        <Button variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </Card>
  );
}
