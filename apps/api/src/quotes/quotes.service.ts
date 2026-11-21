import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@konzia/db';
import {
  commissionOn,
  formatRate,
  lineAmount,
  parseRate,
  quoteTotals,
  type QuoteCurrency,
  type QuoteDraftInput,
  type QuoteInfo,
  type QuoteLineKind,
  type QuoteSettings,
  type QuoteVersionInfo,
} from '@konzia/shared';
import { AuditService } from '../audit/audit.service';
import { FxService } from '../fx/fx.service';
import { PrismaService } from '../prisma/prisma.service';
import type { OrgContext } from '../tenancy/org-context';
import { TenantDb, type TenantTx } from '../tenancy/tenant-db.service';

type Tx = TenantTx | Prisma.TransactionClient;

const VERSION_SELECT = {
  id: true,
  versionNo: true,
  status: true,
  currency: true,
  productsAmount: true,
  totalAmount: true,
  fxUsdCdf: true,
  fxSource: true,
  fxAt: true,
  validUntil: true,
  leadTimeMinDays: true,
  leadTimeMaxDays: true,
  weightGrams: true,
  assumptions: true,
  cancellationTerms: true,
  sentAt: true,
  lines: {
    select: {
      id: true,
      position: true,
      kind: true,
      quoteRequestItemId: true,
      description: true,
      quantity: true,
      unitAmount: true,
      amount: true,
      isEstimate: true,
    },
    orderBy: { position: 'asc' },
  },
} as const;

type VersionRow = Prisma.QuoteVersionGetPayload<{ select: typeof VERSION_SELECT }>;

export function toVersionInfo(v: VersionRow): QuoteVersionInfo {
  return {
    id: v.id,
    versionNo: v.versionNo,
    status: v.status,
    currency: v.currency as QuoteCurrency,
    productsAmount: Number(v.productsAmount),
    totalAmount: Number(v.totalAmount),
    fxUsdCdf: v.fxUsdCdf ? formatRate(parseRate(v.fxUsdCdf.toFixed(8))!) : null,
    fxSource: v.fxSource,
    fxAt: v.fxAt?.toISOString() ?? null,
    validUntil: v.validUntil.toISOString(),
    leadTimeMinDays: v.leadTimeMinDays,
    leadTimeMaxDays: v.leadTimeMaxDays,
    weightGrams: v.weightGrams,
    assumptions: v.assumptions,
    cancellationTerms: v.cancellationTerms,
    sentAt: v.sentAt?.toISOString() ?? null,
    lines: v.lines.map((l) => ({
      id: l.id,
      position: l.position,
      kind: l.kind,
      quoteRequestItemId: l.quoteRequestItemId,
      description: l.description,
      quantity: l.quantity,
      unitAmount: Number(l.unitAmount),
      amount: Number(l.amount),
      isEstimate: l.isEstimate,
    })),
  };
}

export const QUOTE_SELECT = {
  id: true,
  quoteRequestId: true,
  status: true,
  changeRequest: true,
  customerUserId: true,
  organization: { select: { name: true, slug: true } },
  versions: { select: VERSION_SELECT, orderBy: { versionNo: 'desc' } },
} as const;

type QuoteRow = Prisma.QuoteGetPayload<{ select: typeof QUOTE_SELECT }>;

/** Vue d'un devis : version de travail (ou dernière envoyée) + versions envoyées précédentes. */
export function toQuoteInfo(q: QuoteRow, includeDraft: boolean): QuoteInfo {
  const versions = q.versions.filter((v) => includeDraft || v.status !== 'draft');
  const [current, ...previous] = versions;
  return {
    id: q.id,
    quoteRequestId: q.quoteRequestId,
    organizationName: q.organization.name,
    organizationSlug: q.organization.slug,
    status: q.status,
    current: current ? toVersionInfo(current) : null,
    previous: previous.map(toVersionInfo),
    changeRequest: q.changeRequest,
    customerHasAccount: q.customerUserId !== null,
  };
}

