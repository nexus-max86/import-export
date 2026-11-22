const TONES = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  info: 'bg-info-soft text-info',
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
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
