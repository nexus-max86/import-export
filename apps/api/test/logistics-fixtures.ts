import { randomUUID } from 'node:crypto';
import type { TestContext } from './app';
import { asOrg, type Actor } from './fixtures';
import { sendQuote, sendRequest } from './quote-fixtures';

/**
 * Commande acceptée, payée, achetée et reçue en totalité (robe × 2, écouteurs × 5),
 * prête à être mise en colis.
 */
export async function receivedOrder(
  t: TestContext,
  pro: Actor,
  orgId: string,
  slug: string,
  customer: Actor,
) {
  const asK = <T extends { set: (k: string, v: string) => T }>(req: T) => req.set(...asOrg(orgId));
  const lub = await t.prisma.city.findUniqueOrThrow({ where: { name: 'Lubumbashi' } });
  await customer.agent
    .put('/api/me/profile', { displayName: customer.email.split('@')[0], cityId: lub.id })
    .expect(200);
  const r = await sendRequest(customer, [slug]);
  const q = await sendQuote(t, pro, orgId, r);
  const id = (
    await customer.agent
      .post(`/api/quotes/${q.quoteId}/accept`, { versionId: q.versionId })
      .expect(201)
  ).body.orderId as string;
  await asK(
    pro.agent.post(`/api/org/orders/${id}/payments`, {
      method: 'cash',
      amount: 13568,
      currency: 'USD',
      idempotencyKey: randomUUID(),
    }),
  ).expect(201);
  const detail = await asK(pro.agent.get(`/api/org/orders/${id}`)).expect(200);
  const [robe, ecouteurs] = detail.body.items.map((i: { id: string }) => i.id) as string[];
  const so = await asK(
    pro.agent.post('/api/org/supplier-orders', {
      storeName: 'SHEIN',
      purchasedAt: new Date().toISOString(),
      amount: 9000,
      currency: 'USD',
      items: [
        { orderItemId: robe, quantity: 2 },
        { orderItemId: ecouteurs, quantity: 5 },
      ],
    }),
  ).expect(201);
  await asK(
    pro.agent.post(`/api/org/supplier-orders/${so.body.id}/receive`, {
      items: [
        { orderItemId: robe, qtyReceived: 2 },
        { orderItemId: ecouteurs, qtyReceived: 5 },
      ],
    }),
  ).expect(201);
  return { id, robe: robe!, ecouteurs: ecouteurs! };
}
