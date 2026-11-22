'use client';

import type { DisputeInfo } from '@konzia/shared';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { AdminShell, useAdmin } from '@/components/admin';
import { DisputeThread } from '@/components/disputes';
import { Button, Card, Notice } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

/** Support : décision motivée, clôture, réouverture (journalisées). */
export default function AdminDisputePage() {
  const { id } = useParams<{ id: string }>();
  const { data: dispute, error, setData } = useAdmin<DisputeInfo>(`/admin/disputes/${id}`);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function act(path: 'resolve' | 'close' | 'reopen') {
    setBusy(true);
    setMsg(undefined);
    try {
      setData(
        await api<DisputeInfo>(`/admin/disputes/${id}/${path}`, {
          body:
            path === 'resolve' ? { resolution: text } : path === 'reopen' ? { reason: text } : {},
        }),
      );
      setText('');
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'Action impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell title="Litige">
      {error && <Notice tone="error">{error}</Notice>}
      {msg && <Notice tone="error">{msg}</Notice>}
      {dispute && (
        <>
          <Card>
            <h2 className="font-display text-lg font-bold">Décision du support</h2>
            {dispute.status !== 'resolved' && (
              <label className="flex flex-col gap-1 text-sm font-semibold">
                {dispute.status === 'closed'
                  ? 'Motif de réouverture'
                  : 'Décision (communiquée aux deux parties)'}
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={3}
                  className="rounded-lg border border-line p-3 font-normal"
                />
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              {(dispute.status === 'awaiting_commissioner' ||
                dispute.status === 'under_review') && (
                <Button busy={busy} onClick={() => void act('resolve')}>
                  Rendre la décision
                </Button>
              )}
              {dispute.status === 'resolved' && (
                <Button busy={busy} onClick={() => void act('close')}>
                  Clore le litige
                </Button>
              )}
              {dispute.status === 'closed' && (
                <Button variant="ghost" busy={busy} onClick={() => void act('reopen')}>
                  Rouvrir le litige
                </Button>
              )}
            </div>
          </Card>
          <DisputeThread dispute={dispute} base="/admin/disputes" onChange={setData} />
        </>
      )}
    </AdminShell>
  );
}
