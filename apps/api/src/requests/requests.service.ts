import { NotificationsService } from '../notifications/notifications.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@konzia/db';
import {
  MAX_ITEMS_PER_REQUEST,
  type ManagedRequestInput,
  type MarketplaceCode,
  type OrgRequestSummary,
  type RequestDetail,
  type RequestItemInput,
  type RequestSummary,
  type SendRequestInput,
  type UpdateRequestItemInput,
} from '@konzia/shared';
import { AuditService } from '../audit/audit.service';
import { CustomersService } from '../customers/customers.service';
import { PrismaService } from '../prisma/prisma.service';
import type { OrgContext } from '../tenancy/org-context';
import { TenantDb, type TenantTx } from '../tenancy/tenant-db.service';

const ITEM_SELECT = {
  id: true,
  position: true,
  source: true,
  sourceUrl: true,
  marketplace: true,
  title: true,
  variant: true,
  size: true,
  color: true,
  quantity: true,
  notes: true,
  imageUrl: true,
  indicativePriceAmount: true,
  indicativePriceCurrency: true,
  priceFetchedAt: true,
  screenshotFileId: true,
} as const;

type ItemRow = Prisma.QuoteRequestItemGetPayload<{ select: typeof ITEM_SELECT }>;

function toItem(i: ItemRow) {
  return {
    id: i.id,
    position: i.position,
    source: i.source,
    sourceUrl: i.sourceUrl,
    marketplace: i.marketplace as MarketplaceCode | null,
    title: i.title,
    variant: i.variant,
    size: i.size,
    color: i.color,
    quantity: i.quantity,
    notes: i.notes,
    imageUrl: i.imageUrl,
    indicativePrice:
      i.indicativePriceAmount !== null && i.indicativePriceCurrency
        ? { amount: Number(i.indicativePriceAmount), currency: i.indicativePriceCurrency }
        : null,
    priceFetchedAt: i.priceFetchedAt?.toISOString() ?? null,
    hasScreenshot: i.screenshotFileId !== null,
  };
}

function itemData(input: RequestItemInput, position: number) {
  return {
    position,
    source: input.source,
    sourceUrl: input.sourceUrl ?? null,
    marketplace: input.marketplace ?? null,
    title: input.title,
    variant: input.variant ?? null,
    size: input.size ?? null,
    color: input.color ?? null,
    quantity: input.quantity,
    notes: input.notes ?? null,
    imageUrl: input.imageUrl ?? null,
    indicativePriceAmount: input.indicativePrice ? BigInt(input.indicativePrice.amount) : null,
    indicativePriceCurrency: input.indicativePrice?.currency ?? null,
    priceFetchedAt:
      input.indicativePrice && input.priceFetchedAt ? new Date(input.priceFetchedAt) : null,
    screenshotFileId: input.screenshotFileId ?? null,
  };
}

