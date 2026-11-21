import { ORDER_STATUS_LABELS, type OrderSummary } from '@konzia/shared';
import Link from 'next/link';
import { StatusPill } from '@/components/status-pill';
import { fmtAmount, fmtDate } from '@/lib/format';

export function OrderList({
  orders,
  href,
  showCustomer,
}: {
  orders: OrderSummary[];
  href: (o: OrderSummary) => string;
  showCustomer?: boolean;
}) {
  return (
    <ul className="flex flex-col gap-3">
      {orders.map((o) => (
        <li key={o.id}>
          <Link
            href={href(o)}
            className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-4 outline-none focus-visible:ring-2 focus-visible:ring-copper"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="font-mono">{o.number}</strong>
              <StatusPill
                tone={
                  o.status === 'cancelled' ? 'neutral' : o.status === 'completed' ? 'ok' : 'warn'
                }
              >
                {ORDER_STATUS_LABELS[o.status]}
              </StatusPill>
            </div>
            <span className="text-sm text-muted">
              {showCustomer ? o.customerName : o.organizationName} ·{' '}
              {fmtAmount(o.finalAmount, o.currency)} · {fmtDate(o.createdAt)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
