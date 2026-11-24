'use client';

import type { MoneyByCurrency, OrgOverview } from '@konzia/shared';
import {
  ArrowRight,
  Boxes,
  ChevronRight,
  Inbox,
  Plane,
  TriangleAlert,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ProNav } from '@/components/pro-nav';
import { Loading, Notice } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { fmtAmount } from '@/lib/format';
import { useActiveOrg } from '@/lib/use-org';

const sum = (m: MoneyByCurrency[]) =>
  m.length === 0 ? '0' : m.map((x) => fmtAmount(x.amount, x.currency)).join(' · ');

function Metric({
  label,
  value,
  hint,
  href,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  tone?: 'warn';
}) {
  const body = (
    <>
      <span
        className={`flex items-center gap-1.5 text-[13px] font-semibold ${tone === 'warn' ? 'text-warn' : 'text-muted'}`}
      >
        {tone === 'warn' && <TriangleAlert aria-hidden size={14} />}
        {label}
      </span>
      <span className="font-display text-[28px] leading-tight font-extrabold tabular-nums">
        {value}
      </span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </>
  );
  const cls = `flex flex-col gap-1.5 rounded-2xl border bg-surface px-5 py-4 ${tone === 'warn' ? 'border-warn-soft' : 'border-line'}`;
  return href ? (
    <Link
      href={href}
      className={`${cls} text-ink outline-none transition-[border-color] duration-150 ease-out-quint hover:border-line-strong focus-visible:ring-2 focus-visible:ring-primary`}
    >
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Todo({
  icon: Icon,
  title,
  detail,
  href,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  href: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 border-t border-line px-5 py-3.5 text-ink outline-none hover:bg-sunken focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-strong">
          <Icon aria-hidden size={18} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <strong className="text-sm">{title}</strong>
          <span className="text-xs text-muted">{detail}</span>
        </span>
        <ChevronRight aria-hidden size={16} className="text-muted" />
      </Link>
    </li>
  );
}

/** Commandes par semaine : barres SVG, valeurs lisibles (titre, période, unité, équivalent texte). */
function WeeklyChart({ weeks }: { weeks: OrgOverview['ordersPerWeek'] }) {
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const total = weeks.reduce((n, w) => n + w.count, 0);
  const label = weeks
    .map((w) => `semaine du ${new Date(w.weekStart).toLocaleDateString('fr-FR')} : ${w.count}`)
    .join(', ');
  return (
    <section
      aria-labelledby="g-weeks"
      className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="g-weeks" className="font-display text-lg font-bold">
          Commandes créées par semaine
        </h2>
        <span className="text-xs text-muted">8 dernières semaines · nombre de commandes</span>
      </div>
      {total === 0 ? (
        <p className="text-sm text-muted">
          Pas encore de commande : la courbe apparaîtra avec vos premières commandes.
        </p>
      ) : (
        <div
          role="img"
          aria-label={`Commandes par semaine : ${label}`}
          className="flex flex-col gap-2"
        >
          <div className="flex h-40 items-stretch gap-3 border-b border-line px-1">
            {weeks.map((w, i) => (
              <div
                key={w.weekStart}
                className="flex h-full flex-1 flex-col items-center justify-end gap-1"
              >
                <span className="text-[11px] font-semibold text-ink-2 tabular-nums">
                  {w.count || ''}
                </span>
                <span
                  title={`${w.count} commande(s)`}
                  className={`w-full rounded-t-md ${i === weeks.length - 1 ? 'bg-primary' : 'bg-primary-soft'}`}
                  style={{ height: `${Math.max(2, (w.count / max) * 100)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-3 px-1 text-[11px] text-muted">
            {weeks.map((w) => (
              <span key={w.weekStart} className="flex-1 text-center">
                {new Date(w.weekStart).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                })}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default function ProOverviewPage() {
  const router = useRouter();
  const org = useActiveOrg();
  const [o, setO] = useState<OrgOverview>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    if (!org) return;
    setError(undefined);
    try {
      setO(await api<OrgOverview>('/org/overview', { org }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401)
        router.replace('/connexion?suite=/pro/vue-generale');
      else setError(err instanceof ApiError ? err.message : 'Chargement impossible.');
    }
  }, [org, router]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!org) return null;
  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-8 lg:px-8">
      <ProNav />
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold">Vue générale</h1>
        <p className="text-sm text-muted">Ce qui demande votre attention aujourd’hui.</p>
      </div>
      {error && (
        <Notice tone="error">
          {error}{' '}
          <button type="button" onClick={() => void load()} className="font-semibold underline">
            Réessayer
          </button>
        </Notice>
      )}
      {!o && !error && <Loading lines={3} />}
      {o && (
        <>
          <section
            aria-label="Indicateurs"
            className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3"
          >
            <Metric
              label="Demandes à traiter"
              value={o.requestsToHandle}
              hint={
                o.oldestRequestHours != null
                  ? `La plus ancienne attend depuis ${o.oldestRequestHours} h`
                  : undefined
              }
              href="/pro/demandes"
            />
            <Metric label="Devis en attente du client" value={o.quotesAwaitingCustomer} />
            <Metric
              label="Commandes en cours"
              value={o.activeOrders}
              hint={`${o.inTransitOrders} en transport`}
              href="/pro/commandes"
            />
            <Metric
              label="En retard sur le délai annoncé"
              value={o.lateOrders}
              tone={o.lateOrders > 0 ? 'warn' : undefined}
              hint="Délai maximal du devis dépassé"
            />
            <Metric label="Articles à recevoir" value={o.itemsToReceive} href="/pro/achats" />
            <Metric label="Colis à expédier" value={o.parcelsToShip} href="/pro/colis" />
            {o.finance && (
              <Metric
                label="Reste dû par les clients"
                value={sum(o.finance.owed)}
                hint={`Encaissé et confirmé sur 7 jours : ${sum(o.finance.confirmedLast7Days)}`}
                href="/pro/paiements"
              />
            )}
          </section>

          <div className="flex flex-wrap items-start gap-5">
            <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
              <WeeklyChart weeks={o.ordersPerWeek} />
              <section
                aria-labelledby="g-alerts"
                className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id="g-alerts" className="font-display text-lg font-bold">
                    À surveiller
                  </h2>
                  <span className="text-xs text-muted">
                    Alertes calculées par des règles simples, à vérifier avant d’agir
                  </span>
                </div>
                {o.alerts.length === 0 ? (
                  <p className="text-sm text-muted">Rien à signaler pour l’instant.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {o.alerts.map((a, i) => (
                      <li
                        key={i}
                        className="flex flex-wrap items-start gap-3 rounded-xl bg-warn-soft px-4 py-3 text-sm"
                      >
                        <TriangleAlert
                          aria-hidden
                          size={17}
                          className="mt-0.5 shrink-0 text-warn"
                        />
                        <span className="min-w-0 flex-1">
                          <strong>{a.title}</strong>
                          <span className="block text-ink-2">{a.detail}</span>
                        </span>
                        <Link
                          href={a.href}
                          className="flex items-center gap-1 font-semibold text-primary-strong"
                        >
                          Vérifier
                          <ArrowRight aria-hidden size={15} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
            <section
              aria-labelledby="g-todo"
              className="min-w-0 flex-[1_1_320px] overflow-hidden rounded-2xl border border-line bg-surface"
            >
              <h2 id="g-todo" className="px-5 pt-4 pb-3 font-display text-lg font-bold">
                À faire maintenant
              </h2>
              <ul>
                {o.finance && o.finance.paymentsToVerify > 0 && (
                  <Todo
                    icon={Wallet}
                    title={`${o.finance.paymentsToVerify} paiement(s) à vérifier`}
                    detail="Comparez avec votre relevé Mobile Money ou bancaire"
                    href="/pro/paiements"
                  />
                )}
                {o.requestsToHandle > 0 && (
                  <Todo
                    icon={Inbox}
                    title={`${o.requestsToHandle} demande(s) sans devis`}
                    detail={
                      o.oldestRequestHours != null
                        ? `La plus ancienne attend depuis ${o.oldestRequestHours} h`
                        : 'À traiter'
                    }
                    href="/pro/demandes"
                  />
                )}
                {o.parcelsToShip > 0 && (
                  <Todo
                    icon={Boxes}
                    title={`${o.parcelsToShip} colis fermé(s), pas encore expédié(s)`}
                    detail="Rattachez-les à une expédition"
                    href="/pro/expeditions"
                  />
                )}
                {o.shipmentsInProgress > 0 && (
                  <Todo
                    icon={Plane}
                    title={`${o.shipmentsInProgress} expédition(s) en route`}
                    detail="Enregistrez les étapes à mesure"
                    href="/pro/expeditions"
                  />
                )}
              </ul>
              {!(
                (o.finance && o.finance.paymentsToVerify > 0) ||
                o.requestsToHandle > 0 ||
                o.parcelsToShip > 0 ||
                o.shipmentsInProgress > 0
              ) && (
                <p className="border-t border-line px-5 py-4 text-sm text-muted">
                  Tout est à jour.
                </p>
              )}
            </section>
          </div>
        </>
      )}
    </main>
  );
}
