import type { TestContext } from './app';
import { asOrg, type Actor } from './fixtures';

/** Demande de deux articles envoyée par `customer` aux commissionnaires `slugs`. */
export async function sendRequest(customer: Actor, slugs: string[]) {
  await customer.agent
    .post('/api/requests/draft/items', {
      source: 'lookup',
      sourceUrl: 'https://fr.shein.com/Robe-p-1.html',
      marketplace: 'shein',
      title: 'Robe midi plissée',
      size: 'M',
      quantity: 2,
      indicativePrice: { amount: 1499, currency: 'USD' },
      priceFetchedAt: new Date().toISOString(),
    })
    .expect(201);
  const d = await customer.agent
    .post('/api/requests/draft/items', {
      source: 'manual',
      title: 'Écouteurs sans fil',
      quantity: 5,
    })
    .expect(201);
  await customer.agent
    .post(`/api/requests/${d.body.id}/send`, { commissioners: slugs })
    .expect(201);
  return { id: d.body.id as string, items: d.body.items as { id: string }[] };
}

export function quoteDraft(items: { id: string }[], total = 'standard') {
  const lines = [
    {
      kind: 'product',
      quoteRequestItemId: items[0]!.id,
      description: 'Robe midi plissée, M',
      quantity: 2,
      unitAmount: 1549,
    },
    {
      kind: 'product',
      quoteRequestItemId: items[1]!.id,
      description: 'Écouteurs sans fil',
      quantity: 5,
      unitAmount: 1328,
    },
    { kind: 'service_fee', description: 'Commission 10 %', quantity: 1, unitAmount: 974 },
    {
      kind: 'international_shipping',
      description: 'Transport',
      quantity: 1,
      unitAmount: total === 'cheaper' ? 2000 : 2856,
      isEstimate: true,
    },
  ];
  return {
    currency: 'USD',
    validUntil: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    leadTimeMinDays: 14,
    leadTimeMaxDays: 21,
    lines,
  };
}

/** Le commissionnaire ouvre, complète et envoie son devis. Renvoie l'identifiant du devis. */
export async function sendQuote(
  _t: TestContext,
  pro: Actor,
  orgId: string,
  request: { id: string; items: { id: string }[] },
  total = 'standard',
) {
  const q = await pro.agent
    .post(`/api/org/requests/${request.id}/quote`)
    .set(...asOrg(orgId))
    .expect(201);
  await pro.agent
    .put(`/api/org/quotes/${q.body.id}/draft`, quoteDraft(request.items, total))
    .set(...asOrg(orgId))
    .expect(200);
  const sent = await pro.agent
    .post(`/api/org/quotes/${q.body.id}/send`)
    .set(...asOrg(orgId))
    .expect(201);
  return { quoteId: q.body.id as string, versionId: sent.body.current.id as string };
}