@Injectable()
export class RequestsService {
  constructor(
    private readonly db: TenantDb,
    private readonly system: PrismaService,
    private readonly customers: CustomersService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // --- Client ---------------------------------------------------------------

  async listMine(userId: string): Promise<RequestSummary[]> {
    return this.db.run(userId, async (tx) => {
      const rows = await tx.quoteRequest.findMany({
        where: { customerUserId: userId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          status: true,
          sentAt: true,
          createdAt: true,
          _count: { select: { items: true } },
          items: { select: { title: true }, orderBy: { position: 'asc' }, take: 1 },
          recipients: { select: { status: true, organization: { select: { name: true } } } },
        },
      });
      return rows.map((r) => ({
        id: r.id,
        status: r.status,
        itemCount: r._count.items,
        firstItemTitle: r.items[0]?.title ?? null,
        sentAt: r.sentAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        recipients: r.recipients.map((x) => ({
          organizationName: x.organization.name,
          status: x.status,
        })),
      }));
    });
  }

  /** Brouillon en cours du client (le plus récent), ou null. */
  async currentDraft(userId: string): Promise<RequestDetail | null> {
    return this.db.run(userId, async (tx) => {
      const draft = await tx.quoteRequest.findFirst({
        where: { customerUserId: userId, status: 'draft' },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      return draft ? this.readForCustomer(tx, draft.id) : null;
    });
  }

  /** Ajoute un article au brouillon (créé au premier article). Chaque ajout est enregistré aussitôt. */
  async addToDraft(userId: string, input: RequestItemInput): Promise<RequestDetail> {
    return this.db.run(userId, async (tx) => {
      await this.assertOwnScreenshot(tx, userId, input.screenshotFileId ?? null);
      const draft =
        (await tx.quoteRequest.findFirst({
          where: { customerUserId: userId, status: 'draft' },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        })) ??
        (await tx.quoteRequest.create({
          data: { customerUserId: userId, createdByUserId: userId },
          select: { id: true },
        }));
      const count = await tx.quoteRequestItem.count({ where: { quoteRequestId: draft.id } });
      if (count >= MAX_ITEMS_PER_REQUEST) {
        throw new ConflictException(
          `Une demande contient au plus ${MAX_ITEMS_PER_REQUEST} articles.`,
        );
      }
      const last = await tx.quoteRequestItem.findFirst({
        where: { quoteRequestId: draft.id },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      await tx.quoteRequestItem.create({
        data: { quoteRequestId: draft.id, ...itemData(input, (last?.position ?? 0) + 1) },
        select: { id: true },
      });
      return this.readForCustomer(tx, draft.id);
    });
  }

  async updateItem(
    userId: string,
    requestId: string,
    itemId: string,
    input: UpdateRequestItemInput,
  ): Promise<RequestDetail> {
    return this.db.run(userId, async (tx) => {
      const { count } = await tx.quoteRequestItem.updateMany({
        where: {
          id: itemId,
          quoteRequestId: requestId,
          quoteRequest: { customerUserId: userId, status: 'draft' },
        },
        data: {
          variant: input.variant ?? null,
          size: input.size ?? null,
          color: input.color ?? null,
          quantity: input.quantity,
          notes: input.notes ?? null,
        },
      });
      if (count === 0) throw new NotFoundException('Article introuvable ou demande déjà envoyée.');
      return this.readForCustomer(tx, requestId);
    });
  }

  async removeItem(userId: string, requestId: string, itemId: string): Promise<RequestDetail> {
    return this.db.run(userId, async (tx) => {
      const { count } = await tx.quoteRequestItem.deleteMany({
        where: {
          id: itemId,
          quoteRequestId: requestId,
          quoteRequest: { customerUserId: userId, status: 'draft' },
        },
      });
      if (count === 0) throw new NotFoundException('Article introuvable ou demande déjà envoyée.');
      return this.readForCustomer(tx, requestId);
    });
  }

  async getForCustomer(userId: string, requestId: string): Promise<RequestDetail> {
    return this.db.run(userId, (tx) => this.readForCustomer(tx, requestId));
  }

  /**
   * Envoi aux commissionnaires choisis. Chemin système (le client écrit dans l'espace de
   * chaque commissionnaire : fiche client, destinataire) ; tous les contrôles sont faits ici.
   */
  async send(userId: string, requestId: string, input: SendRequestInput): Promise<RequestDetail> {
    const address = input.addressId
      ? await this.db.run(userId, (tx) =>
          tx.address.findFirst({
            where: { id: input.addressId!, userId },
            select: {
              label: true,
              line: true,
              landmark: true,
              cityId: true,
              city: { select: { name: true } },
              serviceZone: { select: { name: true } },
            },
          }),
        )
      : null;
    if (input.addressId && !address) throw new NotFoundException('Adresse introuvable.');

    const organizationIds = await this.system.$transaction(async (tx) => {
      const request = await tx.quoteRequest.findFirst({
        where: { id: requestId, customerUserId: userId, status: 'draft' },
        select: { id: true, _count: { select: { items: true } } },
      });
      if (!request) throw new NotFoundException('Brouillon introuvable ou déjà envoyé.');
      if (request._count.items === 0)
        throw new BadRequestException('Ajoutez au moins un article avant d’envoyer.');

      const slugs = [...new Set(input.commissioners)];
      const orgs = await tx.organization.findMany({
        where: { slug: { in: slugs }, status: 'approved' },
        select: { id: true, name: true },
      });
      if (orgs.length !== slugs.length) {
        throw new BadRequestException('Un des commissionnaires choisis n’est pas disponible.');
      }
      const profile = address
        ? null
        : await tx.customerProfile.findUnique({ where: { userId }, select: { cityId: true } });
      const cityId = address?.cityId ?? profile?.cityId ?? null;
      if (!cityId)
        throw new BadRequestException('Indiquez votre ville ou une adresse de livraison.');

      for (const org of orgs) {
        const orgCustomerId = await this.customers.ensureForUser(tx, org.id, userId);
        await tx.quoteRequestRecipient.create({
          data: { quoteRequestId: requestId, organizationId: org.id, orgCustomerId },
        });
        await this.audit.recordSystem(
          {
            actorUserId: userId,
            actorRole: 'customer',
            organizationId: org.id,
            action: 'request.received',
            entityType: 'quote_request',
            entityId: requestId,
          },
          tx,
        );
      }
      await tx.quoteRequest.update({
        where: { id: requestId },
        data: {
          status: 'sent',
          sentAt: new Date(),
          cityId,
          note: input.note ?? null,
          deliveryAddress: address
            ? {
                label: address.label,
                line: address.line,
                zone: address.serviceZone?.name ?? null,
                city: address.city.name,
                landmark: address.landmark,
              }
            : Prisma.JsonNull,
        },
      });
      await this.audit.recordSystem(
        {
          actorUserId: userId,
          actorRole: 'self',
          action: 'request.sent',
          entityType: 'quote_request',
          entityId: requestId,
          after: { recipients: orgs.map((o) => o.name), items: request._count.items },
        },
        tx,
      );
      return orgs.map((o) => o.id);
    });
    await this.notifications.emit({ kind: 'request_sent', requestId, organizationIds });
    return this.getForCustomer(userId, requestId);
  }

  async cancel(userId: string, requestId: string): Promise<RequestDetail> {
    return this.db.run(userId, async (tx) => {
      const { count } = await tx.quoteRequest.updateMany({
        where: {
          id: requestId,
          customerUserId: userId,
          status: { in: ['draft', 'sent', 'partially_quoted', 'quoted'] },
        },
        data: { status: 'cancelled' },
      });
      if (count === 0) throw new NotFoundException('Demande introuvable ou déjà close.');
      return this.readForCustomer(tx, requestId);
    });
  }

  private async readForCustomer(tx: TenantTx, requestId: string): Promise<RequestDetail> {
    const r = await tx.quoteRequest.findFirst({
      where: { id: requestId },
      select: {
        id: true,
        status: true,
        note: true,
        deliveryAddress: true,
        sentAt: true,
        createdAt: true,
        customerUserId: true,
        items: { select: ITEM_SELECT, orderBy: { position: 'asc' } },
        recipients: {
          select: {
            status: true,
            declineReason: true,
            organization: { select: { name: true, slug: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!r) throw new NotFoundException('Demande introuvable.');
    return {
      id: r.id,
      status: r.status,
      note: r.note,
      deliveryAddress: r.deliveryAddress as RequestDetail['deliveryAddress'],
      sentAt: r.sentAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      items: r.items.map(toItem),
      recipients: r.recipients.map((x) => ({
        organizationName: x.organization.name,
        slug: x.organization.slug,
        status: x.status,
        declineReason: x.declineReason,
      })),
    };
  }

  private async assertOwnScreenshot(
    tx: TenantTx,
    userId: string,
    fileId: string | null,
  ): Promise<void> {
    if (!fileId) return;
    const file = await tx.storedFile.findFirst({
      where: { id: fileId, ownerUserId: userId, purpose: 'product_screenshot' },
      select: { id: true },
    });
    if (!file) throw new BadRequestException('Capture d’écran introuvable.');
  }

  // --- Commissionnaire ----------------------------------------------------------

  async listForOrg(userId: string, org: OrgContext): Promise<OrgRequestSummary[]> {
    return this.db.run(userId, async (tx) => {
      const rows = await tx.quoteRequestRecipient.findMany({
        where: { organizationId: org.organizationId, quoteRequest: { status: { not: 'draft' } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          status: true,
          orgCustomer: { select: { fullName: true } },
          quoteRequest: {
            select: {
              id: true,
              sentAt: true,
              _count: { select: { items: true } },
              items: { select: { title: true }, orderBy: { position: 'asc' }, take: 1 },
            },
          },
        },
      });
      return rows.map((r) => ({
        id: r.quoteRequest.id,
        status: r.status,
        customerName: r.orgCustomer.fullName,
        itemCount: r.quoteRequest._count.items,
        firstItemTitle: r.quoteRequest.items[0]?.title ?? null,
        sentAt: r.quoteRequest.sentAt?.toISOString() ?? null,
      }));
    });
  }

  /** Détail pour un commissionnaire destinataire ; la première ouverture marque la demande « lue ». */
  async getForOrg(userId: string, org: OrgContext, requestId: string): Promise<RequestDetail> {
    return this.db.run(userId, async (tx) => {
      const recipient = await tx.quoteRequestRecipient.findFirst({
        where: { quoteRequestId: requestId, organizationId: org.organizationId },
        select: {
          id: true,
          status: true,
          declineReason: true,
          quote: { select: { id: true } },
          organization: { select: { name: true, slug: true } },
          orgCustomer: { select: { id: true, fullName: true, phoneWhatsapp: true, userId: true } },
        },
      });
      if (!recipient) throw new NotFoundException('Demande introuvable.');
      let status = recipient.status;
      if (status === 'sent' && (org.role === 'owner' || org.role === 'sales')) {
        await tx.quoteRequestRecipient.update({
          where: { id: recipient.id },
          data: { status: 'viewed', viewedAt: new Date() },
          select: { id: true },
        });
        status = 'viewed';
      }
      const r = await tx.quoteRequest.findFirstOrThrow({
        where: { id: requestId },
        select: {
          id: true,
          status: true,
          note: true,
          deliveryAddress: true,
          sentAt: true,
          createdAt: true,
          items: { select: ITEM_SELECT, orderBy: { position: 'asc' } },
        },
      });
      return {
        id: r.id,
        status: r.status,
        note: r.note,
        deliveryAddress: r.deliveryAddress as RequestDetail['deliveryAddress'],
        sentAt: r.sentAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        items: r.items.map(toItem),
        recipients: [
          {
            organizationName: recipient.organization.name,
            slug: recipient.organization.slug,
            status,
            declineReason: recipient.declineReason,
          },
        ],
        quoteId: recipient.quote?.id ?? null,
        customer: {
          orgCustomerId: recipient.orgCustomer.id,
          fullName: recipient.orgCustomer.fullName,
          phoneWhatsapp: recipient.orgCustomer.phoneWhatsapp,
          hasAccount: recipient.orgCustomer.userId !== null,
        },
      };
    });
  }

  async decline(userId: string, org: OrgContext, requestId: string, reason: string): Promise<void> {
    await this.db.run(userId, async (tx) => {
      const { count } = await tx.quoteRequestRecipient.updateMany({
        where: {
          quoteRequestId: requestId,
          organizationId: org.organizationId,
          status: { in: ['sent', 'viewed', 'evaluating'] },
        },
        data: { status: 'declined', declineReason: reason },
      });
      if (count === 0) throw new NotFoundException('Demande introuvable ou déjà traitée.');
      await this.audit.record(tx, {
        actorUserId: userId,
        actorRole: org.role,
        organizationId: org.organizationId,
        action: 'request.declined',
        entityType: 'quote_request',
        entityId: requestId,
        reason,
      });
    });
  }

  /**
   * Demande saisie par le commissionnaire pour un client géré (reçue par WhatsApp…).
   * Elle est directement « en cours d'évaluation » chez ce commissionnaire.
   */
  async createManaged(
    userId: string,
    org: OrgContext,
    input: ManagedRequestInput,
  ): Promise<{ id: string }> {
    const customer = await this.db.run(userId, (tx) =>
      tx.orgCustomer.findFirst({
        where: { id: input.orgCustomerId, organizationId: org.organizationId, status: 'active' },
        select: { id: true, userId: true, cityId: true },
      }),
    );
    if (!customer) throw new NotFoundException('Client introuvable.');
    if (input.items.some((i) => i.screenshotFileId)) {
      throw new BadRequestException(
        'Les captures d’écran ne sont pas encore prises en charge ici.',
      );
    }
    return this.system.$transaction(async (tx) => {
      const request = await tx.quoteRequest.create({
        data: {
          customerUserId: customer.userId,
          createdByOrganizationId: org.organizationId,
          createdByUserId: userId,
          cityId: customer.cityId,
          note: input.note ?? null,
          status: 'sent',
          sentAt: new Date(),
          items: { create: input.items.map((i, idx) => itemData(i, idx + 1)) },
          recipients: {
            create: {
              organizationId: org.organizationId,
              orgCustomerId: customer.id,
              status: 'evaluating',
            },
          },
        },
        select: { id: true },
      });
      await this.audit.recordSystem(
        {
          actorUserId: userId,
          actorRole: org.role,
          organizationId: org.organizationId,
          action: 'request.created_for_customer',
          entityType: 'quote_request',
          entityId: request.id,
          after: { orgCustomerId: customer.id, items: input.items.length },
        },
        tx,
      );
      return request;
    });
  }
}
