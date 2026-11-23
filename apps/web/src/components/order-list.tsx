import { ORDER_STATUS_LABELS, type OrderSummary } from '@konzia/shared';
import { ResponsiveList } from '@/components/responsive-list';
import { StatusPill } from '@/components/status-pill';
import { fmtAmount, fmtDate } from '@/lib/format';

const tone = (o: OrderSummary) =>
  o.status === 'cancelled' ? 'neutral' : o.status === 'completed' ? 'ok' : 'warn';

export function OrderList({
  orders,
  href,
  showCustomer,
}: {
  orders: OrderSummary[];
  href: (o: OrderSummary) => string;
  showCustomer?: boolean;
}) {
  const who = (o: OrderSummary) => (showCustomer ? o.customerName : o.organizationName);
  return (
    <ResponsiveList
      rows={orders}
      href={href}
      caption="Commandes"
      columns={[
        {
          label: 'Commande',
          cell: (o) => <span className="font-mono whitespace-nowrap">{o.number}</span>,
        },
        { label: showCustomer ? 'Client' : 'Commissionnaire', cell: who },
        { label: 'Date', cell: (o) => <span className="text-muted">{fmtDate(o.createdAt)}</span> },
        { label: 'Montant', numeric: true, cell: (o) => fmtAmount(o.finalAmount, o.currency) },
        {
          label: 'Statut',
          cell: (o) => <StatusPill tone={tone(o)}>{ORDER_STATUS_LABELS[o.status]}</StatusPill>,
        },
      ]}
      card={(o) => (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="font-mono">{o.number}</strong>
            <StatusPill tone={tone(o)}>{ORDER_STATUS_LABELS[o.status]}</StatusPill>
          </div>
          <span className="text-sm text-muted">
            {who(o)} · {fmtAmount(o.finalAmount, o.currency)} · {fmtDate(o.createdAt)}
          </span>
        </>
      )}
    />
  );
}
