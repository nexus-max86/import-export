import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

export function Logo() {
  return (
    <Link
      href="/"
      className="rounded-md font-display text-2xl font-extrabold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-copper"
    >
      Kon<span className="text-copper">zia</span>
    </Link>
  );
}

export function Field({
  id,
  label,
  error,
  hint,
  ...input
}: { id: string; label: string; error?: string; hint?: string } & ComponentProps<'input'>) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        name={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className="min-h-11 rounded-lg border px-3 text-base aria-invalid:border-danger"
        {...input}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="animate-enter text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<ButtonVariant, string> = {
  // Une seule action principale par écran (docs/06) : c'est la seule en cuivre plein.
  primary: 'bg-copper text-on-copper hover:bg-copper-strong',
  secondary: 'border border-line-strong bg-surface text-ink hover:border-muted',
  ghost: 'border border-line bg-transparent text-ink hover:bg-sunken',
  danger: 'border border-danger/40 bg-surface text-danger hover:bg-danger-soft',
};

/**
 * Classes d'un bouton, réutilisables sur un lien (`<Link className={buttonClass()}>`) pour
 * qu'une action ait le même aspect qu'elle soit un lien ou un bouton.
 */
export function buttonClass(variant: ButtonVariant = 'primary', extra = ''): string {
  return [
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-center font-semibold',
    'outline-none select-none focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
    // Retour tactile immédiat : légère compression à l'appui, rien d'autre ne bouge.
    'transition-[transform,background-color,border-color] duration-150 ease-out-quint active:scale-[0.97]',
    'disabled:pointer-events-none disabled:opacity-55',
    VARIANTS[variant],
    extra,
  ].join(' ');
}

export function Button({
  busy,
  children,
  variant = 'primary',
  className = '',
  ...props
}: { busy?: boolean; variant?: ButtonVariant } & ComponentProps<'button'>) {
  return (
    <button
      disabled={busy || props.disabled}
      aria-busy={busy || undefined}
      className={buttonClass(variant, className)}
      {...props}
    >
      {busy ? (
        <>
          <Spinner />
          Un instant…
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function Spinner() {
  return (
    <span
      aria-hidden
      className="size-4 shrink-0 animate-spin-fast rounded-full border-2 border-current border-r-transparent"
    />
  );
}

const NOTICE_TONES = {
  info: 'bg-info-soft text-info',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  error: 'bg-danger-soft text-danger',
} as const;

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: keyof typeof NOTICE_TONES;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`animate-enter rounded-lg px-3 py-2 text-sm font-medium ${NOTICE_TONES[tone]}`}
    >
      {children}
    </div>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
      {children}
    </div>
  );
}

/** État vide : dit ce qui manque et, si possible, comment le faire apparaître. */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-2xl border border-dashed border-line-strong px-5 py-6">
      <p className="font-display text-base font-bold">{title}</p>
      {children && <div className="text-sm text-muted">{children}</div>}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

/**
 * Chargement : silhouette de la page plutôt qu'un texte seul. Le texte « Chargement… » reste
 * lu par les lecteurs d'écran.
 */
export function Loading({ lines = 3 }: { lines?: number }) {
  return (
    <div role="status" className="flex flex-col gap-3">
      <span className="sr-only">Chargement…</span>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          aria-hidden
          className="h-16 animate-shimmer rounded-2xl bg-line/70"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </div>
  );
}

/** Page entière en chargement (même gabarit que la page qui arrive). */
export function PageLoading({ width = 'max-w-2xl' }: { width?: string }) {
  return (
    <main className={`mx-auto flex ${width} flex-col gap-5 px-4 py-10`}>
      <div aria-hidden className="h-8 w-40 animate-shimmer rounded-lg bg-line/70" />
      <Loading />
    </main>
  );
}