/** Recalcule le statut d'une demande à partir de ses destinataires (chemin système). */
export async function refreshRequestStatus(
  tx: Prisma.TransactionClient,
  requestId: string,
): Promise<void> {
  const req = await tx.quoteRequest.findUniqueOrThrow({
    where: { id: requestId },
    select: { status: true, recipients: { select: { status: true } } },
  });
  if (!['sent', 'partially_quoted', 'quoted'].includes(req.status)) return;
  const statuses = req.recipients.map((r) => r.status);
  const quoted = statuses.filter((s) => s === 'quoted').length;
  const answered = statuses.filter((s) => s === 'quoted' || s === 'declined').length;
  const next = quoted === 0 ? 'sent' : answered === statuses.length ? 'quoted' : 'partially_quoted';
  if (next !== req.status)
    await tx.quoteRequest.update({ where: { id: requestId }, data: { status: next } });
}

@Injectable()
export class QuotesService {
  constructor(
    private readonly db: TenantDb,
    private readonly system: PrismaService,
    private readonly fx: FxService,
    private readonly audit: AuditService,
  ) {}

  // --- Réglages de l'assistant ------------------------------------------------

  getSettings(userId: string, org: OrgContext): Promise<QuoteSettings> {
    return this.db.run(userId, async (tx) => {
      const o = await tx.organization.findUniqueOrThrow({
        where: { id: org.organizationId },
        select: { commissionBps: true, transportPerKgAmount: true, transportPerKgCurrency: true },
      });
      return {
        commissionBps: o.commissionBps,
        transportPerKg:
          o.transportPerKgAmount !== null && o.transportPerKgCurrency
            ? {
                amount: Number(o.transportPerKgAmount),
                currency: o.transportPerKgCurrency as QuoteCurrency,
              }
            : null,
      };
    });
  }

  async setSettings(userId: string, org: OrgContext, input: QuoteSettings): Promise<QuoteSettings> {
    await this.db.run(userId, async (tx) => {
      await tx.organization.update({
        where: { id: org.organizationId },
        data: {
          commissionBps: input.commissionBps,
          transportPerKgAmount: input.transportPerKg ? BigInt(input.transportPerKg.amount) : null,
          transportPerKgCurrency: input.transportPerKg?.currency ?? null,
        },
        select: { id: true },
      });
      await this.audit.record(tx, {
        actorUserId: userId,
        actorRole: org.role,
        organizationId: org.organizationId,
        action: 'quote.settings_updated',
        entityType: 'organization',
        entityId: org.organizationId,
        after: input as unknown as Prisma.InputJsonValue,
      });
    });
    return this.getSettings(userId, org);
  }

  // --- Devis ------------------------------------------------------------------

  /** Ouvre le devis d'une demande reçue ; au premier accès, brouillon pré-rempli par l'assistant. */
  async open(userId: string, org: OrgContext, requestId: string): Promise<QuoteInfo> {
    return this.db.run(userId, async (tx) => {
      const recipient = await tx.quoteRequestRecipient.findFirst({
        where: { quoteRequestId: requestId, organizationId: org.organizationId },
        select: {
          id: true,
          status: true,
          orgCustomerId: true,
          quote: { select: { id: true } },
          quoteRequest: {
            select: {
              status: true,
              customerUserId: true,
              items: {
                select: {
                  id: true,
                  title: true,
                  size: true,
                  color: true,
                  variant: true,
                  quantity: true,
                  indicativePriceAmount: true,
                  indicativePriceCurrency: true,
                },
                orderBy: { position: 'asc' },
              },
            },
          },
        },
      });
      if (!recipient) throw new NotFoundException('Demande introuvable.');
      if (recipient.quote) return this.read(tx, recipient.quote.id, true);
      if (
        !['sent', 'viewed', 'evaluating'].includes(recipient.status) ||
        !['sent', 'partially_quoted', 'quoted'].includes(recipient.quoteRequest.status)
      ) {
        throw new ConflictException('Cette demande n’attend plus de devis.');
      }

      const settings = await this.getSettingsIn(tx, org.organizationId);
      const currency: QuoteCurrency = 'USD';
      const products = recipient.quoteRequest.items.map((i) => ({
        kind: 'product' as QuoteLineKind,
        quoteRequestItemId: i.id,
        description: [i.title, i.size && `taille ${i.size}`, i.color, i.variant]
          .filter(Boolean)
          .join(' · ')
          .slice(0, 300),
        quantity: i.quantity,
        unitAmount:
          i.indicativePriceCurrency === currency && i.indicativePriceAmount !== null
            ? Number(i.indicativePriceAmount)
            : 0,
        isEstimate: false,
      }));
      const { products: subtotal } = quoteTotals(products);
      const lines = [
        ...products,
        {
          kind: 'service_fee' as const,
          quoteRequestItemId: null,
          description:
            settings.commissionBps !== null
              ? `Commission de service (${settings.commissionBps / 100} %)`
              : 'Commission de service',
          quantity: 1,
          unitAmount:
            settings.commissionBps !== null
              ? Number(commissionOn(subtotal, settings.commissionBps))
              : 0,
          isEstimate: false,
        },
        {
          kind: 'international_shipping' as const,
          quoteRequestItemId: null,
          description: 'Transport jusqu’en RDC (au kilo)',
          quantity: 1,
          unitAmount: 0,
          isEstimate: true,
        },
        {
          kind: 'customs_estimate' as const,
          quoteRequestItemId: null,
          description: 'Douane',
          quantity: 1,
          unitAmount: 0,
          isEstimate: true,
        },
      ];

      const quote = await tx.quote.create({
        data: {
          recipientId: recipient.id,
          quoteRequestId: requestId,
          organizationId: org.organizationId,
          orgCustomerId: recipient.orgCustomerId,
          customerUserId: recipient.quoteRequest.customerUserId,
        },
        select: { id: true },
      });
      await this.createVersion(tx, quote.id, org.organizationId, 1, userId, {
        currency,
        lines,
        validUntil: new Date(Date.now() + 3 * 86_400_000).toISOString(),
        leadTimeMinDays: 10,
        leadTimeMaxDays: 14,
        weightGrams: null,
        assumptions: null,
        cancellationTerms: null,
      });
      if (recipient.status !== 'evaluating') {
        await tx.quoteRequestRecipient.update({
          where: { id: recipient.id },
          data: { status: 'evaluating' },
          select: { id: true },
        });
      }
      await this.audit.record(tx, {
        actorUserId: userId,
        actorRole: org.role,
        organizationId: org.organizationId,
        action: 'quote.opened',
        entityType: 'quote',
        entityId: quote.id,
      });
      return this.read(tx, quote.id, true);
    });
  }

