'use client';

import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Panneau latéral d'aperçu (DESIGN_SYSTEM.md § 5) : s'ouvre à droite sur ordinateur, en plein
 * écran sur téléphone. Échap ou le bouton ferment ; le focus revient à l'élément d'origine.
 */
export function Drawer({
  open,
  title,
  onClose,
  actions,
  children,
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <aside
      ref={panel}
      tabIndex={-1}
      role="dialog"
      aria-modal="false"
      aria-label={typeof title === 'string' ? title : 'Aperçu'}
      className="animate-drawer fixed inset-y-0 right-0 z-40 flex w-full flex-col overflow-y-auto border-l border-line bg-surface shadow-[-18px_0_40px_rgba(23,32,51,0.12)] outline-none sm:w-[460px]"
    >
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface px-5 py-4">
        <div className="min-w-0 flex-1">{title}</div>
        {actions}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le panneau"
          className="flex size-9 items-center justify-center rounded-lg bg-sunken text-ink outline-none hover:bg-line focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X aria-hidden size={18} />
        </button>
      </div>
      <div className="flex flex-col">{children}</div>
    </aside>
  );
}

export function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 border-b border-line px-5 py-4 last:border-b-0">
      <h3 className="text-xs font-bold tracking-wide text-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}
