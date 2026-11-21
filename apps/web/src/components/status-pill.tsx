const TONES = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-copper-soft text-ink',
  bad: 'bg-danger-soft text-danger',
  neutral: 'border border-line text-muted',
} as const;

export function StatusPill({
  tone,
  children,
}: {
  tone: keyof typeof TONES;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