  get(userId: string, org: OrgContext, quoteId: string): Promise<QuoteInfo> {
    return this.db.run(userId, async (tx) => {
      await this.assertOwned(tx, org, quoteId);
      return this.read(tx, quoteId, true);
    });
  }

  /** Enregistre la version en préparation ; montants et totaux recalculés ici, jamais repris du navigateur. */
  async saveDraft(
    userId: string,
    org: OrgContext,
    quoteId: string,
    input: QuoteDraftInput,
  ): Promise<QuoteInfo> {
    return this.db.run(userId, async (tx) => {
      const quote = await this.assertOwned(tx, org, quoteId);
      const draft = await tx.quoteVersion.findFirst({
        where: { quoteId, status: 'draft' },
        select: { id: true },
      });
      if (!draft)
        throw new ConflictException(
          'Aucune version en préparation : créez une nouvelle version pour corriger le devis.',
        );
      await this.assertItems(tx, quote.quoteRequestId, input);
      await tx.quoteLine.deleteMany({ where: { quoteVersionId: draft.id } });
      await this.writeLines(tx, draft.id, org.organizationId, input);
      const totals = quoteTotals(input.lines);
      await tx.quoteVersion.update({
        where: { id: draft.id },
        data: {
          currency: input.currency,
          productsAmount: totals.products,
          totalAmount: totals.total,
          validUntil: new Date(input.validUntil),
          leadTimeMinDays: input.leadTimeMinDays,
          leadTimeMaxDays: input.leadTimeMaxDays,
          weightGrams: input.weightGrams ?? null,
          assumptions: input.assumptions ?? null,
          cancellationTerms: input.cancellationTerms ?? null,
        },
        select: { id: true },
      });
      return this.read(tx, quoteId, true);
    });
  }

