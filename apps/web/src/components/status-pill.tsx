import { CircleAlert, CircleCheck, CircleDashed, Clock, Info, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** Un statut se lit par son texte et son icône, jamais par la couleur seule (WCAG 1.4.1). */
type Tone = 'ok' | 'warn' | 'info' | 'bad' | 'neutral';

const TONES: Record<Tone, { cls: string; icon: LucideIcon }> = {
  ok: { cls: 'bg-ok-soft text-ok', icon: CircleCheck },
  warn: { cls: 'bg-warn-soft text-warn', icon: Clock },
  info: { cls: 'bg-info-soft text-info', icon: Info },
  bad: { cls: 'bg-danger-soft text-danger', icon: CircleAlert },
  neutral: { cls: 'bg-sunken text-ink-2', icon: CircleDashed },
};

export function StatusPill({ tone, children }: { tone: Tone; children: ReactNode }) {
  const { cls, icon: Icon } = TONES[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full py-0.5 pr-2.5 pl-1.5 text-xs font-semibold whitespace-nowrap ${cls}`}
    >
      <Icon aria-hidden size={13} strokeWidth={2.2} className="shrink-0" />
      {children}
    </span>
  );
}
