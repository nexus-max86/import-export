import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

export function Logo() {
  return (
    <Link href="/" className="font-display text-2xl font-extrabold tracking-tight">
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
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        name={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className="min-h-11 rounded-lg border border-line bg-surface px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-copper aria-invalid:border-danger"
        {...input}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function Button({
  busy,
  children,
  variant = 'primary',
  ...props
}: { busy?: boolean; variant?: 'primary' | 'ghost' } & ComponentProps<'button'>) {
  const styles =
    variant === 'primary' ? 'bg-copper text-white' : 'border border-line bg-transparent text-ink';
  return (
    <button
      disabled={busy || props.disabled}
      className={`min-h-11 rounded-lg px-4 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-offset-2 disabled:opacity-60 ${styles}`}
      {...props}
    >
      {busy ? 'Un instant…' : children}
    </button>
  );
}

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'ok' | 'error';
  children: ReactNode;
}) {
  const styles = {
    info: 'bg-copper-soft text-ink',
    ok: 'bg-ok-soft text-ok',
    error: 'bg-danger-soft text-danger',
  }[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-lg px-3 py-2 text-sm font-medium ${styles}`}
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