  /**
   * Envoi au client : la version est figée (déclencheur), les taux en vigueur y sont copiés,
   * les statuts du destinataire et de la demande sont mis à jour. Chemin système audité.
   */
  async send(userId: string, org: OrgContext, quoteId: string): Promise<QuoteInfo> {
    await this.db.run(userId, (tx) => this.assertOwned(tx, org, quoteId));
    await this.system.$transaction(async (tx) => {
      const quote = await tx.quote.findUniqueOrThrow({
        where: { id: quoteId },
        select: { id: true, recipientId: true, quoteRequestId: true, status: true },
      });
      const request = await tx.quoteRequest.findUniqueOrThrow({
        where: { id: quote.quoteRequestId },
        select: { status: true },
      });
      if (!['sent', 'partially_quoted', 'quoted'].includes(request.status)) {
        throw new ConflictException('La demande du client n’est plus ouverte.');
      }
      const draft = await tx.quoteVersion.findFirst({
        where: { quoteId, status: 'draft' },
        select: {
          id: true,
          versionNo: true,
          currency: true,
          totalAmount: true,
          validUntil: true,
          lines: { select: { kind: true } },
        },
      });
      if (!draft) throw new ConflictException('Aucune version en préparation à envoyer.');
      if (!draft.lines.some((l) => l.kind === 'product'))
        throw new BadRequestException('Le devis doit contenir au moins un article.');
      if (draft.totalAmount <= 0n)
        throw new BadRequestException('Le total du devis doit être positif.');
      if (draft.validUntil.getTime() < Date.now() + 3600_000) {
        throw new BadRequestException(
          'La date de validité doit laisser au client au moins une heure.',
        );
      }
      const cdf = await this.fx.current(tx, 'USD_CDF').catch(() => null);
      if (draft.currency === 'CDF' && !cdf)
        throw new BadRequestException('Aucun taux USD/CDF publié : envoyez le devis en dollars.');
      const cny = await this.fx.current(tx, 'USD_CNY').catch(() => null);

      await tx.quoteVersion.updateMany({
        where: { quoteId, status: 'sent' },
        data: { status: 'superseded' },
      });
      await tx.quoteVersion.update({
        where: { id: draft.id },
        data: {
          status: 'sent',
          sentAt: new Date(),
          fxUsdCdf: cdf ? formatRate(cdf.scaled) : null,
          fxUsdCny: cny ? formatRate(cny.scaled) : null,
          fxSource: cdf?.source ?? null,
          fxAt: cdf?.validFrom ?? null,
        },
      });
      await tx.quote.update({
        where: { id: quoteId },
        data: { status: 'sent', changeRequest: null },
      });
      await tx.quoteRequestRecipient.update({
        where: { id: quote.recipientId },
        data: { status: 'quoted' },
      });
      await refreshRequestStatus(tx, quote.quoteRequestId);
      await this.audit.recordSystem(
        {
          actorUserId: userId,
          actorRole: org.role,
          organizationId: org.organizationId,
          action: 'quote.sent',
          entityType: 'quote',
          entityId: quoteId,
          after: {
            versionNo: draft.versionNo,
            currency: draft.currency,
            total: Number(draft.totalAmount),
          },
        },
        tx,
      );
    });
    return this.get(userId, org, quoteId);
  }

  /** Nouvelle version en préparation, copie de la dernière version envoyée (correction). */
  async revise(userId: string, org: OrgContext, quoteId: string): Promise<QuoteInfo> {
    return this.db.run(userId, async (tx) => {
      const quote = await this.assertOwned(tx, org, quoteId);
      if (!['sent', 'changes_requested'].includes(quote.status))
        throw new ConflictException('Ce devis ne peut plus être corrigé.');
      const existing = await tx.quoteVersion.findFirst({
        where: { quoteId, status: 'draft' },
        select: { id: true },
      });
      if (existing) return this.read(tx, quoteId, true);
      const last = await tx.quoteVersion.findFirstOrThrow({
        where: { quoteId },
        orderBy: { versionNo: 'desc' },
        select: VERSION_SELECT,
      });
      await this.createVersion(tx, quoteId, org.organizationId, last.versionNo + 1, userId, {
        currency: last.currency as QuoteCurrency,
        lines: last.lines.map((l) => ({
          kind: l.kind,
          quoteRequestItemId: l.quoteRequestItemId,
          description: l.description,
          quantity: l.quantity,
          unitAmount: Number(l.unitAmount),
          isEstimate: l.isEstimate,
        })),
        validUntil: new Date(
          Math.max(last.validUntil.getTime(), Date.now() + 3 * 86_400_000),
        ).toISOString(),
        leadTimeMinDays: last.leadTimeMinDays,
        leadTimeMaxDays: last.leadTimeMaxDays,
        weightGrams: last.weightGrams,
        assumptions: last.assumptions,
        cancellationTerms: last.cancellationTerms,
      });
      return this.read(tx, quoteId, true);
    });
  }

