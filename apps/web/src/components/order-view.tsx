import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, type OrderDetail } from '@konzia/shared';
import { StatusPill } from '@/components/status-pill';
import { Card } from '@/components/ui';
import { fmtAmount, fmtDate } from '@/lib/format';

/** Vue d'une commande commune au client et au commissionnaire. */
const EVENT_LABELS: Record<string, string> = {
  created: 'Commande créée',
  adjustment_proposed: 'Ajustement proposé',
  purchase_rule_changed: 'Règle d’achat modifiée',
};

export function OrderView({ order }: { order: OrderDetail }) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-mono text-xl font-bold">{order.number}</h1>
        <div className="flex flex-wrap gap-2">
          <StatusPill
            tone={
              order.status === 'cancelled'
                ? 'neutral'
                : order.status === 'completed'
                  ? 'ok'
                  : 'warn'
            }
          >
            {ORDER_STATUS_LABELS[order.status]}
          </StatusPill>
          <StatusPill tone={order.paymentStatus === 'paid' ? 'ok' : 'warn'}>
            {PAYMENT_STATUS_LABELS[order.paymentStatus]}
          </StatusPill>
        </div>
      </div>
      <Card>
        <p className="text-sm text-muted">
          {order.organizationName} · devis version {order.quoteVersionNo} accepté le{' '}
          {fmtDate(order.createdAt)}
        </p>
        <table className="w-full text-sm">
          <tbody>
            {order.items.map((i) => (
              <tr key={i.id} className="border-b border-line align-top">
                <td className="py-1.5 pr-2">
                  {i.description} × {i.quantity}
                </td>
                <td className="py-1.5 text-right tabular-nums whitespace-nowrap">
                  {fmtAmount(i.amount, order.currency)}
                </td>
              </tr>
            ))}
            <tr>
              <td className="pt-2 font-bold">Montant à payer (frais compris)</td>
              <td className="pt-2 text-right font-display text-lg font-bold tabular-nums whitespace-nowrap">
                {fmtAmount(order.finalAmount, order.currency)}
              </td>
            </tr>
          </tbody>
        </table>
        {order.finalAmount !== order.agreedTotalAmount && (
          <p className="text-sm text-muted">
            Montant du devis : {fmtAmount(order.agreedTotalAmount, order.currency)} ; ajustements
            acceptés : {fmtAmount(order.finalAmount - order.agreedTotalAmount, order.currency)}.
          </p>
        )}
        {order.cancelledReason && (
          <p className="text-sm">Motif d’annulation : {order.cancelledReason}</p>
        )}
      </Card>
      <Card>
        <h2 className="font-display text-lg font-bold">Historique</h2>
        <ol className="flex flex-col gap-2 text-sm">
          {order.events.map((e, idx) => (
            <li key={idx} className="flex flex-col">
              <span className="font-semibold">
                {e.toStatus ? ORDER_STATUS_LABELS[e.toStatus] : (EVENT_LABELS[e.type] ?? e.type)}
              </span>
              <span className="text-muted">
                {fmtDate(e.at)}
                {e.note ? ` · ${e.note}` : ''}
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
