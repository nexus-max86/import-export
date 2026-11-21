'use client';

import { CreateRateSchema, type FxPair, type RateInfo } from '@konzia/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button, Card, Field, Logo, Notice } from '@/components/ui';
import { api, ApiError, fieldErrors } from '@/lib/api';
import { fmtDate } from '@/lib/format';

const PAIR_LABEL: Record<FxPair, string> = {
  USD_CDF: '1 USD en francs congolais (CDF)',
  USD_CNY: '1 USD en yuans (CNY)',
};

export default function AdminRatesPage() {
  const router = useRouter();
  const [history, setHistory] = useState<RateInfo[]>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string }>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setHistory(await api<RateInfo[]>('/admin/exchange-rates'));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401)
        router.replace('/connexion?suite=/admin/taux');
      else if (err instanceof ApiError) setMsg({ tone: 'error', text: err.message });
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function publish(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const parsed = CreateRateSchema.safeParse({
      pair: f.get('pair'),
      rate: f.get('rate'),
      source: f.get('source'),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const r = await api<RateInfo>('/admin/exchange-rates', { body: parsed.data });
      setMsg({
        tone: 'ok',
        text: `Taux publié : ${PAIR_LABEL[r.pair]} = ${r.rate}. Les nouveaux devis l’utiliseront.`,
      });
      form.reset();
      await load();
    } catch (err) {
      if (err instanceof ApiError) setMsg({ tone: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  const current = (pair: FxPair) => history?.find((h) => h.pair === pair);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-10">
      <Logo />
      <h1 className="font-display text-2xl font-bold">Taux de change</h1>
      <p className="text-muted">
        Chaque devis copie le taux en vigueur au moment de son envoi : publier un nouveau taux ne
        modifie jamais un devis existant.
      </p>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="grid gap-3 sm:grid-cols-2">
        {(['USD_CDF', 'USD_CNY'] as const).map((p) => (
          <Card key={p}>
            <span className="text-sm text-muted">{PAIR_LABEL[p]}</span>
            <strong className="font-display text-2xl tabular-nums">
              {current(p)?.rate ?? '—'}
            </strong>
            <span className="text-xs text-muted">
              {current(p)
                ? `${current(p)!.source} · ${fmtDate(current(p)!.validFrom)}`
                : 'Aucun taux publié'}
            </span>
          </Card>
        ))}
      </div>
      <Card>
        <h2 className="font-display text-lg font-bold">Publier un taux</h2>
        <form onSubmit={publish} noValidate className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="pair" className="text-sm font-semibold">
              Paire
            </label>
            <select
              id="pair"
              name="pair"
              className="min-h-11 rounded-lg border border-line bg-surface px-3"
            >
              {(['USD_CDF', 'USD_CNY'] as const).map((p) => (
                <option key={p} value={p}>
                  {PAIR_LABEL[p]}
                </option>
              ))}
            </select>
          </div>
          <Field
            id="rate"
            label="Taux"
            inputMode="decimal"
            placeholder="2850"
            error={errors.rate}
          />
          <Field
            id="source"
            label="Source"
            placeholder="Ex. : BCC, marché de Lubumbashi"
            error={errors.source}
          />
          <Button type="submit" busy={busy}>
            Publier le taux
          </Button>
        </form>
      </Card>
      {history && history.length > 0 && (
        <Card>
          <h2 className="font-display text-lg font-bold">Historique</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="py-1 font-medium">Date</th>
                  <th className="py-1 font-medium">Paire</th>
                  <th className="py-1 text-right font-medium">Taux</th>
                  <th className="py-1 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-t border-line">
                    <td className="py-1">{fmtDate(h.validFrom)}</td>
                    <td className="py-1">{h.pair.replace('_', '/')}</td>
                    <td className="py-1 text-right tabular-nums">{h.rate}</td>
                    <td className="py-1">{h.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </main>
  );
}