  async withdraw(
    userId: string,
    org: OrgContext,
    quoteId: string,
    reason: string,
  ): Promise<QuoteInfo> {
    await this.db.run(userId, (tx) => this.assertOwned(tx, org, quoteId));
    await this.system.$transaction(async (tx) => {
      const quote = await tx.quote.findUniqueOrThrow({
        where: { id: quoteId },
        select: { status: true, recipientId: true, quoteRequestId: true },
      });
      if (!['draft', 'sent', 'changes_requested'].includes(quote.status))
        throw new ConflictException('Ce devis ne peut plus être retiré.');
      await tx.quoteVersion.updateMany({
        where: { quoteId, status: 'sent' },
        data: { status: 'withdrawn' },
      });
      await tx.quoteLine.deleteMany({ where: { version: { quoteId, status: 'draft' } } });
      await tx.quoteVersion.deleteMany({ where: { quoteId, status: 'draft' } });
      await tx.quote.update({ where: { id: quoteId }, data: { status: 'withdrawn' } });
      await tx.quoteRequestRecipient.update({
        where: { id: quote.recipientId },
        data: { status: 'declined', declineReason: reason },
      });
      await refreshRequestStatus(tx, quote.quoteRequestId);
      await this.audit.recordSystem(
        {
          actorUserId: userId,
          actorRole: org.role,
          organizationId: org.organizationId,
          action: 'quote.withdrawn',
          entityType: 'quote',
          entityId: quoteId,
          reason,
        },
        tx,
      );
    });
    return this.get(userId, org, quoteId);
  }

  // --- Interne -------------------------------------------------------------------

  private async getSettingsIn(tx: Tx, organizationId: string) {
    const o = await tx.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { commissionBps: true },
    });
    return { commissionBps: o.commissionBps };
  }

  private async assertOwned(tx: TenantTx, org: OrgContext, quoteId: string) {
    const q = await tx.quote.findFirst({
      where: { id: quoteId, organizationId: org.organizationId },
      select: { id: true, status: true, quoteRequestId: true },
    });
    if (!q) throw new NotFoundException('Devis introuvable.');
    return q;
  }

  private async assertItems(
    tx: TenantTx,
    requestId: string,
    input: QuoteDraftInput,
  ): Promise<void> {
    if (input.leadTimeMaxDays < input.leadTimeMinDays)
      throw new BadRequestException('Le délai maximum doit être supérieur au minimum.');
    const ids = [
      ...new Set(input.lines.map((l) => l.quoteRequestItemId).filter((x): x is string => !!x)),
    ];
    if (ids.length === 0) return;
    const n = await tx.quoteRequestItem.count({
      where: { id: { in: ids }, quoteRequestId: requestId },
    });
    if (n !== ids.length)
      throw new BadRequestException('Une ligne fait référence à un article d’une autre demande.');
  }

  private async createVersion(
    tx: TenantTx,
    quoteId: string,
    organizationId: string,
    versionNo: number,
    userId: string,
    input: QuoteDraftInput,
  ) {
    const totals = quoteTotals(input.lines);
    const v = await tx.quoteVersion.create({
      data: {
        quoteId,
        organizationId,
        versionNo,
        currency: input.currency,
        productsAmount: totals.products,
        totalAmount: totals.total,
        validUntil: new Date(input.validUntil),
        leadTimeMinDays: input.leadTimeMinDays,
        leadTimeMaxDays: input.leadTimeMaxDays,
        weightGrams: input.weightGrams ?? null,
        assumptions: input.assumptions ?? null,
        cancellationTerms: input.cancellationTerms ?? null,
        createdBy: userId,
      },
      select: { id: true },
    });
    await this.writeLines(tx, v.id, organizationId, input);
  }

  private async writeLines(
    tx: TenantTx,
    versionId: string,
    organizationId: string,
    input: QuoteDraftInput,
  ) {
    await tx.quoteLine.createMany({
      data: input.lines.map((l, i) => ({
        quoteVersionId: versionId,
        organizationId,
        position: i + 1,
        kind: l.kind,
        quoteRequestItemId: l.quoteRequestItemId ?? null,
        description: l.description,
        quantity: l.quantity,
        unitAmount: BigInt(l.unitAmount),
        amount: lineAmount(l),
        isEstimate: l.isEstimate ?? false,
      })),
    });
  }

  private async read(tx: Tx, quoteId: string, includeDraft: boolean): Promise<QuoteInfo> {
    const q = await tx.quote.findUniqueOrThrow({ where: { id: quoteId }, select: QUOTE_SELECT });
    return toQuoteInfo(q, includeDraft);
  }
}
