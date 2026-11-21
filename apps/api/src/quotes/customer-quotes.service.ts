import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@konzia/db';
import type { QuoteInfo } from '@konzia/shared';
import { AuditService } from '../audit/audit.service';
import { nextOrderNumber } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantDb } from '../tenancy/tenant-db.service';
import { QUOTE_SELECT, refreshRequestStatus, toQuoteInfo } from './quotes.service';

/**
 * Actions du client sur les devis reçus. Les écritures touchent l'espace du commissionnaire
 * (devis, commande) : chemin système, avec vérification explicite que le devis est bien à lui.
 */
@Injectable()
export class CustomerQuotesService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  constructor(
    private readonly db: TenantDb,
    private readonly system: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Passage périodique d'expiration (hors tests : les tests l'appellent explicitement). */
  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.expireDue().catch(() => undefined), 10 * 60_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Les devis reçus pour une demande (versions envoyées uniquement, jamais les brouillons). */
  async listForRequest(userId: string, requestId: string): Promise<QuoteInfo[]> {
    await this.expireDue();
    return this.db.run(userId, async (tx) => {
      const request = await tx.quoteRequest.findFirst({
        where: { id: requestId, customerUserId: userId },
        select: { id: true },
      });
      if (!request) throw new NotFoundException('Demande introuvable.');
      const quotes = await tx.quote.findMany({
        where: { quoteRequestId: requestId, customerUserId: userId, status: { not: 'draft' } },
        select: QUOTE_SELECT,
        orderBy: { createdAt: 'asc' },
      });
      return quotes.map((q) => toQuoteInfo(q, false)).filter((q) => q.current !== null);
    });
  }

  /** Acceptation d'une version précise par le client : crée la commande, liée à cette version exacte. */
  async accept(
    userId: string,
    quoteId: string,
    versionId: string,
  ): Promise<{ orderId: string; number: string }> {
    await this.expireDue();
    return this.system.$transaction(async (tx) => {
      const quote = await this.ownQuote(tx, userId, quoteId);
      return this.createOrder(tx, quote, versionId, {
        actorUserId: userId,
        actorRole: 'customer',
        note: null,
      });
    });
  }

  /**
   * Client géré (sans compte) : le commissionnaire enregistre l'accord obtenu hors application
   * (WhatsApp, boutique…). La note est conservée dans l'historique et l'audit.
   */
  async acceptForManagedCustomer(
    userId: string,
    org: { organizationId: string; role: string },
    quoteId: string,
    versionId: string,
    note: string,
  ): Promise<{ orderId: string; number: string }> {
    await this.expireDue();
    return this.system.$transaction(async (tx) => {
      const quote = await tx.quote.findFirst({
        where: { id: quoteId, organizationId: org.organizationId },
        select: {
          id: true,
          status: true,
          organizationId: true,
          orgCustomerId: true,
          quoteRequestId: true,
          customerUserId: true,
        },
      });
      if (!quote) throw new NotFoundException('Devis introuvable.');
      if (quote.customerUserId)
        throw new ConflictException(
          'Ce client a un compte : c’est à lui d’accepter le devis dans Konzia.',
        );
      return this.createOrder(tx, quote, versionId, {
        actorUserId: userId,
        actorRole: org.role,
        note,
      });
    });
  }

  private async createOrder(
    tx: Prisma.TransactionClient,
    quote: {
      id: string;
      status: string;
      organizationId: string;
      orgCustomerId: string;
      quoteRequestId: string;
    },
    versionId: string,
    actor: { actorUserId: string; actorRole: string; note: string | null },
  ): Promise<{ orderId: string; number: string }> {
    const quoteId = quote.id;
    if (!['sent', 'changes_requested'].includes(quote.status))
      throw new ConflictException('Ce devis ne peut plus être accepté.');
    const version = await tx.quoteVersion.findFirst({
      where: { id: versionId, quoteId },
      select: {
        id: true,
        versionNo: true,
        status: true,
        currency: true,
        totalAmount: true,
        validUntil: true,
        lines: {
          where: { kind: 'product' },
          select: {
            id: true,
            quoteRequestItemId: true,
            description: true,
            quantity: true,
            unitAmount: true,
            amount: true,
          },
          orderBy: { position: 'asc' },
        },
      },
    });
    if (!version) throw new NotFoundException('Version de devis introuvable.');
    if (version.status === 'superseded')
      throw new ConflictException(
        'Une version plus récente de ce devis existe : acceptez la dernière version.',
      );
    if (version.status !== 'sent' || version.validUntil <= new Date()) {
      throw new ConflictException(
        'Ce devis a expiré. Demandez au commissionnaire de le réactiver.',
      );
    }
    const request = await tx.quoteRequest.findUniqueOrThrow({
      where: { id: quote.quoteRequestId },
      select: { status: true, customerUserId: true },
    });
    if (!['sent', 'partially_quoted', 'quoted', 'converted'].includes(request.status))
      throw new ConflictException('Cette demande est close.');
    const customerUserId = request.customerUserId;

    const number = await nextOrderNumber(tx);
    const note = actor.note
      ? `Devis version ${version.versionNo} accepté · ${actor.note}`
      : `Devis version ${version.versionNo} accepté`;
    const order = await tx.order.create({
      data: {
        number,
        organizationId: quote.organizationId,
        orgCustomerId: quote.orgCustomerId,
        customerUserId,
        quoteId,
        quoteVersionId: version.id,
        currency: version.currency,
        agreedTotalAmount: version.totalAmount,
        finalAmount: version.totalAmount,
        items: {
          create: version.lines.map((l) => ({
            organizationId: quote.organizationId,
            customerUserId,
            quoteLineId: l.id,
            quoteRequestItemId: l.quoteRequestItemId,
            description: l.description,
            quantity: l.quantity,
            unitAmount: l.unitAmount,
            amount: l.amount,
          })),
        },
        events: {
          create: {
            organizationId: quote.organizationId,
            type: 'created',
            toStatus: 'awaiting_payment',
            actorUserId: actor.actorUserId,
            note,
          },
        },
      },
      select: { id: true },
    });
    await tx.quoteVersion.update({ where: { id: version.id }, data: { status: 'accepted' } });
    await tx.quote.update({ where: { id: quoteId }, data: { status: 'accepted' } });
    await tx.quoteRequest.update({
      where: { id: quote.quoteRequestId },
      data: { status: 'converted' },
    });
    await this.audit.recordSystem(
      {
        actorUserId: actor.actorUserId,
        actorRole: actor.actorRole,
        organizationId: quote.organizationId,
        action: 'quote.accepted',
        entityType: 'order',
        entityId: order.id,
        after: {
          number,
          quoteId,
          versionNo: version.versionNo,
          total: Number(version.totalAmount),
          currency: version.currency,
        },
        reason: actor.note,
      },
      tx,
    );
    return { orderId: order.id, number };
  }

  async reject(userId: string, quoteId: string, reason: string | null): Promise<void> {
    await this.system.$transaction(async (tx) => {
      const quote = await this.ownQuote(tx, userId, quoteId);
      if (!['sent', 'changes_requested'].includes(quote.status))
        throw new ConflictException('Ce devis ne peut plus être refusé.');
      await tx.quoteVersion.updateMany({
        where: { quoteId, status: 'sent' },
        data: { status: 'rejected' },
      });
      await tx.quote.update({
        where: { id: quoteId },
        data: { status: 'rejected', changeRequest: reason },
      });
      await this.audit.recordSystem(
        {
          actorUserId: userId,
          actorRole: 'customer',
          organizationId: quote.organizationId,
          action: 'quote.rejected',
          entityType: 'quote',
          entityId: quoteId,
          reason,
        },
        tx,
      );
    });
  }

  async requestChanges(userId: string, quoteId: string, message: string): Promise<void> {
    await this.system.$transaction(async (tx) => {
      const quote = await this.ownQuote(tx, userId, quoteId);
      if (quote.status !== 'sent')
        throw new ConflictException(
          'Une correction ne peut être demandée que sur un devis envoyé.',
        );
      await tx.quote.update({
        where: { id: quoteId },
        data: { status: 'changes_requested', changeRequest: message },
      });
      await this.audit.recordSystem(
        {
          actorUserId: userId,
          actorRole: 'customer',
          organizationId: quote.organizationId,
          action: 'quote.changes_requested',
          entityType: 'quote',
          entityId: quoteId,
          reason: message,
        },
        tx,
      );
    });
  }

  /**
   * Expiration des versions envoyées dont la validité est dépassée. Appelée avant chaque lecture
   * ou acceptation (et périodiquement) : aucun devis expiré n'est jamais accepté.
   */
  async expireDue(): Promise<number> {
    return this.system.$transaction(async (tx) => {
      const due = await tx.quoteVersion.findMany({
        where: { status: 'sent', validUntil: { lte: new Date() } },
        select: { id: true, quoteId: true, organizationId: true },
        take: 500,
      });
      for (const v of due) {
        await tx.quoteVersion.update({ where: { id: v.id }, data: { status: 'expired' } });
        const q = await tx.quote.update({
          where: { id: v.quoteId },
          data: { status: 'expired' },
          select: { recipientId: true, quoteRequestId: true },
        });
        await tx.quoteRequestRecipient.update({
          where: { id: q.recipientId },
          data: { status: 'expired' },
        });
        await refreshRequestStatus(tx, q.quoteRequestId);
        await this.audit.recordSystem(
          {
            actorUserId: null,
            actorRole: 'system',
            organizationId: v.organizationId,
            action: 'quote.expired',
            entityType: 'quote',
            entityId: v.quoteId,
          },
          tx,
        );
      }
      return due.length;
    });
  }

  private async ownQuote(tx: Prisma.TransactionClient, userId: string, quoteId: string) {
    const quote = await tx.quote.findFirst({
      where: { id: quoteId, customerUserId: userId, status: { not: 'draft' } },
      select: {
        id: true,
        status: true,
        organizationId: true,
        orgCustomerId: true,
        quoteRequestId: true,
      },
    });
    if (!quote) throw new NotFoundException('Devis introuvable.');
    return quote;
  }
}
