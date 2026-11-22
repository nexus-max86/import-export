'use client';

import {
  VERIFICATION_DOCUMENTS,
  type AdminOrganizationDetail,
  type VerificationDocumentKind,
} from '@konzia/shared';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { AdminShell, ORG_STATUS_LABELS, useAdmin, VERIF_LABELS } from '@/components/admin';
import { Button, Card, Field, Notice } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { fmtDate } from '@/lib/format';

/** Écran 10 : vérifier un commissionnaire (pièces, décision motivée). */
export default function AdminCommissionerPage() {
  const { id } = useParams<{ id: string }>();
  const {
    data: org,
    error,
    setData,
  } = useAdmin<AdminOrganizationDetail>(`/admin/organizations/${id}`);
  const [mode, setMode] = useState<'reject' | 'suspend' | 'reactivate' | null>(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string }>();
  const [busy, setBusy] = useState(false);

  async function decide(decision: 'approve' | 'reject' | 'suspend' | 'reactivate') {
    setBusy(true);
    setMsg(undefined);
    try {
      await api(`/admin/organizations/${id}/${decision}`, {
        body: decision === 'approve' ? {} : { reason },
      });
      setData(await api<AdminOrganizationDetail>(`/admin/organizations/${id}`));
      setMsg({ tone: 'ok', text: 'Décision enregistrée et notifiée au responsable.' });
      setMode(null);
      setReason('');
    } catch (err) {
      setMsg({ tone: 'error', text: err instanceof ApiError ? err.message : 'Action impossible.' });
    } finally {
      setBusy(false);
    }
  }

  async function openDocument(docId: string) {
    const res = await fetch(`/api/admin/verification-documents/${docId}`, {
      credentials: 'same-origin',
    });
    if (!res.ok) return setMsg({ tone: 'error', text: 'Document indisponible.' });
    window.open(URL.createObjectURL(await res.blob()), '_blank', 'noopener');
  }

  return (
    <AdminShell title={org?.name ?? 'Commissionnaire'}>
      {error && <Notice tone="error">{error}</Notice>}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {org && (
        <>
          <Card>
            <p className="text-sm">
              <strong>{ORG_STATUS_LABELS[org.status]}</strong> ·{' '}
              {org.type === 'company' ? 'Entreprise' : 'Indépendant'} · inscrit le{' '}
              {fmtDate(org.createdAt)}
              {org.verifiedAt ? ` · vérifié le ${fmtDate(org.verifiedAt)}` : ''}
            </p>
            <p className="text-sm">
              Responsable : {org.owners.map((o) => `${o.displayName} (${o.email})`).join(', ')}
            </p>
            {org.phoneWhatsapp && <p className="text-sm">WhatsApp : {org.phoneWhatsapp}</p>}
            {org.description && <p className="text-sm text-muted">{org.description}</p>}
          </Card>

          <Card>
            <h2 className="font-display text-lg font-bold">Dossier de vérification</h2>
            {!org.verification ? (
              <p className="text-sm text-muted">Aucun dossier envoyé.</p>
            ) : (
              <>
                <p className="text-sm">
                  {VERIF_LABELS[org.verification.status]}
                  {org.verification.submittedAt
                    ? ` · envoyé le ${fmtDate(org.verification.submittedAt)}`
                    : ''}
                  {org.verification.reason ? ` · motif : ${org.verification.reason}` : ''}
                </p>
                <ul className="flex flex-col gap-2">
                  {org.verification.documents.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                      <span>
                        {VERIFICATION_DOCUMENTS[d.kind as VerificationDocumentKind] ?? d.kind} ·{' '}
                        {d.originalName}
                      </span>
                      <Button variant="ghost" onClick={() => void openDocument(d.id)}>
                        Ouvrir
                      </Button>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted">Chaque ouverture est journalisée.</p>
              </>
            )}
          </Card>

          <Card>
            <h2 className="font-display text-lg font-bold">Décision</h2>
            <div className="flex flex-wrap gap-2">
              {org.verification?.status === 'submitted' && org.status !== 'suspended' && (
                <>
                  <Button busy={busy && mode === null} onClick={() => void decide('approve')}>
                    Approuver
                  </Button>
                  <Button variant="ghost" onClick={() => setMode('reject')}>
                    Refuser…
                  </Button>
                </>
              )}
              {org.status !== 'suspended' ? (
                <Button variant="ghost" onClick={() => setMode('suspend')}>
                  Suspendre…
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setMode('reactivate')}>
                  Réactiver…
                </Button>
              )}
            </div>
            {mode && (
              <div className="flex flex-col gap-2">
                <Field
                  id="decisionReason"
                  label="Motif (communiqué au responsable)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button busy={busy} onClick={() => void decide(mode)}>
                    {
                      {
                        reject: 'Confirmer le refus',
                        suspend: 'Confirmer la suspension',
                        reactivate: 'Confirmer la réactivation',
                      }[mode]
                    }
                  </Button>
                  <Button variant="ghost" onClick={() => setMode(null)}>
                    Annuler
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </AdminShell>
  );
}
