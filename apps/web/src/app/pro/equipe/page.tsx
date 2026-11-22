'use client';

import { ORG_ROLE_LABELS, ORG_ROLES, type MemberInfo, type OrgRole } from '@konzia/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ProNav } from '@/components/pro-nav';
import { Button, Card, Field, Notice } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useActiveOrg } from '@/lib/use-org';

const ROLE_HELP: Record<OrgRole, string> = {
  owner: 'Tout, y compris l’équipe et les réglages',
  sales: 'Clients, demandes, devis, suivi des commandes, litiges',
  buyer: 'Achats chez les vendeurs (coûts réels)',
  logistics: 'Colis, expéditions, étapes de suivi',
  accountant: 'Paiements, remboursements, exports',
  courier: 'Remise des colis',
};
const INVITABLE = ORG_ROLES.filter((r) => r !== 'owner');

/** Équipe : inviter un collaborateur avec le bon rôle, changer un rôle, retirer un membre. */
export default function ProTeamPage() {
  const org = useActiveOrg();
  const [members, setMembers] = useState<MemberInfo[]>();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string }>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!org) return;
    api<MemberInfo[]>('/org/members', { org }).then(setMembers, (err: unknown) =>
      setMsg({
        tone: 'error',
        text: err instanceof ApiError ? err.message : 'Chargement impossible.',
      }),
    );
  }, [org]);
  useEffect(load, [load]);

  async function run(work: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMsg(undefined);
    try {
      await work();
      setMsg({ tone: 'ok', text: ok });
      load();
    } catch (err) {
      setMsg({ tone: 'error', text: err instanceof ApiError ? err.message : 'Action impossible.' });
    } finally {
      setBusy(false);
    }
  }

  function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const email = String(f.get('inviteEmail') ?? '');
    void run(async () => {
      await api('/org/invitations', { org: org!, body: { email, role: String(f.get('role')) } });
      form.reset();
    }, `Invitation envoyée à ${email}.`);
  }

  if (!org) return null;
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-10">
      <ProNav />
      <h1 className="font-display text-2xl font-bold">Équipe</h1>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Card>
        <h2 className="font-display text-lg font-bold">Inviter un collaborateur</h2>
        <form onSubmit={invite} className="flex flex-col gap-3">
          <Field id="inviteEmail" label="Adresse e-mail" type="email" required />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">Rôle</legend>
            {INVITABLE.map((r, i) => (
              <label key={r} className="flex gap-2 text-sm">
                <input type="radio" name="role" value={r} defaultChecked={i === 0} />
                <span>
                  <strong>{ORG_ROLE_LABELS[r]}</strong>
                  <span className="block text-muted">{ROLE_HELP[r]}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <Button type="submit" busy={busy}>
            Envoyer l’invitation
          </Button>
        </form>
        <p className="text-xs text-muted">
          Le collaborateur reçoit un lien par e-mail ; il crée son compte (ou se connecte) puis
          rejoint votre activité.
        </p>
      </Card>
      <Card>
        <h2 className="font-display text-lg font-bold">Membres</h2>
        {!members ? (
          <p className="text-sm text-muted">Chargement…</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex flex-col gap-2 rounded-lg border border-line p-3 text-sm"
              >
                <span>
                  <strong>{m.displayName}</strong> <span className="text-muted">· {m.email}</span>
                </span>
                {m.role === 'owner' ? (
                  <span className="text-muted">{ORG_ROLE_LABELS.owner}</span>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label={`Rôle de ${m.displayName}`}
                      value={m.role}
                      disabled={busy}
                      onChange={(e) =>
                        void run(
                          () =>
                            api(`/org/members/${m.id}`, {
                              org,
                              method: 'PATCH',
                              body: { role: e.target.value },
                            }),
                          `Rôle de ${m.displayName} modifié.`,
                        )
                      }
                      className="min-h-10 rounded-lg border border-line px-2"
                    >
                      {INVITABLE.map((r) => (
                        <option key={r} value={r}>
                          {ORG_ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => api(`/org/members/${m.id}`, { org, method: 'DELETE' }),
                          `${m.displayName} ne fait plus partie de l’équipe.`,
                        )
                      }
                    >
                      Retirer
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
