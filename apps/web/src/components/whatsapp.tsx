'use client';

import {
  customerWhatsappMessage,
  formatPhone,
  suggestedTemplate,
  WHATSAPP_TEMPLATE_LABELS,
  WHATSAPP_TEMPLATES,
  whatsappLink,
  whatsappMessage,
  type OrderDetail,
  type WhatsAppTemplate,
} from '@konzia/shared';
import { useState } from 'react';
import { Card } from '@/components/ui';
import { fmtAmount } from '@/lib/format';

const linkClass =
  'inline-flex min-h-11 items-center justify-center rounded-lg bg-[#1f7a4d] px-4 font-semibold text-white';

/** Commissionnaire : message prérempli selon l'étape (retour terrain R6), modifiable avant envoi. */
export function OrgWhatsAppCard({ order }: { order: OrderDetail }) {
  const remaining = Math.max(order.finalAmount - order.netPaid, 0);
  const [template, setTemplate] = useState<WhatsAppTemplate>(
    suggestedTemplate(order.status, remaining === 0),
  );
  const build = (t: WhatsAppTemplate) =>
    whatsappMessage(t, {
      customerName: order.customerName,
      organizationName: order.organizationName,
      orderNumber: order.number,
      amount: fmtAmount(
        t === 'payment_reminder'
          ? remaining
          : t === 'payment_received'
            ? order.netPaid
            : order.finalAmount,
        order.currency,
      ),
      link:
        order.customerHasAccount && typeof window !== 'undefined'
          ? `${window.location.origin}/commandes/${order.id}`
          : null,
    });
  const [text, setText] = useState(() => build(template));
  if (!order.contactWhatsapp) return null;
  return (
    <Card>
      <h2 className="font-display text-lg font-bold">Écrire au client sur WhatsApp</h2>
      <p className="text-sm text-muted">{formatPhone(order.contactWhatsapp)}</p>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Message
        <select
          value={template}
          onChange={(e) => {
            const t = e.target.value as WhatsAppTemplate;
            setTemplate(t);
            setText(build(t));
          }}
          className="min-h-11 rounded-lg border border-line px-3"
        >
          {WHATSAPP_TEMPLATES.map((t) => (
            <option key={t} value={t}>
              {WHATSAPP_TEMPLATE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Texte (modifiable)
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          className="rounded-lg border border-line p-3 font-normal"
        />
      </label>
      <a
        href={whatsappLink(order.contactWhatsapp, text)}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
      >
        Ouvrir dans WhatsApp
      </a>
    </Card>
  );
}

/** Client : écrire à son commissionnaire, avec le numéro de commande déjà saisi (EF-92). */
export function CustomerWhatsAppButton({ order }: { order: OrderDetail }) {
  if (!order.contactWhatsapp) return null;
  return (
    <a
      href={whatsappLink(order.contactWhatsapp, customerWhatsappMessage(order.number))}
      target="_blank"
      rel="noopener noreferrer"
      className={linkClass}
    >
      Écrire à {order.organizationName} sur WhatsApp
    </a>
  );
}
